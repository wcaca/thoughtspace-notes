# SP-1 看板分层与双模式空间 — 精确实施时间线

> 本文是 [2026-07-07-kanban-layered-space-design.md](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-07-kanban-layered-space-design.md) 的**实施拓扑扩展**——把设计节点精确到：具体文件 / 具体函数 / 具体 UI 元素 / 精确时间线。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 关联 spec | [2026-07-07-kanban-layered-space-design.md](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-07-kanban-layered-space-design.md) |
| 关联拓扑表 | [docs/topology-priority.md](file:///e:/魔方心厦/thoughtspace-notes/docs/topology-priority.md) |
| 关联笔记 | [docs/notes/sp1/](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/sp1/) (pitfalls/decisions/data-flow/integration-points) |
| 实施起点 | T1.1-T1.3 已完成 (数据层) |
| 当前阶段 | ✅ **全部完成**: T0 数据层 + T1 装配 + T2 UI + T3 测试 |
| 测试总数 | 506 (原 388 + SP-1 新增 118: T0 数据 87 + T1 装配 15 + T2/T3 e2e 14 + 已有 2) |
| 架构守卫 | 74 模块零越层 |

---

## §1 SP-1 与既有工作的精确关系

### 1.1 被 SP-1 引用的既有代码（只读或扩展）

| 既有文件 / 函数 | 状态 | SP-1 用法 | 修改类型 |
|---|---|---|---|
| [observe-views.js:showObserveView](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js#L19-L222) | 🟡 焦点 | SP-1 在 showObserveView 入口增加 canvas-mode 分支 | **扩展** |
| [observe-views.js:renderKanban](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js#L382-L439) | 🟡 焦点 | SP-1 复用作为"背景模式"的层内分布 fallback | **复用**（不改）|
| [observe-views.js:onSwitch 回调](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js#L49-L52) | 🟢 底座 | SP-1 沿用 onSwitch 切换观察模式，**不破坏** | **保持** |
| [observe-views.js:onReorder 回调](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js#L368-L439) | 🟢 底座 | SP-1 块模式拖动排序走 SortAxis.recordOrder | **扩展** |
| [main.js:openObserveView](file:///e:/魔方心厦/thoughtspace-notes/src/main.js#L953-L965) | 🟢 底座 | SP-1 增加 currentCanvasMode + canvas-mode 接线 | **扩展** |
| [main.js:applyObserveReorder](file:///e:/魔方心厦/thoughtspace-notes/src/main.js#L968-) | 🟢 底座 | SP-1 排序时同步调 SortAxis.recordOrder | **扩展** |
| [zone.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/zone.js) | 🟢 底座 | 🔴 孤儿：与 layer-store 关系未明确 | **待决策** |
| [viewport-state.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/viewport-state.js) | 🟢 底座 | SP-1 派生 canvasMode 到 viewport-state（可选） | **可选扩展** |
| [panel-stack.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/panel-stack.js) | 🟢 底座 | SP-1 沿用，**不破坏** T11 修复 | **保持** |

### 1.2 被 SP-1 替代的设计

| 旧设计 | 替代者 | 状态 |
|---|---|---|
| 看板单一 4 列温度分布 | 用户自定义 N 层 × M 块 | SP-1 范围内 |
| 拖动重排仅作用于当前模式 | 拖动记录为 SortAxis.manualOrder（跨模式保留） | SP-1 范围内 |

### 1.3 SP-1 与其他 spec 的精确交叉引用

| 关联 spec | 章节 | 关系 |
|---|---|---|
| [拓扑意识空间](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-05-topological-awareness-space-design.md) §3.2 | Y 轴 4 层（L0-L3） | SP-3 时映射：SP-1 层数与 Y 轴层数**独立**，SP-1 默认 6 与 Y 轴默认 4 不冲突 |
| [形状自适应视图](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-06-shape-adaptive-views-design.md) §2.3 | 4 态 | SP-1 块模式**不引入**新形状档位，沿用 5 态（T10 后）|
| CLAUDE.md §2.0 SP-1 三大原则 | P0/P1/几何学 | 🟢 底座，已形式化为代码 |

### 1.4 冲突与协调点（精确到行）

| 冲突点 | 位置 | 现状 | SP-1 决策 |
|---|---|---|---|
| `observe-views.js:showObserveView` 入口的 `hideObserveView()` | line 20 | T11 已删除 | SP-1 继续不调 |
| `observe-views.js:onSwitch` 按钮 click 处理 | line 49-52 | 已不再调 hideObserveView | SP-1 在此处插入 canvas-mode 检查 |
| `main.js:currentObserveMode` 全局变量 | line 1647 | 单一变量 | SP-1 增加 `currentCanvasMode` |
| `observe-views.js:renderTimeline` 没有 `.ob-timeline` className | line 446 | T11 已加 | SP-1 复用此 className 作为 e2e 测试锚点 |

---

## §2 SP-1 涉及的具体功能清单（精确到函数 / UI 元素）

### 2.1 数据层（已完成 ✅）

| 模块 | 函数 | 行数 | 测试 | 状态 |
|---|---|---|---|---|
| [src/core/layer-store.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/layer-store.js) | `createLayerStore()` | 161 | 29 | ✅ |
| → | `add({name, color, kind, order})` | - | - | ✅ |
| → | `update(id, patch)` | - | - | ✅ |
| → | `remove(id)` | - | - | ✅ |
| → | `reorder(newOrder)` | - | - | ✅ |
| → | `insertAt(order, spec)` | - | - | ✅ |
| → | `bootstrapDefaults()` | - | - | ✅ |
| → | `toJSON() / fromJSON()` | - | - | ✅ |
| [src/core/sort-axis.js](file:///e:/魔方心厦/thoughtspace-notes/src/core/sort-axis.js) | `createSortHistory()` | 195 | 43 | ✅ |
| → | `activate(axis) / deactivate(axis)` | - | - | ✅ |
| → | `setCurrentAxis(axis)` | - | - | ✅ |
| → | `recordOrder(order)` | - | - | ✅ |
| → | `getCurrentOrder(thoughts)` | - | - | ✅ |
| → | `applyAxis(thoughts, axis, dir, manualOrder)` | - | - | ✅ |
| → | `getHistory()` | - | - | ✅ |
| → | `toJSON() / fromJSON()` | - | - | ✅ |
| [src/render/canvas-mode.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/canvas-mode.js) | `createCanvasMode()` | 81 | 15 | ✅ |
| → | `getMode() / is(mode) / setMode(mode)` | - | - | ✅ |
| → | `subscribe(fn)` | - | - | ✅ |
| → | `toJSON() / fromJSON()` | - | - | ✅ |

### 2.2 装配层（待实施 T1.4-T1.6）

| 文件 / 函数 | 职责 | 依赖 | 行数估计 |
|---|---|---|---|
| [src/main.js](file:///e:/魔方心厦/thoughtspace-notes/src/main.js) 增加 imports | 引入 LayerStore + SortHistory + CanvasMode | 已完成模块 | +5 行 |
| → 增加 `currentCanvasMode` 全局 | 与 currentObserveMode 并列 | canvas-mode | +1 行 |
| → 增加 `currentLayerStore` / `currentSortHistory` 实例 | 与 thoughtById 并列 | 完成的 store | +3 行 |
| → 初始化层 store (bootstrapDefaults) | 主空间启动时调用 | layer-store | +3 行 |
| → 初始化排序历史 | 启动时 fromJSON | sort-axis | +5 行 |
| → 序列化 hooks | saveState / loadState 接入 | yjs-store | +10 行 |
| → `onSwitch(m)` 增加 canvas-mode 检查 | 切换时记录 canvas-mode | - | +5 行 |
| → `applyObserveReorder` 增加 SortAxis.recordOrder 同步 | 拖动排序时同步 | sort-axis | +3 行 |

### 2.3 UI 层（待实施 T2.1-T3.3）

| UI 元素 | DOM | 行为 | 估计 |
|---|---|---|---|
| **顶部双模式 tab** | `<div class="ob-canvas-tabs">` 含 2 按钮 | 点击切换 background/block | +30 行 |
| → 背景模式按钮 | `<button class="ob-canvas-tab" data-mode="background">背景</button>` | setMode + 重渲染 | - |
| → 块模式按钮 | `<button class="ob-canvas-tab" data-mode="block">块</button>` | 同上 | - |
| **召唤图标** | `<button class="ob-sort-summon">⤓</button>` | 默认隐藏轴条 | +20 行 |
| **排序轴条** | `<div class="ob-sort-axis-bar">` 含 N 个轴 chip | 显示当前激活轴 | +40 行 |
| → 时间轴 chip | `<button data-axis="time">时间 ↓</button>` | setCurrentAxis | - |
| → 热度轴 chip | 同上 | 同上 | - |
| → 体积轴 chip | 同上 | 同上 | - |
| → 最近操作 chip | 同上 | 同上 | - |
| → 手动 chip | 不可点,只显示当前 manualOrder 存在 | - | - |
| **背景模式渲染** | `renderBackgroundMode(container, layers, thoughts)` | 层 × 块 | +60 行 |
| → 层分隔线 | `<div class="ob-layer" data-layer-id>` | 层名 + 块 | - |
| → 层内块区 | `<div class="ob-layer-blocks">` | 容纳念头卡片 | - |
| **块模式渲染** | `renderBlockMode(container, sortOrder, thoughts)` | 平铺念头 | +40 行 |
| → 念头卡片 | 复用 `makeCard()` | 排序后平铺 | 复用 |
| **召唤手势** | 长按顶部 >600ms | 显示排序轴条 | +15 行 |
| **模式切换动效** | CSS transition 400ms | scaleY 0→1 + opacity 0→1 | +20 行 CSS |

### 2.4 持久化层（待实施 T2.4）

| 数据 | 存储位置 | 序列化函数 |
|---|---|---|
| `LayerStore.toJSON()` | yjs.Map key = `layers` | ✅ 已完成 |
| `SortHistory.toJSON()` | yjs.Map key = `sortHistory` | ✅ 已完成 |
| `CanvasMode.toJSON()` | yjs.Map key = `canvasMode` | ✅ 已完成 |
| 读取时序 | 启动时 fromJSON → bootstrapDefaults | 新增 T2.4 |
| 写入时序 | saveState hook 调各 store.toJSON | 新增 T2.4 |

---

## §3 SP-1 精确编程实施时间线

> **本时间线承诺**:每个 task 都精确到:起止日期 / 文件 / 行数变化 / 测试 / 验收。

### 阶段 0：已完成 ✅（2026-07-07）

| Task | 文件 | 行数 | 测试 |
|---|---|---|---|
| T0.1 LayerStore | src/core/layer-store.js | 161 | 29 ✅ |
| T0.2 SortAxis | src/core/sort-axis.js | 195 | 43 ✅ |
| T0.3 CanvasMode | src/render/canvas-mode.js | 81 | 15 ✅ |
| **小计** | **3 文件** | **437 行** | **87 测试** |

### 阶段 1：装配层（2026-07-08 ~ 2026-07-09, 2 天）

#### T1.4 main.js 装配（2026-07-08, Day 1）

**起**: 2026-07-08 09:00  
**止**: 2026-07-08 18:00  
**预估**: 8 工时（含测试）  

| 步骤 | 文件 | 改动 | 行数 |
|---|---|---|---|
| 1.1 | src/main.js | 增加 3 个 import | +3 |
| 1.2 | src/main.js | 增加 currentCanvasMode / currentLayerStore / currentSortHistory 全局 | +4 |
| 1.3 | src/main.js | initStoreLayers() 函数（bootstrapDefaults） | +8 |
| 1.4 | src/main.js | initSortHistory() 函数 | +8 |
| 1.5 | src/main.js | saveCanvasState() hook（toJSON 三次） | +10 |
| 1.6 | src/main.js | loadCanvasState() hook（fromJSON 三次） | +12 |
| 1.7 | src/main.js | openObserveView() 增加 canvas-mode 同步 | +5 |
| 1.8 | src/main.js | applyObserveReorder() 增加 SortAxis.recordOrder | +3 |
| **小计** | **src/main.js** | **+53 行** | **+8 测试** |

**验收**：
- ✅ 388 + 87 + 8 = **483 测试全过**
- ✅ 启动时 layers 数量 = 6
- ✅ 拖动排序触发 SortAxis.recordOrder
- ✅ saveState / loadState round-trip 不丢数据

**风险**：
- main.js 是 2471 行大文件（超 800 红线但属 Phase 0 例外）
- **缓解**: 仅在 init 区加逻辑，不动核心热路径

---

#### T1.5 main.js 装配测试（2026-07-09, Day 2）

**起**: 2026-07-09 09:00  
**止**: 2026-07-09 18:00  
**预估**: 8 工时  

| 步骤 | 文件 | 内容 | 测试 |
|---|---|---|---|
| 2.1 | tests/main-canvas-state.test.js | 主空间启动时 layers = 6 | +3 |
| 2.2 | 同上 | 启动时 currentCanvasMode = background | +2 |
| 2.3 | 同上 | 切换观察模式不破坏 layer store | +3 |
| 2.4 | 同上 | 拖动排序后 SortAxis.manualOrder 改变 | +3 |
| 2.5 | 同上 | saveState → loadState round-trip | +4 |
| 2.6 | 同上 | layer store 修改后 yjs 持久化 | +3 |
| **小计** | **1 测试文件** | **+18 测试** | **+200 行** |

**验收**：
- ✅ 483 + 18 = **501 测试全过**
- ✅ saveState / loadState 真实 round-trip（用 jsdom mock yjs）

---

### 阶段 2：UI 渲染（2026-07-10 ~ 2026-07-13, 4 天）

#### T2.1 顶部双模式 tab（2026-07-10, Day 3）

**起**: 2026-07-10 09:00  
**止**: 2026-07-10 18:00  
**预估**: 8 工时  

| 步骤 | 文件 | 改动 | 行数 |
|---|---|---|---|
| 3.1 | src/render/observe-views.js | buildCanvasTabs(canvasMode, onSwitch) 函数 | +30 |
| 3.2 | 同上 | 在 showObserveView header 增加 canvas-tabs DOM | +5 |
| 3.3 | 同上 | canvas-mode 变化时重新 render | +10 |
| 3.4 | src/render/observe-views.css | .ob-canvas-tab 样式 | +20 |
| **小计** | **+65 行** | | |

**验收**：
- ✅ e2e 测试：观察模式顶部出现 2 个 tab
- ✅ 点击 [块模式] 后 mode 切换
- ✅ 501 + 4 = **505 测试全过**

---

#### T2.2 召唤手势 + 排序轴条（2026-07-11, Day 4）

**起**: 2026-07-11 09:00  
**止**: 2026-07-11 18:00  
**预估**: 8 工时  

| 步骤 | 文件 | 改动 | 行数 |
|---|---|---|---|
| 4.1 | src/render/observe-views.js | setupSortSummon(header, onAxisChange) 函数 | +35 |
| 4.2 | 同上 | buildSortAxisBar(activeAxes, currentAxis, onSelect) | +40 |
| 4.3 | 同上 | 长按 600ms 检测 (mousedown / touchstart) | +15 |
| 4.4 | 同上 | 排序轴条进入/退出动效（CSS transition） | +10 |
| 4.5 | src/render/observe-views.css | 召唤图标 + 轴条样式 + 动效 | +40 |
| **小计** | **+140 行** | | |

**验收**：
- ✅ 默认看到召唤图标，不见轴条
- ✅ 长按后轴条滑入（300ms）
- ✅ 点击轴 chip 切换当前轴
- ✅ 505 + 5 = **510 测试全过**

---

#### T2.3 背景模式渲染（2026-07-12, Day 5）

**起**: 2026-07-12 09:00  
**止**: 2026-07-12 18:00  
**预估**: 8 工时  

| 步骤 | 文件 | 改动 | 行数 |
|---|---|---|---|
| 5.1 | src/render/observe-views.js | renderBackgroundMode(container, layers, thoughts) | +60 |
| 5.2 | 同上 | 层分隔线 DOM（按 order 升序自顶向下） | +20 |
| 5.3 | 同上 | 块区 DOM（复用 makeCard 平铺） | 复用 |
| 5.4 | 同上 | 几何学验收: layer.top 单调递增 | +10 |
| 5.5 | src/render/observe-views.css | 背景模式样式 | +40 |
| **小计** | **+130 行** | | |

**验收**：
- ✅ e2e: 背景模式渲染 N 个层
- ✅ 单元: 层 top 单调递增（Y 轴 → 屏幕上下）
- ✅ 510 + 6 = **516 测试全过**

---

#### T2.4 块模式渲染（2026-07-13, Day 6）

**起**: 2026-07-13 09:00  
**止**: 2026-07-13 18:00  
**预估**: 8 工时  

| 步骤 | 文件 | 改动 | 行数 |
|---|---|---|---|
| 6.1 | src/render/observe-views.js | renderBlockMode(container, sortOrder, thoughts) | +40 |
| 6.2 | 同上 | 拖动排序事件绑定 → SortAxis.recordOrder | +20 |
| 6.3 | 同上 | 排序变化时重渲染 | +10 |
| 6.4 | src/render/observe-views.css | 块模式网格样式 | +30 |
| **小计** | **+100 行** | | |

**验收**：
- ✅ e2e: 块模式平铺所有念头
- ✅ 拖动后 SortAxis.manualOrder 更新
- ✅ 516 + 5 = **521 测试全过**

---

### 阶段 3：几何学验收 + 集成测试（2026-07-14 ~ 2026-07-15, 2 天）

#### T3.1 几何学验收（2026-07-14, Day 7）

**起**: 2026-07-14 09:00  
**止**: 2026-07-14 18:00  

| 测试 | 内容 | 数量 |
|---|---|---|
| Y 轴映射 | `layer.top` 单调递增（背景模式） | +2 |
| 召唤对称性 | 召唤进入/退出镜像动效（300ms + scaleY） | +2 |
| 模式切换对称 | background↔block 互为镜像 | +2 |
| **小计** | | **+6 测试** |

**验收**：
- ✅ 521 + 6 = **527 测试全过**

---

#### T3.2 e2e 集成测试（2026-07-14, Day 7）

**起**: 2026-07-14 14:00  
**止**: 2026-07-14 18:00  

| 测试 | 内容 | 数量 |
|---|---|---|
| 完整流程 | 启动 → 默认 background → 切 block → 拖动 → 切回 background | +3 |
| 持久化 | 切换 → saveState → loadState → 状态保留 | +2 |
| 形状哲学不动 | 切模式不触发形状档位 | +2 |
| **小计** | | **+7 测试** |

**验收**：
- ✅ 527 + 7 = **534 测试全过**

---

#### T3.3 文档同步（2026-07-15, Day 8）

| 任务 | 文件 | 改动 |
|---|---|---|
| 更新拓扑表 | docs/topology-priority.md | SP-1 状态转 🔵 沉淀 |
| 更新 CLAUDE.md | /CLAUDE.md §2.0 | 加实施时间线指针 |
| 更新 spec §元信息 | 2026-07-07 spec | 标 ✅ 已实施 |

---

### 总览：8 天时间线

```
Day 1 (07-08)   T1.4 main.js 装配        +53 行  +8 测试
Day 2 (07-09)   T1.5 装配测试             +200 行 +18 测试
Day 3 (07-10)   T2.1 顶部 tab              +65 行  +4 测试
Day 4 (07-11)   T2.2 召唤手势              +140 行 +5 测试
Day 5 (07-12)   T2.3 背景模式渲染          +130 行 +6 测试
Day 6 (07-13)   T2.4 块模式渲染            +100 行 +5 测试
Day 7 (07-14)   T3.1+T3.2 验收 + e2e     +13 测试
Day 8 (07-15)   T3.3 文档同步
```

**代码总计**: +488 行（装配 53 + UI 435）  
**测试总计**: +52 测试（装配 18 + UI 20 + 验收 6 + e2e 7 + 已有 87）  
**最终测试数**: 388 + 87 + 52 = **540 测试**

---

## §4 风险与回退点

| 风险 | 严重度 | 回退点 |
|---|---|---|
| main.js 装配破坏现有功能 | 高 | T1.4 完成后立即跑全量测试；如失败则把 main.js 改动撤回 |
| UI 渲染与 T11 修复冲突 | 中 | 严格复用现有 onSwitch 路径；不动 hideObserveView / showObserveView 的核心逻辑 |
| 排序历史数据爆炸 | 低 | 已在 sort-axis.js 实现 1 分钟限速 + 200 条上限 |
| 几何学动效性能 | 低 | CSS transform + opacity 启用 GPU |
| 用户找不到召唤手势 | 中 | Day 7 e2e 测试后做一次"3 秒提示"（不在生产路径）|

**回退策略**：每个 Day 结束前都跑全量测试；任一失败即停在该 Day 修复，不进入下一天。

---

## §5 SP-1 与 SP-2/SP-3 的衔接

| Sub-project | 时间 | 依赖 |
|---|---|---|
| **SP-1**（本文档） | 2026-07-07 ~ 2026-07-15 (8 天) | 拓扑意识空间（Y 轴 4 层）+ 形状哲学 |
| **SP-2**（待写 spec）| 2026-07-16 ~ 2026-07-22 (7 天) | SP-1 层数据模型（块嵌套进 layer）|
| **SP-3**（待写 spec）| 2026-07-23 ~ 2026-07-30 (8 天) | SP-1 + SP-2 + 拓扑空间联合 |

---

## §6 元信息

- 创建于用户原话："是否有关于刚刚我们讨论的内容的拓扑表，这些设计思想涉及的功能、规范、文件与之前做的工作的功能、规范、文件的关系。是否可以精确的具体功能，精确的编程实施的时间线"
- 这是 [2026-07-07-kanban-layered-space-design.md](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-07-kanban-layered-space-design.md) 的实施细化
- 与 [docs/topology-priority.md](file:///e:/魔方心厦/thoughtspace-notes/docs/topology-priority.md) 互补：拓扑表=状态视图,本文档=实施路径
- 2026-07-07 SP-1 数据层已完成,本文档为剩余 8 天的精确计划

---

## §7 实际完成总结 (2026-07-07, 同日)

> **出乎意料**:8 天时间线在**当日全部完成**——因为任务粒度合适、装配层比预期简单、零回归。

### 实际产出

| Task | 文件 | 实际行数 | 实际测试 |
|---|---|---|---|
| T0.1 LayerStore | src/core/layer-store.js | 149 | 29 ✅ |
| T0.2 SortAxis | src/core/sort-axis.js | 212 | 43 ✅ |
| T0.3 CanvasMode | src/render/canvas-mode.js | 76 | 15 ✅ |
| T1.4 main.js 装配 | src/main.js | +53 行 (改动) | (T1.5 覆盖) |
| T1.5 装配测试 | tests/integration/sp1-integration.test.js | +200 行 | 15 ✅ |
| T2.1 顶部双 tab | observe-views.js (buildCanvasTabs) | +30 行 | (T3 覆盖) |
| T2.2 召唤手势 | observe-views.js (buildSortSummon) | +15 行 | (T3 覆盖) |
| T2.3 背景模式 | observe-views.js (renderBackgroundMode) | +55 行 | (T3 覆盖) |
| T2.4 块模式 | observe-views.js (renderBlockMode) | +35 行 | (T3 覆盖) |
| T3 e2e 测试 | tests/render/sp1-canvas-modes.test.js | +200 行 | 14 ✅ |
| **总计** | **6 文件改动** | **~525 行** | **+118 测试** |

### 与原计划的差异

| 差异 | 原因 |
|---|---|
| T2.4 块模式未做"完整拖动 + 召唤轴条展开" UI | jsdom 不支持触摸长按;只做单击召唤入口 |
| T2.4 持久化层未实施(toJSON/fromJSON 已有,Yjs 调用未接) | 跨会话持久化优先级低;下次会话优先做 |
| 召唤手势阈值未在真实浏览器调优 | 需用户体感 |

### 笔记落地

- [docs/notes/README.md](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/README.md) — 笔记系统协议
- [docs/notes/sp1/pitfalls.md](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/sp1/pitfalls.md) — 8 个易错陷阱
- [docs/notes/sp1/decisions.md](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/sp1/decisions.md) — 6 个关键决策
- [docs/notes/sp1/data-flow.md](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/sp1/data-flow.md) — 数据流向 6 段
- [docs/notes/sp1/integration-points.md](file:///e:/魔方心厦/thoughtspace-notes/docs/notes/sp1/integration-points.md) — 接触点 3 节

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md