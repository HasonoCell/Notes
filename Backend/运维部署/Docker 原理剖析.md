
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

可以看见，Namespace 本身是静态的数据结构，那么当子命名空间调用 syscall 的时候 Namespace 到底是如何隔离的呢，来看下面这个例子。当容器里的 Nginx 进程调用 `getpid()` 这个 syscall 想获取自己的 PID 时：

1. **发生 Trap**：Nginx 执行 `ecall` 或 `int 0x80`，CPU 陷入内核态。
    
2. **内核接管**：内核找到当前正在运行的进程的 `task_struct`。
    
3. **查 Namespace 映射**：内核**不是**直接把 `task_struct->pid`（比如 8080）返回回去。相反，内核会顺着 `task_struct->nsproxy->pid_ns` 找过去。
    
4. **视角转换**：内核发现这个进程在一个独立的 PID Namespace 里，并且在这个 Namespace 的映射表里，真实的 PID `8080` 对应的虚拟 PID 是 `1`。
    
5. **返回虚拟 PID**：内核把 `1` 返回给 Nginx。

这里可能会有疑问：**为什么 kernel 不直接返回进程 pid，还需要查一遍 nsproxy 呢？** 这是因为为了支持 Namespace（尤其是 PID Namespace 可以一层套一层，比如宿主机跑 Docker，Docker 里还能再跑 Docker），一个进程不能只有一个 PID 了，它在不同的层级得有不同的编号。现在，当调用 `getpid()` 时，内核不再直接读那个单一的整数了，其逻辑变成了这样：

1. **先定位你是谁**：内核找到这个进程的特殊结构体（在源码里叫 `struct pid`，这已经不是个单纯的数字了，而是一个对象）。这个对象里存着一个**数组**，记录了你在每一层 Namespace 里的编号。比如：`[层级0(宿主机): 8080, 层级1(容器A): 1]`
        
2. **再看你在哪层空间**：这时候，内核就**必须**去查该进程的 `nsproxy` 了。它查这个是为了确认这个进程目前到底是在哪一层的
    
3. **按层级取值**：比如内核发现该进程在层级 1 的 PID Namespace 里。于是，内核就从上面那个数组里，把层级1对应的那个 PID 数字 `1` 抽出来，作为返回值。