Deep Agents 架构评估报告
基于 LangGraph 的生产级 Agent 框架架构分析
## 1. 架构概览
### 1.1 整体架构图
```mermaid
flowchart TB
    subgraph Application["应用层 Application Layer"]
        CLI["DeepAgents CLI<br/>交互式终端"]
        ACP["DeepAgents ACP<br/>编辑器协议"]
        Harbor["DeepAgents Harbor<br/>评测框架"]
    end

    subgraph SDK["SDK 层 - deepagents"]
        Agent["create_deep_agent()<br/>LangGraph CompiledStateGraph"]
        MiddlewareChain["中间件链 Middleware Chain"]
    end

    subgraph Backend["Backend 存储/执行层"]
        StateBackend["StateBackend<br/>内存状态"]
        FilesystemBackend["FilesystemBackend<br/>本地文件"]
        LocalShellBackend["LocalShellBackend<br/>本地Shell"]
        StoreBackend["StoreBackend<br/>持久化存储"]
        RemoteSandbox["SandboxBackend<br/>远程沙箱"]
        CompositeBackend["CompositeBackend<br/>路由聚合"]
    end

    subgraph Infra["基础设施 Infrastructure"]
        Checkpointer[("Checkpointer<br/>Postgres/Redis")]
        Store[("Store<br/>持久化存储")]
        RemoteSandboxService["Remote Sandbox<br/>Daytona/Modal/Runloop"]
    end

    CLI --> Agent
    ACP --> Agent
    Harbor --> Agent
    Agent --> MiddlewareChain
    MiddlewareChain --> Backend
    CompositeBackend --> StateBackend
    CompositeBackend --> FilesystemBackend
    CompositeBackend --> LocalShellBackend
    CompositeBackend --> StoreBackend
    CompositeBackend --> RemoteSandbox
    RemoteSandbox -.-> RemoteSandboxService
    StoreBackend -.-> Store
    Agent -.-> Checkpointer
```
### 1.2 核心模块说明
|模块|路径|职责|
|-|-|-|
|**Agent 构建器**|`deepagents/graph.py`|`create_deep_agent()` 主入口，组装完整 Agent|
|**文件系统中间件**|`deepagents/middleware/filesystem.py`|提供 `ls/read/write/edit/glob/grep/execute` 工具|
|**子代理中间件**|`deepagents/middleware/subagents.py`|提供 `task` 工具，支持子代理调用|
|**技能中间件**|`deepagents/middleware/skills.py`|支持 Agent Skills 规范，动态加载技能文档|
|**记忆中间件**|`deepagents/middleware/memory.py`|加载 AGENTS.md 等记忆文件到系统提示|
|**摘要中间件**|`deepagents/middleware/summarization.py`|自动上下文压缩，防止 token 溢出|
|**Backend 协议**|`deepagents/backends/protocol.py`|定义 BackendProtocol 和 SandboxBackendProtocol|
|**State Backend**|`deepagents/backends/state.py`|基于 LangGraph 状态的文件存储|
|**Sandbox Backend**|`deepagents/backends/sandbox.py`|远程沙箱基类，支持命令执行|
|**Composite Backend**|`deepagents/backends/composite.py`|多后端路由聚合|

---

## 2. Middleware 处理流程
### 2.1 请求处理流水线
```mermaid
sequenceDiagram
    participant User as 用户输入
    participant Todo as TodoListMiddleware
    participant Memory as MemoryMiddleware
    participant Skills as SkillsMiddleware
    participant Filesystem as FilesystemMiddleware
    participant SubAgent as SubAgentMiddleware
    participant Summary as SummarizationMiddleware
    participant Model as LLM 模型

    User->>Todo: ModelRequest
    Todo->>Memory: 添加 write_todos 工具<br/>转发请求
    Memory->>Skills: 加载 AGENTS.md<br/>转发请求
    Skills->>Filesystem: 加载 SKILL.md<br/>转发请求
    Filesystem->>SubAgent: 添加文件操作工具<br/>转发请求
    SubAgent->>Summary: 添加 task 子代理工具<br/>转发请求
    Summary->>Model: 上下文管理<br/>发送到模型
    Model-->>Summary: ModelResponse
    Summary-->>SubAgent: 返回响应
    SubAgent-->>Filesystem: 返回响应
    Filesystem-->>Skills: 返回响应
    Skills-->>Memory: 返回响应
    Memory-->>Todo: 返回响应
    Todo-->>User: 最终结果
```
### 2.2 中间件栈结构
```mermaid
flowchart LR
    subgraph MiddlewareStack["Middleware 处理栈"]
        direction TB
        M1["1. TodoListMiddleware<br/>write_todos 规划工具"] --> M2
        M2["2. MemoryMiddleware<br/>AGENTS.md 持久化记忆"] --> M3
        M3["3. SkillsMiddleware<br/>SKILL.md 技能文档"] --> M4
        M4["4. FilesystemMiddleware<br/>ls/read/write/edit/grep/execute"] --> M5
        M5["5. SubAgentMiddleware<br/>task 子代理调用"] --> M6
        M6["6. SummarizationMiddleware<br/>自动上下文摘要"] --> M7
        M7["7. AnthropicPromptCachingMiddleware<br/>提示缓存优化"] --> M8
        M8["8. PatchToolCallsMiddleware<br/>工具调用修复"] --> M9
        M9["9. HumanInTheLoopMiddleware<br/>人工审批"]
    end
```
---

## 3. Backend 存储架构
### 3.1 Backend 类型对比
```mermaid
graph LR
    subgraph Backends["Backend 类型"]
        direction TB
        BP["BackendProtocol<br/>基础协议"]
        SBP["SandboxBackendProtocol<br/>扩展协议"]

        BP --> SB["StateBackend<br/>内存状态存储"]
        BP --> FB["FilesystemBackend<br/>本地文件系统"]
        BP --> StB["StoreBackend<br/>持久化存储"]
        SBP --> LSB["LocalShellBackend<br/>本地 Shell"]
        SBP --> Remote["Sandbox<br/>远程沙箱"]
    end

    CB["CompositeBackend<br/>路由聚合"]
    CB --> SB
    CB --> FB
    CB --> StB
    CB --> LSB
    CB --> Remote
```
|Backend|存储位置|执行能力|适用场景|
|-|-|-|-|
|StateBackend|LangGraph 状态|否|临时文件，会话内有效|
|FilesystemBackend|本地磁盘|否|本地文件操作|
|LocalShellBackend|本地磁盘|是 (本地 shell)|本地开发环境|
|StoreBackend|LangGraph Store|否|持久化跨会话存储|
|Sandbox (Remote)|远程容器|是 (远程)|安全隔离执行|
|CompositeBackend|路由分发|取决于默认后端|混合存储需求|

### 3.2 CompositeBackend 路由示例
```mermaid
flowchart LR
    subgraph Composite["CompositeBackend 路由"]
        Request["文件操作请求"]
        Router{"路径路由"}

        Request --> Router

        Router -->|"/files/*"| State["StateBackend<br/>临时文件"]
        Router -->|"/memories/*"| Store["StoreBackend<br/>持久化记忆"]
        Router -->|"/skills/*"| Filesystem["FilesystemBackend<br/>技能文档"]
        Router -->|默认路径| Default["默认 Backend"]
    end
```
---

## 4. 能力边界评估
### 4.1 能力支持矩阵
```mermaid
quadrantChart
    title 能力支持度评估
    x-axis 低支持度 --> 高支持度
    y-axis 低复杂度 --> 高复杂度
    quadrant-1 核心优势
    quadrant-2 高级功能
    quadrant-3 需改进
    quadrant-4 基础能力

    "Tool 系统": [0.9, 0.7]
    "MCP 协议": [0.6, 0.5]
    "Sub-Agent": [0.9, 0.8]
    "Memory": [0.85, 0.6]
    "Skill": [0.9, 0.75]
    "Sandbox": [0.85, 0.7]
    "HITL": [0.9, 0.65]
    "上下文管理": [0.9, 0.8]
```
|能力|支持度|说明|
|-|-|-|
|**Tool 系统**|强|内置 7+ 文件/执行工具，支持自定义工具|
|**MCP 协议**|中|通过 `langchain-mcp-adapters` 支持|
|**Sub-Agent**|强|原生支持 `task` 工具，内置通用子代理|
|**Memory**|强|支持 AGENTS.md 持久化记忆，多源加载|
|**Skill**|强|完整实现 Agent Skills 规范，渐进式披露|
|**Sandbox**|强|支持本地 shell 和远程沙箱 (Daytona/Modal/Runloop)|
|**HITL**|强|内置人工审批，支持工具级中断配置|
|**上下文管理**|强|自动摘要、大结果驱逐、token 管理|

### 4.2 核心类设计
```mermaid
classDiagram
    class create_deep_agent {
        +model: BaseChatModel
        +tools: List[BaseTool]
        +middleware: List[AgentMiddleware]
        +backend: BackendProtocol
        +subagents: List[SubAgent]
        +CompiledStateGraph()
    }

    class AgentMiddleware {
        <<abstract>>
        +state_schema: Type[AgentState]
        +tools: List[BaseTool]
        +wrap_model_call()
        +wrap_tool_call()
    }

    class FilesystemMiddleware {
        +backend: BackendProtocol
        +_tool_token_limit_before_evict: int
        +_create_ls_tool()
        +_create_read_file_tool()
        +_create_write_file_tool()
        +_create_edit_file_tool()
        +_create_glob_tool()
        +_create_grep_tool()
        +_create_execute_tool()
    }

    class SubAgentMiddleware {
        +backend: BackendProtocol
        +subagents: List[SubAgent]
        +_build_task_tool()
    }

    class SkillsMiddleware {
        +backend: BackendProtocol
        +sources: List[str]
        +_list_skills()
        +_parse_skill_metadata()
    }

    class BackendProtocol {
        <<abstract>>
        +ls_info(path)
        +read(file_path, offset, limit)
        +write(file_path, content)
        +edit(file_path, old, new)
        +grep_raw(pattern, path, glob)
        +glob_info(pattern, path)
    }

    class SandboxBackendProtocol {
        <<abstract>>
        +execute(command, timeout)
        +id: str
    }

    create_deep_agent --> AgentMiddleware : uses
    AgentMiddleware <|-- FilesystemMiddleware
    AgentMiddleware <|-- SubAgentMiddleware
    AgentMiddleware <|-- SkillsMiddleware
    BackendProtocol <|-- SandboxBackendProtocol
    FilesystemMiddleware --> BackendProtocol : uses
    SubAgentMiddleware --> BackendProtocol : uses
    SkillsMiddleware --> BackendProtocol : uses
```
---

## 5. 特殊能力详解
### 5.1 Agent Skills 规范支持
```mermaid
flowchart TB
    subgraph SkillsSystem["Skills 系统架构"]
        direction TB

        Sources["多源加载"]
        Sources --> BuiltIn["内置技能<br/>~/.deepagents/skills/"]
        Sources --> User["用户技能<br/>~/.deepagents/{agent}/skills/"]
        Sources --> Project["项目技能<br/>./.deepagents/skills/"]

        Parser["YAML Frontmatter 解析"]
        BuiltIn --> Parser
        User --> Parser
        Project --> Parser

        Metadata["SkillMetadata"]
        Parser --> Metadata

        Disclosure["渐进式披露"]
        Metadata --> Disclosure

        SystemPrompt["注入系统提示"]
        Disclosure --> SystemPrompt
    end

    subgraph SkillStructure["SKILL.md 结构"]
        Frontmatter["---<br/>name: web-research<br/>description: ...<br/>license: MIT<br/>---"]
        Content["# Web Research Skill<br/>## When to Use<br/>- ..."]
    end
```
**特性**：

* YAML frontmatter 元数据解析
* 多源加载 (built-in → user → project)
* 渐进式披露 (列表显示，按需阅读)
* 工具限制声明 (`allowed-tools`)

### 5.2 上下文管理策略
```mermaid
sequenceDiagram
    participant Context as 当前上下文
    participant Summary as SummarizationMiddleware
    participant Filesystem as FilesystemMiddleware
    participant Storage as 存储 Backend
    participant LLM as LLM 模型

    Note over Context,LLM: 自动摘要流程
    Context->>Summary: 消息数超过阈值
    Summary->>Summary: 识别历史消息
    Summary->>LLM: 发送摘要请求
    LLM-->>Summary: 返回摘要内容
    Summary->>Context: 替换为摘要消息

    Note over Context,Storage: 大结果驱逐流程
    Context->>Filesystem: 工具结果过大
    Filesystem->>Filesystem: 检查 token 限制
    Filesystem->>Storage: 写入完整结果
    Storage-->>Filesystem: 返回文件路径
    Filesystem->>Context: 返回预览+引用
```
**自动摘要 (SummarizationMiddleware)**：

* 根据模型特性自动计算触发阈值
* 保留最近 N 条消息，摘要历史
* 支持 Claude 3 的 20K 输出和 GPT-4 的 8K 输出

**大结果驱逐 (FilesystemMiddleware)**：

* 工具结果超过 20K tokens 自动写入文件系统
* 返回预览 + 文件引用
* 避免上下文窗口溢出

### 5.3 子代理系统
```mermaid
flowchart TB
    subgraph MainAgent["主代理 Main Agent"]
        TaskTool["task 工具"]
    end

    subgraph SubAgents["子代理池"]
        direction TB
        GP["general-purpose<br/>通用子代理"]
        Custom1["content-reviewer<br/>内容审核"]
        Custom2["research-analyst<br/>研究分析"]
        Custom3["code-reviewer<br/>代码审查"]
    end

    TaskTool --> GP
    TaskTool --> Custom1
    TaskTool --> Custom2
    TaskTool --> Custom3

    subgraph Isolation["上下文隔离"]
        State1["独立 State"]
        Tools1["独立 Tools"]
        Model1["独立 Model"]
    end

    GP -.-> Isolation
    Custom1 -.-> Isolation
    Custom2 -.-> Isolation
    Custom3 -.-> Isolation
```
**特性**：

* 自动包含通用子代理 (general-purpose)
* 支持并行调用多个子代理
* 完全隔离的上下文窗口
* 子代理可拥有独立工具和模型

---

## 6. 使用复杂度评估
### 6.1 复杂度矩阵
```mermaid
quadrantChart
    title 使用复杂度评估
    x-axis 低重要性 --> 高重要性
    y-axis 低复杂度 --> 高复杂度
    quadrant-1 优先关注
    quadrant-2 精细优化
    quadrant-3 快速配置
    quadrant-4 基础必需

    "依赖管理": [0.6, 0.5]
    "配置复杂度": [0.3, 0.2]
    "集成复杂度": [0.5, 0.4]
    "定制复杂度": [0.7, 0.6]
    "部署复杂度": [0.8, 0.7]
    "运维复杂度": [0.8, 0.6]
```
|维度|评级|说明|
|-|-|-|
|**依赖复杂度**|中|LangChain, LangGraph, 多种模型 SDK|
|**配置复杂度**|低|`create_deep_agent()` 开箱即用|
|**集成复杂度**|低|返回标准 LangGraph CompiledStateGraph|
|**定制复杂度**|中|Middleware/Backend 可插拔设计|
|**部署复杂度**|中|支持本地、容器、远程沙箱多种模式|

**核心代码量**: ~80K 行 Python（包含 SDK + CLI + 测试）

### 6.2 使用示例对比
```mermaid
flowchart LR
    subgraph Simple["最小使用示例"]
        S1["from deepagents import create_deep_agent"]
        S2["agent = create_deep_agent()"]
        S3["result = agent.invoke(...)"]
    end

    subgraph Advanced["高级定制示例"]
        A1["自定义 Backend"]
        A2["自定义 Middleware"]
        A3["自定义 SubAgents"]
        A4["自定义 Skills"]
    end

    Simple -->|进阶| Advanced
```
---

## 7. 分布式支持评估
### 7.1 当前架构的分布式能力
```mermaid
flowchart TB
    subgraph Current["当前架构特性"]
        direction TB

        C1["✅ LangGraph 分布式 checkpointing"]
        C2["✅ Backend 抽象支持远程存储"]
        C3["✅ 子代理天然分布式"]
        C4["⚠️ 默认 StateBackend 内存存储"]
        C5["⚠️ Agent 执行绑定单进程"]
        C6["❌ 无内置服务发现"]
    end
```
**已具备的基础**：

* LangGraph 原生支持分布式 checkpointing
* Backend 抽象支持远程存储
* 子代理天然分布式（无共享状态）

**限制点**：

|限制点|说明|影响|
|-|-|-|
|默认 StateBackend|文件存储在进程内存|实例重启状态丢失|
|单进程执行|Agent 执行绑定到单个进程|需要外部编排实现水平扩展|
|无内置服务发现|无服务注册/发现机制|需外部基础设施|

### 7.2 分布式部署方案
```mermaid
flowchart TB
    subgraph LoadBalancer["负载均衡层"]
        LB["API Gateway<br/>Nginx / Kong"]
    end

    subgraph Runtime["Agent Runtime 层"]
        RT1["Agent Runtime 1"]
        RT2["Agent Runtime 2"]
        RT3["Agent Runtime 3"]
    end

    subgraph Infra["分布式基础设施"]
        Postgres[("Postgres<br/>Checkpoint 存储")]
        Redis[("Redis<br/>Pub/Sub 消息")]
        S3[("S3 / GCS<br/>大文件存储")]
    end

    LB --> RT1
    LB --> RT2
    LB --> RT3

    RT1 -.-> Postgres
    RT2 -.-> Postgres
    RT3 -.-> Postgres

    RT1 -.-> Redis
    RT2 -.-> Redis
    RT3 -.-> Redis

    RT1 -.-> S3
    RT2 -.-> S3
    RT3 -.-> S3
```
### 7.3 部署模式演进
```mermaid
flowchart LR
    subgraph M1["模式1: 单机多会话"]
        State["StateBackend"]
        Memory["InMemorySaver"]
    end

    subgraph M2["模式2: 持久化会话"]
        Store["StoreBackend"]
        Postgres["PostgresCheckpointer"]
    end

    subgraph M3["模式3: 多实例部署"]
        LB["负载均衡"]
        Multi["多实例 + Postgres"]
    end

    M1 -->|进阶| M2
    M2 -->|扩展| M3
```
|组件|推荐方案|工作量|
|-|-|-|
|Checkpoint|PostgresCheckpointer / RedisCheckpointer|已内置|
|大文件存储|S3 / GCS Backend 扩展|1-2 天|
|任务队列|外部任务队列 (Celery / RQ)|需自建|
|状态共享|LangGraph Store (Postgres)|已支持|

---

## 9. 关键文件路径
### 9.1 SDK 核心文件
```mermaid
flowchart LR
    subgraph SDKFiles["SDK 核心文件"]
        direction TB
        F1["deepagents/__init__.py<br/>公开 API"]
        F2["deepagents/graph.py<br/>create_deep_agent"]
        F3["middleware/filesystem.py<br/>文件系统工具"]
        F4["middleware/subagents.py<br/>子代理系统"]
        F5["middleware/skills.py<br/>技能系统"]
        F6["middleware/memory.py<br/>记忆管理"]
        F7["backends/protocol.py<br/>Backend 协议"]
        F8["backends/state.py<br/>状态存储"]
        F9["backends/sandbox.py<br/>沙箱基类"]
    end
```
|文件|路径|说明|
|-|-|-|
|主入口|`libs/deepagents/deepagents/__init__.py`|公开 API|
|Agent 构建器|`libs/deepagents/deepagents/graph.py`|create_deep_agent|
|文件系统中间件|`libs/deepagents/deepagents/middleware/filesystem.py`|核心工具实现|
|子代理中间件|`libs/deepagents/deepagents/middleware/subagents.py`|task 工具|
|技能中间件|`libs/deepagents/deepagents/middleware/skills.py`|Skills 系统|
|记忆中间件|`libs/deepagents/deepagents/middleware/memory.py`|AGENTS.md 加载|
|Backend 协议|`libs/deepagents/deepagents/backends/protocol.py`|接口定义|
|State Backend|`libs/deepagents/deepagents/backends/state.py`|状态存储|
|Sandbox 基类|`libs/deepagents/deepagents/backends/sandbox.py`|沙箱基类|

### 9.2 CLI 核心文件
|文件|路径|说明|
|-|-|-|
|CLI Agent|`libs/cli/deepagents_cli/agent.py`|create_cli_agent|
|主入口|`libs/cli/deepagents_cli/main.py`|CLI 入口|
|UI 组件|`libs/cli/deepagents_cli/ui.py`|TUI 界面|
|配置管理|`libs/cli/deepagents_cli/config.py`|设置和配置|
|沙箱工厂|`libs/cli/deepagents_cli/integrations/`|Daytona/Modal/Runloop|

---

## 10. 结论与建议
### 10.1 架构优势
```mermaid
flowchart TB
    subgraph Advantages["核心优势"]
        direction TB
        A1["✅ 分层清晰: Backend / Middleware / Agent 三层分离"]
        A2["✅ 可扩展性强: Protocol-based 设计，易于扩展"]
        A3["✅ 开箱即用: create_deep_agent() 一行代码获得完整能力"]
        A4["✅ LangGraph 原生: 与生态完全兼容，支持流式、持久化、中断"]
        A5["✅ 生产就绪: 内置 HITL、上下文管理、沙箱隔离"]
    end
```
### 10.2 适用场景
**强烈推荐**：

* 需要快速构建代码/文件处理 Agent
* 需要子代理分工协作的复杂任务
* 需要 Skills 系统实现领域专业化
* 需要人机协作的工作流

**适合使用**：

* Claude Code 类工具的自建需求
* IDE/编辑器集成 (通过 ACP 协议)
* 自动化代码审查、文档生成
* 研究分析类任务

**需要评估**：

* 纯对话类 Agent (无文件操作需求)
* 超低延迟场景 (子代理有启动开销)
* 纯事件驱动架构 (当前为函数调用式)

### 10.3 集成建议
```mermaid
flowchart LR
    subgraph Scenarios["使用场景"]
        direction TB

        S1["快速原型"] -->|create_deep_agent<br/>默认配置| R1["🚀 立即可用"]

        S2["生产部署"] -->|PostgresCheckpointer<br/>StoreBackend| R2["💾 持久化"]

        S3["多租户"] -->|CompositeBackend<br/>按用户路由| R3["🏢 隔离"]

        S4["远程执行"] -->|Daytona/Modal<br/>Sandbox| R4["🔒 安全"]

        S5["领域定制"] -->|自定义 Skills<br/>SubAgents| R5["🎯 专业"]
    end
```
|场景|推荐方案|
|-|-|
|快速原型|`create_deep_agent()` 默认配置|
|生产部署|PostgresCheckpointer + StoreBackend|
|多租户|CompositeBackend + 按用户路由|
|远程执行|Daytona/Modal/Runloop Sandbox|
|领域定制|自定义 Skills + SubAgents|

### 10.4 总体评估
**Deep Agents** 是一个**生产就绪、架构清晰、扩展性强**的 Agent 框架。

```mermaid
flowchart TB
    subgraph Evaluation["总体评估"]
        direction TB

        E1["架构成熟度: ⭐⭐⭐⭐⭐"]
        E2["生产就绪: ⭐⭐⭐⭐⭐"]
        E3["易用性: ⭐⭐⭐⭐"]
        E4["生态兼容: ⭐⭐⭐⭐⭐"]
        E5["文档完善: ⭐⭐⭐⭐"]
    end
```
**总结**:

* Deep Agents 更适合需要与 LangChain/LangGraph 生态集成、需要生产级稳定性、需要 Skills 系统的场景
* OpenManus 更适合研究实验、需要原生 MCP 双模支持的场景
* 对于构建 Claude Code 类工具，Deep Agents 是更成熟的选择

---

*文档生成时间: 2026-02-24*
*基于 Deep Agents 最新代码分析*