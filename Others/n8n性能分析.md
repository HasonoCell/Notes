n8n 前端性能瓶颈分析与优化

## 背景
管理员账号下 `projects` 接口返回 5000+ 条数据，`users` 接口全量拉取所有用户，导致进出工作流时页面长时间卡顿。经过对 API 层、Store 层、组件层、布局架构层四个维度的完整审查，发现性能瓶颈在各层之间形成了**级联放大效应**——布局层的销毁重建触发了组件层的 computed 重算，组件层的 mount 触发了 Store 层的重复请求，Store 层的全量写入源于 API 层的无分页设计。

### n8n 原始设计背景
n8n 最初为单用户/小团队自托管工具设计（项目和用户数在几十到几百量级），全量数据拉取模式的设计动机：

* **客户端搜索/过滤** — 下拉组件中的实时文本搜索需要全量数据在前端执行，避免每次按键都请求后端
* **跨组件共享** — 侧边栏、弹窗、筛选器等多处需要同一份数据，统一存储在 Pinia Store 中
* **权限计算** — 需要遍历所有项目/用户来判断共享关系和角色
* **简化架构** — 不需要处理分页状态、loading 态、翻页交互等复杂逻辑

这种架构在小规模下运行良好，但**未针对企业级规模（5000+ 项目、500+ 用户）做预案**。

### 问题全景：管理员进出工作流的完整请求链路
```
进入工作流（从列表页 → 编辑器）：
──────────────────────────────────────────────────────
AppLayout.vue
  └── v-if 检测 layout 变化: undefined → 'workflow'
       └── 销毁 DefaultLayout → 重建 WorkflowLayout（无 KeepAlive）
            └── 整棵组件树销毁 + 重建（100+ 组件）

重建过程中触发的连锁反应：
  ├── ProjectNavigation.vue onBeforeMount
  │    ├── usersStore.fetchUsers()         → 全量拉取 users (take:-1) [无缓存]
  │    └── useGlobalEntityCreation() 实例化
  │         └── displayProjects computed   → filter + sort 5000 项目 = O(n log n)
  │         └── menu computed              → map × 2 = O(n) × 2
  ├── MainSidebarHeader.vue
  │    └── useGlobalEntityCreation() 又一个实例
  │         └── 同上，开销翻倍
  ├── NodeView.vue onMounted
  │    ├── initializeData()               → fetchActiveWorkflows + fetchCredentialTypes + ...
  │    └── initializeRoute()（串行等待 initializeData 完成）
  │         └── fetchWorkflow()            → 加载具体工作流
  └── projects.store watch(route)         → 修改 projectNavActiveId 触发级联重算

退出工作流（从编辑器 → 列表页）：
──────────────────────────────────────────────────────
  └── v-if 检测 layout 变化: 'workflow' → undefined
       └── 销毁 WorkflowLayout → 重建 DefaultLayout（同样无 KeepAlive）
            └── 重复上述全部连锁反应
```
---

## 一、布局架构层
### 1.1 设计背景
n8n 前端使用 `AppLayout.vue` 作为顶层布局容器，通过 `route.meta.layout` 动态切换不同的 Layout 组件。每种页面类型对应一个 Layout：

* 工作流列表页 → `DefaultLayout`（`meta.layout = undefined`）：仅包含侧边栏 + 内容区
* 工作流编辑器 → `WorkflowLayout`（`meta.layout = 'workflow'`）：包含顶部 Header + 侧边栏 + 内容区 + 底部日志面板

**关键：两个 Layout 的 sidebar 完全相同**，都渲染 `AppSidebar → MainSidebar → ProjectNavigation`。

### 1.2 瓶颈分析
原始代码使用 `v-if / v-else-if` 链切换 Layout，无 `<KeepAlive>` 包裹：

```html
<Suspense>
    <SettingsLayout v-if="route.meta.layout === 'settings'" />
    <WorkflowLayout v-else-if="route.meta.layout === 'workflow'" />
    <DefaultLayout v-else />
</Suspense>
```
每次路由切换导致 layout 类型变化时，Vue 会**完全销毁**旧 Layout 及其所有子组件，再**从零创建**新 Layout 及其所有子组件。这意味着：

* **进入工作流**：销毁 `DefaultLayout`（含 AppSidebar、ProjectNavigation 等）→ 重建 `WorkflowLayout`（含全新的 AppSidebar、ProjectNavigation 等）
* **退出工作流**：销毁 `WorkflowLayout` → 重建 `DefaultLayout`

尽管 `WorkflowLayout` 内部对 NodeView 使用了 `<KeepAlive include="NodeView" :max="1">`，但 Layout 本身被销毁时，**内部的 KeepAlive 缓存也一并失效**。

**量化影响**：每次进出工作流触发 100+ 组件的销毁重建，包括所有 Pinia store 的 composable 重新实例化、所有 computed 属性重新求值、所有 DOM 节点重新创建。这是所有后续层级问题的**触发源和放大器**。

### 1.3 可实施的解决措施
从布局层的根因看，真正的问题不是某个组件计算慢，而是**公共重子树随着 Layout 一起被反复销毁重建**。因此有两类方案：

#### 方案 A：在 `AppLayout.vue` 外层包裹 `<KeepAlive>`

```html
<Suspense>
    <KeepAlive>
        <SettingsLayout v-if="route.meta.layout === 'settings'" />
        <WorkflowLayout v-else-if="route.meta.layout === 'workflow'" />
        <DefaultLayout v-else />
    </KeepAlive>
</Suspense>
```

**效果**：Layout 切换从"销毁 + 重建"变为"冻结 + 恢复"。侧边栏实例被保留，所有 computed 缓存命中，零 DOM 重建。理论收益最大。

**问题**：

* KeepAlive 下组件不再走 `onMounted / onUnmounted`，而是走 `onActivated / onDeactivated`。
* 需要持续审计被缓存子树中的副作用清理逻辑，后续官方版本如果继续新增基于 mounted / unmounted 的逻辑，存在兼容性与升级漂移风险。
* 形成双层 KeepAlive（外层缓存 Layout，内层缓存 NodeView）后，运行时语义会更复杂，维护成本上升。

#### 方案 B：提取共享 Sidebar Shell（更推荐的保守方案）

由于 `DefaultLayout` 与 `WorkflowLayout` 的 sidebar 完全相同，可以把公共的 `AppSidebar -> MainSidebar -> ProjectNavigation` 从 Layout 切换树中提出来，变成持久存在的 shell，而让 `DefaultLayout` / `WorkflowLayout` 仅负责各自差异区域（顶部 Header、主内容区、日志面板等）。

```html
<div class="app-shell">
    <AppSidebar />
    <Suspense>
        <SettingsLayout v-if="route.meta.layout === 'settings'" />
        <WorkflowLayout v-else-if="route.meta.layout === 'workflow'" />
        <DefaultLayout v-else />
    </Suspense>
</div>
```

**效果**：

* 共享 sidebar 子树不再参与路由切换时的销毁重建。
* `ProjectNavigation`、`MainSidebarHeader`、`useGlobalEntityCreation` 等高频重组件不再反复 mount。
* 不引入 KeepAlive 的生命周期语义变化，升级时不需要额外审计 `onActivated / onDeactivated` 适配。

**边界**：

* 该方案只能保住共享 sidebar 这一大块重子树，不能像 KeepAlive 一样保留整个 `WorkflowLayout` 或 `NodeView` 的实例状态。
* 因此它更像是"低漂移的架构减震"，需要配合 Store 缓存、虚拟滚动、批量写入优化一起使用。

**结论**：如果目标是在尽量不改动官方生命周期语义的前提下，降低路由切换带来的根因级重建成本，那么"提取共享 Sidebar Shell"是比 KeepAlive 更保守、更适合长期跟进官方升级的方案。

---

## 二、API 层
### 2.1 设计背景
n8n 的协作功能（分享工作流/凭证、项目成员管理、资源移动等）要求前端持有完整的项目和用户列表，以支持下拉选择器中的即时客户端搜索。这一需求导致了全量拉取的 API 设计。

### 2.2 瓶颈分析
#### Projects API — 后端完全无分页支持
**文件**: `src/features/collaboration/projects/projects.api.ts`

```tsx
getAllProjects()     // GET /projects            → 全量返回，无任何分页参数
getMyProjects()     // GET /projects/my-projects → 全量返回
```
**后端不支持分页、搜索、筛选**，前端无法通过传参来限制返回数量。

#### Users API — 后端支持分页但前端绕过
**文件**: `src/features/settings/users/users.store.ts`

后端 `UsersListFilterDto` 已支持丰富的查询能力：

* 分页：`take`（默认 10，最大 50，`-1` 表示不限）、`skip`
* 筛选：`filter` JSON 参数，支持 `firstName`、`lastName`、`email`、`fullText`、`isOwner`、`mfaEnabled`
* 字段选择：`select` 参数，可指定返回字段
* 排序：`sortBy` 参数

但 `fetchUsers()` 硬编码 `take: -1` 绕过了分页：

```tsx
const fetchUsers = async () => {
    const { items } = await usersApi.getUsers(rootStore.restApiContext, {
        take: -1,  // -1 使后端跳过 LIMIT，返回全部用户
        skip: 0,
    });
    addUsers(items);
};
```
> **注意**: 管理员用户管理页面 `SettingsUsersView` 已正确使用分页（`usersList.execute()`），但**其他所有场景**仍通过 `fetchUsers()` 全量拉取。
---

## 三、Store 层
### 3.1 设计背景
n8n 使用 Pinia（Vue 3 的状态管理库）的 Setup Store 模式管理全局状态。各 Store 中的 `ref` 持有响应式数据，`computed` 派生计算属性，组件通过直接访问 Store 来获取数据。在小规模下，这种模式的开销可以忽略。

### 3.2 瓶颈分析
#### 3.2.1 无缓存的重复请求
`fetchUsers()` 无任何缓存/去重逻辑，以下组件各自在 mount 时独立调用，每次都发起全量请求（单次 2-3 秒）：

* `ProjectNavigation.vue` — `onBeforeMount(() => usersStore.fetchUsers())`
* `ProjectSettings.vue` — `onBeforeMount(() => usersStore.fetchUsers())`
* `CredentialSharing.ee.vue` — `onMounted(() => usersStore.fetchUsers())`
* `WorkflowShareModal.ee.vue` — `onMounted(() => usersStore.fetchUsers())`
* `WorkflowsView.vue` — `initialize() => usersStore.fetchUsers()`

`getAllProjects()` / `getMyProjects()` 同样被多处调用（`ResourceFiltersDropdown`、`WorkflowsView`、`NodeView`、`ProjectMoveResourceModal` 等），无缓存。

`fetchActiveWorkflows()` 在进出工作流的过程中被调用 3 次，同样无缓存。

`fetchCredentialTypes(true)` 在 `NodeView.vue` 中硬编码 `force=true`，跳过已有缓存强制刷新。

**量化影响**：一个完整的进出工作流周期产生约 14 次 API 请求（users × 5、projects-all × 3、projects-my × 2、activeWorkflows × 3、credentialTypes × 1）。

#### 3.2.2 O(n^2) 的批量更新模式
**Tags Store** — `src/features/shared/tags/tags.store.ts:50-70`

```tsx
const upsertTags = (toUpsertTags: ITag[]) => {
    toUpsertTags.forEach((toUpsertTag) => {       // m 次迭代
        tagsById.value = {
            ...tagsById.value,                     // 每次展开 n 个 key → O(n)
            [tagId]: newTag,
        };                                         // 每次赋值触发 Vue 响应式更新
    });
};
```
每次循环迭代都重建整个 `tagsById` 对象，m 个 tag 更新导致总复杂度 O(m*n)，且每次赋值触发一次 Vue 响应式更新造成级联重渲染。

**Workflows Store** — `src/app/stores/workflows.store.ts:680-693, 912-920`

```tsx
data.forEach((item) => {
    addWorkflow({ ...item, nodes: [], connections: {} });
    // addWorkflow 内部：
    workflowsById.value = {
        ...workflowsById.value,      // 展开全部 w 个 workflow → O(w)
        [workflow.id]: {
            ...workflowsById.value[workflow.id],
            ...deepCopy(workflow),    // 额外 deepCopy 开销
        },
    };
});
```
每页 p 个 workflow，已有 w 个存量，复杂度 O(p*w)，且 `deepCopy` 增加额外序列化开销。

**Credentials Store** — `src/features/credentials/credentials.store.ts:64-92`

```tsx
const allCredentialsByType = computed(() => {
    return types.reduce((accu, type) => {
        accu[type.name] = credentials.filter(cred => cred.type === type.name);
        return accu;
    }, {});
});
```
T 个凭证类型 × C 个凭证 = O(T*C)。应改为对 credentials 做一次 `groupBy` 操作，O(C) 即可。

**Workflows Store 执行记录去重** — `src/app/stores/workflows.store.ts:1820-1827`

```tsx
function addToCurrentExecutions(executions: ExecutionSummary[]): void {
    executions.forEach((execution) => {
        const exists = currentWorkflowExecutions.value.find(
            (ex) => ex.id === execution.id    // 线性扫描 O(n)
        );
        if (!exists) currentWorkflowExecutions.value.push(execution);
    });
}
```
应使用 `Set<string>` 存储已有 ID，将去重从 O(m*n) 降到 O(m+n)。

> **已有好实践**: `users.store.ts` 的 `addUsers` 已修复为"循环外构建临时对象 + 一次性赋值"的 O(m+n) 模式，可作为以上问题的修复模板。
### 3.3 可实施的解决措施
#### 三级缓存机制
在 `fetchUsers`、`getAllProjects`、`getMyProjects`、`fetchActiveWorkflows` 四个函数中统一实现三级缓存：

```tsx
const fetchUsers = async (force = false) => {
    // 第一级：loaded flag — 数据已加载，直接返回
    if (!force && usersLoaded.value) return;
    // 第二级：pending Promise — 请求进行中，复用同一个 Promise（请求去重）
    if (pendingFetchUsersRequest.value) {
        await pendingFetchUsersRequest.value;
        return;
    }
    // 第三级：发起新请求
    const request = usersApi.getUsers(...)
        .then(({ items }) => {
            addUsers(items);
            usersLoaded.value = true;
            pendingFetchUsersRequest.value = undefined;
        });
    pendingFetchUsersRequest.value = request;
    await request;
};
```
**量化效果**：完整进出工作流周期从 14 次 API 请求降到 4 次（冷启动）或 0 次（缓存命中），**减少 71%**。

---

## 四、组件层
### 4.1 设计背景
n8n 的前端组件大量使用 Vue computed 属性对 Store 数据做派生计算（filter、sort、map、find），并通过 `v-for` 指令将结果渲染为 DOM。在小规模下，这些操作的开销微乎其微。但当数据量达到 5000+ 时，每个 O(n) 操作都变成了可感知的延迟，且多个 computed 之间的依赖关系形成级联重算链。

### 4.2 瓶颈分析
#### 4.2.1 `useGlobalEntityCreation` composable — 最大的响应式热点
**文件**: `src/app/composables/useGlobalEntityCreation.ts:60-185`

此 composable 在 `ProjectNavigation.vue` 和 `MainSidebarHeader.vue` 中**各实例化一份**，内部包含两个开销密集的 computed：

```tsx
// displayProjects: filter + sort = O(n log n)
const displayProjects = computed(() =>
    sortByProperty('name',
        projectsStore.myProjects.filter(p => p.type === 'team')
    )
);

// menu: 将 displayProjects map 两遍生成子菜单 = O(n) × 2
submenu: [
    ...displayProjects.value.map(project => ({/* workflow 子菜单项 */})),
    ...displayProjects.value.map(project => ({/* credential 子菜单项 */})),
]
```
**量化影响**：5000 项目 → 每个实例执行 1 次 filter + 1 次 sort + 2 次 map。两个实例 = **~8 次 O(n) 遍历**，且在每次 `myProjects` 变化时全部重算。若 team 项目有 N 个，`menu` computed 生成 2N 个子菜单对象。

#### 4.2.2 `ProjectNavigation.vue` — 为一个 boolean 遍历全量用户
**文件**: `src/features/collaboration/projects/components/ProjectNavigation.vue:38-40, 106-108`

```tsx
// 遍历全量用户只为得到一个 boolean
const hasMultipleVerifiedUsers = computed(
    () => usersStore.allUsers.filter(user => !user.isPendingUser).length > 1
);
```
其中 `allUsers` 本身是 `Object.values(usersById)` = O(n)，再 `.filter()` = O(n)。

这个 boolean 用于控制 "Shared with me" 导航项的显隐——如果系统里只有一个已激活用户，则隐藏此导航项。此外，该组件在 `onBeforeMount` 中调用 `usersStore.fetchUsers()` 来确保数据可用。

**量化影响**：每次组件重建时，500 用户 × 2 次 O(n) 遍历。

#### 4.2.3 侧边栏全量 DOM 渲染（无虚拟滚动）
**文件**: `src/features/collaboration/projects/components/ProjectNavigation.vue:166-176`

```html
<N8nMenuItem
    v-for="project in displayProjects"
    :key="project.id"
    :item="getProjectMenuItem(project)"
    :compact="props.collapsed"
    :active="activeTabId === project.id"
/>
```
所有 team 类型项目逐个渲染为 `N8nMenuItem` 组件，无虚拟滚动、无分页。如果 team 项目有上千个，则创建上千个组件实例和 DOM 节点。

#### 4.2.4 `ProjectSharing.vue` — 核心下拉选择器
**文件**: `src/features/collaboration/projects/components/ProjectSharing.vue`

```html
<N8nOption v-for="project in sortedProjects" :key="project.id" :value="project.id" />
```
5000+ 个 `N8nOption` 组件全部挂载到 DOM，无虚拟滚动。搜索过滤无 debounce，每次按键触发全量 `.filter()` + `orderBy` 排序。

#### 4.3 可实施和建议的解决措施
**可通过布局层优化间接缓解**：

* 如果接受生命周期语义变化，`KeepAlive` 可以直接消除组件销毁重建，使上述 computed 在路由切换时保持缓存命中。
* 如果不希望引入 KeepAlive 的升级兼容风险，则可优先采用"提取共享 Sidebar Shell"，至少让 `ProjectNavigation`、`MainSidebarHeader`、`useGlobalEntityCreation` 这类热点组件不再反复重建。

**组件层仍需独立优化**：即使布局层减少了重建，首次渲染时 `ProjectNavigation` 与 `ProjectSharing` 的大量 DOM 创建、全量 filter / sort / map 计算依然存在，因此虚拟滚动与 computed 优化仍然必要。

---

## 五、各层优化关系与优先级
### 层级关系
```
布局架构层（共享 Shell / KeepAlive）= 尽量减少公共重子树的销毁重建
    ↓ 即使仍触发（如首次加载或非共享区域）
Store 层（三级缓存）= 兜底，避免重复请求
    ↓ 即使请求发生
  API 层
    ↓ 即使数据量大
组件层（虚拟滚动 / computed 优化）= 限制实际渲染和计算量
```
### 优先级
##### 一，提取共享 Sidebar Shell（推荐）

原因：可以在不引入 KeepAlive 生命周期语义变化的前提下，把 `AppSidebar -> MainSidebar -> ProjectNavigation` 这棵最重的公共子树从 Layout 切换树中拆出来，显著减少进出工作流时的重复 mount / unmount，同时和后续官方升级的冲突面最小。

##### 二，Store 三级缓存
主要是解决组件重渲时 Store 多次重复请求数据的问题。

**三级缓存的缓存一致性风险与控制策略**

三级缓存（`loaded flag + pending Promise + force refresh`）本质上是前端内存缓存，与后端常见的 `Redis + DB` 模式类似：`Pinia Store` 是缓存层，后端接口是真实数据源，`pending Promise` 相当于 singleflight / 请求合并。它的最大收益是减少重复请求，但代价是必须接受"缓存命中时返回的可能是旧数据"这一事实。

当前方案的风险主要是**数据陈旧**：

* **本地已加载的数据长期不失效** — `usersLoaded`、`projectsLoaded`、`myProjectsLoaded`、`activeWorkflowsLoaded` 一旦置为 `true`，后续读取将直接命中缓存。如果数据被其他标签页、其他用户或后台任务修改，当前页面不会自动感知。
* **动态状态比静态列表更容易过期** — `users`、`projects` 更偏向低频变更数据，允许短时间旧值；`activeWorkflows` 属于动态状态，缓存时间过长更容易导致 UI 状态滞后。
* **写后如果不 patch / force refresh，会出现局部不一致** — 例如修改用户角色、项目名称、项目成员、删除项目后，如果只更新后端而不更新本地 Store，缓存会继续返回旧值。
* **切换账号/退出登录时如果不清缓存，存在跨会话残留风险** — 前端内存缓存会跟随页面生命周期存在，而不是跟随后端 session 自动失效。

因此，前端缓存一致性不应该追求"绝对实时一致"，而应该按数据类型选择合适策略。一种可能的构想是：

* **低频列表数据（users / projects）** — 采用"缓存 + Promise 复用 + 写后 patch / force refresh"。性能收益高，短时间旧值风险可接受。
* **动态状态数据（activeWorkflows）** — 更适合"Promise 复用 + 短 TTL / 关键时机强制刷新"，不宜长期只依赖 loaded flag。
* **复杂变更场景** — 当本地难以准确 patch 全量缓存时，优先使用 `force=true` 重新拉取，而不是手动猜测所有受影响字段。
* **会话边界** — 在 logout、切换账号、权限显著变化后，应显式清理相关 loaded flag 与缓存对象。

推荐的实践原则是：

1. **本地发起的写操作优先同步 patch 本地缓存**，如项目创建、重命名、删除。
2. **影响范围较大的写操作直接 force refresh**，如角色变更、权限变化。
3. **跨页面/跨标签页/外部来源的修改通过失效策略兜底**，如 TTL、页面 focus 时重拉、关键路由进入时重拉。
4. **不要把三级缓存用于强实时数据**，否则会把性能问题转化为状态一致性问题。

三级缓存是解决重复请求问题的高性价比方案，但它本质上是用"弱一致性"换性能。只要配套补齐写后同步、关键时机失效和会话边界清理，这种风险是可控且工程上可以接受的。

##### 三，AppLayout 加 KeepAlive（备选）

KeepAlive 仍然是理论收益最大的方案，但当前阶段更适合作为备选而不是优先方案。原因在于它会改变组件生命周期语义，需要持续审计 `mounted / unmounted` 与 `activated / deactivated` 的适配关系，并且在跟进官方版本时存在更高的维护成本和漂移风险。

##### 四，优化更新算法


ƒ
**可执行改造清单**：

1. **优先改 `workflows.store.ts` 的批量写入路径**
   当前 `fetchWorkflowsPage()` 中对每条数据调用一次 `addWorkflow()`，而 `addWorkflow()` 每次都会展开整个 `workflowsById` 并做一次 `deepCopy`，形成 O(p*w) 的批量写入成本。更合适的做法是：
   * 在循环外先基于 `workflowsById.value` 构建一个临时对象；
   * 循环中只更新临时对象的对应 key；
   * 循环结束后一次性赋值回 `workflowsById.value`；
   * 仅在确实需要隔离引用的字段上做最小化拷贝，避免对整个 workflow 反复 `deepCopy`。

   这样可以把"每条数据触发一次响应式写入"改成"整批数据只触发一次响应式写入"，本质上是从 O(p*w) 收敛到更接近 O(p+w)。

2. **把 `credentials.store.ts` 的 `allCredentialsByType` 改成单次分组**
   当前做法是 `types.reduce + credentials.filter`，每个类型都全量扫一遍凭证，复杂度 O(T*C)。更适合改成：
   * 先遍历一次 `credentials`，按 `credential.type` 放入分组对象；
   * 再按需要读取对应类型数组；
   * 如果某些类型没有凭证，返回空数组即可。

   这可以把热点 computed 从 O(T*C) 降到 O(C)，对于凭证类型和凭证数量同时增长的场景更稳。

3. **把执行记录去重从线性查找改成 `Set`**
   `addToCurrentExecutions()` 当前对每条 execution 都要在数组里 `find()` 一次，属于典型的 O(m*n)。更适合在函数内先构建已有 ID 的 `Set<string>`，再遍历新增 execution：
   * 已存在则跳过；
   * 不存在则 push，并同步写入 `Set`。

   这样复杂度可以降到 O(m+n)，并且逻辑更清晰。

4. **把 Tags / Users 里已经验证过的"一次性合并"模式复用到其他 Store**
   `users.store.ts` 的 `addUsers` 已经证明："循环外构建 next 对象 + 最后一次性赋值"是更适合 Vue 响应式系统的大数据更新模式。后续可以统一审查以下特征的代码：
   * `forEach` / `map` 循环里反复 `state.value = { ...state.value, ... }`
   * 循环里反复 `filter`、`find`、`deepCopy`
   * 每次迭代都导致一轮响应式通知

   这类代码通常都值得改成"批量构建、单次提交"。

5. **把组件中的派生计算前移到 Store 或共享 computed**
   例如 `useGlobalEntityCreation` 在多个组件中各自实例化，导致 `filter + sort + map` 成本翻倍。如果这部分逻辑在多个地方复用且依赖同一份 Store 数据，可以考虑：
   * 提取成 Store 内共享 computed；
   * 或者在 composable 内增加更稳定的中间结果（如预先筛出 team projects）；
   * 避免同一批 5000+ 数据在多个组件实例里重复做同样的派生计算。

   这类优化和布局层优化并不冲突：布局层负责减少"被迫重算"的次数，更新算法负责降低"每次重算本身"的成本。
   
