### 一：没引入 React Query 前
前端单独创建了一个 Services 层来调度 API 接口后全局状态管理 Store，将 API 返回的数据存入到 Store 中（比如 Conversation Service 调用 API 创建对话后将数据当做全局状态存入 Conversation Store中），然后让 UI 根据 Store 中的状态进行渲染。



<font style="color:#DF2A3F;">缺点：</font>

1. 需要大量样板代码来连通 API 层和 Store 层，造成代码冗余的情况下影响了后续的开发和错误排查，同时抽象出来的 Services 层也带来了额外的心智负担。
2. 没有区分“服务器状态”和“客户端状态”，服务器数据（比如用户信息，Conversations 列表）和本地 UI 状态（比如表单输入）全部由全局状态 Store 管理，造成了状态的混乱与管理不便。
3. 服务器获取的数据没有做到良好的更新、缓存等管理操作，容易造成前端 UI 状态的滞后或发送大量重复请求加大服务器负担



### 二：引入 React Query 重构后：
清楚用法不介绍了这里具体使用去看官网：[https://tanstack.com/query/latest/docs/framework/react/overview](https://tanstack.com/query/latest/docs/framework/react/overview)



<font style="color:#DF2A3F;">优点：</font>

1. 可以删除大量 Service 层的冗余代码，简化了整个项目的架构，避免了不必要的抽象。
2. 有效区分了“服务器状态”和“客户端状态”，前者由 React Query 管理，后者由 Zustand 管理，使得客户端的本地状态更加“纯粹”。
3. 提供了开箱即用的高级功能来管理 Query 到的服务端数据：自动缓存，重试机制，自动请求，乐观更新......



<font style="color:#DF2A3F;">这个对话平台项目中，使用 React Query 重构时有遇到一些棘手的问题吗？</font>

主要就是如何正确协调 React Query 和 Zustand 去管理 SSE 返回的流式数据：流式数据的处理不太符合常规数据的处理模型，对于常规数据，通常就是直接 useQuery 查询后将数据存到全局提供出来的 QueryClient 的缓存中，然后 UI 在缓存中得到数据并渲染，<u><font style="color:#000000;">流式数据不太符合这样的处理模型，该如何去协调呢？</font></u>

<font style="color:#DF2A3F;">  
</font><font style="color:#DF2A3F;">方案：</font>

1. <font style="color:#000000;">当用户发送消息时，通过</font><font style="color:#DF2A3F;">乐观更新</font><font style="color:#000000;">，我们将用户的消息立即保存在 Query 缓存中（此时本地缓存与后端数据库中的 Messages 数组时同步的，都新增了用户这条消息），在保存用户消息的同时我们还在缓存中保存一条用来占位的 AI 消息，等待后续得到了完整 AI 回复消息后再来替换（根据每条消息的 id 来查找）</font>

<font style="color:#000000;"></font>

2. <font style="color:#000000;">然后前端建立 SSE 连接，在 message 事件中将 chunk 实时累积在本地 State 中，不触碰 Query 缓存（其实这里是对“正在流式回复的 AI 消息”和“流式回复完成后完整的 AI 消息”两个概念作了区分，</font><font style="color:#DF2A3F;">前者应该是一个本地的 State，而后者才是一个需要 Query 管理的服务端数据</font><font style="color:#000000;">）。</font>

<font style="color:#000000;"></font>

3. <font style="color:#000000;">然后关闭 SSE 连接，将完整的 AI 消息保存在 Query 缓存中，后端在流式输出后也将完整的 AI 消息存入数据库，这样第二次实现了后端数据与本地缓存的同步。</font>



<font style="color:#000000;">按照如上方法，我们正确使用 React Query 和 Zustand 管理了用户与 AI 发送消息这一场景中流式数据的处理。</font>

#### <font style="color:#000000;">1. 获取历史消息（Query）</font>
```tsx
// 获取历史消息列表
const { data: messages = [], isLoading } = useQuery({
  queryKey: ['messages', conversationId], // conversationId为会话唯一标识
  queryFn: async () => {
    const res = await fetch(`/api/messages?conversationId=${conversationId}`);
    return res.json();
  },
  staleTime: 60 * 1000,
});
```

---

#### <font style="color:#000000;">2. 发送用户消息并乐观更新（Mutation + Optimistic Update）</font>
```tsx
const queryClient = useQueryClient();

const sendMessageMutation = useMutation({
  mutationFn: async (msg: Message) => {
    const res = await fetch('/api/messages', {
      method: 'POST',
      body: JSON.stringify(msg),
      headers: { 'Content-Type': 'application/json' },
    });
    return res.json();
  },
  // 乐观更新：立即在缓存中添加用户消息和AI占位消息
  onMutate: async (newMsg) => {
    await queryClient.cancelQueries({ queryKey: ['messages', conversationId] });
    const previous = queryClient.getQueryData(['messages', conversationId]);
    queryClient.setQueryData(['messages', conversationId], (old: Message[] = []) => [
      ...old,
      newMsg,
      { id: newMsg.id + 'ai', role: 'assistant', content: '', isPlaceholder: true },
    ]);
    return { previous }; // 传递上下文
  },
  // 失败时回滚
  onError: (err, newMsg, context) => {
    queryClient.setQueryData(['messages', conversationId], context?.previous);
  },
  // 成功后标记数据过期，重新查询
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
  },
});
```

---

#### <font style="color:#000000;">3. SSE流式消息本地状态管理（不进Query）</font>
```tsx
const [streamingContent, setStreamingContent] = useState('');

// SSE流式过程中只更新本地state
const createSSE = () => {
  if (esRef.current) return;
  setStreamingContent('');
  const es = new EventSource('/api/sse');
  esRef.current = es;
  es.addEventListener('message', (e) => {
    if (e.data === 'done') {
      esRef.current?.close();
      esRef.current = null;
      // SSE结束后，调用replaceAIMessage
      replaceAIMessage(streamingContent);
      setStreamingContent('');
      return;
    }
    setStreamingContent((prev) => prev + e.data);
  });
};
```

---

#### <font style="color:#000000;">4. SSE结束后用完整AI消息替换占位消息（Query缓存更新）</font>
```tsx
const replaceAIMessage = (content: string) => {
  queryClient.setQueryData(['messages', sessionId], (old: Message[] = []) =>
    old.map((msg) =>
      msg.isPlaceholder
        ? { ...msg, content, isPlaceholder: false }
        : msg
    )
  );
};
```

---

#### <font style="color:#000000;">5. 渲染时合并历史消息和流式消息</font>
```tsx
const displayMessages = [
  ...messages.filter((msg) => !msg.isPlaceholder),
  ...(streamingContent
    ? [{ id: 'streaming', role: 'assistant', content: streamingContent, isStreaming: true }]
    : []),
];
```

---

**总结：**

+ <font style="color:#000000;">历史消息用 React Query 管理</font>
+ <font style="color:#000000;">用户消息和AI占位消息用乐观更新</font>
+ <font style="color:#000000;">流式内容只用本地 state</font>
+ <font style="color:#000000;">SSE 结束后用 setQueryData 替换占位消息</font>

<font style="color:#000000;"></font>

### <font style="color:#000000;">React Query 的常规适用场景</font>
React Query 是管理和缓存**服务器状态**的强大工具，但它主要针对的是遵循**请求-响应**模式的异步操作。

1. **适用 React Query 的场景 (请求-响应模式):**
    - `**useQuery**`: 用于获取数据（GET 请求）。比如，获取用户个人信息、获取对话列表、获取某个对话的历史消息。React Query 会自动处理缓存、后台更新、数据是否过时等问题。
    - `**useMutation**`: 用于创建、更新或删除数据（POST, PUT, DELETE 请求）。比如，用户登录、注册、发送新消息、创建新对话。React Query 会帮助你管理加载状态、错误状态，并能在操作成功后智能地更新或废弃相关的 `useQuery` 缓存。
2. **不直接适用 React Query 的场景 (持续连接/推送模式):**
    - **Server-Sent Events (SSE) 和 WebSockets**: 这两种技术都涉及一个从服务器到客户端的持久连接，服务器可以随时主动推送数据。这不符合 React Query "一次请求，一次响应" 的核心模型。
    - 对于这种情况，采用传统方式（比如 SSE）——创建一个 `EventSource` 实例，并监听 `onmessage`, `onerror` 等事件——是完全正确的做法。**所以说，针对传统的 GET（比如切换对话时获取某一对话下的所有消息）操作，我可以仍然采取 **`**useQuery**`**；但是对于 SSE 这种持续推送的场景（比如说实时展示 AI 消息在屏幕上，实现打字机效果），我仍然可以直接调用底层的 EventSource 直接创建连接，而不用再去走一遍 React Query。**

**总结与建议:**

**混合使用是最佳实践**：使用 `useQuery` 和 `useMutation` 来重构大部分的 CRUD (增删改查) 操作，例如用户认证、对话管理等。这会大大简化你的状态管理逻辑，减少样板代码。而保留现有的 `createSSE` 服务来处理实时消息流。

