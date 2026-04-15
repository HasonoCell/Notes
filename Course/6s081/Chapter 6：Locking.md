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

其中的 locked 字段当锁可用时为 0，锁被持有时为非 0。