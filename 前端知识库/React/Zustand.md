## Zustand 相对于其它状态管理工具的优点
1. **轻量级：** Zustand 的体积非常小，只有 1kb 左右。
2. **简单易用：**Zustand 不需要像 Redux，去通过`Provider`包裹组件，Zustand 提供了简洁的 API，能够快速上手。
3. **易于集成：** Zustand 可以轻松的与 React 和 Vue 等框架集成。(Zustand也有Vue版本)
4. **扩拓展性：** Zustand 提供了中间件的概念，可以通过插件的方式扩展功能，例如 **持久化，异步操作，日志记录** 等。
5. **无副作用：** Zustand 推荐使用 `immer`库处理不可变性， 避免不必要的副作用。

## 实现原理
Zustand 的核心原理主要可以分为亮点：

1. `create`函数中返回的，包含了 `states` 和 `actions` 的对象，独立于 React 的渲染周期之外，是一个持久的闭包
2. 通过 `selector` 的发布-订阅模式，当组件通过 `selector` 使用了某个 `state`，如 `useUserStore((state) => state.name)`，那么 Zustand 会将其保存为一个订阅。
3. 当 `state` 变化后，Zustand 不只是简单地“发布事件告诉所有订阅者”。它会为每一个订阅的组件**重新运行**它的 `selector` 函数（例如 `(state) => state.name`）。将 `selector` 返回的**新值**与该组件上一次渲染时 `selector` 返回的**旧值**进行一次**严格比较 (**`===`**)**。**只有当 **`新值 !== 旧值`** 时**，Zustand 才会触发该组件的重新渲染。



所以，Zustand 的核心原理可以更精确地概括为这三点：

1. **独立的闭包 Store**：状态独立于 React，持久存在。
2. **发布-订阅机制**：组件订阅 store 的变化。
3. **基于 Selector 和严格比较的精确更新**：这是避免不必要渲染、实现高性能的原理所在。

## 基础用法
```typescript
import { create } from "zustand";

// 定义 Store 接口
interface CountStore {
  count: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
}

const useCountStore = create<CountStore>((set) => ({
  // 状态
  count: 0,

  // 更新状态的逻辑
  increase: () => set((prevState) => ({ count: prevState.count + 1 })),
  decrease: () => set((prevState) => ({ count: prevState.count - 1 })),
  reset: () => set(() => ({ count: 0 })),
}));

export default useCountStore;
```

在组件中使用

```tsx
import Button from "./components/Button/Button";
import useCountStore from "./store/count";

const App = () => {
  const { count, increase, decrease, reset } = useCountStore();

  return (
    <div>
      <p>{count}</p>
      <Button onClick={increase}> +1 </Button>
      <Button onClick={decrease}> -1 </Button>
      <Button onClick={reset}> reset </Button>
    </div>
  );
};

export default App;
```

**如果我们想要在组件外部使用这些状态该怎么办呢？**这个时候我们就不能再用组件 hooks 的方式去写了，而应该使用提供的一个全局方法`getState`来获取，如

```typescript
const state = useCountStore.getState()
```

这样可以在 store 外部（比如请求拦截器、工具函数等）直接读取状态，而不需要在 React 组件中用 hook 方式访问。

## 进阶用法
### 结合 Immer 实现深层次状态处理
对于深层次数据结构的状态，由于修改起来要多次展开原状态再修改，十分麻烦。我们可以使用 **Immer **这个库来对数据进行不可变更新

在 Zustand 中使用 produce 函数或者 immer 中间件两种方式

```typescript
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { produce } from "immer";

interface AddressProps {
  country: string;
  city: string;
}

interface UserStore {
  name: string;
  address: AddressProps;
  updateFullAddress: (country: string, city: string) => void;
}

// 方法 1：手动使用 produce 函数
export const useUserStoreWithProduce = create<UserStore>((set) => ({
  name: "Hasono",
  address: {
    country: "China",
    city: "Shanghai",
  },

  updateFullAddress: (country: string, city: string) => {
    set((state) =>
      produce(state, (draft) => {
        draft.address.country = country;
        draft.address.city = city;
      })
    );
  },
}));

// 方法 2：使用 immer 中间件
export const useUserStore = create<UserStore>()(
  immer((set) => ({
    name: "Hasono",
    address: {
      country: "China",
      city: "Shanghai",
    },

    updateFullAddress: (country: string, city: string) =>
      set((state) => {
        state.address.country = country;
        state.address.city = city;
      }),
  }))
);
```

关于 Immer 的 produce 函数的简易实现

```typescript
type Draft<T> = {
  -readonly [K in keyof T]: T[K];
};

type RecipeFunc<T> = (draft: Draft<T>) => void;

const produce = <T>(base: T, recipe: RecipeFunc<T>) => {
  const modified: Record<string, any> = {};

  const handler = {
    get(target: any, prop: string) {
      if (prop in modified) {
        return modified[prop];
      }

      if (typeof target[prop] === "object" && target[prop] !== null) {
        return new Proxy(target[prop], handler);
      }

      return target[prop];
    },

    set(target: any, prop: string, value: any) {
      modified[prop] = value;
      return true;
    },
  };

  const draft = new Proxy(base, handler);

  recipe(draft);

  if (Object.keys(modified).length === 0) {
    return base;
  }

  return JSON.parse(JSON.stringify(draft));
};
```



### 结合 Selector / Shallow 实现状态简化
我们在使用 **Zustand** 时，是通过解构的方式引入状态的，但是这样的使用方法会引起一个问题：如果 A 组件用到了一个 state 但是 B 组件没有用到，而 A 组件更新 state 时都会引起 A，B 组件的重新渲染从而影响性能。

通过解构方式的引入实际上是订阅了整个 store 的变化，再把里面的状态和方法解构出来，A 组件更新 state 实际上导致了整个 store 的变化，如果 B 组件订阅了 store 而没使用 state 也会被重新渲染。

我们可以使用状态选择器 Selector 去只选择我们需要的部分状态（而不是订阅整个 store）

```typescript
interface CountStore {
  count: number;
  increase: () => void;
  decrease: () => void;
  reset: () => void;
}

// 组件中使用
const count = useCountStore(state => state.count);
const increase = useCountStore(state => state.increase);
const decrease = useCountStore(state => state.decrease);
const reset = useCountStore(state => state.reset);
```

如果需要订阅的状态和方法实在过多，上述写法看起来就会非常冗杂，这里提出一个终极解决方案：**对于状态单独订阅，对于方法组合订阅 ＋ useShallow 优化**

```typescript
import { useCountStore } from "./store";
import { useShallow } from "zustand/shallow";

// 状态单独订阅（会变化）
const count = useCountStore((state) => state.count);

// 方法组合订阅（不会变化）
const { increase, decrease, reset } = useCountStore(
  useShallow((state) => ({
    increase: state.increase,
    decrease: state.decrease,
    reset: state.reset,
  }))
);
```

为什么这里我们需要 useShallow 呢，主要是为了防止不必要的重新渲染。useShallow 使用的是**浅比较而非引用比较**，当没有使用 useShallow 时，每次组件的渲染都会导致 Selector 返回一个新对象

```typescript
// 第一次渲染
{ increase: fn, decrease: fn, reset: fn } // 对象A

// 第二次渲染（即使内容完全相同）
{ increase: fn, decrease: fn, reset: fn } // 对象B

// 对象A !== 对象B，zustand 认为状态变化了！
```

这就陷入了一个无限循环：重渲染 -> 创建新对象 -> Zustand 认为状态变化 -> 再次重渲染...

而使用 useShallow 进行浅比较后：

```typescript

const oldObj = { increase: fn1, decrease: fn2, reset: fn3 };
const newObj = { increase: fn1, decrease: fn2, reset: fn3 };

// 引用比较：oldObj !== newObj (true, 会重渲染)
// 浅比较: oldObj.increase === newObj.increase && 
//        oldObj.decrease === newObj.decrease && 
//        oldObj.reset === newObj.reset (true, 不重渲染)
```

这样就避免了无限循环渲染的问题

### 结合 Subscribe 实现状态监听
有些时候我们需要监听 store 中某些状态的变化，我们可以**使用 subscribe 方法配合 subscribeWithSelector 中间件**来实现

```typescript
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { subscribeWithSelector } from "zustand/middleware";

interface Count {
  count: number;
  add: () => void;
}

export const useStore = create<Count>()(
  // 使用该中间件，可支持订阅单个状态
  subscribeWithSelector((set) => ({
    count: 0,
    add: () => set((state) => ({ count: state.count + 1 })),
  }))
);

// 返回一个取消订阅的函数
const unSubscribe = useStore.subscribe(
  (state) => state.count,
  (curr, prev) => {
    console.log(`Count 从 ${prev} 变为 ${curr}`);
  }
);

unSubscribe(); //取消订阅
```

### 结合 Persist 实现状态持久化
<font style="color:rgb(28, 30, 33);">你可以基于你能想到的任何方式(localStorage/cookie/数据库等)将</font><font style="color:rgb(28, 30, 33);"> </font>`<font style="color:rgb(28, 30, 33);background-color:rgb(246, 247, 248);">store</font>`<font style="color:rgb(28, 30, 33);"> </font><font style="color:rgb(28, 30, 33);">中的</font><font style="color:rgb(28, 30, 33);"> </font>`<font style="color:rgb(28, 30, 33);background-color:rgb(246, 247, 248);">state</font>`<font style="color:rgb(28, 30, 33);"> </font><font style="color:rgb(28, 30, 33);">进行持久化存储。</font>

```typescript
import { create } from 'zustand'

import { persist, createJSONStorage } from 'zustand/middleware'

export const useCountStore = create(
  persist(
    (set, get) => ({
      count: 0,
      times: 0,
      add: () => set({ count: get().count + 1 }),
    }),
    {
      // 唯一仓库名称
      name: 'count-storage', 
      // 存储方式 可选 localStorage sessionStorage IndexedDB 默认 localStorage
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        count: state.count,
      }) // 部分状态持久化
    }
  )
)
```



