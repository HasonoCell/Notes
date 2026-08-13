# Redis 学习笔记：从数据结构到生产实践

本文整理 Redis 的核心模型、常用数据结构、缓存设计、持久化、高可用、原子性与生产实践。重点是理解 Redis 适合解决什么问题，以及每种能力的边界。

## 一、Redis 的定位

Redis 是一个基于内存的数据结构服务器。最基本的模型是：

```text
key → value
```

但 `value` 不只是一段字符串，还可以是 Hash、List、Set、Sorted Set 和 Stream 等数据结构。

Redis 常见用途：

- 缓存和热点数据加速；
- Session 和短期状态；
- 计数器、排行榜和实时统计；
- 简单队列、延迟任务和可靠异步消息；
- 分布式锁、幂等标记和限流器。

Redis 不是“更快的 PostgreSQL”。PostgreSQL 通常是持久化事实数据的来源，Redis 更多是内存中的加速层或实时状态层。是否把 Redis 当作主数据存储，必须结合持久化、备份、恢复和一致性要求单独评估。

## 二、运行模型与底层架构

### 2.1 Server、客户端与事件循环

Redis 是独立的 Server，应用通过 TCP 和 Redis 协议（RESP）通信：

```text
应用程序
  ↓
Redis 客户端 / 连接池
  ↓
Redis Server
  ├── 网络事件循环
  ├── 命令执行
  ├── 内存数据结构
  └── 持久化、复制和后台任务
```

Redis 的核心命令执行通常由一个事件循环串行处理，因此一条简单命令天然具有原子性：其他客户端不会在这条命令执行到一半时插入。现代 Redis 还可能使用 I/O 线程、后台线程和持久化子进程，但核心数据命令的串行执行语义仍然是理解 Redis 的关键。

这解释了两个现象：

- `GET`、`SET`、`INCR` 等简单命令非常快；
- 一个大 Key 的全量遍历、长 Lua 脚本或复杂命令也可能阻塞其他客户端。

Redis 与 PostgreSQL 的连接模型不同：PG 通常为一个数据库连接维护一个 backend 进程；Redis 可以由一个事件循环处理大量客户端 socket，但每个连接仍然占用内存、文件描述符和网络资源，因此应用仍然需要连接池。

### 2.2 内存与后台工作

Redis 内存不只包括 Value，还包括 Key、数据结构元信息、哈希表/跳跃表等索引、客户端缓冲区、复制缓冲区和 AOF/RDB 相关内存。

RDB 快照和 AOF Rewrite 通常需要 `fork` 子进程。操作系统的 Copy-on-Write 会让父子进程短时间共享页面，但写入越繁忙，额外内存压力可能越大。大实例执行快照或重写时，延迟和内存都需要监控。

## 三、Key、过期时间与命名

Key 是字符串，通常通过前缀和冒号组织逻辑命名空间：

```text
user:42:name
order:1001:status
cache:product:42
rate:user:42:minute
```

Redis 没有 PostgreSQL Schema 那样的对象命名空间。Redis 的逻辑数据库编号（如 `SELECT 0`、`SELECT 1`）不应被当作强隔离或权限边界；生产环境更常使用独立实例、独立集群或清晰的 Key 前缀。

最基本的操作：

```bash
SET user:42:name Alice
GET user:42:name
TYPE user:42:name
DEL user:42:name
```

设置过期时间：

```bash
SET session:abc123 "user_id=42" EX 1800
TTL session:abc123
PERSIST session:abc123
```

过期不是精确的定时器。Redis 主要通过访问时惰性删除和后台主动抽样删除来清理过期 Key，因此到期和实际物理释放之间可能存在短暂延迟，但业务读取不会再看到已过期的数据。

生产环境不要使用 `KEYS *` 遍历全库，它可能阻塞 Redis。应使用渐进式遍历：

```bash
SCAN 0 MATCH user:* COUNT 100
```

## 四、核心数据结构

| 类型 | 主要语义 | 常见用途 |
|---|---|---|
| String | 一个二进制安全的值 | 缓存、计数器、开关、幂等标记 |
| Hash | 一个 Key 下的多个字段 | 用户资料、订单状态、对象属性 |
| List | 有顺序的序列 | 简单队列、最新 N 条记录 |
| Set | 无序且去重的集合 | 标签、关系、去重、集合运算 |
| Sorted Set | 成员 + score 的有序集合 | 排行榜、优先级、延迟任务 |
| Stream | 带 ID 的追加消息日志 | 可靠队列、事件流、消费者组 |

### 4.1 String

String 可以保存文本、JSON、二进制，也可以作为数字计数器：

```bash
SET article:42:views 0
INCR article:42:views
INCRBY article:42:views 10
```

只在 Key 不存在时写入：

```bash
SET idempotency:payment:req-abc processing NX EX 86400
```

String 适合缓存序列化后的对象，但如果需要频繁修改对象中的单个字段，Hash 通常更合适。

### 4.2 Hash

```bash
HSET user:42 name Alice age 28 city Shanghai
HGET user:42 name
HGETALL user:42
HINCRBY user:42 login_count 1
```

Hash 适合一个对象的多个字段可独立读取和更新。它不是关系表，不能像 SQL 一样按任意字段查询，也不适合无限增长成一个超大对象。

### 4.3 List

从左侧加入、从右侧取出可以形成简单队列：

```bash
LPUSH queue:emails email-1
LPUSH queue:emails email-2
RPOP queue:emails
BRPOP queue:emails 0
```

`BRPOP` 的 `0` 表示一直阻塞等待。List 队列的主要缺点是消费者取出消息后若崩溃，消息可能已经丢失；需要 ACK、重试和故障转移时，应使用 Streams。

List 也适合保存最新 N 条记录，例如写入后用 `LTRIM` 保留固定长度。

### 4.4 Set

```bash
SADD user:42:tags redis database backend
SISMEMBER user:42:tags redis
SMEMBERS user:42:tags
SINTER user:1:following user:2:following
```

Set 自动去重，适合成员关系、标签和集合交并差。它无序，不适合排行榜或有时间顺序的记录。

### 4.5 Sorted Set

```bash
ZADD leaderboard 100 user:1
ZADD leaderboard 250 user:2
ZINCRBY leaderboard 20 user:1
ZREVRANGE leaderboard 0 9 WITHSCORES
ZREVRANK leaderboard user:1
```

每个成员都有一个 score。Sorted Set 适合积分榜、热度榜、优先级队列和延迟任务。分数相同时应额外设计稳定的排序规则。

## 五、内存、过期与淘汰

### 5.1 过期与淘汰不是一回事

```text
过期（expiration）：某个 Key 的 TTL 到期
淘汰（eviction）：达到 maxmemory 后删除部分 Key
```

设置内存上限和淘汰策略：

```bash
CONFIG SET maxmemory 1gb
CONFIG SET maxmemory-policy allkeys-lru
```

常见策略：

- `noeviction`：不自动删除，内存不足时写入失败；
- `allkeys-lru`：从全部 Key 中淘汰最近最少使用的；
- `allkeys-lfu`：从全部 Key 中淘汰访问频率最低的；
- `volatile-lru`：只从设置 TTL 的 Key 中按 LRU 淘汰；
- `volatile-ttl`：优先淘汰剩余 TTL 较短的 Key。

纯缓存常考虑 `allkeys-lru` 或 `allkeys-lfu`；包含不能丢数据的 Key 时，要谨慎使用淘汰策略。`volatile-*` 策略不会淘汰没有 TTL 的 Key，因此仍可能内存耗尽。

### 5.2 Cache-Aside

最常见的缓存模式：

```text
查 Redis
  ├── 命中：直接返回
  └── 未命中：查 PostgreSQL → 写 Redis + TTL → 返回
```

写入时通常遵循：

```text
更新数据库 → 删除缓存
```

Redis 不会自动知道 PostgreSQL 的数据变化，一致性需要应用、消息系统或失效通知机制维护。

### 5.3 缓存穿透、击穿与雪崩

**缓存穿透**：请求大量不存在的数据，使请求每次都到数据库。可缓存短 TTL 的空值、校验请求参数或使用 Bloom Filter。

```bash
SET cache:user:999999 "__NULL__" EX 30
```

**缓存击穿**：某个热门 Key 过期，大量请求同时重建。可使用 TTL 随机抖动、互斥锁、逻辑过期、异步刷新或本地缓存。

**缓存雪崩**：大量 Key 同时过期，或 Redis 整体不可用。可分散 TTL、预热、限流熔断、部署副本，并设置数据库连接池上限。

## 六、持久化：RDB、AOF 与混合持久化

### 6.1 RDB 快照

RDB 在某个时间点生成整个数据集快照：

```text
内存数据 → BGSAVE → dump.rdb
```

手动触发后台快照：

```bash
BGSAVE
INFO persistence
```

RDB 文件紧凑、恢复较快，适合备份和迁移，但可能丢失上次快照之后的数据。`SAVE` 是同步快照，会阻塞主线程，生产环境通常避免直接使用。

### 6.2 AOF 日志

AOF 记录改变数据的写命令：

```text
SET user:42:name Alice
INCR article:42:views
HSET order:1001 status paid
```

常见刷盘策略：

- `always`：持久性强，写延迟高；
- `everysec`：通常是性能与安全性的平衡；
- `no`：由操作系统决定刷盘，故障时丢失范围不确定。

AOF 会通过 Rewrite 压缩历史命令：

```bash
BGREWRITEAOF
```

现代 Redis 支持用 RDB 内容作为 AOF 的前缀，再追加增量命令，兼顾较快恢复和较强持久性。

### 6.3 选择和边界

| 场景 | 常见策略 |
|---|---|
| 纯缓存 | 可只使用 RDB，甚至不启用持久化 |
| Session/任务状态 | AOF `everysec` + RDB |
| 重要 Redis 数据 | AOF + RDB + 复制 + 外部备份 |

同时启用时，Redis 重启通常优先使用 AOF，因为它通常包含更新的数据。但 AOF/RDB 都不等于完整灾备，仍要把备份复制到独立机器或对象存储，并实际进行恢复演练。

## 七、复制、Sentinel 与 Cluster

### 7.1 Primary-Replica

Redis 可以把一个 Primary 的数据异步复制给多个 Replica：

```text
Primary
 ├── Replica 1
 ├── Replica 2
 └── Replica 3
```

查看状态：

```bash
INFO replication
ROLE
```

复制一般先进行完整同步，网络短暂中断后尽量使用复制积压缓冲区进行部分重同步。复制是异步的，Replica 可能存在延迟，因此 Primary 已确认但 Replica 尚未收到的数据在主节点故障时仍可能丢失。

### 7.2 Sentinel

Sentinel 监控 Primary 和 Replica，在 Primary 故障时选出新的 Primary 并通知客户端。它解决的是非分片架构下的监控和故障转移，不负责数据分片。客户端或客户端库需要支持 Sentinel。

### 7.3 Redis Cluster

Cluster 使用 16,384 个 Hash Slot 将 Key 分布到不同节点：

```text
hash(key) → slot → 节点
```

多 Key 操作要求相关 Key 位于同一个 Slot。可以使用 Hash Tag：

```text
user:{42}:profile
user:{42}:orders
```

两者会根据 `{42}` 计算 Slot。Cluster 同时提供分片和节点级故障转移，但会限制跨 Slot 的多 Key 操作。

```text
RDB/AOF      → 重启恢复
Replica      → 数据冗余、读扩展
Sentinel     → 非分片架构自动故障转移
Cluster      → 分片 + 高可用
```

## 八、原子性、事务与 Lua

### 8.1 单条命令的原子性

Redis 的核心命令通常在事件循环中完整执行：

```bash
INCR counter
DECR stock:42
HSET order:1001 status paid
```

但下面的多步业务流程不能仅靠单条命令保证原子性：

```text
读取库存 → 判断库存 → 扣减库存 → 写入订单
```

不同命令之间可能插入其他客户端的操作。

### 8.2 MULTI/EXEC

```bash
MULTI
SET order:1001 status:paid
INCR user:42:order_count
EXEC
```

`EXEC` 执行时，这批 Redis 命令之间不会插入其他客户端的命令。但 Redis 的 MULTI/EXEC 没有 PostgreSQL 那样的完整回滚语义：运行时错误不会自动撤销已经执行的其他命令。

如果业务需要“读取旧值、判断、再写入”，可配合 `WATCH` 做乐观锁；冲突时 `EXEC` 失败，客户端读取新值后重试。

### 8.3 Lua/Functions

Lua 脚本适合把判断和修改放在 Redis 内部：

```lua
local stock = tonumber(redis.call('GET', KEYS[1]) or '0')

if stock <= 0 then
  return 0
end

redis.call('DECR', KEYS[1])
redis.call('HSET', KEYS[2], 'status', 'reserved')
return 1
```

脚本执行期间不会插入其他命令，但长脚本会阻塞 Redis。Redis Cluster 中脚本涉及的多个 Key 通常必须位于同一个 Slot。Redis 7 的 Functions 可以持久化加载和复用服务端函数。

### 8.4 Pipeline 不是事务

Pipeline 只是把多条命令批量发送，减少网络往返；它不保证命令之间没有其他客户端插入。需要原子性时使用 MULTI/EXEC、WATCH 或 Lua。

### 8.5 跨系统事务边界

如果流程是：

```text
Redis 扣库存 + PostgreSQL 写订单
```

Redis 事务不能和 PostgreSQL 写入组成一个跨数据库原子事务。应使用幂等号、状态机、Outbox、消息队列或让 PostgreSQL 成为库存/订单的最终事实来源。

## 九、Streams 与可靠异步任务

### 9.1 Stream 是追加日志

写入 Stream：

```bash
XADD events * type order_created order_id 1001
XRANGE events - +
```

消息有类似 `时间戳-序号` 的 ID，包含多个 Field-Value。消息不会因为被读取或 `XACK` 就自动删除，需要单独裁剪或归档。

### 9.2 消费者组

创建消费者组：

```bash
XGROUP CREATE events order-workers $ MKSTREAM
```

消费者读取新消息：

```bash
XREADGROUP GROUP order-workers worker-1 \
  COUNT 10 BLOCK 5000 \
  STREAMS events >
```

同一消费者组内的消费者分担消息；不同消费者组则各自收到同一条消息，适合计费、分析、归档等多路消费。

### 9.3 PEL、ACK 与重试

消息被读取后会进入消费者组的 Pending Entries List（PEL）：

```text
读取 → PEL → 业务处理成功 → XACK → 从 PEL 移除
```

确认：

```bash
XACK events order-workers 1720000000000-0
XPENDING events order-workers
```

消费者崩溃后，未 ACK 的消息可以由其他消费者接管：

```bash
XAUTOCLAIM events order-workers worker-2 60000 0-0 COUNT 10
```

Streams 提供的是至少一次投递，不是恰好一次。Worker 可能在业务处理成功但 ACK 前崩溃，因此消费者必须使用 `event_id`、数据库唯一约束或状态表实现幂等。

ACK 的正确顺序是：

```text
读取 → 处理成功 → ACK
```

不能在业务处理前 ACK，否则处理失败后消息不会自动重试。

### 9.4 Streams、List、Pub/Sub

```text
Pub/Sub：实时广播，离线订阅者错过消息
List：简单队列，原生可靠确认能力弱
Streams：带历史、消费者组、ACK、PEL 和重试的消息日志
```

Streams 的可靠性还取决于 Redis 的持久化和复制配置。只使用 Streams 但关闭持久化，并不等于可靠消息系统。

## 十、连接池、Pipeline 与性能排查

### 10.1 连接池

连接池复用 Redis 连接，避免每个请求都创建和关闭 TCP 连接。连接池需要控制最大连接数、获取等待时间和命令超时。

总连接数要按所有应用实例计算：

```text
10 个实例 × 每实例 20 条连接 = 200 条连接
```

连接池过小会导致应用排队，过大会增加 Redis 连接、文件描述符和调度压力。

### 10.2 Pipeline

如果应用要发送大量独立命令，Pipeline 可以批量发送，减少网络 RTT。但它不保证原子性，也不替代 MULTI/EXEC 或 Lua。

### 10.3 大 Key 与阻塞命令

检查内存占用：

```bash
INFO memory
MEMORY USAGE user:42
MEMORY DOCTOR
```

避免对大结构执行全量读取：

```bash
HGETALL huge:hash
SMEMBERS huge:set
LRANGE huge:list 0 -1
```

改用分批遍历：

```bash
HSCAN huge:hash 0 COUNT 100
SSCAN huge:set 0 COUNT 100
ZSCAN huge:zset 0 COUNT 100
```

删除大 Key 时可考虑：

```bash
UNLINK huge:key
```

### 10.4 慢命令与运行状态

```bash
SLOWLOG GET 20
INFO stats
INFO commandstats
CLIENT LIST
LATENCY DOCTOR
```

Slowlog 主要记录服务端命令执行耗时，不包含完整网络往返时间。排查延迟时还要看连接池等待、网络 RTT、Redis CPU、内存、AOF/RDB Fork 和复制状态。

常见现象：

| 现象 | 可能原因 |
|---|---|
| 所有命令变慢 | CPU、网络、持久化、内存压力 |
| 某些命令变慢 | 大 Key、复杂范围查询、长 Lua |
| P99 偶发尖刺 | RDB/AOF 重写、Fork、网络抖动 |
| 获取连接变慢 | 连接池过小或连接泄漏 |
| 内存持续增长 | Key 泄漏、无 TTL、大对象、淘汰策略不合适 |

## 十一、经典业务模式

### 11.1 分布式锁

```bash
SET lock:order:42 request-token NX PX 10000
```

释放锁时要通过 Lua 确认 Token 仍属于当前持有者，不能无条件 `DEL`。长任务要考虑续期；严格正确性还需要数据库约束、幂等性或 fencing token。

### 11.2 限流

固定窗口可用 `INCR` + TTL；滑动窗口可用 Sorted Set 保存请求时间。多步骤逻辑需要 Lua 或其他原子方式组合，不能把“统计、判断、写入”拆成互不保护的客户端命令。

### 11.3 排行榜

使用 Sorted Set 保存成员和分数：

```bash
ZADD leaderboard 250 user:42
ZREVRANGE leaderboard 0 9 WITHSCORES
```

### 11.4 延迟队列

使用执行时间作为 score：

```bash
ZADD delayed:jobs 1788000000 job:1001
```

Worker 查询到期任务，并以原子方式完成“领取并删除”。任务仍需要重试次数、处理中状态和死信处理。

### 11.5 Session

```bash
HSET session:abc123 user_id 42 role member
EXPIRE session:abc123 1800
```

共享 Redis Session 可以让多个应用实例无须 Sticky Session，但要设计 Redis 不可用时的降级策略和敏感信息保护。

### 11.6 幂等请求

```bash
SET idempotency:payment:req-abc processing NX EX 86400
```

第一次请求创建标记，重复请求发现 Key 已存在。生产实现通常还需要保存 `processing/success/failed` 状态及结果，避免第一次请求在中途崩溃后系统无法判断下一步。

## 十二、设计准则

1. 把 Redis 当作数据结构服务器，而不是只会 `GET/SET` 的缓存。
2. 核心事实数据和缓存副本要明确分工；Redis 丢数据后系统仍应有恢复路径。
3. 过期策略、淘汰策略、持久化和复制必须一起设计。
4. 单条命令原子不代表整个业务动作原子；多步 Redis 逻辑使用 WATCH、MULTI/EXEC 或 Lua。
5. Redis 与 PostgreSQL 之间没有天然的跨库事务，核心业务必须设计幂等和补偿。
6. Streams 是至少一次投递，ACK 只能在业务成功之后执行。
7. 避免大 Key、全量遍历和长 Lua；使用分页、SCAN、UNLINK 和合理的数据拆分。
8. 连接池、P99 延迟、内存、慢命令、复制延迟和 PEL 积压都应纳入监控。

## 十三、后续学习方向

掌握本文后，可以继续深入：

- Redis Cluster 的槽迁移、故障转移和客户端路由；
- Sentinel 的选主与网络分区；
- Redlock、fencing token 与严格分布式锁语义；
- Redis Functions、脚本缓存和脚本超时治理；
- 大规模缓存预热、热点 Key 保护和多级缓存；
- Streams 的消费者组扩缩容、死信队列和消息归档；
- Redis 与 PostgreSQL、消息队列结合的可靠业务架构。

## 总结

Redis 的核心是一条完整的设计链：**内存数据结构提供低延迟操作，过期和淘汰管理内存，RDB/AOF 提供持久化，Replica/Sentinel/Cluster 提供冗余和高可用，Lua/事务保证 Redis 内部多步操作的原子性，Streams 提供至少一次的异步消费能力，而幂等、数据库约束和监控负责补上跨系统可靠性的边界。**
