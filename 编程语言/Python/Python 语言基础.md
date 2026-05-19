# 1. 运行环境和包管理器
当新建一个 Python 项目时，通常有如下一套标准操作流程（如同 pnpm init ）：

1. 创建虚拟环境：`python -m venv .venv`， 这行命令会让 Python 在当前目录下创建一个叫 .venv 的文件夹。这相当于你的 node_modules。
2. 激活虚拟环境：`.venv\Scripts\Activate`，告诉命令行后续的python和pip命令都在.venv这个目录下执行。
3. 开始安装依赖，并生成依赖列表，比如：`pip install openai`，安装依赖后，再执行`pip freeze > requirements.txt` 生成依赖列表。

为什么我们需要上述一套操作流程来初始化一个 Python 项目？

首先，Python 的依赖默认是全局安装的，并不是在每个项目中独立，隔离地安装，所以需要为每个项目启用一个虚拟环境，在该虚拟环境中安装依赖与运行 Python。其次，依赖列表 `requirements.txt` 也不会像 `package.json` 一样自动更新，所以需要手动执行命令更新。


什么是uv？有什么用？

如果将 pip 看作是 npm，那么 uv 则类似于 pnpm，它起到了包管理器和虚拟环境管理这两大核心作用，是一种更现代的 Python 项目管理工具。

uv init（初始化项目）
uv venv（创建并自动激活虚拟环境）
uv add openai（安装依赖）
特别注意下 uv pip install 和 uv add 的主要区别：

uv pip install 类似于传统的 pip install，直接安装包到当前环境，不会自动更新 pyproject.toml 或 requirements.txt
uv add 安装包并自动更新 pyproject.toml 的依赖列表，会锁定版本到 uv.lock文件(如果使用)。更适合项目依赖管理。

