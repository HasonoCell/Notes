##### 深入了解DeepAgents输出后的一些思考：
1、DeepAgents里可以并行执行多个工具；

2、DeepAgents采用`middleware`、`model`、`tools`三个node节点，组成了ReAct（Reasoning + Acting）循环。

![](https://rte.weiyun.baidu.com/wiki/attach/image/api/imageDownloadAddress?attachId=9c9351b9a87e4392a0a8652f04ca8be9&docGuid=pkoc_Y05FHfI1e)
# 1、原始输出数据
[附件]
# 2、输出示例类型说明
### 消息类型说明：
|**消息类型**|**释义说明**|**示例**|
|-|-|-|
|`HumanMessage`|用户原始输入|--- #1 [0.0s] node=PatchToolCallsMiddleware.before_agent ---HumanMessage(content='获取这篇文章（[AI工具种草大会？许愿池开启营业！](https://news.family.baidu.com/newsDetail/227090?t=mention&mt=doc&dt=sdk) ）中的所有评论，分析其中提到的工具，并按工具和提到的次数整理成列表，写到知识库里', additional_kwargs={}, response_metadata={}, id='c40fe52c-f6ef-4d3f-b33b-0ea6d32df257')|
|`AIMessage`|详细字段：* content：AI思考过程* tool_calls：工具调用    * name：工具名称    * args：参数名称|AIMessage(content='我需要完成以下任务：获取文章评论、分析工具提及、整理列表并写入知识库。让我先阅读相关技能文档。', additional_kwargs={'refusal': None}, response_metadata={'token_usage': {'completion_tokens': 414, 'prompt_tokens': 15161, 'total_tokens': 15575, 'completion_tokens_details': {'accepted_prediction_tokens': None, 'audio_tokens': 0, 'reasoning_tokens': 0, 'rejected_prediction_tokens': None, 'text_tokens': 0}, 'prompt_tokens_details': {'audio_tokens': 0, 'cached_tokens': 0, 'text_tokens': 0, 'image_tokens': 0}, 'input_tokens': 0, 'output_tokens': 0, 'input_tokens_details': None, 'claude_cache_creation_5_m_tokens': 0, 'claude_cache_creation_1_h_tokens': 0}, 'model_provider': 'openai', 'model_name': 'claude-opus-4-5-20251101', 'system_fingerprint': None, 'id': 'msg_bdrk_01QFYZ5ZZ69jJDdDioNGBmHQ', 'finish_reason': 'tool_calls', 'logprobs': None}, .....|
|`ToolMessage`|详细字段说明：* content：工具返回内容* name：工具名称* tool_call_id：工具的id，和`AIMessage`里的tool_calls相关联|ToolMessage(content="Updated todo list to [{'content': '导航到 Family 文章页面并检查登录状态', 'status': 'completed'}, {'content': '使用 Dolphin API 获取所有评论', 'status': 'completed'}, {'content': '使用 LLM 分析评论中提到的工具', 'status': 'in_progress'}, {'content': '整理工具和提及次数列表', 'status': 'pending'}, {'content': '将结果写入知识库', 'status': 'pending'}]", name='write_todos', id='83d61bd0-c61d-44fc-854e-08597bddb603', tool_call_id='toolu_bdrk_018ya1hGz2oWBgH6FZTUpqd9')|

### node类型说明：
一句话总结：`middleware` 是入口门卫，`model` 是大脑负责思考决策，`tools` 是执行器负责干活。三者构成 ReAct（Reasoning + Acting）循环。

|**node类型**|**释义说明**|**示例**|
|-|-|-|
|`node=PatchToolCallsMiddleware`|中间件预处理节点，只在第一条消息出现。* **作用**：在 Agent 正式开始工作前，对输入消息做预处理/修补* **具体职责**：修正工具调用的格式、参数校验、注入上下文等* **命名含义**：`PatchToolCalls`（修补工具调用）+ `Middleware`（中间件）+ `.before_agent`（Agent 处理之前的钩子）* **只触发一次**：整个流程中只在最开始出现，把用户的 `HumanMessage` 传递给后续节点|--- #1 [0.0s] node=PatchToolCallsMiddleware.before_agent ---HumanMessage(content='获取这篇文章（[AI工具种草大会？许愿池开启营业！](https://news.family.baidu.com/newsDetail/227090?t=mention&mt=doc&dt=sdk) ）中的所有评论，分析其中提到的工具，并按工具和提到的次数整理成列表，写到知识库里', additional_kwargs={}, response_metadata={}, id='c40fe52c-f6ef-4d3f-b33b-0ea6d32df257')|
|`node=model`|LLM 推理节点，代表一次模型调用。* **作用**：把当前对话历史发给 LLM（claude-opus-4-5），获取模型的回复* **输出**：`AIMessage`，包含两部分：    * `content`：模型的思考/说明文字（给用户看的）    * `tool_calls`：模型决定要调用的工具列表（给系统执行的）* **类比**：就是"大脑"——**思考该做什么、决定调什么工具**|--- #2 [6.7s] node=model ---AIMessage(content='我需要完成以下任务：获取文章评论、分析工具提及、整理列表并写入知识库。让我先阅读相关技能文档。', additional_kwargs={'refusal': None}, response_metadata={'token_usage': {'completion_tokens': 414, 'prompt_tokens': 15161, 'total_tokens': 15575, 'completion_tokens_details': {'accepted_prediction_tokens': None, 'audio_tokens': 0, 'reasoning_tokens': 0, 'rejected_prediction_tokens': None, 'text_tokens': 0}, 'prompt_tokens_details': {'audio_tokens': 0, 'cached_tokens': 0, 'text_tokens': 0, 'image_tokens': 0}, 'input_tokens': 0, 'output_tokens': 0, 'input_tokens_details': None, 'claude_cache_creation_5_m_tokens': 0, 'claude_cache_creation_1_h_tokens': 0}, 'model_provider': 'openai', 'model_name': 'claude-opus-4-5-20251101', 'system_fingerprint': None, 'id': 'msg_bdrk_01QFYZ5ZZ69jJDdDioNGBmHQ', 'finish_reason': 'tool_calls', 'logprobs': None}, .....|
|`node=tools`|工具执行节点，执行模型请求的工具调用。* **作用**：拿到 `model` 节点输出的 `tool_calls`，逐个执行对应工具，返回结果* **输出**：`ToolMessage`，包含工具的执行结果* **一对多关系**：一次 `model` 可以发起多个 `tool_calls`，会产生多条 `tools` 消息（并行执行）* **类比**：就是"手脚"——**执行具体操作**|--- #26 [92.3s] node=tools ---ToolMessage(content="Updated todo list to [{'content': '导航到 Family 文章页面并检查登录状态', 'status': 'completed'}, {'content': '使用 Dolphin API 获取所有评论', 'status': 'completed'}, {'content': '使用 LLM 分析评论中提到的工具', 'status': 'in_progress'}, {'content': '整理工具和提及次数列表', 'status': 'pending'}, {'content': '将结果写入知识库', 'status': 'pending'}]", name='write_todos', id='83d61bd0-c61d-44fc-854e-08597bddb603', tool_call_id='toolu_bdrk_018ya1hGz2oWBgH6FZTUpqd9')|



示例

```python
{
    "type": "AIMessage",
    "content": "评论抓取完成！我来上传文件供您下载：",
    "additional_kwargs": {
        "refusal": null
    },
    "response_metadata": {
        "token_usage": {"token使用信息，忽略"},
        "model_provider": "openai",
        "model_name": "claude-opus-4-5-20251101",
        "system_fingerprint": null,
        "id": "msg_bdrk_01WWMGDVTCgmUBaGt3DuVCao",
        "finish_reason": "tool_calls",
        "logprobs": null
    },
    "id": "lc_run--019cbcc9-28e5-7913-8f1f-db476ea18c98-0",
    "tool_calls": [
        {
            "name": "file_write_and_upload",
            "args": {
                "path": "/Users/xiaxiaoling/code/...0260305_145700/comments.json"
            },
            "id": "toolu_bdrk_01F6J7bdLFsZTwfaW8WT6Yta",
            "type": "tool_call"
        }
    ],
    "invalid_tool_calls": [],
    "usage_metadata": {"token使用信息，忽略"}
}
```
```python
{
  "type": "ToolMessage",
  "content": "http://super-assistant-server-prod.bj.bcebos.com/docread/user-upload/comments.json?authorization=bce-auth-v1%2FALTAKsiesFzL8jdaCIKYA44RYv%2F2026-03-05T06%3A57%3A09Z%2F-1%2Fhost%2F153447092ef730dfaf84a36a9c3cf54b083557444d254fb06debbb3a0b830a84",
  "name": "file_write_and_upload",
  "id": "a3e5e1ab-a77b-4d43-b63f-a177408e15c3",
  "tool_call_id": "toolu_bdrk_01F6J7bdLFsZTwfaW8WT6Yta"
}
```
