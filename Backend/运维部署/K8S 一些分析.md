
# 总览

先来看看 k8s 的一些核心概念

* **Pod（容器组）**：K8s 中能够创建和调度的最小计算单元。一个 Pod 并不是一个容器，而是包含一个或多个紧密相关的容器。同一个 Pod 中的容器共享网络 IP 和存储卷，它们通常被部署在同一台物理机或虚拟机上（Node）。
* **Node（节点）**：运行 K8s 工作负载的机器（可以是物理机或虚拟机）。一个 Node 可以部署多个 Pod，集群（Cluster）通常由多个 Node（既包含 worker 又包含 master） 组成。
* **Deployment（部署）**：用于声明应用的期望状态（比如“我需要这个应用同时运行 3 个副本”）。K8s 的控制器会自动监控并维持这个状态，如果某个 Pod 崩溃了，Deployment 会自动启动一个新的 Pod 来替换它。
* **Service（服务）**：因为 Pod 是极其脆弱的（随时可能被销毁重建），它们的 IP 地址是动态变化的。Service 提供了一个统一的入口地址和负载均衡机制，让你可以稳定地访问后端的一组 Pod，而无需关心具体的 Pod IP。
* **Namespace（命名空间）**：用于在一个物理集群中划分出多个虚拟集群。通常用来隔离不同的环境（如 `dev` 开发、`test` 测试、`prod` 生产），或者隔离不同团队的资源。
* **ConfigMap 和 Secret**：用于将配置文件或敏感信息（如数据库密码、证书）与容器镜像解耦，方便统一管理和注入到 Pod 中。

在一个集群之中，Deployment 主要管理集群中的内部计算资源（Pod），Service 主要对外提供一个统一的网络接口。Deployment 只保证该集群里永远有 N 个一模一样的 Pod 在运行，如果某一个 Pod 崩溃了，就自动拉起新的 Pod。在 K8s 的网络底层，Pod 是极其短命且不可靠的。每次 Deployment 重新拉起一个 Pod，底层的网络插件（CNI）都会给这个新 Pod 分配一个全新的、随机的 IP 地址。这就是为什么还需要 Service，它为集群提供一个永远不变的 IP 和端口，通过 Label 识别 Pod 并把流量分发给集群中的 Pod，实现负载均衡。

```yaml

# Deployment 
apiVersion: apps/v1
kind: Deployment
metadata:
    name: my-web-app
spec:
    replicas: 3 # 我们声明需要 3 个 Nginx 副本
    selector:
        matchLabels:
            app: nginx
    template:
        metadata:
            labels:
                app: nginx # 给这些 Pod 贴上标签，方便后面寻找
        spec:
            containers:
                - name: nginx
                  image: docker.m.daocloud.io/library/nginx:alpine
                  ports:
                      - containerPort: 80

---
# Service 
apiVersion: v1
kind: Service
metadata:
    name: my-web-service
spec:
    type: NodePort # 允许从宿主机直接访问
    selector:
        app: nginx # 重点：Service 会自动把流量打给所有带有 app:nginx 标签的 Pod
    ports:
        - port: 80
          targetPort: 80
          nodePort: 30080 # 我们在宿主机上暴露的端口

```


K8s 采用的是主从架构，一个集群主要分为控制平面（Master Node）和工作节点（Worker Node）两大部分。

Master Node 负责全局决策、响应集群事件以及调度。

* **kube-apiserver**：相当于一个集群的网关（类似于 nginx 吧）。所有的组件交互以及外部客户端（如命令行工具 `kubectl`）的操作，都必须通过 API Server 进行。
* **etcd**：一个高可用、强一致性的键值存储数据库。作为集群的最终事实来源，保存了整个集群的所有状态数据和配置信息。
* **kube-scheduler**：负责“相亲分配”。它会监控新创建但尚未分配运行节点的 Pod，并根据 CPU/内存需求、硬件约束等条件，将 Pod 调度到最合适的工作节点上。
* **kube-controller-manager**：内部包含了多种控制器（如节点控制器、副本控制器等），不断循环对比集群的“当前状态”和“期望状态”，并努力将当前状态调节至期望状态。

Worker Node 负责真正运行容器化的应用。

* **kubelet**：每个 worker node 上最重要的主管进程，接收 master node 的指令，负责管理节点上所有 Pod 的生命周期，确保容器健康运行。
* **kube-proxy**：维护节点上的网络规则。它实现了 K8s Service 的网络代理功能，负责将流量正确地路由和负载均衡到对应的 Pod 上。
* **Container Runtime**：负责拉取镜像和真正运行容器的底层软件。K8s 支持多种遵循 OCI 标准的运行时，如 containerd、CRI-O 和 Docker。

我们平常在 worker node 上主要就通过 `kubectl` 命令控制一个集群以及所属节点。

![](assets/K8S%20一些分析/file-20260515110414998.png)

# 一些底层原理

## Pod

Pod 本质上就是共享 name space 的容器组，比如我们按照下面这个配置文件 `kubectl apply -f demo-pod.yaml` 启动一个 pod，可以通过 `kubectl get pods -w` 查看多个 pod 状态：

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: hardcore-pod
spec:
  containers:
  - name: web-server
    image: nginx:alpine
  - name: debug-shell
    image: busybox:latest
    command: ["sleep", "3600"]
```

然后我们可以通过 k8s 官方提供的 `crictl` 命令来在 node 上检查和调试容器运行时、镜像以及容器的运行状态。如果我们执行 `sudo crictl ps -a | grep hardcore-pod` 查看我们启动的 pod 中的容器进程状态，除了我们启动的业务容器，k8s 还自动启动了一个 `k8s.gcr.io/pause` 容器。当 k8s 启动一个 pod 时，kubelet 首先拉起一个极小的永远 `sleep` 的 C 语言程序（即 pause 容器）。kubelet 为这个 pause 容器创建了全新的 network namespace 和 ipc namespace。接着，kubelet 拉起通过配置文件声明的业务容器（比如我们上面声明的 nginx 和 busybox）。kubelet **不会为它们创建新的网卡和网络隔离**，而是直接使用 `setns` 系统调用（因为业务容器进程不是 pause 容器进程通过 clone/fork 创建的，不共享 ns），把业务容器的 namespace 设置为 pause 容器的 network namespace。最后在这个 pod 里，不同的业务容器仿佛运行在同一台物理机上，它们可以通过 `127.0.0.1` 直接互相通信，共享同一个 MAC 地址和 IP。

这里所谓的 infra 容器**仅限于**实现 CRI 接口的是 Docker，即 dockershim；如果是别的容器引擎实现的 CRI，比如 Kata Containers，它的 CRI 实现就会直接创建出一个轻量级虚拟机来充当 Pod。

![](assets/K8S%20一些分析/file-20260515110414999.png)

# Informer

Informer 可以说是 k8s 中一个非常重要的 package 了，和 api-server，contoller- manager，scheduler 这些组件不同，informer 不作为一个独立的组件存在，也就是说不会单独运行一个所谓的 informer 进程，它本质上是 client-go 这个包中的子包，所以要想搞清楚 informer，还得先弄清楚 client-go。

我们知道一个 k8s 集群中，只有 api-server 才能访问存储整个集群状态的 etcd，client-go 就是 k8s 官方提供的一套专门用来与 api-server 通信的 sdk。而 client-go 中，client-go/kubernete/clientset.go 就封装了与 api-server 通信的各种方法，比如你可以这么使用：
```go
pod, err := clientset.CoreV1().Pods("default").Get(context.TODO(), "nginx-pod", metav1.GetOptions{})
```

所以，只要涉及到与 api-server 进行网络通信，无论是 worker node 上的 kubelet 组件，还是 master node 上的 controller-manager，scheduler 组件，都会使用 client-go 这个 sdk，也就自然用上了马上要分析的 informer 了。

而对于 infomer，用前端做比喻，其实就很像 tanstack-query 做的事情：优化请求，管理缓存。试想，如果 controller 想通过 api-server 获取存储在 etcd 中的 pods 信息，如果单纯采用 polling 轮询的方式去做，并发量一高，api-server 很容易被冲垮。

informer 通过 list-watch 机制从 api-server 实时获取资源对象的变更，并在本地维护一份带有索引的缓存，从而实现资源状态的高效监听与快速查询，同时大幅减轻 api-server 的访问压力。所以，informer 本质是 k8s 实现的一个**极致优化的本地内存缓存 + 异步事件分发器**。

接下来，我们通过“**启动一个 controller 监听 pods 状态**”这么个场景，来看看 informer 下的几个核心组件是如何工作的。

## Reflector

controller 一被启动，`reflector` 会向 api-server 发送一个 `GET /api/v1/pods` 请求。api-server 会把当前集群里的（比如）100 个 pod 数据全部发过来，这就是 List 阶段。此后请求来的数据被用来初始化本地缓存。随后 `reflector` 马上发起一个带有 `?watch=true` 和 `resourceVersion=xxx` 的 HTTP 请求，此时，TCP 连接不再断开，进入死等状态，这就是 Watch 阶段。

## DeltaFIFO

如果有人通过 kubectl 创建了一个新的 pod。api-server 顺着刚才 Watch 阶段的长连接，把这段 JSON 推给了此 pod 所属 controller 的 `reflector`。`reflector` 收到 JSON 后，把它包装成一个增量对象（例如：`事件类型: Added, 数据: Pod 1001`），然后立刻把它塞进 `DeltaFIFO`（增量先进先出队列）里。
    
之所以有这么个增量队列，是因为 `reflector` 必须马上回去继续处理属于此 controller 的网络请求，不能被后面的处理卡住，所以扔进队列是最好的解耦，这也是 `DeltaFIFO` 对于 `reflector` 的重要性。

## Indexer 与 EventHandler

`informer` 会开启一个死循环，不断从 `DeltaFIFO` 里把事件拿出来（Pop）。拿出来之后，它会严格按照顺序做**两件事**：先调用 `indexer`，把增量对象的数据真正写入到本地的内存缓存里。缓存更新完毕后，立刻触发在代码里注册的 `event handler` 回调函数 `AddFunc(obj)`，回调函数会将对应的业务逻辑推入 WorkQueue 而不是直接执行业务逻辑，所以 Informer 的任务在业务逻辑被推入 WorkQueue 后就结束了。这再次印证了 Informer 的本质：**缓存管理和异步解耦**。

为什么将业务逻辑推入 WorkQueue 中而不是由 Informer 直接执行呢？假设一个 Added 的业务逻辑，如果直接在 AddFunc 里写新增 Pod 的业务逻辑，可能会面临：

```go
informer.AddEventHandler(cache.ResourceEventHandlerFuncs{
    AddFunc: func(oldObj, newObj interface{}) {
        // 1. 尝试连接底层容器引擎... (可能需要 2 秒)
        // 2. 拉起网络... (可能需要 3 秒)
        // 3. 极有可能因为网络抖动失败！
        setupContainer(newObj) 
    },
})
```

一旦业务逻辑执行时间一长，后续从 api-server 发送给 controller 的请求就会在 informer 中阻塞，不断堆积最后 OOM。所以设计上 informer 选择将实际的业务逻辑执行解耦给了 workqueue，自己只负责将任务推进去。所以，**informer 和 workqueue 是 client-go 中两个不同的组件**。
    

## Reconcile Loop

其实这里已经不算是 informer 的内容了，但是我们还是来看看任务被推入 workqueue 后发生了什么。controller 会启动几个 worker goroutine，在一个死循环里不断从 workqueue 取出 key。worker 拿到了 key 后，直接通过 key 查 `indexer` 缓存，拿到了最新的 pod 数据，对比期望状态，最后启动容器，准备 CNI。执行成功后，把 key 从队列里标记完成（done）。

---

这篇文章讲的很不错：[Title Unavailable \| Site Unreachable](https://github.com/rfyiamcool/notes/blob/main/kubernetes_client_go_informer.md)

# 一个 Pod 是如何被创建的

问了一下 Gemini，答得比较满意～

---

**你通过 `kubectl` 提交了一个要跑 1 个副本的 Deployment YAML。**

API Server 收到请求后，仅仅是把这个 Deployment 的配置存进了 etcd。接下来，整个集群的“连锁反应”开始，Informer 开始疯狂运转：

## 阶段一：Controller

Controller 进程的内存里，跑着一个监听 Deployment 的 Informer。

1. **Reflector**：通过与 API Server 的长连接，瞬间“Watch”到 etcd 里多了一个 Deployment 记录。它立刻把这段 JSON 数据拉回本地。
    
2. **DeltaFIFO**：Reflector 将这个 `Added` 事件打包，塞进 Controller 内存中的 DeltaFIFO 增量队列排队。
    
3. **Indexer**：Informer 从队列中取出事件，**第一步**，先将这个新 Deployment 的数据更新到 Controller 的本地内存 Indexer 中。
    
4. **EventHandler & WorkQueue**：**第二步**，触发 `AddFunc` 回调。回调函数只做一件事：把这个 Deployment 的 Key（比如 `default/my-deploy`）塞入工作队列。
    
5. **执行发包 (Worker)**：Controller 的干活协程从队列拿到 Key，反向去 Indexer 查出现状（副本数为 0），对比期望（副本数为 1）。它立刻向 API Server 发起一个真正的 HTTP POST 请求：**“给我创建一个 Pod 数据结构！”**
    
    _(注：此时创建出的 Pod 记录在 API Server 里，其 `nodeName` 字段为空 `""`，状态为 `Pending`)_
    
## 阶段二：Scheduler

Scheduler 进程的内存里，跑着一个监听 Pod 的 Informer。它的 Reflector 做了一层过滤，只盯 `nodeName==""` 的对象。

1. **Reflector**：API Server 里刚存入 Controller 申请的那个空壳 Pod，Scheduler 的 Reflector 立刻通过长连接“Watch”到了这个新 Pod。
    
2. **DeltaFIFO**：事件被扔进 Scheduler 内部的增量队列排队。
    
3. **Indexer**：从队列取出后，更新 Scheduler 自己的本地内存缓存。此时 Scheduler 的 Indexer 里多了一个待调度的 Pod。
    
4. **EventHandler & WorkQueue**：触发 `AddFunc` 回调，将该 Pod 的 Key 塞入 Scheduler 的调度队列中。
    
5. **执行发包 (Worker)**：Scheduler 的核心调度算法协程从队列拿到 Key，去 Indexer 查出该 Pod 的需求参数。然后对比内存中各个 Worker Node 的资源状态，计算最终该去哪个 Node（Predicate -> Priority 两阶段），最后决定把 Pod 放到 `Node-A`。最后，它向 API Server 发起一个 HTTP POST (**Bind** 请求)：**“把这个 Pod 的 nodeName 字段改成 Node-A！”**

## 阶段三：Kubelet

在远端物理机 `Node-A` 上，Kubelet 进程的内存里也跑着一个监听 Pod 的 Informer。它的过滤条件是：只盯 `nodeName=="Node-A"` 的对象。

1. **Reflector**：API Server 刚把 Pod 的 nodeName 改为 `Node-A`，这台物理机上的 Reflector 立刻就收到了长连接的推送。
    
2. **DeltaFIFO**：事件被扔进 Kubelet 内部的增量队列缓冲。
    
3. **Indexer**：从队列取出后，更新 Kubelet 的本地缓存。此时，Kubelet 确信 API Server 真的分派了一个属于自己的任务。
    
4. **EventHandler & WorkQueue**：触发回调，将该 Pod 的 Key 塞进 Kubelet 的内部处理队列（通常叫 `syncLoop` 队列）。
    
5. **执行发包 (Worker)**：Kubelet 的 Worker 协程取出 Key，从本地 Indexer 拿到 Pod 的详细参数（要拉什么镜像，配什么网络）。它不再请求 API Server，而是**直接向下调用本机的 CRI（容器运行时，比如你写的 Covet）和 CNI（网络插件）**，在 Linux 内核里执行真正的 `clone`、`setns`、`iptables` 操作，最终拉起真实的容器进程！