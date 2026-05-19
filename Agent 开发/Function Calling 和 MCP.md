## 一、 Function Calling

大语言模型的知识是静态的，且本身不能联网或操作你的电脑。如果你问它“今天北京天气如何？”或者“帮我把服务器重启”，它本身是做不到的。

**Function Calling** 就是解决这个问题的机制。它的工作流程如下：

1. 你在向大模型提问时，同时提供一份符合模型厂商规范的 JSON Schema，其包含了函数名称，描述，参数。
    
2. 模型经过推理，发现回答你的问题需要调用 JSON Schema 里的某个函数。它不会直接返回普通文本，而是返回一段结构化的数据（通常是 JSON）
    
3. **你执行代码**：你的本地代码捕获到这个 JSON，解析出函数名称和参数，并通过程序调用。
    
4. 你的代码将函数调用结果再次发给模型。
    
5. 模型根据你的调用结果组织语言生成回答。

```Python
import json

def get_weather(location: str) -> str:
    # 调用 API
    weather_data = {"北京": "晴天, 22°C", "上海": "下雨, 18°C"}
    return weather_data.get(location, "未知天气")

# 按照模型厂商规定格式的 JSON Schema
tools = [
    {
        "name": "get_weather",
        "description": "获取指定城市的当前天气",
        "parameters": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "城市名称，例如：北京"
                }
            },
            "required": ["location"]
        }
    }
]

user_prompt = "今天北京天气怎么样？"

# 模拟大模型的返回（大模型看到了 user_prompt 和 tools，决定调用函数）
# 在真实环境中，这一步是由调用 openai/gemini API 返回的对象
llm_response = client.responses.create(
    model="gpt-5",
    tools=tools,
)

# 解析函数名称和参数
if "function_call" in llm_response:
    func_name = llm_response["function_call"]["name"]
    func_args = json.loads(llm_response["function_call"]["arguments"])
    
    if func_name == "get_weather":
        # 实际执行函数
        result = get_weather(location=func_args["location"])
        print(f"[系统日志] 执行函数 {func_name}，参数 {func_args}，结果：{result}")
        
        # 将结果喂回给大模型（此处省略第二次 API 调用，直接展示逻辑）
        print(f"[最终输出] 根据系统返回的数据，AI 回答：北京今天是 {result}。")
```

---

## 二、 MCP 

在 MCP 出现之前，如果你想让 Claude 读取你的 Github，你需要写一套专用的 Github 接入代码；想让它读取本地文件，又要写一套本地文件的代码。每个模型（Gemini, Claude, OpenAI）的 Function Calling 格式又略有不同。这就造成了巨大的生态碎片化。

**MCP** 标准化了这一切。它采用了**客户端-服务端（Client-Server）架构**：

- **MCP Server（服务端）**：你只需要写一次 Server（比如一个 Github MCP Server，一个 Database MCP Server），在这个 Server 里定义好数据读取（Resources）和可执行操作（Tools）。
    
- **MCP Client（客户端）**：任何支持 MCP 的工具（比如 Claude Desktop, Cursor 等应用，或者你写的脚本）都可以直接连上这个 Server，无缝获取它的能力，而不需要关心底层的 API 细节。
    

**MCP 的三大核心功能：**

- **Resources (资源)**: 提供只读数据（如本地文件系统、数据库表）。
    
- **Prompts (提示词)**: 提供可复用的提示词模板。
    
- **Tools (工具)**: 这正是 Function Calling 接入的地方，Server 可以暴露多个 Tool 给模型去调用执行。


现在使用官方推荐的 `FastMCP` 库，创建一个 MCP Server 是极其简单的。它甚至会自动帮你把 Python 函数的类型注解（Type Hints）转换成大模型需要的 Function Calling 参数描述（也就是上面例子里长长的那串 JSON）。

MCP Server 端代码：
```Python
from mcp.server.fastmcp import FastMCP

# 创建一个名为 "MySystemServer" 的 MCP 服务器
mcp = FastMCP("MySystemServer")

# 使用 @mcp.tool() 装饰器，直接将 Python 函数暴露给大模型作为工具 (Tool)
# 注意：Docstring (注释) 和 参数类型注解 (str, int) 非常重要
# FastMCP 会自动把这些信息提取出来，发给大模型做 Function Calling 决策。
@mcp.tool()
def calculate_calculator(operation: str, a: float, b: float) -> float:
    """
    执行基础的数学运算。
    operation 可以是 'add', 'subtract', 'multiply', 'divide'。
    """
    if operation == 'add':
        return a + b
    elif operation == 'subtract':
        return a - b
    elif operation == 'multiply':
        return a * b
    elif operation == 'divide':
        return a / b if b != 0 else "Error: Division by zero"
    return "Error: Unknown operation"

@mcp.tool() 
def get_company_data(user_id: int) -> str: 
	return f"获取到远端用户 {user_id} 的机密数据" 
	
if __name__ == "__main__": 
# SSE 网络通信，监听在 8000 端口 
print("Starting Remote MCP Server on http://localhost:8000 ...")

mcp.run_sse(host="0.0.0.0", port=8000)
```

MCP Client 端代码：
```Python
import asyncio
from mcp.client.sse import sse_client
from mcp import ClientSession

async def run_remote_client():
    # 填入远程 MCP Server 的 URL
    url = "http://localhost:8000/sse"
    
    # 建立网络连接
    async with sse_client(url) as (read_stream, write_stream):
        async with ClientSession(read_stream, write_stream) as session:
            await session.initialize()
            print("成功通过网络连接到远程 MCP Server！")
            
            # 后续的交互逻辑（获取工具、调用工具）和本地模式一模一样
            # ...

if __name__ == "__main__":
    asyncio.run(run_remote_client())
```

- **Client** 连上 **Server**，拿到可用的**工具列表**。
    
- **Client** 把用户的自然语言提问，连同这个**工具列表**，一起发给 **大模型**。
    
- **大模型** 决定使用哪个工具（这就是第一步讲的 **Function Calling**），返回 JSON 告诉 **Client**。
    
- **Client** 根据大模型的指令，调用 **Server** 的工具，拿到真实结果。
    
- **Client** 把结果发回给 **大模型**，大模型生成最终的自然语言回答给用户。

---

## 三、 两者的关系总结

|**维度**|**Function Calling**|**MCP (Model Context Protocol)**|
|---|---|---|
|**本质**|是一种 **能力/机制** (模型返回 JSON 请求执行操作)|是一种 **架构/协议** (一套标准化的 Client-Server 规范)|
|**解决的问题**|解决大模型“无法操作现实世界”的问题|解决工具与模型之间“集成接口不统一、重复造轮子”的问题|
|**彼此的关系**|MCP 的底层工具执行（Tools），依赖的正是大模型的 Function Calling 能力。||
MCP 解决了这样的问题：比如十个人要让它的 Agent 接入到 Github，那么这十个人都要分别各自写很多接入代码（如提供给 Function Calling 功能的 Funtion List），极其不便。有了 MCP，只需要 Github 官方自己写好这些接入代码，根据 MCP 协议暴露 Server 出去，然后这十个人就可以直接通过 Client 连接了。