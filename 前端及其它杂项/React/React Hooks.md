### 前言：什么是 Hook？
Hook 是 React 16.8 的新增特性。它可以让你在**函数组件**中“钩住” React 的特性，例如状态（state）和生命周期（lifecycle）。它们简化了逻辑复用，让组件代码更清晰。

---

### 1. useState
**用途**：用于在函数组件中添加和管理局部状态（state）。它是类组件中 `this.state` 和 `this.setState` 的替代品。

**模拟面试官提问**：  
**Q1**：“请描述一下 `useState` 的作用，并写一个简单的计数器组件作为例子。”  
**A1**：

```tsx
import { useState } from 'react';

function Counter() {
  const [count, setCount] = useState(0); // 初始状态为 0

  return (
    <div>
      <p>You clicked {count} times</p>
      <button onClick={() => setCount(count + 1)}>Click me</button>
    </div>
  );
}
```



**Q2**：“`setCount(count + 1)` 和 `setCount(prevCount => prevCount + 1)` 这两种写法有什么区别？在什么场景下必须使用后者？”  
**A2**：

+ **区别**：前者直接使用当前闭包中的 `count` 值，后者使用函数形式，接收最新的 `state` 作为参数。
+ **必须使用后者的场景**：
    1. **异步更新**：如果状态更新依赖于前一个状态，并且在多次快速调用中（比如快速点击），使用函数形式可以确保你操作的是最新的状态，避免闭包陷阱。例如，连续调用两次 `setCount(count + 1)` 可能只会增加一次，而 `setCount(prevCount => prevCount + 1)` 会正确地增加两次。
    2. **批量更新**：在 React 的事件处理函数中，setState 是批量更新的。使用函数式更新可以确保在批量处理中，每一次更新都基于上一次的正确结果。



**Q3**：“使用 `useState` 时，初始化一个函数或对象有什么需要注意的吗？”  
**A3**：

+ **惰性初始 state**：如果初始 state 需要通过复杂计算获得，可以传入一个函数，此函数只在初始渲染时被调用：`const [state, setState] = useState(() => expensiveInitialValue())`。
+ **对象状态**：与类组件中的 `setState` 不同，`useState` 的 setter 函数**不会自动合并更新对象**。你需要手动合并：

```tsx
setState(prevState => {
  return { ...prevState, ...updatedValues };
});
```

---

### 2. useEffect
**用途**：允许你在函数组件中执行副作用操作（数据获取、订阅、手动修改 DOM 等）。它将是 `componentDidMount`、`componentDidUpdate` 和 `componentWillUnmount` 这三个生命周期方法的统一替代品。

**模拟面试官提问**：  
**Q1**：“请解释 `useEffect` 的依赖数组（dependencies array）的作用。传空数组 `[]`、不传数组、以及传入特定依赖分别代表什么？”  
**A1**：

+ `useEffect(fn)`：**不传依赖数组**。每次渲染后都会执行 `fn`。
+ `useEffect(fn, [])`：**传空数组 **`[]`。只在组件挂载（mount）后执行一次 `fn`，相当于 `componentDidMount`。
+ `useEffect(fn, [a, b])`：**传入特定依赖 **`[a, b]`。只在依赖项 `a` 或 `b` 发生变化时重新执行 `fn`。



**Q2**：“如何在 `useEffect` 中进行清理工作？比如清除定时器或取消订阅。”  
**A2**：  
在 `useEffect` 的回调函数中返回一个清理函数（cleanup function）。React 会在组件卸载时和执行下一次副作用**之前**调用这个清理函数。

```tsx
useEffect(() => {
  const timerId = setInterval(() => { ... }, 1000);
  // 返回清理函数
  return () => {
    clearInterval(timerId); // 清理定时器
  };
}, []); // 依赖为空，只在 mount 和 unmount 时执行
```



**Q3**：“在使用 `useEffect` 进行数据获取（fetch）时，你遇到过哪些常见问题？如何解决？”  
**A3**：

+ **问题1：竞态条件（Race Condition）**

```tsx
useEffect(() => {
  const abortController = new AbortController();
  fetchData(abortController.signal).then(...);
  // 清理函数中取消请求
  return () => {
    abortController.abort();
  };
}, [query]);
```

    - **场景**：先后发送两个请求 A 和 B，但 B 的响应比 A 先返回，导致最终显示的是 A 请求的旧数据。
    - **解决**：在 effect 中使用一个标志（flag）或直接使用 `AbortController` 来取消无效的请求。
+ **问题2：无限循环**
    - **场景**：在 `useEffect` 中更新了 state，但又没有正确设置依赖数组，导致 state 更新 -> 重新渲染 -> effect 执行 -> state 更新 -> ... 的死循环。
    - **解决**：检查依赖数组，确保只包含了 effect 内部真正依赖并会发生变化的值。如果某个依赖（如对象、函数）每次渲染都不同，可以考虑使用 `useCallback` 或 `useMemo` 来稳定引用。

---

### 3. useContext
**用途**：接收一个 context 对象（`React.createContext` 的返回值）并返回该 context 的当前值。它让你能够订阅 context 的变化，而无需使用 Consumer 组件。

**模拟面试官提问**：  
**Q1**：“`useContext(MyContext)` 相当于类组件中的哪个 API？”  
**A1**：  
它相当于类组件中的 `static contextType = MyContext` 或者 `<MyContext.Consumer>`。它让你读取 context 的值以及订阅 context 的变化。



**Q2**：“使用 `useContext` 会导致组件在 context 值变化时重新渲染。如果 context 的值是一个复杂对象，但我的组件只关心其中的一部分，如何优化性能？”  
**A2**：  
这是一个很好的性能优化问题。直接使用 `useContext` 的组件会在 context 的**任何**值变化时重新渲染。

+ **解决方案**：
    1. **拆分 Context**：将单一的大 Context 按逻辑拆分成多个更小的、独立的 Context。
    2. **使用高阶组件或 render props**：在父组件中订阅 context，然后通过 props 将需要的部分值传递给优化的子组件（用 `React.memo` 包裹）。
    3. **使用 useMemo**：在消费组件中，使用 `useMemo` 来避免在 context 的一部分变化时重新计算昂贵的操作，但组件本身仍然会重新渲染。

---

### 4. useReducer
**用途**：是 `useState` 的替代方案。它接收一个形如 `(state, action) => newState` 的 reducer，并返回当前的 state 以及与其配套的 `dispatch` 方法。适用于状态逻辑复杂或下一个状态依赖于之前状态的场景。

**模拟面试官提问**：  
**Q1**：“在什么情况下你会选择使用 `useReducer` 而不是 `useState`？”  
**A1**：

+ state 逻辑较复杂，包含多个子值。
+ 下一个 state 依赖于之前的 state（`useReducer` 的 dispatch 函数的身份永远是稳定的，不会在重新渲染时改变，所以不需要将其作为依赖项传递给其他 Hook，如 `useEffect`）。
+ 需要更可预测的状态管理，便于调试（action 日志）和测试。



**Q2**：“如何用 `useReducer` 和 `useContext` 来实现一个简单的全局状态管理？”  
**A2**：  
这是一个组合应用。可以创建一个 Context 来存储 state 和 dispatch 函数，然后在顶层组件通过 `useReducer` 提供值，在子组件中通过 `useContext` 来获取和派发 action，从而避免层层传递 props。

```tsx
// 创建 Context
const StateContext = createContext();
const DispatchContext = createContext();

// 顶层组件
function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        <ChildComponent />
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

// 子组件
function ChildComponent() {
  const state = useContext(StateContext);
  const dispatch = useContext(DispatchContext);
  // 使用 state 和 dispatch
}
```

---

### 5. useCallback & useMemo
**用途**：都是用于性能优化的 Hook，通过“记忆化”来避免非必要的重复计算或渲染。

+ `useCallback(fn, deps)`：返回一个记忆化的**回调函数**。它只在依赖项改变时才会更新。
+ `useMemo(() => computeExpensiveValue, deps)`：返回一个记忆化的**值**。它只在依赖项改变时才会重新计算。

**模拟面试官提问**：  
**Q1**：“`useCallback` 和 `useMemo` 有什么区别？”  
**A1**：

+ `useCallback`** 记忆的是函数本身（因为在 JS 中，函数也是一种引用数据类型，每次重渲后返回的函数是不同的）**。`useCallback(fn, deps)` 等价于 `useMemo(() => fn, deps)`。
+ `useMemo`** 记忆的是函数执行后返回的值**。



**Q2**：“为什么在向子组件传递函数时，有时需要使用 `useCallback`？”  
**A2**：  
如果不使用 `useCallback`，每次父组件渲染时都会创建一个新的函数实例。如果子组件使用了 `React.memo` 进行了优化，它会对 props 进行浅比较，由于每次传入的函数都是新的，所以会导致子组件不必要的重新渲染。使用 `useCallback` 并指定正确的依赖项可以稳定函数的引用，避免这个问题。

**问题场景**：如果父组件传递一个函数作为 prop 给被 `React.memo` 包裹的子组件，会发生什么？

**分析：**

1. 当 `APP` 组件因为 `Count` 变化而重渲时，`doSomething` 函数会被重新创建。
2. `React.memo` 在比较 `ChildComponent` 的 props 时，发现 `onSomething` prop 的引用地址变了（因为它是新函数），所以认为 props 发生了变化。
3. 因此，`ChildComponent` 会重新渲染，`React.memo` **失效了**。
4. 而当我们传递 `memoizedDoSomething` 时，它的引用地址在多次渲染间是稳定的。`React.memo` 比较后发现 props 没变，于是成功阻止了子组件的重新渲染。

```tsx
// App.tsx (父组件)
import { useState, useCallback } from "react";
import ChildComponent from "./ChildComponent";

function App() {
  const [count, setCount] = useState(0);

  // 问题所在：每次 App 渲染，这个函数都是一个新的实例
  const doSomething = () => {
    console.log("Doing something...");
  };

  // 解决方案：使用 useCallback 保证函数实例的稳定
  const memoizedDoSomething = useCallback(() => {
    console.log("Doing something...");
  }, []);

  return (
    <div>
      <button onClick={() => setCount(count + 1)}>
        Increment Count: {count}
      </button>

      {/* 即使 ChildComponent 被 memo 包裹，但 doSomething prop 每次都是新的，
          所以 ChildComponent 仍然会重新渲染！ */}
      <ChildComponent onSomething={doSomething} />

      {/* 使用 memoizedDoSomething，prop 不会变，
          ChildComponent 就不会重新渲染。 */}
      <ChildComponent onSomething={memoizedDoSomething} />
    </div>
  );
}
```



**Q3**：“滥用 `useCallback` 和 `useMemo` 会带来什么问题？”  
**A3**：

+ **性能反而可能下降**：这两个 Hook 本身也有计算和内存开销。如果记忆化的函数或值计算并不昂贵，依赖项又经常变化，那么优化本身带来的成本可能大于收益。
+ **代码可读性变差**：使代码变得复杂，难以理解。
+ **依赖项 bugs**：如果依赖项设置不正确，可能会导致使用过时的值或函数。

**正确做法**：优先考虑在没有优化的情况下代码是否能正常工作。然后使用 React DevTools Profiler 来识别性能瓶颈，再有针对性地使用这些优化 Hook。

---

### 6. useRef
**用途**：返回一个可变的 ref 对象，其 `.current` 属性被初始化为传入的参数。返回的 ref 对象在组件的整个生命周期内保持不变。

**模拟面试官提问**：  
**Q1**：“`useRef` 的常见使用场景有哪些？”  
**A1**：

1. **访问 DOM 元素**：最经典的用法。

```tsx
function TextInput() {
  const inputEl = useRef(null);
  const onButtonClick = () => {
    inputEl.current.focus(); // 访问 DOM 元素
  };
  return <input ref={inputEl} type="text" />;
}
```

2. **存储任何可变值**：像一个盒子，可以存放一个在组件的整个生命周期中持续存在的值，**更改它不会引发组件重新渲染**。常用于存储定时器 ID、之前的 props/state 值等。



**Q2**：“如何用 `useRef` 来实现一个‘上一次渲染的值’的功能？”  
**A2**：  
这是一个非常巧妙的用法，结合 `useEffect` 即可实现。

```tsx
function usePrevious(value) {
  const ref = useRef();
  // 在渲染完成后，将当前值写入 ref
  useEffect(() => {
    ref.current = value;
  }, [value]); // 依赖 value，每次 value 变化后更新 ref
  return ref.current; // 返回的是上一次渲染时的值
}
```

---

### 总结
| Hook | 核心用途 | 面试常见问题焦点 |
| :--- | :--- | :--- |
| `useState` | 管理组件状态 | 异步更新、函数式更新、惰性初始化 |
| `useEffect` | 处理副作用 | 依赖数组、清理函数、无限循环、竞态条件 |
| `useContext` | 跨层级组件数据传递 | 性能优化（避免不必要的渲染） |
| `useReducer` | 复杂状态逻辑管理 | 适用场景、与 `useState` 的对比、全局状态管理 |
| `useCallback` | 记忆化函数，优化子组件渲染 | 与 `React.memo` 配合、依赖项、避免滥用 |
| `useMemo` | 记忆化值，避免重复计算 | 与 `useCallback` 区别、适用场景、避免滥用 |
| `useRef` | 访问 DOM / 存储可变值（不触发渲染） | DOM 操作、存储实例变量、实现 `usePrevious` |


### 自定义 Hook
#### usePrevious
```tsx
const usePrevious = (value) => {
  const ref = useRef(null);
  useEffect(() => {
    ref.current = value;
  });

  return ref.current;
};
```

#### useFetch
```tsx
import { useState, useEffect } from "react";

interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

function useFetch<T>(url: string, options?: RequestInit): FetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    // 当 url 或 options 变化时，重新发起请求
    // 使用 AbortController 来取消请求，防止组件卸载后仍尝试更新状态
    const controller = new AbortController();
    const signal = controller.signal;

    const fetchData = async () => {
      // 重置状态
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(url, { ...options, signal });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const result = (await response.json()) as T;

        // 仅当请求未被中止时才更新状态
        if (!signal.aborted) {
          setData(result);
        }
      } catch (err: any) {
        // 如果错误是 AbortError，则忽略，这是预期的行为
        if (err.name !== "AbortError") {
          setError(err);
        }
      } finally {
        // 仅当请求未被中止时才更新加载状态
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();

    // useEffect 的清理函数
    // 当组件卸载或依赖项变化时，会调用此函数来中止 fetch 请求
    return () => {
      controller.abort();
    };
  }, [url, options]); // 当 url 或 options 变化时，重新执行 effect

  return { data, loading, error };
}

export default useFetch;
```

#### useDebounce
```tsx
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    // 设置一个定时器，在 delay 毫秒后更新 debouncedValue
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // 清除定时器
    // 如果 value 在 delay 时间内再次变化，这个效果会再次执行并清除上一次的定时器
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]); // 只有当 value 或 delay 变化时 effect 才会重新执行

  return debouncedValue;
}
```

**为什么不能直接在组件里用普通的 **`**debounce**`** 函数？**

让我们来看一个“错误”的例子，你马上就会明白问题所在。

假设我们有一个 Lodash 的 `debounce` 函数。

```tsx
import { useState } from 'react';
import { debounce } from 'lodash'; // 假设我们有这个工具

function SearchComponent() {
  const [inputValue, setInputValue] = useState('');

  // 每次组件渲染时，这都是一个全新的、独立的 debounce 函数实例！
  const debouncedApiCall = debounce((value) => {
    console.log('Fetching data for:', value);
  }, 500);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    debouncedApiCall(value); // 调用这个新创建的 debounce 函数
  };

  return <input value={inputValue} onChange={handleChange} />;
}
```

**这里会发生什么？**

1. 用户输入第一个字符 'a'。
    - `handleChange` 被调用，`setInputValue('a')` 触发组件**重新渲染**。
    - `debouncedApiCall('a')` 被调用，它内部启动了一个 500ms 的定时器。
2. 组件**重新渲染**。
    - `SearchComponent` 函数体再次执行。
    - **关键问题**：`const debouncedApiCall = debounce(...)` **又被执行了一遍**，创建了一个**全新的、与上一个毫无关系的 **`debouncedApiCall`** 实例**。
3. 用户在 500ms 内输入第二个字符 'b'。
    - `handleChange` 被调用，`setInputValue('ab')` 再次触发重渲。
    - `debouncedApiCall('ab')` 被调用，但这是在**第二次渲染时创建的那个新实例**上调用的。它启动了它自己的 500ms 定时器。
    - 第一次渲染时创建的那个 `debounce` 函数和它的定时器，已经被“遗弃”了，它永远不会被清除，但也不会再被调用。

**结果就是：**`debounce`** 完全失效了。** 每一次按键都会创建一个新的 `debounce` 实例，它的内部状态（定时器 ID）在下一次渲染时就丢失了。

---

`**useDebounce**`** 如何解决这个问题？**

`useDebounce` 是一个自定义 Hook，它利用 React 内置的 Hooks (`useState`, `useEffect`, `useRef`) 来解决上述问题，赋予 `debounce` 逻辑以“记忆”和“生命周期管理”的能力。

`useDebounce`** 的核心职责：**

1. **状态持久化**：它需要一个地方来存储“防抖后”的值。这个地方必须能在多次渲染之间保持不变。`useState` 是完美的选择。
2. **生命周期管理**：它需要在输入值变化时启动或重置定时器，并在组件卸载时清除定时器。`useEffect` 正是为此而生。它的清理函数 (`return () => ...`) 可以在下一次 effect 执行前或组件卸载时清除旧的定时器。

**如何使用 **`useDebounce`**：**

```tsx
function SearchComponent() {
  const [inputValue, setInputValue] = useState('');
  
  // 使用 useDebounce Hook
  const debouncedSearchTerm = useDebounce(inputValue, 500);

  // 这个 useEffect 只会在 debouncedSearchTerm 变化时执行
  useEffect(() => {
    if (debouncedSearchTerm) {
      console.log('Fetching data for:', debouncedSearchTerm);
    }
  }, [debouncedSearchTerm]);

  return (
    <input 
      value={inputValue} 
      onChange={(e) => setInputValue(e.target.value)} 
    />
  );
}
```

