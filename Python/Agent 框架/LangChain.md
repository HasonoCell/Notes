所有详细的信息都可以在[官方文档](https://docs.langchain.com/)中找到，这里主要记录学习过程中遇到的重难点以及容易混淆的地方。

我认为可以将 LangChain 分为这几大核心组件去学习，快速的理清架构有助于形成知识体系，后续笔记也将围绕这几个核心组件展开：

1. Agents
2. Models
3. Tools
4. Memory
5. Message

---

### Agents
其实现在做 AI 应用 90% 都是在做 Agent，LangChain 通过 `create_agent` 这一核心函数来创建一个 agent，该函数底层依赖的是 LangGraph 的功能，从此处也不难看出，LangChain 可以看作是基于 LangGraph 更上一层的封装，平时开发 Agent 应用基本都可以使用 LangChain，除了需要对 Agent 的执行流程有高度的自定义化，那么就需要使用 LangGraph。


Agent 本质：[An LLM Agent runs tools in a loop to achieve a goal](https://simonwillison.net/2025/Sep/18/agents/)，即“Agent 是一个不断循环重复以达成目标的系统”。组成一个简单的 Agent 的几个最核心的要素无非是：

1. Model，最核心的思考的大脑
2. Tool，可以执行各种操作（调用函数，访问数据库等等）
3. Memory，让 Agent 拥有记忆，可以执行更加长期和复杂的任务
4. Prompt，与 Agent 交流或者限制 Agent 的行为，比如 System Prompt 就定义了一个 Agent 的身份

![](https://cdn.nlark.com/yuque/0/2025/png/53866714/1764145649964-234e4b18-eb1f-4aca-9949-217c4ddbe46a.png)

---

### Model
[https://docs.langchain.com/oss/python/langchain/models](https://docs.langchain.com/oss/python/langchain/models) 完整文档

#### Model 在 LangChain 中的使用场景
1. **With agents**，即在创建一个 Agent 时被使用。
2. **Standalone**，即单独被使用，跳出 Agent Loop，完成文本生成、分类或提取等任务。

由于 Model 使用场景的不同，要想让 Model 使用 Tools 也有不同的方法。

1. 对于 Agent 中的 Model，可以直接在通过 `create_agent` 函数创建 Agent 时传入一个 `tools` 数组

```python
agent = create_agent(
    model,
    tools=[get_weather],
)
```

2. 对于 Standalone 中的 Model，可以通过`bind_tools`这个函数创建出一个自带 Tool List 的 Model 从而去调用

```python
from langchain.tools import tool

@tool
def get_weather(location: str) -> str:
    """Get the weather at a location."""
    return f"It's sunny in {location}."


model_with_tools = model.bind_tools([get_weather])  

response = model_with_tools.invoke("What's the weather like in Boston?")
for tool_call in response.tool_calls:
    # View tool calls made by the model
    print(f"Tool: {tool_call['name']}")
    print(f"Args: {tool_call['args']}")
```

---

#### 使用 Pydantic 实现 Model 的结构化输出

```python
from pydantic import BaseModel, Field

class Movie(BaseModel):
    """A movie with details."""
    title: str = Field(..., description="The title of the movie")
    year: int = Field(..., description="The year the movie was released")
    director: str = Field(..., description="The director of the movie")
    rating: float = Field(..., description="The movie's rating out of 10")

model_with_structure = model.with_structured_output(Movie)
response = model_with_structure.invoke("Provide details about the movie Inception")
# Movie(title="Inception", year=2010, director="Christopher Nolan", rating=8.8)
print(response)  
```

---

#### 创建 Model 的两种方式
理清一下 LangChain 中创建一个 Model 的**两种方式**，即**显式实例化**和**工厂函数**。

方法一：显式实例化，比如 `ChatOpenAI`，`ChatAnthropic`等等，可以通过[https://docs.langchain.com/oss/python/integrations/providers/overview](https://docs.langchain.com/oss/python/integrations/providers/overview) 查询可创建的模型列表

```python
from langchain_openai import ChatOpenAI

openai_model = ChatOpenAI(
    model="qwen3-max", 
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)
```

**优点**：可以清晰地表明了你正在使用哪个模型类。



方法二：使用 `init_chat_model` 工厂函数

```python
from langchain.chat_models import init_chat_model

model = init_chat_model(
    "openai:qwen3-max",
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
)
```

这是一种更高阶、更抽象的“工厂”模式。你不需要导入具体的模型类，而是调用一个通用的 `init_chat_model` 函数，并通过一个特殊的字符串标识符（`"openai:qwen3-max"`）来告诉它要创建哪种模型。`init_chat_model` 的工作流程是：

1. 自动解析字符串表示符，比如“gpt-5”可以解析为“openai:gpt-5”，“claude-4.5”可以解析为“anthropic:claude-4.5”，但是对于 qwen 这种通过兼容 openai 接口实现调用的模型来说就需要显式注明了，因为 LangChain 无法自动识别出它的模型厂商
2. 调用对应的模型厂商集成包，比如`langchain_openai`来实现 Model 的创建。

<font style="color:#000000;"></font>

**优点**：无需记住和导入每个模型提供商的特定类路径，并且允许你通过配置文件或环境变量来动态指定模型，而无需更改代码中的 import 语句。例如，你可以将 "openai:qwen3-max" 存储在一个配置文件中。

<font style="color:#000000;"></font>

LangChain 还允许动态使用 Model（即一个 Agent 可以在执行过程中使用多个不同的 Agent），可以查阅[https://docs.langchain.com/oss/python/langchain/agents#dynamic-model](https://docs.langchain.com/oss/python/langchain/agents#dynamic-model)

---

### Message
#### Message 和传统 Prompt 的区别

Prompt 通常指给模型的输入指令或问题，是一个相对宽泛的概念，主要关注内容本身；而 Message 是 LangChain 中的基本上下文单元，是结构化的对象，不仅包含内容，还包含角色、元数据等完整对话状态信息。Message 可以看作是对 Prompt 更进一步抽象，使得用户与模型的对话都可以被拆分为一条条独立的 Message。
<font style="color:rgb(44, 44, 54);"></font>

```python
# 传统 Prompt 风格
prompt = "You are a helpful assistant. Hello, how are you?"

# LangChain Message 风格
messages = [
    SystemMessage("You are a helpful assistant."),
    HumanMessage("Hello, how are you?")
]
```

---

#### Message 的两种创建方式
LangChain 允许两种方式去创建**多种角色**的 Message：Dictionary format 和 Message objects

```python
# Dictionary format
conversation = [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Translate: I love programming."},
    {"role": "assistant", "content": "J'adore la programmation."},
    {"role": "user", "content": "Translate: I love building applications."}
]

response = model.invoke(conversation)
print(response)  # AIMessage("J'adore créer des applications.")
```


```python
# Message objects
from langchain.messages import HumanMessage, AIMessage, SystemMessage

conversation = [
    SystemMessage("You are a helpful assistant that translates English to French."),
    HumanMessage("Translate: I love programming."),
    AIMessage("J'adore la programmation."),
    HumanMessage("Translate: I love building applications.")
]

response = model.invoke(conversation)
print(response)  # AIMessage("J'adore créer des applications.")
```

### Tool
#### 通过 Pydantic 实现复杂的 Tool Arguments
```python
from pydantic import BaseModel, Field
from typing import Literal

class WeatherInput(BaseModel):
    """Input for weather queries."""
    location: str = Field(description="City name or coordinates")
    units: Literal["celsius", "fahrenheit"] = Field(
        default="celsius",
        description="Temperature unit preference"
    )
    include_forecast: bool = Field(
        default=False,
        description="Include 5-day forecast"
    )

@tool(args_schema=WeatherInput)
def get_weather(location: str, units: str = "celsius", include_forecast: bool = False):
    """Get current weather and optional forecast."""
    temp = 22 if units == "celsius" else 72
    result = f"Current weather in {location}: {temp} degrees {units[0].upper()}"
    if include_forecast:
        result += "\nNext 5 days: Sunny"
    return result
```

---

#### ToolRuntime
`ToolRuntime`是 LangChain 统一提供的一个类，用来为工具函数（Tool Function）提供运行时数据的访问，使得这些可能含有隐私信息的数据不被暴露给 Model

```python
@tool
def get_account_balance(runtime: ToolRuntime) -> str:
    # 通过 ToolRuntime 可以访问各种运行时数据
    pass
```

ToolRuntime 包括四个核心组件：

1. Context：提供不可变的配置信息，在整个对话过程中不会改变。通过 Context，一个工具函数就知道自己是在为哪个用户服务，但 Model 不需要知道这些细节。

```python
@dataclass
class UserContext:
    user_id: str  # 永远不会变的用户ID

@tool
def get_account_info(runtime: ToolRuntime[UserContext]) -> str:
    # 从身份证里读取用户ID
    user_id = runtime.context.user_id
    # 根据用户ID查询账户信息
    return f"用户 {user_id} 的账户信息..."
```

2. State：记录当前对话的**临时数据**，比如正在进行的对话内容 Messages 和各种自定义的临时数据。

```python
@tool
def summarize_conversation(runtime: ToolRuntime) -> str:
    # 获取所有对话消息的数据
    messages = runtime.state["messages"]
    
    # 统计有多少条用户消息、AI回复
    human_count = sum(1 for m in messages if m.__class__.__name__ == "HumanMessage")
    ai_count = sum(1 for m in messages if m.__class__.__name__ == "AIMessage")
    
    return f"当前对话：{human_count}条用户消息，{ai_count}条AI回复"
```

3. Store：记录持久化储存的各种数据，可以跨对话保存各种信息
4. Stream Writer：实时转播员，在工具执行过程中不断向用户报告进度。

### Memory
#### Short-term Memory
Short-term Memory 是一种**单个线程**化的持久机制（注意，这里的线程并不是指程序中的线程，而是指一次对话，即 Conversation），它的核心特点是：
1. **线程级隔离**：每个对话线程（通过唯一的 `thread_id` 标识）拥有独立的记忆空间，不同线程间的记忆完全隔离。
2. **持久化能力**：通过 `checkpointer` 参数实现线程级别的状态持久化，生产环境通常使用数据库支持的 checkpointer。

```python
from langchain.agents import create_agent
from langgraph.checkpoint.memory import InMemorySaver  

# checkpointer 实现持久化
agent = create_agent(
    "gpt-5",
    [get_user_info],
    checkpointer=InMemorySaver(),  
)

# conversation 1
agent.invoke(
    {"messages": [{"role": "user", "content": "Hi! My name is Bob."}]},
    {"configurable": {"thread_id": "1"}},  
)

# 注意！thread_id 发生了改变，这是一次新的 conversation
agent.invoke(
    {"messages": [{"role": "user", "content": "What's your name?"}]},
    {"configurable": {"thread_id": "2"}},  
)

```

3. **状态管理**：默认通过 `AgentState` 管理，最重要的作用是通过 `messages` 键存储对话历史，也支持自定义扩展字段（比如 `user_id`，`user_name` 等等）。

```python
from langchain.agents import create_agent, AgentState
from langgraph.checkpoint.memory import InMemorySaver

# 支持自定义扩展字段
class CustomAgentState(AgentState):  
    user_id: str
    user_name: str

agent = create_agent(
    "gpt-5",
    [get_user_info],
    state_schema=CustomAgentState,  
    checkpointer=InMemorySaver(),
)

# Custom state can be passed in invoke
result = agent.invoke(
    {
        "messages": [{"role": "user", "content": "Hello"}],
        "user_id": "123", 
        "user_name": "Hasono", 
    },
    {"configurable": {"thread_id": "1"}})
```


4. **上下文管理**：提供 trim messages、delete messages、summarize messages 等模式来处理超出 LLM 上下文窗口的长对话，需要使用到 LangChain 的中间件（Middlewar）机制，具体代码细节可查阅 [Short-term memory - Docs by LangChain](https://docs.langchain.com/oss/python/langchain/short-term-memory#trim-messages)
5. **多途径访问**：可以通过 `tools`、`@after_model`、`@before_model`等多种方式访问和修改短期记忆状态（Command）, `tools` 中获取到的 ToolRuntime 的 state 其实就是这里的 AgentState，只是说在工具函数中访问 state 可以避免将其包含的一些敏感信息暴露给 Model ，更多可查询[Short-term memory - Docs by LangChain](https://docs.langchain.com/oss/python/langchain/short-term-memory#write-short-term-memory-from-tools)
```python
from langchain.agents import create_agent, AgentState
from langchain.tools import tool, ToolRuntime
from typing import cast


class CustomState(AgentState):
    user_id: str

@tool
def get_user_info(
    runtime: ToolRuntime
) -> str:
    """Look up user info."""
    # 通过 runtime，我们访问到了持久化数据
    # cast 是 Python 提供的一个工具类型，用来获得更好的类型提示
    state = cast(CustomState, runtime.state)
    user_id = state["user_id"]
    return "User is John Smith" if user_id == "user_123" else "Unknown user"

agent = create_agent(
    model="gpt-5-nano",
    tools=[get_user_info],
    state_schema=CustomState,
)

result = agent.invoke({
    "messages": "look up user information",
    "user_id": "user_123"
})
print(result["messages"][-1].content)
# > User is John Smith.
```


总的来看，LangChain 关于 Short-term Memory 的架构设计就是：
1. Agent 创建时：通过 `state_schema = CustromState` 指定状态类型
2. 对话创建时：维护一个 `AgentState` 状态实例
3. 调用工具时：通过 `ToolRuntime` 访问到状态实例
4. 状态持久化：通过 `checkpointer` 在 thread-level 持久化状态


#### Long-term Memory
[Long-term memory - Docs by LangChain](https://docs.langchain.com/oss/python/langchain/long-term-memory) 和 LangGraph 有关，待看。