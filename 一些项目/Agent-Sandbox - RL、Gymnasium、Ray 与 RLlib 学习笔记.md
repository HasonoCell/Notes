# RL、Gymnasium、Ray 与 RLlib 学习笔记

这篇笔记记录为了理解 agent-sandbox 的 RLlib 集成而补充的强化学习、Gymnasium、
Ray、RLlib 与 KubeRay 前置知识。目标不是一次学完强化学习理论，而是先建立一条能够
解释真实系统如何工作的主线。

## 一张总览图

```text
强化学习概念
Observation → Policy → Action → Environment → Reward
                         ▲                    │
                         └──── 新 Observation ┘

Gymnasium
把 Environment 统一成 reset() / step() / Space 接口

RLlib
运行 EnvRunner 收集轨迹，让 Learner 更新 Policy

Ray
把 EnvRunner、Learner 等组件放到多个进程或机器上运行

KubeRay
把 Ray 集群部署和管理在 Kubernetes 中

Agent Sandbox
为 Environment 提供真正隔离的代码执行空间
```

## 强化学习与监督学习的区别

监督学习通常提前提供输入和标准答案：

```text
输入：一张猫的图片
标签：猫
```

模型可以直接比较预测结果和标签之间的差距。

强化学习通常不会告诉 Agent 每一步应该选择什么动作，而是让 Agent 与环境交互，
再根据结果给予奖励或惩罚：

```text
看到当前情况
      ↓
选择一个动作
      ↓
环境发生变化
      ↓
获得奖励
      ↓
调整选择动作的方式
      ↺
```

因此，强化学习不是完全没有评价标准，而是没有监督学习那样逐条提供的标准答案。
它只告诉 Agent 某些结果好不好，Agent 需要自己发现哪些动作能够带来更好的长期结果。

## 强化学习的核心概念

### Environment

Environment 是 Agent 所处的世界，它规定：

- 当前世界是什么状态；
- 执行动作后世界如何变化；
- Agent 能观察到什么；
- Agent 会得到多少 Reward；
- 一轮任务什么时候结束。

在 agent-sandbox 场景中，Environment 可以是一个文件任务：Agent 需要在隔离的
Sandbox 中创建指定目录和文件。

### Observation

Observation 是 Agent 当前能够看到的信息。

```text
Environment 的完整状态
          ↓ 只暴露一部分
      Observation
```

例如 Sandbox 内部包含进程、文件、网络和系统状态，但 Agent 可能只看到：

```text
目标目录是否存在
目标文件是否存在
文件内容是否正确
还剩多少步
```

Observation 不一定等于完整 State。Agent 经常只能看到环境的一部分。

### Action

Action 是 Agent 对环境采取的动作，例如：

```text
0 → 查看目录
1 → 创建 output 目录
2 → 写入 result.txt
3 → 删除错误文件
```

在 Sandbox 中，Action 最终可以被翻译成 Shell 命令并执行。

### Reward

Reward 是某一步交互后得到的即时反馈：

```text
普通操作       -0.01
无效操作       -0.10
完成任务       +1.00
```

Reward 通常是人设计的评价规则，并非天然存在。奖励设计不合理时，Policy 可能学到
钻规则漏洞的行为，而不是我们真正想要的行为。

### Policy

Policy 决定在某个 Observation 下选择哪个 Action：

```text
Policy：Observation → Action
```

数学上常写作：

```text
π(action | observation)
```

它表示在给定 Observation 时，各个 Action 被选中的概率。

```text
Observation：目标目录不存在

Action 0：10%
Action 1：80%
Action 2：10%
```

Policy 可以是规则、表格或神经网络。在 RLlib 中，它通常由一个可训练的神经网络
承载。

### Episode

Episode 是从环境初始化到任务结束的一整轮交互：

```text
reset()
  ↓
Observation 0
  ↓ Action 0
Observation 1 + Reward 0
  ↓ Action 1
Observation 2 + Reward 1
  ↓
任务成功、失败或超时
```

### Trajectory 和 Transition

一次 `step()` 产生一条 Transition：

```text
(Observation, Action, Reward, Next Observation, Done)
```

连续多步 Transition 组成一条 Trajectory：

```text
(o0, a0, r0, o1, a1, r1, o2, ...)
```

如果轨迹覆盖从 `reset()` 到最终结束的全过程，它也构成一个完整 Episode。

## Reward 与 Return

Reward 只评价当前一步，Return 评价从当前开始的整段未来。

假设某个 Episode 的 Reward 是：

```text
-1, -1, -1, +10
```

不考虑折扣时，总 Return 为：

```text
G = -1 - 1 - 1 + 10 = 7
```

强化学习通常希望最大化长期 Return，而不是只追求眼前 Reward。

例如：

```text
动作 A：创建必要目录
即时 Reward：-1
未来完成任务：+10

动作 B：什么也不做
即时 Reward：0
未来无法完成任务：0
```

只看眼前时 B 更好，但考虑长期 Return 时 A 更好。

### 折扣因子

常见的折扣 Return 是：

```text
G = r0 + γr1 + γ²r2 + γ³r3 + ...
```

其中 `γ` 读作 gamma：

```text
γ 越接近 0 → 越看重眼前奖励
γ 越接近 1 → 越看重长期结果
```

## Gymnasium 是什么

Gymnasium 是描述强化学习环境的一套标准 Python 接口。它本身通常不负责训练
Policy，也不规定必须使用 PPO、DQN 或其他算法。

可以把 Gymnasium 看成环境和训练框架之间的通用接口：

```text
各种环境                         各种训练框架

小游戏 ───────┐                 ┌── RLlib
机器人模拟 ───┼── Gymnasium ────┼── Stable-Baselines3
Sandbox ──────┘                 └── 自己编写的算法
```

### reset()

```python
observation, info = env.reset()
```

`reset()` 开始一个新的 Episode，并返回初始 Observation。

对于 Sandbox 环境，它可能负责：

- 释放上一轮 Sandbox；
- 创建或认领一个新的 Sandbox；
- 初始化任务；
- 返回初始 Observation。

### step()

```python
observation, reward, terminated, truncated, info = env.step(action)
```

返回值分别表示：

- `observation`：执行动作后的新观察；
- `reward`：这一步的反馈；
- `terminated`：任务在逻辑上已经成功或失败；
- `truncated`：任务因步数、时间或资源限制被迫停止；
- `info`：日志、退出码、耗时等辅助信息。

区别可以记成：

```text
terminated：任务本身得出了结论
truncated：任务没有正常做完，但外部限制要求停止
```

### Action Space 与 Observation Space

Gymnasium 要求环境声明合法 Action 和 Observation 的类型与范围。

常见 Space：

```text
Discrete(n)  → 0 到 n-1 的有限选择
Box          → 固定形状的连续数值
Dict         → 多个字段组合
Text         → 字符串
```

例如：

```python
action_space = spaces.Discrete(4)

observation_space = spaces.Box(
    low=0,
    high=1,
    shape=(3,),
)
```

## Gymnasium 与 Policy 的职责边界

这是理解整套系统最重要的锚点之一。

Gymnasium Environment 负责：

- 接收 Action；
- 改变环境；
- 返回 Observation；
- 计算 Reward；
- 判断 Episode 是否结束。

Policy 负责：

- 根据 Observation 选择 Action。

手动运行环境时，可以随机选动作：

```python
action = env.action_space.sample()
```

换成 Policy 后：

```python
action = policy(observation)
```

关键对照：

```text
Gymnasium 环境完全没有变化，
我们只是替换了选择 Action 的方式。

随机采样                    Policy
   ↓                         ↓
action_space.sample()   policy(observation)
```

也就是说：

> 环境负责世界如何运转，Policy 负责在这个世界里如何行动。

## 手动运行一个 Gymnasium Episode

```python
observation, info = env.reset()

terminated = False
truncated = False
total_reward = 0

while not terminated and not truncated:
    action = env.action_space.sample()

    next_observation, reward, terminated, truncated, info = env.step(action)

    total_reward += reward
    observation = next_observation

env.close()
```

训练框架的底层仍然是这个循环，只是它还会：

1. 记录每一步 Transition；
2. 收集许多 Trajectory；
3. 根据 Return 更新 Policy；
4. 重复采样和更新。

## Wrapper 的作用

Wrapper 是套在 Gymnasium Environment 外面的一层适配器。

假设原始 SandboxEnv 接收文本命令：

```python
env.step("echo hello > result.txt")
```

Wrapper 可以把数字 Action 转换为命令：

```text
0 → ls /workspace
1 → mkdir -p /workspace/output
2 → echo hello > /workspace/output/result.txt
```

环境返回文本后，Wrapper 再将其转换为固定形状的数字：

```text
目录不存在                   → [0, 0, 0, 5]
目录存在、文件不存在          → [1, 0, 0, 4]
文件存在且内容正确            → [1, 1, 1, 3]
```

于是 RLlib 只看到标准数值接口，而不需要理解 Shell 命令和 stdout/stderr。

## RLlib 是什么

RLlib 不只是一个 Policy。它负责围绕 Policy 的整套训练过程：

- 运行 Environment；
- 收集 Trajectory；
- 构建训练 Batch；
- 使用 PPO 等算法更新模型；
- 并行采样与学习；
- 保存 checkpoint；
- 恢复和评估 Policy；
- 汇总训练指标。

更准确的分工是：

```text
Gymnasium：负责出题、执行动作并打分
RLlib：负责让学生答题、收集经验并改进策略
Policy：正在被训练的答题策略
PPO：更新 Policy 的一种学习方法
```

## 采样与学习为什么分开

强化学习训练包含两类性质不同的工作。

### 采样

```text
Policy 与 Environment 交互
          ↓
产生 Observation、Action、Reward 和 Trajectory
```

在 Sandbox 场景中，采样可能需要创建 Sandbox、传输命令、等待 Pod 执行并获取结果，
主要消耗环境运行时间。

### 学习

```text
大量 Trajectory
      ↓
计算 loss 和梯度
      ↓
更新 Policy 参数
```

学习主要是 PyTorch 数值计算，可以使用 CPU 或 GPU。

完整闭环：

```text
EnvRunner 采样
      ↓
Learner 学习
      ↓
同步新的 Policy 参数
      ↓
EnvRunner 再采样
      ↺
```

## RLlib 的核心组件

### Algorithm

`Algorithm` 是一次 RL 实验的总指挥，例如 PPO Algorithm。它负责创建和协调
EnvRunner、Learner、模型参数同步、checkpoint 和评估。

### EnvRunner

EnvRunner 持有 Gymnasium Environment 和当前模型副本，负责运行经典环境循环并
收集 Episode：

```text
EnvRunner
├── Gymnasium Environment
├── 当前 RLModule 的推理副本
├── Episode 状态
└── 收集到的 Trajectory
```

在 agent-sandbox 场景中，可以形成：

```text
EnvRunner 1 → SandboxEnv 1 → Sandbox 1
EnvRunner 2 → SandboxEnv 2 → Sandbox 2
```

多个 EnvRunner 不能共享同一个 Sandbox，否则环境状态会互相污染。

### Learner

Learner 接收 EnvRunner 收集的经验，计算 loss、梯度并更新模型参数。

```text
EnvRunner 收集 Trajectory
             ↓
          Learner
             ↓
      更新 RLModule 参数
             ↓
      同步回 EnvRunner
```

### RLModule 与 Policy

Policy 是概念：

```text
Observation → Action
```

RLModule 是当前 RLlib 中承载神经网络及其探索、推理和训练计算逻辑的主要对象。

```text
概念上的 Policy
        ↓
RLlib 中通常由 RLModule 承载
        ↓
内部可能是 PyTorch 神经网络
```

EnvRunner 使用推理副本计算 Action，Learner 使用训练副本计算 loss 和梯度。

## Ray Core 的三个概念

Ray 是让 Python 函数和对象跨进程、跨机器并行运行的分布式执行框架。

### Task

Task 是异步远程执行的函数：

```python
@ray.remote
def square(x):
    return x * x

result_ref = square.remote(4)
```

它适合：

```text
输入 → 执行一次计算 → 返回输出
```

### Actor

Actor 是能够长期存在、在多次方法调用间保存状态的远程对象：

```python
@ray.remote
class Counter:
    def __init__(self):
        self.value = 0

    def increment(self):
        self.value += 1
        return self.value
```

EnvRunner 需要保存 Environment、Policy 副本和 Episode 状态，因此适合由 Actor
承载，而不是一次性的 Task。

### ObjectRef

ObjectRef 是远程计算结果的引用：

```python
result_ref = square.remote(4)
result = ray.get(result_ref)
```

可以把它理解成取件码：提交计算后立即得到引用，需要实际结果时再通过 `ray.get()`
等待并取回。

## Ray Actor 与 Sandbox 不是同一个东西

```text
Ray EnvRunner Actor
≠
Sandbox Pod
```

更准确的结构是：

```text
EnvRunner Actor
运行在可信的 Ray Worker 中
      ↓
内部运行 SandboxEnv
      ↓
SandboxEnv 使用 Agent Sandbox SDK
      ↓
代码在独立 Sandbox Pod 中执行
```

Ray Actor 负责运行采样逻辑，Sandbox 负责隔离不可信代码。

## KubeRay 如何映射到 Kubernetes

KubeRay 是在 Kubernetes 中管理 Ray 集群的 Operator，主要提供：

```text
RayCluster
RayJob
RayService
```

一个 RayCluster 通常包含：

```text
Kubernetes Cluster
└── Ray Cluster
    ├── Head Pod
    │   ├── Ray 控制组件
    │   └── 通常运行 Driver
    └── Worker Pods
        ├── EnvRunner Actors
        ├── Learner Actors
        └── 其他 Tasks / Actors
```

在 KubeRay 语境中，一个 Ray Node 通常由一个 Kubernetes Pod 实现，不等于一台
Kubernetes 物理 Node。

### Driver

Driver 是启动和控制 Ray 应用的主 Python 进程。它连接 Ray Cluster、创建 RLlib
Algorithm、发起训练、保存 checkpoint 并收集结果。

通过 Ray Jobs API 提交时，Driver 通常运行在 Head Pod 中。

### 两套调度系统

```text
Kubernetes Scheduler
→ 决定 Ray Pod、Sandbox Pod 运行在哪台 Kubernetes Node

Ray Scheduler
→ 决定 EnvRunner、Learner 等 Actor 运行在哪个 Ray Worker
```

因此可以记成：

```text
Kubernetes 调度 Pod
Ray 调度 Python 计算
```

## KubeRay 与 Agent Sandbox 的完整拓扑

```text
Kubernetes Cluster
│
├── KubeRay Operator
│
├── Ray Head Pod
│   ├── Driver
│   └── RLlib Algorithm
│
├── Ray Worker Pod 1
│   └── EnvRunner Actor 1
│       └── SandboxEnv 1
│
├── Ray Worker Pod 2
│   └── EnvRunner Actor 2
│       └── SandboxEnv 2
│
├── Ray Worker Pod 3
│   └── Learner Actor
│
├── Agent Sandbox Controller
│
├── Sandbox Pod 1
│   └── 执行 EnvRunner 1 发出的命令
│
└── Sandbox Pod 2
    └── 执行 EnvRunner 2 发出的命令
```

Ray Worker Pod 与 Sandbox Pod 应当分离：

```text
可信控制面：Ray Worker + EnvRunner
                    ↓ 受控调用
不可信执行面：独立 Sandbox Pod
```

## 一次 Action 的完整旅程

```text
1. EnvRunner 中的 RLModule 根据 Observation 输出 Action
2. Wrapper 将数字 Action 转换成 Shell 命令
3. SandboxEnv 调用 Agent Sandbox SDK
4. 命令到达 Sandbox Pod
5. Sandbox Runtime 执行命令
6. stdout、stderr 和 exit code 返回 SandboxEnv
7. Wrapper 将结果转成数值 Observation
8. EnvRunner 记录 Transition，形成 Trajectory
9. Learner 使用 Trajectory 更新 RLModule
10. 新参数同步回 EnvRunner，开始下一轮采样
```

## 最终记忆主线

```text
Gymnasium
定义世界如何运行

Policy
决定在这个世界中如何行动

RLlib
收集经验并训练 Policy

Ray
让采样和学习跨进程、跨机器运行

KubeRay
把 Ray 集群部署到 Kubernetes

Agent Sandbox
让不可信代码在独立隔离环境中执行
```

## 参考资料

- [Gymnasium 文档](https://gymnasium.farama.org/)
- [RLlib Key Concepts](https://docs.ray.io/en/latest/rllib/key-concepts.html)
- [RLlib Scaling Guide](https://docs.ray.io/en/latest/rllib/scaling-guide.html)
- [Ray Core Key Concepts](https://docs.ray.io/en/latest/ray-core/key-concepts.html)
- [Ray on Kubernetes](https://docs.ray.io/en/latest/cluster/kubernetes/index.html)
- [Agent Sandbox 与 Ray/KubeRay 集成示例](https://docs.ray.io/en/latest/cluster/kubernetes/examples/rayjob-agent-sandbox.html)

