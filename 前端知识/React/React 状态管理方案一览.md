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

