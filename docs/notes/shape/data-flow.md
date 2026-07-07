# 形状哲学 · 数据流向 (data-flow)

> 本文件记录 shape-resolver.js 的数据流转路径。
> 代码中对应 `@note(shape, data-flow, <anchor>, since:...)` 注释。

## resolve-pipeline

**完整管线**:从用户交互到形状判定。

```
用户交互(选中/停留/凸包命中)
  │
  ↓
src/render/viewport-state.js
  │ 更新 state: { n, k, hullHits, dwellMs }
  │ bridge.getState() → snapshot
  ↓
src/render/observe-views.js
  │ updateShapeIndicator()
  │ snapshot = bridge.getState()
  ↓
src/render/shape-indicator.js
  │ describeShape(snapshot)
  ↓
src/core/shape-resolver.js
  │ shapeResolve({ n, k, hullHits, dwellMs })
  │
  │ Step 1: safeN / safeK 防御性处理
  │ Step 2: n=0 → isEmpty=true, 返回 early
  │ Step 3: ratioPart = k/n (clamp01)
  │ Step 4: hullPart = hullHits ? 1 : 0
  │ Step 5: dwellPart = dwellMs 分段映射(0/10s/30s)
  │ Step 6: w = resolveWeights() (flag 或默认)
  │ Step 7: score = normR*ratio + normH*hull + normD*dwell
  │ Step 8: pickShape(score) → 4 档之一
  │ Step 9: isEdge = score 在阈值 ±0.03 范围
  ↓
返回 { shape, score, isEmpty, isEdge, transitions, factors, mode }
  ↓
src/render/shape-indicator.js
  │ applyShapeToBar / applyShapeToLabel
  ↓
DOM 渲染
```

**关键节点**:
1. viewport-state 是唯一输入源
2. shapeResolve 是纯函数,无副作用
3. flag resolver 在 Step 6 注入,影响权重

**代码**:`src/core/shape-resolver.js` 行 112-160。

## weight-resolution

**权重解析流**:从 flag 到权重 profile。

```
shapeResolve() 调用 resolveWeights(weights)
  │
  ├─ weights 参数显式传入? → 用 weights 合并 DEFAULT_WEIGHTS
  │
  └─ weights 未传入? → 查 _flagResolver
       │
       ├─ _flagResolver 存在? → 调用 _flagResolver('shape-resolver-weights-v2')
       │    │
       │    ├─ 返回 'ratio-first' / 'hull-first' / 'dwell-first' / 'balanced'
       │    │    → 用对应 WEIGHT_PROFILES
       │    │
       │    └─ 异常或无效值 → catch {} → 回退 balanced
       │
       └─ _flagResolver 不存在 → 用 DEFAULT_WEIGHTS (= balanced profile)
```

**关键约束**:
1. flag resolver 是可选的(测试时不注入)
2. 异常静默回退(实验阶段容错优先)
3. WEIGHT_PROFILES 是 Object.freeze,运行时不可改

**代码**:`src/core/shape-resolver.js` 行 100-110。

## threshold-mapping

**阈值映射流**:从 score 到 shape。

```
score ∈ [0, 1]
  │
  ├─ score ≤ 0.25    → CONTINUOUS (圆 · 全貌)
  ├─ 0.25 < score ≤ 0.5  → METRIC_WITH_ANCHORS (圆方 · 看大部分)
  ├─ 0.5 < score ≤ 0.75  → DISCRETE_WITH_METRIC (方+ · 看一半)
  └─ 0.75 < score ≤ 1.0  → DISCRETE (方 · 看个体)

isEdge 检测:
  score ∈ (0.22, 0.28) ∪ (0.47, 0.53) ∪ (0.72, 0.78)
  → isEdge = true (阈值边界态,视觉可加过渡动画)
```

**关键约束**:
1. 阈值用 `<=`,0.5 归 METRIC_WITH_ANCHORS(不归 DISCRETE_WITH_METRIC)
2. isEdge 窗口 ±0.03,可调
3. THRESHOLDS 数组顺序即 SHAPE_ORDER 顺序

**代码**:`src/core/shape-resolver.js` 行 52-57, 87-92, 147-149。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../methodology/04-on-demand-notes.md
