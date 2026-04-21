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
  uint blockno; // 磁盘上的第几个块
  struct sleeplock lock; // 这块 buf 的睡眠锁，保证同一时刻只有一个内核线程读写它
  uint refcnt; // 目前有多少地方在使用这个 buf
  struct buf *prev; // 和下面的 next 字段一样，所有 struct buf 组成一个双向链表
  struct buf *next;
  uchar data[BSIZE]; // buf 结构体中实际存放内容的字节数组，BSZIE = 1024，一个 char 为一字节
};
```

这其中 dev + blockno 决定 buf 是磁盘上的哪一块内容的缓存，valid 决定缓存内容能不能直接用，refcnt 决定此 buf 能不能被回收复用。

