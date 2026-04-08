# Knowledge

这一章主要就是讲操作系统如何去实现硬件资源复用，进程隔离和进程交互这三个要求的吧。

## 硬件资源抽象

硬件资源抽象的方式上，除了提供 kernel 的 syscall 这种方式，教材中还提到了一种方式，把 open/read/write/fork/... 这些接口都做成普通库函数，应用程序直接链接这个库，应用程序自己直接访问 CPU、内存、磁盘等硬件资源，这样就不再需要操作系统 kernel 了。这种方法确实在一些嵌入式系统中是可行的。但是这种方法在多进程同时运行，每个进程都能碰硬件资源时就会有问题，比如说一个进程不让出 CPU 资源，那么别的进程就无法继续运行。

操作系统 kernel 的好处在于，进程不需要手动管理磁盘，CPU，内存这些硬件资源。磁盘由 open/read/write/close 这些 syscall 管理；CPU 由 kernel 在不同进程之间轮流分配，通过保存和恢复寄存器，使得多个进程可以同时运行；通过虚拟内存，每个进程只需要管理“自己的内存空间”，而不用面临真实的物理内存。通过 kernel，优雅地实现了对硬件资源的抽象和封装。

## 强隔离

### 两种模式

这里教材提到了 user mode 和 supervisor mode，而在之前也有过 user / kernel space 的说法，我的理解是，mode 是 CPU 的运行权限级别，space 是软件所处的执行环境/地址空间语境。

当普通应用程序运行时，CPU 处于 user mode，程序运行在 user space。这时程序：

- 不能执行特权指令
- 不能直接访问内核数据
- 只能通过 system call 请求内核服务

当进入 kernel 后，CPU 处于 supervisor mode，代码运行在 kernel space，这时 kernel 可以：

- 执行特权指令(比如 ecall 指令)
- 操作页表
- 开关中断
- 调度进程
- 访问内核数据结构

当前 CPU 处于 user mode 还是 supervisor mode，决定了它是否拥有执行特权操作的权限。用户程序运行在 user space 中，不能直接调用内核里的服务实现；当它调用 read() 这类系统调用接口时，user space 处的封装代码会准备好系统调用编号和参数，并执行 ecall 指令。ecall 会触发 trap，使 CPU 从 user mode 切换到 supervisor mode，进入 kernel space 中由内核控制的入口。随后内核识别系统调用编号，分发到对应的内核处理函数（如 sys_read()），完成参数检查、权限检查和实际操作，再将返回值写回约定寄存器，并切回 user mode，回到 user space 中的用户程序继续执行。

### 进程隔离

有关 process 的结构体实现可以看看 kernel/proc.h，重点看看如下字段：

- p->pagetable：该进程页表
- p->kstack：该进程内核栈
- p->state：运行状态（RUNNABLE/RUNNING/SLEEPING/...）
- p->ofile：打开的文件列表（chapter 1 中有过提及）

在 xv6 中，process 同时打包了两件事：独立地址空间 + 一条执行线程，从而实现隔离和并发。进程是最小的隔离边界，进程之间 CPU，fd，内存这些资源都是隔离的，其隔离机制的实现主要依赖以下三点：

- user/supervisor mode
- page table（地址空间隔离）
- 时间片调度（CPU 共享）