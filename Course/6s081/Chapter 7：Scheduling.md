# Knowledge

## CPU 在不同进程中的切换

前面的章节我们说过，操作系统通过调度机制，让每个进程误认为有自己私有的 CPU 资源，现在我们来具体看看 CPU 是如何在不同进程之间进行切换调度的。CPU 在不同进程间切换不是一步完成的，而是要经过一条固定流程：

1. 旧进程因为系统调用或中断进入内核，执行 usertrap，在该进程的内核栈上继续运行。
2. 旧进程通过 yield/sleep 等路径调用 swtch，切到调度器 scheduler，把当前寄存器现场（主要是 sp 和 ra 两个寄存器，sp 为栈顶指针，而 ra 用来保存一个函数调用结束后该回到哪里）保存到 proc->context。
3. scheduler 在全局进程表（本质是 struct proc 数组）中扫描，选中一个 RUNNABLE 进程，再通过 swtch 恢复它之前保存的内核上下文。
4. 新进程随后通过 trap return 回到用户态，继续执行用户程序。

![](assets/Chapter%207：Scheduling/file-20260420100245037.png)

一个十分典型的例子就是 yield() 触发的切换：

1. shell 进程在用户态正常运行。
2. timer interrupt 发生，调用 usertrap() / kerneltrap()，最后调用 yield()。
3. yield() 把当前进程标成 RUNNABLE，然后进 sched()。
4. sched() 调 swtch(&p->context, &mycpu()->context)，这其中 p->context 是当前进程自己的内核上下文，mycpu()->context 是当前 CPU 的调度器 scheduler 上下文。
5. swtch 把当前这条内核执行流的寄存器现场存进 p->context，再从 cpu->context 恢复调度器的现场。
6. CPU 于是回到 scheduler()，它在自己的内核栈上继续跑。
7. 以后调度器选中某个进程时，再反过来 swtch(&cpu->context, &p->context)，把那个进程接着跑起来。

```c
// Give up the CPU for one scheduling round.
void
yield(void)
{
  struct proc *p = myproc();
  acquire(&p->lock);
  p->state = RUNNABLE;
  sched();
  release(&p->lock);
}
```

```c
// Switch to scheduler.  Must hold only p->lock
// and have changed proc->state. Saves and restores
// intena because intena is a property of this
// kernel thread, not this CPU. It should
// be proc->intena and proc->noff, but that would
// break in the few places where a lock is held but
// there's no process.
void
sched(void)
{
  int intena;
  struct proc *p = myproc();

  if(!holding(&p->lock))
    panic("sched p->lock");
  if(mycpu()->noff != 1)
    panic("sched locks");
  if(p->state == RUNNING)
    panic("sched running");
  if(intr_get())
    panic("sched interruptible");

  intena = mycpu()->intena;
  swtch(&p->context, &mycpu()->context);
  mycpu()->intena = intena;
}
```

而 swtch 就是具体的汇编代码这里就不贴出来了，主要作用就是保存当前内核线程的现场，再恢复另一个内核线程的现场。接下来我们来看关于 CPU 非常核心且重要的一个函数 scheduler。**每个 CPU 的 scheduler 负责在本 CPU 上反复挑选 RUNNABLE 进程并切换执行，让这颗 CPU 在多个进程之间分时运行**。

```c
// Per-CPU process scheduler.
// Each CPU calls scheduler() after setting itself up.
// Scheduler never returns.  It loops, doing:
//  - choose a process to run.
//  - swtch to start running that process.
//  - eventually that process transfers control
//    via swtch back to the scheduler.
void
scheduler(void)
{
  struct proc *p; // 全局进程表
  struct cpu *c = mycpu(); // 当前 CPU
  
  c->proc = 0;
  for(;;){
    // 打开设备 interrupt
    // 设备 interrupt 就是：外设（键鼠，磁盘，时钟）主动向 CPU 发信号，要求内核立刻来处理某件事
    intr_on(); 

	// 死循环，每个 CPU 会不停执行任务
    for(p = proc; p < &proc[NPROC]; p++) {
    // 加锁保护全局进程表
      acquire(&p->lock);
      if(p->state == RUNNABLE) {
	    // 找到空闲并且可以执行的 process，然后执行它
        p->state = RUNNING;
        c->proc = p;
        // 保存当前 scheduler 线程的上下文，切换到将要执行的那个进程的上下文（主要就是寄存器）
        swtch(&c->context, &p->context);

        // Process is done running for now.
        // It should have changed its p->state before coming back.
        c->proc = 0;
      }
      release(&p->lock);
    }
  }
}
```

那么一个进程发生 timer interrupt 阻塞以后，到底是如何切换到 scheduler 函数去执行的呢？核心就是切换上下文，**将原进程的上下文保存后，切换到 CPU 的上下文**，这就是 `swtch(&p->context, &mycpu()->context);` 做的事情。随后通过 ra 寄存器保存的地址回到 scheduler 函数继续执行。

```c
// Saved registers for kernel context switches.
struct context {
  uint64 ra;
  uint64 sp;

  // callee-saved
  uint64 s0;
  uint64 s1;
  uint64 s2;
  uint64 s3;
  uint64 s4;
  uint64 s5;
  uint64 s6;
  uint64 s7;
  uint64 s8;
  uint64 s9;
  uint64 s10;
  uint64 s11;
};
```

```c
// Per-CPU state.
struct cpu {
  struct proc *proc;          // The process running on this cpu, or null.
  struct context context;     // swtch() here to enter scheduler().
  int noff;                   // Depth of push_off() nesting.
  int intena;                 // Were interrupts enabled before push_off()?
};
```

yield、sleep 和 exit 都会最终进入 sched()，从而让出 CPU 重新调度。yield 是进程主动放弃当前时间片，并不需要等待某个事件；sleep 则是进程因等待某个条件或事件而阻塞，把自己标记为 SLEEPING 并记录睡眠的 channel，等别的进程通过 wakeup(chan) 将其唤醒；exit 则不是等待，而是进程结束执行，进入 ZOMBIE 状态后交出 CPU。

```c
// Atomically release lock and sleep on chan.
// Reacquires lock when awakened.
void
sleep(void *chan, struct spinlock *lk)
{
  struct proc *p = myproc();
  
  // Must acquire p->lock in order to
  // change p->state and then call sched.
  // Once we hold p->lock, we can be
  // guaranteed that we won't miss any wakeup
  // (wakeup locks p->lock),
  // so it's okay to release lk.

  acquire(&p->lock);  //DOC: sleeplock1
  release(lk);

  // Go to sleep.
  p->chan = chan; // 睡在这个 chan 上，将其记录到 p 中
  p->state = SLEEPING; // 更新状态

  sched();

  // Tidy up.
  p->chan = 0;

  // Reacquire original lock.
  release(&p->lock);
  acquire(lk);
}
```

wakeup 函数有一个很重要的点是，它也只是修改 process 的状态而不直接运行 process，修改状态后还是要等待 scheduler 的调度从而来决定哪些进程要运行。

```c
// Wake up all processes sleeping on chan.
// Must be called without any p->lock.
void
wakeup(void *chan)
{
  struct proc *p;

  // 遍历进程表，唤醒某个 chan 上的所有睡眠的进程
  for(p = proc; p < &proc[NPROC]; p++) {
    if(p != myproc()){
      acquire(&p->lock);
      if(p->state == SLEEPING && p->chan == chan) {
        p->state = RUNNABLE;
      }
      release(&p->lock);
    }
  }
}
```
## 时间机制

前面一直提到 timer interrupt 这个概念，这里我们就来好好捋一捋操作系统的时间机制。先分清一些概念：

1. 真实时间：由硬件时钟/定时器提供，和操作系统是否运行无关，我们平常说“过去了 1s”，就是真实时间。
2. CPU 时间：这是某个进程真正占用了 CPU 多久。比如一个进程跑了 20ms 的计算，这 20ms 就是它的 CPU 时间。
3. 时间片：这是操作系统规定的一个进程连续占用 CPU 的最长时间。

操作系统想做到两件事：**不想让一个进程长期霸占 CPU 资源，而让多个进程看起来都在同时进行**。所以内核会规定：每个进程最多连续运行一小段时间，到点了就切换到别的进程，这一小段时间就是时间片，也叫 quantum。时间片的到期通常由**硬件定时器中断 （timer interrupt）** 触发，操作系统据此进行抢占式调度。