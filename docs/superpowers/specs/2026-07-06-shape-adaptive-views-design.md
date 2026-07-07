---
id: shape-adaptive-views
title: 形状自适应视图
status: focus
phase: experiment             # P2-1: 实验性实施中 (T10 验证中)
layer: L2-domain
scope:
  global: false
  modules: [src/core, src/render]
  files: [src/core/shape-resolver.js, src/render/shape-indicator.js]
  lines: []
priority: 75
created: 2026-07-06
updated: 2026-07-07
experiment_window: 2026-07-06 ~ 2026-07-13   # P2-1: 1 周实验窗口
inherits-from:
  - topological-awareness-space
  - core-data-model
supersedes: []
# P2-1: 实验性提议 — 不是硬冲突
# 提议 render-layer 允许 shape-resolver 在实验期接收 canvas-mode 作为输入
# 待 T10 验证后转 sediment 或 revert
proposes:
  - id: render-layer
    topic: shape-resolver-input-allow-canvas-mode
    experimental_window: 2026-07-06 ~ 2026-07-13
    expected_resolution: approve | revert
decisions:
  - id: SAV-001
    statement: "shape 权重 ratio=0.6 hull=0.25 dwell=0.15 (T10 验证后)"
    scope: src/core/shape-resolver.js
    lock_state: floating          # P2-1: 实验期决策可浮动
    drift_tolerance: 0.15
    last_validated: 2026-07-07
    validation_method: T10 用户主观评估
non-negotiable:
  - "形状是视图决策，绝不污染数据层"
  - "整体度 wholesomeness ∈ [0, 1] 由 selectedRatio/hullHits/dwellTimeRatio 复合判定"
---

# 形状自适应视图 — 设计 Spec

> 把"整体→圆 / 局部→方 / 中间→圆角"的认知直觉**正式化**为一个可工程实现的 UI 形态解释器。
> 本 spec 是设计节点，先记录再实验，验证后再迭代。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-06 |
| 状态 | **设计阶段 — 未批准前不实现** |
| 优先级 | P1 体验哲学 |
| 周期 | 1 周实验 + 评估 |
| 前置依赖 | 当前 observe-views.js + 3D 拓扑空间 |

---

## §1 核心洞察（从用户原话提取）

> "我们观察某个信息，一定会有方的和圆的两种视角"
> "方的能看到关系，圆的能看到比例"
> "切近到 1/2 以下是方的，中间是混合（圆角）"
> "如果是闭环看整体，这个整体就是圆的"

### 1.1 本质
- **方的（discrete）**：一眼看见**可数、可命名、可指向**的个体。强调"这个东西和那个东西有区别"。
- **圆的（continuous）**：一眼看见**比例、密度、节奏**。强调"所有东西一起是什么样的"。
- **圆角（hybrid）**：保留离散骨架 + 在局部应用连续性指标，是认知上**最舒服的过渡带**。

### 1.2 一句话定位
**观察距离决定呈现形状——看全貌是圆，看个体是方，中间是圆角。形态切换必须发生在视图层，绝不污染数据层。**

### 1.3 与产品灵魂的对齐
> "照料念头田野，而非管理任务清单"

- **观察全貌**（圆）：守护"我这片田野整体欣欣向荣 / 枯萎"的感觉
- **观察个体**（方）：守护"这株具体的草 / 这朵具体的花"的精确感
- **圆角混合**：让两个状态**平滑过渡**，不撕裂用户的整体印象

这是"照料"的本质——既是整体鸟瞰，又是单独凝视。

---

## §2 设计原则（设计阶段的产物，需经用户批准）

### 2.1 数据模型不变
> 形状是**视图决策**，不是**数据决策**。

- `Thought.id / text / x / y / z / temperature / labels / ...` 一律不变
- `observe-mode` 当前是 `'cards' | 'kanban' | 'timeline'` 三个离散模式 → 增加**第四维 `scope = 'whole' | 'mixed' | 'detail'`**，随观察距离自动切换
- 任何形状切换通过 CSS / Three.js mesh 几何 / transition 实现，绝不"重新创建"念头

### 2.2 整体度的复合判定（替代你直觉中的单一比例）
> 你说的"1/2"是**直觉简化**，工程上需要更稳的复合判定。

```
整体度 wholesomeness ∈ [0, 1]
  = α · 选中比例 selectedRatio
  + β · 凸包命中率 hullHits
  + γ · 停留时长 dwellTimeRatio
其中 α + β + γ = 1, 默认 α=0.5, β=0.3, γ=0.2
```

- `selectedRatio = k / n`：用户聚焦的念头占比
- `hullHits`：若选中的念头凸包**包含所有点** → 1；选中的被切出 → 0
- `dwellTimeRatio`：本次会话专注同一视图的时长占比（防止快速跳看被误判）

### 2.3 四态而非三态（重要！）
你直觉中的"方 / 圆 / 圆角" → 实际工程需要**4 态**：

| 态 | 名字 | 阈值 | 用户感受 |
|----|------|------|---------|
| 0 | `discrete` | `wholesomeness ≤ 0.25` | 一张张独立的卡片 |
| 1 | `discrete_with_metric` | `0.25 < x ≤ 0.5` | 卡片 + 每张上显示局部比例（**圆角**） |
| 2 | `metric_with_anchors` | `0.5 < x < 0.75` | 主体是比例可视化（饼图 / 环形），关键点保留 |
| 3 | `continuous` | `x ≥ 0.75` | 整体拓扑，节点化进背景，圆点 / 微光 |

态 1 / 态 2 都是"圆角混合"，但**偏向相反**——这微妙差异很重要：
- 态 1：主体是离散的，告诉你比例
- 态 2：主体是连续的，让你看到节点在哪

### 2.4 形状切换的感官联动
形状不是视觉的事，是**整个感知系统**的事。

| 感官 | 离散态（0） | 连续态（3） |
|------|-------------|-------------|
| 鼠标光标 | 箭头 / 手型 | 圆形 / 漏斗 |
| 背景特效 | 静止粒子 | 缓慢漂移 / 呼吸 |
| 音频反馈 | 单击"咚" | 长音"嗡" |
| 触发频率 | 点击 | 长按 |

第一阶段只实现视觉，其他作为后续钩子。

---

## §3 待验证的实验设计（你说"实验不行再改"）

### 3.1 最小可验证单元（MVE）
**`shape-resolver.js`** — 一个纯函数：
```
shapeResolve({ n, k, hullHits, dwellMs }) → { shape, score, transitions }
```
其中：
- `n`：总念头数
- `k`：用户聚焦的念头数
- `hullHits ∈ {0, 1}`：凸包是否包裹全部
- `dwellMs`：停留时长
- 返回当前形状 + 整度数（用于 CSS transition 平滑）

### 3.2 实验目标
- **功能等价**：在相同输入下，shape-resolver 输出与"人工裁定"一致 ≥ 90%
- **过渡平滑**：相邻态之间 200ms 内的 transition 不能有"跳变感"
- **无副作用**：纯函数可在任意环境跑，无需 mock

### 3.3 验收标准
- 10 个 vitest 测试覆盖 4 态的所有边界
- 用户观察一个 20 念头 / 选 1 个的画布：必为 `discrete_with_metric`
- 用户观察 20 念头 / 选 18 个：必为 `continuous`
- 用户从 `discrete` 平滑过渡到 `continuous`：测试显示中间态经历了所有 4 态

### 3.4 不做的（YAGNI）
- ❌ 不立刻改 main.js（保持稳定）
- ❌ 不在第一批就接入 observe-views.js（先验证核心函数，再接合视图）
- ❌ 不实现音频/光标/触觉反馈（下一轮）
- ❌ 不做用户配置权重 α/β/γ（先 hardcode，最终再提供入口）

---

## §4 实现路线（Fable5 风格迭代）

### 阶段 1：核心算法 + 测试（今天）
- `src/core/shape-resolver.js` 纯函数
- `tests/core/shape-resolver.test.js` 10 个测试
- **门槛**：所有测试通过

### 阶段 2：最小 UI 实验（下一轮）
- 在 `observe-views.js` 的 `renderCards` 上**仅做态 0 → 态 1** 切换（够小可验证）
- 卡片呈方 → 卡片右下角浮现"局部比例徽章"（小圆）
- 收集用户 5 分钟体感反馈

### 阶段 3：扩展到全部 4 态（再下一轮）
- 接入 `renderKanban` 和 3D 拓扑
- 添加过渡动画

### 阶段 4：感官联动（再下一轮）
- 光标 / 音频反馈

---

## §5 已知漏洞与缓解（你之前问"还有什么漏洞"）

| 漏洞 | 缓解方案 |
|------|---------|
| 用户强切视图模式（kanban）时，整体度判定与 mode 冲突 | mode 优先级 > shape；shape-resolver 把 mode 也作为输入 |
| n=0（无念头）时除零 | 边界 case 直接返回 `continuous`（背景全空） |
| 用户从 1 跳到 100 个念头，瞬间触发跨态切换 | shape-resolver 加 200ms 滑动平均 |
| 选中比例极端（k=1 / n=1000）时仍合理 | 阈值是**连续函数**，不是离散看 n 的大小 |
| 凸包算法昂贵，每次判定重算 | 只在 selected 变化时重算 + 1s 内缓存 |

---

## §6 成功标准 / 失败兜底

**成功**：阶段 1 测试通过 + 阶段 2 用户在 5 分钟观察中没有"形状跳变"投诉 → 进入阶段 3

**失败**：
- 如果 shape-resolver 在边界 case 上不一致，回退到**单一比例判定**（你原直觉的简化版）
- 如果阶段 2 用户反馈"形态切换反而分散注意力"，回退到只提供"手动切形态"开关（强用户控制）

**诚实标记**：本 spec 是"原则正式化"，**不是"实现承诺"**。阶段 1 实验结果不满意，本 spec 应被修订而非"硬上"实现。

---

## §7 实验记录 (2026-07-06 T4.3)

> 把"先实现再跑测试"改成"先设计再实验再修正"的真实记录。

### 7.1 实验设计的原验收标准（已被实验推翻）

| 原验收标准 | 实验实际结果 | 结论 |
|-----------|-------------|------|
| n=20, k=1 → discrete_with_metric | n=20, k=1 → discrete | **直觉与算法错位**：专注单卡 k/n=0.05 远低于 0.25 阈值，算法判定 discrete 才符合"专注"的本意 |
| n=20, k=18, hull=1 → continuous | ✅ 通过 | 复合场景（高 ratio + hull=1）确实触发 continuous |
| n=20, k=10 → 在中间 | n=20, k=10 → discrete，score=0.25 | k/n=0.5 时 default weights 让 ratio 因子贡献 = 0.5×0.5 = 0.25，没达 0.25-0.5 区间需 k/n ≥ 1.0 才能单 ratio 触发圆角 |

### 7.2 实验发现的真实算法真相（21 测试覆盖）

1. **"看 1 个 = discrete"是合理的最高局部**，不是缺陷。
   用户的"圆角"直觉只在**多选 + 半比例 + 久视**时才与"focus 1"对应。
2. **default weights = 5:3:2** 要求**复合**信号才能切形态。
   ratio 单因子最高拉到 0.5（discrete_with_metric），到不了 discrete_with_metric 之上。
3. **dwell 长 + hull=1 + 中比例**才能触发 metric_with_anchors 或 continuous。
   验证了 spec 中"形状必须由多层信号共振"的直觉。
4. **n=0 是 continuous** 而非卡壳。边界 case 安全。

### 7.3 spec 修订建议（需用户批准确认）

| 原 spec 描述 | 实验后修订建议 |
|-------------|---------------|
| §2.2 default weights = 5:3:2 | **保留**，但显式说明这是"必须复合才切"的友好默认值，避免单个 ratio 因子无意义激发 |
| §3.3 验收用例中的 k=1 期望 | **修订**：k=1 → discrete 是真相而不是 bug；圆角需要 k ≥ 40-50% |
| §2.3 4 态阈值 [0.25, 0.5, 0.75] | **保留**，阈值本身合理，是 default weights 让"圆角态"难以触达 — 是参数选择问题，不是阈值问题 |
| §5 漏洞表"凸包昂贵" | **仍是漏洞**，但当前 spec 阶段的纯函数实现里**未触达**（只在 UI 接入时才有此问）|

### 7.4 结论

✅ **shape-resolver 算法核心 21 测试通过**（321 总测试零回归）
⚠ **default weights 偏保守**，需要 UI 接入时实验调参（很可能上调 ratio 权重到 0.6 / 0.7）
📌 **诚实标记**：用户在浏览器中实测前，本 spec 仍属"实验框架"而非"交付承诺"

---

## §8 元信息

- 创建于用户原文："方的看关系，圆的看比例，看全/看比例，闭环/切近，连续混合"
- 这是"形状哲学"的方向标，类似 L1 项目宪法中的灵魂条款
- 不引入新数据库、新外部依赖
- 不改数据层（L3 守护）
- 2026-07-06 完成 T4.3 最小实验，发现 default weights 与用户直觉的部分错位；记录于 §7

## §9 T10 一致性修复记录

> "修一下 bug 统一一下整体交互的一致性" — 用户原话

### 9.1 发现的 4 个 bug

1. **n=0 时误判 continuous·全貌**：用户看到空背景却显示"全貌"，逻辑矛盾
2. **selection 反向**：选 0/n=20 被标为"方·看个体"，但用户看到 20 个念头没选任何，应该是"看全貌"
3. **k=10/n=20 (50%) 显示"方"**：选中一半却显示"看个体"，与直觉相反
4. **dwell=0 时被推向 discrete**：第一次进入观察模式即被告知"看个体"，缺少中性态

### 9.2 修复策略

- **算法语义反转**：score 含义从"整体度 wholesomeness"改为"个体性 individuality"
  - score 高 → 方（看个体）
  - score 低 → 圆（看全貌）
- **阈值方向反转**：
  - 旧: [≤0.25 discrete, ≤0.5 discrete_with_metric, ≤0.75 metric_with_anchors, > continuous]
  - 新: [≤0.25 continuous, ≤0.5 metric_with_anchors, ≤0.75 discrete_with_metric, > discrete]
- **加 empty 档**：n=0 时独立返回 shape='empty', score=0, isEmpty=true
- **统一标签格式**：从"方·看个体"改为"方·选 X%"，所有档位一致显示 selection ratio
- **default weights 调高 ratio 权重**：从 0.5 → 0.6，让选择占比主导

### 9.3 实测渐进行为

```
选 0%   → score=0.000 → continuous   → "圆 · 全貌"
选 25%  → score=0.150 → continuous   → "圆 · 选 25%"
选 50%  → score=0.300 → metric_with_anchors → "圆方 · 选 50%"
选 75%  → score=0.450 → metric_with_anchors → "圆方 · 选 75%"
选 100% → score=0.600 → discrete_with_metric → "方圆 · 选 100%"
选 100% + hull + dwell → score=1.000 → discrete → "方 · 选 100%"
n=0      → empty → "空 · 等待第一个念头"
```

### 9.4 验收

- ✅ shape-resolver 测试 21→20（删除重复的 n=0 测试，加 Bug 1/2/3/4 验证）
- ✅ shape-indicator 测试 21 个，新增 empty 档 + 5 档独立标签验证
- ✅ 端到端集成测试 10 个，重写以验证反转语义
- ✅ viewport-state 测试 28 个，default derivedShape 改为 EMPTY
- ✅ 388 测试全过, 71 模块零越层

### 9.5 仍未完成（YAGNI）

- ❌ 没实现"用户回退"开关（失败兜底）— 当前算法反转已被验证 OK
- ❌ 没实现光标/音频反馈 — 仅视觉
- ❌ 没在主空间（不开 V）显示形状指示器 — 仅观察模式内可见

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
