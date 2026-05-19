在 AI 流式对话场景的有关业务中，SSE 是一个非常关键的技术点，其单向实时推送，使用简单，性能优越的特点，使其成为了流式对话场景的第一选择。本文不介绍 SSE 的基本使用（若感兴趣可自行查阅 [MDN 文档](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)），而将深入剖析 SSE 的网络传输机制和优化手段。

# 前端网络传输中常见的数据格式和类型

在开始 SSE 的有关分析之前，我们有必要了解一下前端网络传输中常见的数据格式和类型。

1. `Byte`，它是计算机存储传输数据的最小单位，1 Byte = 8 Bits（8 个二进制数据 `0` 或 `1`）。一个英文字母通常占 1 Byte，但一个汉字（UTF-8编码）通常占 3 Bytes。

2. `ArrayBuffer`，一段固定长度的、连续的内存空间。它代表了最原始的二进制数据，由字节组成。你**不能直接读写它里面的内容**，只能知道他的长度，必须通过“视图”（View）来操作它。

3. `Uint8Array (TypedArray 的一种)`，它是 ArrayBuffer 的一种“视图”。Uint8 意思就是“把数据当做 0-255 的无符号整数（Unsigned Integer 8-bit）”来看待。它是浏览器中操作二进制数据最主要的格式，通过它，你可以读取 ArrayBuffer 里的每一个字节了。可以说，ArrayBuffer 是内存（地皮），Uint8Array 是操作接口（用来种地的锄头）。Uint8Array 这个数组中的每一项都是 0-255 之间的整数，代表一个字节，即一个字符的编码，比如 `[72, 101, 108, 108, 111]` 经过 UTF-8 解码后就变成了 `Hello` 这个字符串，而一个汉字通常由三个字节表示，比如 `[228, 189, 160]` 经过编码后就是汉字`你`。

4. `ReadableStream`，一种数据源，所传输的数据（Chunk）不是一次性给你的，而是随着时间推移，一段一段流出来的。

# response.json() 到底做了啥？

你可能会对上述提到的数据格式和类型感到陌生，但其实你已经“遇到过”它们很多次了，不妨看看下面这段你最熟悉不过的代码：

```javascript
const response = await fetch('/api/data');
const data = await response.json();
```

我们平常写的 `data = await response.json();` 其实就是在自动帮我们完成了从在网络中所传输的最原始的二进制数据（即 ArrayBuffer）到真实数据的解析。当你从一个 `Response` 类型的变量上调用 `.json()` 方法时（可查阅 [MDN 文档](https://developer.mozilla.org/en-US/docs/Web/API/Response/json)），浏览器实际上执行了以下这套**阻塞式**流程：

1. 锁定传送带（Lock Stream）： 浏览器接管了 `response.body` 这个传送带（`response.body` 是一个只读属性，就是为了用来暴露响应体内容的 `ReadableStream`，[MDN 文档](https://developer.mozilla.org/zh-CN/docs/Web/API/Response/body)）。

2. 死等到底（Buffering）： 它会开启一个循环，把传送带上运过来的每一个 `Uint8Array` 盒子都拿下来，先不给你看，而是堆在内存的一个大仓库里。

3. 拼接（Concatenation）： 直到服务端发送完毕（发送了结束信号 EOF），浏览器确认所有数据都到齐了，才把仓库里那堆零散的二进制数据拼成一个完整的巨型数据块。

4. 解码与解析（Decode & Parse）：
    - 先用 `TextDecoder` 把巨大的二进制块解码成字符串（String）。
    - 再调用 `JSON.parse()` 把字符串变成 JS 对象。

5. 交付（Return）： 最后才把这个干净漂亮的 Object 交到你手里。


如果要去手写 `json()` 方法，可以参考如下实现：

```typescript
/**
 * 模拟 response.json() 的底层实现
 */
async function myResponseJson<T = any>(response: Response): Promise<T> {
    // 1. 拿到传送带 (ReadableStream)
    // 如果没有 body，说明是空响应
    if (!response.body) {
        throw new Error('Response body is null');
    }

    // 2. 锁定传送带，准备开始接收 (Reader)
    // getReader() 会返回一个 ReadableStreamDefaultReader<Uint8Array>
    const reader = response.body.getReader();

    // 3. 请一位翻译官 (TextDecoder)
    // 它的工作是把 Uint8Array (二进制) 翻译成 string (字符串)
    const decoder = new TextDecoder('utf-8');

    // 4. 准备一个大仓库 (Buffer String)
    // 我们要在这里把所有的碎片拼起来
    let fullText = '';

    // 5. 死循环：只要传送带还在转，就一直拿
    while (true) {
        // await reader.read() 是一个异步操作，等待传送带运过来下一个盒子
        // done: 是否传输结束
        // value: 这一段具体的二进制数据 (Uint8Array)
        const { done, value } = await reader.read();

        // 如果 done 为 true，说明服务端发完了（传送带停了）
        if (done) {
            break;
        }

        // 6. 翻译并拼接 (Decode & Accumulate)
        // value 就是那个“密封的集装箱” (Uint8Array)
        // { stream: true } 是告诉翻译官：“话还没说完，如果最后一个字只有一半，先别报错，缓存着等下一段”
        const chunkText = decoder.decode(value, { stream: true });

        // 把这一小段拼接到大仓库里
        fullText += chunkText;
    }

    // 7. 做最后的清扫
    // 告诉翻译官全部结束了，如果有剩下的残余字节，尝试解码（通常这时候应该是空的）
    fullText += decoder.decode();

    // 8. 最终解析 (Parse)
    // 此时 fullText 应该是一个完整的 JSON 字符串，例如 '{"name": "Gemini"}'
    return JSON.parse(fullText);
}
```

# fetch + ReadableStream 实现 SSE

话说回来，为什么要介绍这些底层细节呢？这是因为传统的 SSE 连接（即 `const eventSource = new EventSource('/api/sse');` 会面临**诸多问题**，包括：

1. 只支持 GET 请求（AI 对话通常需要 POST，因为要携带发送给 AI 的数据）。
2. 无法自定义请求头（Header），导致难以发送 Bearer Token 进行鉴权。
3. 遇到网络错误时的重连机制有时过于自动，难以精细控制。

所以目前更主流的，可以实现 SSE 同种流式传输数据效果的方案，是配合 `fetch` 和 `ReadableStream` 来实现。

1. 使用 fetch 发起 POST 请求。

2. 获取 response.body.getReader()。

3. 通过循环读取流数据，利用 TextDecoder 解码。

这种方式虽然底层逻辑依然是 Server-Sent Events 的思想，但在代码层面提供了极大的灵活性。目前已经有了 `microsoft/fetch-event-source` 这个库来实现 `fetch` + `ReadableStream` 这套方案，提供了简洁的 API，可以参考学习。

# 技术亮点

## 1. 极致的解析性能（Zero-Copy Parsing）

回顾我们分析的 `parse.ts`，其中的亮点在于**内存管理**：

- **`subarray` 而非 `slice**`：在处理 buffer 时，大量使用了 `subarray`（创建视图，不复制内存），这在处理长文本流（DeepSeek R1 输出可能几万字）时，能显著减少 Garbage Collection (GC) 的压力，防止页面卡顿。
- **双层循环状态机**：用极低的 CPU 消耗解决了 TCP 粘包和断包问题，这是属于底层编程的浪漫。

## 2. 精确的控制流：AbortController

- **亮点**：用户点击“停止生成”或切换页面时，必须**立即**切断连接。
- **价值**：AI 的推理成本很高（按 Token 算钱）。如果前端只是 UI 上不显示了，但底层连接还在收数据，那就是在烧钱。使用 `AbortController` 能够真正从网络层级掐断请求，帮公司省钱。

## 3. 乐观 UI 与光标模拟（Typewriter Effect）

- **亮点**：为了让 AI 看起来更有“人味”或“科技感”，前端通常不会收到一个字就显示一个字，而是维护两个队列：
- **接收队列**：网络收到的原始数据。
- **渲染队列**：以平滑的速度（比如每 16ms 吐一个字）显示在屏幕上。

- **效果**：即使网络卡顿（一下来一坨，一下不动），用户的视觉体验依然是丝般顺滑的打字机效果，末尾通常还会带一个闪烁的光标（Blinking Cursor）。

```typescript
// 1. 接收队列（蓄水池）
const bufferQueue = [];

// SSE 回调
onMessage(chunk) => {
    // 把新收到的字符打散，推入队列
    bufferQueue.push(...chunk.split(''));
}

// 2. 渲染循环（水龙头）
// 使用 requestAnimationFrame 保证动画流畅
function renderLoop() {
    if (bufferQueue.length > 0) {
        // 每次取出一个或几个字符
        // 动态调整速度：如果水池积压太多（网速太快），就一次多吐几个字，防止延迟过高
        const speed = bufferQueue.length > 50 ? 5 : 1;
        const nextChars = bufferQueue.splice(0, speed);

        // 更新 React State，触发 UI 渲染
        setDisplayContent(prev => prev + nextChars.join(''));
    }
    requestAnimationFrame(renderLoop);
}
```

## 4. 鲁棒的重连机制（Last-Event-ID）

- **亮点**：虽然我们刚才讨论极简版时去掉了 Page Visibility，但在复杂的 Agent 系统中，支持 `Last-Event-ID` 是一个巨大的亮点。
- **场景**：用户在手机上用 4G 聊到一半进电梯断网了。出电梯连上 WiFi 后，前端自动重连，并带上 `Last-Event-ID`，后端无缝补传刚才断掉的那几句话，而不是从头开始重来。这是非常高级的体验保障。
