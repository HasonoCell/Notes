# MCP 学习笔记：从基础到生产架构

> 复核日期：2026-08-03
>
> 本笔记以通用 MCP 为主，最后用 T46 作为一个远程生产环境案例。

## 一、MCP 解决什么问题

大模型本身只能生成内容，不能天然访问数据库、读取文件、查询 GitHub 或修改业务系统。

在没有 MCP 时，每个 AI 应用都需要自己集成一套工具：

~~~text
AI 应用 A → 自己接 GitHub API
AI 应用 B → 再写一套 GitHub API 接入
AI 应用 C → 继续重复实现
~~~

MCP 把“AI 应用如何发现和调用外部能力”标准化：

~~~text
AI 应用 / Host
    ↓ MCP Client
    ↓ 标准协议
MCP Server
    ↓
API、数据库、文件系统或业务服务
~~~

MCP 不替代业务 API，也不替代 Function Calling。它主要解决的是工具接入、能力发现和跨应用复用问题。

## 二、MCP、Function Calling、API 和 RAG 的关系

| 概念 | 主要解决的问题 |
|---|---|
| API | 系统之间如何交换业务数据和执行操作 |
| Function Calling | 模型如何表达“我想调用某个函数” |
| RAG | 如何检索资料并放入模型上下文 |
| MCP | AI 应用如何标准化发现和使用外部 Tools、Resources、Prompts |

一个常见链路是：

~~~text
MCP Client 发现 Tool
    ↓
Host 把 Tool Schema 提供给模型
    ↓
模型通过 Function Calling 决定调用哪个 Tool
    ↓
MCP Client 调用 MCP Server
    ↓
MCP Server 调用真实 API 或数据库
~~~

因此，MCP 的 Tool 调用通常会和模型的 Function Calling 配合使用，但两者不是同一个概念。

## 三、Host、Client、Server

~~~text
用户
 ↓
Host：AI 应用本身，例如 Codex、Claude、Cursor
 ↓
Client：Host 内部连接某一个 MCP Server 的协议组件
 ↓
Server：提供工具、数据和提示模板的服务
~~~

### Host

Host 是用户直接使用的 AI 应用，通常负责：

- 管理对话和模型；
- 管理多个 MCP Client；
- 把 Server 的能力描述提供给模型；
- 根据模型决定发起工具调用；
- 展示工具结果；
- 处理权限确认和用户交互。

### Client

Client 是 Host 中连接某一个 Server 的组件。一个 Host 可以连接多个 Server：

~~~text
Host
├── Client A → GitHub Server
├── Client B → 文件系统 Server
└── Client C → 数据库 Server
~~~

Client 负责：

- 初始化握手；
- 发现 Server 的 Tools、Resources、Prompts；
- 发送 tools/call；
- 读取 Resource；
- 接收结果和错误。

### Server

Server 是能力提供方。它接收协议请求，执行工具逻辑，返回结构化结果。

Server 通常不负责自然语言推理，也不一定负责调用大模型。它可能只是一个适配层，把已有的 API 或数据库包装成 AI 应用可以使用的能力。

这里的“Server”是协议角色，不一定是一台独立机器，也不一定必须使用网络通信。

## 四、三类 MCP 能力

### Tools：执行动作

~~~text
search_orders(query)
create_ticket(title, description)
send_email(to, subject, body)
~~~

Tool 可能有副作用，因此需要明确参数、权限、失败行为和用户确认策略。

### Resources：提供上下文

~~~text
file:///docs/guide.md
db://schema
github://repo/issues/123
~~~

Resource 更像一个可寻址的数据来源，适合文档、数据库 Schema、配置和其他上下文内容。

### Prompts：提供工作模板

~~~text
review_code(code)
summarize_document(document)
plan_project(requirements)
~~~

Prompt 是可复用的提示模板，不等同于 Tool，也不应该把所有业务动作都塞进 Prompt。

## 五、传输方式：stdio 和远程 HTTP

要区分两件事：

~~~text
Host / Client / Server：逻辑角色
stdio / HTTP：实际传输方式
~~~

### 1. 本地 stdio

~~~text
Host
 └── Client
       └── stdin/stdout
             └── 本地 MCP Server 子进程
~~~

Client 启动 Server 子进程，双方通过标准输入输出传递 JSON-RPC 消息。

适合：

- 本地文件工具；
- IDE 工具；
- 本地脚本和数据库；
- 不希望开放网络端口的个人工具。

注意：stdio 只说明 Client 和 Server 之间是本地进程通信。这个本地 Server 仍然可以通过 HTTPS 调用 GitHub、Slack 或其他远程 API。

### 2. 远程 Streamable HTTP

~~~text
Host
 └── Client
       └── HTTPS
             └── 远程 MCP Server
~~~

远程 Server 通常暴露一个 MCP Endpoint：

~~~text
https://example.com/mcp
~~~

Client 通过 HTTP POST/GET 传递 MCP 的 JSON-RPC 消息，Server 可以按需使用 SSE 推送消息。

当前 MCP 规范的标准传输主要是 stdio 和 Streamable HTTP。早期的 HTTP+SSE 传输已经被 Streamable HTTP 取代。

参考：[MCP 官方 Transport 规范](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)

## 六、一次工具调用的通用流程

~~~text
1. Host 连接 MCP Server
2. Client 发送 initialize
3. Client 发送 tools/list、resources/list 等发现请求
4. Host 把可用能力描述提供给模型
5. 用户提出自然语言需求
6. 模型决定调用某个 Tool
7. Client 发送 tools/call
8. Server 校验参数并执行实际逻辑
9. Server 返回结构化结果
10. Host 把结果交给模型生成最终回答
~~~

抽象成网络请求就是：

~~~text
MCP Client
    │ JSON-RPC over stdio 或 HTTP
    ▼
MCP Server
    │ 普通程序调用
    ▼
API / 数据库 / 文件系统 / 业务服务
~~~

只有第一条连接使用 MCP 协议。Server 访问数据库、Redis 或第三方 API 时，使用的是普通基础设施协议。

## 七、生产级 MCP 的通用网络结构

~~~mermaid
flowchart LR
    A["AI Host"]
    B["MCP Client"]
    C["HTTPS / MCP Endpoint"]
    D["反向代理 / API Gateway"]
    E["MCP Server 应用"]
    F["认证与授权"]
    G["Tool 层"]
    H["业务服务 / API"]
    I["数据库 / 缓存"]
    J["审计与监控"]

    A --> B --> C --> D --> E --> F --> G
    G --> H --> I
    E --> J
~~~

生产环境常见的请求路径是：

~~~text
AI 应用
  ↓ HTTPS
公网域名 /mcp
  ↓
反向代理或 API Gateway
  ↓ 内部 HTTP
MCP Server 应用
  ↓
认证、授权、限流、工具路由
  ↓
业务服务、数据库、缓存和第三方系统
~~~

MCP Server 可以：

1. 是独立的服务；
2. 是现有 Web 服务中的一个路由；
3. 是一个本地子进程；
4. 是一个连接多个后端系统的适配层。

因此，“MCP Server”不等于“必须单独部署一台服务器”。

## 八、生产级设计重点

### 1. 认证

远程 MCP 至少要解决：

- 谁在调用；
- Token 如何生成；
- Token 是否过期或撤销；
- Token 泄漏后如何处理；
- 是否需要 OAuth、Bearer Token 或其他认证方式。

不要把普通用户登录态、数据库密码或长期高权限密钥直接交给模型。

### 2. 授权

认证解决“你是谁”，授权解决“你能做什么”。

推荐至少拆分：

~~~text
能否连接 MCP
能否发现某类 Tool
能否读取某类 Resource
能否执行写操作
能否访问某些数据范围
~~~

### 3. 最小权限

不要让 MCP Server 使用主业务数据库账号。更安全的方式是：

~~~text
MCP 查询 → 独立只读账号
MCP 写入 → 受限业务服务
~~~

数据库权限、文件系统权限和第三方 API 权限都应该独立收敛。

### 4. Tool 设计

一个好的 Tool 应该：

- 名称清晰；
- 描述准确；
- 参数结构明确；
- 输入有边界；
- 返回结构稳定；
- 错误可理解；
- 副作用可预期。

不要设计一个“万能工具”让模型传任意 SQL、任意 Shell 或任意 HTTP 请求，除非已经有非常严格的隔离和审计。

### 5. 写操作和人工确认

对删除、发送、付款、发布、修改权限等操作，常见的安全模式是：

~~~text
AI 生成待执行计划
    ↓
系统校验范围和参数
    ↓
人工确认
    ↓
真正执行
~~~

还应考虑：

- 幂等键；
- 重试策略；
- 超时后的状态；
- 部分成功；
- 回滚或补偿；
- 操作前后的审计记录。

### 6. 资源限制

生产 Tool 应限制：

- 单次请求耗时；
- 查询返回行数；
- 文件大小；
- 请求体大小；
- 并发连接数；
- 单 Token 或单用户的调用频率。

### 7. 审计和可观测性

至少记录：

~~~text
调用者
Token 或会话
Tool 名称
输入摘要
执行耗时
返回规模
成功/失败
错误原因
~~~

注意不要无意中把密码、Token、手机号或完整敏感请求写入日志。

### 8. 生命周期和并发

远程 MCP 要考虑：

- Session 是否有状态；
- Session 如何过期；
- 多 Worker 是否共享状态；
- 断线是否可以重连；
- 是否需要 stateless_http；
- 长连接是否会造成内存积累。

“能连接”不等于“能长期稳定运行”。

## 九、安全威胁模型

MCP 的风险不只来自恶意用户，也来自模型可能误解上下文或工具描述。

需要防范：

- Prompt Injection；
- Tool Poisoning；
- 越权调用；
- 参数扩大范围；
- 敏感数据泄漏；
- 重复执行副作用；
- 供应链风险；
- 远程 HTTP 的认证和 DNS Rebinding 风险。

安全边界不应只写在 Prompt 里，而应落实到：

~~~text
网络层
认证层
授权层
工具参数校验
业务服务
数据库权限
审计和监控
~~~

## 十、测试分层

生产级 MCP 至少应覆盖：

~~~text
Tool 纯函数单元测试
参数和 Schema 测试
认证测试
授权测试
限流测试
超时和大结果测试
MCP 协议集成测试
真实后端调用测试
并发和生命周期测试
~~~

集成测试应尽量覆盖完整链路：

~~~text
initialize
  → tools/list
  → tools/call
  → 结果返回
~~~

不能只测试 Python 函数可以直接调用，因为真正的问题可能出现在 HTTP、Session、认证或协议适配层。

## 十一、真实 Python MCP Server 示例

下面是一个可以实际运行的通用 MCP Server。它暴露一个 Tool、一个 Resource 和一个 Prompt，不依赖 T46 业务，也不需要外部账号。

官方 Python SDK 使用 FastMCP 注册这些能力：[MCP Python SDK Server 文档](https://py.sdk.modelcontextprotocol.io/server/)

### 1. 完整 Server 代码

保存为 notes_server.py：

~~~python
from mcp.server.fastmcp import FastMCP


NOTES = {
    "mcp-basics": """
MCP 是 Model Context Protocol。
它标准化了 AI 应用发现和调用外部工具、数据与 Prompt 的方式。
""".strip(),
    "production": """
生产级 MCP 需要考虑认证、授权、限流、超时、审计、最小权限和生命周期。
""".strip(),
}


mcp = FastMCP("Notes Server")


@mcp.tool()
def search_notes(query: str) -> list[dict[str, str]]:
    """搜索笔记，返回匹配笔记的名称和摘要。"""
    keyword = query.strip().casefold()

    if not keyword:
        return []

    results = []

    for name, content in NOTES.items():
        if keyword in f"{name}\n{content}".casefold():
            results.append(
                {
                    "name": name,
                    "preview": content.splitlines()[0],
                }
            )

    return results


@mcp.resource("note://{name}")
def read_note(name: str) -> str:
    """读取指定名称的完整笔记。"""
    if name not in NOTES:
        raise ValueError(f"笔记不存在：{name}")

    return NOTES[name]


@mcp.prompt()
def summarize_note(name: str, style: str = "简洁") -> str:
    """生成一个总结指定笔记的 Prompt。"""
    if name not in NOTES:
        raise ValueError(f"笔记不存在：{name}")

    return f"""
请读取资源 note://{name}，
用“{style}”的风格总结它。
最多输出三个要点，并使用中文。
""".strip()


if __name__ == "__main__":
    # 本地 stdio 模式。
    # Server 会等待 MCP Client 通过 stdin/stdout 发送 JSON-RPC 消息。
    mcp.run(transport="stdio")
~~~

安装并启动：

~~~bash
pip install mcp
python notes_server.py
~~~

程序启动后没有普通终端输出是正常的，因为 stdout 被 MCP 协议占用，不应该打印调试文本。

### 2. 这段代码分别对应什么

~~~text
@mcp.tool()
    ↓
模型可以主动调用 search_notes

@mcp.resource("note://{name}")
    ↓
Client 或应用可以读取 note://mcp-basics

@mcp.prompt()
    ↓
Client 可以获取一个可复用的总结模板
~~~

函数的类型注解和 Docstring 会帮助 SDK 生成 Tool 的描述和输入 Schema。

### 3. Host 如何连接 stdio Server

不同 Host 的配置字段略有差异，但核心是让 Host 启动这个 Python 进程：

~~~json
{
  "mcpServers": {
    "notes": {
      "command": "python",
      "args": [
        "/absolute/path/to/notes_server.py"
      ]
    }
  }
}
~~~

这时的结构是：

~~~text
AI Host
  └── MCP Client
        └── 启动 notes_server.py
              └── stdin/stdout
~~~

### 4. 切换为远程 Streamable HTTP

Server 的工具代码不需要改变，只需要调整 Server 初始化和启动方式：

~~~python
mcp = FastMCP(
    "Notes Server",
    stateless_http=True,
    json_response=True,
)

# 保留原来的 @mcp.tool、@mcp.resource、@mcp.prompt

if __name__ == "__main__":
    mcp.run(transport="streamable-http")
~~~

启动后通常通过：

~~~text
http://localhost:8000/mcp
~~~

访问。部署到公网时，前面还应有 HTTPS、认证和反向代理：

~~~text
AI Host
  └── MCP Client
        └── HTTPS https://example.com/mcp
              └── 反向代理
                    └── Streamable HTTP MCP Server
~~~

远程模式的客户端配置形态通常类似：

~~~json
{
  "mcpServers": {
    "notes": {
      "type": "http",
      "url": "https://example.com/mcp"
    }
  }
}
~~~

具体配置格式以 Host 应用的文档为准。

这个例子体现了 MCP 的核心：Server 只负责暴露标准化能力，Host 负责模型交互，Client 负责协议连接。生产环境还需要在它们之间加入认证、授权、限流、审计和资源限制。


## 十二、T46 作为生产环境案例

T46 的 MCP 实现是一个“远程 MCP Server 挂在现有 Web Backend 上”的案例：

~~~text
AI Host
  └── MCP Client
        └── HTTPS
              └── Admin Backend /mcp
                    ├── PAT 鉴权
                    ├── mcp:access 权限
                    ├── Redis 限流
                    ├── FastMCP Tool 路由
                    ├── 独立只读数据库账号
                    ├── SQL Guard
                    └── 调用审计
~~~

它体现了几个通用生产原则：

1. MCP 可以作为现有 FastAPI 应用的一个子路由，而不是独立服务。
2. 远程 MCP 使用专用 PAT，而不是直接复用后台网页登录凭据。
3. 数据查询使用独立只读数据库账号，并叠加 SQL 校验和结果限制。
4. 每次 Tool 调用都记录调用者、Token、耗时和结果状态。
5. 有副作用的 Tool 只创建待审核任务，不直接执行最终发送动作。
6. 曾经出现过 Session 泄漏导致 Worker OOM 的问题，后来通过无状态 HTTP 处理生命周期。

可以从这些文件了解案例，但它们只是案例材料，不是 MCP 通用规范：

- [T46 MCP Server 装配](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/app/mcp/server.py:41)
- [FastAPI /mcp 挂载](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/main.py:470)
- [PAT 鉴权](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/app/mcp/auth.py:48)
- [SQL Guard](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/app/mcp/sql_guard.py:65)
- [HTTP 集成测试](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/tests/mcp/test_server_integration.py:113)

## 十三、推荐学习路线

~~~text
1. 理解 Host / Client / Server
2. 理解 Tools / Resources / Prompts
3. 用 stdio 跑通一个本地 Server
4. 用 Streamable HTTP 跑通一个远程 Server
5. 加认证和授权
6. 加数据库或业务 API
7. 加限流、超时、审计和测试
8. 最后再处理副作用、并发和部署问题
~~~

最终记忆点：

~~~text
Host / Client / Server 是逻辑角色。
stdio / HTTP 是传输方式。
MCP Server 不一定是独立机器。
生产级 MCP 的核心不是“能调用工具”，而是“能安全、可控、可审计地调用工具”。
~~~
