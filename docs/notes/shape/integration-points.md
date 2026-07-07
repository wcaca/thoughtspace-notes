# 形状哲学 · 接触点 (integration-points)

> 本文件记录 shape-resolver.js 与外部模块的依赖 / 事件 / 全局变量接触点。
> 代码中对应 `@note(shape, integration, <anchor>, since:...)` 注释。

## flag-resolver-injection

**接触点**:`src/runtime/flags/bootstrap.js` → `src/core/shape-resolver.js`

**流向**:
```
src/runtime/flags/bootstrap.js
  │ 调用 setShapeFlagResolver(getVariant)
  ↓
src/core/shape-resolver.js
  │ _flagResolver = getVariant
  │ shapeResolve() 内部调用 _flagResolver('shape-resolver-weights-v2')
  ↓
返回 WEIGHT_PROFILES[variantName]
```

**关键约束**:
1. 注入必须在 shapeResolve() 首次调用前完成(否则回退 balanced)
2. src/core 不能 import src/runtime(架构约束 core-no-runtime)
3. _flagResolver 是模块级单例,注入后全局生效

**代码**:`src/core/shape-resolver.js` 行 94-110。

## shape-indicator-consumption

**接触点**:`src/render/shape-indicator.js` ← `src/core/shape-resolver.js`

**流向**:
```
src/render/observe-views.js
  │ 调用 describeShape(snapshot)
  ↓
src/render/shape-indicator.js
  │ describeShape(snapshot) → { shape, score, label, ... }
  │ applyShapeToBar(el, desc) → 更新进度条宽度
  │ applyShapeToLabel(el, desc) → 更新文字标签
  ↓
DOM 渲染(形状指示器)
```

**关键约束**:
1. shape-indicator.js 是纯消费方,不反馈数据到 shape-resolver
2. describeShape 接收 viewport-state snapshot,内部调用 shapeResolve
3. 视觉映射:高 individuality → 方形指示器,低 → 圆形

**代码**:`src/render/shape-indicator.js`(消费方)。

## viewport-state-input

**接触点**:`src/render/viewport-state.js` → `src/core/shape-resolver.js`

**流向**:
```
src/render/viewport-state.js
  │ bridge.getState() → { n, k, hullHits, dwellMs, ... }
  ↓
src/render/observe-views.js
  │ snapshot = bridge.getState()
  │ desc = describeShape(snapshot)
  ↓
src/core/shape-resolver.js
  │ shapeResolve({ n, k, hullHits, dwellMs })
```

**关键约束**:
1. viewport-state 是唯一数据源(n/k/hullHits/dwellMs)
2. shape-resolver 不直接订阅 viewport-state,由 observe-views.js 中转(避免 core→render 依赖)

**代码**:`src/render/observe-views.js` 行 238-245(updateShapeIndicator 函数)。

## sp1-observe-views-host

**接触点**:`src/render/observe-views.js` ← `window.__sp1State`(SP-1 全局状态)

**流向**:
```
src/render/observe-views.js
  │ window.__sp1State?.getCanvasMode()
  │ window.__sp1State?.setCanvasMode(m)
  ↓
SP-1 双模式(background/block)
```

**关键约束**:
1. window.__sp1State 是 SP-1 的全局状态桥(详见 sp1 集成笔记)
2. canvas-mode 与 observe-mode 正交(详见 sp1 decisions)
3. canvas-mode=block 时,shapeResolve 的输入不来自 viewport-state,而来自 sp1 layer-store

**代码**:`src/render/observe-views.js` 行 82-92。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../methodology/04-on-demand-notes.md
