学习和使用 SSR 的过程中，其重点并不是某一个具体的框架怎么用（比如 Next 框架怎么用，其实和 React 区别不是特别大），而是 SSR 背后所代表的那一套新的开发心智模型以及 SSR 落地带来的问题和风险。也就是说：

SSR 更多是一个工程体系的问题，而不是某一框架的问题。
# CSR 和 SSR 应用差异

SSR 应用落地，首先需要理清楚本地开发 CSR / SSR 应用到底是如何变为实际看到的页面的，这中间也会串联起来很多前端的知识点，可以思考和回忆一下。

## 步骤一：构建时

不管是 CSR 应用还是 SSR 应用，第一步在构建时由 .jsx 或者 .vue 转译为 .js 文件的步骤都是不变的，都经由你的构建工具（Vite，Webpack）去执行，比如下面这个例子：

```jsx
const Button = () => {
	return <button>Hello!</button>
}
```

如上这个最简单的 JSX 组件在转译后会变成以下的纯 JS 函数：

```javascript
const Button = () => {
	React.createElement('button', null, 'Hello');
}
```


这稍微涉及到了一些 React 原理的知识，不过多讲了，核心的不同点发生在第二步。

## 步骤二：运行时

对于 CSR 应用，转译以后的 .js 文件是在浏览器的 **V8** 引擎这么个 JS 运行时中，通过对应的依赖（比如 react-dom/client ）运行 JS 文件，实时修改 DOM 从而构建出完整的 HTML 交给浏览器渲染。

而 SSR 应用中，转译后的 .js 文件是在服务器的 **Node/Deno/Bun** 这些 JS 运行时中。首先会涉及到渲染所需数据的预取（Prefetch），再根据对应的依赖（比如 react-dom/server）运行转译后的 JS 函数，生成最终的完整的 HTML 字符串返回给浏览器，浏览器直接渲染 HTML 。此时仍然要通过 HTML 中的链接下载 JS 文件，这些 JS 文件和 CSR 应用中的 JS 文件作用不同，核心不是操作 DOM，而是为已有的 DOM 添加上事件监听，从而让页面变得可交互，也就是我们常说的“水合”。

# 什么时候需要用上 SSR

在中大型前端系统中，随着业务复杂度提升，SPA 架构逐渐暴露以下问题：

1. 首屏加载时间长(LCP 不达标)
2. SEO 表现差（搜索引擎爬虫无法执行 JS 或抓取延迟）
3. 白屏时间明显（弱网环境）
4. BFF 层数据聚合复杂，客户端渲染链路长

当系统已经具备以下特征时，就需要考虑 SSR了：

- 页面首屏依赖大量异步请求
- 存在 SEO 强诉求，比较依赖搜索引擎(通常是 C 端业务)
- LCP、TTFB 指标长期难以优化
- 页面内容展示型占比高

如果一些 B 端业务，比如说后台管理系统，其实不太需要用上 SSR，会引入不必要的复杂性。

# 企业级 SSR 架构分析

一个企业级的 SSR 架构可以参考这条链路：

`CDN --> 网关层（Nginx） --> Node SSR 集群 --> 后端 API 接口`

我们来具体分析一下。

## 第一层：CDN

CDN 即为内容分发网络，其作用主要是静态资源缓存 (JS/CSS/Images)。SSR 应用构建出来的客户端 JS包 (`client-bundle.js`)、CSS 文件、图片，通常会直接推送到 CDN。用户访问时，这些文件直接从最近的 CDN 节点下载，速度极快，根本不经过核心的服务器。

## 第二层：网关层

网关层起到了反向代理与负载均衡的作用，它是流量进入内网的第一个关卡，在 SSR 架构中的职责如下：

1. 流量分发 (路由映射)：Nginx 负责识别 URL
        
    - `https://site.com/api/*` -> 转发给后端接口服务 (Java/Go/Python)。
        
    - `https://site.com/dashboard` -> 转发给 Node SSR 集群。
        
    - `https://site.com/static/*` -> 甚至可以直接由 Nginx 返回静态文件（如果 CDN 没命中的话）。
        
2. 负载均衡 (Load Balancing)：集群中有 10 台 Node.js 服务器。Nginx 负责把流量均匀地分给这 10 台机器，防止某一台累死。
        
3. 安全屏障：配置 SSL 证书（HTTPS），防御 DDoS 攻击，限制 IP 访问频率。

## 第三层：Node SSR 集群 

作为应用服务层，SSR 应用就跑在这里（比如 Next 应用），通常有多个 Node 进程，负责产出 HTML。其作用如下：

1. 聚合数据：它向后端的 BFF 或 API 发起请求，拿到 JSON 数据，以此来填充组件。

2. 执行渲染逻辑：这是最耗 CPU 的地方。它运行 `react-dom/server` （比如 `renderToString(<App/>)`），执行组件代码，拼接 HTML 字符串。

至于说为什么要集群？首先产出 HTML 字符串本质上就是在做字符串处理，这是一个 CPU 密集型而非 I/O 密集型任务，又因为 Node 是**单线程**的。如果只有一台服务器，一个用户请求卡住了，后面所有其他用户的请求都要排队。**集群**意味着我们启动了多个 Node 进程（通常利用 PM2 或 Kubernetes 管理），充分利用多核 CPU。哪怕一个进程崩了，其他的还能继续工作。

## 第四层：后端接口

作为数据服务层，通常就是后端服务的所在地，即传统意义上的后端，操作数据库，处理业务逻辑，返回数据。
        
## 总链路解析

我们来完整模拟一遍这个架构的数据链路：

1. 用户发起请求：在浏览器输入 `example.com/user/profile`。
        
2. CDN 拦截：
    
    - 请求先打到 CDN。
        
    - CDN 检查：“我有这个 HTML 的缓存吗？” -> **没有**（因为是动态页面，每个人不一样）。
        
    - CDN 放行。
        
3. Nginx 分流：
    
    - 请求到达企业的 Nginx 网关。
        
    - Nginx 识别路径是 `/user/profile`，判断这是个页面请求。
        
    - Nginx 转发给 Node SSR 集群中的某一台空闲机器（比如 Node-Instance-03）。
        
4. Node SSR 执行：
    
    - Node-03 收到请求。
        
    - `/user/profile` 对应的 JSX 组件在构建阶段产出的 JS 文件开始运行。
        
    - 数据获取：代码里写了 `fetch('/api/user/info')`。Node-03 向后端接口层发起 HTTP 请求。
        
5. 后端处理：后端（Java/Go）收到请求，查数据库，拿到了用户信息并返回数据。
        
6. HTML 生成 (Node SSR)：
    
    - Node-03 拿到数据，把它填进 React 组件里。
        
    - 生成完整的 HTML 字符串：`<div><h1>User A</h1>...</div>`。
        
    - 返回给 Nginx。
        
7. 回传用户：
    
    - Nginx -> CDN -> 用户浏览器。
        
    - 用户看到了完整的网页。
        
8. 水合 (Hydration) ：
    
    - 浏览器解析 HTML，发现需要一个 `client.js`。
        
    - 浏览器再次请求 CDN。
        
    - CDN 这次命中缓存，直接返回 `client.js`（静态资源）。
        
    - 添加事件监听，页面可以交互了。
        

## 这个架构的好处

1. 各司其职： Nginx 扛流量，Node 搞渲染，Java/Go 搞数据。没人干自己不擅长的事。
    
2. 容灾降级： 如果 Node SSR 集群全挂了，Nginx 可以配置一个“降级策略”，直接返回一个纯静态的 `index.html`（SPA 模式），让用户在浏览器端渲染，虽然慢点，但至少网站没挂。
    
3. 安全性： 后端数据库永远躲在内网深处，外网用户只能接触到 CDN 和 Nginx，攻击者很难直接打穿。


# 有关 SSR 的常见问题


## 1. SSR 如何避免内存泄漏?

核心矛盾：浏览器的页面刷新会重置内存，但 Node.js 服务器进程是常驻的。

在 CSR 中，你写个全局变量 `window.data = []`，用户关掉标签页就释放了。但在 SSR 中，如果在组件外定义了全局变量，或者在组件内订阅了事件却没注销，这部分内存就会随着请求数量的增加只增不减，直到服务器 OOM (Out of Memory) 崩溃。

如何避免（心智转换）：

- 不要使用单例模式（Singletons）存储请求级数据： 永远不要在 module scope（组件外部）定义 `const cache = {}` 来存用户数据。每个请求的数据必须隔离。
    
- 生命周期清理： 在 `useEffect` 中订阅事件（如 `addEventListener`），**必须**返回一个 cleanup 函数来 `removeEventListener`。虽然 `useEffect` 只在客户端跑，但在某些复杂的 SSR 钩子或自定义 Server Hook 中，忘记清理定时器（`setInterval`）是头号杀手。
    
- WeakMap/WeakRef： 如果必须在服务端做缓存，使用 `WeakMap` 或者带 TTL（过期时间）的缓存库（如 `lru-cache`），确保对象能被 GC 回收。
    

## 2. 为什么 Hydration Mismatch 会发生?

核心矛盾：时间与环境的不一致。

Hydration（注水）的过程，本质上是 React 在客户端拿着服务端传来的 HTML，试图重新生成一遍 Virtual DOM，然后把事件监听器“挂”上去。如果 React 在客户端算出来的结构（VDOM）和服务器发来的 HTML 不一样，它就无法处理，这就是 Mismatch。

常见原因：

1. 非确定性输出： 代码里用了 `Date.now()`、`Math.random()` 或者 `new Date()`。服务器渲染时是 8:00，客户端渲染时是 8:01，文本内容不一致。
    
2. 非法的 HTML 嵌套： 比如 `<p>` 标签里套了 `<div>`。浏览器解析 HTML 时会自动“纠错”（把 `div` 踢出 `p`），但 React 的 VDOM 依然认为它们是嵌套的。结构对不上了。
    
3. 环境差异： 在渲染逻辑中直接判断 `if (typeof window !== 'undefined')` 来渲染不同内容。服务器渲染了 A，客户端一看我有 window，渲染了 B。内容不匹配。

## 3. SSR 如何做缓存分层?

核心矛盾：动态性和性能的取舍。SSR 把计算压力集中到了服务器，如果不做缓存，QPS 一高服务器必挂。

SSR 的缓存不仅仅是“加个 Redis”，而是一个漏斗状的分层体系：

1. CDN / Edge Cache (最外层)：针对纯静态页面或公共页面（Public Cache）。直接在边缘节点返回 HTML，根本不打到你的源服务器。
    
2. HTTP Cache (浏览器层)：利用 `Cache-Control` header，让浏览器自己缓存，连请求都不发。
    
3. Full Page Cache (页面级)：Next.js 的 ISR (Incremental Static Regeneration) 就属此类。服务器生成一次 HTML 存起来，后续请求直接读文件/内存中的 HTML 字符串。
    
4. Data Cache (数据级)：主要发生在 RSC 中。针对 `fetch` 请求做缓存（React `cache()` 或 Next.js `unstable_cache`）。比如多个组件都请求“用户信息”，在同一次渲染周期内只请求一次数据库。

## 4. React 18 Streaming 如何提升性能?

核心矛盾：TTFB (Time To First Byte) 也就是首字节时间太慢。

在 React 18 之前（传统的 SSR），流程是瀑布式的：

1. Server: 预取所有数据 -> 渲染完整 HTML -> 发送给浏览器。
    
2. Client: 接收 HTML -> 加载 JS -> Hydrate。
    

只要有一个接口慢（比如底部的评论列表），整个页面都出不来，用户看到的是白屏。

Streaming (流式渲染) 的改变：它可以把页面拆成多个块（Chunks）。

1. 核心结构（Header, Sidebar）不需要数据，先渲染，立即通过 HTTP Stream 发给浏览器。用户瞬间看到框架。
    
2. 慢的部分（评论列表）用 `<Suspense>` 包裹。服务器在后台慢慢请求数据，等数据好了，再生成这部分的 HTML，通过同一个 HTTP 连接“推”给浏览器，并附带一段内联 JS 把它插入到正确位置。

核心思路就是，从原来一口气取所有数据生成完整 HTML 字符串，到 Streaming 后渐进式生成 HTML 字符串，从而让那些不需要数据的组件先渲染，优化白屏体验。

## 5. 为什么 SSR 会放大 CPU 压力?

核心矛盾：渲染计算的转移（分布式 -> 中心化）。

CSR（分布式）：1 万个用户访问，渲染页面的 CPU 消耗分布在 1 万台用户的手机/电脑上。你的服务器只负责发 JSON，这对于服务器来说是轻量级操作。
    
SSR（中心化）：1 万个用户访问，这 1 万次 `React.renderToString()` 的计算全部跑在你的单线程 Node 进程上。
    

为什么是 CPU 密集型？

React 的渲染过程是同步的 CPU 计算（遍历树、比对、生成字符串）。一旦 QPS 上来，Node 的事件循环（Event Loop）就会被渲染任务塞满，导致无法处理新的请求（比如简单的健康检查接口都回不来）。这也是为什么 SSR 应用必须要有极其强悍的扩缩容策略（比如用上了 Node 集群）和缓存策略。

## 6. SSR 与 RSC 有何区别?

总的来说，SSR 是一种渲染行为，而 RSC 是一种组件类型。通过 RSC 这种技术优化了传统 SSR 中前端仍需要下载体积较大的 JS 文件的痛点。

SSR:

- 目标： 首屏加速 (SEO)。
	
- 本质： 还是原来的 React 组件，只是在服务器上先跑一遍生成 HTML。到了客户端，所有的组件代码（JS Bundle）还是要下载、执行、水合。组件是“同构”的。
        
RSC:

- 目标： 减少发送给客户端的 JS 体积。
	
- 本质： 这些组件**只**在服务器运行。它们的依赖（比如庞大的 markdown 解析库）永远不会被打包发送到浏览器。
	
- 输出： 它们传递的是一种特殊的序列化格式（RSC payload），而**绝不包含**组件本身的 JS 逻辑代码。
	
- 互斥： RSC 不能使用 `useState`, `useEffect` (因为没有客户端生命周期)。


举个实际的业务场景例子。假设有一个博客文章页面，需要引入一个很大的 markdown 解析库（比如 `marked`，假设它有 50KB）。

如果是传统 SSR (其实就是一个 Client Component 在服务端渲染)：

1. 服务端： 运行 `marked(text)`，生成 HTML `<h1>Hello</h1>`。
    
2. 传输： 浏览器收到了 HTML。但是浏览器同时也收到了 `bundle.js`，里面包含了那 50KB 的 `marked` 库代码。

3. 客户端（Hydration）： 浏览器加载 JS，React 在浏览器里又运行了一遍 `marked(text)`，确保和服务端生成的 HTML 一致。
    
痛点： 用户为了看个静态文章，被迫下载了 50KB 的解析库代码。这里就算这个组件是没有任何交互的（即不需要 JS 代码来绑定事件），客户端仍需要下载 JS Bundle，目的是为了让 React 接管整个页面，管理整个页面其他可能存在的状态管理，路由跳转等等。并且，浏览器也不知道如何处理 “# Hello” 这样的数据，还是需要 JS 库来解析。
        

如果是 RSC (React Server Components)：

1. 服务端： 运行 `marked(text)`，生成由 React 内部格式描述的 UI 结构 -- RSC Payload。
    
2. 传输： 浏览器收到了 UI 结构。重点来了，浏览器没有收到 `marked` 库的代码。那 50KB 永远留在了服务器上。
    
3. 客户端： React 在浏览器中只需要把这个 UI 结构渲染出来。它根本不知道 `marked` 库的存在。所以说 RSC 本质上还是需要 React 官方支持渲染这种“ UI 的描述”，即一种跨网络传输的序列化 Virtual DOM 格式。只是 Next 是第一个将其封装为可用框架的框架。
    
优势： 显著地优化了前端 JS 文件的体积。

```jsx
// 一个 Next 应用中组件默认为 RSC
// 运行在服务器，负责获取数据，连接数据库
import db from './db'; 
import ClientButton from './ClientButton'; // 引入一个交互组件

export default async function Page() {
  const data = await db.query('SELECT * FROM posts'); // 直接写 SQL，不暴露给前端

  return (
    <div>
      <h1>博客列表</h1>
      {/* 这里的 data 是静态内容，RSC 处理，不发送 JS */}
      <ul>
        {data.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>

      {/* 这里需要交互，嵌入一个 Client Component */}
      {/* 只有这个组件的代码会被打包发送给浏览器 */}
      <ClientButton />
    </div>
  );
}
```

一个 Server Component 中嵌套 Client Component 的 Payload 可能会是这样的：

```json
{
  "type": "div",
  "props": {
    "className": "blog-post",
    "children": [
      { "type": "h1", "props": { "children": "Hello" } },
      { 
        "type": "module_reference", 
        "reference": "chunks/LikeButton.js", // 这是一个占位符！是 Client Component 所需要的 JS 文件
        "props": { "id": "123" } 
      }
    ]
  }
}ÏÏÏÏ
```

然而一个 RSC 在服务端的渲染工作可能会非常耗时（比如需要在数据库中查询大量数据），这时候我们可以充分利用前面提到过的 Streaming 做优化：

```jsx
// page.js
import { Suspense } from 'react';
import Sidebar from './Sidebar';
import MainContent from './MainContent'; // 这是一个耗时的 RSC

export default function Page() {
  return (
    <div>
      <Sidebar /> {/* 静态，瞬间完成 */}
      
      <Suspense fallback={<p>Loading...</p>}>
        <MainContent /> {/* 耗时 2秒 */}
      </Suspense>
    </div>
  );
}
```

上面展示的这个 RSC 组件是如何工作的？

1. RSC 的工作： 服务器开始渲染 `Page`。遇到 `Sidebar`，直接生成。遇到 `MainContent`，发现它需要查数据库，于是服务器开始等待数据库返回。
    
2. Streaming 的工作： 此时服务器不会傻等。它立刻把已经生成好的 `Sidebar` 的 HTML 和一个 `<p>Loading...</p>` 的占位符，通过 HTTP 流式传输发给浏览器。用户视角中，几乎立刻看到了侧边栏和 Loading 字样。
        
3. RSC 的后续工作： 几秒后，数据库返回数据。`MainContent` (RSC) 使用数据生成了最终的 UI 片段。注意，这里没有包含 `MainContent` 的组件 JS 代码，只有我们之前讲到过的 RSC Payload。
    
4. Streaming 的后续工作： 服务器把这块新生成的 UI 片段，追加到 HTTP 流中发给浏览器。
    
5. 浏览器合并： React 在浏览器端接收到新片段，把 `<p>Loading...</p>` 替换成真正的 `MainContent` 内容。