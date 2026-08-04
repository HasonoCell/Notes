# PostgreSQL 学习笔记：从 MySQL 基础到生产实践

本文按“如何理解与如何决策”的顺序，整理 PostgreSQL（下文简称 PG）的核心知识。重点不是记住某一条 SQL，而是理解 PG 的对象层级、运行模型、并发控制、查询优化与生产使用边界。

## 一、PG 的定位与学习重点

PG 是一套以标准 SQL、事务一致性、可扩展类型系统和复杂查询能力见长的关系型数据库。它与 MySQL/InnoDB 一样支持 ACID、索引、事务和 MVCC，但在以下方面更有辨识度：

- **对象层级清晰**：一个数据库中可以按 Schema 组织多套对象；权限以 Role 为中心。
- **类型和约束丰富**：除了常规数值、文本和时间，还原生支持 `jsonb`、数组、范围、全文搜索等能力。
- **读写并发模型成熟**：通过 MVCC 让大多数普通读写不互相阻塞；代价是必须正确理解 Vacuum 与长事务风险。
- **优化器可观测**：可用执行计划、统计信息和多种索引类型分析查询，而非只凭“加索引”。
- **扩展生态强**：PostGIS、pgvector、`pg_trgm` 等扩展可以让数据库获得地理查询、向量检索、模糊搜索等能力。

从 MySQL 转向 PG 时，最值得重新建立的概念是：**Schema、Role、MVCC 的版本清理、默认隔离级别，以及多进程 + 连接池的运行模型。**

## 二、对象层级：Cluster、Database、Schema 与对象

PG 的逻辑层次如下：

```text
一个 PostgreSQL 实例（Cluster）
└── 多个数据库（Database）
    └── 多个 Schema
        └── 表、索引、视图、函数、类型、序列……
```

这里的 **Cluster** 指一个 PG 服务实例及其数据目录，不是分布式集群的意思。客户端先连接到某一个 Database，再访问其内部的 Schema 和对象。

### Schema 是数据库内的命名空间

可以把 Schema 看成编程语言中的 package，或文件系统中的逻辑文件夹：

```text
app.users
app.orders
audit.events
reporting.daily_sales
```

它的价值主要是：

- 让同一数据库中的业务模块避免表名冲突；
- 将业务表、审计表、报表对象、第三方扩展对象分开组织；
- 结合权限，限制不同账户能访问的对象范围。

每个新数据库通常有一个 `public` Schema。未指定 Schema 创建的对象，通常会落入 `search_path` 中最先可用的 Schema。对生产代码而言，重要对象最好显式带 Schema，避免依赖会话级搜索路径。

Schema 不是独立数据库：它们可直接 JOIN、共享事务和配置，也不是天然的资源或租户安全隔离。若要隔离数据，还必须配置 Role/权限，必要时使用行级安全策略。

**简例：**

```sql
CREATE SCHEMA app;

CREATE TABLE app.users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE
);

-- 当前会话中可省略 app. 前缀；生产代码仍建议显式写 Schema。
SET search_path TO app, public;
```

## 三、Role 与权限模型

PG 用统一的 **Role** 概念表示账户和权限组：

- 带 `LOGIN` 属性的 Role 可以建立连接，相当于登录账户；
- 不带 `LOGIN` 的 Role 常作为权限组；
- Role 可以被授予给其他 Role，从而形成权限继承关系。

典型生产分层：

```text
app_owner       拥有 Schema/表，执行迁移
app_runtime     应用运行时账户，只具备必要读写权限
app_readonly    报表、BI、排障用的只读权限组
```

应用不应长期使用超级用户、数据库拥有者或迁移账户。除表级 `SELECT`、`INSERT`、`UPDATE`、`DELETE` 外，还要注意 Schema 本身的 `USAGE`、对象所有权，以及新建表后的默认授权策略。

**简例：**

```sql
CREATE ROLE app_runtime LOGIN;
GRANT USAGE ON SCHEMA app TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE
ON ALL TABLES IN SCHEMA app TO app_runtime;
```

## 四、数据建模与 PG 特有类型

### 4.1 常规类型的实践选择

- 主键：常用 `bigint` 的 identity 列或 `uuid`。identity 是现代 PG 中更推荐的自增方式。
- 文本：通常直接用 `text`；`text` 与无长度限制的 `varchar` 在性能上没有本质优势差异。只有业务确实需要长度约束时，才限制长度。
- 金额：使用 `numeric(p, s)`，避免用二进制浮点数保存需精确计算的金额。
- 布尔：使用原生 `boolean`，而非以整数模拟。
- 时间点：业务事件通常使用 `timestamptz`，统一表示实际发生时刻；展示和日/月统计时再转换为业务时区。
- 约束：优先使用 `NOT NULL`、`CHECK`、`UNIQUE`、外键等，让数据库保证数据不变量。

**简例：**

```sql
CREATE TABLE app.orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES app.users(id),
  total_amount numeric(12, 2) NOT NULL CHECK (total_amount >= 0),
  status text NOT NULL CHECK (status IN ('pending', 'paid', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### 4.2 JSONB

`jsonb` 是被解析后的二进制 JSON 表示，适合存放字段变化频繁、可选且结构不固定的扩展属性。它可按路径读取、按包含关系筛选，也可通过 GIN 或表达式索引加速查询。

适合 JSONB 的数据：渠道原始数据、商品可变属性、功能配置、低频查询的扩展元信息。

不适合 JSONB 的数据：主外键、金额、状态、核心筛选/排序字段、需要唯一性或复杂约束的字段。结构稳定且重要的数据应建成普通列；JSONB 不是逃避建模的“万能字段”。

**简例：**

```sql
-- 读取文本值与按包含关系筛选
SELECT metadata->>'channel' AS channel
FROM app.orders
WHERE metadata @> '{"channel": "web"}';

-- 常按 JSONB 包含关系查询时，才考虑 GIN 索引
CREATE INDEX idx_orders_metadata_gin
ON app.orders USING gin (metadata);
```

### 4.3 数组、范围与全文搜索

- **数组**：适合少量、原子、没有独立属性的多值信息，如标签或地区代码。若成员需要独立管理、关联或权限，应使用关联表。
- **范围类型**：`daterange`、`tstzrange` 等非常适合有效期、预约时段和价格区间。范围重叠、包含等关系是原生操作；配合 GiST 排斥约束可在数据库层防止同一资源的时间冲突。
- **全文搜索**：通过 `tsvector`、`tsquery` 和 GIN 索引实现词元化检索与相关性排序。PG 内置英文等语言配置较成熟；中文生产检索通常还需要合适的分词方案，或使用 `pg_trgm` 做子串/相似度搜索。

**简例：**

```sql
-- 数组：查找同时含有两个标签的文章
SELECT * FROM app.articles
WHERE tags @> ARRAY['postgresql', 'tutorial'];

-- 范围：判断预约时段是否冲突（&& 表示两个范围相交）
SELECT * FROM app.room_bookings
WHERE room_id = 101
  AND period && tstzrange('2026-08-03 09:00+08', '2026-08-03 10:00+08', '[)');
```

## 五、查询表达能力：分组、窗口、CTE 与返回结果

### 5.1 GROUP BY 决定结果粒度

`GROUP BY` 的本质是定义“结果集中的一行代表什么”。

- 不分组但使用聚合：整批输入行被视为一个组，得到一个汇总结果；
- 按用户分组：一行代表一个用户的汇总；
- 按用户和状态分组：一行代表一个“用户 + 状态”组合。

因此，分组查询的选择列必须要么是分组键，要么经过聚合函数计算。`WHERE` 在分组前过滤原始行，`HAVING` 在分组后过滤聚合结果。

**简例：**

```sql
SELECT
  user_id,
  SUM(total_amount) AS paid_amount
FROM app.orders
WHERE status = 'paid'       -- 先筛选订单
GROUP BY user_id            -- 一行代表一个用户
HAVING SUM(total_amount) >= 100;
```

### 5.2 窗口函数保留明细行

与 `GROUP BY` 不同，窗口函数计算分组统计值时不折叠行。它适合累计金额、排名、同组最近一条记录、与上一条记录对比等场景。

常见概念包括：按某列 `PARTITION BY` 分区、按时间或 ID `ORDER BY` 定义顺序，以及 `ROW_NUMBER`、`RANK`、`LAG`、`LEAD`、累计 `SUM` 等函数。窗口函数是报表 SQL 中最值得掌握的能力之一。

**简例：**

```sql
SELECT
  user_id,
  id,
  total_amount,
  SUM(total_amount) OVER (
    PARTITION BY user_id
    ORDER BY created_at, id
  ) AS running_total
FROM app.orders
WHERE status = 'paid';
```

### 5.3 CTE 与递归查询

CTE（`WITH`）让复杂查询可拆成具名步骤，优先用于提高可读性。现代 PG 会对部分可内联的 CTE 进行优化；是否产生额外成本应由执行计划判断，而不是一概而论。

`WITH RECURSIVE` 适合处理树结构，例如分类、组织架构、评论回复和菜单。需要同时考虑循环引用防护和递归深度。

**简例：**

```sql
WITH paid_users AS (
  SELECT user_id, SUM(total_amount) AS paid_amount
  FROM app.orders
  WHERE status = 'paid'
  GROUP BY user_id
)
SELECT u.email, p.paid_amount
FROM paid_users AS p
JOIN app.users AS u ON u.id = p.user_id;
```

### 5.4 PG 常见便利能力

- `RETURNING`：写入、更新、删除后直接返回受影响记录，减少额外查询；
- `DISTINCT ON`：可简洁地取得“每组排序后的第一条”，是 PG 特有语法；
- 聚合 `FILTER`：可在同一分组中对不同条件分别统计，表达清晰。

## 六、运行模型：多进程、共享内存与连接池

### 6.1 PG 为什么强调连接池

PG 的服务端采用**多进程模型**。主进程（也常被称为 postmaster）负责监听端口、接受连接和拉起子进程；一个客户端数据库连接通常对应一个独立的 backend 进程。

```text
应用请求
  ↓
应用内连接池 / PgBouncer
  ↓
PostgreSQL 主进程（监听与派生）
  ↓
多个 backend 进程（通常一连接一进程）
  ↓
共享内存、数据页缓存、WAL 与磁盘文件
```

除此以外，PG 还会运行多个后台进程，例如 WAL writer、checkpointer、background writer、autovacuum launcher/worker，以及按配置启用的归档或复制相关进程。

每条连接都要消耗进程、内存与调度资源，因而不能把数据库连接数等同于 HTTP 并发数。连接池的作用是将大量短请求复用到有限数量的真实数据库连接上：

```text
大量客户端/应用协程 → 少量受控的 PostgreSQL 连接
```

应用驱动或 ORM 的内置连接池适合大多数服务；客户端规模很多、实例弹性扩缩容明显时，常在数据库前加入 PgBouncer。

### 6.2 PgBouncer 的池模式

- **Session pooling**：一个客户端会话固定占用一条数据库连接，兼容性最好。
- **Transaction pooling**：只有一个事务执行期间占用连接，复用效率高，常用于 Web 服务。
- **Statement pooling**：一条语句一个连接，限制多、使用较少。

事务池模式下，不应依赖跨事务保存的连接状态，例如临时表、会话变量或未完成事务。事务必须短小，不能把外部网络调用、用户等待或慢计算包在事务中。

**实用配置示例：**

```sql
-- 可按运行时账户设置保护性超时；新连接会继承这些设置。
ALTER ROLE app_runtime SET statement_timeout = '5s';
ALTER ROLE app_runtime SET lock_timeout = '1s';
ALTER ROLE app_runtime SET idle_in_transaction_session_timeout = '30s';
```

## 七、存储架构、WAL 与崩溃恢复

### 7.1 数据页与关系文件

PGDATA 是一个实例的数据目录。表、索引等在内部称为 relation，数据通常按固定大小的页面存储（常见构建默认是 8KB 页）。表并非一个“单行覆盖”的简单文件，而是由数据页、索引页以及辅助结构共同组成。

几个重要概念：

- **Shared buffers**：PG 自身的共享页缓存；操作系统也会对文件页做缓存。
- **TOAST**：超长文本、JSONB、数组等变长值可能被自动移到旁路存储中，主行保存引用。
- **FSM（Free Space Map）**：记录哪些页有可复用空闲空间。
- **VM（Visibility Map）**：记录页面的可见性信息，帮助 Vacuum 和 index-only scan 等操作。

### 7.2 WAL：先写日志，再写数据页

WAL（Write-Ahead Log，预写式日志）是 PG 的持久化与恢复基础。修改数据时，先记录足以重放该修改的日志；事务提交所需 WAL 被安全落盘后，才能向客户端确认提交成功。实际数据页可在之后由后台刷写。

```text
事务修改 → 生成 WAL → WAL 持久化 → 向客户端确认 COMMIT
                                  ↓
                         数据页稍后写回磁盘
```

服务器崩溃后，PG 会从最后一个检查点开始重放必要 WAL，使数据页恢复到一致状态。WAL 也用于流复制和时间点恢复（PITR）。

### 7.3 Checkpoint 的作用与权衡

Checkpoint 将此前已修改的脏页逐步写回磁盘，并记录恢复起点。检查点过于频繁会带来更多写入压力；过于稀疏则会增加崩溃恢复所需重放的 WAL。生产配置应结合写入负载、磁盘能力和可接受恢复时间调整，而不是盲目套用参数。

## 八、事务、MVCC、锁与 Vacuum

### 8.1 MVCC：同一逻辑行可以暂时有多个版本

PG 的 `UPDATE` 和 `DELETE` 不应简单理解为“覆盖或抹掉旧行”。它们会形成新版本，并根据事务可见性规则决定不同查询能看到哪个版本。

```text
旧版本：对仍持有旧快照的事务可见
新版本：对之后的事务可见
```

这使普通 `SELECT` 通常不会阻塞普通写入，普通写入也通常不会阻塞普通读取。代价是旧版本需要在没有事务需要它后被清理。

### 8.2 Autovacuum 不是可有可无的后台任务

Vacuum 负责清理可回收的旧行版本、冻结过旧事务 ID，并维护部分统计/可见性信息。Autovacuum 是生产实例的核心组成，不应轻易关闭。

最常见的风险是长事务或 `idle in transaction` 连接：它们持有很旧的快照，阻止旧版本回收，可能造成表和索引膨胀，并加重事务 ID 维护压力。因此要保持事务短小、为连接配置空闲事务超时，并监控异常会话。

### 8.3 隔离级别与写入并发

PG 默认通常为 `READ COMMITTED`：每条语句看到其开始时已经提交的数据快照。这与 MySQL/InnoDB 常见的默认 `REPEATABLE READ` 有差异。

- `READ COMMITTED`：适合大多数 OLTP；同一事务内两次查询可能看到不同的已提交结果。
- `REPEATABLE READ`：事务维持稳定快照；并发冲突时可能需要重试。
- `SERIALIZABLE`：提供最强的可串行化语义；应用必须准备好重试因序列化冲突失败的整个事务。

防止库存超卖等问题时，优先将“条件检查 + 修改”写成一个原子更新，而不是先查询、再由应用决定是否更新。复杂的“读—判断—写”流程则可使用 `SELECT ... FOR UPDATE` 锁定目标行。

**原子更新简例：**

```sql
UPDATE app.inventory
SET quantity = quantity - 1
WHERE product_id = 1
  AND quantity > 0
RETURNING quantity;
```

返回一行表示扣减成功；返回零行则表示库存不足或目标不存在。并发请求会由行锁协调，后来的事务会重新检查条件。

### 8.4 锁、死锁与异常事务

写入会获取行级锁，DDL 和部分维护操作还会获取不同级别的表锁。`FOR UPDATE` 适合需要显式锁行的业务流程；`NOWAIT` 可快速失败，`SKIP LOCKED` 常用于并发任务队列的“抢占式领取”。

死锁发生于不同事务以相反顺序等待资源。PG 会检测并中止其中一个事务，应用应捕获错误并重试。预防方法是：多行/多表操作采用稳定一致的锁定顺序。

PG 的重要行为：事务中一条语句报错后，事务进入失败状态，后续语句不能正常执行，必须整体回滚或回滚到 savepoint。应用应正确处理异常，不要在已失败的事务上继续发业务 SQL。

**事务与行锁简例：**

```sql
BEGIN;

SELECT *
FROM app.orders
WHERE id = 42
FOR UPDATE;

-- 完成校验和修改后再提交；不要在此期间调用外部服务。
COMMIT;
```

## 九、查询优化与索引

### 9.1 优化器不是“有索引就一定用”

PG 优化器会根据统计信息估算不同执行计划的成本。小表、低选择性条件或需要返回大部分数据时，顺序扫描可能比索引扫描更快；因此看到 `Seq Scan` 并不必然意味着问题。

诊断顺序应是：确认业务查询 → 使用 `EXPLAIN (ANALYZE, BUFFERS)` 观察真实计划 → 比较预估行数和实际行数 → 再决定是否修改索引、统计信息或 SQL。

`EXPLAIN ANALYZE` 会真实执行语句；针对写操作必须谨慎，必要时放进会回滚的事务中分析。

### 9.2 常见索引选择

- **B-tree**：默认且最常用，适合等值、范围、排序和前缀列匹配。
- **联合索引**：字段顺序由真实过滤条件和排序决定；优先考虑高频查询的访问路径，而不是随意拼接所有列。
- **部分索引**：只为满足某个固定条件的少量行建索引，例如活跃/待处理记录，空间和写入成本更低。
- **GIN**：常用于 JSONB、数组和全文搜索，擅长“包含多个元素/词元”的查询，但写入成本较高。
- **GiST**：常用于范围、地理等“相交/邻近”关系，也可用于排斥约束。
- **表达式索引**：为常见计算表达式或 JSONB 路径建立索引；查询表达式应与索引定义保持一致。

主键和唯一约束会自动创建索引；**外键列不会自动创建索引**。若父表删除/更新或子表按外键频繁关联、过滤，子表外键列通常应建立索引。

**简例：**

```sql
-- 为“查询某用户最近已支付订单”设计的部分联合索引
CREATE INDEX idx_orders_paid_user_created
ON app.orders (user_id, created_at DESC)
WHERE status = 'paid';

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM app.orders
WHERE user_id = 42 AND status = 'paid'
ORDER BY created_at DESC
LIMIT 20;
```

### 9.3 统计信息与 Analyze

优化器依赖列值分布、行数等统计信息。批量导入、删除、分布剧烈变化后，自动维护可能暂时跟不上；此时可针对性运行 `ANALYZE`。不要通过永久关闭顺序扫描或强制某种计划来“修复”性能，应先找出估算失准或访问路径不合理的原因。

## 十、表分区与物化视图

### 10.1 表分区

分区表是一个逻辑总表，实际数据落在多个分区中。最常见的是按时间 RANGE 分区；也可按租户、地区等进行 LIST/HASH 分区。

适用场景：数据量极大、时间维度查询明确、需要按月/季度快速归档或删除历史数据、单表维护成本很高的日志/事件/订单明细。

分区不是“小表性能优化按钮”。表不够大、查询没有分区键条件、分区数量过多或索引策略不统一时，反而会增加规划和运维复杂度。分区设计的重点是分区键、单分区大小、未来分区自动创建和历史分区归档策略。

**按月分区简例：**

```sql
CREATE TABLE app.events (
  id bigint GENERATED ALWAYS AS IDENTITY,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL
) PARTITION BY RANGE (occurred_at);

CREATE TABLE app.events_2026_08
  PARTITION OF app.events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
```

### 10.2 物化视图

普通视图只保存查询定义，每次访问实时执行；物化视图保存查询结果，适合成本高但允许一定延迟的报表和聚合数据。

其核心权衡是：读取快，但数据不是实时的，需要刷新。若使用并发刷新，通常需要满足唯一标识等前提。物化视图不是缓存的完全替代品，应明确数据新鲜度、刷新时间、失败恢复和资源开销。

**简例：**

```sql
CREATE MATERIALIZED VIEW reporting.daily_sales AS
SELECT date_trunc('day', created_at) AS day,
       SUM(total_amount) AS revenue
FROM app.orders
WHERE status = 'paid'
GROUP BY 1;

REFRESH MATERIALIZED VIEW reporting.daily_sales;
```

## 十一、迁移、备份恢复与可观测性

### 11.1 数据库迁移

Schema 变化应像应用代码一样纳入版本控制，并以顺序迁移文件或迁移工具执行。已进入生产的迁移不应被直接修改。

线上结构演进推荐“扩展—迁移—收缩”流程：先加兼容的新结构，再让应用双写/回填，确认读写已迁移后，最后删除旧结构。这样可支持灰度发布和回滚，避免一次发布同时破坏旧代码与旧数据。

大表建索引常需使用并发建索引以减少写入阻塞；这种操作有事务边界和失败恢复限制，应在变更方案中单独处理。

**迁移片段：**

```sql
-- 先添加可空字段，发布兼容应用后回填；最后再收紧约束。
ALTER TABLE app.orders ADD COLUMN note text;

-- CREATE INDEX CONCURRENTLY 不能放在 BEGIN/COMMIT 事务块中。
CREATE INDEX CONCURRENTLY idx_orders_created_at
ON app.orders (created_at);
```

### 11.2 备份与恢复

- **逻辑备份**：`pg_dump` 导出 schema 和数据，便于选择性恢复、跨环境迁移和逻辑检查。
- **集群级对象**：Role 等全局对象需单独纳入备份方案。
- **物理备份 + WAL 归档**：用于完整灾备和 PITR，可恢复到某个指定时间点。

备份策略必须回答两个问题：可接受丢失多久的数据（RPO）与可接受多久恢复服务（RTO）。最关键的验证动作不是“备份命令成功”，而是定期恢复到独立环境并进行可用性检查。

**命令示例：**

```bash
# 自定义格式便于选择性恢复；恢复前应始终确认目标数据库。
pg_dump -Fc --no-owner -d my_app -f my_app.dump
pg_restore --list my_app.dump
pg_restore --no-owner -d my_app_restore my_app.dump
```

### 11.3 运行监控

应持续关注：连接数、活跃会话、`idle in transaction`、慢查询、锁等待、死锁、缓存命中、WAL 量、复制延迟、磁盘空间、表/索引膨胀和 Autovacuum 活动。

`pg_stat_activity` 适合观察会话与等待，`pg_locks` 有助于分析阻塞链。`pg_stat_statements` 是定位高频/高耗时 SQL 的重要扩展，但需要在实例配置阶段正确启用。

建议为运行时 Role 设置合理的语句超时、锁等待超时和空闲事务超时；超时应结合业务 SLA 配置，而非所有接口使用同一个激进阈值。

**会话排查简例：**

```sql
SELECT
  pid, usename, state, wait_event_type, wait_event,
  now() - query_start AS running_for,
  query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start;
```

## 十二、从 MySQL 迁移时的高频差异

| 主题 | MySQL 常见习惯 | PG 的推荐理解 |
|---|---|---|
| 命名空间 | database 与 schema 常近似同义 | Database 内可有多个 Schema |
| 自增主键 | `AUTO_INCREMENT` | identity 列（旧项目也可见 `serial`） |
| 布尔值 | 常用整数表示 | 原生 `boolean` |
| 时间 | 常混用不同时间语义 | 事件时间优先考虑 `timestamptz` |
| JSON | JSON 字段 | `jsonb` 支持丰富操作与索引，但不代替规范建模 |
| 默认隔离级别 | InnoDB 常为 Repeatable Read | PG 常为 Read Committed |
| 事务报错后 | 具体行为依 SQL 模式而异 | 一条错误可使事务进入失败状态，需回滚或回滚到 savepoint |
| 连接模型 | 通常采用线程/连接模型理解 | PG 一连接通常对应一个 backend 进程，更应重视连接池 |
| DDL | 部分操作事务性受限 | 大多数 DDL 可事务化，但并发建索引等是例外 |

## 十三、实践中的设计准则

1. 先用普通表、规范化关系、B-tree 索引和短事务解决问题；不要过早引入分区、JSONB、触发器或复杂扩展。
2. 用数据库约束保证关键数据不变量；应用校验提升体验，但不能替代数据库约束。
3. 用真实负载和执行计划决定索引；每个索引都会增加写入、空间和维护成本。
4. 核心字段使用列，变化属性使用 JSONB；独立实体和多对多关系使用关联表。
5. 将“检查 + 修改”设计为原子操作；必要时加锁并让应用具备死锁/序列化失败后的重试能力。
6. 保持事务短小，配置连接池与超时，严防 `idle in transaction`。
7. 迁移、备份、恢复、监控和权限属于数据库系统的一部分，而不是上线后的附加项。

## 十四、后续学习路线

在掌握本笔记内容后，可按需求继续深入：

1. 表分区、索引设计和执行计划的专项性能调优；
2. WAL、流复制、读副本、故障转移与 PITR；
3. 行级安全（RLS）与多租户隔离；
4. PL/pgSQL、触发器、函数、视图与物化视图；
5. PostGIS、pgvector、`pg_trgm` 等扩展的选型；
6. 结合一个订单/内容/任务系统，从建模、迁移、查询、权限、监控到灾备完成端到端实战。

## 总结

PG 的核心不是“比 MySQL 多了多少语法”，而是一套相互关联的系统设计：**多进程连接模型决定了连接池的重要性；WAL 保证崩溃恢复与复制；MVCC 提供读写并发，Vacuum 则回收由此产生的旧版本；优化器基于统计信息和索引选择访问路径；Schema、Role 与约束共同构成可维护的数据边界。**

掌握这些关系后，具体 SQL、索引类型或扩展的学习会自然落到正确的使用场景中。
