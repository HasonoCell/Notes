# SDK、Sandbox Router 与 Sandbox Runtime 连接笔记

这篇笔记梳理外部应用如何通过 SDK 创建 Sandbox，以及命令和文件请求如何经过
Sandbox Router 到达 Kubernetes 集群中的 Sandbox Pod。

## 一句话结论

SDK 使用两条相互独立的链路：

```text
控制面：SDK ──► Kubernetes API ──► SandboxClaim / Sandbox
数据面：SDK ──► Sandbox Router ──► Sandbox Pod 中的 Runtime
```

Sandbox CRD 负责描述和管理生命周期，不能接收命令请求。真正执行命令的是 Pod
里的 Runtime；Router 只负责把请求送到正确的 Runtime。

## 各组件分别是什么

可以用酒店来记忆：

```text
SandboxClaim  = 订房申请
Sandbox       = 房间档案
Pod           = 真正的房间
SDK           = 客人手里的酒店应用
Router        = 酒店前台
X-Sandbox-ID  = 房间号
PVC           = 房间的储物柜
Service       = 房间的内部电话号码
Runtime       = 房间里真正提供服务的人
```

对应到技术职责：

| 组件 | 职责 |
| --- | --- |
| SDK | 创建和等待 SandboxClaim，并向 Runtime 发起高级操作。 |
| Kubernetes API | 保存 Claim、Sandbox 等资源及其状态。 |
| Controller | 把 Claim、Sandbox 等期望状态变成实际 Pod、PVC 和 Service。 |
| Sandbox Router | 接收共享入口的请求，定位 Sandbox Pod，并进行反向代理。 |
| Runtime | 在 Sandbox Pod 中执行命令、读写文件并返回结果。 |

## 第一阶段：SDK 申请 Sandbox

调用：

```python
sandbox = client.create_sandbox(warmpool="python-pool")
```

首先走控制面：

```text
外部应用
   │
   │ create_sandbox()
   ▼
SDK
   │
   │ 使用 kubeconfig 或 ServiceAccount
   ▼
Kubernetes API Server
   │
   │ 创建 SandboxClaim
   ▼
SandboxClaim 控制器
   │
   ├── 从 WarmPool 领取一个已预热的 Sandbox
   │        或
   └── 根据 Template 冷启动一个 Sandbox
              │
              ▼
       Sandbox 控制器
              │
              ├── 创建 PVC
              ├── 创建 Pod
              └── 创建可选 Service
              │
              ▼
       Sandbox Ready=True
```

SDK 会等待控制器更新状态，并得到：

```text
Claim 名称
Sandbox 名称
Pod 名称
Pod IP
```

Go SDK 的主要顺序是：

```text
创建 SandboxClaim
        │
        ▼
等待 Claim status 中出现 Sandbox 名称
        │
        ▼
等待 Sandbox Ready=True
        │
        ▼
读取 Pod 名称和 Pod IP
        │
        ▼
建立数据面连接
```

Python SDK 当前会从 SandboxClaim 转发后的 Ready 状态中同时取得 Sandbox 名称和
就绪结果。实现细节略有差异，但两者的控制面语义相同。

### 三种名称不要混淆

一个实际例子可能是：

```text
SandboxClaim/sandbox-claim-a1b2c3
                 │
                 │ status.sandboxStatus.name
                 ▼
Sandbox/python-pool-x7k9p
                 │
                 │ 当前默认情况下 Pod 名称与 Sandbox 相同
                 ▼
Pod/python-pool-x7k9p
```

SDK 发送给 Router 的 `X-Sandbox-ID` 是实际 Sandbox 名称，不是 Claim 名称。

## 第二阶段：SDK 使用 Sandbox

调用：

```python
result = sandbox.commands.run("ls -la")
```

这时不再创建 CRD，而是走数据面。默认的旧版 Python Runtime 使用 HTTP：

```http
POST /execute
Content-Type: application/json
X-Sandbox-ID: python-pool-x7k9p
X-Sandbox-Namespace: default
X-Sandbox-Port: 8888
X-Sandbox-Pod-IP: 10.0.2.15

{"command":"ls -la"}
```

完整路径是：

```text
外部应用
   │
   │ sandbox.commands.run("ls -la")
   ▼
SDK
   │
   │ HTTP 请求 + Sandbox 路由信息
   ▼
Sandbox Router
   │
   │ 转发到 10.0.2.15:8888
   ▼
Sandbox Pod 中的 Runtime
   │
   │ 真正执行命令
   ▼
返回 stdout、stderr 和 exit_code
```

Router 不解析 `ls -la`，也不执行它。它只根据请求头找到目标 Pod，然后透传路径、
请求体和响应。

## 外部应用如何进入 Router

不同连接模式解决的都是同一个问题：SDK 用什么地址访问 Router？

### Gateway 模式

适合从集群外部访问：

```text
外部 SDK
   │
   ▼
公网负载均衡器
   │
   ▼
Kubernetes Gateway
   │
   ▼
HTTPRoute
   │
   ▼
Service/sandbox-router-svc:8080
   │
   ▼
Router Pod
```

SDK 观察 Gateway 的 `status.addresses`，取得外部 IP 或主机名。GKE 只是 Gateway
API 的一种实现；其他集群安装相应的 Gateway Controller 后也可以使用。

### 本地 Port-forward 模式

适合本地开发和 CI：

```text
本地 SDK
   │
   │ 通过 kube-apiserver 建立 port-forward
   ▼
Router Pod:8080
   │
   ▼
Sandbox Pod
```

本地看到的 Router 地址类似 `http://127.0.0.1:54321`，但这个端口通过隧道连接到
集群里的 Router。

Go SDK 使用 client-go 原生建立 SPDY port-forward；Python SDK 当前通过
`kubectl port-forward svc/sandbox-router-svc` 建立隧道。

### Direct URL 模式

调用方已经知道 Router 地址时，可以直接配置：

```text
http://sandbox-router-svc.agent-sandbox-system.svc.cluster.local:8080
```

这种模式只跳过 Router 地址发现，SDK 仍然需要 Kubernetes 客户端来创建、等待和
删除 SandboxClaim。

## SDK 给 Router 的路由信息

常见请求头如下：

| 请求头 | 含义 |
| --- | --- |
| `X-Sandbox-ID` | 目标 Sandbox 名称。 |
| `X-Sandbox-Namespace` | Sandbox 所在的 namespace。 |
| `X-Sandbox-Port` | Runtime 在 Pod 内监听的端口，默认是 8888。 |
| `X-Sandbox-Pod-IP` | SDK 已知的 Pod IP，可让 Router 直接访问。 |
| `X-Sandbox-Timeout` | 本次代理请求的超时时间。 |
| `X-Request-ID` | 日志和链路追踪使用的请求标识。 |

Router 还支持 `X-Sandbox-UID`，在启用 Pod 缓存时可按 UID 找到 Pod IP；当前常规
SDK 请求主要依靠 Sandbox 名称和已知 Pod IP。

## Router 如何定位 Sandbox Pod

Router 的解析顺序是：

```text
1. 请求是否带 X-Sandbox-Pod-IP？
   │
   ├── 是 ──► 直接使用这个 Pod IP
   │
   └── 否
       ▼
2. 是否可以按 X-Sandbox-UID 命中 Pod 缓存？
   │
   ├── 是 ──► 使用缓存中的 Pod IP
   │
   └── 否
       ▼
3. 是否可以按 namespace + Sandbox 名称命中缓存？
   │
   ├── 是 ──► 使用缓存中的 Pod IP
   │
   └── 否
       ▼
4. 使用 Kubernetes Service DNS
```

对应的目标地址是：

```text
Pod IP 方式：
http://10.0.2.15:8888/execute

Service DNS 方式：
http://python-pool-x7k9p.default.svc.cluster.local:8888/execute
```

Router 默认不会为每个请求查询 Sandbox CR。不开启缓存时，它就是一个无状态反向
代理；开启缓存后，它通过 informer 观察 Ready Pod，维护 Pod IP 索引。

## Service 在数据面中的位置

SDK 已经从 Sandbox Status 得到 Pod IP 时，常见路径是：

```text
SDK ──► Router ──► Pod IP:8888
```

这条路径不经过 Sandbox Service。

当没有 Pod IP、缓存也没有命中时，Router 才使用 Service DNS：

```text
Router
   │
   ▼
sandbox-name.namespace.svc.cluster.local
   │
   ▼
Headless Service
   │
   ▼
Pod IP
```

所以可以这样记忆：

```text
Pod IP  = 当前 SDK 最直接的寻址方式
Service = 稳定 DNS 与兼容性兜底
```

PVC 与网络寻址无关，它只为 Sandbox Pod 提供持久化存储。

## Runtime 才是真正执行操作的组件

一个普通容器即使进入 Kubernetes Ready，也不一定能被 SDK 使用。例如，只运行
`sleep 3600` 的 BusyBox 没有监听 8888，也没有实现 `/execute`。

能够配合默认 SDK 的镜像需要运行兼容的 Runtime Server：

```text
Sandbox Pod
└── Runtime Server :8888
    ├── POST /execute       执行命令
    ├── POST /upload        上传文件
    ├── GET  /download/...  下载文件
    ├── GET  /list/...      列出文件
    └── GET  /exists/...    判断文件是否存在
```

执行命令时：

```text
SDK
 │ POST /execute
 ▼
Router
 │ 原样转发
 ▼
Runtime Server
 │ 启动进程并收集结果
 ▼
{"stdout":"...", "stderr":"...", "exit_code":0}
```

因此要同时区分两种 Ready：

```text
Kubernetes Ready
├── Pod Running
├── Pod Ready condition=True
└── Pod 已获得 IP

应用接口可用
├── Runtime 已经监听正确端口
├── Runtime 实现 SDK 所需接口
└── 请求与响应格式兼容
```

Sandbox `Ready=True` 主要描述前者，不自动证明任意镜像都实现了 SDK Runtime API。

## 为什么需要共享 Router

如果每个 Sandbox 都直接暴露到公网，需要为大量临时 Sandbox 动态维护 Gateway、
Route 或 LoadBalancer：

```text
外部入口 A ──► Sandbox A
外部入口 B ──► Sandbox B
外部入口 C ──► Sandbox C
```

共享 Router 把它变成一个稳定入口：

```text
                           ┌──► Sandbox A
外部入口 ──► Router 集群 ──┼──► Sandbox B
                           └──► Sandbox C
```

Router 可以横向部署多个无状态副本，并集中处理认证、TLS、日志、指标、Trace、超时
和有限重试。

## sandboxd 是当前的例外

新的 `sandboxd` Runtime 使用：

```text
sandboxd
├── REST :8080  ── 文件系统操作
└── gRPC :9090  ── 进程执行
```

当前 Router 不能承载 sandboxd 的 gRPC ProcessService，因此 SDK 会直接对 Sandbox
Pod 建立 port-forward：

```text
SDK
 │
 │ Kubernetes port-forward
 ▼
Sandbox Pod
├── REST :8080
└── gRPC :9090
```

所以前面的 Router 链路主要描述默认的 `legacy-python` Runtime；sandboxd 当前绕过
Router。

## 两套认证也要分开

```text
SDK ──► Kubernetes API
        使用 kubeconfig 或 ServiceAccount

SDK ──► Sandbox Router
        使用 Router 配置的 Bearer Token、Scoped Token、mTLS 等
```

Router 的默认 `allow-all` 模式用于兼容和开发。如果通过公网 Gateway 暴露，生产环境
需要单独启用 Router 身份验证，并配合 NetworkPolicy 限制网络访问。

## 最终记忆图

```text
                         控制面

外部应用 ──► SDK ──► Kubernetes API
                         │
                         ▼
                    SandboxClaim
                         │
                         ▼
                      Sandbox
                         │
                         ▼
                 Pod / PVC / Service


                         数据面

外部应用 ──► SDK
              │
              ├── Gateway
              ├── Port-forward
              └── Direct URL
                     │
                     ▼
               Sandbox Router
                     │
                     ├── Pod IP
                     ├── Pod 缓存
                     └── Service DNS
                              │
                              ▼
                       Sandbox Pod Runtime
```

最后可以把核心对象记成：

```text
Sandbox CRD = 管理生命周期的人
Router      = 送请求的人
Runtime     = 真正干活的人
```

## 源码索引

- Go SDK 的 Sandbox 生命周期：[`clients/go/sandbox/sandbox.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/sandbox.go)
- Go SDK 创建 Claim 和等待 Ready：[`clients/go/sandbox/k8s.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/k8s.go)
- Go SDK 连接策略：[`clients/go/sandbox/strategy.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/strategy.go)
- Go SDK Gateway 发现：[`clients/go/sandbox/gateway.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/gateway.go)
- Go SDK Router port-forward：[`clients/go/sandbox/tunnel.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/tunnel.go)
- Go SDK 请求头和请求发送：[`clients/go/sandbox/connector.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/connector.go)
- Go SDK 命令执行：[`clients/go/sandbox/commands.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/go/sandbox/commands.go)
- Python SDK 连接策略：[`clients/python/agentic-sandbox-client/k8s_agent_sandbox/connector.py`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/python/agentic-sandbox-client/k8s_agent_sandbox/connector.py)
- Router 请求处理：[`sandbox-router/proxy/proxy.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/sandbox-router/proxy/proxy.go)
- Router 请求头解析：[`sandbox-router/proxy/headers.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/sandbox-router/proxy/headers.go)
- Router 目标解析：[`sandbox-router/proxy/resolve.go`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/sandbox-router/proxy/resolve.go)
