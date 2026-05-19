
# dentry

**Linux 的 `dentry` 和 xv6 的 `dirent` 完全不是同一个层面的概念。** 它们之间最大的鸿沟在于：一个是**内存中**的纯缓存抽象，另一个是**磁盘上**的真实物理数据。

## xv6 的 `dirent` 到底对应 Linux 里的什么

```c
struct dirent {
  char name[DIRSIZ]; // 文件名
  ushort inum;       // 指向的 inode 编号
};
```

在 xv6 中，`dirent` 是**实实在在写在磁盘上的数据**。当你读取一个目录文件时，它的 data block 里存放的就是一个个这样的 `dirent` 结构体。

**在 Linux 中，与 xv6 `dirent` 完美对应的，是具体文件系统（如 Ext4, XFS）在磁盘上的目录项。** 比如在 Ext4 文件系统中，磁盘上真实存放的是 `ext4_dir_entry_2`：

```c
struct ext4_dir_entry_2 {
    __u32   inode;         /* Inode number */
    __u16   rec_len;       /* Directory entry length */
    __u8    name_len;      /* Name length */
    __u8    file_type;     /* File type */
    char    name[EXT4_NAME_LEN]; /* File name */
};
```

Linux Ext4 磁盘上的这个结构，和 xv6 的 `dirent` 核心逻辑是一模一样的：都是 `inode 编号` + `文件名`，它们都存在于目录文件的 data block 中。

## Linux 的 `dentry` 到底是什么

**Linux 的 `dentry` (Directory Entry Cache) 是 VFS（虚拟文件系统）在内存中动态生成的数据结构，它绝对不会被写入磁盘。**

当你访问 `/a/b/c` 时，Linux 的底层文件系统（比如 Ext4）会去磁盘里读取类似 xv6 `dirent` 那样的结构。读出来之后，Linux 为了避免下次访问同样的路径时再去做极其缓慢的磁盘 I/O 解析，会在**内存**中建立三个 `dentry` 对象（代表 `a`、`b` 和 `c`），并把它们用指针连接成一棵树（dcache）。

```c
// Linux 内存中的 dentry (只保留了关键字段)
struct dentry {
    struct qstr d_name;             // 名字 (比如 "c")
    struct inode *d_inode;          // 直接指向内存中的 inode 对象，而不是 inode 编号！
    struct dentry *d_parent;        // 指向父目录 "b" 的 dentry
    // ... 各种链表、锁和引用计数 ...
};
```


在 xv6 中，当你解析路径 `/a/b/c` 时，`namex` 函数会通过一个 `while` 循环不断调用 `dirlookup`。每一次 `dirlookup`，都要调用 `readi` 去读取上级目录的 data block，然后在读出来的 buffer 里面老老实实地循环做 `namecmp`（字符串比较）来寻找匹配的 `dirent`。

xv6 作为一个教学操作系统，为了保持内核极简，**没有实现内存路径缓存树（dcache）**。它每次解析路径，都相当于去翻磁盘上的那本“目录字典”。虽然 xv6 有 Buffer Cache 会把磁盘块缓存在内存里，但这只是“生数据”的缓存，内核依然需要耗费 CPU 去一点点遍历解析这些块里的 `dirent`。

## 总结

dentry 相当于 linux 在内存中实现的路径解析缓存树，用来加速对文件路径的解析。

| 特性        | xv6 的 dirent                | Linux 的 dentry            |
| ------------- | ------------------------------- | ----------------------------- |
| 存在位置      | 磁盘上（作为目录文件的 data block 内容）      | 纯内存中（VFS dcache 的一部分）         |
| 持久化       | 会持久化到磁盘                         | 掉电即消失，由内核动态构建和销毁              |
| 映射关系      | 字符串 (文件名) 映射到 Inode 编号 (整型) | 字符串 (文件名) 映射到 内存 Inode 指针 |
| 结构形态      | 扁平的数组（连续存储在 data block 中）       | 复杂的树形图（通过指针连接 parent 和 child） |
| 主要目的      | 持久化记录目录树的物理层级关系                 | 加速路径解析，避免重复的磁盘读取和字符串匹配        |
| Linux 对照物 | `ext4_dir_entry` 等具体文件系统的磁盘结构   | 本身就是 Linux 独有的 VFS 结构         |

简单来说，xv6 的 `dirent` 是存放在地下室档案柜里的纸质名册，而 Linux 的 `dentry` 是前台文员脑子里为了快速回答你而背下来的 VIP 客户关系图。 两者虽然都记录名字和人的对应关系，但存在的位置和承担的工程职责完全不同。