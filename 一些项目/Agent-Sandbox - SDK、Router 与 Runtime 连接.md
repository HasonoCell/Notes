# SDK、Sandbox Router 与 Runtime 的连接流程

这篇笔记解释外部程序如何通过 SDK 申请 Sandbox，以及命令和文件请求如何经过
Sandbox Router 到达 Kubernetes 集群中的 Sandbox Pod。

## 两条彼此独立的通道

SDK 内部同时使用两类客户端：

```text
Kubernetes 客户端
└── 创建、观察和删除 SandboxClaim / Sandbox

HTTP 或 gRPC 客户端
└── 与 Sandbox Pod 中的 Runtime 交换数据
```

因此，从创建到使用 Sandbox，可以拆成两条通道：

```text
控制面：SDK ──► Kubernetes API ──► SandboxClaim ──► Sandbox

数据面：SDK ──► Sandbox Router ──► Sandbox Pod 中的 Runtime
```

控制面回答“Sandbox 是否已经创建并 Ready”，数据面回答“请求如何到达已经运行的
Sandbox”。Sandbox CRD 只是 Kubernetes API 中的资源记录，不能接收命令请求；
真正执行操作的是 Pod 里的 Runtime。

## SDK 如何创建 Sandbox

以 Python SDK 为例：

```python
sandbox = client.create_sandbox(
    warmpool="python-pool",
    namespace="default",
)
```

这次调用走的是控制面：

```text
外部程序调用 create_sandbox()
              │
              ▼
SDK 使用 kubeconfig 或 ServiceAccount
              │
              ▼
向 Kubernetes API 创建 SandboxClaim
              │
              ▼
SandboxClaim 控制器处理 Claim
              │
              ├── 从 WarmPool 领取预热 Sandbox
              │        或
              └── 根据 Template 冷启动 Sandbox
                           │
                           ▼
                  Sandbox 控制器创建
                  ├── PVC
                  ├── Pod
                  └── 可选 Service
                           │
                           ▼
                  Sandbox Ready=True
                           │
                           ▼
                  SDK 返回 Sandbox 句柄
```

SDK 会从 Claim 和 Sandbox Status 中取得 Sandbox 名称、Pod 名称、Pod IP 和 Ready
状态。Go SDK 会先等待 Claim 绑定，再单独观察 Sandbox Ready；Python SDK 当前可以
从 Claim 转发的状态中同时取得绑定与 Ready 结果。

### 三种名称的对应关系

```text
SandboxClaim/sandbox-claim-a1b2c3
                 │
                 │ status.sandboxStatus.name
                 ▼
Sandbox/python-pool-x7k9p
                 │
                 │ 当前默认 Pod 名称与 Sandbox 相同
                 ▼
Pod/python-pool-x7k9p
```

后续发给 Router 的 `X-Sandbox-ID` 是实际 Sandbox 名称
`python-pool-x7k9p`，不是 Claim 名称。

## SDK 如何执行命令

创建完成后，用户调用：

```python
result = sandbox.commands.run("ls -la")
```

此时不再创建或修改 CRD。默认的 `legacy-python` Runtime 使用 HTTP，所以 SDK
构造如下请求：

```http
POST /execute
Content-Type: application/json
X-Sandbox-ID: python-pool-x7k9p
X-Sandbox-Namespace: default
X-Sandbox-Port: 8888
X-Sandbox-Pod-IP: 10.0.2.15

{"command":"ls -la"}
```

请求链路是：

```text
外部程序
   │
   │ sandbox.commands.run("ls -la")
   ▼
SDK
   │
   │ POST /execute + X-Sandbox-* 请求头
   ▼
Sandbox Router
   │
   │ 转发到 10.0.2.15:8888
   ▼
Sandbox Pod 中的 Runtime
   │
   │ 真正启动命令进程
   ▼
返回 stdout、stderr 和 exit_code
```

Router 不解析 `ls -la`，也不会执行它。Router 只选择目标 Pod，透传请求，并把
Runtime 的响应返回给 SDK。

## SDK 如何到达 Router

Gateway、Port-forward 和 Direct URL 只决定 SDK 从哪里进入同一个 Router：

| 模式 | 典型场景 | SDK 到 Router 的路径 |
| --- | --- | --- |
| Gateway | 正式的集群外访问 | 公网负载均衡器 → Gateway → HTTPRoute → `sandbox-router-svc` |
| Port-forward | 本地开发和 CI | 本地端口 → kube-apiserver 隧道 → Router Pod |
| Direct URL | 已知 Router 地址 | SDK 直接使用给定 URL |

三种模式可以合并成：

```text
Gateway ──────┐
              │
Port-forward ─┼──► Sandbox Router ──► Sandbox Pod
              │
Direct URL ───┘
```

差别只存在于 Router 之前。请求到达 Router 后，后续处理完全相同。

### Gateway 模式

```text
外部 SDK
   │
   ▼
公网负载均衡器 / Kubernetes Gateway
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

SDK 读取 Gateway 的 `status.addresses` 获得外部地址。GKE 只是 Gateway API 的一种
实现，其他 Kubernetes 环境也可以使用自己的 Gateway Controller。

### Port-forward 模式

```text
本地 SDK
   │
   │ kube-apiserver port-forward
   ▼
Router Pod:8080
```

SDK 最终访问类似 `http://127.0.0.1:54321` 的地址。Go SDK 使用 client-go 原生
SPDY port-forward；Python SDK 当前调用 `kubectl port-forward`。

### Direct URL 模式

调用方已知 Router 地址时，可以配置：

```text
http://sandbox-router-svc.agent-sandbox-system.svc.cluster.local:8080
```

Direct URL 只跳过 Router 地址发现。SDK 仍然需要 Kubernetes 客户端管理 Claim
生命周期。

## Router 如何定位目标 Pod

SDK 通过请求头告诉 Router 目标身份：

| 请求头 | 含义 |
| --- | --- |
| `X-Sandbox-ID` | 目标 Sandbox 名称。 |
| `X-Sandbox-Namespace` | Sandbox 所在 namespace。 |
| `X-Sandbox-Port` | Runtime 监听端口，默认 8888。 |
| `X-Sandbox-Pod-IP` | SDK 已知的 Pod IP。 |
| `X-Sandbox-Timeout` | 本次代理请求的超时时间。 |

Router 校验请求头后，按照固定优先级解析目标：

```text
1. 有 X-Sandbox-Pod-IP
   └── 直接使用该 Pod IP

2. 按 X-Sandbox-UID 命中 Pod 缓存
   └── 使用缓存中的 Pod IP

3. 按 namespace + Sandbox 名称命中缓存
   └── 使用缓存中的 Pod IP

4. 前面均未命中
   └── 使用 Kubernetes Service DNS
```

最终生成的上游地址可能是：

```text
直接访问 Pod：
http://10.0.2.15:8888/execute

通过 Service DNS：
http://python-pool-x7k9p.default.svc.cluster.local:8888/execute
```

Router 默认不会为每个请求查询 Sandbox CR。不开启缓存时，它是无状态反向代理；
开启缓存后，它通过 informer 观察 Ready Pod 并维护 Pod IP 索引。

## Service 在请求链路中的位置

SDK 已经从 Sandbox Status 得到 Pod IP 时，常见路径是：

```text
SDK ──► Router ──► Pod IP:8888
```

这条路径不会经过 Sandbox Service。只有没有 Pod IP、Router 缓存也未命中时，
Router 才走 DNS 兜底：

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

可以这样记忆：

```text
Pod IP  = SDK 已知目标时最直接的寻址方式
Service = 稳定 DNS 与兼容性兜底
PVC     = 持久化存储，与网络寻址无关
```

## Runtime 才是真正执行操作

默认的 `legacy-python` Runtime 通常监听 8888，并实现：

```text
Sandbox Pod
└── Runtime Server :8888
    ├── POST /execute       执行命令
    ├── POST /upload        上传文件
    ├── GET  /download/...  下载文件
    ├── GET  /list/...      列出文件
    └── GET  /exists/...    判断文件是否存在
```

一个普通容器即使已经 Kubernetes Ready，也不一定能被 SDK 使用。例如只运行
`sleep 3600` 的 BusyBox 没有监听 8888，也没有实现 `/execute`。

```text
Kubernetes Ready
├── Pod Running
├── Pod Ready condition=True
└── Pod 已获得 IP

Runtime 可用
├── 监听正确端口
├── 实现 SDK 所需接口
└── 请求与响应格式兼容
```

Sandbox `Ready=True` 主要描述 Kubernetes 状态，不自动证明任意镜像都实现了
Runtime API。

## sandboxd 的例外链路

新的 `sandboxd` Runtime 使用两个协议：

```text
sandboxd
├── REST :8080  ── 文件系统操作
└── gRPC :9090  ── 进程执行
```

当前 Router 不能承载 sandboxd 的 gRPC ProcessService，因此 SDK 直接对 Sandbox
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

因此，Router 链路主要描述默认的 `legacy-python` Runtime；sandboxd 当前绕过
Router。

## 两条链路记忆图

生命周期链：

```text
外部应用
└── SDK 使用 Kubernetes 客户端
    └── 创建 SandboxClaim
        └── Claim 控制器分配 Sandbox
            └── Sandbox 控制器创建
                ├── PVC
                ├── Pod
                └── Service
```

请求链：

```text
外部应用调用 SDK
└── SDK 生成 Runtime 请求
    └── 通过 Gateway、Port-forward 或 Direct URL 到达 Router
        └── Router 根据 X-Sandbox-* 定位 Pod
            └── Runtime 执行命令或文件操作
                └── 结果沿原路返回 SDK
```

最终可以压缩成：

```text
Sandbox CRD = 管理生命周期
SDK         = 封装生命周期和调用方式
Router      = 定位并转发请求
Runtime     = 真正执行操作
```
