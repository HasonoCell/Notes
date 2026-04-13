## 阶段 1：现在到 2026 年 5 月初

核心目标：完成 MIT 6.S081，并建立 OS 到推理系统的映射感

### 你要做的事

- 主线完成 MIT 6.S081
- 学操作系统时，重点关注这些和未来推理平台有关的概念：
  - 进程/线程
  - 调度
  - 同步与锁
  - 虚拟内存
  - 页表/分页
  - 文件描述符/socket/poll
  - syscall/context switch
  - 基本性能分析思维
- 并行做非常轻量的 AI 预热，只建立词汇感：
  - token
  - attention
  - prefill
  - decode
  - KV cache

### 这个阶段项目怎么安排

这个阶段不做正式开发，只做一件事：

- 确定项目方向：未来主项目做 Go + AI Gateway / 推理平台外围基础设施

你现在其实已经完成了这一步的大半。这个阶段不需要再细化接口设计、技术选型、架构
分层，只要把方向定住就行。

### 这个阶段的产出

- 6.S081 收尾
- 一份简短笔记：
  - OS concepts that will matter for inference systems
- 项目方向明确，但不进入具体实现

---

## 阶段 2：2026 年 5 月初到 2026 年 6 月中旬

核心目标：补齐 Transformer 推理和 LLM serving 基础认知

这是你从 OS 正式切到 AI Infra 推理平台知识层的阶段。

### 你要做的事

第一部分：最小深度学习基础

- tensor
- 矩阵乘法
- embedding
- softmax
- layernorm
- forward / backward 的基本含义

第二部分：Transformer 推理

- token -> embedding
- self-attention
- Q / K / V
- causal mask
- decoder-only transformer
- prefill
- decode
- KV cache

第三部分：LLM serving 基础术语

- continuous batching
- TTFT
- ITL
- throughput
- latency
- prefix cache
- paged attention
- radix cache
- chunked prefill
- speculative decoding

### 这个阶段项目怎么安排

这个阶段开始进入项目准备期，但仍然不是大规模编码期。

你要做的是：

- 在脑子里把项目和知识建立映射
- 形成一版非常轻的项目草图：
  - 这个项目要解决什么问题
  - 它和推理平台的关系是什么
  - 它未来至少应该包含哪些基础能力

这时你可以开始记录项目需求，但不要陷入工程实现。

换句话说，这个阶段项目动作是：

- 项目定义和边界确认
- 不正式开工，不追求产出代码

### 这个阶段的产出

- 你能完整解释一次 LLM 推理请求流程
- 你能说清 prefill / decode / KV cache
- 你能说清 serving 为什么关注延迟、吞吐、显存、batching
- 一份轻量项目定义文档：
  - 为什么做 Go AI Gateway
  - 它未来大概有哪些核心模块

---

## 阶段 3：2026 年 6 月中旬到 2026 年 9 月左右

核心目标：进入推理系统实现层，并正式启动项目

这个阶段就是你把前面知识真正落到系统上的阶段。

我建议把它拆成两个子阶段。

---

### 阶段 3A：2026 年 6 月中旬到 2026 年 7 月中下旬

核心目标：读推理系统实现，同时启动项目 MVP

### 你要做的事

系统学习部分

- 先读 mini-sglang
- 再结合 vLLM / SGLang 官方文档看大系统设计
- 重点看这些模块：
  - 请求入口
  - request lifecycle
  - scheduler / batching
  - cache
  - streaming
  - router / worker

### 这个阶段项目怎么安排

这是正式开工的时间点。

项目目标不是做大而全，而是做 MVP。

建议这个阶段只做最小闭环：

- /v1/models
- /v1/chat/completions
- SSE streaming
- 基本鉴权
- 单一或简单多后端转发
- timeout / cancel
- 基础日志

注意，这个阶段项目的意义是：

- 帮你把 serving 概念真正工程化
- 帮你在读 mini-sglang / SGLang 时有自己的对照物

不要在这个阶段一开始就加 Redis 限流、复杂调度、控制台、MQ、配额系统。那样会把节
奏搞乱。

### 这个阶段的产出

- 一份“推理请求生命周期图”
- mini-sglang / vLLM / SGLang 的局部架构笔记
- Go gateway 的 MVP 跑通

---

### 阶段 3B：2026 年 7 月中下旬到 2026 年 9 月左右

核心目标：补 CUDA 基础，并把项目从 MVP 推进到可展示版本

### 你要做的事

CUDA 基础

- grid / block / thread
- warp
- global memory / shared memory / register
- memory access pattern
- kernel launch
- stream / async execution
- host-device copy
- 基本性能瓶颈

你此时学 CUDA 的目标不是“手搓高性能 kernel”，而是：

- 看懂执行模型
- 理解推理系统为什么在意 memory / kernel / async

### 这个阶段项目怎么安排

这时项目进入深化期。

在 MVP 跑通后，再逐步补这些更像平台能力的内容：

- Redis rate limit
- tenant quota
- health check
- retry
- circuit breaker
- fallback
- metrics
- benchmark
- request id / trace id
- 更合理的 routing policy

这个阶段项目才开始真正像“推理平台外围基础设施”。

### 这个阶段的产出

- 对 CUDA 有基础理解
- 项目从“能跑”变成“能讲”
- 你有：
  - 架构图
  - README
  - benchmark 数据
  - 指标截图
  - 核心设计取舍说明