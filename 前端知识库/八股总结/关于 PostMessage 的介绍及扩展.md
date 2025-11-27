`postMessage` 是 `JavaScript` 中用于实现**跨文档通信**（`Cross-document Messaging`）的重要 API，它允许来自不同源（`origin`）的窗口、`iframe`、`worker` 等之间安全地传递数据。

### 一、基本用途
`postMessage` 主要用于以下场景：

+ 页面与嵌入的 `<iframe>` 之间通信（即使跨域）
+ 主线程与 Web Worker 之间通信

### 二、基本用法
#### 发送消息
```javascript
targetWindow.postMessage(message, targetOrigin, [transfer]);
```

`targetWindow`：目标窗口的引用（如 `iframe.contentWindow`、`window.open()` 返回的窗口等）

`message`：要发送的数据，可以是字符串、对象、数组、Blob 等（通过结构化克隆算法复制）

`targetOrigin`：指定目标窗口的源（协议 + 域名 + 端口），用于安全校验。可设为具体 URL（如 `'https://example.com'`）或 `'*'`（不推荐，有安全风险）

`transfer`（可选）：用于转移所有权的对象（如 `MessagePort`、`ArrayBuffer`），转移后原上下文无法再使用



`postMessage`发送出去的数据本质上是经过结构化克隆的（Structured Clone，也就是所谓的深克隆），那么就要求数据必须是可序列化的，<font style="color:#DF2A3F;">不能传输如函数，DOM 节点这样的非序列化数据。</font>

#### 接收消息
通过监听 `message` 事件：

```javascript
window.addEventListener('message', (event) => {
  // 安全检查：验证来源
  if (event.origin !== 'https://trusted-site.com') return;

  console.log('收到消息:', event.data);
  console.log('来源:', event.origin);
  console.log('发送源窗口:', event.source);
});
```

关键属性：

`event.data`：接收到的消息内容

`event.origin`：发送方的源（用于验证是否可信）

`event.source`：对发送窗口的引用（可用于回信）

### 三、使用场景详解
#### 跨源之间的文档通信
`postMessage`可以解决跨源之间的文档通信问题，其用法如之前所述，这里重点介绍一下另一种<u>同源之间的跨文档通信</u>`<u>BroadcastChannel</u>`



**核心区别：**

`postMessage`：像**打电话**。通常用于两个已知的、不同源的窗口/iframe 之间进行**点对点**通信。

`BroadcastChannel`：像**广播喊话**。在**所有同源**的标签页、窗口或 iframe 之间创建一个共享的通信频道，实现**一对多**的广播。



**使用场景：**

比如打开了多个同源的标签页，而在某一标签页下进行了操作，又希望在所有标签页中同步此操作，例如：

+ **用户登出**：在一个标签页点击登出，所有其他标签页都应收到通知并同步登出状态。
+ **主题切换**：在一个标签页切换了深色/浅色模式，其他标签页也应立即切换。
+ **购物车更新**：在一个标签页添加商品到购物车，其他标签页的购物车图标应同步更新数量。



**使用方法：**

使用起来非常简单：

1. **创建/加入频道**：所有标签页都使用**同一个频道名称**来创建 `BroadcastChannel` 实例。
2. **发送消息**：在一个标签页上，使用 `.postMessage()` 发送消息。
3. **接收消息**：在其他标签页上，通过 `message` 事件监听器来接收并处理消息。

**标签页 A (发送方):**

```javascript
// 1. 创建或加入名为 'my-app-channel' 的频道
const bc = new BroadcastChannel('my-app-channel');

function logout() {
  console.log('在本页执行登出操作...');
  // 2. 向频道广播一个消息
  bc.postMessage({
    type: 'LOGOUT',
    timestamp: Date.now()
  });
}

// 假设用户点击了登出按钮
// logout();
```

**标签页 B (接收方):**

```javascript
// 1. 同样加入名为 'my-app-channel' 的频道
const bc = new BroadcastChannel('my-app-channel');

// 3. 监听来自频道的消息
bc.onmessage = (event) => {
  console.log('收到广播消息:', event.data);
  
  if (event.data && event.data.type === 'LOGOUT') {
    console.log('接收到登出通知，同步更新本页状态...');
    // 在这里执行同步登出的逻辑
  }
};
```

对于**同源多标签页**的状态同步，`BroadcastChannel` 是比 `localStorage` + `storage` 事件更现代、更直接、延迟更低的解决方案。

#### 主线程与 Web Worker 之间的通信
**简单介绍：**

**是什么**：一个在后台运行的 JavaScript 线程，与主 UI 线程分离。

**目的**：处理**计算密集型**或**耗时**的任务，避免阻塞主线程，防止页面卡顿或无响应。

**核心能力**：

+ 执行复杂的数学计算、大量数据处理（如排序、搜索）、图像处理等。
+ 不能直接操作 DOM。
+ 通过 `postMessage` API 与主线程进行通信。

**生命周期**：与创建它的标签页绑定。标签页关闭，`Web Worker`也就终止了。

```javascript
// main.js (主线程)
const worker = new Worker('worker.js');
worker.postMessage({ number: 40 }); // 发送任务
worker.onmessage = (e) => {
  console.log('从 Worker 收到结果:', e.data); // 接收结果
};

// worker.js (Worker 线程)
self.onmessage = (e) => {
  // 执行耗时计算
  const result = performComplexCalculation(e.data.number);
  self.postMessage(result); // 发回结果
};
```



**关于 Web Worker 的延申：**

**Web Worker** 的设计初衷，就是为了给单线程的 JavaScript 带来一种**安全、简单**的多线程能力。

##### 默认的“简单”多线程模型
在默认情况下，Web Worker 的工作方式比较简单：

+ **无共享内存**：主线程和 Worker 线程之间通过 `postMessage` 通信。这个过程不是传递内存引用，而是**复制数据**（使用结构化克隆算法）。就像你给同事发了一份文件的复印件，你们各自修改自己的复印件，互不影响。
+ **无线程冲突**：因为没有共享内存，所以从根本上避免了多线程编程中最头疼的问题——**竞争条件（Race Conditions）**。
+ **无需手动加锁**：既然没有竞争，自然也就不需要**互斥锁（Mutex）**、信号量等复杂的同步机制。
+ **无手动线程切换**：开发者无法控制线程的调度和切换，这些由浏览器和操作系统在底层管理。

> **结论**：在默认模式下，Web Worker 提供了一个非常“省心”的多线程环境，让你专注于计算任务本身，而不用担心复杂的线程同步问题。
>



##### 可选的“复杂”多线程模型（高级用法）
然而，为了支持更高性能的并行计算场景（例如，WebAssembly、大型游戏、音视频处理），浏览器也提供了更接近传统多线程编程的“高级模式”。

这套模式的核心是 `SharedArrayBuffer` 和 `Atomics`。

`SharedArrayBuffer`：

+ 它允许你创建一块**真正的共享内存**，可以被主线程和多个 Worker 线程同时访问和修改。
+ **优点**：避免了大数据复制的巨大开销，性能极高。
+ **缺点**：带来了竞争条件的风险。

`Atomics`：

为了解决 `SharedArrayBuffer` 带来的竞争问题，JavaScript 提供了 `Atomics` 对象。它提供了一系列**原子操作**，确保这些操作在执行时不会被其他线程中断。利用 `Atomics`，你**可以实现更复杂的多线程编程概念**：

+ `Atomics.wait()`** 和 **`Atomics.notify()`：可以用来实现线程的等待和唤醒，这是构建**互斥锁（Mutex）**的基础。
+ `Atomics.store()`** 和 **`Atomics.load()`：保证了对共享内存的读写是原子性的。
+ `Atomics.add()`**, **`Atomics.compareExchange()` 等：提供了原子性的“读-改-写”操作。

> **结论**：通过 `SharedArrayBuffer` 和 `Atomics`，JavaScript **确实具备了实现复杂多线程编程（如互斥锁）的能力**，但这是一种需要开发者明确选择（opt-in）的高级功能，因为它也带来了传统多线程编程的复杂性和风险。
>

