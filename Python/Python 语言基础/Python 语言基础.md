## 一，运行环境和包管理器

<font style="color:rgb(31, 31, 31);">当新建一个</font>`<font style="color:rgb(31, 31, 31);">Python</font>`<font style="color:rgb(31, 31, 31);">项目时，通常有如下一套标准操作流程（如同</font>`<font style="color:rgb(31, 31, 31);">npm init</font>`<font style="color:rgb(31, 31, 31);">）：</font>

1. 创建虚拟环境：`python -m venv .venv`， 这行命令会让 Python 在当前目录下创建一个叫 `.venv` 的文件夹。这相当于你的 `node_modules`。  
2. 激活虚拟环境：`.venv\Scripts\Activate`，告诉命令行后续的`python`和`pip`命令都在`.venv`这个目录下执行。
3. 开始安装依赖，并生成依赖列表，比如：`pip install openai`，安装依赖后，再执行`pip freeze > requirements.txt`生成依赖列表。



<font style="color:#DF2A3F;">为什么我们需要上述一套操作流程来初始化一个 Python 项目？</font>

<font style="color:#000000;">首先，Python 的依赖默认是</font>**<font style="color:#000000;">全局安装</font>**<font style="color:#000000;">的，并不是在每个项目中独立，隔离地安装，所以需要为每个项目启用一个虚拟环境，在该虚拟环境中安装依赖与运行 Python。其次，依赖列表</font>`<font style="color:#000000;">requirements.txt</font>`<font style="color:#000000;">也不会像</font>`<font style="color:#000000;">package.json</font>`<font style="color:#000000;">一样自动更新，所以需要手动执行命令更新。</font>

<font style="color:#000000;"></font>

<font style="color:#DF2A3F;">什么是</font>`<font style="color:#DF2A3F;">uv</font>`<font style="color:#DF2A3F;">？有什么用？</font>

<font style="color:#000000;">如果将 pip 看作是 npm，那么 uv 则类似于 pnpm，它起到了</font>**<font style="color:#000000;">包管理器</font>**<font style="color:#000000;">和</font>**<font style="color:#000000;">虚拟环境管理</font>**<font style="color:#000000;">这两大核心作用，是一种更现代的 Python 项目管理工具。</font>

1. `uv init`（初始化项目）
2. `uv venv`（创建并自动激活虚拟环境）
3. `uv add openai`（安装依赖）



<font style="color:#DF2A3F;">特别注意下</font>`<font style="color:#DF2A3F;">uv pip install</font>`<font style="color:#DF2A3F;"> 和 </font>`<font style="color:#DF2A3F;">uv add</font>`<font style="color:#DF2A3F;"> 的主要区别：</font>

1. `<font style="color:#000000;">uv pip install</font>`<font style="color:#000000;">类似于传统的 </font>`<font style="color:#000000;">pip install</font>`<font style="color:#000000;">，直接安装包到当前环境，</font>**不会**<font style="color:#000000;">自动更新 </font>`<font style="color:#000000;">pyproject.toml</font>`<font style="color:#000000;"> 或 </font>`<font style="color:#000000;">requirements.txt</font>`
2. `<font style="color:#000000;">uv add</font>`<font style="color:#000000;">安装包并</font>**自动更新**`<font style="color:#000000;">pyproject.toml</font>`<font style="color:#000000;">的依赖列表，会锁定版本到</font>`<font style="color:#000000;">uv.lock</font>`<font style="color:#000000;">文件(如果使用)。更适合项目依赖管理</font>

