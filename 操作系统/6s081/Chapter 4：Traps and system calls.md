# Knowledge

教材一开始就为我们清楚地介绍了 trap 的三种情况：

> 共有三种事件导致 CPU 搁置普通指令执行并强制将控制权转移到处理该事件的特殊代码。一种情况是系统调用，当用户程序执行 ecall 指令以要求内核为其执行某些操作时。另一种情况是 exception ：指令（用户或内核）执行非法操作，例如除以零或使用无效的虚拟地址。第三种情况是设备 interrupt，当设备发出需要注意的信号时，例如当磁盘硬件完成读取或写入请求时。

## User Trap

一次 trap 通常的顺序是： trap 强制将控制权转移到内核中；内核保存寄存器和其他状态，以便可以恢复执行；内核执行适当的处理程序代码（例如，系统调用实现或设备驱动程序）；内核恢复保存的状态 并从 trap 中返回；原始代码从中断处继续。

一旦 trap 发生，CPU 就不能继续按照原来的用户态执行流往下运行，而是需要把控制权交给内核处理。对于来自用户态的 trap，xv6 的高层处理路径可以概括为：

user code
-> uservec
-> usertrap
-> usertrapret
-> userret
-> back to user code

其中：

- uservec 和 userret 位于 kernel/trampoline.S
- usertrap 和 usertrapret 位于 kernel/trap.c

### 为什么需要 trampoline page

理解这条链路时，最关键的背景是：RISC-V 在 trap 发生时不会自动切换页表。也就是说，trap 刚发生的那一瞬间：CPU 已经进入了 supervisor mode，但当前仍然使用的是该进程的用户页表。这就带来了一个限制：trap 入口代码必须在用户页表中也能找到，否则 CPU 根本无法开始执行 trap handler。同时，这段入口代码后面又必须切换到内核页表，所以它也必须在内核页表中同样存在。xv6 为了解决这个问题，设计了一页特殊的 trampoline page。这页 trampoline page 里存放的是一小段汇编代码，包括：

- uservec：用户态 trap 入口
- userret：返回用户态前的汇编出口

xv6 把这页 trampoline page 映射到每个进程用户页表中的固定虚拟地址 TRAMPOLINE，同时也映射到内核页表中的相同虚拟地址 TRAMPOLINE。这样，无论当前使用的是用户页表还是内核页表，CPU 都可以继续执行这段 trap 切换代码。

### uservec：trap 发生后最先执行的代码

当用户态 trap 发生时，CPU 会跳到寄存器 stvec 指向的物理地址去执行，而对于用户态 trap，stvec 被设置为 trampoline page 中的 uservec。所以，stvec 寄存器可以看作是 trap 发生后整个处理流程的入口，从 stvec 找到切换代码（即 stvec 存储了虚拟地址 TRAMPOLINE，然后 CPU 通过页表将其翻译为物理地址找到存储汇编代码的那块物理内存，然后执行代码）。

uservec 开始执行时，一个很关键的问题是：此时 32 个通用寄存器里保存的全都是用户程序的现场。
如果不先把这些值保存下来，后面内核一旦使用这些寄存器，用户程序的执行状态就会丢失。但**保存寄存器本身也需要一个可用寄存器来保存内存地址**，而这时几乎没有空闲寄存器。RISC-V 提供了一个专门的辅助寄存器 sscratch 来解决这个问题。uservec 一开始会把 a0 和 sscratch 交换：

- 用户原来的 a0 被暂时保存到 sscratch
- a0 里拿到了内核提前放进去的 trapframe 地址，即虚拟地址 TRAPFRAME 对应的那个物理地址

于是，uservec 接下来就可以利用 a0 作为指针，把所有用户寄存器值保存到 trapframe 中。

### trapframe 的作用

每个进程在 xv6 中都会有一页专门的 trapframe，它的作用是保存用户寄存器现场，保存将来重新进入内核时需要的信息，为返回用户态时恢复现场提供数据。在创建进程页表时，xv6 会把这页 trapframe 映射到固定虚拟地址 TRAPFRAME，就位于 TRAMPOLINE 下面。之所以必须这样做，是因为 trap 刚发生时 CPU 还在用用户页表，而 uservec 必须马上有地方保存寄存器，所以 trapframe 也必须在用户页表中可见。同时，内核中 p->trapframe 这个字段也指向同一页物理内存，因此：trampoline 汇编代码可以通过 TRAPFRAME 这个虚拟地址访问它，内核代码可以通过 p->trapframe 这个指针访问它。本质上它们访问的是同一页内存，只是视角不同。

### uservec 如何切换到内核

在保存完用户寄存器以后，uservec 会从 trapframe 中取出几项提前准备好的信息：

- 内核页表地址 kernel_satp
- 内核栈地址 kernel_sp
- C 语言 trap handler usertrap
- 当前 CPU 的 hartid

随后，它会：

1. 把 satp 切换到内核页表
2. 切换到当前进程的内核栈
3. 跳转到 usertrap

到这里，控制流才真正进入 xv6 的内核 C 代码中。

### usertrap：内核中真正处理 trap 的函数

usertrap 的任务是：判断这次 trap 的原因，并做相应处理。

```c
//
// handle an interrupt, exception, or system call from user space.
// called from trampoline.S
//
void
usertrap(void)
{
  int which_dev = 0;

  if((r_sstatus() & SSTATUS_SPP) != 0)
    panic("usertrap: not from user mode");

  // send interrupts and exceptions to kerneltrap(),
  // since we're now in the kernel.
  w_stvec((uint64)kernelvec);

  struct proc *p = myproc();
  
  // save user program counter.
  p->trapframe->epc = r_sepc();
  
  if(r_scause() == 8){
    // system call

    if(p->killed)
      exit(-1);

    // sepc points to the ecall instruction,
    // but we want to return to the next instruction.
    p->trapframe->epc += 4;

    // an interrupt will change sstatus &c registers,
    // so don't enable until done with those registers.
    intr_on();

    syscall();
  } else if((which_dev = devintr()) != 0){
    // ok
  } else {
    printf("usertrap(): unexpected scause %p pid=%d\n", r_scause(), p->pid);
    printf("            sepc=%p stval=%p\n", r_sepc(), r_stval());
    p->killed = 1;
  }

  if(p->killed)
    exit(-1);

  // give up the CPU if this is a timer interrupt.
  if(which_dev == 2)
    yield();

  usertrapret();
}
```

它首先会把 stvec 改成 kernelvec，因为从这一刻开始 CPU 已经在内核中运行，如果内核代码中又发生 trap，那么入口应该是内核的 trap handler，而不再是用户态的 uservec。接着，usertrap 会保存用户程序原来的程序计数器 sepc，因为之后可能发生调度切换，如果不提前保存，返回用户态时就不知道该从哪里继续执行。

然后它会根据 scause 判断 trap 原因：

- 如果是 system call，就调用 syscall()
- 如果是设备中断，就调用 devintr()
- 否则说明是异常，通常会杀掉当前进程

如果这次 trap 是 ecall 发起的 system call，usertrap 还会把保存下来的 sepc 加 4，因为 RISC-V 在 system call trap 时保存的 PC 仍然指向 ecall 指令本身，而返回用户态时
应当从下一条指令继续执行。

### usertrapret：为返回用户态做准备

usertrapret 本身并不直接完成“返回用户态”这件事，而是负责为这次返回做准备。它主要做以下几件事：

1. 把 stvec 改回 uservec，确保下次用户态 trap 时能重新从 trampoline 进入
2. 把将来 uservec 重新进入内核时要用的信息重新写入 trapframe
3. 设置 sstatus，告诉 CPU 之后的 sret 应该返回用户态
4. 设置 sepc，告诉 CPU 回到用户态后该从哪条用户指令继续执行
5. 根据当前进程的用户页表 p->pagetable 构造新的 satp 值

```c
//
// return to user space
//
void
usertrapret(void)
{
  struct proc *p = myproc();

  // we're about to switch the destination of traps from
  // kerneltrap() to usertrap(), so turn off interrupts until
  // we're back in user space, where usertrap() is correct.
  intr_off();

  // send syscalls, interrupts, and exceptions to trampoline.S
  w_stvec(TRAMPOLINE + (uservec - trampoline));

  // set up trapframe values that uservec will need when
  // the process next re-enters the kernel.
  p->trapframe->kernel_satp = r_satp();         // kernel page table
  p->trapframe->kernel_sp = p->kstack + PGSIZE; // process's kernel stack
  p->trapframe->kernel_trap = (uint64)usertrap;
  p->trapframe->kernel_hartid = r_tp();         // hartid for cpuid()

  // set up the registers that trampoline.S's sret will use
  // to get to user space.
  
  // set S Previous Privilege mode to User.
  unsigned long x = r_sstatus();
  x &= ~SSTATUS_SPP; // clear SPP to 0 for user mode
  x |= SSTATUS_SPIE; // enable interrupts in user mode
  w_sstatus(x);

  // set S Exception Program Counter to the saved user pc.
  w_sepc(p->trapframe->epc);

  // tell trampoline.S the user page table to switch to.
  uint64 satp = MAKE_SATP(p->pagetable);

  // jump to trampoline.S at the top of memory, which 
  // switches to the user page table, restores user registers,
  // and switches to user mode with sret.
  uint64 fn = TRAMPOLINE + (userret - trampoline);
  ((void (*)(uint64,uint64))fn)(TRAPFRAME, satp);
}
```

最后，usertrapret 会跳转到 trampoline page 中的 userret，因为真正切换页表的那几步必须由汇编来完成。

### userret：真正返回用户态

userret 是 trampoline page 中负责“离开内核、回到用户态”的汇编代码。它会接收两个参数：

- a0 = TRAPFRAME
- a1 = 用户页表对应的 satp

它做的事情是：

1. 把 satp 切换到当前进程的用户页表
2. 刷新地址翻译缓存
3. 从 trapframe 恢复所有保存下来的用户寄存器
4. 执行 sret

一旦 sret 执行完成，CPU 就会：

- 从 supervisor mode 切回 user mode
- 从 sepc 指定的位置继续执行用户程序

于是，用户程序继续运行。

### 总结

对于用户态 trap，xv6 的完整思路是：

- trap 刚发生时，由于 CPU 仍在使用用户页表，所以必须先借助 trampoline page 和 trapframe 保存用户现场
- 然后切换到内核页表并进入 usertrap 做真正处理
- 处理完成后，再由 usertrapret 和 userret 准备并完成返回用户态
- 最终通过 sret 恢复用户程序的执行流

## Kernel Trap

前面讲的是用户态发生 trap 时，xv6 如何借助 uservec -> usertrap -> usertrapret -> userret 完成进入内核和返回用户态的过程。而这一段教材讲的是另一种情况：如果 trap 发
生时 CPU 本来就在内核中执行代码，那么 trap 应该如何处理。

当 xv6 在某个 CPU 上执行内核代码时，它会把 stvec 设置为 kernelvec，也就是kernel/kernelvec.S 中的汇编入口。之所以这时可以直接进入 kernelvec，是因为：

- 当前已经在 supervisor mode
- satp 已经指向内核页表
- 当前栈指针 sp 也已经指向一个合法的内核栈

所以与用户态 trap 不同，kernel trap 不再需要借助 TRAMPOLINE 和 TRAPFRAME 去完成“先切页表再切栈”的复杂过渡，而是可以直接在当前内核环境里开始处理。


kernelvec 的工作很直接：它会把 32 个通用寄存器全部压到当前内核线程的栈上，等后面 trap 处理结束后，再从栈中把这些寄存器恢复回来。这样，trap 打断的那段内核代码在恢复执行时，寄存器现场就不会被破坏。

这里为什么是“保存在当前内核线程的栈上”？因为这些寄存器值本来就属于当前被打断的内核线程。特别是如果这次 trap 导致了线程切换，那么这些寄存器必须安全地保存在旧线程自己的内核栈上，等以后这个线程再次被调度回来时，才能从它自己的栈上恢复现场，继续执行。


在保存完寄存器后，kernelvec 会跳到 kernel/trap.c 中的 kerneltrap()。这个函数主要处理两类 trap：

- 设备中断（device interrupt）
- 异常（exception）

它首先调用 devintr() 检查这次 trap 是否是设备中断。如果是，就进行相应的设备中断处理；如果不是设备中断，那它就只能是内核中的异常。而在 xv6 中，内核态出现异常被视为严重错误，因此这时通常会直接 panic，停止系统运行。


如果 kerneltrap() 发现这次 trap 是时钟中断，而且当前运行的是某个进程的内核线程（而不是调度器线程），它会调用 yield()，让出 CPU，让别的线程有机会运行。

这一点很重要，因为即使某个进程当前正在内核态中运行，它也不能永远占着 CPU 不放。时钟中断给了内核一个机会去触发调度，让系统保持公平运行。之后，等别的线程执行一段时间后再次让出 CPU，当前这个被打断的内核线程还会继续从原来的 trap 处理路径恢复回来。


kerneltrap() 处理完成后，需要回到原来那段被打断的内核代码继续执行。不过这里有一个细节：如果在 trap 处理过程中调用了 yield()，那么像 sepc 和 sstatus 这样的控制寄存器值可能已经被扰动了。因此 kerneltrap() 会在一开始先保存它们，等处理完成后再恢复。

之后控制流返回到 kernelvec。kernelvec 再从内核栈中弹出之前保存的寄存器，并执行 sret。sret 会把 sepc 恢复到程序计数器 pc 中，于是 CPU 就能回到原来被打断的内核代码继续执行。

所以，来自内核态的 trap 处理路径可以概括为：

kernel code
-> kernelvec
-> kerneltrap
-> kernelvec
-> sret
-> back to kernel code


教材最后还特别提醒了一点：xv6 在 CPU 从用户态 trap 进入内核时，会在 usertrap() 的开头把 stvec 改成 kernelvec。这是因为 trap 进入内核后，后续如果内核代码又被中断，就必须走 kernel trap 的入口，而不是再去走用户态的 uservec。

这里会有一个短暂窗口：CPU 已经开始执行内核代码了，但 stvec 还没来得及改成 kernelvec。如果这时候设备中断再来一次，就会很危险。好在 RISC-V 在 trap 开始时会自动关闭中断，而 xv6 又是在改完 stvec 之后才重新打开中断，因此这段窗口中不会有新的设备中断打进来。


这一段教材想说明的是：内核态 trap 的处理比用户态 trap 更直接，因为此时 CPU 已经在内核页表和内核栈之中，所以不需要 trampoline 那样的中转机制。 内核只需要在 kernelvec
中保存当前寄存器现场，进入 kerneltrap() 判断 trap 原因并处理，最后再恢复寄存器并用 sret 返回到原来的内核代码即可。

## 现代操作系统中如何处理页错误

在 xv6 中，异常处理非常朴素，用户态异常通常直接杀进程，内核态异常则 panic；但在真实操作系统里，page fault 不只是“错误”，更是一种可以被主动利用的机制。借助页表权限和 page fault，操作系统可以实现许多更高级的虚拟内存技术，例如 copy-on-write fork、lazy allocation、demand paging 和 paging to disk。这些技术的共同思路是：并不在一开始就把所有内存工作都做完，而是故意延迟到程序真正访问某页时，再通过 page fault 触发内核完成复制、分配、装载或换页，从而提高性能、节省内存，并且对应用程序保持透明。

### Copy-on-Write Fork

xv6 的普通 fork 会直接为子进程分配新的物理页，并把父进程内存完整复制过去。这样虽然简单，但代价很高。更高效的做法是 copy-on-write：父子进程在 fork 后先共享同一批物理页，并把这些页都映射成只读；这样双方都可以正常读取，但一旦某一方尝试写入，CPU 就会因为该页不可写而触发page fault。此时内核再分配一页新的物理页，把原页内容复制过去，并把当前进程页表中的 PTE 改成指向这份新副本并允许写入。这样，“复制”被延迟到了真正写的时候才发生，因此 fork 会更快，内存浪费也更少，特别适合 fork 后很快又 exec的场景。

### Lazy Allocation

lazy allocation 的思想是：进程调用 sbrk 申请更多内存时（比如在堆上申请更多内存），内核并不立刻分配物理页，也不立即创建对应的 PTE，而只是先把地址空间大小记下来。等程序以后真正访问到这些新地址时，由于页表里还没有映射，CPU 会触发 page fault，内核这时才分配物理页并补上映射关系。这样可以避免为那些“申请了但实际上从未使用”的内存做无意义的分配和清零工作，从而节省时间和物理内存。不过它的代价是第一次访问某页时会多一次 page fault 开销。

### Demand Paging

demand paging 是把“按需装载程序内容”这个思想用到程序启动时。xv6 在 exec 中会一次性把程序的 text 和 data 都加载进内存，这叫 eager loading；而现代操作系统更常见的做法是：只先建立页表，把这些程序页标记为 invalid，但不立即把对应内容从磁盘读入内存。等程序真正执行或访问到某一页时，CPU 因为页不存在而触发 page fault，内核这时再从磁盘把该页读入内存并建立映射。这样程序启动会更快，尤其是对于很大的程序来说，用户不必等待所有内容都被提前装入才能开始运行。

### Paging to Disk

当程序总共需要的内存超过机器的实际 RAM 时，操作系统可以采用 paging to disk 的方式，把一部分页暂时放在磁盘上，而不是全部留在内存里。此时页表中对应这些页的 PTE 会被标记为 invalid；如果程序后来访问了这样一个已经被换出到磁盘的页，CPU 就会触发 page fault，内核再把这页从磁盘读回 RAM，并修改 PTE 指向新的物理页。如果此时 RAM 已经没有空闲页，内核就必须先选择一页现有的内存页换出到磁盘，腾出空间给新页使用。这个机制让系统即使在内存紧张时也能继续运行较大的程序，不过如果换页过于频繁，性能会明显下降，因此它依赖程序具有较好的局部性（locality of reference）。