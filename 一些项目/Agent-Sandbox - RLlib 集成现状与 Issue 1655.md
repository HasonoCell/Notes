# Agent Sandbox 的 RLlib 集成现状与 Issue #1655

这篇笔记从 agent-sandbox 已经具备的基础能力出发，梳理现有 Sandbox、Python SDK、
Ray、Gymnasium 和 RL 基础设施分别完成了什么，当前缺失的链路是什么，以及
[#1655](https://github.com/kubernetes-sigs/agent-sandbox/issues/1655) 准备解决什么问题。

## 一、agent-sandbox 最基础解决的问题

在 Agentic RL 场景中，模型可能生成并执行代码：

```bash
python solution.py
```

也可能生成危险代码：

```bash
rm -rf /workspace/*
```

如果这些代码直接运行在训练进程或者 Ray Worker 中，就可能破坏：

- 模型文件；
- 训练数据；
- Ray Worker；
- 其他并行任务；
- Kubernetes 凭证和集群内部服务。

因此需要把可信训练程序和不可信代码分开：

```text
可信训练程序
      ↓ 发送代码
隔离 Sandbox
      ↓ 执行不可信代码
      ↓ 返回结果
可信训练程序
```

agent-sandbox 定义了 `Sandbox` CRD。用户声明一个 Sandbox，Controller 负责创建和
维护底层 Pod、PVC 和可选 Service：

```text
Sandbox CR
    ↓ Sandbox Controller
Pod / PVC / Service
```

这一层解决的是：

> 如何在 Kubernetes 中声明、创建并管理一个具有稳定身份的隔离执行环境。

它本身不理解强化学习，也不知道 Observation、Action、Reward、Policy 或 PPO。

## 二、Template、WarmPool 和 Claim 解决的问题

强化学习和评估任务通常需要运行大量 Episode。如果每次都从零创建 Pod：

```text
创建 Pod
拉取镜像
启动容器
等待 Ready
执行任务
删除 Pod
```

启动成本会直接进入采样延迟。

Extensions 提供：

```text
SandboxTemplate
→ 描述 Sandbox 应该长什么样

SandboxWarmPool
→ 提前创建一批已经 Ready 的 Sandbox

SandboxClaim
→ 训练任务快速认领一个 Sandbox
```

训练系统可以执行：

```text
Episode 开始
    ↓
从 WarmPool 认领一个 Sandbox
    ↓
执行代码并收集结果
    ↓
Episode 结束
    ↓
释放或清理 Sandbox
```

这一层解决的是：

> 如何高效、大规模地准备和分配 Sandbox。

它同样不负责训练 Policy。

## 三、Python SDK 解决的问题

训练程序不必直接操作 Sandbox CRD，可以使用 Python SDK：

```python
client = SandboxClient(...)

sandbox = client.create_sandbox(
    warmpool="training-pool",
)

result = sandbox.commands.run("python solution.py")

sandbox.terminate()
```

SDK 负责：

- 创建和删除 SandboxClaim；
- 等待 Sandbox Ready；
- 运行命令；
- 上传和下载文件；
- 选择 tunnel、gateway、in-cluster、direct 等连接方式；
- 清理资源。

调用关系是：

```text
Python 训练程序
      ↓ SandboxClient
SandboxClaim / Sandbox
      ↓
Sandbox Pod
```

这一层解决的是：

> Python 程序如何方便地创建、连接和操作 Sandbox。

SDK 仍然不负责 RL 训练。

## 四、现有 Ray 集成已经做了什么

项目已有 [Ray Integration Example](https://github.com/kubernetes-sigs/agent-sandbox/tree/main/examples/ray-integration)，
展示 Ray Actor 如何调用 Python SDK，让不可信代码在独立 Sandbox 中运行：

```text
Ray Actor
    ↓ Agent Sandbox SDK
Sandbox
    ↓
执行不可信代码
```

现有 PoC 大致包含：

```python
@ray.remote
class RLEnvironmentWorker:
    def __init__(self):
        self.client = SandboxClient(...)
        self.sandbox = self.client.create_sandbox(...)

    def step(self, action_code):
        self.sandbox.files.write(...)
        result = self.sandbox.commands.run(...)
        return observation, reward, done
```

它证明了：

> Ray Actor 可以控制独立 Sandbox，让危险代码远离可信 Ray Worker。

也就是说，下面这条链路已经存在：

```text
Ray → Agent Sandbox SDK → Sandbox Pod
```

### 现有 Ray Example 没有真正训练 Policy

现有 PoC 中的错误和正确 Action 是人预先写好的：

```python
destructive_action = "..."
correct_action = "..."
```

现有模拟生产循环中还存在：

- 随机生成 Observation；
- 随机选择 Action；
- 使用假的权重列表；
- 用数值加 `0.01` 模拟梯度更新；
- 没有使用 RLlib；
- 没有真正实现 PPO。

因此现有 Ray Example 展示的是：

```text
Ray 可以并行控制 Sandbox
```

但没有展示：

```text
RLlib 可以通过 SandboxEnv 训练出一个 Policy
```

## 五、现有 Gymnasium 集成已经做了什么

项目已有真正的 [`SandboxEnv`](https://github.com/kubernetes-sigs/agent-sandbox/blob/main/clients/integrations/gymnasium/k8s_agent_sandbox_gymnasium/gymnasium_env.py)，
它把 Sandbox SDK 包装成标准 Gymnasium 接口：

```python
obs, info = env.reset()

obs, reward, terminated, truncated, info = env.step(action)

env.close()
```

内部关系是：

```text
env.reset()
    ↓
释放上一轮 Sandbox
    ↓
通过 SandboxClient 创建或认领新 Sandbox

env.step("shell command")
    ↓
在 Sandbox 中执行命令
    ↓
将 stdout/stderr 作为 Observation
    ↓
RewardFn 计算 Reward
    ↓
TerminationFn 判断是否结束

env.close()
    ↓
清理 Sandbox
```

这条链路已经存在：

```text
Gymnasium → Agent Sandbox SDK → Sandbox Pod
```

### 当前 SandboxEnv 是文本环境

现有空间为：

```python
action_space = spaces.Text(...)
observation_space = spaces.Text(...)
```

例如：

```text
Action:
"mkdir -p /workspace/output"

Observation:
"command completed successfully"
```

这是一个通用设计，因为 AI Agent 的动作天然可能是任意 Shell 命令。

但普通 RLlib PPO 默认更适合固定形状的数值输入和有限或连续的数值 Action。它不
知道如何直接为无限多种、长度不固定的 Shell 命令构造动作分布，也不能直接把任意
字符串交给普通神经网络。

因此当前状态是：

```text
SandboxEnv 已经是 Gymnasium Environment
但 Text Action / Observation 不能直接用于普通 RLlib PPO 示例
```

## 六、现有 TRL Notebook 做了什么

项目已有一个使用 Hugging Face TRL PPO 的 Notebook：

```text
Qwen 代码模型
    ↓ 生成 Shell 命令文本
SandboxEnv
    ↓ 在 Sandbox 中执行
Reward
    ↓
TRL PPO 更新语言模型
```

这已经接近真正的 LLM 强化学习，但这里使用的是：

```python
from trl import PPOTrainer
```

而不是 Ray RLlib：

```text
Hugging Face TRL
→ 面向 Transformer / LLM 后训练

Ray RLlib
→ 通用、分布式强化学习框架
```

所以现有 Notebook 不能回答：

> 如何让 RLlib 的 EnvRunner 并行运行多个 SandboxEnv，并通过 Learner 训练、保存和
> 评估 Policy？

## 七、agent-sandbox-rl 解决了什么

仓库中的 [`examples/agent-sandbox-rl`](https://github.com/kubernetes-sigs/agent-sandbox/tree/main/examples/agent-sandbox-rl)
主要解决 Sandbox Fleet 问题，包括：

- 大规模 WarmPool；
- 多集群；
- 批量 Sandbox 分配；
- SWE-bench 与 R2E-Gym 适配；
- Sandbox 回收和复用；
- 容量、并发和放置策略；
- 异常清理和孤儿资源回收。

它主要回答：

```text
如何高效准备和管理几百、几千个 Sandbox？
```

而不是：

```text
如何使用 PPO 根据 Trajectory 更新 Policy？
```

所以它是 RL 基础设施，但不是 RLlib Policy 训练实现。

## 八、目前已经存在的三条局部链路

### Sandbox 基础设施

```text
SandboxTemplate
      ↓
SandboxWarmPool
      ↓
SandboxClaim
      ↓
Sandbox Pod
```

### Ray 与 Sandbox

```text
Ray Actor
      ↓
Sandbox SDK
      ↓
Sandbox Pod
```

但现有 Action、Observation 和训练更新是人工或模拟的。

### Gymnasium 与 Sandbox

```text
Gymnasium SandboxEnv
      ↓
Sandbox SDK
      ↓
Sandbox Pod
```

但 Action 和 Observation 是任意文本，普通 RLlib PPO 不能直接使用。

因此缺失的是：

```text
RLlib
  ?
Gymnasium SandboxEnv
```

这正是 Issue #1655 要补上的位置。

## 九、Issue #1655 要做什么

[#1655](https://github.com/kubernetes-sigs/agent-sandbox/issues/1655) 的目标是：

> 提供一个真实可运行的 RLlib 训练与评估程序，让 RLlib 能够通过现有 SandboxEnv
> 在真实 Sandbox 中完成采样、训练和评估。

完成后的完整链路应当是：

```text
RLlib Algorithm
        ↓
EnvRunner
        ↓
RLModule / Policy
        ↓ 选择数字 Action
Adapter / Wrapper
        ↓ 转换成 Shell 命令
SandboxEnv
        ↓
SandboxClient
        ↓
Sandbox Pod 执行命令
        ↓
返回 stdout/stderr
        ↓
Adapter 转成数值 Observation
        ↓
EnvRunner 记录 Trajectory
        ↓
Learner 更新 Policy
```

这才是当前真正缺失的端到端链路。

## 十、为什么需要 Wrapper

现有 `SandboxEnv` 是：

```text
Text Action → Text Observation
```

一个小型、可复现的普通 RLlib PPO 示例更适合：

```text
Discrete Action → Fixed Numeric Observation
```

因此 Issue 可以定义一个任务相关的 Wrapper。

例如使用文件任务：

> 在全新的 Sandbox 中创建 `/workspace/output/result.txt`，内容必须为 `hello`。

Action Space 可以是：

```text
0 → 查看状态
1 → 创建 output 目录
2 → 写入 result.txt
3 → 删除错误文件
```

Observation Space 可以是：

```python
[
    directory_exists,
    file_exists,
    content_is_correct,
    remaining_steps,
]
```

Policy 看到：

```python
[0, 0, 0, 5]
```

并选择：

```python
action = 1
```

Wrapper 将它翻译成：

```bash
mkdir -p /workspace/output
```

Sandbox 执行后，新 Observation 可能变成：

```python
[1, 0, 0, 4]
```

Policy 再选择 Action 2，Wrapper 执行：

```bash
echo hello > /workspace/output/result.txt
```

最终返回：

```python
observation = [1, 1, 1, 3]
reward = 1.0
terminated = True
```

这段交互形成 Trajectory：

```text
[0,0,0,5] → Action 1 → Reward -0.01
[1,0,0,4] → Action 2 → Reward +1.00
```

Learner 根据大量 Trajectory 更新 Policy，使它逐渐学会：

```text
没有目录时 → 创建目录
有目录但没有正确文件时 → 写入文件
任务完成后 → Episode 结束
```

## 十一、Gymnasium 与 RLlib 在这里的分工

### Gymnasium / SandboxEnv 负责世界

```text
初始环境是什么
Action 执行后环境如何变化
返回什么 Observation
给多少 Reward
什么时候 terminated
什么时候 truncated
```

### RLlib 负责学习

```text
Policy 如何根据 Observation 选择 Action
如何收集 Trajectory
如何构建训练 Batch
如何更新 Policy
如何并行采样
如何保存 checkpoint
如何评估训练后的 Policy
```

SandboxEnv 不需要知道 Action 是随机产生的，还是由 Policy 产生的：

```text
Gymnasium 环境完全没有变化，
我们只是替换了选择 Action 的方式。

随机采样                    Policy
   ↓                         ↓
action_space.sample()   policy(observation)
```

## 十二、Ray 在这里的作用

只运行一个环境时：

```text
一个 EnvRunner
    ↓
一个 SandboxEnv
    ↓
一个 Sandbox
```

并行运行时：

```text
EnvRunner 1 → SandboxEnv 1 → Sandbox 1
EnvRunner 2 → SandboxEnv 2 → Sandbox 2
EnvRunner 3 → SandboxEnv 3 → Sandbox 3
```

Ray 负责：

- 运行这些 EnvRunner Actor；
- 将它们放到多个进程或机器上；
- 把 Trajectory 交给 Learner；
- 同步更新后的 RLModule 参数。

每个 EnvRunner 必须拥有独立 Sandbox。如果两个 EnvRunner 共用一个 Sandbox：

```text
EnvRunner 1 创建了 result.txt
EnvRunner 2 还没有执行 Action，却观察到文件已经存在
```

那么 EnvRunner 2 的 Observation 就不再是自己 Action 导致的结果，强化学习依赖的
因果关系被破坏。

因此 Issue #1655 还需要验证：

> 多个 EnvRunner 能够创建、使用和清理互相独立的 Sandbox 环境。

## 十三、KubeRay 在这里的位置

KubeRay 负责在 Kubernetes 中部署和管理 Ray Cluster，它不会改变训练逻辑。

不使用 KubeRay 时：

```text
本地机器
└── Ray
    ├── EnvRunner 1
    ├── EnvRunner 2
    └── Learner
```

这些本地 Ray 进程仍然可以通过 SDK 访问 Kubernetes 中的 Sandbox。

使用 KubeRay 后：

```text
Kubernetes
├── Ray Head Pod
├── Ray Worker Pod
│   ├── EnvRunner
│   └── Learner
└── 独立 Sandbox Pods
```

变化的主要是：

```text
Ray 进程从本地机器搬到了 Kubernetes Pod
```

下面这些概念和代码逻辑没有因此改变：

- Gymnasium；
- Wrapper；
- Action；
- Observation；
- Reward；
- Policy；
- PPO；
- EnvRunner；
- Learner。

因此 Issue #1655 可以按以下顺序推进：

```text
1. 先实现和测试单个 Gymnasium Wrapper
2. 使用本地 RLlib 和一个 EnvRunner 跑通训练
3. 使用多个 EnvRunner 验证独立 Sandbox 生命周期
4. 接入真实 Sandbox 做端到端训练和评估
5. 最后再决定是否需要补充 KubeRay / RayJob 部署
```

Issue 当前要求的是真实 Sandbox、集群前置条件和 cluster-backed smoke test，并没有
要求学习和实现工作的第一步就必须从 KubeRay 开始。

## 最终主线

```text
Agent Sandbox
提供安全、快速、可批量分配的执行环境
        ↓
Python SDK
让训练程序能够创建和操作 Sandbox
        ↓
SandboxEnv
把 Sandbox 包装成 Gymnasium Environment
        ↓
Wrapper
把文本 Action / Observation 转成 RLlib 可处理的数值空间
        ↓
RLlib EnvRunner
并行与环境交互，收集 Trajectory
        ↓
RLlib Learner
更新 Policy
        ↓
checkpoint + evaluation
验证 Policy 确实学会了任务
```

一句话概括 Issue #1655：

> agent-sandbox 已经提供了安全、快速、可批量分配的执行环境；Gymnasium 已经把它
> 包装成 RL Environment；Ray 已经能并行控制这些 Sandbox；Issue #1655 要补上最后
> 一段，让 RLlib 真正利用这个环境采样、训练、保存并评估一个 Policy。

