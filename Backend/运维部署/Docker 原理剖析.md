
《自己动手写 Docker》一书的阅读笔记，以及实现 Docker 过程中的代码思路和实现细节～

# Docker 架构 / 和虚拟机的区别

容器在 Linux 内核眼中本质上就是一个运行在 User Space 中的普通进程，通过 Namespace，Cgroups，Rootfs 这些技术实现隔离（虽然现在还不知道到底咋回事～）

```text

=========================================================
                 User Space (用户空间)
                 
 ┌──────────────────────┐      ┌──────────────────────┐
 │   普通用户进程         │      │     容器化用户进程      │
 │ (如宿主机的 bash, ssh) │      │ (如 Docker 里的 Nginx)│
 └─────────┬────────────┘      └──────────┬───────────┘
           │                              │ (系统调用 Syscall)
           │                              │
===========│==============================│==============
           v                              v
                 Kernel Space (内核空间)
                 
            共享的同一个 Linux Kernel
      (提供 Namespaces 隔离 和 Cgroups 限制)
=========================================================

```

容器到底和虚拟机有什么区别呢？
**虚拟机**通过底层的 Hypervisor（或者说 VMM），将物理机的计算资源（CPU，内存，网卡，磁盘等）实现隔离，通过虚拟化硬件，实现在一台物理机上运行多个 Kernel。虚拟机的优点是**隔离性强**，因为 OS Kernel 是不同的，但缺点就是**启动慢且资源占用大**。
**容器**前面说了，本质上就是一个普通的进程，所以多个容器是**共享 Kernel** 的，这是与虚拟机最根本的区别。容器的优点就是**启动快且资源占用小**，但是缺点就是**隔离性一般**，会有逃逸容器的情况出现。

还有一个我一直很疑惑的问题是，容器既然不同于虚拟机，是共享宿主机 Kernel 的，那为啥我们经常在使用 Ubuntu，CentOS，Alpine 这些容器，难道这些容器中是真的运行了对应 OS 的 Kernel 吗？**显然不是！** 我们知道，一个 OS 分为了两部分：kernel space 和 user space。我们运行一个所谓的 Ubuntu 容器，这个容器中拥有的只有 Ubuntu 的 user space 的部分。它包含了 Ubuntu 的包管理器 `apt`、`bash` 和文件目录结构，但绝不包含 Linux Kernel。这个容器启动后，它实际上是拿着 Ubuntu 的用户态工具，去调用宿主机的内核。比如你在一个内核版本是 5.15 的 Ubuntu 宿主机上跑一个 Alpine 容器，在容器中启动的 shell，是 Alpine 的 user space 提供的 shell 工具，运行 `uname -r` 查看当前运行的内核版本，会发现是 5.15，而不会是任何 Alpine 的内核版本。

# Namespace 到底是啥

Namespace 是 Linux 内核提供的一种**底层资源隔离机制**，它通过为进程建立独立的系统全局资源视图，让被隔离的进程产生“自己独占了整个操作系统”的错觉。Namespace 其实很像操作系统的第二套 Page Table。Page Table 负责把虚拟内存映射到物理内存；Namespace 负责把虚拟的全局资源（如虚拟的 PID=1 的进程）映射到真实的全局资源（如真实的 PID=5678 的进程）。

```text

【宿主机视角 (真实的物理机器/父命名空间)】
   (能看到所有进程，拥有真实的 UID 和 PID)
   
   UID=1000, 进程PID=1234  (宿主机上的普通 bash 进程)
   UID=1000, 进程PID=5678  (这是一个正在运行的容器进程)
          |
          | (内核做了一层映射)
          |
   =======|========================================
          V
【容器视角 (Namespace 内部/子命名空间)】
   (拥有虚拟的 UID 和 PID)
   
   UID=0 (以为自己是 root)
   进程PID=1 (以为自己是 init 第一个进程)

```


## namespace 的分类

OK，我们知道了 Namespace 的作用，那么 Namespace 机制到底是如何实现的呢？**Namespace 是存在于进程控制块（PCB）中的一组指向特定“资源视图”的数据结构指针**。PCB 是啥？其实就是代表一个进程的 C 语言结构体，Linux 中叫 `struct task_struct`，而 Namespace 的本体就是一个 nsproxy（命名空间代理）指针。我们来看看部分源码：

```c
// 简化版
struct task_struct {
    pid_t pid;                      // 进程的真实全局 PID
    struct mm_struct *mm;           // 相当于 page table，负责内存隔离
    struct nsproxy *nsproxy;        // 指向该进程所属的 Namespace 集合
    // ...
};

struct nsproxy {
	refcount_t count;
	struct uts_namespace *uts_ns;
	struct ipc_namespace *ipc_ns;
	struct mnt_namespace *mnt_ns;
	struct pid_namespace *pid_ns_for_children;
	struct net 	     *net_ns;
	struct time_namespace *time_ns;
	struct time_namespace *time_ns_for_children;
	struct cgroup_namespace *cgroup_ns;
};

```

下面来介绍一下不同 namespace 的分类：

### 身份与权限的隔离（进程是谁）

这组 Namespace 负责修改进程对自身身份的认知。

**PID Namespace (进程编号)**：让进程以为自己是 `PID 1`，拥有收养孤儿进程的特权。

---
#### 小插曲之孤儿进程

这里解释一下**为什么需要让容器中的进程以为自己的 PID 为 1 从而去收养孤儿进程呢？** 在 Linux 中，除了硬编码的 PID 0 进程，所有的进程都是通过 `fork()` 或 `clone()` 创建出来的，所以进程之间是严格的父子树状关系。

正常情况是，子进程先死，死后内核不会立刻销毁它的 `task_struct`，而是把它变成一个 **zombie process**，父进程必须调用 `wait()` 或 `waitpid()` syscall，来读取子进程的退出状态码，内核才会真正把子进程的 `task_struct` 从内存中清理掉，这一块和 xv6 的进程资源清理机制非常相似，可以类比过来。所谓**孤儿进程**，就是指父进程先死了，子进程还在继续运行。这时候，这个还在运行的子进程就成了“孤儿进程”。

在什么场景下会产生孤儿进程？最经典的场景就是**后台服务（Daemon）**。比如你写了一个程序，启动程序产生一个父进程后，派生了一个子进程去后台默默处理日志，然后父进程自己退出了。那个留在后台处理日志的子进程就成了孤儿进程。

孤儿进程的危险在于，这个孤儿进程在执行完任务之后迟早也会被清理资源的。当它的状态变为 zombie 后，由于其父进程早就死了，没有任何进程会调用 wait() 来彻底销毁其 task_struct 资源。为了解决这个问题，就需要有一个**托孤机制**：当一个父进程退出后，会给它的所有孤儿子进程找一个新的父进程，而通常这个兜底的新父进程，就是 **PID 为 1** 的进程。我们来举一个实际的例子：如果我们用 namespace 隔离出了一个容器，但里面没有 PID 1 的进程，会发生什么？

1. 容器里跑了一个 Nginx 主进程。
2. Nginx 的主进程派生了几个 Worker 子进程。
3. 如果 Nginx 主进程因为某种原因崩溃退出了，那几个 Worker 进程就成了容器里的孤儿进程。
4. 内核的 `exit` syscall 开始运行，试图在当前容器的 PID Namespace 里找新的父进程来托孤。
5. 如果容器里没有 PID 1 的进程来兜底，内核就会彻底找不到，这些孤儿进程在未来死掉后将永远变成 zombie，慢慢把这个容器的 PID 资源耗尽，导致容器卡死。

---

**User Namespace (用户与组)**：让进程以为自己是 `root (UID 0)`，在容器中拥有最高的执行权限。它是唯一一个能跨越“特权边界”的 Namespace。普通用户创建其他 Namespace 通常需要 root 权限，但引入 User Namespace 后，普通用户可以在自己的 User Namespace 里映射成 root，然后再去创建其他的 Namespace


### 空间与位置的隔离 (进程在哪)

这组 Namespace 负责修改进程对文件目录和机器名称的认知。

---
#### 小插曲之 Linux 的文件系统

之前学习过 xv6 这个操作系统，它所实现的 FS 其实是非常简单且理想的单体 FS：底层只支持一种硬编码的磁盘格式。它的最高抽象是 `inode`。内核通过 `inode` 这一数据结构，屏蔽了普通文件、目录、设备终端（Console）和管道（Pipe）的区别，向用户层提供了一致的 `read/write` 系统调用。

但在真实世界中存在多种 FS，**比如 Linux 系统默认使用的文件系统 `Ext4`，常用于数据库服务器的文件系统 `XFS`，Windows 使用的文件系统 `NTFS`，常用于 U 盘的文件系统 `FAT32 / exFAT`** 。其实我们平常使用的 U 盘或者移动硬盘，都不仅仅只是单纯的存储介质，还自带了对应的文件系统，比如 FAT32，并且文件系统也不是永远不变的，**完全可以通过格式化操作，将一块 FAT32 文件系统的 U 盘改为 exFAT 文件系统**。所以不同于 xv6 的理想情况，Linux 这样工业级别 OS，肯定**需要对不同的 FS 做兼容，为用户层提供统一的系统调用(open / read / write / close)，这和 xv6 的 inode 层的思想是一致的，也就诞生了 VFS 虚拟文件系统这一层**。下面这个图非常直观地表示了 VFS 的作用：

```text

用户空间 (User Space)

      |
  [ 应用程序 ]  <-- 只需调用系统调用 (如 read/write)
      |
-------------------------------------------------------
内核空间 (Kernel Space)

      |
   [ VFS ]    <-- 负责把请求分发给对应的 FS 驱动
      |
      +---- [ ext4 驱动 ] ----> 硬盘 (Linux 系统分区)

      |
      +---- [ fat32 驱动 ] ---> U盘 A (兼容旧设备)
      |
      +---- [ exfat 驱动 ] ---> U盘 B (存高清视频)


```

VFS 强制规定了所有接入 Linux 的具体文件系统，必须将其底层数据结构映射为 VFS 认识的四大核心标准对象：

- `super_block`（超级块）：代表一个已挂载的具体文件系统实例状态。
- `inode`（索引节点）：代表一个具体的文件或目录实体（这与 xv6 的概念一致，但在 VFS 中它是一个通用结构）。
- `dentry`（目录项）：用于在内存中维护目录树状结构，加速路径字符串到 `inode` 的解析过程。
- `file`（文件对象）：代表进程当前打开的文件上下文，包含读写偏移量。

VFS 采用动态分发机制，在 VFS 的 `struct file` 结构体中，包含一个函数指针表 `struct file_operations *f_op`。 当具体文件系统（例如 Ext4）被加载时，它必须将自己特有的读取函数（如 `ext4_file_read`）的地址，赋值给这个 `f_op->read` 指针。当用户层发起 `read()` 系统调用时，请求进入 VFS 层的通用函数 `vfs_read()`。`vfs_read()` 只负责调用目标 file 的函数表中特定的 read 函数 `file->f_op->read(...)`。执行流通过指针跳转，精准下发到对应的具体文件系统驱动中。

所以 **Mount** 这个概念，就是指就是将一个实现了 VFS 标准接口的具体文件系统实例（即它的 `super_block` 和根 `inode`），绑定到 VFS 全局目录树中的某一个特定的 `dentry` 节点（即挂载点）上。比如将一个 Ext4 fs 的 U 盘插入到 linux os 的主机上，如果这个主机的 linux 环境是最纯净的 linux 环境，没有图形界面，也没有任何的自动化服务，当插入 U 盘核在 `/dev` 目录（设备文件目录）下生成 U 盘的文件节点 `/dev/sdb1` ，但此时 VFS 还不能找到访问到 U 盘中存储的内容，必须**手动执行 mount 系统调用：`mount -t ext4 /dev/sdb1 /mnt/usb`**，VFS 才会在内存的挂载表中，将主文件系统的 `/mnt/usb` 目录结构（`dentry`）与 `/dev/sdb1` 的底层 Ext4 驱动绑定在一起，进程才能通过 `/mnt/usb` 访问到 U 盘中的数据。

---

**Mount Namespace (文件系统挂载点)**：隔离文件系统的挂载点，让容器拥有一棵完全独立的目录树。

Mount Namespace 的物理创建过程：当一个进程调用 `clone` 或 `unshare` 并传入 `CLONE_NEWNS`时，内核会执行以下三步数据结构操作：

1. **实例分配**：内核调用 `kmalloc`，在内存中分配一个全新的 `struct mnt_namespace` 结构体实例。    
2. **挂载表拷贝（复制当前状态）**：内核会遍历父进程当前所指向的挂载表，将里面现有的所有映射记录（即 `struct mount` 对象）在内存中完整地拷贝一份，填充到刚刚分配的新 `mnt_namespace` 实例中。
3. **重定向代理指针**：内核将新进程的 `task_struct -> nsproxy -> mnt_ns` 指针，从原来指向全局的实例，更新为指向这个刚刚创建的全新 `mnt_namespace` 实例。

但此时，由于 namespace 中的新进程是完整拷贝的父进程的挂载表，看到的依旧是宿主机的文件系统。比如想要运行一个 Ubuntu 的**容器**，此时容器引擎虽然把一个包含 Ubuntu 文件的**镜像**解压到了宿主机的某个目录（例如 `/var/lib/docker/overlay2/xxx`），但在新进程的视角里，当它执行 `open("/bin/bash")` 时，VFS 依然会顺着它私有挂载表中的 `/` 记录，去 `/dev/sda1`（宿主机的盘）里找 `/bin/bash`。为了让容器进程认为自己运行在 Ubuntu 中，我们必须把该新进程 `mnt_namespace` 中对 `/` 的映射记录，强行修改为指向那个包含 Ubuntu 文件的镜像解压目录。

**由于根路径 / 的特殊性，不能简单地通过 mount 和 unmount 系统调用来修改，必须要通过另一个特殊的系统调用 pivot_root 来修改根路径的挂载点**。它接收两个参数：`new_root`：你想作为新根目录的挂载点路径（即 Ubuntu 镜像所在的目录）；`put_old`：一个位于 `new_root` 下的子目录，用来临时存放原来的旧根目录。

引擎先在容器进程的私有挂载表里，执行一次内部 `mount`。将 Ubuntu 镜像目录绑定挂载到一个临时路径，假设叫 `/new_root`。 此时挂载表里有两条关键记录：

- 记录 A：`/` -> 宿主机磁盘 (`/dev/sda1`) 
- 记录 B：`/new_root` -> 容器镜像设备 (`OverlayFS`)
    
然后新进程调用 `pivot_root("/new_root", "/new_root/put_old")`。内核的 VFS 介入，直接操作当前进程的 `mnt_namespace` 挂载表，执行原子级的记录交换：将原本映射到 `OverlayFS` 的记录 B，其挂载点强制修改为 `/`；将原本映射到宿主机磁盘的记录 A，其挂载点强制修改为 `/put_old`。执行完 `pivot_root` 后，容器进程私有挂载表的状态发生了根本性翻转：

- 记录 B 变成了：`/` -> 容器镜像设备 (`OverlayFS`)
- 记录 A 变成了：`/put_old` -> 宿主机磁盘 (`/dev/sda1`)
    

当容器进程再次执行 `open("/bin/bash")` 时，VFS 从当前 `mnt_namespace` 的 `/` 开始解析，发现其映射到了 `OverlayFS`。于是，请求被路由到了 Ubuntu 镜像中。进程成功读取到了 Ubuntu 的 `bash` 文件。为了防止容器进程通过访问 `/put_old` 目录依然能看到宿主机的文件，容器引擎会紧接着执行最后一步： `umount("/put_old", MNT_DETACH)` 这会将包含宿主机文件系统的映射记录 A 从该 `mnt_namespace` 中彻底删除。至此，容器进程的挂载表中，再也没有任何一条路径可以路由到宿主机的底层设备上。文件系统的 VFS 隔离彻底完成。

**UTS Namespace (主机名与域名)**：主要就是为了隔离宿主机的主机名（hostname）。如果没有 UTS Namespace，比如说当容器里的进程尝试调用 `sethostname()` 系统调用来修改自己的主机名时，它会直接把宿主机的主机名给改了。这会导致宿主机上的日志系统、网络身份认证瞬间混乱。

### 连接与通信的隔离 (进程与谁通信)

这组 Namespace 负责切断进程与外界的默认数据交换渠道。

**Network Namespace (网络栈)**：最复杂的部分，会在子命名空间复制出一整个 TCP/IP 网络栈，隔离网络 Socket 通信，太复杂了，先跳过......
        
**IPC Namespace (进程间通信)**：主要就是将容器中的进程和宿主机的进程间通信进行隔离吧，比如 System V IPC（消息队列、信号量）和 POSIX 共享内存这些 IPC 方式。没有 IPC Namespace 时，容器 A 里的恶毒程序，可以去暴力猜测宿主机或其他容器的共享内存 ID，一旦猜中，就能直接读取甚至篡改别的进程在内存中的敏感数据。
        

### 环境与时间的隔离 (较新的特性)

**Cgroup Namespace (资源视图)**：隐藏宿主机的真实资源限制树。进程去读 `/sys/fs/cgroup` 时，只能看到自己被分配的那点资源，防止容器内的恶意程序去探测或修改全局的 CPU 或内存限制。

**Time Namespace (系统时间)**：允许容器拥有独立的时间线（偏移量）。比如宿主机是 2026 年，容器可以活在 2020 年。


## 如何创建 namespace

主要是通过两个 syscall：

- **方法一**：调用 `clone` 这个 syscall。内核在复制进程时，为新进程分配新 `task_struct` 的同时，调用 `create_new_namespaces()` 分配全新的 `nsproxy`。比如我们通过 Go 语言来调用一下 clone 这个 syscall

```go
package main

import (
	"os"
	"os/exec"
	"syscall"
	"github.com/fatih/color"
)

func main() {
	cmd := exec.Command("sh")
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Cloneflags: syscall.CLONE_NEWUTS | syscall.CLONE_NEWIPC |
			syscall.CLONE_NEWPID | syscall.CLONE_NEWNS |
			syscall.CLONE_NEWUSER | syscall.CLONE_NEWNET,
	}
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		panic(err)
	}
}

```
    
- **方法二**：调用 `unshare` 这个 syscall。不创建新进程，直接剥离当前进程旧的 `nsproxy`，换上新的。

## namespace 如何运行

那么当子 namespace 调用 syscall 的时候是如何工作的呢，来看下面这个 pid namesapce 的例子。当容器里的 Nginx 进程调用 `getpid()` 这个 syscall 想获取自己的 PID 时：

1. **发生 Trap**：Nginx 执行 `ecall` 或 `int 0x80`，CPU 陷入内核态。
2. **内核接管**：内核找到当前正在运行的进程的 `task_struct`。
3. **查 Namespace 映射**：内核**不是**直接把 `task_struct->pid` 这个字段（比如 8080）返回回去。相反，内核会顺着 `task_struct->nsproxy->pid_ns` 找过去。
4. **视角转换**：内核发现这个进程在一个独立的 PID Namespace 里，并且在这个 Namespace 的映射表里，真实的 PID `8080` 对应的虚拟 PID 是 `1`。
5. **返回虚拟 PID**：内核把 `1` 返回给 Nginx。

这里可能会有疑问：**为什么 kernel 不直接返回进程 pid，还需要查一遍 nsproxy 呢？** 这是因为为了支持 Namespace（尤其是 PID Namespace 可以一层套一层，比如宿主机跑 Docker，Docker 里还能再跑 Docker），一个进程不能只有一个 PID 了，它在不同的层级得有不同的编号。现在，当调用 `getpid()` 时，内核不再直接读那个单一的整数了，其逻辑变成了这样：

1. **先定位你是谁**：内核找到这个进程的特殊结构体（在源码里叫 `struct pid`，这已经不是个单纯的数字了，而是一个对象）。这个对象里存着一个**数组**，记录了你在每一层 Namespace 里的编号。比如：`[层级0(宿主机): 8080, 层级1(容器A): 1]`
2. **再看你在哪层空间**：这时候，内核就**必须**去查该进程的 `nsproxy` 了。它查这个是为了确认这个进程目前到底是在哪一层的
3. **按层级取值**：比如内核发现该进程在层级 1 的 PID Namespace 里。于是，内核就从上面那个数组里，把层级1对应的那个 PID 数字 `1` 抽出来，作为返回值。

## nsproxy / namesapce 到底是啥

`nsproxy` 本质就是一个路由器，用来在进程和操作系统全局资源之间添加一层代理，进程所发起的所有对资源的请求，都会到 nsproxy 走一层代理转发，再去访问系统全局资源。比如想访问全局 PID，那就通过 nsproxy->pid_ns 来导航到全局 PID 资源。

而 `namespace`，就是为一个进程本身（调用 unshare），或者创建出来的子进程（调用 clone），改变它的 usproxy，从而阻断它对真正的系统全局资源的访问，使其访问到的是容器引擎隔离虚拟出来给它的，比如 pid namespace，那就是让子进程想访问的全局 pid 资源，不是真正的 8080，而是 1。

# Cgroups 到底是啥

如果说 Namespaces 解决的是“进程能看到什么资源”的问题（限制访问范围），那么 Cgroups 解决的就是“进程能使用多少资源”的问题（限制物理开销）。它在物理层面的本质是：在操作系统的底层资源分配链路（如内存分配器、CPU 调度器、块设备 I/O 调度层）中，强制注入一套**基于特定数据结构的验证与拦截逻辑**。通过将一组进程（进程控制块 `task_struct`）与一组资源阈值数据进行指针绑定，使得当进程触发资源分配的系统调用或底层硬件中断时，内核必须先校验该阈值，从而决定是放行、限流还是直接物理终止进程。

```c

struct task_struct {
    // ... 省略 n 个字段 ...
    
    /* namespaces 代理指针 (视图隔离) */
    struct nsproxy *nsproxy;

    /* cgroups 代理指针 (资源限制) */
#ifdef CONFIG_CGROUPS
    struct css_set __rcu *cgroups;    /* <--- 核心：指向 Cgroup 子系统状态集合的指针 */
    struct list_head cg_list;
#endif
    // ...
};

```

`struct css_set` (Cgroup Subsystem State Set) 这个结构体的作用是将一个进程在不同的子系统中的具体状态指针打包在一起，比如一个进程可以属于 `memory` 的 A 组，同时属于 `cpu` 的 B 组，那么 `css_set` 就记录了整体的信息。

Cgroups 一个极其重要的点是，它是基于**伪文件系统**实现的，这和平常认为的文件系统就是用来管理磁盘中的数据不太一样。在前面我们说过 VFS 是一个抽象层，用来管理所有不同种类的文件系统，它定义了 `inode`、`dentry`、`super_block` 和 `file` 这四个对象。

- **真实文件系统 (如 ext4, XFS)：** 这些系统的底层驱动负责将 VFS 的对象，映射到物理块设备（如磁盘的扇区）上。平常写入的数据，最终被持久化到了硬盘介质中。
- **伪文件系统 (如 cgroupfs)：** 这些系统的底层驱动，将 VFS 的对象映射到了内核的内存数据结构（RAM）上。它们完全不连接任何物理存储介质。当对这些文件进行读写时，实际上是在直接读取或修改 kernel space 里的变量。

Cgroups 不仅要考虑其功能上的实现，即如何通过 Controller 实现对进程资源的控制，还要考虑如何将其提供给 user space 中的进程（比如容器引擎），使其可以去配置这些底层的限制参数，并关联具体的进程。Cgroups 并没有采取提供诸如 `sys_create_cgroup(name)` 这样的系统调用接口，而是复用现有的 VFS 体系，编写了一个名为 `cgroupfs` 的驱动模块，并将其挂载到 `/sys/fs/cgroup` 目录。VFS 层会拦截标准的 POSIX 文件操作（也就是 open，read 这些系统调用），并将其翻译为对内核 Cgroup 数据结构的操作。

来看一个通过最简单的 shell 操作 Cgroups 的过程：

1. 创建目录：用户态执行 `mkdir /sys/fs/cgroup/my_container`，触发 `sys_mkdir` 系统调用。 `cgroupfs` 驱动捕获此调用。它不会去硬盘上创建目录，而是调用 `kmalloc()` 在物理内存中分配一个全新的 `struct cgroup` 结构体，并初始化其内部的 c groups 和 task_struct 的双向链表。最后，在 VFS 内存树中生成对应的 `dentry`，让 user space 能够看到这个目录。
2. 写入文件：用户态执行 `echo 100000 > /sys/fs/cgroup/my_container/cpu.max`，触发 `sys_write` 系统调用。`cgroupfs` 驱动捕获此调用。它提取传入的字符串 `"100000"`，将其转换为整型数据。然后，顺着该节点绑定的 CPU  Controller 指针，找到底层的 `cfs_bandwidth` 结构体，直接将其内部的 `quota` 变量的值覆写为 100000。
3. 写入 PID：用户态执行 `echo 8080 > /sys/fs/cgroup/my_container/cgroup.procs`，触发 `sys_write` 系统调用。 `cgroupfs` 驱动将字符串 `"8080"` 转换为整数，在内核的全局 PID 映射表中查找到 8080 目标进程的 `task_struct` 内存地址。随后，直接修改该 `task_struct` 中的 `css_set` 指针，将其重新指向当前目录对应的 `struct cgroup` 实例。

## Cgroups 的分类

与 Namespace 分为 PID、Mount、Network 等类型一样，Cgroups 框架根据所限制的物理硬件资源不同，被划分为多个独立的子系统 Subsystem，或者在 Cgroups v2 中更新的叫法是控制器 Controller，体现对资源的控制。核心的控制器包括：

1. `cpu`：限制进程集合在 CPU 上的执行时间片配额（与 CFS 调度器强绑定）。
2. `cpuset`：将进程集合的执行严格绑定（Pin）到特定的物理 CPU 核心以及 NUMA 内存节点上。
3. `memory`：限制进程集合能够申请的物理内存页数量和 Swap 空间大小。若超限，内核直接针对该 Cgroup 触发 OOM Killer。
4. `blkio` (在 Cgroup V2 中称为 `io`)：限制进程集合对块设备（如物理磁盘）的读写吞吐量（BPS，字节/秒）和读写频率（IOPS，操作数/秒）。
5. `pids`：限制该组内允许存在的最大 `task_struct` 进程数量，这是防止由于恶意代码执行 Fork Bomb（进程炸弹）导致系统 PID 资源耗尽。
6. `freezer`：提供挂起（Suspend）和恢复（Resume）Cgroup 内所有进程执行状态的能力。
7. `devices`：控制进程集合对特定设备文件节点（如 `/dev/null`, `/dev/sda`）的读取、写入或创建（mknod）的访问权限。
    
## Controller 的实现机制

通过 Memory Controller 来看看 Controller 到底是如何实现的。当容器内的进程调用 `malloc` 分配内存并触发写操作时：

1. 触发缺页异常 (Page Fault)：硬件 MMU 发现虚拟地址没有映射物理内存，触发硬件中断，执行流陷入内核的缺页异常处理函数 `handle_mm_fault()`。
2. 物理页分配请求：内核准备取出一个 4KB 的物理页。
3. Cgroup 拦截检查 (`mm/memcontrol.c`)：在真正分配之前，内核代码会调用 `mem_cgroup_try_charge()` 函数。
4. 通过当前执行进程的 `task_struct -> cgroups (css_set) -> memory_css` 找到对应的 `struct mem_cgroup` 实例。    
5. 内核原子性地读取该 `mem_cgroup` 里的 `memory.current`（当前已使用字节数）并加上 4096（4KB）。将其与 `memory.max`（最大允许阈值）进行比较。
6. 如果通过，更新 `memory.current` 计数器，完成物理页分配，返回用户态；如果拒绝，拦截分配动作。内核会尝试回收该 Cgroup 内的缓存页。如果回收失败，直接触发针对该特定 Cgroup 的局部 OOM Killer，向该进程发送 `SIGKILL` 信号将其物理终止。

## 真实世界

直接来看看我本机的 cgroups 是什么情况，我们进入到 /sys/fs/cgroup 这个目录下，执行 ls：

```text

hasono@ubuntu:/sys/fs/cgroup$ ls -al
total 0
drwxr-xr-x  6 root root 0 May  1 14:31 .
drwxr-xr-x 14 root root 0 May  4 14:42 ..
drwxr-xr-x  2 root root 0 May  4 14:42 .lxc
-r--r--r--  1 root root 0 May  4 14:42 cgroup.controllers
-r--r--r--  1 root root 0 May  4 14:42 cgroup.events
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.freeze
--w-------  1 root root 0 May  4 14:42 cgroup.kill
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.max.depth
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.max.descendants
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.procs
-r--r--r--  1 root root 0 May  4 14:42 cgroup.stat
-r--r--r--  1 root root 0 May  4 14:42 cgroup.stat.local
-rw-r--r--  1 root root 0 May  1 14:32 cgroup.subtree_control
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.threads
-rw-r--r--  1 root root 0 May  4 14:42 cgroup.type
-rw-r--r--  1 root root 0 May  4 14:42 cpu.idle
-rw-r--r--  1 root root 0 May  4 14:42 cpu.max
-rw-r--r--  1 root root 0 May  4 14:42 cpu.max.burst
-r--r--r--  1 root root 0 May  4 14:42 cpu.stat
-r--r--r--  1 root root 0 May  4 14:42 cpu.stat.local
-rw-r--r--  1 root root 0 May  4 14:42 cpu.weight
-rw-r--r--  1 root root 0 May  4 14:42 cpu.weight.nice
-rw-r--r--  1 root root 0 May  4 14:42 cpuset.cpus
-r--r--r--  1 root root 0 May  4 14:42 cpuset.cpus.effective
-rw-r--r--  1 root root 0 May  4 14:42 cpuset.cpus.exclusive
-r--r--r--  1 root root 0 May  4 14:42 cpuset.cpus.exclusive.effective
-rw-r--r--  1 root root 0 May  4 14:42 cpuset.cpus.partition
-rw-r--r--  1 root root 0 May  4 14:42 cpuset.mems
-r--r--r--  1 root root 0 May  4 14:42 cpuset.mems.effective
drwxr-xr-x  2 root root 0 May  1 14:32 init.scope
-rw-r--r--  1 root root 0 May  4 14:42 io.max
-r--r--r--  1 root root 0 May  4 14:42 io.stat
-r--r--r--  1 root root 0 May  4 14:42 memory.current
-r--r--r--  1 root root 0 May  4 14:42 memory.events
-r--r--r--  1 root root 0 May  4 14:42 memory.events.local
-rw-r--r--  1 root root 0 May  4 14:42 memory.high
-rw-r--r--  1 root root 0 May  4 14:42 memory.low
-rw-r--r--  1 root root 0 May  4 14:42 memory.max
-rw-r--r--  1 root root 0 May  4 14:42 memory.min
-rw-r--r--  1 root root 0 May  4 14:42 memory.oom.group
-rw-r--r--  1 root root 0 May  4 14:42 memory.peak
--w-------  1 root root 0 May  4 14:42 memory.reclaim
-r--r--r--  1 root root 0 May  4 14:42 memory.stat
-r--r--r--  1 root root 0 May  4 14:42 memory.swap.current
-r--r--r--  1 root root 0 May  4 14:42 memory.swap.events
-rw-r--r--  1 root root 0 May  4 14:42 memory.swap.high
-rw-r--r--  1 root root 0 May  4 14:42 memory.swap.max
-rw-r--r--  1 root root 0 May  4 14:42 memory.swap.peak
-r--r--r--  1 root root 0 May  4 14:42 pids.current
-r--r--r--  1 root root 0 May  4 14:42 pids.events
-r--r--r--  1 root root 0 May  4 14:42 pids.events.local
-rw-r--r--  1 root root 0 May  4 14:42 pids.max
-r--r--r--  1 root root 0 May  4 14:42 pids.peak
drwxr-xr-x 13 root root 0 May  4 14:35 system.slice
drwxr-xr-x+  3 root root 0 May  1 14:32 user.slice
```

可以看见这台 Ubuntu 正在运行原生的 Cgroup v2（统一层级结构），并且底层由 systemd 担任 Cgroup 的全局根管理器。在早期的 Cgroup v1 中，CPU、内存等控制器是相互独立挂载的（比如 `/sys/fs/cgroup/cpu` 和 `/sys/fs/cgroup/memory`）。但在 Cgroup v2 中所有控制器全部平铺在同一个目录下。在内存中，这代表当前目录（`/sys/fs/cgroup`）对应着一个全局唯一的根 `struct cgroup` 结构体实例。这台机器上的所有进程（`task_struct`），只能在这唯一的一棵树上被分配。