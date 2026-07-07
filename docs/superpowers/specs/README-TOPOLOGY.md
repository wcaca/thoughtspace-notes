# Spec 拓扑规则系统 — 实施指南

> 让多个 spec 共存而不互相压制：**多层非绝对指导性 + 显式覆盖 + 优先级裁决**。

## 1. 设计哲学

**准确性的本质不是"唯一正确答案"，而是"在正确层、用正确 scope、给出正确强度的指导"。**

多 spec 共存 = 多视角叠加 ≠ 互相压制。四原则：

- **分层而非平铺**：底层提供"不可妥协的不变量"，上层提供"可协商的选择"
- **局部优先**：scope 越小，优先级越高（行 > 文件 > 模块 > 全局）
- **显式覆盖**：只有声明 `overrides:` 的 spec 才能压制另一个；声明本身是文档资产
- **状态衰减**：废弃 spec 自动失声，孤儿 spec 默认失声但可"复活"

## 2. Spec 拓扑元数据 Schema（YAML frontmatter）

每个 spec 的 markdown 顶部应包含以下 frontmatter（最少四件套 + 推荐扩展）：

```yaml
---
id: <kebab-case-id>              # 唯一 ID（必填）
title: <人类可读标题>             # 必填
status: <base|focus|sediment|deprecated|orphan>  # 必填
layer: <L0|L1|L2|L3|L4>          # 必填
scope:                            # 必填，至少一项
  global: false
  modules: [src/core, src/persistence]
  files: [src/core/thought.js]
  lines: []                       # 空=未声明行级
priority: 50                       # 0-100，同层时数值大者胜（推荐显式声明）
created: 2026-07-07                # 必填
updated: 2026-07-07                # 推荐，每次修改时更新

inherits-from:                    # 父层引用（推荐）
  - topological-awareness-space
  - geb-infrastructure-bootstrap

overrides:                        # 显式覆盖其它 spec 的部分规则（可选）
  - id: shape-adaptive-views
    on-topic: [view-binding]
    reason: "数据模型先于视图绑定, 此处锁定 contract"

conflicts-with:                   # 已知冲突，不裁决，只预警（可选）
  - id: phase-0-lightweight-restructure
    topic: layer-naming

supersedes: []                    # 显式取代（单向，可选）
superseded-by: <id>               # 若有，status 应为 deprecated（可选）

decisions:                        # 本 spec 的局部决策清单（可选）
  - id: DM-001
    statement: "Thought 节点必须有 geometry 字段"
    scope: src/core/thought.js
    rationale: "拓扑仿真需要位置信息"

non-negotiable:                   # 不可妥协条目（即使被 overrides 也保留）
  - "Yjs 是唯一权威数据源"
---
```

## 3. 五层层级

| 层 | 名称 | 职责 | 典型 spec |
|---|---|---|---|
| L0 | `L0-principle` | 产品灵魂、不可妥协不变量 | (待升 L1 宪法) |
| L1 | `L1-architecture` | 模块边界、依赖方向、权威数据源 | geb-infrastructure-bootstrap, topological-awareness-space |
| L2 | `L2-domain` | 领域原则（GEB / 形状哲学 / 方法论） | shape-adaptive-views, kanban-layered-space |
| L3 | `L3-implementation` | 实现约定（数据模型、持久化、仿真、渲染） | core-data-model, persistence-yjs-bridge, topology-sim, render-layer |
| L4 | `L4-decision` | 局部决策、案例沉淀、bug 修复记录 | sp1-kanban-layered-impl, debug/case notes |

**层间关系**：

- L1 可"收紧"L0 的解释，但不可"放宽"L0（约束只能变强）
- L2 提供"领域内多条并列路径"
- L3 是"在 L2 选定路径上的工程化落地"，可对 L2 的同主题做 `overrides:`
- L4 是"局部记录"，其指导性最低

**覆盖 vs 并行**：

- 跨层：默认**覆盖**（高层引用低层不变量 + 添加约束）
- 同层：默认**并行**（除非显式 `overrides:`）

## 4. 冲突检测算法

```
INPUT: spec 集合 S, 候选决策 D (新写 / 修改代码)
OUTPUT: conflicts, warnings

1. 加载所有 spec 的 frontmatter, 构索引 I = (id → meta)
2. 解析 D 的 affected_scope = 模块/文件/行
3. FOR each s in S WHERE intersects(s.scope, D.affected_scope):
     topic = extract_topic(s, D)
     IF s.id in D.overrides:
       记录为「显式压制」, 不报冲突
     ELIF D inherits from s AND s.has_non_negotiable(topic):
       报错 FATAL (违反不变量)
     ELIF exists s' in S WHERE s'.conflicts_with contains s.id AND topic matches:
       报告 WARNING (已知冲突, 不裁决)
     ELSE:
       入候选集 C
4. 裁决 C (见 §5 规则), 输出最终覆盖链
5. 若无覆盖链且 |C| > 1:
     报告 INFO (同层并列, 不强制)
```

## 5. 优先级裁决规则（5 条，按顺序短路）

1. **层优先级（L0 > L1 > L2 > L3 > L4）**：高层引用低层不变量；若高层声明的规则与低层冲突且非"收紧"，门禁立即 FATAL
2. **`non-negotiable` 不可被覆盖**：任何 spec 的 `non-negotiable` 列表都是 hard constraint，即使被 `overrides` 命中也保留
3. **`overrides` 显式压制**：当 A.overrides 包含 B.id 且 A.status ∈ {base, focus, sediment}，A 在 `on-topic` 范围内胜出。`deprecated` 与 `orphan` 状态的 overrides 自动失效
4. **scope 收窄优先**：同层时，更小 scope 胜出（行 > 文件 > 模块 > 全局）
5. **时间 + priority 决胜**：scope 相同时，`priority` 数值大者胜；仍平局则 `updated` 时间新者胜

## 6. 多层非绝对指导性下准确性的保障

| 风险 | 保障手段 |
|---|---|
| 多 spec 互相压制 → 失去并列视角 | 同层默认并行，只在显式 `overrides` 时覆盖 |
| 底层过严扼杀上层创新 | L0/L1 用 `non-negotiable` 限定"必须守住的少数条款"，其余皆可协商 |
| 上层悄悄破坏底层 | L3/L4 引用 L1/L2 必须 `inherits-from`，门禁校验 L1 不变量未被破坏 |
| scope 重叠造成隐性冲突 | 冲突检测算法步骤 3 强制广度匹配 + topic 抽取 |
| 废弃 spec 复活误导 | `status: deprecated` 的 overrides 自动失声；`orphan` 默认失声且需 `priority ≥ 80` 才能复活 |
| 时间漂移导致规则过气 | 每月一次 audit 检查 `updated > 90 天` 的 spec，提示刷新或归档 |

## 7. 门禁检查要点

### FATAL（拒绝合并）

- F1. 任何 spec 缺失 `id / status / layer / scope` 四件套
- F2. 声明 `inherits-from` 但父 spec 的 `non-negotiable` 被违反
- F3. 跨层覆盖方向倒置（L3 试图放宽 L1）
- F4. `overrides` 目标 spec 状态为 `base`，且无 `reason` 字段
- F5. `status: deprecated` 的 spec 仍被代码引用（`.holo-index.json` 检出）

### WARN（提示但不阻塞）

- W1. `conflicts-with` 列表非空
- W2. `priority` 未填写或为 0（建议显式声明）
- W3. `updated` 超过 90 天
- W4. `scope.global: true` 与 `scope.modules` 同时声明（建议二选一）
- W5. 同层 spec 在相同 `scope` 内重复声明同一 topic

### INFO（观察项）

- I1. 同层并列的活跃 spec 数量 > 5
- I2. 没有任何 spec 的 `scope.lines` 非空
- I3. `orphan` 状态 spec 长期未复活

## 8. 准确性公式（供月度审计）

```
accuracy(spec_set) = 
  Σ coverage(non_negotiable) × 1.0
+ Σ consistency(layer+overrides) × 0.8
+ Σ freshness(1 / (1 + days_since_update / 90)) × 0.5
- Σ unresolved_conflicts × 0.3
```

不要求唯一最大值，而是"覆盖率 + 一致性 + 新鲜度 - 冲突"的加权和。