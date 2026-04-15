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

其中的 locked 字段当锁可用时为 0，锁被持有时为非 0。接着我们来看看 acquire 函数的实现:

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

教材中对不同粒度的锁的介绍我觉得挺好的，故摘录：

> 作为粗粒度锁的示例，xv6 的 kalloc.c 分配器具有受单个锁保护的单个空闲列表。如果不同 CPU 上的多个进程尝试同时分配物理页，则每个进程都必须通过在 acquire 中旋转来等待轮到它。旋转会浪费 CPU 时间，因为它不是有用的工作。如果锁竞争浪费了很大一部分 CPU 时间，也许可以通过更改分配器设计来提高性能，**使其具有多个空闲列表，每个列表都有自己的锁，以允许真正的并行分配。** 
> 
> 作为细粒度锁的一个示例，xv6 对每个文件都有一个单独的锁，因此操作不同文件的进程通常可以继续执行而无需等待彼此的锁。如果希望允许进程同时写入同一文件的不同区域，则可以使文件锁定方案变得更加细粒度。最终，锁粒度决策需要由性能测量和复杂性考虑来驱动。