### 状态管理方案分类
1. 内置方案
+ **useState/useReducer**
    - 轻量级状态管理，适合局部状态。
+ **Context API**
    - 跨组件共享状态，无需逐层传递 props。
2. 外部库方案
+ **Redux**
    - 单向数据流，集中式状态管理。
    - 配套工具：Redux Toolkit、Redux-Saga、Redux-Thunk。
+ **MobX**
    - 基于响应式编程，自动追踪依赖。
    - 特点：声明式、简洁语法。
+ **Zustand**
    - 轻量级状态管理库，API 极简。
    - 特点：无样板代码，支持 immer。
+ **Recoil**
    - Facebook 推出的状态管理库，与 React 深度集成。
    - 特点：原子化状态、数据流清晰。
+ **Jotai**
    - 轻量级原子化状态管理，受 Recoil 启发。
    - 特点：极小体积，灵活组合。

| **<font style="color:rgb(0, 0, 0);">维度</font>** | **<font style="color:rgb(0, 0, 0);">useState/Reducer</font>** | **<font style="color:rgb(0, 0, 0);">Context API</font>** | **<font style="color:rgb(0, 0, 0);">Redux (RTK)</font>** | **<font style="color:rgb(0, 0, 0);">MobX</font>** | **<font style="color:rgb(0, 0, 0);">Zustand</font>** | **<font style="color:rgb(0, 0, 0);">Recoil</font>** | **<font style="color:rgb(0, 0, 0);">Jotai</font>** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **<font style="color:rgb(0, 0, 0);">学习成本</font>** | <font style="color:rgb(0, 0, 0);">低</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">高</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">低</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">低</font> |
| **<font style="color:rgb(0, 0, 0);">代码复杂度</font>** | <font style="color:rgb(0, 0, 0);">低</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">高（传统）/ 中（RTK）</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">低</font> | <font style="color:rgb(0, 0, 0);">中</font> | <font style="color:rgb(0, 0, 0);">低</font> |
| **<font style="color:rgb(0, 0, 0);">状态粒度</font>** | <font style="color:rgb(0, 0, 0);">组件级</font> | <font style="color:rgb(0, 0, 0);">全局 / 局部</font> | <font style="color:rgb(0, 0, 0);">全局</font> | <font style="color:rgb(0, 0, 0);">全局 / 局部</font> | <font style="color:rgb(0, 0, 0);">全局 / 局部</font> | <font style="color:rgb(0, 0, 0);">原子化</font> | <font style="color:rgb(0, 0, 0);">原子化</font> |
| **<font style="color:rgb(0, 0, 0);">异步处理</font>** | <font style="color:rgb(0, 0, 0);">手动管理</font> | <font style="color:rgb(0, 0, 0);">手动管理</font> | <font style="color:rgb(0, 0, 0);">内置支持（RTK Query）</font> | <font style="color:rgb(0, 0, 0);">内置支持</font> | <font style="color:rgb(0, 0, 0);">手动 / 插件</font> | <font style="color:rgb(0, 0, 0);">手动 / 插件</font> | <font style="color:rgb(0, 0, 0);">手动 / 插件</font> |
| **<font style="color:rgb(0, 0, 0);">调试工具</font>** | <font style="color:rgb(0, 0, 0);">基础</font> | <font style="color:rgb(0, 0, 0);">基础</font> | <font style="color:rgb(0, 0, 0);">强大（Redux DevTools）</font> | <font style="color:rgb(0, 0, 0);">良好</font> | <font style="color:rgb(0, 0, 0);">基础 / 插件</font> | <font style="color:rgb(0, 0, 0);">基础 / 插件</font> | <font style="color:rgb(0, 0, 0);">基础 / 插件</font> |
| **<font style="color:rgb(0, 0, 0);">生态成熟度</font>** | <font style="color:rgb(0, 0, 0);">官方支持</font> | <font style="color:rgb(0, 0, 0);">官方支持</font> | <font style="color:rgb(0, 0, 0);">极高</font> | <font style="color:rgb(0, 0, 0);">高</font> | <font style="color:rgb(0, 0, 0);">中高</font> | <font style="color:rgb(0, 0, 0);">中高</font> | <font style="color:rgb(0, 0, 0);">中</font> |
| **<font style="color:rgb(0, 0, 0);">适用场景</font>** | <font style="color:rgb(0, 0, 0);">简单组件状态</font> | <font style="color:rgb(0, 0, 0);">中轻度全局状态</font> | <font style="color:rgb(0, 0, 0);">大型复杂应用</font> | <font style="color:rgb(0, 0, 0);">响应式 UI</font> | <font style="color:rgb(0, 0, 0);">中小型应用</font> | <font style="color:rgb(0, 0, 0);">大型应用</font> | <font style="color:rgb(0, 0, 0);">灵活组合</font> |


