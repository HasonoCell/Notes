# 什么是依赖注入（DI）？
只需要通过 Controller 的函数参数和类型声明，就可以显式声明出该 Controller 所需要的依赖，然后通过装饰器的方式，FastAPI 就可以自动在“幕后”处理有关依赖的所有操作，然后直接注入给 Controller 使用，包括：

* 解析请求（路径、查询、请求头、请求体）。
- 转换数据类型。
- 验证数据（根据 Path, Query, Field 等的规则）。
- 创建 Pydantic 模型实例。
- 处理所有可能的错误并生成标准化的错误响应。

使得其不需要关心依赖从哪里来，如何被创建的，只需索要，得到后直接使用即可

```python
from typing import Annotated
from fastapi import FastAPI, Query, Path
from pydantic import BaseModel, Field


class User(BaseModel):
    id: Annotated[int, Field(title="The id of the user")]
    name: Annotated[str, Field(title="The name of the user")]


app = FastAPI()

@app.get("/user/{id}")
async def get_user(
    id: Annotated[int, Path(ge=1, title="The id of the user")],
    page: Annotated[int | None, Query(ge=1, le=100)] = None,
):
    if page:
        return {"id": id, "page": page}
    return {"id": id}


@app.post("/user")
async def add_user(user: User):
    # FastAPI 会在底层利用 Pydantic 自动完成所有验证工作
    # 如果代码能执行到这里，FastAPI 和 Pydantic 已经保证了：
    # - 请求体是合法的 JSON
    # - 'name' 和 'age' 字段都存在
    # - 'name' 是字符串，'age' 是整数 (或者可以被安全地转换成整数)
    # - 'user' 参数已经是一个填充好数据的 User 实例！
    return {"message": "new user created successfully!", "user": user}
```

