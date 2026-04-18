# Knowledge

开头介绍了并发在现代操作系统和多核心 CPU 中是很常见的事情。而“锁”只是实现并发控制的一种广泛被使用的方式，而不是唯一方式。锁是一种易于理解的并发控制机制，但锁的缺点是它们会限制性能，因为它们会串行化并发操作。本章主要介绍 xv6 如何实现和使用锁。


acquire 和 release 之间的代码，叫做 critical section（临界区）。

```c
acquire(&listlock);
l->next = list;
list = l;
release(&listlock);
```

锁保护的不是代码本身，而是被共享的变量。更高级的内核设计会专门为了减少锁竞争去设计数据结构，从而避免锁带来的性能问题。锁的粒度也很值得考量，因为给不需要锁的地方加锁会导致本来可以并行执行的地方串行化。

xv6 有自旋锁和睡眠锁两种锁。先来看看自旋锁的实现：

```c
// Mutual exclusion lock.
struct spinlock {
  uint locked;       // Is the lock held?

  // For debugging:
  char *name;        // Name of lock.
  struct cpu *cpu;   // The cpu holding the lock.
};
```

所谓 spinlock，核心特点就是：如果锁被别的 CPU 拿着，那么当前 CPU 不休眠，而是在原地循环重试，这就叫 spin。其中的 locked 字段当锁可用时为 0，锁被持有时为非 0。自旋锁非常适合临界区较短或者不值得切换 CPU 状态的场景。

我们不能直接修改 lk->locked 这个字段，因为无法保证 C 语言在并发状态下修改操作的原子性，其根本原因是**各核心的寄存器是私有的，不同的 CPU 核心运行到同一段 C 语言代码时，所操作的寄存器也是不一样的，判断（读）和修改（写）之间有时间差。寄存器的速度再快，也挡不住另一个核的插足去修改 lk->locked 变量。**。所以 xv6 使用了 RISC-V 中的一条指令 amoswap，它的作用是：

- 读内存地址 a 的旧值
- 把寄存器 r 的值写到地址 a
- 同时把旧值放回寄存器 r

而且这个过程是原子完成的，比如获取锁时 CPU 的存储控制器向外广播 lk->locked 的地址 `0x80001234` 我占了，在我弄完之前，谁也别动，那么在这之间就不会有任何一个其他的 CPU 核心能执行 `LOAD` 或 `STORE` 指令访问这块内存。通过硬件层面实现了原子性。

接着我们来看看 acquire 函数的实现:

```c
// Acquire the lock.
// Loops (spins) until the lock is acquired.
void
acquire(struct spinlock *lk)
{
  push_off(); // disable interrupts to avoid deadlock.
  if(holding(lk))
    panic("acquire");

  // On RISC-V, sync_lock_test_and_set turns into an atomic swap:
  //   a5 = 1
  //   s1 = &lk->locked
  //   amoswap.w.aq a5, a5, (s1)
  while(__sync_lock_test_and_set(&lk->locked, 1) != 0)
    ;

  // Tell the C compiler and the processor to not move loads or stores
  // past this point, to ensure that the critical section's memory
  // references happen strictly after the lock is acquired.
  // On RISC-V, this emits a fence instruction.
  __sync_synchronize();

  // Record info about lock acquisition for holding() and debugging.
  lk->cpu = mycpu();
}
```

可以看见 acquire 函数并没有直接使用 amoswap 指令，而是使用了 sync_lock_test_and_set 这个函数，它的逻辑是：把 1 原子地写进 lk->locked，同时返回原来的旧值。于是：

- 如果旧值是 0，说明原来没人持锁，当前 CPU 现在成功拿到了锁
- 如果旧值是 1，说明别人已经拿着锁，当前 CPU 这次没拿到，就继续在 while 循环中重试，也就是原地旋转。

同样，release 也不能简单依赖普通赋值把 locked 置 0，而是使用带原子语义的 sync_lock_release 来安全释放锁。

教材中对不同粒度的锁的介绍我觉得挺好的，故摘录：

> 作为粗粒度锁的示例，xv6 的 kalloc.c 分配器具有受单个锁保护的单个空闲列表。如果不同 CPU 上的多个进程尝试同时分配物理页，则每个进程都必须通过在 acquire 中旋转来等待轮到它。旋转会浪费 CPU 时间，因为它不是有用的工作。如果锁竞争浪费了很大一部分 CPU 时间，也许可以通过更改分配器设计来提高性能，**使其具有多个空闲列表，每个列表都有自己的锁，以允许真正的并行分配。** 
> 
> 作为细粒度锁的一个示例，xv6 对每个文件都有一个单独的锁，因此操作不同文件的进程通常可以继续执行而无需等待彼此的锁。如果希望允许进程同时写入同一文件的不同区域，则可以使文件锁定方案变得更加细粒度。最终，锁粒度决策需要由性能测量和复杂性考虑来驱动。

关于如何避免**死锁**，xv6 没有复杂的调度算法，实现方式是要求代码路径一致，比如有两个锁 A 和 B，路径 T1 是先 A 后 B，T2 是先 B 后 A，这样就会造成死锁，所以一种避免的方式是强制所有路径要么是 T1，要么是 T2。xv 6 隐式地维护了锁顺序表，比如拥有最长**锁链**的文件系统：

![](assets/Chapter%206：Locking/file-20260418114154298.png)

此外 consoleintr.c 中获取进程的锁时也要求先获取 cons 的锁。同时，xv6 是不支持**可重入锁**的，比如 acquire 函数在刚进入时就会检查是否持有锁（即是否是重入），如果是直接 panic。比如这样一段函数：

```c
f() {
    acquire(&lock);
    if(data == 0){
        call_once();   // 期望只被执行一次
        h();
        data = 1;
    }
    release(&lock);
}

g() {
    acquire(&lock);
    if(data == 0){
        call_once();
        data = 1;
    }
    release(&lock);
}
```

call_once 语义上将仅被调用一次：由 f 或 g 调用，但不能同时由两者调用。但是如果允许重入锁，并且 h 恰好调用 g，call_once 将被调用两次；如果不允许重入锁，则 h 调用 g 会导致死锁，这显然也不行。所以最好的方式是直接 panic，避免隐式出错。