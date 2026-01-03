Pydantic 用来在 Python 程序运行时对数据提供**自动校验，转换**等功能，就类似于 TS 生态的 Zod。只需要 20％ 的核心功能就可以解决开发过程中 80% 的问题。

### 基础模型：BaseModel
Pydantic 的一切都围绕 `BaseModel` 展开。

```python
from pydantic import BaseModel

# 1. 定义模型（继承 BaseModel）
class User(BaseModel):
    name: str
    age: int
    is_active: bool = True  # 有默认值，选填

# 2. 传入数据进行实例化
# 情况 A：数据完美
user = User(name="Gemini", age=3) 
print(user.name) # 输出: Gemini

# 情况 B：数据类型自动转换（强项！）
# 注意：传入的是字符串 "18"，它会自动转成 int 18
user2 = User(name="Mike", age="18") 
print(type(user2.age)) # 输出: <class 'int'>

# 情况 C：数据错误（报错）
try:
    User(name="Error", age="not_a_number")
except Exception as e:
    print(e) 
    # 报错信息非常清晰：Input should be a valid integer...
```


### 更严格的约束 ：Field
如果只写 `age: int`，用户输入 1000 岁也是合法的。这时候需要用 `Field` 来加限制。

```python
from pydantic import BaseModel, Field

class Product(BaseModel):
    name: str
    # gt=0: 大于0; le=1000: 小于等于1000
    price: float = Field(gt=0, le=1000, description="商品价格，单位美元")

    # 列表类型，且列表里不能是空的
    tags: list[str] = Field(min_length=1)

# 测试
p = Product(name="iPhone", price=999, tags=["phone", "tech"])
print(p)
```

### 自定义验证 (`@field_validator`)
如果内置的 `gt` (大于) 等规则不够用，比如你要验证“名字必须以 User 开头”，可以用装饰器写 Python 代码来验证。

```python
from pydantic import BaseModel, field_validator

class RegisterInfo(BaseModel):
    username: str

    @field_validator('username')
    @classmethod
    def check_username(cls, v: str) -> str:
        if 'admin' in v:
            raise ValueError('名字里不能包含 admin')
        return v.upper() # 你甚至可以在验证时修改数据，比如转大写

# 测试
print(RegisterInfo(username="john").username) # 输出: JOHN
# RegisterInfo(username="admin_01") # 会直接报错
```

