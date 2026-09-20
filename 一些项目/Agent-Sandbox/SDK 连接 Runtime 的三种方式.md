# SDK 连接 Sandbox Runtime 的三种方式

这篇笔记专门解释 SDK 如何把请求送到 Sandbox Pod 里的 Runtime。重点是 Go SDK
当前定义的三种通用连接方式：

```text
ConnectivityPortForward
ConnectivityInClusterService
ConnectivityInClusterPodIP
```

它们解决的是同一个问题：SDK 已经通过 Kubernetes API 创建或领取了一个 Sandbox，
现在要执行命令、读写文件，应该怎样把请求送到 Sandbox 内部的 Runtime。

## 先分清控制面和数据面

SDK 使用 Sandbox 时实际上有两条通道：

```text
控制面：SDK ──► Kubernetes API ──► SandboxClaim / Sandbox

数据面：SDK ──► 连接方式 ──► Sandbox Pod 中的 Runtime
```

控制面负责：

- 创建 `SandboxClaim`；
- 等待 Claim 绑定到 Sandbox；
- 等待 Sandbox 进入 `Ready=True`；
- 读取 Sandbox 的 Pod 名称、Pod IP 和 Service FQDN；
- 删除 Claim，触发 Sandbox 的回收。

数据面负责：

- 执行命令；
- 上传和下载文件；
- 列出目录；
- 访问 Runtime 的 REST 或 gRPC API。

例如：

```python
sandbox = client.create_sandbox(
    warmpool="python-pool",
    namespace="default",
)

sandbox.commands.run("echo hello")
sandbox.files.read("result.txt")
```

`create_sandbox()` 主要使用控制面；`commands.run()` 和 `files.read()` 才会使用
数据面。三种连接方式只改变数据面路径，SandboxClaim 和 Sandbox 的生命周期管理
仍然需要 Kubernetes API。

## Runtime 的两个接口

旧的 `python-runtime` 主要提供一个 HTTP 接口，默认端口是 8888：

```text
HTTP 8888
├── /execute
├── /upload
├── /download
└── /list /exists
```

新的 `sandboxd` 是混合接口：

```text
REST 8080
├── 文件读写
├── 目录操作
└── Runtime HTTP API

gRPC 9090
└── ProcessService：进程和命令执行
```

因此，对于旧 Runtime，连接策略通常只需要产生一个 HTTP `baseURL`；对于
`sandboxd`，连接策略需要同时产生：

```text
REST base URL：例如 http://host:8080
gRPC target：  例如 host:9090
```

后面的 SDK 逻辑可以复用同一个 Connector：文件操作使用 REST 地址，命令操作
使用 gRPC 地址。

## 三种方式的总览

假设 Sandbox 名称为 `agent-1`，namespace 为 `default`，并且 Pod 中运行着
`sandboxd`：

```text
Port-forward
SDK ──► Kubernetes API Server ──► Sandbox Pod

Service DNS
SDK Pod ──► Sandbox Service ──► Sandbox Pod

Pod IP
SDK Pod ──► Sandbox Pod IP
```

三种方式最后都会到达同一个 Runtime，只是中间的“路”不同。

| 方式 | SDK 需要的地址或资源 | 是否经过 API Server | 是否需要 Service | 典型场景 |
| --- | --- | --- | --- | --- |
| Port-forward | Sandbox Pod 名称 | 数据流量经过 | 否 | 本地电脑、CI、没有 Pod 网络权限 |
| Service DNS | `Status.ServiceFQDN` | 数据流量不经过 | 是 | 集群内正式应用、需要稳定身份 |
| Pod IP | `Status.PodIP` | 数据流量不经过 | 否 | 集群内简单直连、无需创建 Service |

## 第一种：Port-forward

### 使用场景

你在自己的电脑上运行 SDK，电脑不能直接访问 Kubernetes Pod 网络，但拥有可用的
kubeconfig：

```go
sandbox, err := client.NewSandbox(ctx, sandbox.Options{
	Runtime:      sandbox.RuntimeSandboxd,
	Connectivity: sandbox.ConnectivityPortForward,
})
```

这是 Go SDK 的默认连接方式。

### Go SDK 的实现步骤

对于 `sandboxd`，Go SDK 的 `podTunnelStrategy` 大致执行下面的步骤：

```text
1. 从 Sandbox Status 得到 Pod 名称
2. 构造 Kubernetes Pod portforward 子资源请求
3. 使用 client-go 创建 SPDY 流
4. 申请两个随机本地端口
5. 本地端口分别转发到 Pod:8080 和 Pod:9090
6. 等待两个转发端口都 Ready
7. 保存 REST URL 和 gRPC target
8. 后台监控 port-forward 是否意外退出
```

对应的 Kubernetes API 请求类似：

```text
POST /api/v1/namespaces/default/pods/agent-1/portforward
```

可能建立出这样的本地转发：

```text
127.0.0.1:43121 ──► agent-1 Pod:8080
127.0.0.1:43122 ──► agent-1 Pod:9090
```

所以 Connector 保存：

```text
REST base URL：http://127.0.0.1:43121
gRPC target：  127.0.0.1:43122
```

一次文件读取的路径是：

```text
sandbox.files.read("hello.txt")
        │
        ▼
127.0.0.1:43121
        │
        ▼
Kubernetes API Server 的 port-forward 隧道
        │
        ▼
agent-1 Pod:8080
        │
        ▼
sandboxd REST API
```

一次命令执行的路径只把端口换成 gRPC：

```text
sandbox.commands.run("ls -la")
        │
        ▼
127.0.0.1:43122
        │
        ▼
Kubernetes API Server 的 port-forward 隧道
        │
        ▼
agent-1 Pod:9090
        │
        ▼
sandboxd ProcessService
```

旧的 `python-runtime` 使用类似的 port-forward 思路，但数据目标通常是
`sandbox-router`。Router 再根据 `X-Sandbox-ID` 和 namespace 找到目标 Sandbox。

```text
旧 Runtime：SDK ──► API Server port-forward ──► sandbox-router ──► Sandbox

sandboxd：  SDK ──► API Server port-forward ──► Sandbox Pod ──► sandboxd
```

### 连接断开和清理

Go SDK 会监控 port-forward 的后台 goroutine。如果隧道意外退出，Connector 会记录
连接错误，后续请求可以重新建立连接。关闭 Sandbox 句柄时，SDK 会：

```text
停止 port-forward
关闭 SPDY 连接
关闭 gRPC channel
关闭 HTTP client
```

Python SDK 当前的 `SandboxdPodTunnelConnectionConfig` 也是这个思路，不过 Python
实现使用 `kubectl port-forward` 子进程，并把 REST 和 gRPC 端口分别转发到两个本地
端口。

## 第二种：Service DNS

### 使用场景

现在假设 SDK 运行在集群中的 Ray Worker Pod 里：

```text
ray-worker-1
```

Sandbox Template 开启了 Service：

```yaml
spec:
  service: true
```

Go SDK 可以使用：

```go
sandbox, err := client.NewSandbox(ctx, sandbox.Options{
	Runtime:      sandbox.RuntimeSandboxd,
	Connectivity: sandbox.ConnectivityInClusterService,
})
```

### SDK 如何找到地址

Sandbox Ready 后，controller 会把 Service 信息写入 Sandbox Status，例如：

```yaml
status:
  serviceFQDN: agent-1.default.svc.cluster.local
```

SDK 的 `inClusterStrategy` 读取这个 FQDN，然后直接拼出两个地址：

```text
REST：http://agent-1.default.svc.cluster.local:8080
gRPC：agent-1.default.svc.cluster.local:9090
```

SDK 不需要创建 Service，也不需要启动代理进程。Service 是 Sandbox controller
根据 `spec.service: true` 创建的。

### 实际请求路径

```text
Ray Worker Pod
        │
        │ DNS 查询 agent-1.default.svc.cluster.local
        ▼
Sandbox Service
        │
        │ Service selector 选择 agent-1 Pod
        ▼
agent-1 Pod:8080 / 9090
        │
        ▼
sandboxd REST / gRPC
```

文件请求：

```text
ray-worker-1
  → agent-1.default.svc.cluster.local:8080
  → sandboxd REST
```

命令请求：

```text
ray-worker-1
  → agent-1.default.svc.cluster.local:9090
  → sandboxd ProcessService
```

### 为什么 Service DNS 更适合正式集群

Service 提供了比 Pod IP 更稳定的身份：

```text
agent-1 Service
        │
        ├── 当前 Pod 被删除
        ├── 新 Pod 被创建
        └── Service 继续选择属于 agent-1 的新 Pod
```

如果 Sandbox 被删除，它的 Service 也会被删除，连接会失败，而不会自然地落到
另一个 Sandbox 上。

Go SDK 在 Service 模式下如果读不到 `Status.ServiceFQDN`，会直接返回错误：

```text
cannot address it by DNS
```

它不会偷偷改用 Pod IP。这样调用者选择的连接语义不会被静默改变。

## 第三种：Pod IP

### 使用场景

SDK 仍然运行在集群内，但你不想为每个 Sandbox 创建 Service：

```go
sandbox, err := client.NewSandbox(ctx, sandbox.Options{
	Runtime:      sandbox.RuntimeSandboxd,
	Connectivity: sandbox.ConnectivityInClusterPodIP,
})
```

### SDK 如何找到地址

Sandbox Status 中通常会有：

```yaml
status:
  podIP: 10.244.1.23
```

SDK 直接把 Pod IP 和 Runtime 端口组合起来：

```text
REST：http://10.244.1.23:8080
gRPC：10.244.1.23:9090
```

整个数据路径就是：

```text
Ray Worker Pod
        │
        ├── 10.244.1.23:8080 → sandboxd REST
        │
        └── 10.244.1.23:9090 → sandboxd gRPC
```

这种模式不需要 Service，也不需要 port-forward。前提是发起请求的 Pod 能够访问
目标 Pod 的网络地址。

### Pod IP 的风险

Pod IP 是临时地址，可能被重新分配：

```text
1. agent-1 Pod 获得 10.244.1.23
2. agent-1 Pod 被删除
3. 另一个 Pod 获得 10.244.1.23
4. 仍缓存旧地址的客户端继续发请求
```

因此，Pod IP 模式适合网络边界明确、客户端和 Sandbox 处于同一可信环境的场景。
跨租户或需要更强目标身份保证时，应优先使用 Service DNS。

和 Service 模式一样，Go SDK 读取不到 Pod IP 时会报错，不会偷偷退回另一种地址。

## Connector 如何同时管理 REST 和 gRPC

三种策略最终都实现同一个连接接口：

```go
type ConnectionStrategy interface {
    Connect(ctx context.Context) (baseURL string, err error)
    Close() error
}
```

`Connect()` 负责准备 HTTP 地址；如果 Runtime 是 sandboxd，策略还会把 gRPC 地址
交给 Connector：

```text
ConnectionStrategy
        │
        ├── 返回 REST baseURL
        │       └── connector.baseURL
        │
        └── 设置 gRPC target
                └── connector.grpcTarget
```

随后不同的 SDK 操作选择不同协议：

```text
文件操作
  └── HTTP REST → baseURL:8080

命令操作
  └── gRPC     → grpcTarget:9090
```

gRPC channel 通常是延迟创建的。只有第一次需要执行 sandboxd 命令时，Connector
才根据 `grpcTarget` 创建 gRPC client。若 port-forward 重连并产生了新的本地端口，
旧 channel 会被关闭，下一次请求会连接新的 target。

## 旧 Runtime 和 sandboxd 的差异

连接方式的概念相同，但数据端点不同：

```text
旧 python-runtime：

Port-forward       → HTTP 8888
Service DNS        → HTTP 8888
Pod IP             → HTTP 8888

sandboxd：

Port-forward       → REST 8080 + gRPC 9090
Service DNS        → REST 8080 + gRPC 9090
Pod IP             → REST 8080 + gRPC 9090
```

旧 Runtime 经过 sandbox-router 时，SDK 需要提供 Router 用来定位 Sandbox 的请求
头，例如 `X-Sandbox-ID` 和 `X-Sandbox-Namespace`。集群内直连时不经过 Router，
这些 Router 专用请求头不会被注入。

对于 sandboxd，Router 不是命令执行和文件操作的必经路径。Go SDK 可以直接连
sandboxd 的两个端口；Python SDK 目前主要提供 `SandboxdPodTunnelConnectionConfig`，
而在集群内通过 Service DNS 或 Pod IP 直接连接 sandboxd，正是
[#1686](https://github.com/kubernetes-sigs/agent-sandbox/issues/1686) 希望补齐的能力。

## Gateway 和 Direct URL 放在哪里

Python SDK 文档还会提到 Gateway 和 Direct URL。它们和 Go SDK 的三种
`Connectivity` 不是完全同一层的概念。

### Gateway

Gateway 是外部访问 Router 的入口：

```text
外部 SDK
   │
   ▼
Gateway / Load Balancer
   │
   ▼
sandbox-router
   │
   ▼
Sandbox Pod
```

它主要服务于集群外的客户端。Go SDK 通过 `GatewayName` 发现 Gateway 地址；Python
SDK 使用 `SandboxGatewayConnectionConfig`。

### Direct URL

Direct URL 只是让调用者直接提供一个 URL：

```python
SandboxDirectConnectionConfig(
    api_url="http://sandbox-router-svc.agent-sandbox-system.svc.cluster.local:8080"
)
```

它跳过的是地址发现，不一定代表一种新的底层传输机制。这个 URL 可以指向 Router，
也可以在特定配置下指向 Runtime。

因此，学习三种基础 Runtime 连接方式时，可以先记住：

```text
Port-forward = 通过 Kubernetes API 建立隧道
Service DNS   = 通过 Sandbox Service 名称直连
Pod IP        = 通过 Sandbox Pod IP 直连
```

## Python SDK 当前状态与 #1686

Python SDK 对旧 `python-runtime` 已支持多种入口：

```text
Gateway Mode
Local Tunnel Mode
In-Cluster Mode
Direct URL Mode
```

但针对 `sandboxd`，当前主要配置是：

```python
SandboxdPodTunnelConnectionConfig(
    rest_port=8080,
    grpc_port=9090,
)
```

它会直接对 Sandbox Pod 做 port-forward，同时取得 REST 和 gRPC 两个本地端口。

因此 #1686 的具体目标不是让 Python SDK 从“完全不能连接 sandboxd”变成“可以
port-forward”，而是让它补齐 Go SDK 已经拥有的集群内直连能力：

```text
Python SDK Pod → Sandbox Service DNS → sandboxd REST / gRPC

Python SDK Pod → Sandbox Pod IP      → sandboxd REST / gRPC
```

具体的公开 API 还需要在实现时决定：可以设计成两个 typed config，也可以使用一个
配置对象加上显式的 `service-dns` / `pod-ip` mode。无论采用哪种命名，都应满足：

- 调用者明确选择连接模式；
- Service DNS 和 Pod IP 不能静默互相 fallback；
- REST 文件操作和 gRPC 命令执行必须使用同一种目标地址；
- sync 和 async Python SDK 行为保持一致；
- 现有 port-forward 配置继续兼容。

## 选择方式的记忆方法

```text
你在集群外，没有 Pod 网络：
    Port-forward

你在集群内，希望连接身份稳定：
    Service DNS

你在集群内，只想直接访问 Pod：
    Pod IP
```

把这三种方式放在一起，SDK 的核心工作可以概括为：

```text
Claim / Sandbox Ready
          │
          ▼
读取 Pod 名称、Service FQDN 或 Pod IP
          │
          ▼
选择 ConnectionStrategy
          │
          ├── 生成 REST baseURL
          └── 生成 gRPC target（sandboxd）
          │
          ▼
Connector 复用同一套文件和命令 API
```
