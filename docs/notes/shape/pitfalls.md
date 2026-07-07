# 形状哲学 · 易错陷阱 (pitfalls)

> 本文件记录 shape-resolver.js / shape-indicator.js 实施过程中踩过的坑。
> 代码中对应 `@note(shape, pitfall, <anchor>, since:...)` 注释。

## T10-semantic-inversion

**症状**:T10 之前,score 高 → 圆(全貌),score 低 → 方(个体)。语义反直觉 — "看得多"应该个体性强(方),不应该变圆。

**根因**:最初设计把 score 当作"全貌度"而非"个体性",导致高 score = 全貌 = 圆。但用户体感是"我聚焦看一个东西 = 个体性强 = 方",与 score 高对应矛盾。

**修复**:T10 语义反转 — score 重定义为 individuality(个体性)。高 → 方(看个体),低 → 圆(看全貌)。

**验证**:tests/core/shape-resolver.test.js 的 T10 测试组覆盖。

**代码**:`src/core/shape-resolver.js` 行 7-14。

## T10-bug1-empty-state-misjudged

**症状**:n=0(无念头)时,旧代码返回 shape='continuous'(圆·全貌),但空状态不应该是"全貌"。

**根因**:n=0 时 buildSelectedRatio 返回 0,score=0,pickShape(0) → CONTINUOUS。逻辑上没错但语义错 — 空状态应该单独处理。

**修复**:n=0 时直接返回 isEmpty=true, shape='empty', score=0,不进入正常评分流程。

**代码**:`src/core/shape-resolver.js` 行 22, 117-127。

## T10-bug2-selection-reversed

**症状**:k=0(未选中任何念头)时,旧代码返回低 score → 圆(全貌);k=n(全选)时返回高 score → 方(个体)。但 k=0 应该是"看全貌"(圆),k=n 应该是"看个体"(方)。这两个反了。

**根因**:buildSelectedRatio = k/n,k=0 → ratio=0 → score 低 → 圆;k=n → ratio=1 → score 高 → 方。T10 反转后语义正好对 — 但反转前是 k=0 → 方(错)。

**修复**:T10 反转后自动修正。无需额外代码变更,只需语义重定义。

**代码**:`src/core/shape-resolver.js` 行 23, 69-72。

## T10-bug3-threshold-0.5-ambiguity

**症状**:score=0.5 时,既可能是 metric_with_anchors(≤0.5)也可能是旧 discrete_with_metric(>0.5)。边界归属不明。

**根因**:阈值定义用 `<=`,导致 0.5 落在 metric_with_anchors。但旧代码可能有 `>=` 导致 0.5 落在 discrete_with_metric。

**修复**:统一用 `<=`,0.5 归 metric_with_anchors。THRESHOLDS 数组明确 `{ max: 0.5, shape: METRIC_WITH_ANCHORS }`。

**代码**:`src/core/shape-resolver.js` 行 24, 52-57, 87-92。

## T10-bug4-dwell-zero-misjudged

**症状**:dwell=0(未停留)时,旧代码可能因 hull 或 ratio 高而推到方档,但用户根本没停留看,不应该是方。

**根因**:dwell 不参与评分时,ratio + hull 可能足以推高 score 到方档。但 dwell=0 意味着用户没真正"看",individuality 应该低。

**修复**:dwell=0 时 buildDwellRatio 返回 0,自然拉低 score。默认权重 dwell=0.15,足够把 score 拉到圆档。T10 反转后自动修正。

**代码**:`src/core/shape-resolver.js` 行 25, 74-79。

## flag-resolver-silent-catch

**症状**:`_flagResolver('shape-resolver-weights-v2')` 抛异常时,catch {} 静默吞掉,回退到 balanced profile。用户不知道 flag 系统出问题了。

**根因**:行 107 `try { ... } catch {}` 完全静默,无日志无告警。

**风险**:flag 系统故障时,所有用户回退到 balanced,实验组失效但无人知晓。

**缓解**:目前接受静默回退(实验阶段容错优先)。未来可加 console.warn 或 telemetry。

**代码**:`src/core/shape-resolver.js` 行 103-109。

## isEdge-boundary-precision

**症状**:score 在阈值附近(0.25/0.5/0.75 ±0.03)时,isEdge=true。但 ±0.03 窗口可能太窄,实际使用中 score 跳变频繁。

**根因**:行 147-149 硬编码 ±0.03 窗口。

**风险**:窗口太窄 → 边界态 rarely 触发;窗口太宽 → 边界态 too frequent。需要体感验证调整。

**代码**:`src/core/shape-resolver.js` 行 147-149。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../methodology/04-on-demand-notes.md
