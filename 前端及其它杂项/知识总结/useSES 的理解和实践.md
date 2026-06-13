## 什么是 useSyncExternalStore（useSES）？

所谓状态管理，无非就是聚焦这一个问题：**数据变 → 视图如何变？**，比较自然而然地可以想到**发布订阅**模式，即让 React 组件"订阅"外部数据，那么当外部数据变化时，React 组件就能感知到并重新渲染。

useSyncExternalStore 是 React 18 专门为"外部状态同步"设计的 Hook，解决了：

1. 并发模式兼容 - 在 React 18 的并发渲染下保证一致性
2. 撕裂问题 (Tearing) - 防止一次渲染中不同组件读到不同版本的状态
3. 标准化接口 - subscribe + getSnapshot 的契约让任何外部状态库都能安全接入 React
    - `subscribe` - 这个参数是一个订阅外部状态变化的回调，当外部状态变化时，通过一个所谓的"通知函数（callback）" 来通知 React 更新组件

    - `getSnapshot` - 返回当前外部状态的快照，供 React 渲染时使用，其原理简单解释为，React 会通过 `Object.is`（比较引用地址）来比较前后两次（比如说第一次渲染时 counter 计数为 1，点击 add 后计数变为 2） `getSnapshot` 的返回值是否相同，从而决定是否需要重新渲染组件

我们通过实现一个简单的 `Valtio`（特点：基于 Proxy 的响应式状态管理库）来演示 useSyncExternalStore 的使用。

---

## 核心代码实现

```typescript
import { useSyncExternalStore } from 'react';

const listenersMap = new WeakMap(); // 存储每个 proxy 对象对应的 listeners
const snapshotCache = new WeakMap(); // 缓存快照，确保引用稳定

// 创建快照的辅助函数。由于使用了浅拷贝，每次调用都会返回一个新的对象
function createSnapshot(target: any) {
    return Array.isArray(target) ? [...target] : { ...target };
}

export function proxy(initialState: any) {
    const listeners = new Set<() => void>(); // 为什么用 Set？因为 Set 确保监听函数不会重复。

    const p = new Proxy(initialState, {
        get(target, key) {
            return target[key];
        },

        set(target, key, value) {
            // 如果值没有变化，则不触发更新
            if (Object.is(target[key], value)) {
                return true;
            }

            // 否则更新值
            target[key] = value;

            // 状态变化时，更新缓存的快照
            snapshotCache.set(p, createSnapshot(target));

            // 通知所有监听器，包括 useSyncExternalStore 注册的 notifyReact
            // 使得 React 知道数据变了
            listeners.forEach(listener => listener());
            return true;
        },
    });

    // 用 initialState 初始化一份快照缓存
    snapshotCache.set(p, createSnapshot(initialState));
    listenersMap.set(p, listeners);
    return p;
}

// 为什么要拷贝一份出来？主要是为了保证 React 在比较引用地址不同时可以触发更新。
// 使用缓存确保：状态未变化时返回相同引用，避免 useSyncExternalStore 无限循环
export function getSnapshot(proxyObject: any) {
    return snapshotCache.get(proxyObject);
}

export function subscribe(proxyObject: any, callback: () => void) {
    // 通过一个 proxy 对象获取到它的所有 listeners
    const listeners = listenersMap.get(proxyObject);
    if (listeners) {
        listeners.add(callback);
    }

    return () => {
        listeners?.delete(callback);
    };
}

export function useSnapshot(proxyObject: any) {
    return useSyncExternalStore(
        callback => subscribe(proxyObject, callback),
        () => getSnapshot(proxyObject),
    );
}
```

完整的数据链路可以参考以下图示：

```plaintext
┌─────────────────────────────────────────────────────────────────────────┐
│                          初始化阶段                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   proxy(state)                                                          │
│       │                                                                 │
│       ├──→ 创建 Proxy 对象 (proxyObj)                                   │
│       ├──→ 创建 listeners = new Set()                                   │
│       └──→ listenersMap.set(proxyObj, listeners)  // 建立映射关系        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          订阅阶段（组件挂载时）                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   useSnapshot(proxyObj)                                                 │
│       │                                                                 │
│       └──→ useSyncExternalStore(subscribe, getSnapshot)                 │
│                │                      │                                 │
│                │                      └──→ 返回缓存的快照用于渲染         │
│                │                                                        │
│                └──→ React 自动调用 subscribe(notifyCallback)            │
│                           │                                             │
│                           └──→ listeners.add(notifyCallback)            │
│                                     │                                   │
│                                     └── 🔑 React的"通知函数"被注册！     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          更新阶段（用户操作时）                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   proxyObj.count = 1                                                    │
│       │                                                                 │
│       └──→ Proxy set 拦截器触发                                          │
│               │                                                         │
│               ├──→ target[key] = value          // 更新数据              │
│               ├──→ snapshotCache.set(p, {...})  // 更新快照缓存          │
│               │                                                         │
│               └──→ listeners.forEach(fn => fn())                        │
│                           │                                             │
│                           └──→ notifyCallback() 被调用                   │
│                                     │                                   │
│                                     └── 🔔 通知 React："外部数据变了！"   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────────────┐
│                          重渲染阶段（React 接管）                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   React 收到通知后                                                       │
│       │                                                                 │
│       └──→ 调用 getSnapshot() 获取最新快照                               │
│               │                                                         │
│               ├──→ 对比新旧快照引用                                       │
│               │       │                                                 │
│               │       ├── 引用相同 → 不重渲染                             │
│               │       └── 引用不同 → 触发组件重渲染 ✅                     │
│               │                                                         │
│               └──→ 组件使用新快照数据渲染 UI                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```
