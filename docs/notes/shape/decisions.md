# 形状哲学 · 关键决策 (decisions)

> 本文件记录 shape-resolver.js 不可逆的设计决策。
> 代码中对应 `@note(shape, decision, <anchor>, since:...)` 注释。

## why-individuality-not-wholesomeness

**决策**:score 重定义为 individuality(个体性),不是 wholesomeness(全貌度)。

**为什么**:T10 之前 score = wholesomeness(高→圆·全貌),但用户体感矛盾 — "我聚焦看一个东西"应该个体性强(方),不应该因为"看得多"就变圆。反转后 score = individuality(高→方·个体),与用户体感一致。

**代价**:反转破坏了 5 天前的 spec 语义,需要同步反转 shape-indicator.js 的视觉映射(高 individuality → 方形指示器,低 → 圆形)。

**不可逆性**:一旦反转,所有下游视觉/交互都依赖新语义。再反转回来会破坏 20 个测试 + 视觉映射。

**代码**:`src/core/shape-resolver.js` 行 7-14。

**spec**:`docs/superpowers/specs/2026-07-06-shape-adaptive-views-design.md` §2.1。

## why-4-levels-not-continuous

**决策**:用 4 档离散形状(continuous / metric_with_anchors / discrete_with_metric / discrete),不是连续渐变。

**为什么**:
1. 离散档位有明确语义(圆/圆方/方+/方),用户可感知"我在哪一档"
2. 连续渐变会让 UI 状态不可枚举,测试无法覆盖所有组合
3. 4 档对应 4 种视觉形态,设计可针对性优化

**代价**:score 在阈值附近会频繁跳档(用 isEdge 缓解)。

**不可逆性**:档位数改变会破坏所有视觉映射 + 测试。

**代码**:`src/core/shape-resolver.js` 行 28-41, 52-57。

## why-default-weights-0.6-0.25-0.15

**决策**:默认权重 ratio=0.6 / hull=0.25 / dwell=0.15。

**为什么**:
1. ratio(选中比)最能反映"看个体还是全貌" — k/n 直接映射个体性,权重最高 0.6
2. hull(凸包命中)是辅助信号 — 用户是否在看边界,权重 0.25
3. dwell(停留)是最弱信号 — 停留长不一定是个体性强,权重 0.15

**代价**:dwell 权重低意味着"长时间看全貌"不会把 score 拉太低,可能不够"圆"。

**待验证**:默认权重是 balanced profile,通过 flag `shape-resolver-weights-v2` 可切换其他 profile 做对比实验。

**代码**:`src/core/shape-resolver.js` 行 43, 45-50。

## why-flag-resolver-injection

**决策**:通过 `setShapeFlagResolver(fn)` 注入 flag resolver,不是直接 import。

**为什么**:
1. 避免 src/core 直接 import src/runtime(违反 L1 架构约束 core-no-runtime)
2. 注入方式便于测试 mock(测试时传 null 或假 resolver)
3. 解耦 — shape-resolver 不依赖 flag 系统的具体实现

**代价**:注入时机依赖 bootstrap 序列(必须在 shape-resolver 首次调用前注入),否则回退到 balanced。

**代码**:`src/core/shape-resolver.js` 行 94-110。

**接触点**:见 [integration-points.md#flag-resolver-injection](integration-points.md#flag-resolver-injection)。

## why-7-day-experiment-window

**决策**:形状哲学的实验窗口设为 7 天(2026-07-06 ~ 2026-07-13)。

**为什么**:
1. 7 天覆盖一个完整工作周,体感数据足够
2. 不太长(避免实验拖沓)也不太短(避免数据不足)
3. 与 SP-1 的 7 天窗口对齐,便于同步评估

**代价**:7 天后必须决策 — 升级到 beta 还是回退。如果体感数据不足,需要延期决策。

**代码**:`docs/superpowers/specs/2026-07-06-shape-adaptive-views-design.md` frontmatter experiment_window。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../methodology/04-on-demand-notes.md
