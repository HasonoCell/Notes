# SSE
服务器发送事件（Server-Sent Events, SSE）允许客户端通过 HTTP 连接从服务器实时接收单向数据流（服务器 → 客户端），常用于实现实时更新、通知推送等场景。

比如在 AI 对话平台项目中，想要流式返回 AI 的响应结果，SSE 就是再好不过的选择，下面的代码例子也会围绕流式返回 AI 消息这一场景展开。

核心特点
1. 单向通信：服务器主动推送数据到客户端，客户端不能通过此连接向服务器发送数据（如需双向通信，应使用 WebSocket）。

2. 基于 HTTP/HTTPS：使用简单 HTTP 长连接（Keep-Alive），兼容现有网络设施（如代理、防火墙）。

3. 自动重连：连接断开时，浏览器会自动尝试重新连接（可配置重试时间）。

4. 文本数据传输：数据格式为 UTF-8 文本（支持 JSON、纯文本等）。



SSE 协议本身是基于文本流的，每次后端写入一个 SSE 连接的内容可以包含如下字段（注意格式：每行一个字段名，字段名后跟冒号和空格，每行要用两个`\n\n`结尾）

```plain
id: 123
event: myevent
retry: 5000
data: {"type": "alert", "text": "Hello!"}
data: 你好,世界
```

+ data 字段可以有多行，前端收到时会自动拼接。
+ event 字段指定事件类型，前端用 eventSource.addEventListener('myevent', ...) 监听，如果没有设置 event，默认使用 onmessage 监听：eventSource.addEventListener('message', ...)。
+ id 字段用于断线重连。
+ retry 字段用于指定重连时间。

在 TS 中，EventSource.onmessage 的回调参数类型是`MessageEvent<T>`，其中泛型参数 T 就是 data 字段的类型（可以使用`JSON.parse`解析）


# WebSocket
## WebSocket 是什么？
WebSocket 是一种在**单个 TCP 连接上进行全双工通信**的协议。

+ **全双工 (Full-Duplex)**: 这是 WebSocket 最核心的特点。一旦连接建立，客户端和服务器**双方可以随时、同时向对方发送数据**，没有严格的请求-响应模式。就像打电话一样，两个人可以同时说话。
+ **单个 TCP 连接**: 连接一旦建立，就会保持活动状态（persistent connection），直到客户端或服务器主动关闭。所有数据都在这个连接上传输，避免了 HTTP 的重复连接开销。
+ **协议升级**: WebSocket 连接通常以一个标准的 HTTP/HTTPS 请求开始，请求头中包含一个 `Upgrade: websocket` 的字段。如果服务器支持，它会同意“升级”协议，从 HTTP 切换到 WebSocket。

## WebSocket 的工作流程
1. **握手 (Handshake)**:
    - 客户端发送一个 HTTP GET 请求，请求头包含 `Upgrade: websocket` 和 `Connection: Upgrade`。
    - 服务器验证请求，如果同意升级，会返回一个状态码为 `101 Switching Protocols` 的响应。
2. **数据传输**:
    - 握手成功后，HTTP 连接就升级成了 WebSocket 连接。
    - 之后，客户端和服务器就可以通过这个连接自由地、双向地发送数据帧（frames）。这些数据可以是文本，也可以是二进制数据。
3. **关闭连接**:
    - 任何一方都可以发起关闭请求来终止连接。

## WebSocket 与 SSE 的核心区别
| 特性 | WebSocket (WS) | Server-Sent Events (SSE) |
| :--- | :--- | :--- |
| **通信方向** | **双向通信 (Bi-directional)** | **单向通信 (Uni-directional)** |
|  | 客户端 ↔ 服务器 | 服务器 → 客户端 |
| **协议** | 自有的 `ws://` 或 `wss://` 协议 | 基于标准 HTTP/HTTPS |
| **传输数据** | 文本和二进制数据 | 只能是 UTF-8 格式的文本 |
| **连接管理** | 需要专门的库来处理连接、心跳机制和短断线重连 | 浏览器内置 `EventSource` API，**自动处理断线重连** |
| **错误处理** | 需要手动实现错误处理逻辑 | `EventSource` API 提供了 `onerror` 事件 |
| **服务器实现** | 需要特定的服务器支持 WebSocket 协议（例如 Node.js 的 `ws` 库） | 任何现代的后端 HTTP 服务器都可以实现，只需遵循特定格式返回数据流即可 |
| **代理/防火墙兼容性** | 有时会因为非标准 HTTP 协议而被公司防火墙或代理服务器阻断 | 兼容性更好，因为它就是标准的 HTTP |


### 什么时候选择 WebSocket？
当你的应用场景需要**真正的实时、双向交互**时，WebSocket 是不二之选。

+ **在线聊天室/即时通讯**: 用户需要发送消息，也需要实时接收别人的消息。
+ **多人在线游戏**: 玩家的操作需要立即发送给服务器，服务器也需要把其他玩家的状态实时广播给所有玩家。
+ **协同编辑工具** (如 Google Docs): 你输入的内容需要实时同步给其他人，别人的修改也需要实时显示在你的屏幕上。
+ **实时数据监控面板**: 如果客户端也需要向服务器发送指令（例如，调整监控参数），而不仅仅是接收数据。

### 什么时候选择 SSE？
当你的应用场景主要是**从服务器向客户端单向推送更新**时，SSE 更简单、更轻量。

+ **新闻推送、股票行情更新**: 客户端只需要被动接收服务器的最新数据。
+ **状态更新**: 如显示文件上传进度、后台任务处理状态等。
+ **AI 对话流式输出**: 正如你的项目中所做的，AI 的回复是服务器单向推送到客户端的，SSE 非常适合。
+ **通知系统**: 当有新消息或提醒时，服务器向客户端推送通知。

## 关键的心跳机制和短线重连
### 心跳机制 (Heartbeat)
#### 为什么需要心跳？
1. **维持连接活跃**: <font style="color:#DF2A3F;">很多网络设备（如路由器、防火墙、代理服务器）会自动关闭长时间没有数据传输的“空闲”连接。</font>心跳就是定期发送少量数据，模拟“心跳”，告诉网络设备：“这个连接还活着，别关掉我”。
2. **检测连接状态**: 如果一方在指定时间内没有收到对方的心跳，就可以判断连接已经断开（可能是网络问题、对方崩溃等），从而可以及时触发重连逻辑。

#### 如何实现心跳？
心跳机制通常是一个双向确认的过程：

1. **客户端发起心跳**:

```javascript
// 客户端伪代码
let heartbeatInterval;
const ws = new WebSocket('ws://example.com/socket');

ws.onopen = () => {
  console.log('WebSocket connected');
  startHeartbeat();
};

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30000); // 每30秒发送一次 ping
}
```

客户端启动一个定时器（例如 `setInterval`），每隔一段时间（比如 30 秒）向服务器发送一个预定义的心跳消息。这个消息可以是一个简单的字符串，如 `"ping"`，或者一个 JSON 对象，如 `{ type: 'ping' }`。

2. **服务器响应心跳**:

```javascript
// 服务器端伪代码 (Node.js with 'ws' library)
wss.on('connection', ws => {
  ws.on('message', message => {
    const data = JSON.parse(message);
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong' }));
    }
  });
});
```

服务器收到客户端的 `ping` 消息后，应立即回复一个 `pong` 消息，如 `{ type: 'pong' }`。

3. **客户端检测心跳响应 (超时检测)**:

```javascript
// 客户端伪代码 (更完整的版本)
let heartbeatTimeout;

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'pong') {
    // 收到了心跳响应，清除超时定时器
    clearTimeout(heartbeatTimeout);
  }
  // ...处理其他业务消息
};

function startHeartbeat() {
  heartbeatInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'ping' }));
      
      // 设置一个超时定时器，如果服务器没在5秒内响应，就认为断线了
      heartbeatTimeout = setTimeout(() => {
        console.log('Heartbeat timeout. Closing connection.');
        ws.close(); // 这会触发 onclose 事件
      }, 5000);
    }
  }, 30000);
}

ws.onclose = () => {
  clearInterval(heartbeatInterval);
  clearTimeout(heartbeatTimeout);
  // 在这里触发重连逻辑
};
```

客户端在发送 `ping` 后，会期待在短时间内（比如 5-10 秒）收到服务器的 `pong`。

我们可以设置一个定时器，如果在规定时间内没有收到 `pong`，就认为连接已断开，然后主动关闭当前连接并触发重连。

### 断线重连 (Reconnection)
#### 为什么需要重连？
网络是不稳定的。用户的设备可能暂时断网、切换 Wi-Fi/4G，或者服务器可能重启。断线重连机制可以确保在连接意外中断后，应用能自动尝试恢复连接，提升用户体验。

#### 如何实现重连？
重连逻辑通常在 WebSocket 的 `onclose` 或 `onerror` 事件中被触发。

1. **监听 **`onclose`** 事件**: 当连接关闭时（无论是正常关闭还是异常断开），`onclose` 事件都会被触发。
2. **实现重连策略**:
3. **立即重连**: 最简单的方式，但如果服务器持续不可用，会造成大量无效请求。
4. **<font style="color:#DF2A3F;">指数退避 (Exponential Backoff)</font>**<font style="color:#DF2A3F;">: 一种更优雅的策略。每次重连失败后，增加下一次重连的等待时间（例如 2s, 4s, 8s, 16s...），直到一个最大值。</font>这可以有效避免在服务器宕机时对其造成“请求风暴”。

#### 示例：带指数退避的断线重连
```javascript
// 客户端伪代码
let reconnectAttempts = 0;
const maxReconnectAttempts = 10;
let reconnectTimeout;

function connect() {
  const ws = new WebSocket('ws://example.com/socket');

  ws.onopen = () => {
    console.log('WebSocket connected');
    reconnectAttempts = 0; // 连接成功后，重置尝试次数
    startHeartbeat();
  };

  ws.onclose = (event) => {
    console.log('WebSocket closed. Code:', event.code);
    clearInterval(heartbeatInterval);
    clearTimeout(heartbeatTimeout);

    // 只有在非正常关闭时才重连
    if (event.code !== 1000) { 
      handleReconnect();
    }
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
    // onerror 之后通常会紧跟着 onclose，所以重连逻辑放在 onclose 中统一处理
  };

  // ... onmessage 等其他处理
}

function handleReconnect() {
  if (reconnectAttempts < maxReconnectAttempts) {
    reconnectAttempts++;
    // 指数退避策略
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000); // 最小2秒，最大30秒
    console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
    
    reconnectTimeout = setTimeout(() => {
      connect(); // 尝试重新连接
    }, delay);
  } else {
    console.log('Max reconnect attempts reached. Giving up.');
  }
}

// 初始连接
connect();
```

### 总结
**心跳**：主动行为，通过定期收发消息来**维持连接**和**检测死链**。

**重连**：被动行为，在检测到连接断开后（通常由心跳超时或 `onclose` 事件触发）的**恢复措施**。



