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
  int block[LOGSIZE]; // 数组中每个元素是这些块对应的原始磁盘块编号
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
    // b->blockno 记录了这个 buffer 对应的磁盘块编号
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

所以一整个闭环的流程可以是： begin_op 系统调用作出的磁盘修改申请进入事务 --> log_write 登记修改了哪些块 --> end_op 结束这次系统调用 --> 如果没人再活跃，commit --> write_log / write_head / install_trans / 清日志。此外，从这里也看出来，事务的提交是 group commit，同一批次的更改会一起提交，而如果**日志区域的空间不够了，那后续调用 FS syscall 的进程也会 sleep，等待下一批次的提交**。

## 空闲磁盘块

xv6 管理一个磁盘上的空闲磁盘块（也就是空闲的 data block）的方式也十分巧妙，通过同一个磁盘上的 bitmap block 来管理，磁盘上的每个 data block 都对应 bitmap 里的 1 个 bit，0 表示这块是空闲的，1 表示这块已经被占用了。

**bitmap 是一种十分常见的状态压缩手段，用一串 bit 表示一组资源的状态，1 个 bit 表示 1 个资源是否可用。** 来看看 balloc 函数是如何分配空闲磁盘数据块的：

```c
static uint
balloc(uint dev)
{
  int b, bi, m;
  struct buf *bp;

  bp = 0;
  // 外层循环，从块号起点开始，先一个个 bitmap block 的跳，BPB 即 bit per block 的意思
  // 所以跳过一个 BPB，就是跳过一个 bitmap block
  for(b = 0; b < sb.size; b += BPB){
    // 读到该轮循环的 bitmap block
    bp = bread(dev, BBLOCK(b, sb));
    for(bi = 0; bi < BPB && b + bi < sb.size; bi++){
      // 开始每 bit 地查找
      m = 1 << (bi % 8);
      if((bp->data[bi/8] & m) == 0){  // Is block free?
        bp->data[bi/8] |= m;  // Mark block in use.
        log_write(bp);
        brelse(bp);
        bzero(dev, b + bi);
        
        // 最终返回 b 个 BPB 后加上当前偏移量 bi 的编号，即这个可用的 data block 编号
        return b + bi;
      }
    }
    brelse(bp);
  }
  panic("balloc: out of blocks");
}
```

## inode

inode 层把“文件”这个概念从磁盘块里抽出来，变成一个可管理的对象。inode block 里面存放的是**文件类型，文件大小，链接数**等等**文件元数据**，而 data block 存放的就是文件实际的数据内容。比如 hello.txt，inode 里记录它是普通文件，大小是 13 字节，内容在第 100、101 号 data block 上，data block 里实际放的就是：`hello world\n`。一个文件想要存储在文件系统管理下的磁盘中，本身就要分两部分存储：元信息存储在 inode block，实际内容存储在 data block，当该文件被进程访问时，需要将元信息从磁盘读取到内存中供 kernel 运行时管理，这也就是为什么还有一个内存中的 inode 结构体。

首先我们来看看与 inode 有关的两个结构体，一个是内存中的 inode，存储在 itable 中；一个是磁盘中的 dinode，存储在 inode block 区域。这里解释一下 addrs 的 NDIRECT 啥意思：**addrs 这个数组中，前 NDIRECT 存储的是直接的 data block 的编号，而一个文件如果所需要的空间超过了 NDIRECT 个 data block 怎么办呢，xv6 就再用 ip->addrs[NDIRECT] 这个位置，存一个间接块的块号。这个间接块里，不存文件内容，而是存一串更多的数据块号。这个区域也就是 indirect 区**


```c
struct inode {
  uint dev;           // 所在磁盘设备号
  uint inum;          // 该 inode 所在 inode block 的编号
  int ref;            // 有多少个 C 语言指针指向该 inode
  struct sleeplock lock; // 操作磁盘是一个很耗时的过程，理所应当使用睡眠锁
  int valid;          // 该 inode 是否已从磁盘中读取过了

  short type;         // 后面这几个字段都是从磁盘 dinode 复制过来的内容
  short major;
  short minor;
  short nlink;
  uint size;
  uint addrs[NDIRECT+1];
};

struct dinode {
  short type;           // 文件类型，0 表示空闲
  short major;          // 和 minor 一样，表示设备文件的设备号
  short minor;     
  short nlink;          // 有多少目录项指向这个 inode
  uint size;            // 文件大小，单位是字节
  uint addrs[NDIRECT+1];   // 所处的 data block 的编号，注意不是地址！！！！一个文件可能会占用多个 data block，所以需要一个数组存储多个编号
};

// inode 表，管理内存中所有的 inode 结构体
struct {
  struct spinlock lock;
  struct inode inode[NINODE];
} itable;
```

接下来，整个 inode 层通过 iinit 函数初始化：

```c
void
iinit()
{
  int i = 0;
  
  // 初始化自旋锁保护全局 itale 状态
  initlock(&itable.lock, "itable");
  // 对于每个 inode
  for(i = 0; i < NINODE; i++) {
    initsleeplock(&itable.inode[i].lock, "inode");
  }
}
```

### inode 的分配和释放

随后通过 ialloc 函数在磁盘的 inode blocks 中分配一个新的 inode，返回对应的内存的 inode 引用；其实整体和 balloc 的逻辑非常类似，不同的是 balloc 扫描 bitmap，查找空闲的 data block，ialloc 扫描 inode blocks，找空闲的 inode。

```c
struct inode*
ialloc(uint dev, short type)
{
  int inum;
  struct buf *bp;
  struct dinode *dip;

  // 一个个 inode block 去扫描，一个 inode block 里面能存储多个 inode
  for(inum = 1; inum < sb.ninodes; inum++){
    bp = bread(dev, IBLOCK(inum, sb)); // 通过 inum 找到 inode 对应 inode block
    dip = (struct dinode*)bp->data + inum%IPB;
    if(dip->type == 0){  // 如果该 inode 空闲（type=0）
      memset(dip, 0, sizeof(*dip)); // 将其存储的旧内容清空
      dip->type = type; // 设置该 inode 的类型
      log_write(bp);   // 把这次对 inode block 的修改记进日志
      brelse(bp);
      // 注意，我们现在只在磁盘上分配了一个新的 inode，但是还需要一个内存中的可操作对象
      // 所以通过 iget 返回内存的 inode
      return iget(dev, inum);
    }
    brelse(bp);
  }
  panic("ialloc: no inodes");
}
```

结尾的 iget 函数会返回新分配的 inode 在内存中的可操作对象，我们来看看具体的逻辑：

```c
static struct inode*
iget(uint dev, uint inum)
{
  struct inode *ip, *empty;

  acquire(&itable.lock);

  empty = 0;
  // 扫描整个 itable 表
  for(ip = &itable.inode[0]; ip < &itable.inode[NINODE]; ip++){
    // 如果有新分配的 inode 在内存中的副本了（ref>0），那么 ref 再 +1 然后返回
    if(ip->ref > 0 && ip->dev == dev && ip->inum == inum){
      ip->ref++;
      release(&itable.lock);
      return ip;
    }
    
    // 如果看到一个没被引用的 inode 空槽，就记下来
    // 这样如果 table 里没有现成 inode 内存副本，就可以复用这个槽位
    if(empty == 0 && ip->ref == 0)
      empty = ip;
  }

  if(empty == 0)
    panic("iget: no inodes");
 
  // 如果没有找到该 inode 的现成内存副本，那么就用之前 empty 记录的空槽位 inode
  ip = empty;
  ip->dev = dev;
  ip->inum = inum;
  ip->ref = 1;
  ip->valid = 0; // 数据还不可信
  release(&itable.lock);

  return ip;
}
```

注意，我们现在只拿到了 inode 在内存中的引用，但是要确保 inode 真正可以被使用，还需要为这个 inode 加锁，并在需要的时候从磁盘中读内容，也就是 ilock 函数做的事：

```c
ilock(struct inode *ip)
{
  struct buf *bp;
  struct dinode *dip;

  if(ip == 0 || ip->ref < 1)
    panic("ilock");

  // 拿到该 inode 睡眠锁，确保只有当前线程访问该 inode
  acquiresleep(&ip->lock);

  // 如果该 inode 数据不可信
  // 即 iget 不是复用内存中已有的 inode，而是在 itable 中新占用了一个 inode 槽位
  // 那么就要重新从磁盘中读内容
  if(ip->valid == 0){
    bp = bread(ip->dev, IBLOCK(ip->inum, sb)); // 读到该 inode 对应的 inode block
    dip = (struct dinode*)bp->data + ip->inum%IPB; // 找到其在 inode block 中的具体位置
    ip->type = dip->type; // 复制数据过来
    ip->major = dip->major;
    ip->minor = dip->minor;
    ip->nlink = dip->nlink;
    ip->size = dip->size;
    memmove(ip->addrs, dip->addrs, sizeof(ip->addrs));
    brelse(bp);
    ip->valid = 1; // 标记内容有效
    if(ip->type == 0)
      panic("ilock: no type");
  }
}
```

iunlock 就不用说了，只是简单的释放掉该 inode 对应的睡眠锁。**更重要的是与 iget 对应的 iput**，它主要做两件事：把内存 inode 的 ref 减 1，如果这是最后一个引用，并且 inode 已经没有任何目录项指向它（nlink=0），就真正释放磁盘资源，清空文件内容块 + 释放 inode

```c
void
iput(struct inode *ip)
{
  acquire(&itable.lock);

  // 条件必须是除当前指针外没有别的引用者，并且数据要求无效，并且没有目录项指向该 inode
  if(ip->ref == 1 && ip->valid && ip->nlink == 0){
    acquiresleep(&ip->lock);

    release(&itable.lock);

    itrunc(ip); // 清空文件占用的 data blocks
    ip->type = 0; // 标记该 inode 为空闲
    iupdate(ip); // 将 inode 的变化写入磁盘（通过 log_write 走日志系统）
    ip->valid = 0;

    releasesleep(&ip->lock);

    acquire(&itable.lock);
  }

  ip->ref--; // 释放该次引用
  release(&itable.lock);
}
```


### inode 到 data block 的映射

前面我们讲了 inode 的分配和释放，都是默认 inode 已经和 data block 建立了联系了，即 inode 已经映射到了 data block。而接下来我们就来看看到底是如何映射的。

bmap 函数所做的事情，就是文件内容按照 1024 个字节每块划分后的第 bn 个块，将其翻译为该文件块对应的 data block 编号：

```c
static uint
bmap(struct inode *ip, uint bn) 
{
  uint addr, *a;
  struct buf *bp;

  // 如果 bn 处于 direct 区域，直接找到其对应的 data block 编号
  if(bn < NDIRECT){
    // 如果该编号还是 0，说明还没开始分配 data block
    if((addr = ip->addrs[bn]) == 0)
      // 那就通过 balloc 分配一个空闲的 data block
      ip->addrs[bn] = addr = balloc(ip->dev);
    return addr;
  }
  
  // 如果超过了 direct 区域，那就减去前面 NDIRECT 个直接的编号，进入 indirect 区（一个 block）
  bn -= NDIRECT;

  if(bn < NINDIRECT){
    // 依旧是编号为 0 那就分配空闲 data blokc
    if((addr = ip->addrs[NDIRECT]) == 0)
      ip->addrs[NDIRECT] = addr = balloc(ip->dev);
    // 将该 indirect block 的读成 buffer
    bp = bread(ip->dev, addr);
    
    // 如果 indirect block 里的第 bn 个位置还是 0，就说明这个文件内容块还没分配
    // 分配一个新的 data block，写到 indirect block 里    
    a = (uint*)bp->data;
    if((addr = a[bn]) == 0){
      a[bn] = addr = balloc(ip->dev);
      log_write(bp); // 因为修改了 block 本身，所以要走日志
    }
    brelse(bp);
    return addr; // 返回最终的 data block 编号
  }

  panic("bmap: out of range");
}
```

```c
int
readi(struct inode *ip, int user_dst, uint64 dst, uint off, uint n)
{
  uint tot, m;
  struct buf *bp;

  if(off > ip->size || off + n < off)
    return 0;
  if(off + n > ip->size)
    n = ip->size - off;

  for(tot=0; tot<n; tot+=m, off+=m, dst+=m){
    bp = bread(ip->dev, bmap(ip, off/BSIZE));
    m = min(n - tot, BSIZE - off%BSIZE);
    if(either_copyout(user_dst, dst, bp->data + (off % BSIZE), m) == -1) {
      brelse(bp);
      tot = -1;
      break;
    }
    brelse(bp);
  }
  return tot;
}
```

```c
int
writei(struct inode *ip, int user_src, uint64 src, uint off, uint n)
{
  uint tot, m;
  struct buf *bp;

  if(off > ip->size || off + n < off)
    return -1;
  if(off + n > MAXFILE*BSIZE)
    return -1;

  for(tot=0; tot<n; tot+=m, off+=m, src+=m){
    bp = bread(ip->dev, bmap(ip, off/BSIZE));
    m = min(n - tot, BSIZE - off%BSIZE);
    if(either_copyin(bp->data + (off % BSIZE), user_src, src, m) == -1) {
      brelse(bp);
      break;
    }
    log_write(bp);
    brelse(bp);
  }

  if(off > ip->size)
    ip->size = off;

  // write the i-node back to disk even if the size didn't change
  // because the loop above might have called bmap() and added a new
  // block to ip->addrs[].
  iupdate(ip);

  return tot;
}
```