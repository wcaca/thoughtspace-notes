# SP-1 关键决策记录

> **本文件目标**: 记录 SP-1 范围内**不可逆的架构决策**,防止未来 agent 重写时困惑"为什么这么做"。

---

## why-window-globals

**决策**: SP-1 用 `window.__sp1State` 暴露给 observe-views,**不**用 ESM import  
**时间**: 2026-07-07  
**原因**:

1. **observe-views.js 是观察模式 UI**,自身是被 main.js 装配的
2. 如果 main.js `import observe-views`,而 observe-views 又 `import` main.js 的 store → **循环依赖**
3. ESM 循环依赖会导致 TDZ 和 undefined

**替代方案评估**:

| 方案 | 问题 |
|---|---|
| ESM import store | 循环依赖 |
| 函数参数传递 store | 改 observe-views 的 showObserveView 签名,影响所有调用方 |
| **window.__sp1State (采用)** | **轻微全局污染,但解耦干净** |
| 事件总线 | 过度设计,3 个 store 不需要 |

**代价**: 失去编译期类型检查;运行时未挂载会报 `__sp1State is undefined`  
**缓解**: 装配代码有 try/catch,observe-views 检查 `if (typeof window !== 'undefined' && window.__sp1State)`

---

## why-bootstrap-6-layers

**决策**: 默认 6 层 (3 conscious + 3 subconscious)
**时间**: 2026-07-07
**原因**: 用户的原始示例 ("显意识 3 层 + 潜意识 3 层")
**代价**: 用户初次接触会看到 6 层,可能感觉多;若只需要 3 层,需要手动 remove
**缓解**: 提供 `bootstrapLayerDefaults()` 重置 + `add / remove` 任意调整
**可覆盖**: 用户可调 `add` / `remove` 完全自定义层数

**为什么不是 4 层**: 已有 spec 拓扑意识空间定义 Y 轴 4 层(L0-L3),但那是 **3D 空间的 Y 轴**,与 SP-1 的**用户自定义意识层级**语义不同。
- Y 轴 4 层 = 物理空间的连续坐标
- 用户自定义 N 层 = 意识认知的离散结构

SP-3 时再做映射。

---

## why-sort-axis-default-time

**决策**: 默认排序轴是 `time`
**时间**: 2026-07-07
**原因**: 用户原话 "如果有一种固定的排序方式进行规定性,可能会让这种**信念信息被压制**"
**代价**: 用户看到的是"时间顺序",可能感觉无序;若想看热度需要手动切
**缓解**: 顶部 [召唤手势](integration-points.md) 可随时展开排序轴条切换

**评估**:
- 默认按 time → 反映"念头出现顺序",最弱信号,最不压制
- 默认按 heat → 反映"注意力热点",但可能误导
- 默认按 manual → 无意义(空)

**采用**: time

---

## why-no-layer-in-background-mode-yet

**决策**: 背景模式当前用**温度分桶**作为 SP-1 简化版,**不**用 layer-store 真分层  
**时间**: 2026-07-07  
**原因**:

1. **真分层需要把念头分到具体层**——但 Thought 当前没 layerId 字段
2. **schema 变更破坏数据模型**——违反"数据层不变"原则
3. 温度分桶已经有物理基础(temperature 是已有字段)

**未来改进** (SP-3 时):
- Thought 增加可选 `layerId` 字段(soft reference)
- `classify(thought, layerStore)` 把念头分到对应层
- 背景模式从"温度分桶"升级为"真分层"

**代价**: 短期简化实现,但用户可能分不清"层 vs 温度"  
**缓解**: 顶部 layer-info 显示"6 个层"提示用户层是独立维度

---

## why-summon-btn-click-only

**决策**: 召唤手势只实现单击,长按待真实浏览器调优  
**时间**: 2026-07-07  
**原因**:

1. jsdom 不支持真实触摸事件
2. 长按阈值因设备而异(600ms 是经验值,需真实体验)
3. 单击作为基础入口已足够

## why-canvas-mode-orthogonal-to-observe-mode

**决策**: canvas-mode (background/block) 与 observe-mode (cards/kanban/timeline) 正交,任意组合
**时间**: 2026-07-07
**原因**: 这是用户的核心需求

> "等于一个视图可以切换为两种模式"

不是 6 个模式(cards×background, cards×block, kanban×background, ...)
而是 3 + 2 = 5 种有意义组合(去重重复)

**代价**: 实现复杂度高(2 × 3 = 6 种渲染路径,部分组合简化)
**缓解**: SP-1 实际只用 5 种(canvas-mode=block 时忽略 observe-mode)

**简化**: SP-1 实现时,canvas-mode=block 时**忽略** observe-mode,统一按当前排序轴渲染。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md