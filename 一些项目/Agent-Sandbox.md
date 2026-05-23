
# 网络策略

可以。这次我把 **router 应用本体**、**Kubernetes Service**、**SDK 连接策略** 三者强行拆开来讲，这样链路会清楚很多。

先记住一个最核心的事实：

- `sandbox-router.py` 是一个 **HTTP 应用**
- 这个应用被打包成容器，跑在 **router Pod** 里
- 这些 router Pod 由一个 **Deployment** 管理
- 为了让别的客户端稳定访问这些 router Pod，Kubernetes 再提供一个 **Service**
- 这个 Service 的名字就是 `sandbox-router-svc`

所以本质关系是：

```text
sandbox-router.py
    -> 跑在 router Pod 里
    -> Pod 由 Deployment 管理
    -> Pod 通过 Service 暴露
```

不是：

```text
router = Service
```

而是：

```text
router 应用 + Deployment + Service
```

你可以把它类比成一个普通后端服务：

- 代码：FastAPI 应用
- 运行：Deployment 里的 Pod
- 暴露：ClusterIP Service

只不过这个服务的功能不是业务 API，而是“把请求转发到具体 sandbox”。

---

**先看集群内真实形态**

在集群里，大致是这样：

```text
SDK client
   |
   |  (某种方式到达 router)
   v
sandbox-router-svc   <- Kubernetes Service
   |
   v
router Pod A / router Pod B   <- Deployment 管理的多个副本
   |
   v
sandbox Pod
```

所以：

- `sandbox-router-svc` 是稳定入口
- `router Pod` 才是真正运行 `sandbox_router.py` 的地方
- Service 只是把流量发给某个 router Pod

---

**为什么需要 Service**

因为 Deployment 里的 Pod 是会变的：

- Pod 可能重建
- Pod 名可能变化
- 可能有多个副本做 HA

如果 SDK 直接记住某个 router Pod 名称，那会非常脆弱。  
所以 Kubernetes 用 `Service` 提供一个稳定的名字和虚拟 IP：

```text
sandbox-router-svc
```

客户端只要知道这个 Service，就不用关心后面到底是哪一个 router Pod 在处理请求。

这就是 Service 的本质价值：

- 把“动态变化的 Pod 集合”包装成“稳定可访问的网络入口”

---

**四种连接策略，实际上是在回答：SDK 怎么到达这个 Service 或它背后的应用？**

---

**1. LocalTunnel**

场景：

- SDK 跑在你的本机
- 本机不在集群内
- 本机不能直接访问 `sandbox-router-svc.default.svc.cluster.local`

所以 SDK 做的事情不是直接连 router Pod，而是：

```bash
kubectl port-forward svc/sandbox-router-svc <local_port>:8080
```

这里的关键点是：

- `port-forward` 的目标是 **Service**
- 不是直接某个 router Pod
- 你的本机 `localhost:<local_port>` 被临时映射到集群里的 `sandbox-router-svc:8080`

完整链路：

```text
Python SDK
  -> http://127.0.0.1:<local_port>
  -> kubectl port-forward
  -> sandbox-router-svc
  -> 某个 router Pod
  -> sandbox-router.py 应用
  -> sandbox Pod
```

所以 LocalTunnel 的本质是：

- 你本机先借助 `kubectl` 打通一条到 **router Service** 的隧道
- 然后 SDK 把请求发进这个隧道

---

**2. Gateway**

场景：

- SDK 仍然在集群外
- 但不是本机 port-forward
- 而是集群里有 Gateway / LoadBalancer 对外暴露了 router

这时完整链路是：

```text
Python SDK
  -> http://<gateway-ip>
  -> Gateway / LB
  -> sandbox-router-svc 或 router Pod
  -> sandbox-router.py 应用
  -> sandbox Pod
```

这里的本质还是一样：

- router 应用仍然跑在集群内
- SDK 只是换了一种“从外部到达 router”的方式

区别只是：

- LocalTunnel：通过 `kubectl port-forward` 到 Service
- Gateway：通过集群对外暴露的网络入口到 Service/Pod

---

**3. Direct**

这个名字最容易让人误解。

这里的 `Direct` 不是说“直接打 sandbox Pod”，而是：

- SDK 直接使用你提供的 URL
- 不再自己做 Gateway 发现，也不做 port-forward

比如你给：

```python
SandboxDirectConnectionConfig(api_url="http://router.example.com")
```

那么链路会变成：

```text
Python SDK
  -> http://router.example.com
  -> 这个地址背后通常还是 router
  -> sandbox-router.py 应用
  -> sandbox Pod
```

所以 Direct 的“direct”是指：

- **直接使用已知入口地址**
- 不是“直接绕过 router”

很多情况下这个 `api_url` 背后依然是：

- 一个 Gateway
- 一个 Ingress
- 一个外部 LB
- 或者某种能到 router 的地址

所以它本质上仍然经常是在访问集群内的 router，只不过 SDK 不负责发现这个地址。

---

**4. InCluster**

这一个才是真正绕过 router 的。

场景：

- SDK 自己就跑在集群内
- 它可以直接访问 sandbox Service DNS 或 Pod IP
- 不需要再经过 router 这个中转层

链路：

```text
Python SDK
  -> sandbox Service DNS 或 Pod IP
  -> sandbox Pod
```

不经过：

- `sandbox-router-svc`
- router Pod
- `sandbox_router.py`

所以 InCluster 是唯一一条“不走 router”的路。

---

**为什么 router 要做成 Deployment + Service，而不是别的形式**

因为它其实就是一个标准的集群内服务：

- 需要多个副本，避免单点
- 需要稳定入口，方便 SDK 和其他组件访问
- 需要和普通 K8s networking 模式兼容

所以最自然的 Kubernetes 实现就是：

- `Deployment`
- `Service`

这个设计非常常规，不是什么特殊技巧。

你可以把它和业务后端服务完全类比：

- 业务 API 代码
- Deployment 跑多个副本
- Service 对内暴露
- Gateway / Ingress / port-forward 负责外部到达

只不过这里的“业务 API”换成了“sandbox request router”。

---

**把四种策略重新压缩成一句话**

它们不是四种不同的 router，也不是四种不同的 sandbox。  
它们只是四种不同的“SDK 如何到达网络终点”的方式：

- `LocalTunnel`
  - 到达 **集群内的 router Service**
- `Gateway`
  - 到达 **集群内 router 的外部入口**
- `Direct`
  - 到达 **你手工指定的 router 入口地址**
- `InCluster`
  - **不走 router**，直接到 sandbox

---

**一个完整直观例子**

你本机运行：

```python
client = SandboxClient()  # 默认本地 tunnel
sandbox = client.create_sandbox("python-template")
sandbox.commands.run("echo hello")
```

实际发生的网络链路可以拆成两段。

第一段，创建 sandbox：

```text
SandboxClient.create_sandbox()
  -> K8sHelper
  -> Kubernetes API server
  -> 创建 SandboxClaim
  -> watch claim / sandbox
  -> 返回 Sandbox 句柄
```

第二段，执行命令：

```text
sandbox.commands.run()
  -> CommandExecutor
  -> SandboxConnector
  -> LocalTunnelConnectionStrategy
  -> kubectl port-forward svc/sandbox-router-svc
  -> sandbox-router-svc
  -> 某个 router Pod
  -> sandbox-router.py
  -> 根据 X-Sandbox-ID 找到目标 sandbox
  -> 转发到 sandbox Pod 的 /execute
```

这里最重要的本质就是：

- **router 是应用**
- **Service 是访问这个应用的稳定入口**
- **连接策略决定 SDK 如何到达这个入口**

这三者必须分开理解。

如果你愿意，下一条我可以继续把 `connector.py` 里这四种策略的类结构画成一个很清晰的“对象关系图 + 请求流图”，这样你再回去读源码就不会乱。