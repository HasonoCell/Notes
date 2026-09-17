# Sandbox 调谐与 WarmPool 启动流程

这篇文档用于梳理 `Sandbox`、`SandboxTemplate`、`SandboxWarmPool` 和
`SandboxClaim` 如何一步步变成实际运行的 Kubernetes 工作负载。重点关注：

- 每个控制器负责什么；
- 从创建资源到进入 Ready 状态会经过哪些步骤；
- 各个资源之间的所有权关系；
- WarmPool 中的 Sandbox 被 Claim 领取时，所有权如何转移。

## 先理解 Reconcile：启动不是一次性操作

Sandbox 的启动过程不是调用一次 `startSandbox()` 就全部完成，而是由控制器
不断执行调谐循环，把集群中的实际状态逐渐推进到用户声明的期望状态：

```text
Custom Resource 中声明的期望状态
                 │
                 ▼
         控制器执行 Reconcile
                 │
                 ▼
       创建或更新 Kubernetes 子资源
                 │
                 ▼
       状态变化、Watch 事件或重新入队
                 │
                 └──────────► 再次 Reconcile
```

因此，每次 Reconcile 都必须是幂等的。控制器在创建、接管、更新或删除资源前，
都会先检查资源是否已经存在，以及它是否由当前 Custom Resource 控制。

## Sandbox 如何从零开始启动

用户可以不使用任何 Extensions，直接创建一个核心 `Sandbox`：

```yaml
apiVersion: agents.x-k8s.io/v1beta1
kind: Sandbox
metadata:
  name: demo
spec:
  podTemplate:
    spec:
      containers:
      - name: runtime
        image: busybox
        command: ["sleep", "3600"]
        ports:
        - containerPort: 8080
  service: true
```

[`SandboxReconciler`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/controllers/sandbox_controller.go) 会监听 `Sandbox`，
以及由 Sandbox 拥有的 Pod 和 Service。创建 `Sandbox/demo` 后，它就会被加入
控制器的调谐队列。

### 调谐顺序

`reconcileChildResources()` 会按照下面的顺序处理子资源：

```text
创建 Sandbox/demo
        │
        ▼
1. reconcilePVCs()
        │
        ▼
2. reconcilePod()
        │
        ▼
3. reconcileService()
        │
        ▼
4. computeConditions()
        │
        ▼
5. updateStatus()
```

1. **创建 PVC**

   `volumeClaimTemplates` 中的每个模板都会生成一个 PVC，名称格式为
   `<模板名>-<Sandbox 名>`。控制器不需要等 PVC 绑定完成才创建 Pod；如果存储
   尚未准备好，Kubernetes 会让 Pod 保持 Pending。

2. **创建 Pod**

   控制器复制 `spec.podTemplate.spec`，加入控制器使用的追踪标签，把 PVC 模板
   转换为 Pod Volume，将 Pod 名称设为 Sandbox 名称，并让 Sandbox 成为 Pod 的控制器所有者。

3. **创建 Service**

   当 `spec.service` 为 `true` 时，控制器会创建一个无头 Service
  （`clusterIP: None`）。Service 通过控制器生成的 Sandbox 名称哈希标签选择对应 Pod，端口来自各容器声明的端口。

4. **计算 Condition 并更新 Status**

   控制器把 Pod IP、所在节点、Service 名称与 FQDN、调度状态和 Ready 状态写入 Sandbox Status。

第一次 Reconcile 通常会把 `Ready` 设为 `False`，reason 为
`DependenciesNotReady`。随后，调度器和 kubelet 会分配节点、拉取镜像、启动容器，并更新 Pod 状态。这些变化通过 Watch 再次触发 Sandbox Reconcile。

只有满足以下所有条件，Sandbox 才会进入 `Ready=True`，reason 为
`DependenciesReady`：

- Pod 已进入 `Running` phase；
- Pod 的 `Ready` condition 为 `True`；
- Pod 至少已经获得一个 IP；
- 如果请求了 Service，对应的无头 Service 已经存在。

### 第一棵所有权树：直接创建 Sandbox

最容易记忆的版本是：

```text
用户创建 Sandbox
└── Sandbox 控制器创建
    ├── PVC
    ├── Pod
    └── Service
```

更精确地说，Kubernetes 中的 controller reference 会形成这棵树：

```text
Sandbox/demo
├── 拥有 PVC/workspace-demo
├── 拥有 Pod/demo
└── 拥有 Service/demo
```

删除 Sandbox 后，Kubernetes 垃圾回收机制可以根据这些 owner reference 清理其子资源。控制器在修改同名资源前也会检查所有权，避免误接管由其他控制器拥有的
对象。

## SandboxWarmPool 如何启动

Extensions 构建在核心 Sandbox 控制器之上。WarmPool 不直接创建 Pod，而是先创建指定数量的 `Sandbox` Custom Resource，再由核心 Sandbox 控制器为每个 Sandbox 创建实际的 Kubernetes 工作负载。

### 四种资源各自负责什么

| 资源 | 控制器职责 |
| --- | --- |
| `SandboxTemplate` | 保存可复用的 `SandboxBlueprint` 和策略；其控制器还会管理共享的 NetworkPolicy。 |
| `SandboxWarmPool` | 维持指定数量、尚未被领取的 Sandbox。 |
| `Sandbox` | 创建并管理实际的 PVC、Pod 和可选 Service。 |
| `SandboxClaim` | 从池中领取一个 Sandbox，并成为它的新 owner。 |

先创建一个 Template，以及引用它的 WarmPool：

```yaml
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxTemplate
metadata:
  name: python-template
spec:
  podTemplate:
    spec:
      containers:
      - name: runtime
        image: python:3.13
        command: ["sleep", "infinity"]
---
apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxWarmPool
metadata:
  name: python-pool
spec:
  replicas: 3
  sandboxTemplateRef:
    name: python-template
```

Template 和 WarmPool 必须位于同一个 namespace，因为 `sandboxTemplateRef` 只有名称，没有 namespace 字段。

### WarmPool 扩容流程

[`SandboxWarmPoolReconciler`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/extensions/controllers/sandboxwarmpool_controller.go)
会执行以下步骤：

```text
SandboxWarmPool/python-pool 声明需要 3 个副本
                    │
                    ▼
1. 根据 pool hash 标签列出当前池内的 Sandbox
                    │
                    ▼
2. 读取 SandboxTemplate/python-template
                    │
                    ▼
3. 计算 PodTemplate 和完整 SandboxBlueprint 的哈希
                    │
                    ▼
4. 计算缺口：期望副本数 - 当前成员数
                    │
                    ▼
5. 根据 Blueprint 创建缺少的 Sandbox CR
                    │
                    ▼
6. 核心 Sandbox 控制器分别创建 PVC、Pod 和 Service
                    │
                    ▼
7. 统计 Ready Sandbox，写入 status.readyReplicas
```

池创建的 Sandbox 使用类似 `python-pool-abc12` 的生成名称，并带有 pool、template、blueprint hash 和 `launch-type=warm` 等标签。WarmPool 是这些 Sandbox 的控制器所有者。

在创建 Sandbox 前，WarmPool 控制器还会应用 Extensions 的安全默认值。例如，
如果 Template 没有明确设置 `automountServiceAccountToken`，默认值会是 `false`。

完整链路是异步发生的：

```text
WarmPool 控制器创建 Sandbox CR
                  │
                  ▼
Sandbox 控制器观察到各个 Sandbox
                  │
                  ▼
Sandbox 控制器创建 PVC、Pod 和 Service
                  │
                  ▼
Pod 状态变化触发 Sandbox 再次 Reconcile
                  │
                  ▼
Sandbox Ready 状态变化触发 WarmPool 再次 Reconcile
                  │
                  ▼
status.replicas 与 status.readyReplicas 逐渐收敛
```

`status.replicas` 统计当前属于池的活跃 Sandbox，`status.readyReplicas` 只统计
`Ready=True` 的 Sandbox。因此，配置 `replicas: 3` 时，池可能暂时显示 3 个副本，但 Ready 副本只有 1 个，因为另外两个 Pod 还在启动。

### 第二棵所有权树：WarmPool 创建 Sandbox

这是第二棵需要记住的所有权树：

```text
用户创建 Template
├── Template 控制器创建 NetworkPolicy
└── WarmPool 引用 Template
    └── WarmPool 控制器创建多个 Sandbox
        └── Sandbox 控制器为每个 Sandbox 创建
            ├── PVC
            ├── Pod
            └── Service
```

如果严格区分“引用”和“拥有”，实际关系如下：

```text
SandboxTemplate/python-template
└── 拥有 NetworkPolicy/python-template-network-policy

SandboxWarmPool/python-pool
├── 引用 SandboxTemplate/python-template
├── 拥有 Sandbox/python-pool-abc12
│   ├── 拥有 PVC/...
│   ├── 拥有 Pod/python-pool-abc12
│   └── 拥有 Service/python-pool-abc12
├── 拥有 Sandbox/python-pool-def34
└── 拥有 Sandbox/python-pool-ghi56
```

Template 并不拥有 WarmPool。WarmPool 只是通过一个同 namespace 的引用找到
Template。

### 大规模扩容时的保护机制

副本数较大时，informer cache 可能暂时落后于 API 写入。如果控制器只根据缓存
反复计算缺口，就可能重复创建过多 Sandbox。WarmPool 控制器通过以下机制避免
这种情况：

- 限制单次创建或删除的最大批量；
- refill rate limiter；
- 自适应 slow-start 批量创建；
- 使用 expectations 记录已经写入、但尚未被 informer cache 观察到的资源；
- Ready grace period 和 unschedulable recheck period。

这些机制共同保护一个核心不变量：不能因为缓存短暂滞后，让池中 Sandbox 的数量
超过 `spec.replicas`。

## Claim 领取与 WarmPool 补位

当 `SandboxClaim` 引用一个 WarmPool 时，Claim 控制器会选择一个可用 Sandbox，并转移它的控制器所有者：

```text
领取前：
SandboxWarmPool/python-pool
└── 拥有 Sandbox/python-pool-abc12（已经 Ready）

领取后：
SandboxClaim/session-1
└── 拥有 Sandbox/python-pool-abc12（仍然使用原来的运行中 Pod）
```

这个过程不会重启 Pod，这正是 warm start 能降低启动延迟的原因。Claim 控制器会移除 pool membership 标签，并加入 Claim 身份信息。WarmPool 随后观察到成员数低于期望值，于是创建一个新的 Sandbox 补位。

如果池中没有可用的预热候选项，Claim 控制器可以使用该池引用的 Template 冷启动
一个新 Sandbox。如果 Claim 指定了额外的环境变量或 PVC 模板，也必须冷启动，
因为这些配置需要在 Pod 创建前写入。