---
id: core-data-model
title: 核心数据模型
status: sediment
phase: implemented           # P2-1: 数据契约已实施,门禁通过
layer: L3-implementation
scope:
  global: false
  modules: [src/core]
  files: [src/core/thought.js, src/core/edge.js, src/core/zone.js]
  lines: []
priority: 80
created: 2026-07-07
updated: 2026-07-07
inherits-from:
  - topological-awareness-space
supersedes:
  - phase-0-lightweight-restructure  # P2-1: 提升为显式 supersedes (取代过期 overrides)
non-negotiable:
  - "所有模型返回不可变对象（浅拷贝）"
  - "id 必须稳定字符串，跨持久化保持不变"
  - "time 字段统一为 Date.now() 毫秒数值"
---

# 核心数据模型规约 — Thought / Edge / Zone

> 把"念头田野"的三种最小数据载体（念头、关系、分区）作为不可变 schema 显式形式化。
> 任何视图层、行为引擎、持久化层都依赖这三个 schema；它们是拓扑意识空间的最底座。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 状态 | **资料性记录 + 契约冻结** |
| 优先级 | P0 底座 |
| 前置依赖 | 拓扑意识空间 spec（已就位，2026-07-05） |
| 后续 | 行为引擎 spec（crystallize / reunion / meditation / hydrate / insight-copilot） |

---

## §0 设计原则（来自用户原话 + 代码实然）

> "**数据模型不变**" —— 拓扑意识空间 spec §1.1，2026-07-05
> "**念头是第一公民**" —— 念头空间_产品规划.md
> "**layer 是用户自定义意识层级，zone 是用户自定义分区**" —— topology-priority.md L263 决策

1. **不可变 schema**：所有写入都返回新对象，调用方使用浅拷贝（`{...thought, ...}`）
2. **三模型 = 三种邻接语义**：Thought 是点，Edge 是关系的"定义表"，Zone 是 3D 球形领土
3. **持久化闭包**：每个模型都暴露 `create*Store` 工厂供上层组合

---

## §1 念头（Thought）

### 1.1 数据字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | required | 主键，由调用方生成 |
| `text` | string | `''` | 念头简述（≤120 字） |
| `body` | string | `''` | 念头详情（富文本/Markdown） |
| `x / y / z` | number | `0` | 3D 坐标（由仿真层/用户拖拽产生） |
| `temperature` | number ∈ [0, 1] | `0.5` | "热度"；高→Y 轴顶部，低→底部 |
| `mass` | number | `1 + 0.1·editions + 0.2·references` | 信息量权重；越大越难被推走 |
| `colorTag` | string? | `null` | 念头颜色（用于可视化） |
| `labels` | string[] | `[]` | 标签（去重 + 归一化） |
| `order` | number | `0` | 排序权重（由 sort-axis 写入） |
| `createdAt` | number | `Date.now()` | 创建时间戳 |
| `lastInteractionAt` | number | `createdAt` | 最近一次交互（编辑 / 引用 / 编辑） |

### 1.2 工厂函数

- `createThought({ id, text, ... })` → 不可变 Thought 对象
- `addLabel(thought, label)` → 新 Thought 对象（浅拷贝 + labels 拼接）
- `setColorTag(thought, color)` → 新 Thought 对象
- `decayTemperature(thought, lambda = 0.05, dt)` → 指数衰减 `t·exp(-λ·dt)`
- `reheat(thought, delta = 0.2)` → `clamp(temperature + delta, 0, 1)`

### 1.3 状态机

念头本身没有显式状态机；但 `temperature` 是"生命体征"，由 `decayTemperature` + `reheat` 共同维护。

---

## §2 边（Edge）

### 2.1 数据字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | required | 主键 |
| `fromId` | string | required | 起点 Thought id |
| `toId` | string | required | 终点 Thought id |
| `relationType` | enum | `'cause'` | `cause / parallel / conflict / sequence / subordinate` |
| `createdAt` | number | `Date.now()` | 创建时间戳 |

### 2.2 关系类型枚举（冻结）

```js
const RELATION_TYPES = Object.freeze([
  'cause',        // 因果
  'parallel',     // 并列
  'conflict',     // 冲突
  'sequence',     // 时序
  'subordinate',  // 主从
]);
```

### 2.3 边样式表（视图层）

```js
const EDGE_STYLES = Object.freeze({
  cause:       { color: '#5f8fff', width: 2, dash: null },
  parallel:    { color: '#5fbf9f', width: 1, dash: '4 4' },
  conflict:    { color: '#ff6b6b', width: 2, dash: '6 3' },
  sequence:    { color: '#ffd96b', width: 2, dash: null },
  subordinate: { color: '#bf5fff', width: 1, dash: '2 4' },
});
```

> **注**：尽管 Edge 定义了 5 种关系类型，但拓扑意识空间 spec 决定"连线消失，由空间位置暗示关系"。样式表为兼容旧视觉保留，视图层默认不绘制显式边线。

### 2.4 工厂函数

- `createEdge({ id, fromId, toId, relationType })`
- `createEdgeStore()` → `{ add, remove, update, byPair, list, ... }`
- `swapEdgeDirection(edgeId)` → 翻转 `fromId / toId`

---

## §3 分区（Zone）

### 3.1 数据字段

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `id` | string | required | 主键 |
| `name` | string | `''` | 分区名 |
| `color` | string | `'#888888'` | 可视化颜色 |
| `center` | `{x,y,z}` | `{x:0,y:0,z:0}` | 球心坐标 |
| `radius` | number | `100` | 球形半径 |
| `description` | string | `''` | 备注 |
| `createdAt` | number | `Date.now()` | 时间戳 |

### 3.2 归属算法

- `classify(thought, zones)` → 返回最近的 zone id（一个 thought 只属一个 zone）
- 距离公式：欧氏距离 `||thought.pos - zone.center||`

### 3.3 序列化

- `zone.toJSON()` / `zone.fromJSON()` 用于 IndexedDB 持久化往返

### 3.4 与 SP-1 的关系

> "layer = 用户自定义意识层级（Y 轴），zone = 用户自定义分区（X-Z 平面）；正交互补，互不替代" —— topology-priority.md L263

Zone 在 SP-1 双模式空间中扮演"背景分区模式"的载体，与 layer 共同构成 3D 拓扑。

---

## §4 三个模型的共同规约

### 4.1 ID 主键

- 所有 id 必须是稳定的字符串（推荐 `crypto.randomUUID()` 或自定义前缀）
- id 在跨持久化（Yjs / IndexedDB / export JSON）过程中保持不变

### 4.2 不可变工厂返回

- 任何 `create*` 工厂都返回纯对象
- 修改字段必须返回新对象（浅拷贝）
- 这与持久化层的 `JSON.stringify` 浅比较协同工作（详见 persistence spec §2.3）

### 4.3 时间字段

- 所有时间字段都是 `Date.now()` 数值（毫秒），不是 ISO 字符串
- 序列化时若需 ISO，由调用方转换

---

## §5 已知缺口（需未来补全）

1. **`mass` 中的 `editions / references` 计数来源不明**：当前代码没有维护这两个字段的累计逻辑
2. **`order` 字段由 sort-axis 维护**：但 sort-axis 的写入时序与 thought 的 create 时序的冲突边界需要 spec 明确
3. **`lastInteractionAt` 的"交互"定义**：包括编辑、引用、召唤、聚焦？但代码中没有统计实现

---

## §6 变更协议

[PROTOCOL]: 任何对 §1～§5 的修改必须：
1. 同步更新对应源文件顶部 `[INPUT]/[OUTPUT]/[POS]` 注释
2. 同步更新 `src/core/CLAUDE.md` 成员清单
3. 若影响字段集，同步更新 persistence spec 的 §2.2 META_FIELDS
4. 若新增关系类型或样式，需在 §2.2 / §2.3 显式登记
5. 在 PR 描述中标注本 spec 是否需要 bump 到 v0.2

---

## §7 关联代码

- [thought.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/thought.js)
- [edge.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/edge.js)
- [zone.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/zone.js)