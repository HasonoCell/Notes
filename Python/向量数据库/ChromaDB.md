### 基础概念
Chroma 的几大核心概念：Client，Collection，Document，Embedding

使用 Chroma 的核心流程：

1. 初始化客户端 (Client)
2. 创建或获取集合 (get_or_create_collection)
3. 添加文档 (collection.add)
4. 进行相似性查询 (collection.query)

```python
import chromadb
import uuid

client = chromadb.Client()

collection = client.get_or_create_collection(name="test_collection")

documents = [
    "Jobs founded the Apple incorporation",
    "Apples are a kind of fruit that is very rich in nutrition",
    "Bananas and pineapples are mostly produced in tropical regions",
    "My favorite mobile phone is the iPhone 6se",
]

collection.add(
    ids=[str(uuid.uuid4()) for _ in range(len(documents))],
    documents=documents,
)


results = collection.query(query_texts="phone", n_results=2)

for key in results:
    print(results.get(key))
    print("\r")
```



### Client 的几种模式
Ephemeral Client 和 Persistent Client 都属于进程内（in-memory）模式，Chroma DB 存在于本地的应用程序内运行（比如内存中或者本地磁盘中）



而在 Server/Client Mode，即服务端/客户端模式中，Chroma DB 作为一个独立的程序运行，本地 Python 程序要访问 Chroma DB 需要进行网络通信。



### 自定义 Embedding 模型
通过 embedding_function 来自定义 Collection 被创建时采取的 embedding 模型

```python
import chromadb
from chromadb.utils.embedding_functions import OpenAIEmbeddingFunction

qwen_api_key = "sk-d755685b76b047b2b91c0cf3dbf05059"
qwen_base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"

# 创建一个指向 Qwen 模型的嵌入函数实例
embedding_function = OpenAIEmbeddingFunction(
    api_key=qwen_api_key,
    api_base=qwen_base_url,
    model_name="text-embedding-v4",
)

client = chromadb.Client()

collection = client.get_or_create_collection(
    name="qwen_collection",
    embedding_function=embedding_function,  # type: ignore
)
```

