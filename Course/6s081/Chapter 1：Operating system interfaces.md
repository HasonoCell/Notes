# Knowledge

## 什么是 Kernel 和 Process？

教材中这段话说的很清晰易懂，摘录下来：

>"xv6 采用传统形式 kernel，一个为正在运行的程序提供服务的特殊程序。每个正在运行的程序，称为 process，具有包含指令、数据和堆栈的内存。这些指令实现程序的计算。数据是计算所作用的变量。堆栈组织程序的过程调用。给定的计算机通常具有许多进程，但只有一个内核。当进程需要调用内核服务时，它会调用 system call，这是操作系统暴露的接口中的调用之一。系统调用进入内核；内核执行服务并返回。因此，一个进程交替执行 user space 和 kernel space。"

值得一提的是，shell 也是一个普通的 process，存在于 user space，而不是 kernel 的一部分。

## Process 到底是怎么产生的？

举个例子，比如我们要通过 shell 调用 echo 这个命令，其实本质上是 shell 去通过 fork 这个 system call，在原进程处(即 shell)创造一个子进程并返回子进程的 pid，然后子进程开始通过 exec 系统调用执行命令，原进程通过 wait 系统调用等待子进程结束。echo 命令会在某一个时刻调用 exit 系统调用，导致原进程的 wait 结束。也就是

```txt
  shell
    fork()
     ├── parent: wait()
     └── child:  exec("echo", ...)
```

fork() 之后：

- 在子进程里，返回 0
- 在父进程里，返回“子进程的 pid”，这是一个大于 0 的整数
- 如果失败，返回 < 0

所以在调用 fork 的时候，都需要对父子进程做出区分。
## 什么是文件描述符？

>file descriptor 是一个小整数，表示进程可以读取或写入的内核管理对象。进程可以通过打开文件、目录或设备，或者通过创建管道，或者通过复制现有描述符来获取文件描述符。按照惯例，进程从文件描述符 0（标准输入）读取，将输 出写入文件描述符 1（标准输出），并将错误消息写入文件描述符 2（标准错误）。

说白了其实就是用来方便地表示一个 process 可以通过 read 和 write 这两个系统调用来读写的对象。通过 open 系统调用来返回文件描述符。

可以把它想成这样：

- 用户程序手里拿的是整数 fd
- kernel 根据这个整数，去当前进程 proc 的 ofile[] 里查
- ofile[fd] 指向一个 struct file
- struct file 再指向真实对象，比如 inode（磁盘上的普通文件 / 目录）、pipe（管道缓冲区）、device（设备，比如终端）

即这样一条数据链路：`fd -> proc中的ofile[] -> struct file -> inode(file or dir)/pipe/device`。**注意**：这里之所以 proc->ofile 不是直接指向的 inode，而是先指向 struct file，是因为 inode 保存的是文件本体，struct file 表示的是“一次打开的结果”。一个进程 open() 一个文件后，需要额外保存很多“打开实例”的信息，比如：

- 这个 fd 是否可读 readable
- 是否可写 writable
- 当前读写偏移 off
- 它到底是普通文件、pipe 还是 device

这些都不是文件本体属性，而是“这次打开”的属性。当同一个文件被不同的进程打开多次，struct file 确保了不同进程之间的文件状态互不影响。

```c
fd1 = open("x", O_RDONLY);
fd2 = open("x", O_RDONLY);

// fd1 -> struct file A -> inode x (off = 100) 
// fd2 -> struct file B -> inode x (off = 0)
```

fd 本质上就是一个非负小整数，像 3、8、11 都可以。它本身没有特殊含义，只是当前进程打开文件表里的下标。特殊的是 0、1、2 这三个编号的约定：

- 0：标准输入 stdin
- 1：标准输出 stdout
- 2：标准错误 stderr

这里的“特殊”主要是约定，不是说内核只允许这三个编号做特殊事。更准确地说：

- 内核把它们当普通 fd 看待
- 但 Unix 程序普遍约定 0/1/2 分别承担输入、输出、错误输出
- 所以 shell、库函数、很多程序都会默认这么使用

在 xv6 这个操作系统中，初始化时 0，1，2 这三个文件描述符都指向了终端 console。

## 重定向是什么？

>文件描述符是一个强大的抽象，因为它们隐藏了它们所连接的内容的详细信息：写入文件描述符 1 的进程可能正在写入文件、控制台等设备或管道。

那么如何实现这种抽象？就需要通过重定向来实现。用一个简单的命令 `echo hello > x.txt` 来理解 shell 的重定向：

如果平时执行：`echo hello`，echo 往标准输出写，也就是往 fd 1 写：`write(1, "hello\n", 6);` 这时 fd 1 通常连着终端，所以我们才会在屏幕上看到输出。

而如果是 `echo hello > x`，shell 在启动 echo 之前，会先做一件事：让 fd 1 不再指向终端，而改成指向文件 x。通过 `close(1)` 系统调用，把当前的标准输出关掉，于是 ofile[1] 空出来了，然后执行 `open("x", O_CREATE|O_WRONLY)` 系统调用，open 总是返回“当前最小可用的 fd”，因为 0 还在，1 刚被关掉了，2 还在，所以最小空位就是 1，于是 `ofile[1] ---> x`，再 `exec("echo", ...)` 运行 echo 程序时，它继承了这个文件描述符状态。所以对 echo 来说，它根本不知道自己被重定向了。它只是照常执行：`write(1, "hello\n", 6);` 但此时的 1 已经不是终端，而是文件 x，所以内容被写进文件。

当然，shell 在解析命令的时候会特殊判断 '>' 这个符号，从而才能判断出需要重定向。源码对应到了 sh.c 中的 `runcmd` 这个函数，对 cmd type 做出了区分。

## 管道 Pipe 是啥？

说白了就是一块内核的暂存缓冲区，其需要两个 fd，在 xv6 中：

```c
int p[2];
pipe(p);
```

执行后：
- p[0] 是读端
- p[1] 是写端
所以后面可以这样：

```c
write(p[1], "abc", 3);   // 往管道写
read(p[0], buf, 3);      // 从管道读
```

比如 `echo hello | wc` 这个经典的管道命令，shell 大致会做这些事：

1. shell 解析命令，发现有 '|'，判断出这是个管道命令
2. 创建管道 pipe(p)
3. fork 一个子进程运行左边的 echo
4. 在左边子进程里，把标准输出 fd 1 改接到 p[1]
5. fork 另一个子进程运行右边的 wc
6. 在右边子进程里，把标准输入 fd 0 改接到 p[0]

## 简单理解 xv6 的文件系统

文件系统就是操作系统用来“组织和找到数据”的一套规则。它解决三个问题：

- 数据放哪
- 怎么给数据起名字
- 怎么通过名字找到数据

xv6 里主要有两类东西：

- 数据文件：里面就是一串字节，操作系统不关心这些字节代表文本、图片还是程序
- 目录：目录本身不是普通数据文件，但是它在 xv6 中本质和普通文件一样，也是一种 inode，只不过它里面存的是“名字到文件的映射关系”

xv6 提供几种创建对象的方式：

- mkdir("/dir")：创建目录
- open("/dir/file", O_CREATE|O_WRONLY)：创建普通文件
- mknod("/console", 1, 1)：创建设备文件

这里前两种比较直观：目录用来组织名字，普通文件用来存数据。设备文件稍微特殊一些。它看起来也在文件树里，也能被 open，但它不对应普通磁盘数据，而是对应某个内核设备，比如 /console。

```c
fd = open("/console", ...);
write(fd, ...);
```

内核不会把数据写到磁盘文件里，而是把 write 转发给控制台设备驱动。所以设备文件的意义是：把设备也包装成“像文件一样可以 open/read/write 的对象”。

教材中有这么一句话：“文件名和文件本身不是一回事”，其实就是说，文件名只是目录里的一个名字，真正代表文件本体的是 inode，inode 里保存的是这个文件真正的元数据，比如：

- 类型：普通文件(T_FILE) / 目录(T_DIR) / 设备(T_DEVICE)
- 大小
- 数据块在磁盘上的位置
- 链接数（link count）

### Unix 的“一切皆文件”

一句话概括：很多不同的资源，都尽量用文件这一套接口来访问。也就是统一成：

- open
- read
- write
- close

比如下面这些东西，类型其实完全不同：

- 普通磁盘文件
- 终端 console
- 管道 pipe
- 设备文件

它们底层实现不同，但对用户程序来说，往往都能这样操作：

```c
fd = open(...);
read(fd, ...);
write(fd, ...);
close(fd);
```

不过要注意，严格来说并不是真的“完全一切”都和普通文件一样。比如：

- 目录虽然也在文件系统里，但不能像普通文件那样随便写
- pipe 不是磁盘文件，只是借用了文件描述符接口
- 设备文件也不是普通数据文件，它背后是驱动程序
- 有些对象甚至没有路径名，但仍然可以通过 fd 操作

所以更准确的说法应该是：Unix 的哲学是“尽可能把不同资源抽象成可以像文件一样操作的对象”。

# Labs

## sleep

判断参数数量，数量正确后 fork 子进程，在子进程中调用 sleep 系统调用
```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    if (argc != 2)
    {
        printf("error: need seconds\n");
        exit(1);
    }

    int pid = fork();

    if (pid < 0)
    {
        printf("fork failed\n");
        exit(1);
    }
    else if (pid == 0)
    {
        int seconds = atoi(argv[1]);
        sleep(seconds);
        exit(0);
    }
    else
    {
        wait(0);
        exit(0);
    }
}
```

## pingpong

这个题目主要是搞清楚管道的方向。p[0] 永远是读端，p[1] 永远是写端，并且一条管道的数据流向永远是“从 p[0] 处读入数据，在将数据写入到 p[1]”。

这里我看到一些博客中的解法是 fork 两次创造两个进程，其实没有必要，fork 一次就可以使用父子两个进程，使其通信即可。

```c
#include "kernel/types.h"
#include "user/user.h"

int main(int argc, char *argv[])
{
    int p1[2]; // child -> parent
    int p2[2]; // parent -> child
    pipe(p1);
    pipe(p2);

    int pid = fork();

    if (pid < 0)
    {
        fprintf(2, "fork failed\n");
        exit(1);
    }
    else if (pid == 0)
    {                 // child
        close(p1[0]); // child doesn't read from p1
        close(p2[1]); // child doesn't write to p2

        char buf[1];
        read(p2[0], buf, 1);
        printf("%d: received ping\n", getpid());
        write(p1[1], buf, 1);

        close(p2[0]);
        close(p1[1]);
        exit(0);
    }
    else
    {                 // parent
        close(p1[1]); // parent doesn't write to p1
        close(p2[0]); // parent doesn't read from p2

        char buf[1] = {'a'};
        write(p2[1], buf, 1);
        read(p1[0], buf, 1);
        printf("%d: received pong\n", getpid());

        close(p2[1]);
        close(p1[0]);
        wait(0);
        exit(0);
    }
}
```

## primes

这个题目主要是要知道 dup 系统调用，可以基于一个 fd 创建出来一个新的 fd，两个 fd 都指向用一个 struct file，共享同一份文件状态，最后会返回当前进程里最小的可用文件描述符。整个思路就是每个进程负责筛掉某一个质数的倍数，然后把剩下的数字通过新的管道传给下一个进程。

这个解法牛逼的点在于，通过 dup 复制的 old_pipe 的读端，其指向的那个打开的文件对象，会被放到当前最小可用的 fd 上，即标准输出 0 处。

```c
#include "kernel/types.h"
#include "user/user.h"

void primes(int p0[2]) __attribute__((noreturn));

int main(int argc, char *argv[])
{
    int p[2];
    pipe(p);

    int pid = fork();
    if (pid == 0)
    {
        primes(p);
    }
    else
    {
	    // 父进程关闭读端，不断写数据给子进程
        close(p[0]);
        for (int i = 2; i <= 280; i++)
        {
            write(p[1], &i, sizeof(i));
        }
        close(p[1]);
        wait(0);
    }
    exit(0);
}

void primes(int old_pipe[2])
{
    close(0); // 子进程关闭标准输入
    dup(old_pipe[0]); // 通过 dup 复制 fd，放到子进程标准输入上
    close(old_pipe[0]); // 关闭管道的读写端，后续可以直接从标准输入读
    close(old_pipe[1]);

    int prime;
    if (read(0, &prime, sizeof(prime)) == 0)
    {
        close(0);
        exit(0);
    }
    printf("prime %d\n", prime);


	// 开始递归
    int new_pipe[2];
    pipe(new_pipe);

    int pid = fork();
    if (pid == 0)
    {
        primes(new_pipe);
    }
    else
    {
        close(new_pipe[0]);
        int num;
        while (read(0, &num, sizeof(num)))
        {
            if (num % prime != 0)
            {
                write(new_pipe[1], &num, sizeof(num));
            }
        }
        close(0);
        close(new_pipe[1]);
        wait(0);
    }
    exit(0);
}
```

## find

主要是通过 fstat 系统调用获取到文件状态写入到 st，判断文件类型(T_DIR / T_FILE) 再做处理。

```c
#include "kernel/types.h"
#include "kernel/stat.h"
#include "user/user.h"
#include "kernel/fs.h"

void find(char *path, char *filename);

int main(int argc, char *argv[]) {
    if (argc != 3) {
        fprintf(2, "usage: find <path> <filename>\n");
        exit(1);
    }
    
    // 递归搜索
    find(argv[1], argv[2]);
    exit(0);
}

void find(char *path, char *filename) {
    char buf[512], *p; // buf 为完整路径缓冲区，p 为操作指针
    int fd;
    struct dirent de; // “目录项”结构体
    struct stat st; // 文件状态

    if ((fd = open(path, 0)) < 0) {
        fprintf(2, "find: cannot open %s\n", path);
        return;
    }
    if (fstat(fd, &st) < 0) {
        fprintf(2, "find: cannot stat %s\n", path);
        close(fd);
        return;
    }
    switch (st.type) {
        case T_DIR:
            if (strlen(path) + 1 + DIRSIZ + 1 >= sizeof(buf)) {
                printf("find: path too long\n");
                break;
            }
            
            strcpy(buf, path); // 将当前 path 复制到 buf
            p = buf + strlen(buf); // 移动 p 指针到末尾
            *p++ = '/';
            
            while (read(fd, &de, sizeof(de)) == sizeof(de)) {
                if (de.inum == 0)
                    continue;
                memmove(p, de.name, DIRSIZ);
                p[DIRSIZ] = 0;
                if (stat(buf, &st) < 0) {
                    printf("find: cannot stat %s\n", buf);
                    continue;
                }
                if (st.type == T_FILE && strcmp(de.name, filename) == 0) {
                    printf("%s\n", buf);
                }
                if (st.type == T_DIR && strcmp(de.name, ".") != 0 && strcmp(de.name, "..") != 0) {
                    find(buf, filename);
                }
            }
            break;
        default:
            if (strcmp(de.name, filename) == 0) {
                printf("%s\n", path);
            }
        }
    close(fd);
}
```

## xargs

```c
#include "kernel/types.h"
#include "user/user.h"
#include "kernel/param.h"

int main(int argc, char *argv[]) {
    if (argc < 2) {
        fprintf(2, "usage: xargs <args>\n");
        exit(1);
    }
    char *cmd = argv[1];
    char *args[MAXARG];
    int i, n = 0;

    // 复制参数
    for (i = 1; i < argc && n < MAXARG - 1; i++) {
        args[n++] = argv[i];
    }
    int end = n;
    //方便重置索引
    char buf[512];
    int m = 0;
    while (read(0, &buf[m], 1) == 1) {
        if (buf[m] == '\n') {
            buf[m] = 0;
            args[n++] = &buf[0];

            // 参数必须以 NULL 结尾
            args[n] = 0;

            int fd = fork();
            if (fd == 0) {
                exec(cmd, args);
                fprintf(2, "xargs: exec failed\n");
                exit(1);
            }
            wait(0);

            // 索引重置
            m = 0;
            n = end;
        } else {
            m++;
        }
    }
    exit(0);
}
```