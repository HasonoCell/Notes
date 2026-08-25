先给你一个最重要的结论：

> GitHub Actions 更像“通用流水线执行器”；Luna DevOps 更像“面向 Kubernetes 应用交付的控制平面 / 轻量 PaaS”。

它们确实有功能重叠：都可以响应 Git 提交、执行构建、推送镜像、部署 Kubernetes。但它们解决问题的抽象层次不同。

GitHub Actions 关注的是：

```
某个代码仓库发生事件
→ 按 YAML 定义执行若干 Job
→ 得到成功/失败结果
```

Luna DevOps 关注的是：

```
一个项目空间里有哪些应用
→ 每个应用如何构建
→ 应该发布到哪个集群/环境
→ 当前运行状态如何
→ 域名和证书是否正常
→ 哪个版本正在运行
→ 是否需要回滚或诊断
```

GitHub 官方把 Actions 定义为由 Workflow、Job、Step 和 Runner 组成的自动化执行系统；Workflow 由仓库中的 YAML 文件定义，Runner 负责真正执行任务。[GitHub Actions 官方文档](https://docs.github.com/en/actions/concepts/workflows-and-actions)

而 Luna 的产品文档明确说，它不替代 GitHub、Harbor、Kubernetes、Ingress 等已有组件，而是把代码仓库、CI、镜像仓库、运行环境、网关和域名抽象、编排、打通。[Luna 产品与一体化方案](https://github.com/LiteyukiStudio/luna-devops/blob/main/docs-internal/01-%E4%BA%A7%E5%93%81%E4%B8%8E%E4%B8%80%E4%BD%93%E5%8C%96%E6%96%B9%E6%A1%88.md)

---

# 一、用一个比喻理解二者

可以把整个软件交付过程比作一个工厂和园区。

GitHub Actions 是：

> 工厂里的自动化流水线系统。

你在 YAML 中写：

```
拉代码
→ 安装依赖
→ 执行测试
→ 构建镜像
→ 推送镜像
→ 执行 kubectl
→ 等待发布完成
```

它会按照你写的步骤执行。

Luna DevOps 是：

> 面向多个应用的园区管理平台。

它管理：

```
有哪些项目
有哪些应用
每个应用属于谁
每个应用部署到哪个环境
每个环境有几个副本
镜像在哪里
域名是什么
证书是否正常
当前发布版本是什么
是否可以回滚
资源用了多少
谁执行了什么操作
```

所以：

|对比点|GitHub Actions|Luna DevOps|
|---|---|---|
|核心定位|通用自动化流水线|应用交付控制平面|
|配置方式|仓库中的 Workflow YAML|Web 控制台、API、CLI、应用配置|
|核心对象|Workflow、Job、Step、Runner|项目空间、应用、构建、镜像、部署目标、Release、Gateway|
|执行位置|GitHub-hosted Runner 或 self-hosted Runner|Luna Worker 管理的 Kubernetes Job|
|Kubernetes 操作|你自己写 `kubectl`、Helm 或 Action|Luna 内部使用 Kubernetes API 编排资源|
|构建镜像|你自己组合 Docker/BuildKit Action|Worker 创建 Rootless BuildKit 构建任务|
|发布状态|Workflow 成功/失败|Release、Deployment、Pod、Gateway、证书等多层状态|
|回滚|需要自己写回滚逻辑|发布历史和回滚属于平台对象|
|多租户/RBAC|GitHub 仓库、组织、Environment 权限|项目空间、Owner/Admin/Developer/Viewer 等应用权限|
|审计|Workflow 运行记录|平台操作、发布、审批、审计事件|
|域名和证书|通常需要自己写配置|统一管理 Gateway API、HTTPRoute、域名和证书|
|Agent|可以在 Workflow 中调用脚本或 AI|Agent 理解项目、应用、发布、日志并执行受控平台操作|

这里有一个容易误会的点：

> GitHub Actions 不是不能部署 Kubernetes，Luna 也不是不能执行构建；区别在于谁负责抽象和管理整个交付生命周期。

GitHub Actions 完全可以部署 Kubernetes。GitHub 官方也支持通过 Environment、并发控制、审批规则和部署历史管理发布。[GitHub Actions 部署文档](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments)

但在 GitHub Actions 中，通常需要你自己写：

```
docker build ...
docker push ...
helm upgrade ...
kubectl rollout status ...
kubectl rollout undo ...
```

而在 Luna 中，这些通常被包装为：

```
创建应用
→ 配置构建
→ 配置部署目标
→ 点击发布
→ 查看 Release 状态
→ 查看日志
→ 回滚
```

---

# 二、先设计一个完整电商系统

假设我们有一个叫 `Acme Shop` 的电商平台。

系统包含：

```
前端：
- shop-web
- shop-admin

后端：
- api-gateway
- user-service
- product-service
- cart-service
- inventory-service
- order-service
- payment-service
- notification-service

基础设施：
- PostgreSQL
- Redis
- RabbitMQ 或 Kafka
- 对象存储
- Kubernetes
- Gateway API
- cert-manager
- Harbor
```

用户访问路径是：

```
用户浏览器
    ↓
https://shop.example.com
    ↓
Kubernetes Gateway
    ↓
HTTPRoute
    ├── /              → shop-web
    └── /api           → api-gateway
```

`api-gateway` 再通过 Kubernetes Service 访问内部服务：

```
api-gateway
    ├── user-service
    ├── product-service
    ├── cart-service
    ├── inventory-service
    ├── order-service
    └── payment-service
```

内部服务不直接暴露公网：

```
shop-web              ClusterIP / Gateway
api-gateway            ClusterIP / Gateway
user-service           ClusterIP
product-service        ClusterIP
cart-service           ClusterIP
inventory-service      ClusterIP
order-service          ClusterIP
payment-service        ClusterIP
notification-service   ClusterIP
```

数据库和消息队列可以有两种方式：

开发环境：

```
PostgreSQL、Redis、RabbitMQ 也部署在 K8s
```

生产环境：

```
PostgreSQL 使用云数据库
Redis 使用托管 Redis
RabbitMQ/Kafka 使用独立集群或云服务
```

Luna 主要负责交付和运行应用，不应该把所有有状态基础设施都简单塞进同一个业务 Namespace。数据库备份、故障转移、存储性能和升级通常需要独立治理。

---

# 三、如果只用 GitHub Actions，流程是什么

假设 `order-service` 的代码仓库中有一个 `.github/workflows/deploy.yml`。

一个简化版流程大概是：

```
name: order-service

on:
  pull_request:
    branches: [main]

  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout

      - name: Run unit tests
        run: go test ./...

      - name: Run integration tests
        run: make integration-test

  build:
    needs: test
    if: github.event_name == 'push'
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout

      - name: Login to Harbor
        run: docker login harbor.example.com

      - name: Build image
        run: |
          docker build \
            -t harbor.example.com/shop/order-service:${GITHUB_SHA} .

      - name: Push image
        run: |
          docker push \
            harbor.example.com/shop/order-service:${GITHUB_SHA}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - name: Configure Kubernetes
        run: configure-kubeconfig

      - name: Deploy
        run: |
          kubectl -n shop-staging set image deployment/order-service \
            order-service=harbor.example.com/shop/order-service:${GITHUB_SHA}

      - name: Wait rollout
        run: |
          kubectl -n shop-staging rollout status \
            deployment/order-service
```

这个流程中，GitHub Actions 负责：

```
监听 GitHub 事件
→ 启动 Runner
→ 拉取代码
→ 测试
→ 构建镜像
→ 推送 Harbor
→ 登录 Kubernetes
→ 修改 Deployment
→ 等待发布
```

看起来已经很完整了。

但问题也开始出现。

## 1. Kubernetes 凭据放在哪里

GitHub Actions 要访问 Kubernetes，就需要：

```
KUBECONFIG
或
Kubernetes API Token
或
云厂商 OIDC 权限
```

如果使用 GitHub-hosted Runner，Runner 在 GitHub 的网络环境中，可能根本访问不到公司内网 Kubernetes。GitHub 官方也特别说明，如果内部环境限制外部网络访问，GitHub-hosted Runner 可能无法连接，需要 self-hosted Runner 或 Actions Runner Controller。[GitHub Runner 文档](https://docs.github.com/en/actions/reference/runners)

## 2. 每个仓库都要写一套流程

你有 8 个微服务，就可能有：

```
shop-web/.github/workflows/deploy.yml
user-service/.github/workflows/deploy.yml
product-service/.github/workflows/deploy.yml
cart-service/.github/workflows/deploy.yml
inventory-service/.github/workflows/deploy.yml
order-service/.github/workflows/deploy.yml
payment-service/.github/workflows/deploy.yml
notification-service/.github/workflows/deploy.yml
```

每套 Workflow 都要处理：

```
镜像标签
Registry 登录
Kubernetes namespace
副本数量
环境变量
Secret
探针
滚动更新
超时
回滚
通知
```

如果以后有：

```
dev
staging
production
```

问题会进一步扩大。

## 3. GitHub Actions 默认不知道完整的应用关系

例如：

```
order-service 依赖 inventory-service
api-gateway 依赖 order-service
shop-web 依赖 api-gateway
```

GitHub Actions 知道当前仓库里的步骤，但它默认不知道整个系统的应用拓扑。

它也不会天然知道：

```
现在生产运行的是哪个 Release
这个 Release 对应哪个镜像 digest
Gateway 路由是否已经生效
证书是否申请成功
Pod 为什么 Pending
过去 10 次发布成功率如何
哪个用户执行过回滚
```

这些信息需要你额外开发或集成。

---

# 四、使用 Luna 后，电商系统会变成什么样

Luna 的思路不是让每个仓库自己维护全部发布脚本，而是把电商系统抽象成一组“应用”。

## Luna 中的对象

可以大致这样映射：

|Luna 对象|在电商系统中的含义|
|---|---|
|Project Space|`acme-shop` 项目空间|
|Application|一个可以独立构建和部署的服务|
|Build|某次代码构建|
|Container Image|构建产生的镜像|
|Deployment Target|`dev`、`staging`、`prod` 中的某个应用环境|
|Release|某个镜像版本发布到某个环境的记录|
|Gateway / HTTPRoute|对外域名和路由|
|Event|构建、部署、运行和平台事件|
|Member / Role|项目 Owner、Developer、Viewer 等|
|Agent Run|一次 AI 诊断或受控操作过程|

项目文档中定义的核心路径就是：

```
连接代码源
→ 构建镜像或使用已有镜像
→ 创建部署配置
→ 发布 Release
→ 配置网关和域名
→ 观察运行状态与诊断
```

同时，Luna 支持三种交付来源：

```
应用市场模板
已有容器镜像
代码仓库构建
```

这也是它和纯 GitHub Actions 很大的区别。

GitHub Actions 通常从“代码仓库中的 Workflow”开始。

Luna 可以从以下任意一种方式开始：

```
我要从 Git 仓库构建
我要部署一个已经存在的镜像
我要从应用市场安装 Redis
我要部署一个模板化服务
```

---

# 五、完整的 Luna 电商部署架构

可以将整个系统拆成三个区域。

```
┌─────────────────────────────────────────────┐
│                 GitHub                      │
│  shop-web / order-service / product-service │
└─────────────────────┬───────────────────────┘
                      │
             PR 检查 / Push Webhook
                      │
                      ▼
┌─────────────────────────────────────────────┐
│              Luna Control Plane             │
│                                             │
│  React Console                              │
│       │                                     │
│  Go API ───── PostgreSQL                    │
│       │                                     │
│  Redis / Asynq                              │
│       │                                     │
│  Worker ───── Kubernetes API                │
│       │                                     │
│  Agent ────── OpenAPI Tool / LLM            │
└───────┬─────────────────────┬───────────────┘
        │                     │
        │ 创建构建任务         │ 创建/更新运行资源
        ▼                     ▼
┌───────────────┐     ┌────────────────────────────┐
│ Kubernetes Job│     │ Kubernetes Application     │
│ Rootless      │     │                            │
│ BuildKit      │     │ shop-prod namespace        │
└──────┬────────┘     │                            │
       │              │ shop-web                  │
       ▼              │ api-gateway               │
┌───────────────┐     │ order-service             │
│ Harbor        │     │ product-service            │
│ OCI Registry  │     │ inventory-service          │
└───────────────┘     └──────────────┬─────────────┘
                                     │
                                     ▼
                           Gateway / HTTPRoute
                                     │
                                     ▼
                           shop.example.com
```

Luna 当前 README 直接列出了这些能力：GitHub/Gitea 接入、Kubernetes Job 构建、Rootless BuildKit、Harbor/DockerHub 等镜像站、Kubernetes/K3s 部署、Gateway API/HTTPRoute、域名和证书自动化。[Luna README](https://github.com/LiteyukiStudio/luna-devops)

---

# 六、第一步：部署 Luna 平台本身

在真实环境中，Luna 自己也是一个需要部署的系统。

例如：

```
luna-system namespace
    ├── luna-api
    ├── luna-worker
    ├── luna-agent
    ├── postgres
    └── redis
```

生产环境可以把 PostgreSQL 和 Redis 放在集群外部。

Luna README 当前提供了 Docker Compose 和 Helm 两种主要方式。Helm 方式类似：

```
helm install luna-devops ./charts/luna-devops \
  --namespace luna-devops \
  --create-namespace
```

还要准备：

```
Kubernetes 集群
Harbor 或其他 OCI Registry
Gateway API Controller
cert-manager
PostgreSQL
Redis
DNS
```

需要注意：

> Luna 不是 Kubernetes 本身，也不是 Gateway Controller，也不是 Registry。

例如 Gateway API 只是 Kubernetes 的一套标准路由资源，真正负责接收流量的仍然是 Envoy Gateway、Traefik、Cilium 等实现。Gateway API 官方文档也明确说明，Gateway、GatewayClass、HTTPRoute 是 Kubernetes 网络层的标准资源模型。[Gateway API 官方文档](https://gateway-api.sigs.k8s.io/docs/introduction/)

---

# 七、第二步：在 Luna 中配置电商项目

在 Luna 中创建项目空间：

```
Project Space: acme-shop
```

为项目添加成员：

```
Alice  Owner
Bob    Developer
Carol  Viewer
```

然后绑定：

```
GitHub Organization
Harbor Registry
Kubernetes Cluster
```

接下来创建应用。

## 1. shop-web

```
Application: shop-web
Source: GitHub/acme/shop-web
Branch: main
Dockerfile: ./Dockerfile
Container Port: 80
Public: yes
Domain: shop.example.com
Replicas: 2
```

## 2. api-gateway

```
Application: api-gateway
Source: GitHub/acme/api-gateway
Branch: main
Container Port: 8080
Public: yes
Path: /api
Replicas: 3
```

## 3. order-service

```
Application: order-service
Source: GitHub/acme/order-service
Branch: main
Container Port: 8080
Public: no
Replicas: 3
```

## 4. inventory-service

```
Application: inventory-service
Source: GitHub/acme/inventory-service
Branch: main
Container Port: 8080
Public: no
Replicas: 3
```

## 5. product-service

```
Application: product-service
Source: GitHub/acme/product-service
Branch: main
Container Port: 8080
Public: no
Replicas: 3
```

每个应用再配置多个 Deployment Target：

```
order-service
    ├── dev
    ├── staging
    └── production
```

比如：

```
Deployment Target: order-service-production
Cluster: production-cluster
Namespace: shop-prod
Replicas: 3
CPU Request: 250m
Memory Request: 512Mi
Environment:
  INVENTORY_BASE_URL=http://inventory-service.shop-prod.svc.cluster.local:8080
  PAYMENT_BASE_URL=https://payment.example.com
Secret:
  DATABASE_PASSWORD
  PAYMENT_API_KEY
```

这里的关键是：

> 同一个 Application 可以有多个环境目标，但每个环境可以有不同的集群、Namespace、副本数、配置和 Secret。

这比在 GitHub Actions 里写：

```
if: branch == main
  kubectl -n shop-prod ...
```

更像一个应用平台。

---

# 八、第三步：开发者提交代码

假设开发者修改了 `order-service`。

本次需求是：

```
下单成功后，订单服务向库存服务发送扣减库存请求
```

开发者创建 Pull Request：

```
feature/order-reserve-inventory
    → main
```

这时最适合由 GitHub Actions 负责：

```
Go 格式检查
→ 单元测试
→ API 契约测试
→ 数据库迁移测试
→ 构建测试镜像
→ 安全扫描
```

例如：

```
name: order-service-ci

on:
  pull_request:
    branches:
      - main

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout

      - name: Test
        run: go test ./...

      - name: Check
        run: go vet ./...

      - name: Build verification image
        run: docker build -t order-service:test .
```

此时不要部署生产。

这是一个非常推荐的分工：

```
Pull Request 阶段：
GitHub Actions 负责代码质量

Merge 之后：
Luna 负责构建正式镜像和部署
```

为什么这样分工？

因为 GitHub Actions 更靠近：

```
代码、Pull Request、测试、质量门禁
```

而 Luna 更靠近：

```
集群、镜像、发布、域名、运行状态
```

---

# 九、第四步：代码合并后，Luna 接管

Pull Request 合并到 `main` 后，GitHub 产生 Push/Webhook 事件。

Luna 收到事件后，内部大致会经历以下步骤。

## 1. 校验 Webhook

Luna 需要校验：

```
Webhook 签名
仓库绑定
分支
commit SHA
项目空间
应用绑定关系
```

并且需要处理重复事件。

例如 GitHub 因网络问题重复发送同一个 Webhook：

```
delivery-id = abc-123
```

Luna 不应该创建两个完全一样的构建任务。

这就是 DevOps 平台中很重要的：

```
Webhook 幂等
任务去重
状态机
```

## 2. 创建 Build Run

Luna API 在 PostgreSQL 中记录一次构建：

```
BuildRun:
  application: order-service
  commit: 82a1...
  branch: main
  status: queued
  target: production
```

然后把异步任务放进 Redis/Asynq。

API 不应该自己同步等待镜像构建完成，否则：

```
HTTP 请求会长时间阻塞
服务重启后任务丢失
并发构建难以控制
```

所以 Luna 使用 API + Worker 的方式：

```
API 接收请求
→ 数据库记录任务
→ Redis 排队
→ Worker 异步执行
```

## 3. Worker 创建 Kubernetes Job

Worker 从队列拿到任务后，会在 Kubernetes 中创建一个专门的 Job：

```
build-order-service-82a1
```

这个 Job 使用 Rootless BuildKit：

```
拉取源代码
→ 读取 Dockerfile
→ 构建镜像
→ 登录 Harbor
→ 推送镜像
```

概念上产生：

```
harbor.example.com/acme-shop/order-service:82a1...
```

更重要的是保存镜像 digest：

```
harbor.example.com/acme-shop/order-service@sha256:abc123...
```

生产环境应该优先使用 digest，而不是：

```
order-service:latest
```

因为 `latest` 可能在不同时间指向不同内容。

Kubernetes Job 本身适合这种“一次性执行并最终完成”的任务；Job Controller 会负责创建 Pod，并在失败时按策略重试。[Kubernetes Job 官方文档](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

## 4. Build Run 状态变化

Luna UI 可以展示：

```
queued
  ↓
running
  ↓
succeeded
```

或者：

```
queued
  ↓
running
  ↓
failed
```

同时显示：

```
构建日志
构建耗时
commit SHA
镜像 Tag
镜像 Digest
失败原因
重试次数
```

GitHub Actions 也有日志，但日志通常属于某次 Workflow Run。

Luna 的日志则属于：

```
某个项目
某个应用
某个构建
某个 Release
某个 Deployment Target
```

它更符合平台运营视角。

---

# 十、第五步：Luna 创建 Release 并部署

构建成功后，Luna 得到：

```
Image:
harbor.example.com/acme-shop/order-service@sha256:abc123...
```

然后创建一个 Release：

```
Release: order-service-prod-r42
Application: order-service
Target: production
Commit: 82a1...
Image Digest: sha256:abc123...
Status: queued
```

Release 的意义是：

> 把某个明确的构建产物，发布到某个明确的环境。

它不是简单的镜像，也不是 Kubernetes Deployment 本身。

可以这样区分：

```
Build       负责产生镜像
Image       镜像仓库中的产物
Release     想把哪个产物发布到哪里
Deployment  Kubernetes 当前实际运行的状态
```

Worker 会调用 Kubernetes API，渲染或更新：

```
Deployment/order-service
Service/order-service
ConfigMap
Secret 引用
PodDisruptionBudget
HorizontalPodAutoscaler
```

例如 Deployment 最终可能类似：

```
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-service
  namespace: shop-prod
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
  selector:
    matchLabels:
      app: order-service
  template:
    metadata:
      labels:
        app: order-service
    spec:
      containers:
        - name: order-service
          image: harbor.example.com/acme-shop/order-service@sha256:abc123
          ports:
            - containerPort: 8080
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
          livenessProbe:
            httpGet:
              path: /health
              port: 8080
```

注意，这个 YAML 可能不是开发者直接写入 Luna 的主流程，而是 Luna 根据应用配置和 Release 信息生成出来。

---

# 十一、Luna 如何处理多微服务发布

假设只有 `order-service` 发生变化。

理想情况下：

```
order-service 构建
→ order-service 发布
→ order-service 滚动更新
```

而不是：

```
shop-web
user-service
product-service
cart-service
inventory-service
order-service
payment-service
全部重新构建
```

所以在 Luna 中，服务应该尽量是独立 Application：

```
shop-web
api-gateway
user-service
product-service
cart-service
inventory-service
order-service
payment-service
notification-service
```

每个 Application 都有独立：

```
源代码
构建记录
镜像
部署目标
发布历史
运行状态
日志
回滚记录
```

这样如果 `product-service` 出现问题，可以只回滚：

```
product-service → 上一个 Release
```

不会影响：

```
order-service
inventory-service
shop-web
```

这正是“应用交付平台”比“一个大 Workflow”更强的地方。

---

# 十二、前端和 API Gateway 如何部署

电商系统对外只暴露两个入口：

```
https://shop.example.com/
https://shop.example.com/api/*
```

内部服务不直接暴露。

Gateway API 可以通过 Gateway 和 HTTPRoute 表达这种关系：

```
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: shop-route
  namespace: shop-prod
spec:
  parentRefs:
    - name: shop-gateway
  hostnames:
    - shop.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /
      backendRefs:
        - name: shop-web
          port: 80

    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api-gateway
          port: 8080
```

之后：

```
shop.example.com/
    → shop-web

shop.example.com/api/orders
    → api-gateway
    → order-service
```

Luna 的作用是把：

```
域名
Gateway
HTTPRoute
Service
证书
应用
```

关联起来，并在 UI 中展示其状态。

例如：

```
域名：shop.example.com
DNS：已解析
HTTPRoute：Accepted
Gateway：Programmed
Certificate：Ready
Backend Service：可用
```

如果使用 cert-manager，Luna 可以编排或观察证书资源，但证书真正的申请和续期仍由 cert-manager 完成。

这体现了 Luna 的基本边界：

> Luna 负责平台级编排，不重复实现 Kubernetes、Gateway Controller、Registry 或证书系统。

---

# 十三、Luna 和 GitHub Actions 的三种组合方式

## 方式一：只使用 GitHub Actions

```
GitHub
→ GitHub Actions 测试
→ GitHub Actions 构建镜像
→ GitHub Actions 部署 Kubernetes
```

适合：

```
服务数量少
一个或少量 Kubernetes 集群
团队熟悉 YAML、kubectl、Helm
不需要统一应用控制台
```

例如一个前端和一个后端，这种方式非常够用。

## 方式二：只使用 Luna

```
GitHub Push
→ Luna Webhook
→ Luna Worker 构建
→ Luna Worker 部署
```

适合：

```
希望开发者不维护 CI/CD YAML
希望平台统一管理多个应用
希望构建发生在自己的 Kubernetes 集群
希望有项目、应用、环境和发布控制台
```

这时 GitHub 主要作为：

```
代码托管
OAuth 授权
Webhook 来源
```

Luna 产品文档明确描述，GitHub/Gitea 主要作为代码源、授权源和 Webhook 来源，而不是构建执行器。[Luna 产品边界说明](https://github.com/LiteyukiStudio/luna-devops/blob/main/docs-internal/01-%E4%BA%A7%E5%93%81%E4%B8%8E%E4%B8%80%E4%BD%93%E5%8C%96%E6%96%B9%E6%A1%88.md)

## 方式三：GitHub Actions + Luna，最推荐的学习示例

```
Pull Request
→ GitHub Actions 测试、扫描、质量门禁

Merge main
→ Luna Webhook

Luna
→ 构建正式镜像
→ 推送 Registry
→ 创建 Release
→ 部署 Kubernetes
→ 配置 Gateway
→ 跟踪状态
```

这种分工最清晰：

```
GitHub Actions = CI
Luna            = Build/CD/Runtime Delivery
```

如果公司已经有成熟 GitHub Actions 构建流程，也可以反过来：

```
GitHub Actions
→ 构建并推送镜像

Luna
→ 部署已有镜像
→ 管理 Release
→ 配置域名
→ 观察运行状态
→ 回滚
```

但一定要明确：

> 一个阶段最好只有一个系统负责。

不要让 GitHub Actions 和 Luna 同时负责正式构建，也不要让两个系统同时部署同一个 Deployment，否则容易产生：

```
重复构建
重复发布
镜像 Tag 覆盖
部署竞争
状态显示不一致
```

---

# 十四、一次完整发布的时间线

假设当前生产环境运行的是：

```
order-service Release R41
image digest = sha256:111
```

开发者提交新代码并合并：

```
commit = 82a1
```

完整流程是：

```
T0  开发者提交 Pull Request
T1  GitHub Actions 执行单元测试、集成测试
T2  Pull Request 合并到 main
T3  GitHub 发送 Push/Webhook
T4  Luna 校验仓库、分支和 Webhook
T5  Luna 创建 BuildRun B102
T6  Redis/Asynq 投递 build task
T7  Worker 创建 Kubernetes Job
T8  BuildKit 构建 order-service
T9  镜像推送到 Harbor
T10 得到 image digest sha256:222
T11 Luna 创建 Release R42
T12 Worker 更新 order-service Deployment
T13 Kubernetes 创建新 Pod
T14 Readiness Probe 通过
T15 旧 Pod 逐步退出
T16 Deployment 达到 3/3 Ready
T17 Luna 将 Release R42 标记为 succeeded
T18 UI 展示新版本、日志和运行状态
```

从此，生产环境的版本关系是：

```
Git commit 82a1
    ↓
BuildRun B102
    ↓
Image sha256:222
    ↓
Release R42
    ↓
Deployment order-service/shop-prod
```

这条链路就是 Luna 最重要的价值之一：

> 把代码、构建、镜像、发布和运行状态串成可追踪的关系。

---

# 十五、故意制造一次线上故障

现在我们制造一个更有价值的案例。

开发者修改了 `order-service`：

```
inventoryURL := os.Getenv("INVENTORY_BASE_URL")
```

但是错误地把生产环境配置成：

```
http://inventory-service:9090
```

而实际端口是：

```
8080
```

构建成功，Pod 也可能成功启动，因为：

```
进程能启动
/health 返回 200
```

但是用户下单时：

```
api-gateway
    → order-service
    → inventory-service:9090
    → connection refused
```

于是用户看到：

```
下单失败
HTTP 500
```

这时 GitHub Actions 可能只能告诉你：

```
Workflow succeeded
Deployment command succeeded
```

因为它只验证了：

```
kubectl apply 成功
kubectl rollout status 成功
```

但“业务请求是否正常”是另一层问题。

---

# 十六、如何在 Luna 中诊断这次故障

用户打开 Luna 中的 AI 助手，当前页面上下文是：

```
Project: acme-shop
Application: order-service
Target: production
Release: R42
```

用户输入：

```
order-service 发布 R42 后用户无法下单，请帮我分析原因。
```

Luna Agent 可以按以下顺序获取证据。

## 第一步：查看 Release

```
R42 是否已经成功发布
发布时间
对应 commit
对应 image digest
发布前版本 R41
```

## 第二步：查看 Deployment 状态

```
desired replicas: 3
updated replicas: 3
ready replicas: 3
available replicas: 3
```

如果都是 3，说明：

```
Kubernetes 层面的发布成功
```

但不代表业务成功。

## 第三步：查看 Pod 日志

Agent 获取最近一段脱敏日志：

```
failed to reserve inventory
dial tcp inventory-service:9090:
connect: connection refused
```

## 第四步：查看 Kubernetes Events

可能发现：

```
没有 ImagePullBackOff
没有 CrashLoopBackOff
没有调度失败
Pod 全部 Ready
```

这反而说明问题不在 Kubernetes 调度，而在应用间调用配置。

## 第五步：查看服务关系和配置

Agent 发现：

```
order-service INVENTORY_BASE_URL=http://inventory-service:9090
inventory-service containerPort=8080
```

最终给出：

```
初步根因：
order-service 使用了错误的 inventory-service 端口 9090，
而 inventory-service 实际监听 8080。

证据：
1. R42 发布成功，Pod 3/3 Ready
2. order-service 日志出现 connection refused
3. inventory-service Service 暴露端口为 8080
4. R41 使用的配置为 8080
```

注意，这里 Agent 不应该一看到日志就直接执行：

```
kubectl delete pod
kubectl edit deployment
```

Luna 的 Agent 设计强调：

```
Agent 代表当前用户工作
但不拥有超出当前用户的权限
```

当前 Luna 的 Agent 规格也明确规定，平台能力通过 OpenAPI 和已有 API 暴露，Agent 本身不直接持有用户 Cookie、Token 或任意转授权限；高风险工具调用需要经过审批。[Luna AI Agent 规格](https://github.com/LiteyukiStudio/luna-devops/blob/main/docs-internal/11-AI%E5%8A%A9%E6%89%8B%E4%B8%8EAgent%E8%A7%84%E6%A0%BC.md)

---

# 十七、如果要回滚，谁来执行

回滚是一个写操作。

Agent 可以提出：

```
检测到上一版本 R41 的配置正确。

建议：
将 order-service-production 回滚到 Release R41。

影响：
- order-service 镜像从 sha256:222 改回 sha256:111
- 不影响 product-service
- 不影响 inventory-service
- 预计触发一次滚动更新
```

然后等待用户确认：

```
[确认回滚] [取消]
```

如果当前用户有权限，并且这是高风险操作，可能还需要：

```
Step-up MFA
```

确认后调用 Luna 平台自己的回滚 API：

```
Agent
  → Luna API
  → 当前用户 Session 校验
  → 项目权限校验
  → ToolCall 审批校验
  → 执行回滚
  → 记录审计
  → 回读 Kubernetes 状态
```

而不是：

```
Agent
  → 直接执行任意 kubectl
```

最终 Agent 必须验证：

```
Release R41 是否重新生效
Deployment 是否达到 3/3 Ready
Pod 是否使用正确 image digest
order-service 日志是否恢复
Gateway/API 请求是否恢复
```

这就是“执行 → 权威回读 → 终态结论”。

如果回滚后只返回：

```
kubectl 命令执行成功
```

还不能算真正完成，因为：

```
命令成功 ≠ 业务恢复
```

---

# 十八、GitHub Actions 和 Luna 在故障处理上的差异

GitHub Actions 中，故障诊断通常需要你自己写脚本：

```
- name: Collect diagnostics
  if: failure()
  run: |
    kubectl get pods -n shop-prod
    kubectl describe pod -n shop-prod
    kubectl logs -n shop-prod deployment/order-service
    kubectl get events -n shop-prod
```

如果要自动回滚，还要自己写：

```
- name: Rollback
  if: failure()
  run: |
    kubectl rollout undo \
      deployment/order-service \
      -n shop-prod
```

而 Luna 的目标是把这些信息变成平台对象：

```
发布详情
构建日志
Pod 状态
Kubernetes Event
Gateway 状态
证书状态
发布历史
回滚按钮
Agent 诊断
```

所以可以这样总结：

```
GitHub Actions：
“我执行过哪些命令？”

Luna：
“这个应用现在处于什么状态？它为什么是这个状态？哪个版本导致了问题？怎样安全地恢复？”
```

---

# 十九、什么时候 GitHub Actions 就够了

如果你的项目只有：

```
一个前端
一个后端
一个 Kubernetes 集群
一两个环境
一个开发团队
```

那么 GitHub Actions + Helm/Argo CD 通常已经够用。

例如：

```
Pull Request
→ GitHub Actions 测试

Merge
→ GitHub Actions 构建镜像

Push 镜像
→ Argo CD 或 GitHub Actions 部署

Prometheus/Grafana
→ 监控
```

此时引入 Luna 可能增加系统复杂度。

Luna 更适合：

```
多个团队
多个项目空间
多个微服务
多个 Kubernetes 集群
需要项目成员和 RBAC
需要统一应用市场
需要统一域名和证书管理
需要中心化发布与回滚
需要开发者不直接接触 Kubernetes
需要平台级审计和资源统计
```

一个非常实际的判断方法是：

如果你发现不同仓库里反复出现这些内容：

```
docker login
docker build
docker push
kubectl apply
kubectl rollout status
kubectl get pods
kubectl logs
kubectl rollout undo
```

并且这些脚本几乎都一样，那么你可能就需要一个 Luna 这种平台，把重复的交付逻辑收敛起来。

---

# 二十、你可以如何理解 Luna 的核心价值

Luna 并不是“比 GitHub Actions 多几个按钮”。

它真正想解决的是下面这几个问题：

## 1. 从仓库中心转向应用中心

GitHub Actions 的中心是：

```
Repository → Workflow Run
```

Luna 的中心是：

```
Project → Application → Environment → Release
```

## 2. 从命令成功转向运行状态

GitHub Actions 关心：

```
命令退出码是不是 0
```

Luna 更关心：

```
应用是否真的运行
副本是否就绪
路由是否生效
证书是否正常
当前版本是什么
是否可以回滚
```

## 3. 从单仓库自动化转向平台能力复用

GitHub Actions 的很多逻辑可能散落在各个仓库。

Luna 希望统一管理：

```
构建策略
镜像仓库
运行集群
项目权限
域名
证书
发布策略
审计
通知
```

## 4. 从脚本自动化转向受控操作

GitHub Actions 中可以写任意 Shell 命令。

这很灵活，但也意味着：

```
一个错误脚本可能删除错误环境
一个权限过大的 kubeconfig 可能影响整个集群
```

Luna 更偏向：

```
固定领域操作
参数校验
权限校验
审批
MFA
幂等
审计
执行后回读
```

---

# 二十一、最适合你的学习顺序

如果你要复刻 Luna，并且希望真正理解 GitHub Actions 和 Luna 的关系，我建议你做三个版本。

## 版本一：先不用 Luna，只用 GitHub Actions

做一个简化电商系统：

```
shop-web
api-gateway
product-service
order-service
inventory-service
```

完成：

```
GitHub Actions 测试
→ 构建镜像
→ 推送 Harbor
→ Helm 部署 Kubernetes
→ 查看 Rollout
→ 手动回滚
```

你会真正理解：

```
CI
CD
Runner
镜像
Registry
Kubernetes Deployment
Helm
Secret
探针
滚动发布
```

## 版本二：自己实现一个 Luna MVP

把 GitHub Actions 中重复的发布逻辑抽出来，实现：

```
Go API
PostgreSQL
Redis
Worker
Kubernetes client-go
```

功能只做：

```
创建项目
创建应用
配置 Git 仓库
接收 Webhook
创建 BuildRun
创建 Kubernetes Job
构建镜像
创建 Release
部署 Deployment
查看状态
回滚
```

此时你会理解：

```
控制平面
异步任务
任务状态机
幂等
最终一致性
Kubernetes API
构建隔离
发布记录
```

## 版本三：加入 Agent

最后再实现：

```
查询发布状态
读取构建日志
读取 Pod 日志
读取 Kubernetes Event
生成诊断结论
申请回滚
审批
MFA
回滚后验证
```

这样 Agent 不是一个孤立的聊天窗口，而是：

```
Luna 平台已有能力的自然语言入口
```

最终你能展示这样一个简历项目：

```
基于 Go 和 Kubernetes 实现应用交付控制平面，
支持 GitHub Webhook、Rootless BuildKit、OCI Registry、
多环境部署、Release 回滚、Gateway API 域名管理、
OpenTelemetry 可观测性和具备 RBAC/审批/MFA 的 DevOps Agent。
```

顺便纠正前面回答中的一个版本细节：截至当前仓库的 `main`，Luna 的 AI 方案文档已经明确采用“显式 ModelRuntime + RunExecutor”的架构描述，不能再简单固定说成必须使用 LangGraph.js；项目仍在快速迭代，复刻时应以你固定的 commit 和当时的文档为准。[当前 Luna README](https://github.com/LiteyukiStudio/luna-devops) [当前 Agent 规格](https://github.com/LiteyukiStudio/luna-devops/blob/main/docs-internal/11-AI%E5%8A%A9%E6%89%8B%E4%B8%8EAgent%E8%A7%84%E6%A0%BC.md)