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

传统磁盘硬件通常按照每 512 个字节为一个**扇区**来读写，而操作系统中的文件系统读写磁盘时，会按照**块（Block）** 的方式读写，且块通常是扇区的倍数。xv6 中一个 block 是 1024 个字节，将磁盘分为了这几部分：

- block 0：boot sector，不用来存文件系统数据。
- block 1：superblock，记录文件系统整体信息。
- 后面一段：log。
- 再后面：inodes。
- 再后面：bitmap，记录哪些数据块空闲。
- 最后：data blocks，真正存文件内容和目录内容。

## buffer cache

为什么文件系统中需要 buffer cache？主要是为了给访问速度极慢的磁盘块添加一层**内存缓存**，从而让热点块不用每次都去硬盘里面读。此外，同一块磁盘在内存里只能有一份拷贝，而且同一时刻只能一个内核线程改它。

我们先来看看最核心的 buf 结构体：struct buf 可以理解成**某个完整的磁盘块在内存里的缓存副本**

```c
struct buf {
  int valid;   // 这份缓存内容是否已经从磁盘读进来
  int disk;    // 磁盘设备当前是否正在处理这块 buf
  uint dev;    // 属于哪个磁盘设备
  uint blockno; // 那个磁盘上的第几个块
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

