## 一、当前系统

    前端通过 REST 发送消息
            ↓
    后端进行权限校验、内容审核和业务校验
            ↓
    消息写入 chat_messages
            ↓
    LocalChatProvider 在本地确认发送
            ↓
    数据库事务提交
            ↓
    Redis Pub/Sub 广播 message_created 事件
            ↓
    后端 WebSocket Handler 转发给前端
            ↓
    前端再通过 REST 增量拉取完整消息

最重要的分工是：

    业务数据库：消息事实源
    Local Provider：当前本地发送抽象
    Redis Pub/Sub：跨后端实例的实时事件广播
    WebSocket：后端到前端的实时通知通道
    REST 查询：获取完整消息、权限过滤和最终补偿
    轮询：WebSocket 或 Redis 不可用时的降级机制

WebSocket 在当前实现中并不负责发送聊天消息，它主要被当作服务端到客户端的实时通知管道使用。

## 二、系统参与方和职责

| 参与方 | 主要职责 | 不负责什么 |
| --- | --- | --- |
| ToC 前端 | 展示会话、发送 REST 请求、建立 WebSocket、增量拉取消息、维护 optimistic UI | 不直接操作数据库或 Redis |
| ToC 后端 API | 鉴权、会话访问控制、消息校验、审核、落库、发布实时事件 | 不把客户端上报结果直接当成事实 |
| Local Chat Provider | 在 Provider 抽象中表示本地发送成功 | 不调用第三方 IM 网络接口 |
| 业务数据库 | 保存会话、成员、消息、未读游标和审核状态 | 不负责主动通知客户端 |
| Redis Pub/Sub | 在多个后端实例之间广播“消息已创建”事件 | 不保存完整消息，也不是可靠消息队列 |
| WebSocket Handler | 订阅 Redis channel，并把事件推送给当前连接的前端 | 不负责消息持久化 |
| 内容审核服务 | 对文本、图片进行同步或异步审核 | 不等于 Tencent IM |
| Tencent IM Provider | 备用的外部 IM Provider | 当前 Local 生产链路默认不调用它 |

图片上传使用的是平台对象存储链路；内容审核也可能配置为 Tencent Cloud Content Security。这些能力和 Tencent IM 是不同的外部依赖，不能混为一谈。

## 三、核心数据模型

### 1. chat_conversations：会话

模型位置：[table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/models/table_chat.py:22)

    id
    conversation_type        table_group / tablemate_dm
    event_id                 所属活动
    table_id                 所属桌次，群聊使用
    dm_user_a_id             私聊用户 A
    dm_user_b_id             私聊用户 B
    provider                 local / tencent_im
    provider_conversation_id 外部 Provider 的会话 ID，Local 通常为空
    title                    会话标题
    status                   active 等
    metadata_json            会话扩展信息
    last_message_id          最后一条消息 ID
    last_message_at          最后一条消息时间
    created_at
    updated_at

同桌群聊以 table_id 建立唯一关系，一个桌次对应一个 ChatConversation。

Local 模式下，新会话通常类似：

    id = 501
    conversation_type = "table_group"
    event_id = 100
    table_id = 7
    provider = "local"
    provider_conversation_id = NULL
    title = "周六晚餐 · 7号桌"

### 2. chat_participants：会话成员和权限状态

模型位置：[table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/models/table_chat.py:70)

    id
    conversation_id
    user_id
    registration_id
    state                    active / removed / exited
    display_slot_number      桌上位置
    anonymous_identity_key   匿名身份
    anonymous_display_name   匿名昵称
    hidden_at                会话是否对该用户隐藏
    last_read_message_id     该用户读到哪条消息
    muted_until              用户自己的通知静音
    ops_muted_until          Admin 禁言截止时间
    ops_removed_at           Admin 移除时间
    ops_removed_reason

在 Local 架构中，业务权限主要以这张表为准，不依赖第三方 IM 的成员状态。

### 3. chat_messages：消息

模型位置：[table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/models/table_chat.py:140)

    id
    conversation_id
    sender_user_id
    client_message_id       前端生成，用于幂等
    message_type            text / image / event_card / system_notice
    content
    image_url

    identity_phase          anonymous / public / system
    sender_display_name     发送时的身份快照
    sender_avatar_url
    sender_slot_number

    moderation_status       visible / pending / hidden / blocked
    risk_level
    hidden_by_ops
    delivery_status         sent / pending / failed
    reviewed_at
    moderation_provider
    moderation_reason
    moderation_raw_result

    provider_message_id     为备用 Provider 保留，Local 通常为空
    provider_message_seq
    provider_random
    metadata_json
    created_at
    updated_at

关系是：

    chat_conversations 1 ─────── N chat_participants
    chat_conversations 1 ─────── N chat_messages

chat_messages.conversation_id 是外键，指向 chat_conversations.id。

### 4. 其他重要数据

    chat_moderation_cases   风险消息、用户举报和审核案件
    内容审核表              文本/图片审核任务及异步状态
    metadata_json            活动卡片、系统通知、Provider 结果等扩展数据

## 四、用户进入同桌群聊

前端进入活动群聊时请求：

    GET /chat/events/{event_id}/table-group

路由位置：[table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/api/v1/table_chat.py:193)

后端大致执行：

    1. 根据 event_id + 当前用户查找报名记录
    2. 检查报名是否已支付
    3. 检查活动是否开启群聊
    4. 检查用户是否已经分桌
    5. 检查当前时间是否已经达到群聊开放时间
    6. 按 table_id 查找或创建 ChatConversation
    7. 同步 ChatParticipant
    8. 必要时创建“群聊已开启”系统消息
    9. 返回会话信息、成员和最近消息

会话创建逻辑在 [lifecycle.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/lifecycle.py:183)。

新会话的 Provider 由 _default_chat_provider_name() 决定：

    if settings.CHAT_PROVIDER == "tencent_im" and self._tencent_im_enabled():
        return "tencent_im"
    return "local"

因此生产环境使用 CHAT_PROVIDER=local 时，新会话直接以 Local Provider 创建。

## 五、发送一条文本消息的完整链路

假设用户 101 在会话 501 中发送“大家好”。

### 1. 前端生成客户端消息 ID

前端先生成 client_message_id，并立即展示一条临时消息：

    const tempId = "local-" + Date.now() + "-" + random

    this.messages.push({
      id: tempId,
      conversation_id: this.conversationId,
      content,
      local_status: "sending",
      local_client_id: tempId
    })

然后请求：

    POST /chat/conversations/501/messages

请求体：

    {
      "client_message_id": "local-1720000000-abc123",
      "message_type": "text",
      "content": "大家好"
    }

前端代码见 [table-chat.vue](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-toc-frontend/src/subPackages/chat/table-chat/table-chat.vue:1429)，请求封装见 [tableChatAPI.js](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-toc-frontend/src/utils/tableChatAPI.js:91)。

### 2. 后端校验成员和发送权限

API 路由调用：

    table_chat_service.command_use_cases.send_message(
        db,
        conversation_id=conversation_id,
        current_user=current_user,
        client_message_id=payload.client_message_id,
        message_type=payload.message_type,
        content=payload.content,
        image_url=payload.image_url,
        event_id=payload.event_id,
    )

代码见 [table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/api/v1/table_chat.py:382)。

第一层是查找成员：

    participant = (
        db.query(ChatParticipant)
        .filter(
            ChatParticipant.conversation_id == conversation_id,
            ChatParticipant.user_id == current_user.id,
        )
        .first()
    )

查不到成员就返回 403。

第二层检查成员状态：

    removed   -> 禁止发送
    exited    -> 禁止发送
    ops_muted_until 未过期 -> 禁止发送
    hidden_at 非空 -> 禁止发送

这里需要区分：

    muted_until     用户自己关闭通知，不等于禁言
    ops_muted_until Admin 禁言，会阻止发送

权限逻辑见 [access_policy.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/access_policy.py:95) 和 [visibility.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/visibility.py:115)。

### 3. 检查会话和消息类型开关

后端还检查活动配置：

    table_group -> group_chat_enabled
    tablemate_dm -> dm_enabled
    image       -> image_enabled
    event_card  -> event_card_enabled

如果是群聊匿名阶段，还需要检查用户是否已经选择匿名身份；如果到了实名揭示阶段，还要检查是否已经确认解锁。

### 4. 内容审核

文本消息调用文本审核：

    content_moderation_service.check_text(...)

图片消息调用图片审核任务提交：

    content_moderation_service.submit_media(...)

审核结果可能有几种情况：

    allow / visible  -> 正常进入聊天
    pending           -> 消息可先落库，但状态是待审核
    block             -> 拒绝发送，通常不创建正常可见消息

所以不能简单理解成“审核通过才写入”。异步审核场景下，chat_messages 可以先保存 pending 状态，前端之后查询审核状态。

### 5. 创建 ChatMessage

后端生成消息对象：

    message = ChatMessage(
        conversation_id=conversation.id,
        sender_user_id=current_user.id,
        client_message_id=client_message_id,
        message_type=message_type,
        content=(content or "").strip(),
        identity_phase=phase,
        sender_display_name=...,
        sender_avatar_url=...,
        sender_slot_number=participant.display_slot_number,
        moderation_status=risk.moderation_status,
        risk_level=risk.level,
        delivery_status=risk.delivery_status,
        metadata_json=metadata,
    )

代码见 [commands.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/commands.py:211)。

sender_display_name 和 sender_avatar_url 是发送时快照；但返回给用户时，后端还会根据匿名/实名阶段重新做身份投影。

### 6. Local Provider 本地确认发送

Provider 选择逻辑是：

    def _chat_provider_for(self, conversation):
        if (
            conversation.provider == "tencent_im"
            and settings.CHAT_PROVIDER == "tencent_im"
            and self._tencent_im_enabled()
        ):
            return self.tencent_provider
        return self.local_provider

代码见 [providers.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/providers.py:204)。

Local Provider 的实现：

    class LocalChatProvider(ChatProvider):
        name = "local"

        def send_message(...):
            return {
                "provider": "local",
                "status": "sent",
            }

代码见 [providers.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/providers.py:83)。

它不会：

    初始化 Tencent SDK
    调用外部 IM API
    创建第三方群组
    发送第三方消息

Local Provider 的结果会写进 metadata_json.local_send_result，但真正的消息事实仍然是 chat_messages 记录。

### 7. 更新会话和未读状态

消息创建后，后端会更新：

    conversation.last_message_id = message.id
    conversation.last_message_at = message.created_at
    participant.last_read_message_id = message.id

其中：

    last_message_id / last_message_at
        用于会话列表排序和最近消息展示

    last_read_message_id
        用于计算其他消息是否属于未读

然后提交事务：

    db.commit()

这一步完成后，消息才成为正式的 Local IM 数据。

## 六、消息类型

客户端请求允许的消息类型定义在 [table_chat.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/schemas/table_chat.py:139)：

    text
    image
    event_card

后端内部还会创建：

    system_notice

| message_type | 主要字段 | 扩展数据 |
| --- | --- | --- |
| text | content | 审核结果等 |
| image | image_url | 审核结果等 |
| event_card | content、image_url | metadata_json.event_card |
| system_notice | content | metadata_json.system_notice |

图片的完整链路是：

    POST /chat/uploads/image
        ↓
    对象存储上传
        ↓
    返回 image_url
        ↓
    POST /chat/conversations/{id}/messages

活动卡片则由后端根据 event_id 生成结构化数据，保存到 metadata_json。

## 七、数据库提交后的实时链路

### 1. 发布 Redis 事件

消息事务提交后，后端发布：

    _table_chat_realtime_hub().publish_message_created(
        conversation_id=conversation.id,
        message_id=message.id,
        sender_user_id=current_user.id,
        created_at=message.created_at,
    )

代码见 [commands.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/app/services/table_chat/commands.py:361)。

事件内容类似：

    {
      "type": "message_created",
      "conversation_id": 501,
      "message_id": 9001,
      "sender_user_id": 101,
      "created_at": "2026-08-14T10:00:00Z"
    }

Redis channel：

    toc:table_chat:conversation:501

Redis 只发布“有变化”的通知，不发布完整消息内容。

### 2. WebSocket Handler 订阅 channel

前端建立：

    WebSocket /chat/conversations/501/stream

后端通过 Token 校验用户能否实时访问这个会话，然后：

    await websocket.accept()
    await pubsub.subscribe(
        "toc:table_chat:conversation:501"
    )

当 Redis 收到事件时，后端调用：

    await websocket.send_text(str(message["data"]))

WebSocket 是 Redis 和前端之间的桥，不是前端到 Redis 的直连。

### 3. 前端收到通知后重新拉取

前端收到：

    {
      "type": "message_created",
      "message_id": 9001
    }

不会直接使用这个事件作为完整消息，而是请求：

    GET /chat/conversations/501/messages?after_id=9000

服务端重新执行：

    权限检查
    消息可见性过滤
    审核状态过滤
    匿名/实名身份投影
    消息序列化

这样做的原因是，同一条消息对不同用户可能有不同可见性和身份展示结果。

### 4. 前端合并正式消息

前端会用 message.id 和 client_message_id 去重，把服务端消息替换发送时的 optimistic message：

    临时消息：id = local-xxx，local_status = sending
    正式消息：id = 9001，delivery_status = sent

最终页面中只保留正式消息。

## 八、WebSocket 的连接生命周期

连接成功后，服务端发送：

    {
      "type": "connected",
      "conversation_id": 501,
      "user_id": 102,
      "realtime": true,
      "fallback": false
    }

后端还会定期发送 heartbeat：

    {
      "type": "heartbeat",
      "conversation_id": 501,
      "realtime": true,
      "fallback": false
    }

心跳用于保持连接和确认链路仍然可用。

当前 WebSocket 的实际使用方式是：

    HTTP POST：前端 → 后端，发送消息
    WebSocket：后端 → 前端，通知消息变化
    HTTP GET：前端 → 后端，拉取完整消息

WebSocket 技术本身支持双向通信，但当前业务没有通过 WebSocket 接收前端发送的聊天命令。

## 九、Redis/WebSocket 故障时的补偿

Redis Pub/Sub 是瞬时广播，不是持久化队列：

    客户端离线时可能错过 Redis 事件
    WebSocket 断开时不会补发历史事件
    Redis 发布失败不会回滚已提交的消息

但前端仍然会使用 after_id 轮询：

    GET /chat/conversations/{id}/messages?after_id=最新消息 ID

所以完整可靠性依赖的是：

    数据库保存消息
        +
    REST 增量查询补偿

而不是依赖 WebSocket 保证消息不丢。

如果 Redis 不可用，后端会发送：

    {
      "type": "connected",
      "realtime": false,
      "fallback": true
    }

前端随后关闭或暂时放弃实时连接，进入轮询模式；后续会继续尝试重连。

## 十、Local Provider 和 Tencent Provider 的边界

当前 Provider 选择需要同时满足：

    conversation.provider == "tencent_im"
    CHAT_PROVIDER == "tencent_im"
    TENCENT_IM_ENABLED == true

否则返回 LocalChatProvider。

因此生产环境设置：

    CHAT_PROVIDER=local

时，即使代码和腾讯配置仍然存在，消息发送仍然走 Local Provider。

需要注意：

    Tencent IM 是备用消息 Provider
    Tencent COS 可能是图片存储
    Tencent Cloud Content Security 可能是内容审核 Provider

它们属于不同的链路。

Admin 后端还存在独立的 Tencent IM 成员同步 gateway，需要单独确认其开关不会在生产 Local 模式下误触发旧会话的远程同步：

[chat_ops_im_gateway.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-admin-backend/app/services/chat_ops_im_gateway.py:41)

## 十一、数据库 Migration 中的 Provider 字段

初始聊天表迁移见：[p1_20260604_add_table_chat_v1.py](/Users/hasono/Code/T46-Harness-Workspace/projects/t46/repos/T46-backend-repo/alembic/versions/p1_20260604_add_table_chat_v1.py:19)

其中包含：

    chat_conversations.provider
    chat_conversations.provider_conversation_id
    chat_messages.provider_message_id
    chat_messages.provider_message_seq
    chat_messages.provider_random

这些字段是通用 Provider 元数据，并不等同于固定的 Tencent IM 字段：

    Local Provider 通常不填 provider_message_*
    Tencent Provider 可以保存 MsgKey、MsgSeq、MsgRandom
    未来其他 Provider 也可以复用这组抽象字段

SDK AppID、SecretKey、UserSig 等是配置或接口返回数据，不是聊天表的专用数据库列。

## 十二、为什么当前没有把完整消息直接放进 Redis 事件

当前事件只携带：

    conversation_id
    message_id
    sender_user_id
    created_at

而不是携带完整消息，主要有几个原因：

### 1. 权限需要重新判断

用户 A 可能能看到消息，用户 B 可能因为被移除而不能看到。

### 2. 匿名身份需要重新投影

同一条消息可能根据活动阶段展示为匿名身份或实名身份。

### 3. 审核状态可能变化

一条消息可能经历：

    pending → visible
    pending → hidden

### 4. 避免 Redis 变成第二个消息数据库

完整消息只保存在 chat_messages，系统事实源更单一。

## 十三、WebSocket 和 SSE 的架构思考

当前 WebSocket 实际上只使用了服务端到客户端的单向通知能力：

    POST 写消息
    Redis 做广播
    WebSocket 推送 message_created
    REST 拉取完整消息

因此，从业务语义上看，SSE 也可以适配：

    POST 写消息
    Redis 做广播
    SSE 推送 message_created
    REST 拉取完整消息

SSE 的优点：

    天然是服务端到客户端的单向流
    HTTP 语义更直接
    自动重连模型更自然

但迁移前需要确认：

    微信小程序和 uni-app 各目标端是否稳定支持 SSE
    SSE 如何携带当前的用户鉴权
    代理和网关是否会缓冲 text/event-stream
    长连接超时和心跳如何处理
    是否需要每个会话一个流，还是每个用户一个流

即使换成 SSE，Redis 仍然需要保留，因为 SSE 只是替代 WebSocket 的前端推送层，不替代多实例之间的 Pub/Sub 广播层。

## 十四、当前架构的关键优点

### 1. 消息事实集中

所有 Local 消息都落在业务数据库，不依赖第三方 IM 平台的历史消息查询。

### 2. Provider 可切换

Local 和 Tencent 通过 ChatProvider 抽象隔离，未来可以保留 Tencent 备用路径。

### 3. 实时和可靠性分离

实时通知失败不会直接导致消息数据丢失，REST 轮询可以补偿。

### 4. 权限和身份由业务后端掌握

消息展示经过成员权限、审核状态和匿名身份投影，而不是直接把第三方 IM 消息原样暴露给前端。

## 十五、当前需要继续关注的风险

    1. Redis Pub/Sub 不持久化，可靠性依赖 after_id 增量查询和轮询补偿
    2. WebSocket 目前是单向使用，SSE 是否更适合需要结合小程序端能力判断
    3. 前端 optimistic message、client_message_id 和服务端消息需要持续保证幂等
    4. pending 审核消息的展示和后续状态刷新需要保持一致
    5. Admin Tencent IM gateway 的开关与 ToC Provider 开关并非完全同一套判断
    6. 会话缓存、未读投影、最后消息字段需要和消息事务保持一致
    7. 匿名身份投影不能只依赖消息落库时的 sender_display_name

## 十六、最终心智模型

可以用下面这句话理解整个系统：

> Local Provider 不负责把消息发送到某个外部 IM 平台，而是让业务后端自己拥有消息；数据库负责保存事实，Redis 负责广播变化，WebSocket 负责实时提醒，REST 负责获取完整消息和故障补偿。

完整时序：

    用户 A 前端
        ↓ POST /chat/conversations/501/messages
    后端 API
        ↓ 鉴权、成员校验、审核
    chat_messages INSERT
        ↓
    conversation/unread UPDATE
        ↓
    数据库 COMMIT
        ↓
    Redis PUBLISH message_created(message_id=9001)
        ↓
    用户 B WebSocket Handler
        ↓
    用户 B 前端收到事件
        ↓ GET /messages?after_id=9000
    后端查询完整消息
        ↓ 可见性和身份投影
    用户 B 前端合并并展示正式消息
