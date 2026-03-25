NSM 是一个 n8n 源码补丁管理工具，用于解决基于 n8n 开源项目做二次开发时，定制修改与上游版本升级之间的矛盾。

## 解决的核心问题
团队基于 n8n 进行二次开发（接入 UUAP 认证、品牌替换为 "AIFlow"、隐藏节点、中文国际化等），直接修改官方源码会导致后续升级时 git merge 产生海量冲突。NSM 的策略是：

保持工作区为纯净的官方版本，通过工具精确还原登记过的自定义修改。

```text
nsm/
├── bin/index.js              # CLI 入口 (shebang 脚本)
├── nsm.config.mjs            # 用户配置：登记所有被修改的文件 (70+个)
├── types.ts                  # Zod schema 配置校验
├── src/
│   ├── cli.ts                # CLI 命令定义 (基于 cac)
│   ├── global-config.ts      # DI 单例，全局路径与配置管理
│   ├── n8n-source-manager.ts # 核心逻辑 (732行)，init/save/restore
│   ├── task-scheduler.ts     # 并发任务调度器 (重试/超时/进度)
│   └── utils.ts              # 日志与路径工具
└── .modified/                # 自定义修改的镜像备份目录
```

三个核心命令
- nsm init — 从 GitHub Raw URL 下载指定版本的官方源文件，计算 SHA-256 哈希并缓存。用于建立版本基线。

- nsm save — 将工作区中的自定义修改备份到 .modified/ 目录。支持增量/全量/过滤三种模式，增量模式为默认（只保存有实际变化的整份文件）。

- nsm restore — 将 .modified/ 中的备份还原到工作区。通过对比 previousVersion 和 currentVersion 的官方哈希来检测冲突，冲突文件自动跳过并支持 VSCode Diff 一键对比。

典型升级工作流

```text
1. 修改 nsm.config.mjs 中的版本号
2. pnpm nsm init              # 下载新版本官方文件哈希
3. git checkout <tag> -- .     # 用官方新版覆盖工作区
4. pnpm nsm restore           # 还原自定义修改 (跳过冲突)
5. 手动处理冲突文件 (借助 VSCode Diff)
6. pnpm nsm save --all        # 更新备份
7. 提交代码
```

关键设计决策

- 用 git checkout 替代 git merge 升级 — 先覆盖为纯净官方版，再精准贴回修改，避免海量合并冲突

- 基于 GitHub Raw URL 按需下载 — 不需要维护完整的官方 git 历史

- SHA-256 内容哈希做冲突检测 — 两个版本的官方哈希不同 = 官方也改了该文件 = 需人工介入

- .modified/ 镜像工作区路径结构 — 直觉化，路径一一对应

- 冲突文件不强制覆盖 — 安全优先，防止丢失官方重要更新

- 并发调度器 + 指数退避重试 — 高效下载，容错性强

技术栈
cac(CLI) / chalk(终端着色) / diff(差异计算) / fs-extra(文件操作) / ora(spinner) / prompts(交互式输入) / zod(校验) / @n8n/di(DI) / tsdown(构建)

本质上，NSM 实现了一套轻量级的文件级 patch 管理机制，是对 n8n 二次开发维护流程的一个工程化解决方案。作为实习生独立完成这样一个有明确问题域、清晰架构设计和完整实现的工具，体现了对实际工程问题的深入思考。


## NSM 设计思路深度分析

### 1. 问题建模：为什么不用 git merge？

二次开发 n8n 的根本矛盾是：

```
官方仓库（上游）                 你的仓库（下游）
  v1.123.10                       v1.123.10 + 70 个定制文件
       │                                │
       ▼                                ▼
  v2.6.1 (上游改了数千个文件)      需要升级到 v2.6.1，同时保留 70 个定制
```

直接 `git merge` 的问题：上游一次大版本升级可能涉及数千个文件变更，与你的 70 个定制文件产生大量冲突。而且很多冲突是"假冲突"——官方根本没改过你修改的那个文件，纯粹是 merge 算法把不相关的上下文变化也标为冲突。

NSM 的建模思路是：**把问题从"两棵树的合并"简化为"70 个文件的点对点比对"**。只关心你改过的那 70 个文件，忽略其他数千个文件。

### 2. 核心抽象：三个空间 + 两个版本

整个系统围绕 **三个文件空间** 和 **两个版本快照** 运转：

```
┌─────────────────────────────────────────────────────────┐
│                    三个文件空间                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ① 工作区 (rootPath)                                    │
│     n8n 项目根目录，当前实际运行的代码                      │
│     由 resolveOriginFilePath() 解析                      │
│                                                         │
│  ② 备份区 (.modified/)                                   │
│     定制修改的镜像副本，路径结构与工作区一一对应              │
│     由 resolveSourceFilePath() 解析                      │
│     提交到 git，是定制修改的"单一真相源"                    │
│                                                         │
│  ③ 哈希区 (node_modules/.nsm/)                          │
│     官方源码的 SHA-256 指纹缓存                            │
│     hash_v1.123.10.json / hash_v2.6.1.json              │
│     不提交到 git（在 node_modules 下）                     │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                    两个版本快照                            │
├─────────────────────────────────────────────────────────┤
│  previousVersion: '1.123.10'  ← 升级前的 n8n 版本        │
│  currentVersion:  '2.6.1'     ← 升级后的 n8n 版本        │
│                                                         │
│  每个版本对应一个 hash JSON:                               │
│  { "packages/cli/src/server.ts": "a3f2b1...", ... }     │
│  记录该版本下官方源码的原始内容指纹                          │
└─────────────────────────────────────────────────────────┘
```

`GlobalConfig` (`global-config.ts:39-42`) 通过 `__dirname` 向上推算出这些路径，并用 `@n8n/di` 的 `@Service()` 注册为 DI 单例，所有方法共享同一份配置。

### 3. 配置即清单：nsm.config.mjs

[`nsm.config.mjs`](/Users/jixiang/Desktop/n8n/packages/@custom/nsm/nsm.config.mjs) 是整个系统的数据源头。每个条目包含：

```typescript
{
  path: 'packages/cli/src/server.ts',   // 相对于项目根的路径
  description: 'uuap接入',              // 人类可读的修改说明
  type: 'update',                        // update=修改官方文件, create=新增文件
}
```

`type` 字段是一个关键设计：
- **`update`**：你修改了官方已有的文件。restore 时需要做冲突检测（官方可能也改了这个文件）
- **`create`**：你新增的文件（如 `uuap.service.ts`、`redis-rate-limiter.ts`）。restore 时无需冲突检测，直接创建即可

Zod schema ([`types.ts`](/Users/jixiang/Desktop/n8n/packages/@custom/nsm/types.ts)) 在启动时就校验配置合法性，把错误拦在运行前。

---

## 三条数据链路详解

### 链路一：`nsm init` — 建立版本基线

**目标**：为 previousVersion 和 currentVersion 各生成一份官方源码的 SHA-256 哈希表。

```
nsm.config.mjs                GitHub Raw URL
    │                              │
    │ changedFiles[70个]           │
    ▼                              ▼
遍历每个文件 ──────────────► https://raw.githubusercontent.com/
    │                         n8n-io/n8n/n8n@{version}/{path}
    │                              │
    │                         fetch() 下载文件内容
    │                              │
    │                         SHA-256(content)
    │                              │
    ▼                              ▼
TaskScheduler                 { path: hash }
(10 并发, 3 次重试,               │
 指数退避 1s/2s/4s)               │
    │                              │
    ▼                              ▼
node_modules/.nsm/hash_v2.6.1.json
```

**关键细节**（`n8n-source-manager.ts:181-230`）：

1. **增量下载**：`filesToDownload = changedFiles.filter(f => !existingHashes[f.path])`，已有哈希的文件不重复下载
2. **双层成功判断**：`r.success`（任务未抛异常） && `r.data.success`（HTTP 200），因为有些文件在旧版本可能不存在（404），这不应该中断整个流程
3. **合并写入**：下载结果与已有哈希 merge 后一次性写入 JSON，支持断点续传式的增量初始化

**TaskScheduler**（[`task-scheduler.ts`](/Users/jixiang/Desktop/n8n/packages/@custom/nsm/src/task-scheduler.ts)）的设计：
- Worker 池模式（不是 `Promise.all`）：启动 N 个 worker 循环消费任务队列，某个 worker 完成后立即取下一个任务，确保始终有 N 个并发在跑
- 超时不重试（`TimeoutError` 直接 throw），网络错误重试（指数退避 `delay * 2^(attempt-1)`）
- 结果数组按原始 index 排列，保持顺序

### 链路二：`nsm save` — 保存定制修改

**目标**：将工作区中的定制文件复制到 `.modified/` 备份区。

```
三种模式选择:
  ┌─ default (增量) ─► 比较工作区与.modified的SHA-256，只保存有差异的
  │
  ├─ all (全量) ────► 直接保存 changedFiles 中所有文件
  │
  └─ filter (过滤) ─► 正则/关键词匹配路径，且自动注册新文件到 nsm.config.mjs
         │
         ▼
    executeSave(files)
         │
         ▼
    对每个文件: 工作区/{path} ──copy──► .modified/{path}
```

**增量保存的数据流**（`loadIncreChangedFiles`, 行 273-298）：

```
对每个 changedFile:
    │
    ├─ 工作区文件不存在? → 跳过
    │
    ├─ .modified 备份不存在? → 加入保存列表（新文件）
    │
    └─ 两者都存在?
         │
         SHA-256(工作区内容) === SHA-256(备份内容)?
              │                    │
              是 → 跳过             否 → 加入保存列表
```

**filter 模式的自动注册**（`addFileToConfig`, 行 312-353）是一个有意思的设计：当你新增了一个定制文件，`nsm save --filter packages/cli/src/xxx.ts --description "xxx"` 会：
1. 用正则检查 [`nsm.config.mjs`](/Users/jixiang/Desktop/n8n/packages/@custom/nsm/nsm.config.mjs) 中是否已存在该路径
2. 找到 `changedFiles: [` 的位置，在数组开头插入新条目
3. 同步更新内存中的 `userConfig.changedFiles`（避免需要重新加载配置）

这里直接操作配置文件文本而非 AST，是一个务实的选择——对于结构固定的 config 文件，正则足够可靠且实现简单。

### 链路三：`nsm restore` — 还原定制修改（最复杂）

**目标**：将 `.modified/` 中的备份还原到工作区，同时检测官方版本升级引入的冲突。

这是 NSM 最核心的链路，完整的数据流如下：

```
                    nsm restore
                        │
            ┌───────────┴───────────┐
            ▼                       ▼
    hash_v1.123.10.json      hash_v2.6.1.json
    (previousVersion)        (currentVersion)
            │                       │
            └───────┬───────────────┘
                    ▼
         previewRestore() — 逐文件判定状态
                    │
    对每个 changedFile:
    ┌───────────────┴────────────────────────┐
    │                                        │
    │  type === 'create'?                    │  type === 'update'
    │       │                                │       │
    │  工作区存在?                             │  previousHash === currentHash?
    │   │        │                           │       │              │
    │  否→'new'  是→比对内容                   │      是              否
    │           →'modified'/'unchanged'      │       │              │
    │                                        │  比对内容          → 'conflict'
    │                                        │  工作区存在?
    │                                        │   │        │
    │                                        │  否→'new'  是→'modified'/'unchanged'
    └────────────────────────────────────────┘
                    │
                    ▼
         printDiffSummary() — 终端彩色输出
                    │
         ┌──────── ▼ ────────┐
         │   用户交互选择      │
         ├───────────────────┤
         │  Yes → executeRestore()
         │        ├─ conflict → 跳过，人工处理
         │        └─ 其他 → .modified/{path} ──copy──► 工作区/{path}
         │
         │  Diff → code --diff 工作区文件 .modified文件
         │         查看完后递归调用 restore() 重新进入交互
         │
         │  No → 取消
         └───────────────────┘
```

**冲突检测的核心逻辑**（`previewRestore`, 行 462-479）：

```typescript
const currentHash = currentHashJSON[item.path];   // v2.6.1 版官方源码哈希
const previousHash = previousHashJSON[item.path]; // v1.123.10 版官方源码哈希

if (currentHash !== previousHash) {
    // 官方在两个版本间也修改了这个文件
    // 你的定制修改可能基于旧版代码，直接覆盖会丢失官方的更新
    status = 'conflict';
}
```

这是整个系统最精妙的设计点：**不需要三方合并算法，仅通过两个版本的哈希比较就能判断是否冲突**。逻辑是：
- 哈希相同 = 官方没改过这个文件 = 你的修改可以安全覆盖
- 哈希不同 = 官方也改了这个文件 = 需要人工判断如何合并

**Diff 交互**（行 580-617）：选择 Diff 后进入子菜单，可以选择查看全部或单个文件差异，VSCode `code --diff` 以 detached 进程启动（`child.unref()`），不阻塞 CLI。查看完后递归调用 `this.restore()` 重新进入主交互循环。

---

## 设计取舍分析

| 决策 | 选了什么 | 放弃了什么 | 原因 |
|------|---------|-----------|------|
| 冲突检测粒度 | 文件级哈希比对 | 行级三方合并 | 70 个文件场景下文件级足够，三方合并实现成本高且容易产生误合并 |
| 哈希来源 | GitHub Raw URL 远程下载 | 本地 git history | 不依赖本地保留完整的上游 git 历史，fork 仓库可能只有自己的提交 |
| 备份存储 | `.modified/` 目录镜像 | 数据库/patch 文件 | 直接可读可编辑，路径一一对应，可以直接用 diff 工具查看 |
| 哈希缓存位置 | `node_modules/.nsm/` | 项目内其他目录 | 天然被 `.gitignore` 排除，不污染仓库；`npm install` 时自动清理 |
| 配置文件操作 | 正则文本插入 | AST 解析 | 配置结构固定，正则够用且零依赖 |
| 并发模型 | Worker 池 + 手动调度 | `Promise.all` / `p-limit` | 需要进度回调、重试、超时等细粒度控制，第三方库不完全满足 |