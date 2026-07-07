---
id: persistence-yjs-bridge
title: 持久化层（Yjs / IndexedDB / 撤销 / 导入导出）
status: sediment
phase: implemented           # P2-1: Yjs 持久化契约已实施
layer: L3-implementation
scope:
  global: false
  modules: [src/persistence]
  files:
    - src/persistence/yjs-store.js
    - src/persistence/thought-bridge.js
    - src/persistence/edge-bridge.js
    - src/persistence/zone-bridge.js
    - src/persistence/crystal-bridge.js
    - src/persistence/action-bridge.js
    - src/persistence/undo-manager.js
    - src/persistence/exporter.js
    - src/persistence/importer.js
    - src/persistence/integrity.js
  lines: []
priority: 80
created: 2026-07-07
updated: 2026-07-07
inherits-from:
  - topological-awareness-space
  - core-data-model
supersedes: []
non-negotiable:
  - "Yjs 是唯一权威数据源，memory store 只是渲染投影"
  - "写入必须经 bridge/importer 路径，且包在 doc.transact(fn, ORIGIN) 内"
  - "不可逆治理动作（repair/replace-mode import）不进 undo 栈"
---

# 持久化层规约 — Yjs / IndexedDB / 撤销 / 导入导出

> 把 src/persistence/ 下 11 个文件的契约统一形式化。
> Yjs 是唯一权威数据源，bridge 是写入边界，importer/exporter 是端口，integrity 是单向不可逆治理。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 状态 | **Draft v0.1** |
| 优先级 | P0 底座 |
| 前置依赖 | 核心数据模型 spec（已就位） + 拓扑意识空间 spec（已就位） |

---

## §0 原则

1. **单一权威源**：Y.Doc 内嵌的 5 个 Y.Map 是唯一权威数据；memory store 只用于渲染与逻辑计算，不直接落盘
2. **写入只能经由 bridge 或 importer/exporter 路径**，且必须包在 `doc.transact(fn, ORIGIN)` 内
3. **撤销语义边界由 trackedOrigins 显式控制**，绝不在 bridge 内再嵌套 undo/redo
4. **不可逆治理动作**（repair / replace-mode import）**不进 undo 栈**
5. 所有模块顶部保留 `[INPUT]/[OUTPUT]/[POS]/[PROTOCOL]` 四段注释；CLAUDE.md 顶部成员清单是活文档

---

## §1 数据源层

### 1.1 Yjs Doc 与持久化

- 文件：[yjs-store.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/yjs-store.js)
- 公开 API：`initPersistence(dbName?)`、`getDoc()`、`getPersistence()`、`getUndoManager()`、`transact(fn, origin)`、五个 `getXxx()`
- 默认 dbName：`thoughtspace-notes-phase0`（后续升 v1 时需新增迁移流程而非覆盖）
- 启动顺序：必须先 `await initPersistence()` 拿到 `persistence.once('synced')`，再装配 bridge

### 1.2 五个权威 Y.Map

| Map 名 | key 类型 | value 类型 |
|---|---|---|
| `thoughts` | id | Thought（核心数据模型 spec §1） |
| `edges` | id | Edge（核心数据模型 spec §2） |
| `zones` | id | Zone（核心数据模型 spec §3） |
| `crystals` | id | Crystal 结晶 |
| `actions` | id | Action 行动 |

key 永远为字符串 id；value 是 plain object（去掉不可序列化字段）。

### 1.3 UndoManager 边界

- 文件：[undo-manager.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/undo-manager.js)
- 默认 `trackedOrigins = {thought-bridge, edge-bridge, importer, bulk-action}`
- 默认 `mergeWindowMs = 100`，可在 `opts` 覆盖
- 默认观察范围仅 `[thoughts, edges]` 两个 map（其他 map 不进 undo 栈）
- `integrity-repair` 与 `replace-mode import` **故意不在** trackedOrigins 内
- 不允许在 bridge 内部调用 `undo()/redo()`

---

## §2 Bridge 层（双向镜像）

### 2.1 共同规约

五个 bridge（`thought / edge / zone / crystal / action`）遵循同一形态：

- 必传第二参数为 `Y.Map`，第三参数为 `Y.Doc`（后者可选）
- 模块级常量 `ORIGIN` 用于 `doc.transact(fn, ORIGIN)`
- 内部 `suppressFromDoc` 标志位防止 Y 变化触发 memory 回写时再次回灌
- `onYMapChange` 监听器仅在 `transaction.origin !== ORIGIN` 且非抑制态时投影到 memory
- `destroy()` 必须 `unobserve`
- 每个 bridge 暴露 `syncToStore / syncToDoc / *One / destroy` 四件套

### 2.2 字段白名单（META_FIELDS）

| Bridge | 字段集 |
|---|---|
| thought | id, text, body, x, y, z, mass, temperature, colorTag, labels, lastInteractionAt, createdAt, order |
| edge | id, fromId, toId, relationType, createdAt |
| zone | id, name, color, center, radius, description, createdAt |
| crystal | id, form, thoughtIds, position, rotSpeed, createdAt |
| action | id, title, sourceThoughtIds, status, dueDate, createdAt, completedAt |

> 任何新增持久化字段必须同步更新本节、CLAUDE.md 头部成员清单、exporter `SCHEMA_VERSION` 与 importer `validatePayload`。

### 2.3 浅比较 hasDiff

- 对引用类型字段（labels / thoughtIds / position / rotSpeed / sourceThoughtIds / center）用 `JSON.stringify` 兜底
- 对原子字段走 `!==`
- **已知陷阱**：若调用方在外部 mutate memory 对象字段（不改引用），bridge 不会感知；调用方必须替换引用或显式调 `updateOne`

### 2.4 五座桥要点

- thought：[createThoughtBridge](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/thought-bridge.js#L12) 还做 `IGNORE_FIELDS = {contentHint}` 屏蔽 UI 私有提示字段
- edge：[createEdgeBridge](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/edge-bridge.js#L28) 通过 `_linkEdge / _unlinkEdge` 间接调 edgeStore，且提供 `swapEdgeDirection(edgeId)`
- zone：[createZoneBridge](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/zone-bridge.js#L11) 通过 `memoryZoneStore.update/remove/ids/list` 间接操作，提供 `addOne`
- crystal：[createCrystalBridge](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/crystal-bridge.js#L19) 内存为 Array，内部用 `findIndex` 维持；`syncToStore` 用 `memIds` 集合反查删除
- action：[createActionBridge](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/action-bridge.js#L11) 与 thought-bridge 形态最接近

---

## §3 导入导出契约

### 3.1 Exporter

- 文件：[exporter.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/exporter.js)
- `SCHEMA_VERSION = 1`，必须随字段冻结而冻结
- `buildExportPayload({thoughts, edges, zones, meta})`：
  - 接受 `Array | Map.values() | edgeStore.values | zoneStore.list()` 四种入参形态
  - 字段白名单：仅导出 §2.2 中列出的字段，缺则省略
- `payloadToMarkdown`：
  - 念头按 `temperature` 降序、再按 `text.localeCompare` 字典序
  - 温度显示为百分制 `Math.round(t * 100)%`
  - 关系图最多 100 节点，超过截断，避免 Mermaid 渲染崩溃
- `downloadJSON / downloadMarkdown` 必须 `typeof document !== 'undefined'` 守卫
- 文件名：`thoughtspace-{count}items-{YYYYMMDD-HHmm}.{json|md}`

### 3.2 Importer

- 文件：[importer.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/importer.js)
- `parseImportString(raw) → {ok, payload | error}`，error 枚举：`empty / invalid-json / not-object / missing-thoughts-array / thoughts-not-array / edges-not-array / zones-not-array / thought[i]-not-object / thought[i]-bad-id / edge[i]-not-object / edge[i]-bad-id / edge[i]-bad-fromId / edge[i]-bad-toId`
- `validatePayload` 不抛异常，只返回 `{ok, error}`
- `applyImport(payload, ctx, opts)`：
  - `mode = 'replace'`：先清空 thoughtsMap/edgesMap/zonesMap 再写入
  - `mode = 'merge'`：跳过已存在 id 的 thought/zone；edge 按 id 覆盖写入
  - 事务包名：`ORIGIN = 'importer'`（在 trackedOrigins 内，可被 Ctrl+Z 撤回）
  - 字段清洗：数值用 `Number.isFinite` 兜底，文本缺省 `''`，中心点缺省 `{x:0,y:0,z:0}`，关系类型缺省 `'cause'`
  - 边两端必须落在 `newThoughtIds ∪ existingThoughtIds` 内，否则 `skipped++`

---

## §4 完整性护栏

### 4.1 audit

- 文件：[integrity.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/integrity.js)
- `audit(ctx) → {thoughtCount, edgeCount, duplicateIds, orphanEdges, selfLoops}`
- 检测项：`thoughtsMap` key 重复；`edgesMap` 形态缺失 / 自环（`fromId === toId`）/ 悬挂（`fromId ∉ thoughtsMap ∨ toId ∉ thoughtsMap`）

### 4.2 repair

- `repair(ctx, opts)` 走 `ORIGIN_REPAIR = 'integrity-repair'` 事务，**故意不在 UndoManager 追踪范围**
- 默认 `removeOrphanEdges = true` / `dedupeThoughtIds = true`；可通过 `opts` 关闭某一项
- 只直接修 Y.Map，memory store 依赖 bridge 反向同步
- 返回 `{fixed, removedOrphans, removedLoops, renamedDuplicates, total}`

---

## §5 装配契约

每个 bridge 提供 `setupXxxPersistenceBridge(...)` 入口：

```js
const { bridge, yMap, doc } = await setupThoughtPersistenceBridge(memoryMap, doc?, dbName?);
```

约定：
- `doc` 缺省时内部 `await initPersistence(dbName)`；若已 init 则复用
- `setupEdgePersistenceBridge` 会立即调一次 `syncToStore()` 并返回 `imported` 计数
- 其他 bridge 不在 setup 中预拉，由调用方在合适时机显式 `syncToStore()`（通常在 main.js 的 `init()` 链尾）

---

## §6 已知风险与待办

- [R1] **bridge 同质化未抽取**：`createMirrorBridge` 工厂未落地，代码重复率 ~70%
- [R2] **浅比较局限**：任何对引用类型字段的 in-place mutate 不会触发 bridge 回写
- [R3] **撤销范围过窄**：`zones / crystals / actions` 不进 undo 栈
- [R4] **dbName 升级未做迁移**：`phase0 → phase1` 时需新增 `migratePhase0ToPhase1(ctx)` 或独立迁移脚本
- [R5] **destroy 顺序未定**：目前 bridge 在 setup 时立即注册 observe，缺少"创建-装配-初始化"三段式生命周期

---

## §7 变更协议

[PROTOCOL]: 任何对 §1～§5 的修改必须：
1. 同步更新对应源文件顶部 `[INPUT]/[OUTPUT]/[POS]` 注释
2. 同步更新 CLAUDE.md 顶部成员清单
3. 若影响 META_FIELDS，同步更新 exporter 白名单与 importer validatePayload
4. 若新增/修改 ORIGIN，同步更新 §1.3 的 trackedOrigins 列表
5. 在 PR 描述中标注本 spec 是否需要 bump 到 v0.2

---

## §8 关联代码

- [yjs-store.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/yjs-store.js)
- [thought-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/thought-bridge.js)
- [edge-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/edge-bridge.js)
- [zone-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/zone-bridge.js)
- [crystal-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/crystal-bridge.js)
- [action-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/action-bridge.js)
- [undo-manager.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/undo-manager.js)
- [exporter.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/exporter.js)
- [importer.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/importer.js)
- [integrity.js](file:///e:/魔方心厦/thoughtspace-notes/src/persistence/integrity.js)