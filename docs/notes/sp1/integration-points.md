# SP-1 与其他模块的接触点

> **本文件目标**: 列出 SP-1 与既有模块的**所有接触点**,防止修改时遗漏或破坏。

---

## §1 接触点清单

### 1.1 main.js ← → SP-1

| main.js 接触点 | SP-1 函数 | 风险 |
|---|---|---|
| `import` 三个 store | `createLayerStore / createSortHistory / createCanvasMode` | 低(ESM 静态) |
| `currentLayerStore.bootstrapDefaults()` | layer-store internal | 低 |
| `currentSortHistory.recordOrder(ids)` 在 `applyObserveReorder` 末尾 | sort-axis internal | 中(切轴副作用) |
| `window.__sp1State = { ... }` | observe-views 读取 | 中(全局污染) |

### 1.2 observe-views.js ← → SP-1

## observe-views

| observe-views 接触点 | SP-1 函数 | 风险 |
|---|---|---|
| `buildCanvasTabs()` | canvas-mode.getMode / setMode | 低 |
| `buildSortSummon()` | sort-axis 状态 | 低 |
| `renderBackgroundMode()` | layer-store.list | 低 |
| `renderBlockMode()` | sort-axis.getCurrentOrder | 低 |
| `refreshContent()` | canvas-mode.getMode | 低 |
| `window.__sp1State` 检查 | 全局读取 | 中(未挂载时降级) |

### 1.3 Thought 数据模型 ← → SP-1

| Thought 字段 | SP-1 用法 | 风险 |
|---|---|---|
| `temperature` | renderBackgroundMode 分桶 | 低(已有字段) |
| `createdAt` | sort-axis `time` 轴 | 低 |
| `lastInteractionAt` | sort-axis `lastInteraction` 轴 | 低 |
| `mass` | sort-axis `volume` 轴 (待用) | 低 |
| `order` | 拖动排序持久化 | 低(已有) |
| `layerId` (未存在) | SP-3 真分层时新增 | 中(数据模型变更) |

---

## §2 与其他 sub-project 的接触点

### 2.1 与 SP-2 (内容块数据模型)

| SP-1 | SP-2 | 接触 |
|---|---|---|
| Layer.kind = 'conscious'/'subconscious' | 块 content | 待定(SP-2 启动时定义) |
| Canvas-mode = 'block' | 块视图 | 待定 |

### 2.2 与 SP-3 (3D 空间映射)

| SP-1 | SP-3 | 接触 |
|---|---|---|
| LayerStore (N 层) | Y 轴 4 层 (L0-L3) | **映射**: SP-1 自由层数,SP-3 时映射到 3D 空间 |
| SortHistory (manualOrder) | 3D 空间位置排序 | 待 SP-3 |

### 2.3 与拓扑意识空间 spec (2026-07-05)

| 拓扑空间 | SP-1 | 接触 |
|---|---|---|
| 6 魔方面 | (无直接接触) | - |
| Y 轴 L0-L3 | LayerStore 默认 6 | **独立**,不冲突 |
| 拓扑体 (Hull) | renderBackgroundMode 4 列 | **简化版**: 4 列 ≠ 拓扑体 |

---

## §3 风险接触点 (需要小心)

### 3.1 T11 修复不可破坏

**接触点**: observe-views.js 的 `showObserveView` / `hideObserveView`  
**理由**: 2026-07-07 T11 修复了递归关闭 bug  
**保护**: SP-1 在 showObserveView 入口**不调** hideObserveView()；panel-stack.onClose 只清闭包的 root

详见 [pitfalls.md#T2.1-panel-stack-onclose-collision](pitfalls.md)

### 3.2 sort-axis 切轴副作用

**接触点**: `applyObserveReorder` → `currentSortHistory.recordOrder`  
**理由**: recordOrder 会把 `currentAxis` 切到 manual  
**保护**: UI 必须在下次渲染时调 `getCurrentAxis()` 重读,否则 bar 文本会过期

详见 [decisions.md#why-window-globals](decisions.md)

### 3.3 main.js 大文件

**接触点**: `main.js` 是 2471 行 (超 800 红线,但 Phase 0 例外)  
**理由**: SP-1 装配代码嵌入主入口  
**保护**: 仅在 zoneBridge / zoneStore 附近加,不动核心热路径

详见 [pitfalls.md#数据层与-main.js-装配的解耦](pitfalls.md)

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md