全面地来梳理一下 JS 中的错误处理，主要分下面几个阶段来介绍：

1.  **基础篇：** 认识 JavaScript 的原生错误类型。
2.  **进阶篇：** 全方位的错误捕获策略（同步、异步、全局）。
3.  **架构篇：** 为什么我们需要 Sentry 这样的监控平台。

---

### 第一阶段：JS 错误类型

在 JavaScript 中，所有的错误对象都继承自 `Error` 原型。了解具体的错误类型有助于我们快速定位问题根源。

#### 1. `Error` (基类)

这是所有错误的基类。通常用于开发者手动抛出通用错误。

```javascript
throw new Error('这是一个通用错误');
```

#### 2. `ReferenceError` (引用错误)

**场景：** 引用了一个不存在（未声明）的变量。
**常见原因：** 拼写错误、作用域问题、在 `let`/`const` 声明前使用变量（暂时性死区）。

```javascript
console.log(a); // Uncaught ReferenceError: a is not defined
```

#### 3. `TypeError` (类型错误)

**场景：** 变量或参数不是预期的类型。这是前端最常见的错误之一。
**常见原因：** 对 `undefined` 或 `null` 读取属性、把对象当函数调用。

```javascript
const b = null;
b.name; // Uncaught TypeError: Cannot read properties of null (reading 'name')
```

#### 4. `SyntaxError` (语法错误)

**场景：** 代码不符合 JS 语法规则。
**特点：** 这种错误在解析阶段就会抛出，导致整个脚本无法运行（除非是在 `eval` 中）。

```javascript
const c = ; // Uncaught SyntaxError: Unexpected token ';'
```

#### 5. `RangeError` (范围错误)

**场景：** 数值超出了允许的范围。
**常见原因：** 无限递归导致栈溢出、数组长度设为负数。

```javascript
function loop() {
    loop();
}
loop(); // Uncaught RangeError: Maximum call stack size exceeded
```

#### 6. `URIError` (URI 错误)

**场景：** 使用 `decodeURIComponent` 或 `encodeURIComponent` 处理非法字符时。

```javascript
decodeURIComponent('%'); // Uncaught URIError: URI malformed
```

#### 7. `EvalError`

**场景：** 全局 `eval()` 函数使用不当。在现代 JS 中极少遇到。

---

### 第二阶段：错误的捕获和处理方法

了解了错误类型，我们需要知道如何捕获它们，防止应用崩溃（白屏）。

#### 1. 同步代码中的错误捕获

在继续下面的内容之前，我们先要区分 JS 中 `throw` 和 `try...catch` 的区别和作用：

-   `throw (抛出)`：它的核心作用是中断当前的程序执行流。就像你在高速公路上开车，突然踩了一脚急刹车并弃车而逃。

-   `try...catch (捕获)`：它的核心作用是恢复或者是接管控制权。就像救援队赶到现场，把车拖走，疏导交通，让后面的车（后续代码）能继续通行。

我们通过一段代码实例来理解:

```javascript
function dangerousTask() {
    // 1. 抛出错误
    throw new Error('任务失败！');
}

dangerousTask();

// 2. 灾难后果：这行代码永远不会执行！
// 整个脚本在这里就挂了，用户看到的是点击按钮没反应，或者白屏。
console.log('我希望能继续运行...');
```

而使用了 `try...catch` 就可以避免这种问题:

```javascript
function dangerousTask() {
    throw new Error('任务失败！');
}

try {
    dangerousTask();
} catch (e) {
    // 1. 捕获错误：我们控制住了局面，整个程序不会因为被抛出的错误而中断。
    console.log('捕获到了错误，正在进行补救措施...');
}

// 2. 成功存活：这行代码会正常执行！
// 应用没有崩溃，用户可能只是看到了一个“重试”按钮。
console.log('我希望能继续运行...');
```

此外，在大型应用中，错误往往发生在很深的地方（比如：UI 组件 -> 数据层 -> API 请求 -> 数据解析）。

Error 类型的设计初衷是为了传递信息。当深层函数 throw 一个 Error 时（不一定是手动写了 `throw new Error()`，也可能是其它各种原因触发并抛出了这个错误，比如读取一个 null 变量的属性，就会自动抛出 TypeError），它会像气泡一样一层层往上冒（Bubble up）。

-   如果没有 try...catch 拦截这个气泡，它最终会冒到浏览器顶层，导致整个线程报错（Uncaught Exception）。

-   我们需要 try...catch 在合适的层级（比如 UI 层）拦截它，读取 Error 里的信息，然后告诉用户发生了什么。

并不是所有的 throw 都是因为代码写错了。很多时候，我们主动 throw 是为了控制业务逻辑，比如：

```javascript
async function login(username, password) {
    if (!username) {
        // 我们主动 throw，因为这不符合业务规则
        // 这里 throw 是为了中断后续的请求发送
        throw new Error('用户名不能为空');
    }

    // ... 发送请求，当然如果错误被抛出，这后面也就不会执行了
    await fetch('https://api.example.com/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
    });
}

// 在 UI 层调用（比如调用 login 函数时）
async function handleLoginBtnClick() {
    try {
        // 用户名为空，那么就会触发 login 函数内部的 throw
        // 然后被抛出的 Error 会被 try...catch 捕获到，
        // 从而让我们来控制业务逻辑，而不是直接中断整个程序运行
        await login('', '123456');
    } catch (err) {
        // 这里我们需要 catch！
        // 不是因为程序崩了，而是为了拿到那个 "用户名不能为空" 的文案
        // 并把它展示在输入框下面给用户看
        alert(err.message);
    }
}
```

#### 2. 异步代码中的捕获 (Promise)

`try...catch` 是最基础的捕获方式，但它**无法**捕获异步错误（如 `setTimeout` 或 `Promise`）。`Promise` 里的错误需要通过 `.catch()` 捕获。

比如这种方式是无法捕获 Promise 的错误的：

```javascript
try {
    fetch('/api/data').then(res => res.json());
} catch (error) {
    console.error('无法捕获 Promise 错误:', error);
}
```

应该采用以下的方式，通过 `.catch()` 来捕获：

```javascript
fetch('/api/data')
    .then(res => res.json())
    .catch(error => {
        console.error('请求失败:', error);
    });
```

简单来说，`.catch()` 会在 Promise 的状态变为 **Rejected (已拒绝)** 时被触发。

具体来说，以下 **4 种情况** 会导致 Promise 走向 Rejected 状态，从而触发 `.catch()`：

##### 1. 主动调用 `reject()`

这是最标准的方式。在 `new Promise` 的执行器函数中，如果你判断操作失败了，主动调用 `reject`。

```javascript
const p = new Promise((resolve, reject) => {
    const success = false;
    if (!success) {
        // 主动拒绝，触发 catch
        reject(new Error('手动拒绝'));
    }
});

p.catch(err => console.log(err.message)); // 输出: 手动拒绝
```

##### 2. 在 Promise 内部 `throw` 抛出错误

Promise 的执行器（Executor）和 `.then` 回调都被包裹在一个隐式的 `try...catch` 中。如果你在里面 `throw` 一个错误，Promise 会自动将其捕获并转为 Rejected 状态。

```javascript
new Promise((resolve, reject) => {
    // 这里没有用 reject，而是直接 throw
    throw new Error('抛出错误');
}).catch(err => console.log(err.message)); // 输出: 抛出错误
```

##### 3. 代码运行出错 (Runtime Error)

这其实是第 2 点的变种。如果在 Promise 内部发生了语法错误或类型错误（比如读取 `null` 的属性），JS 引擎会抛出异常，进而被 Promise 机制捕获并触发 `.catch`。

```javascript
new Promise(resolve => {
    const obj = null;
    // 这一行会报错 TypeError，导致 Promise 变为 Rejected
    console.log(obj.name);
}).catch(err => console.log('捕获到运行时错误:', err));
```

##### 4. 链式调用中，上一个 `.then` 返回了 Rejected 状态

这是 Promise 链式调用的特性。如果 `fetch` 成功了，但在第一个 `.then` 里处理数据时出错了，这个错误会“穿透”后续的 `.then`，直接跳到最近的 `.catch`。

```javascript
fetch('/api/data')
    .then(res => {
        // 假设 fetch 成功了，进入这里
        // 但是这里抛出了错误（比如 JSON 解析失败，或者逻辑错误）
        throw new Error('处理数据时出错');
    })
    .then(() => {
        //这一步会被跳过！
        console.log('我不会执行');
    })
    .catch(err => {
        // 捕获到上一个 then 里的错误
        console.log('捕获:', err.message);
    });
```

只要 Promise 链条上的**任何一个环节**（无论是源头，还是中间的 `.then`）发生了错误（`reject` 或 `throw`），控制权都会像滑滑梯一样，直接滑落到最近的 `.catch()` 中。

#### 3. 终极异步捕获：`async/await` + `try...catch`

这是现代 JS 最推荐的写法，让异步错误处理就像同步代码的错误处理一样直观了，都可以通过 `try...catch` 来捕获。

```javascript
async function fetchData() {
    try {
        const res = await fetch('/api/data');
    } catch (error) {
        console.error('异步捕获成功:', error);
    }
}
```

**`async/await` vs `.catch()` 的核心区别：**

虽然它们底层都是 Promise，但在使用体验上有显著差异：

1.  **代码可读性**：`async/await` 让代码看起来像同步代码，符合人类线性的思维习惯。而 `.catch` 链式调用在逻辑复杂时容易形成嵌套。

2.  **混合捕获能力**：`try...catch` 可以同时捕获**异步操作的错误**（`await` 失败，即对应的 Promise 变为 Rejected 状态）和**同步代码的错误**（比如在处理数据时访问了不存在的属性）。

    ```javascript
    // async/await 方式
    try {
        const data = await fetch('/api').then(r => r.json());
        // 如果下面这行同步代码报错，catch 也能捕获到！
        console.log(data.user.name);
    } catch (err) {
        console.log('捕获所有错误:', err);
    }

    // Promise 链式方式
    fetch('/api')
        .then(r => r.json())
        .then(data => {
            console.log(data.user.name);
        })
        .catch(err => {
            // 只能捕获链条里的错误
            console.log('捕获 Promise 错误:', err);
        });
    // 如果这里有同步代码报错，上面的 catch 抓不到
    ```

3.  **调试体验**：在 `async/await` 中，错误堆栈通常比 Promise 链更清晰，更容易定位到具体的函数调用栈。

#### 4. 全局同步错误兜底：`error` 事件

当上述局部捕获失效时，我们需要最后一道防线。它可以捕获大多数同步错误和部分异步错误。

```javascript
// 假设没有局部的 try catch，全局的 error 事件能否捕获？
throw new Error('出错了');

window.addEventListener('error', event => {
    // 可以捕获到错误！
    console.log('全局捕获:', event.message);
    // 调用 preventDefault 可以阻止错误向上抛出（控制台不报红）
    event.preventDefault();
});
```

此外，`error` 事件还能捕获**资源加载错误(Resource Loading Errors)**：
`<img>、<script>、<link>` 等标签加载失败（404）时，addEventListener('error', event => {}) 可以在捕获阶段 (Capture Phase) 抓到它:

```javascript
window.addEventListener(
    'error',
    event => {
        // 区分是脚本错误还是资源加载错误
        if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT')) {
            console.log('资源加载失败:', event.target.src);
        } else {
            console.log('全局脚本错误:', event.message);
        }
    },
    true,
);
```

#### 5. 全局 Promise 异步错误兜底：`unhandledrejection` 事件

这是很多开发者容易忽略的地方。全局 `error` 事件**捕获不到** 未处理的 Promise 错误（即没有写 `.catch` 的 Promise）。

```javascript
window.addEventListener('unhandledrejection', event => {
    console.error('未处理的 Promise 拒绝:', event.reason);
    event.preventDefault(); // 防止控制台报错
});
```

#### 6. React 中的错误边界 (Error Boundary)

**场景：** 在 React 中，如果一个组件内部抛出了错误（比如渲染时读取了 `null.name` 触发 TypeError），默认情况下，React 会卸载整个组件树，导致页面直接白屏。这就像因为一个房间的灯泡坏了，就把整栋楼的电都断了，非常暴力。

**解决方案：** 错误边界（Error Boundary）是一种 React 组件，它可以**捕获子组件树中发生的 JavaScript 错误**，记录错误日志，并展示一个降级 UI（比如“出错了”的提示），而不是让整个应用崩溃。

**核心实现：**

目前（截至 React 18/19），错误边界**必须使用类组件**来实现（这是少数几个必须用 Class 的场景之一）。它依赖两个生命周期方法：

1.  `static getDerivedStateFromError(error)`: 更新 state，让下一次渲染展示降级 UI。
2.  `componentDidCatch(error, errorInfo)`: 用于记录错误日志（比如发送到 Sentry）。

```javascript
// 错误边界组件，可以了解一下类组件的一些基本写法，虽然现在 hooks 很流行了
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error) {
        // 更新 state 使下一次渲染能够显示降级后的 UI
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        // 你同样可以将错误日志上报给服务器
        console.error('Uncaught error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            // 你可以自定义降级后的 UI 并渲染
            return <h1>Something went wrong.</h1>;
        }

        return this.props.children;
    }
}
```

**使用方式：**

像普通组件一样包裹可能出错的业务组件：

```jsx
<ErrorBoundary>
    <MyWidget />
</ErrorBoundary>
```

**注意点（局限性）：**

错误边界**不能**捕获以下场景的错误：

1.  **事件处理器**（Event Handlers）：比如 `onClick` 里的错误。React 依然会捕获它防止应用崩溃，但不会触发 Error Boundary。对于事件处理器，请继续使用普通的 `try...catch`。
2.  **异步代码**（如 `setTimeout` 或 `requestAnimationFrame` 回调）。
3.  **服务端渲染**（SSR）。
4.  **它自身抛出的错误**（并非它的子组件）。

**Hooks 时代的替代方案：**

虽然官方还没有推出 `useErrorBoundary` 这样的 Hook，但在函数式组件为主的今天，社区通常推荐使用 `react-error-boundary` 这个库，它提供了更灵活的 API 和 Hook 支持，让我们能以更现代的方式处理组件错误。

### 第三阶段：架构篇 - 为什么需要 Sentry？

你可能会问：“既然我有 `try...catch` 和 `window.onerror`，为什么还需要 Sentry 这种第三方服务？”

这就涉及到了**本地开发**与**生产环境**的巨大差异。

#### 1. "它在我的机器上是好的" (环境差异)

用户使用的设备千奇百怪（低版本 Android、老旧 iOS、各种魔改浏览器）。

-   **本地：** 你在高性能 Mac + 最新 Chrome 上开发。
-   **现实：** 用户在 5 年前的安卓机 + 弱网环境下运行。
-   **Sentry 的作用：** 它会记录错误发生时的**设备信息、浏览器版本、操作系统**，帮你复现那些只在特定环境下出现的 Bug。

#### 2. 还原现场 (上下文 Context)

当全局 `error` 事件告诉你 `Cannot read property 'id' of null` 时，你并不知道用户之前做了什么。

-   **Sentry 的作用 (Breadcrumbs)：** Sentry 会记录错误发生前的**用户行为路径**（面包屑）。
    -   \*用户点击了按钮 A -> 发起了 API 请求 B -> 路由跳转到 C -> **报错\***。
    -   这对于定位逻辑错误至关重要。

#### 3. 源码映射 (Source Maps)

生产环境的代码通常是压缩混淆过的（如 `a.js` 第一行第 5000 列报错）。看着这种代码，你根本不知道对应源码的哪一行。

-   **Sentry 的作用：** 你可以在构建时上传 Source Map 到 Sentry（用户端不加载，保证安全）。Sentry 接收到混淆的报错后，会自动反解出**原始代码的文件名、行号和具体代码片段**。

#### 4. 报警与聚合 (Alerting & Aggregation)

如果你的应用有 10 万用户，一个 Bug 可能导致一分钟内产生 1000 条报错。

-   **Sentry 的作用：** 它会自动将相同的错误**聚合**在一起，告诉你“这个问题影响了 500 个用户，共发生了 2000 次”。它还可以配置报警规则（如：每小时错误率超过 1% 发送邮件/Slack 通知），让你由被动修 Bug 变为主动治理。

### 总结

1.  **写代码时**：清楚 `TypeError` 和 `ReferenceError` 的区别，合理使用 `try...catch` 和 `async/await`。
2.  **架构应用时**：必须配置全局 `error` 事件和 `unhandledrejection` 事件进行全局兜底。
3.  **上线生产时**：**必须**接入 Sentry 或类似的监控平台。因为在前端领域，**捕获不到的错误 = 用户流失**。没有监控的生产环境就是在“裸奔”。

这就是 JS 和前端项目中完整的错误处理知识体系。
