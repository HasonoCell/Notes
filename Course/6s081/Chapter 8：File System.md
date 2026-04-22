# Knowledge

## 整体结构

文件系统主要用来解决以下几个问题：

- 怎么把文件、目录、空闲空间这些信息组织到磁盘上。
- 怎么保证崩溃后还能恢复，不把磁盘结构写坏。
- 怎么让多个进程同时访问文件系统而不互相破坏数据。
- 怎么缓解磁盘很慢的问题，靠内存缓存热点块。

xv6 中文件系统分为了如下几层：

- disk layer：直接和磁盘块读写打交道。
- buffer cache：把磁盘块缓存到内存里，并控制同一块只能被一个内核进程修改。
- logging：把多块更新打包成**事务**，保证崩溃时要么全成功，要么全失败。
- inode layer：每个文件对应一个 inode，保存文件元数据和数据块位置。
- directory layer：目录本质上也是一种 inode，里面存的是“文件名 + i-number”。
- pathname layer：把 /usr/rtm/xv6/fs.c 这种路径逐级查找出来。
- file descriptor layer：把文件、管道、设备等统一成 Unix 风格的文件接口。

![](assets/Chapter%208：File%20System/file-20260421145955920.png)

操作系统可以管理多个磁盘设备，并且不会区分磁盘到底是机械硬盘，固态硬盘还是 U 盘等等，都统一抽象成可以按块读写的存储设备。每个设备用设备号 dev 区分。传统磁盘硬件通常按照每 512 个字节为一个**扇区**来读写，而操作系统中的文件系统读写磁盘时，会按照**块（Block）** 的方式读写，且块通常是扇区的倍数。xv6 中一个 block 是 1024 个字节，将磁盘分为了这几部分：

- block 0：boot sector，不用来存文件系统数据。
- block 1：superblock，记录文件系统整体信息。
- 后面一段：log。
- 再后面：inodes。
- 再后面：bitmap，记录哪些数据块空闲。
- 最后：data blocks，真正存文件内容和目录内容。

![](assets/Chapter%208：File%20System/file-20260422145202294.png)

## buffer cache

为什么文件系统中需要 buffer cache？主要是为了给访问速度极慢的磁盘块添加一层**内存缓存**，从而让热点块不用每次都去硬盘里面读。此外，同一块磁盘在内存里只能有一份拷贝，而且同一时刻只能一个内核线程改它。

我们先来看看最核心的 buf 结构体：struct buf 可以理解成**某个完整的磁盘块在内存里的缓存副本**

```c
struct buf {
  int valid;   // 这份缓存内容是否已经从磁盘读进来
  int disk;    // 磁盘设备当前是否正在处理这块 buf
  uint dev;    // 属于哪个磁盘设备
  uint blockno; // 属于那个磁盘上的第几个块
  struct sleeplock lock; // 这块 buf 的睡眠锁，保证同一时刻只有一个内核线程读写它
  uint refcnt; // 目前有多少地方在使用这个 buf
  struct buf *prev; // 和下面的 next 字段一样，所有 struct buf 组成一个双向链表
  struct buf *next;
  uchar data[BSIZE]; // buf 结构体中实际存放内容的字节数组，BSZIE = 1024，一个 char 为一字节
};
```

这其中 dev + blockno 决定 buf 是磁盘上的哪一块内容的缓存，valid 决定缓存内容能不能直接用，refcnt 决定此 buf 能不能被回收复用。

上面只是单个 buffer 的结构，而在全局还有一个结构体 bcahce 来管理 buffer cache layer 这一层：

```c
struct {
    struct spinlock lock; // 保护整个缓存的元数据，比如链表、refcnt、哪个 buf 可复用
    struct buf buf[NBUF]; // buffer 池，通过数字存放固定数量的 buffer

    // 双向链表的哨兵节点，不存实际数据，只是方便管理 LRU 链表
    // head.next 指向最近使用的 buffer
    // head.prev 指向最久没用的 buffer    
    struct buf head;
} bcache;
```

随后，通过 binit 函数来初始化 bcache，简单来说 binit 就是把 buf[] 这个数组变成一个可管理的 LRU 双向链表，并给每个 buffer 装上自己的锁：

```c
void
binit(void)
{
  struct buf *b;

  // 初始化 bcache 自旋锁
  initlock(&bcache.lock, "bcache");

  // 初始化 LRU 链表
  bcache.head.prev = &bcache.head;
  bcache.head.next = &bcache.head;
  
  // 遍历 buf 池，将新插入的 buf 放在 head 哨兵节点的下一个，表示最新
  for(b = bcache.buf; b < bcache.buf+NBUF; b++){
    b->next = bcache.head.next;
    b->prev = &bcache.head;
    // 初始化 buf 睡眠锁
    initsleeplock(&b->lock, "buffer");
    bcache.head.next->prev = b;
    bcache.head.next = b;
  }
}
```

OK～我们现在目前已经对 buffer cache layer 的结构有了大致的认识了。接下来我们就看看，当需要访问磁盘块的内容时，buffer cache 到底是如何使用缓存的，其核心就是 bget 函数：

```c
// 根据传入的 dev 和 blockno 参数，确定要访问的磁盘块，尝试返回该磁盘块的 buf
// 如果没有找到 buf，那么就会新分配一个 buf；找到了，那就返回 buf 并为其加锁
static struct buf*
bget(uint dev, uint blockno)
{
  struct buf *b;

  acquire(&bcache.lock);

  // 从最新的 buffer 开始遍历池子
  for(b = bcache.head.next; b != &bcache.head; b = b->next){
    // 找目标 buffer，找到了就让引用数+1
    if(b->dev == dev && b->blockno == blockno){
      b->refcnt++;
      release(&bcache.lock);
      acquiresleep(&b->lock);
      return b;
    }
  }

  // 如果经历上面的循环但是还没有找到目标 buffer
  // 就找 LRU 链表中找到一个最旧的没人使用的 buffer，分配给这个磁盘块
  for(b = bcache.head.prev; b != &bcache.head; b = b->prev){
    if(b->refcnt == 0) {
      b->dev = dev;
      b->blockno = blockno;
      b->valid = 0; // vaild=0 表示数据不可信，要等 bread 重新读盘读进来
      b->refcnt = 1;
      release(&bcache.lock);
      acquiresleep(&b->lock);
      return b;
    }
  }
  panic("bget: no buffers");
}
```

这里有一个点是，因为 buffer 的数量是固定的（ buffer 数组长度为 NBUF），所以当需要为一个磁盘块分配 buffer 时，操作系统选择**淘汰最旧的没被使用的 buffer**，并将其重新分配。前面说过，重新分配的 buffer 的 vaild 被标记为 0 表示数据不可信，需要重新读盘读进来，而读盘进 buffer 就是通过 bread 实现的：

```c
struct buf*
bread(uint dev, uint blockno)
{
  struct buf *b;

  b = bget(dev, blockno);
  if(!b->valid) { // 如果 vaild=0
	// 将磁盘块的内容读到 buffer 中，0 表示读，virtio 函数目前暂时不去关心实现
    virtio_disk_rw(b, 0);
    b->valid = 1; // 更新 vaild 表示数据现在可信
  }
  return b;
}
```

和 bread 类似的是 bwrite，其通过通过 virtio_disk_rw 将 buffer 中的内容写回磁盘。进程通过 bread() 拿到这块 buffer 后，直接读写的是 b->data，所以如果有修改会先发生在内存里，不会自动落盘，bwrite() 就是把这份内存里的修改同步回磁盘。

进程通过 bread 函数，获取到一个 buffer 进行使用，等到使用完毕后，就通过 brelease 进行释放：

```c
void
brelse(struct buf *b)
{
  if(!holdingsleep(&b->lock))
    panic("brelse");

  // 释放掉这个 buffer 的睡眠锁，确保别的进程可以再通过 bread 拿到这个 buffer
  releasesleep(&b->lock);

  acquire(&bcache.lock);
  // 这个 buffer 的引用数-1
  b->refcnt--;
  if (b->refcnt == 0) {
    // 如果这次释放后引用数为0了，那就代表该 buffer 空闲了
    // 那么就可以参与 LRU 的调度了，因为从 get 到 release，刚好完成了一次使用周期
    // 移动到 head.next 表示最近才使用过
    b->next->prev = b->prev;
    b->prev->next = b->next;
    b->next = bcache.head.next;
    b->prev = &bcache.head;
    bcache.head.next->prev = b;
    bcache.head.next = b;
  }
  
  release(&bcache.lock);
}
```

## logging

logging 层构建于 buffer cache 层之上，核心目标是**让文件系统更新在崩溃时保持原子性**。一次文件系统操作通常要改很多磁盘块。如果修改途中崩溃，磁盘块上可能只写了一半，就会出现不一致状态。
最危险的是这种：inode 还指着某个块，但 bitmap 已经把这个块标成空闲了。这样重启后，这块已被 inode 引用的块可能又被分配给别的文件，两个文件就会共享同一块数据，严重时会破坏安全性和正确性。

xv6 不直接把修改写到文件系统的“正式位置”，而是先把这次系统调用要做的所有磁盘写入，记到 log 里。流程是：

1. 先把要改的块内容写到 log 区。
2. 再写一个 commit record，表示这次事务完整了。
3. 然后把日志里的内容拷贝到真正的文件系统位置。
4. 最后清空日志。

如果崩溃发生在 commit record 之前：恢复时会发现日志没完成，直接忽略这次更改，磁盘状态等于“这次操作没发生”；如果崩溃发生在 commit record 之后：恢复时会重放日志，把所有修改补写到正式位置，磁盘状态等于“这次操作完整完成”。整体和数据库的日志和事务都很相似～

先来看看 log header 和 log 两个核心结构体：

```c
struct logheader {
  int n; // 当前事务里有多少个涉及到的文件系统块
  int block[LOGSIZE]; // 每个元素是这些块对应的原始磁盘块编号
};

// struct log 是 logging layer 的全局管理对象
struct log {
  struct spinlock lock; // log 层的锁
  int start; // log 区域在磁盘上的起始块号
  int size; // log 区域总共会占用多少块
  int outstanding; // 当前有多少个文件系统系统调用正在进行、并占用了日志空间
  int committing;  // 当前是不是正在提交事务
  int dev; // 日志所在的磁盘设备号
  struct logheader lh; // 日志头，记录当前事务提交
};
struct log log;
```

通过 initlog 初始化 log 层：

```c
void
initlog(int dev, struct superblock *sb)
{
  if (sizeof(struct logheader) >= BSIZE)
    panic("initlog: too big logheader");

  // 初始化 log 全局锁
  initlock(&log.lock, "log");
  // 从 superblock 处获取 log 区域状态
  log.start = sb->logstart; // log 区域从第几个磁盘块开始
  log.size = sb->nlog; // log 区域占几个磁盘块
  log.dev = dev; // log block 所处的磁盘设备号
  recover_from_log();
}
```

从上面的代码中我们可以看出：**struct log 是内存里的全局管理状态，不在磁盘上，kernel 通过它来管理日志系统。struct logheader 既有内存副本，也有磁盘上的 header block 副本，log 区域的第一个磁盘块就是 header block，它表示一次事务记录了哪些块（总数量，块编号）**。log 区域剩下的部分就是 logged block，用来存放在 buffer cache 内存中的修改，等待将其持久化到真实文件位置。

### 处理遗留日志区域的事务

初始化 log 层的过程中，做了一件非常重要的事：recover_from_log，目的就是检查有无没有处理完的日志：

```c
static void
recover_from_log(void)
{
  // 从磁盘中的 header block 读取该次事务的信息，存放到内存中的 logheader
  read_head(); 
  // 读完了该次事务的信息之后，就开启事务，把 logged block 里的备份转移到正式文件系统区
  install_trans(1); 
  // 因为这里将内存中的 lh.n 赋值为 0 了
  log.lh.n = 0;
  // 所以后续 write head 就会清空 header block
  write_head();
}
```

```c
static void
read_head(void)
{
  // read_head 顾名思义就是将磁盘中的 header block 信息读到内存中
  // 可以看出 read_head 就是通过 bread 去磁盘里面读 header block，并且将结果缓存在 buffer 中
  struct buf *buf = bread(log.dev, log.start);
  struct logheader *lh = (struct logheader *) (buf->data);
  int i;
  // 赋值给内存中的 logheader
  log.lh.n = lh->n;
  for (i = 0; i < log.lh.n; i++) {
	// 这里内存中的 logheader 拿到了本次事务中涉及到的文件系统块对应的磁盘块编号
    log.lh.block[i] = lh->block[i];
  }
  brelse(buf);
}

static void
install_trans(int recovering)
{
  int tail;

  // 遍历该次事务涉及到的所有磁盘块
  for (tail = 0; tail < log.lh.n; tail++) {
    // 读日志区里的第 tail 个 logged block buffer，+1 是跳过开头的 header block。
	struct buf *lbuf = bread(log.dev, log.start+tail+1);
	// 读这个 logged block 对应的正式硬盘块 buffer。
    struct buf *dbuf = bread(log.dev, log.lh.block[tail]);
    // 把日志区里的完整块内容拷贝到正式块的 buffer 里
    memmove(dbuf->data, lbuf->data, BSIZE);
    // 再将正式块 buffer 实际写入到磁盘中
    bwrite(dbuf);
    if(recovering == 0)
      bunpin(dbuf);
    // 释放两个 buffer
    brelse(lbuf);
    brelse(dbuf);
  }
}

static void
write_head(void)
{
  // write_head 顾名思义就是将内存中的 log header 信息写回 header block
  struct buf *buf = bread(log.dev, log.start);
  struct logheader *hb = (struct logheader *) (buf->data);
  
  int i;
  hb->n = log.lh.n;
  for (i = 0; i < log.lh.n; i++) {
    hb->block[i] = log.lh.block[i];
  }
  
  // 将 buffer 中的改动落盘
  bwrite(buf);
  brelse(buf);
}
```

OK，之前的 recover from log 解决的是重启后过去遗留的日志问题，现在我们来看，**当一次正常的文件系统的系统调用发生时，log 层是如何工作的**

### 处理一次正常的 FS syscall

首先就是 begin_op 函数，这个 op 是 operation 的意思，就是指的 **write，unlink，create，mkdir** 等等可能修改磁盘的 FS syscall。begin_op 发生在每个文件系统系统调用开始时，目的是**保证当前这次操作能安全参与日志事务**，处理的是运行时并发和空间预留问题

```c
void
begin_op(void)
{
  // 先获取日志系统的全局锁
  acquire(&log.lock);
  
  while(1){
	// 如果日志系统目前正在处理一次事务的提交
	// 那么就让发起这次系统调用的进程先 sleep
	// 也就是说多个 FS syscall 是可以并发的，但是一次只允许一个 FS syscall 提交事务
    if(log.committing){
      sleep(&log, &log.lock);
    // 否则，如果日志系统空间不够了，也让进程 sleep
    } else if(log.lh.n + (log.outstanding+1)*MAXOPBLOCKS > LOGSIZE){
      sleep(&log, &log.lock);
    } else {
      // 否则，登记当前正在进行的文件系统调用
      log.outstanding += 1;
      release(&log.lock);
      break;
    }
  }
}
```

检查完当前日志系统的状态确保可以继续系统调用的后续流程后，就真正进入了这次 FS syscall 的具体工作，然后该 FS syscall 在通过 bread 读取并修改某个 buf 时调用 log_write 这个函数，log_write 的作用是，**记录这个 buffer 对应的磁盘块被改了，然后给这个块在日志事务里占一个名额，pin 住 buffer，保证事务完成前它不会被回收**。

```c
void
log_write(struct buf *b)
{
  int i;

  acquire(&log.lock);
  // 再进行一次日志系统剩余空间的检查，因为这次可以确切的知道到底新增了几个 logged block
  if (log.lh.n >= LOGSIZE || log.lh.n >= log.size - 1)
    panic("too big a transaction");
  // 如果正在处理的文件系统系统调用为 0，自然也是不合理了，因为算上本次至少也有 1 次
  if (log.outstanding < 1)
    panic("log_write outside of trans");

  // 遍历目前每个 logged block 对应的真实磁盘块，如果发现本次想要修改的磁盘块已经在日志区域中了
  // 就跳出循环防止重复记录
  for (i = 0; i < log.lh.n; i++) {
    if (log.lh.block[i] == b->blockno)
      break;
  }
  
  // 把这个被修改的块号记到内存里的 logheader 里。
  // 如果前面找到过，i 是原位置，相当于更新同一个条目。
  // 如果没找到，i == log.lh.n，相当于新增一条。  
  log.lh.block[i] = b->blockno;
  if (i == log.lh.n) { 
    // 如果入的是新块，那么先 pin 住防止 buffer 被 LRU 回收
    bpin(b);
    log.lh.n++;
  }
  release(&log.lock);
}
```

而当一次 FS syscall 执行完所有操作打算结束后，就会调用 end_op 这个函数表示结束这次 operation。

```c
void
end_op(void)
{
  int do_commit = 0;
  
  // 依旧先拿锁，永远记住读写全局共享状态时先拿锁～
  acquire(&log.lock);
  // 这次 FS syscall 结束了，所以记录数-1
  log.outstanding -= 1;
  if(log.committing)
  // 正常情况下，是不允许在一次事务的 commit 期间去结束另一个 FS syscall 的
    panic("log.committing");
  if(log.outstanding == 0){
  // 如果这是最后一个活跃的 FS syscall，修改一下状态表示可以提交事务了
    do_commit = 1;
    log.committing = 1;
  } else {
  // 如果还有别的 FS syscall 在跑，它们可能在 begin_op 里因为日志空间不够睡着了
  // 现在 outstanding 变少了，释放了一些空间，所以唤醒它们重新检查    
    wakeup(&log);
  }
  release(&log.lock);

  // 如果该次 FS syscall 是最后一个，那么它来负责提交整个事务
  if(do_commit){
    commit();
    acquire(&log.lock);
    // 提交完后，committing 状态自然而然重置
    log.committing = 0;
	// 唤醒等待 begin_op 的新系统调用
    wakeup(&log);
    release(&log.lock);
  }
}
```

```c
static void
commit()
{
  // 如果事务里面确实有东西才提交
  if (log.lh.n > 0) {
    write_log(); // 把 buffer cache 里的修改内容复制到日志区的 logged blocks
    write_head(); // 把内存中的 log header 信息写回磁盘中的 header block    
    install_trans(0); // 开始写盘，logged blocks 的内容写到正式磁盘块
    log.lh.n = 0; // 清空内存中的事务信息
    write_head(); // 在清空磁盘中的事务信息
  }
}
```

所以一整个闭环的流程可以是： begin_op 系统调用作出的磁盘修改申请进入事务 --> log_write 登记修改了哪些块 --> end_op 结束这次系统调用 --> 如果没人再活跃，commit --> write_log / write_head / install_trans / 清日志