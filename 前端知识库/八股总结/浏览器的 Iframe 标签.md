# <font style="color:rgb(64, 64, 64);">iframe 是什么？</font>
`<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);"><iframe></font>`<font style="color:rgb(64, 64, 64);">是一个 HTML 元素，它能够在当前文档中嵌入另一个独立的 HTML 文档。你可以把它想象成一个“浏览器中的浏览器”。核心特点：</font>**<font style="color:rgb(64, 64, 64);">隔离，</font>**<font style="color:rgb(64, 64, 64);">拥有独立的 DOM 树，CSS 样式，Storage 和 Cookie。</font>

```html
<iframe src="https://example.com" width="800" title="Example Embed"></iframe>
```

# iframe 的优缺点？
**<font style="color:rgb(60, 60, 67);">缺点</font>**<font style="color:rgb(60, 60, 67);">：</font>

1. **性能开销大**：<font style="color:rgb(64, 64, 64);">每个 iframe 都是一个完整的文档环境，创建和销毁成本很高。</font>
2. **<font style="color:rgb(60, 60, 67);">SEO</font>**<font style="color:rgb(60, 60, 67);">：嵌入 iframe 中的内容通常不会被搜索引擎抓取。</font>
3. **<font style="color:rgb(60, 60, 67);">用户体验</font>**<font style="color:rgb(60, 60, 67);">：iframe 的加载速度慢、嵌入网页的交互性不强，会影响用户体验。页面刷新导致 iframe 内部的状态丢失。</font>
4. **<font style="color:rgb(60, 60, 67);">跨域限制</font>**<font style="color:rgb(60, 60, 67);">：与主页面不同源的 iframe 会受到浏览器的跨域策略限制，难以进行父子页面之间的直接通信。</font>
5. **<font style="color:rgb(60, 60, 67);">安全问题</font>**<font style="color:rgb(60, 60, 67);">：</font><font style="color:rgb(64, 64, 64);">恶意网站可以将你的网站用 iframe 嵌入，并设置 </font>`**<font style="color:rgb(64, 64, 64);background-color:rgb(236, 236, 236);">opacity: 0</font>**`<font style="color:rgb(64, 64, 64);">，诱骗用户在你的网站上执行操作（如点赞、转账）。</font>

**优势：**

1. **<font style="color:rgb(60, 60, 67);">隔离性</font>**<font style="color:rgb(60, 60, 67);">：</font>`<font style="color:rgb(52, 81, 178);background-color:rgba(142, 150, 170, 0.14);">iframe</font>`<font style="color:rgb(60, 60, 67);"> 中的内容与父页面是完全独立的，CSS 样式和 JavaScript 作用域互不影响。</font>
2. **<font style="color:rgb(60, 60, 67);">安全性</font>**<font style="color:rgb(60, 60, 67);">：通过 </font>`<font style="color:rgb(52, 81, 178);background-color:rgba(142, 150, 170, 0.14);">sandbox</font>`<font style="color:rgb(60, 60, 67);"> 属性，可以限制 iframe 中内容的行为（如禁用脚本、阻止表单提交等），增加安全性。</font>
3. **<font style="color:rgb(60, 60, 67);">动态加载</font>**<font style="color:rgb(60, 60, 67);">：可以异步加载内容，提升主页面的加载性能。</font>

# 如何与 iframe 通信？
## 同源 iframe
<font style="color:rgb(64, 64, 64);">如果父页面和 iframe 页面拥有相同的</font>**<font style="color:rgb(64, 64, 64);">协议、域名、端口</font>**<font style="color:rgb(64, 64, 64);">，那么它们可以</font>**<font style="color:rgb(64, 64, 64);">无限制地</font>**<font style="color:rgb(64, 64, 64);">访问彼此的 DOM 和 JavaScript。</font>

```javascript
// 获取 iframe 的 window 对象
const iframeWindow = document.getElementById('myIframe').contentWindow;

// 获取 iframe 的 document 对象 (需要确保 iframe 已加载完成)
const iframeDoc = iframeWindow.document;

// 操作 iframe 内的元素
const innerElement = iframeDoc.getElementById('some-element');

// 获取父页面的 window 对象
const parentWindow = window.parent;

// 访问父页面的 DOM
const parentElement = parentWindow.document.getElementById('parent-element');

// 甚至可以访问更上层的祖先（如果存在多层嵌套）
const topWindow = window.top;
```

## 跨域 iframe
由于浏览器的**跨域限制，**严禁不同源的直接的 DOM 访问，需要借助`PostMessage API`

**发送消息方：**

```javascript
// 语法：targetWindow.postMessage(message, targetOrigin);
const targetWindow = document.getElementById('myIframe').contentWindow;

// 发送消息
targetWindow.postMessage({
  type: 'GREETING',
  payload: 'Hello from parent page!'
}, 'https://example.com'); // 必须指定目标 iframe 的 origin，强烈建议写具体，不要用 '*'
```

**接收消息方：**

```javascript
window.addEventListener('message', function(event) {
  // 重要！一定要验证消息来源的域，防止恶意网站发送消息
  if (event.origin !== 'https://trusted-parent-site.com') {
    // 忽略来自未知源的消息
    return;
  }

  // 安全地处理消息
  console.log('Received message:', event.data); // { type: 'GREETING', payload: 'Hello...' }

  if (event.data.type === 'GREETING') {
    // 回复消息
    event.source.postMessage({
      type: 'REPLY',
      payload: 'Hello back!'
    }, event.origin);
  }
});
```

通过 PostMessage 传递的消息（即回调函数中的入参 event）的类型是`MessageEvent`，它是一个内置类型，结构如下：

```typescript
interface MessageEvent<T = any> {
  readonly data: T // 消息内容
  readonly lastEventId: string // 事件 ID
  readonly origin: string // 消息来源的域
  readonly source: typeof MessagePort | null // 发送消息的 window 对象
}
```

# iframe 的使用场景
## 基于 iframe 的微前端方案：无界
