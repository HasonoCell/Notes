# Knowledge

这一章主要就是讲操作系统如何去实现硬件资源复用，进程隔离和进程交互这三个要求的吧。

## 硬件资源抽象

硬件资源抽象的方式上，除了提供 kernel 的 system call 这种方式，教材中还提到了一种方式，把 open/read/write/fork/... 这些 system call 都做成普通库函数，应用程序直接链接这个库，应用程序自己直接访问 CPU、内存、磁盘等硬件资源，这样就不再需要操作系统 kernel 了。这种方法确实在一些嵌入式系统中是可行的。但是这种方法在多进程同时运行，每个进程都能碰硬件资源时就会有问题，比如说一个进程不让出 CPU 资源，那么别的进程就无法继续运行。

操作系统 kernel 的好处在于，进程不需要手动管理磁盘，CPU，内存这些硬件资源。磁盘由 open/read/write/close 这些 syscall 管理；CPU 由 kernel 在不同进程之间轮流分配，通过保存和恢复寄存器，使得多个进程可以同时运行；通过虚拟地址，每个进程只需要管理“自己的内存空间”，而不用面临真实的物理地址。通过 kernel，优雅地实现了对硬件资源的抽象和封装。

## 进程隔离与交互

### 两种模式

这里教材提到了 user mode 和 supervisor mode，而在之前也有过 user / kernel space 的说法，我的理解是，mode 是 CPU 的运行权限级别，space 是软件所处的执行环境/地址空间语境。

当普通应用程序运行时，CPU 处于 user mode，程序运行在 user space。这时程序：

- 不能执行特权指令
- 不能直接访问内核数据
- 只能通过 system call 请求内核服务

这里简单解释一下指令，指令就是 CPU 能理解并执行的机器指令及其规则。所有指令组合起来就形成了指令集，比如 RISC-V 指令集。

当进入 kernel 后，CPU 处于 supervisor mode，代码运行在 kernel space，这时 kernel 可以：

- 执行特权指令
- 操作页表
- 开关中断
- 调度进程
- 访问内核数据结构

当前 CPU 处于 user mode 还是 supervisor mode，决定了它是否拥有执行特权操作的权限。用户程序运行在 user space 中，不能直接调用内核里的服务实现；当它调用 read() 这类系统调用接口时，user space 处的封装代码会准备好系统调用编号和参数，并执行 ecall 指令。ecall 会触发 trap，使 CPU 从 user mode 切换到 supervisor mode，进入 kernel space 中由内核控制的入口。随后内核识别系统调用编号，分发到对应的内核处理函数（如 sys_read()），完成参数检查、权限检查和实际操作，再将返回值写回约定寄存器，并切回 user mode，回到 user space 中的用户程序继续执行。

这里提到了一个新的概念 **trap**，其含义是：trap 是 CPU 的受控转移机制，当发生系统调用、异常或中断时，CPU 会中断当前执行流，保存必要现场（如 sepc/sstatus/scause），按内核预先设置的入口地址转入内核态处理代码；内核处理完成后再恢复并返回原执行流（或终止该进程）。触发一次 trap 的最小模型可以是：

1. 事件发生（例如用户态 ecall、页错误、定时器中断）
2. CPU 会保存必要现场（如 sepc、sstatus、scause）
3. 然后跳到内核设置的入口（stvec）
4. 由内核判断原因并处理
5. 最后 sret 返回原流程（或终止当前进程）

可以说，trap 机制提供了一个统一且受控的入口把 CPU 带入内核处理流程。这里 trap 可能会和前面我们提过的 mode 切换产生概念的混淆，我的理解是：mode 切换可以看作是 trap 机制触发的结果，而且如果是 user mode 下触发 trap，必然伴随着 supervisor mode 的切换，而如果本身就处在 supervisor mode 下，触发 trap 也就不会切换 mode 了。

### 进程隔离

在 xv6 中，process 同时打包了两件事：独立地址空间 + 一条执行线程，从而实现隔离和并发。进程是最小的隔离边界，进程之间：内存是隔离的；CPU是被调度“虚拟化共享”的；fd 表是进程私有，但底层打开对象可能在进程间共享（fork/dup 后）。

其隔离机制的实现主要依赖以下三点：

- user/supervisor mode
- page table（内存空间隔离）
- 时间片调度（CPU 共享）

每个进程为程序提供了两个“错觉”：即让程序觉得自身拥有私有的 CPU 和内存资源。实际上，内存是由页表隔离出来的，CPU 也是通过轮流调度来切换的（其实所谓**线程**，可以直观理解为 CPU 在进程中执行代码的流程；更严格地说，线程是可被调度的执行上下文，即程序计数器 PC、寄存器状态和栈）。接下来我们重点看看**页表**这个概念，而在介绍页表之前，我们先介绍一下**虚拟地址**。

程序看到和使用的地址，叫虚拟地址；内存条上的真实地址，叫物理地址。程序以为自己在用一段连续内存（从 0 开始往上），但 CPU 最终访问的是物理内存。这中间就靠页表做翻译。因此，程序总是可以假设自己“**拥有一段私有的，连续的内存空间**”，而不用真的关心自己被存放在物理内存的某个地方。而内核也可以方便地将虚拟地址通过页表映射到任何空闲的物理地址，不要求其一定连续，充分地节约了资源。

所以页表 page table，定义了每个进程能访问到的虚拟地址到物理地址的映射。一个 user space 中的 process，其地址空间大致分布是（低地址到高地址）：

1. 代码段（instructions）
2. 全局/静态数据
3. 栈（stack）
4. 堆（heap，malloc 用，可增长）

![](assets/Chapter%202：Operating%20system%20organization/file-20260408111027828.png)

举个例子，有如下两个进程都访问地址 0x4000（**地址本质上是一个十六进制数字，用于定位内存**）：

- 进程 A：VA 0x4000 -> PA 0x12345000
- 进程 B：VA 0x4000 -> PA 0x88aa9000

它们代码里地址一样，但实际访问的物理内存不同，所以实现了隔离。

此外，一个进程维护了两套栈，分别是 user mode 下的 ustack，和 supervisor mode 下的 kstack。为什么需要两套栈呢？主要是因为，用户栈中运行的代码不能破坏内核栈，而即使用户栈损坏，也不影响内核栈中代码的正常执行。

有关 process 的结构体实现可以看看 kernel/proc.h，重点看看如下字段：

- p->pagetable：该进程页表
- p->kstack：该进程内核栈
- p->state：运行状态（RUNNABLE/RUNNING/SLEEPING/...）
- p->ofile：打开的文件列表（chapter 1 中有过提及）
- p->trapframe：进程发生 trap 时，内核用来保存这次用户态执行现场的一块内存。最核心的作用是先把用户态寄存器把值保存下来，当内核处理完 syscall/异常/中断后，再把这些寄存器值恢复回去，让进程像“什么都没发生过一样”继续跑

# Lab

上一个 lab 我们使用现有的一些 system call 添加了一些 utilities，而这个 lab 我们将会自己完成一些 system call。

## getpid

在实现之前，我们不妨来走一遍 getpid() 这个比较简答的 system call 的执行流程，从而对整个数据链路有比较好的认知。

先看用户代码这一行：

```c
int pid = getpid();
```

这不是直接跳到内核里的 sys_getpid()。它先跳到用户态的封装，也就是 user/usys.S 里的 getpid。这里其实有个比较有意思的点，getpid() 这个函数在 C 语言文件中只有头文件里的函数声明而没有具体实现，其真正的用户态实现存在于汇编 stub 里，两者通过链接器进行链接（将 C 语言编译后的代码和汇编代码链接），即：

```asm
getpid:
 li a7, SYS_getpid
 ecall
 ret
```

这里发生了三件事：

1. `li a7, SYS_getpid`：把“我要调用哪个 syscall”的编号放进寄存器 a7。编号定义在 kernel/syscall.h。
2. `ecall`：这条指令触发 trap。CPU 从用户态执行流切进内核处理流程。
3. `ret`：这行现在还不会执行，要等内核把 syscall 处理完返回用户态后，才会继续执行到这里。

接着看 trap 进入内核后干嘛。用户态的 trap 会进入 kernel/trap.c 的 usertrap()。usertrap() 检查 scause（一个寄存器），如果发现是 8，就知道这是用户态发起的 syscall，于是调用 syscall()

然后进入 kernel/syscall.c 的 syscall()。这里关键是这一句：

```C
num = p->trapframe->a7;
```

也就是：从当前进程保存下来的寄存器现场里，取出刚才用户态放进去的 a7。对于 getpid()，这个值就是 SYS_getpid。然后它在 syscall 表里查：

```c
p->trapframe->a0 = syscalls[num]();
```

如果 num 是 SYS_getpid，就会调用 kernel/sysproc.c 里的：

```C
uint64
sys_getpid(void)
{
  return myproc()->pid;
}
```

这一步非常简单：直接取当前进程 struct proc 里的 pid 返回。

返回之后，syscall() 会把这个返回值写回 trapframe->a0。这一步很重要，因为 a0 按约定就是函数返回值寄存器。然后内核通过 usertrapret() 走回用户态，最终恢复用户寄存器，执行 sret，回到刚才 ecall 的下一条指令。

这时 CPU 回到了 user/usys.S 的 ret，于是从 getpid() 这个 stub 返回到 C 代码：

```C
int pid = getpid();
```

而此时寄存器 a0 里已经是内核写进去的 pid 了，所以 C 代码就拿到了返回值。

```text
user C code
-> getpid() stub in usys.S
-> a7 = SYS_getpid
-> ecall
-> usertrap()
-> syscall()
-> sys_getpid()
-> return value written to trapframe->a0
-> usertrapret()
-> sret back to user
-> ret in usys.S
-> C code gets pid
```

这里也简单解释一下**寄存器**吧，之前没接触过，一直以为内存是操作速度最快的存储单元来着。
**寄存器**就是 CPU 内部一小组非常快的存储单元，用来保存当前执行最需要的数据。它的作用就是让 CPU 在执行指令时，不必每一步都去慢很多的内存里取东西。CPU 真正跑程序时，会频繁把这些东西放在寄存器里：

- 当前计算的操作数
- 函数参数
- 返回值
- 栈顶位置
- 下一条要执行的指令位置
- trap/权限相关状态

所以寄存器的本质作用就是两类：

1. 保存执行现场，例如程序执行到哪、当前栈在哪、函数返回地址在哪
2. 加速当前计算，例如做加法、传参数、接收返回值

## trace

首先在 Makefile，usys.pl，syscall.h 和 user.h 中添加上 trace system call 的一些定义，这个很简单就不说了：

```
entry("trace");	// usys.pl --> 将会直接生成 usys.S 中的汇编码

int trace(int); // user.h

$U/_trace\ // makefile

#define SYS_trace 22 // syscall.h
```

然后我们来补上 kernel 中 sys_trace 的实现：

```c
uint64
sys_trace(void)
{
  int mask;
  argint(0, &mask);
  myproc()->tracemask = mask;
  return 0;
}
```

这里是用到了 argint 这个函数来获取系统调用时的参数，扒了一下这个函数，其实还是使用了 proc->trapframe 中寄存器保存的值。即 system call 中的参数最初都是保存在寄存器中的，argint/argaddr/argstr 都是在 kernel 里从 trapframe 中把这些寄存器参数取出来。这里感觉也不难理解，本身一个 system call 都是通过数字标识存放在寄存器中，而在 kernel 里面从 p->trapframe 保存的寄存器里面将数字标识取出来，查表再调用。那么一个 system call 调用所需要的参数也存放在寄存器中，通过 argint 这样的函数来从 trapframe 中取出，也就不难理解了～

接下来就是如何调用 sys_trace 这个函数了。我们需要现在 struct proc 中添加一个字段 tracemask，用来在后续该 proc 进行 system call 时执行位操作。

```c
int tracemask; // Trace system call mask
```

然后在 syscall 函数中：

```c
void
syscall(void)
{
  int num;
  struct proc *p = myproc();

  num = p->trapframe->a7;
  if(num > 0 && num < NELEM(syscalls) && syscalls[num]) {
    p->trapframe->a0 = syscalls[num]();

	// 进行位操作并打印日志
    if ((p->tracemask >> num) & 1) {
      printf("%d: syscall %s -> %d\n", p->pid, syscall_str[num], (int)p->trapframe->a0);
    }
  } else {
    printf("%d %s: unknown sys call %d\n",
            p->pid, p->name, num);
    p->trapframe->a0 = -1;
  }
}
```

一个很关键的点是，在现有 fork 的实现中，fork 新的进程时，子进程不会自动继承父进程的 tracemask，所以我们还要手动在 fork 函数中赋值，

```c
np->tracemask = p->tracemask;
```

同时在释放进程时，也要重置 tracemask，所以 freeproc 函数中：

```c
p->tracemask = 0;
```

这样这个题目就完成了～

## sysinfo

这个题目的要求其实就是实现一个 syscall，返回当前空闲的内存大小和运行的 proc 数量。一些前置操作（比如 Makefile，头文件添加函数声明等等）就不说了，来聚焦最核心的两个函数 freemem（用于返回空闲的内存大小）和 nproc（用于返回当前 state 不为 UNUSED 的 proc 数量）

freemem: freemem 函数的实现也挺有意思的，可以让我们初探 xv6 的内存和页表结构。在 xv6 的页分配器里，每个空闲的 4KB 物理页都会被当成一个链表节点，节点结构就是 struct run。这些节点串起来就是 kmem.freelist。kalloc() 从表头拿一页，kfree() 把一页挂回表头。通过遍历 freelist 链表的节点数，我们就可以得到页数 n，从而计算出空闲内存大小。更具体的代码可以去看 kalloc.c 文件。这里还涉及到锁的获取和释放，其实就是为了避免在 freemem 遍历过程中链表结构发生更改。

```c
uint64
freemem(void)
{
  struct run *r;
  uint64 n; // 空闲的页数

  acquire(&kmem.lock);
  for (r = kmem.freelist; r; r = r->next) {
    n++;
  };
  release(&kmem.lock);

  return n * PGSIZE; // 返回页数x每页的大小，即空闲内存
}
```

nproc: 这里也没什么好说的，遍历 proc 列表就行，注意加锁。
```c
uint64
nproc(void)
{
  struct proc *p;
  uint64 n = 0;

  for(p = proc; p < &proc[NPROC]; p++){
    acquire(&p->lock);
    if(p->state != UNUSED)
      n++;
    release(&p->lock);
  }
  return n;
}
```

最核心的两个函数实现后，我们就可以开始在 sys_sysinfo 里面开始组装了。这里 struct info 已经提前在 xv6 里面定义好了，直接用就行。

```c
uint64
sys_sysinfo(void)
{
  uint64 addr;
  struct sysinfo info;

  if(argaddr(0, &addr) < 0)
    return -1;
  info.freemem = freemem();
  info.nproc = nproc();
  if(copyout(myproc()->pagetable, addr, (char *)&info, sizeof(info)) < 0)
    return -1;
  return 0;
}
```