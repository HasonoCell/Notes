# Knowledge

## CPU 在不同进程中的切换

前面的章节我们说过，操作系统通过调度机制，让每个进程误认为有自己私有的 CPU 资源，现在我们来具体看看 CPU 是如何在不同进程之间进行切换调度的。CPU 在不同进程间切换不是一步完成的，而是要经过一条固定流程：

1. 旧进程因为系统调用或中断进入内核，执行 usertrap，在该进程的内核栈上继续运行。
2. 旧进程通过 yield/sleep 等路径调用 swtch，切到调度器 scheduler，把当前寄存器现场（主要是 sp 和 ra 两个寄存器，sp 为栈顶指针，而 ra 用来保存一个函数调用结束后该回到哪里）保存到 proc->context。
3. scheduler 在全局进程表（本质是 struct proc 数组）中扫描，选中一个 RUNNABLE 进程，再通过 swtch 恢复它之前保存的内核上下文。
4. 新进程随后通过 trap return 回到用户态，继续执行用户程序。

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