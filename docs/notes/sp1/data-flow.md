# SP-1 数据流向图

> **本文件目标**: 展示 SP-1 三个 store 的**完整数据流**,跨模块跨时序。

---

## startup-cold-sequence (冷启动时序)

```
HTML 加载
    ↓
src/main.js 执行
    ↓
import { createLayerStore, createSortHistory, createCanvasMode }
    ↓
const currentLayerStore = createLayerStore()    # 空 store
const currentSortHistory = createSortHistory() # 默认 time / []
const currentCanvasMode = createCanvasMode()   # 默认 background
    ↓
bootstrapPersistence()  # Yjs 初始化
    ↓
currentLayerStore.bootstrapDefaults()  # 6 个初始层
    ↓
window.__sp1State = { getLayers, getCurrentAxis, ... }
    ↓
loop() 启动
```

---

## runtime-drag-reorder (运行时拖动排序)

```
用户在 observe-views 拖动卡片
    ↓
renderCards / renderTimeline / renderBlockMode 触发 onReorder callback
    ↓
src/main.js:applyObserveReorder(orderedIds, opts)
    ├─→ 写 thoughtById (Yjs)
    ├─→ thoughtBridge.updateOne()
    └─→ currentSortHistory.recordOrder(orderedIds)  ← SP-1 同步
             ↓
             sort-axis 内部:
             - manualOrder = orderedIds.slice()
             - activeAxes.push('manual')
             - currentAxis = 'manual'
             - recordEvolution()  # 1 分钟限速
```

---

## runtime-canvas-mode-switch (运行时切换 canvas-mode)

```
用户点击 [块模式] / [背景分区] tab
    ↓
buildCanvasTabs onSwitch callback
    ↓
sp1Host.setCanvasMode(m)
    ↓
refreshContent(root, mode, list, callbacks, sp1Host)
    ↓
content.innerHTML = ''
    ↓
canvas-mode === 'block'
  └─→ renderBlockMode(content, list, sp1Host, callbacks)
       ├─→ sp1Host.getCurrentOrder(list) → sp1.sort-axis.getCurrentOrder()
       └─→ grid.appendChild(makeCard(t))
canvas-mode === 'background'
  └─→ renderBackgroundMode(content, list, sp1Host, callbacks)
       ├─→ sp1Host.getLayers() → sp1.layer-store.list()
       └─→ 4 bucket 列 + 卡片
```

---

## persistence-todo-t24 (持久化,待实施 T2.4)

> **当前状态**: T2.4 持久化层**未实施**。toJSON/fromJSON 函数已有,Yjs 调用未接。

```
saveCanvasState (待实现)
    ↓
Y.Map.set('layers', currentLayerStore.toJSON())
Y.Map.set('sortHistory', currentSortHistory.toJSON())
Y.Map.set('canvasMode', currentCanvasMode.toJSON())
    ↓
Yjs → IndexedDB (y-indexeddb)

loadCanvasState (待实现)
    ↓
currentLayerStore.fromJSON(Y.Map.get('layers'))
currentSortHistory.fromJSON(Y.Map.get('sortHistory'))
currentCanvasMode.fromJSON(Y.Map.get('canvasMode'))
```

---

## cross-module-integration (跨模块接触点)

| 主空间 (main.js) | SP-1 (observe-views.js) | 数据 |
|---|---|---|
| `applyObserveReorder()` | `onReorder` callback | orderedIds |
| `window.__sp1State.setCurrentAxis(a)` | 排序轴 chip click | axis key |
| `window.__sp1State.recordManualOrder(ids)` | 卡片拖动事件 | thought ids |

---

## timing-constraints (时序约束)

| 操作 | 必须在...之前 |
|---|---|
| `currentLayerStore.bootstrapDefaults()` | `window.__sp1State` 暴露 |
| `window.__sp1State` 暴露 | 用户点 [V] 进观察模式 |
| 用户拖动 → recordOrder | UI 重新渲染时调 getCurrentOrder |

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md