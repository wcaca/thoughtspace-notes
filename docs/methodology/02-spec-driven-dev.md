# 方法 02 · spec 驱动开发

> **TL;DR**:
> 1. **spec 是 single source of truth** — 代码、plan、测试都从 spec 派生
> 2. **每次改动前先改 spec** — 不可先写代码再补 spec
> 3. **plan 必须落到 task** — 每个 task 精确到文件 / 行数 / 测试 / 验收
> 4. **回退点每个 task 一个** — 出错停在当天,不进入下一天

## §1 流程

```
design.md (spec)        ← 来自方法 01
  │
  ├─→ plan.md (实施计划)  ← writing-plans skill
  │    │
  │    └─→ task 1 / task 2 / ... (精确到文件行数)
  │         │
  │         └─→ 实施 + 测试
  │              │
  │              └─→ 回退? 停在当天 / 继续
  │
  └─→ 验收: spec §验收标准 → e2e 测试
```

## §2 spec 文档模板

```markdown
# <topic> 设计 Spec

## §1 核心洞察 (从用户原话提取)
- 引用 3-5 条用户原话
- 提炼为设计原则

## §2 核心原则 (设计阶段的产物,需经用户批准)
- 列出 3-5 条原则
- 每条写明依据

## §3 数据模型
- 数据结构 + 字段含义
- 不变式 (invariant)

## §4 UI 架构 (如适用)
- 组件分解
- 交互时序

## §5 验收标准
- 功能 / 数据 / 哲学 三层

## §6 实施计划 (粗粒度)
- 列出 5-10 个 task

## §7 风险与未决项
- 已知风险
- 待用户后续输入的未决项

## §8 与既有 spec 的关系
- 引用 / 扩展 / 替代 / 冲突

## §9 元信息
- 创建日期 / 触发 / 状态
```

## §3 plan 文档模板

```markdown
# <topic> 实施 Plan

## §1 与既有工作的关系
- 精确到行号的引用表

## §2 涉及的具体功能清单
- 精确到函数 / UI 元素 / 数据结构
- 行数估计

## §3 精确编程实施时间线
- 每个 task: 起止 / 文件 / 行数 / 测试 / 验收
- 总计: 行数 + 测试数

## §4 风险与回退点
- 每个风险 + 回退策略

## §5 与 sub-project 的衔接

## §6 元信息
```

## §4 关键原则

### 4.1 不可先写代码后补 spec

如果代码已经写了,spec 就要**追溯**而不是事后补。**补救**:把已有代码反向写到 spec,**记录偏差**。

### 4.2 task 必须可独立验收

每个 task 必须有:
- **明确的"完成"定义** — 不是"做了一些"
- **可跑的测试** — 不能是"我觉得 OK"
- **回退点** — 失败后能回到前一 task

### 4.3 spec 状态变化 = 拓扑表更新

spec 从 🟡 焦点 → 🔵 沉淀 → ⚪ 废弃 都要在 [topology-priority.md](../topology-priority.md) 登记。

## §5 与其他方法的关系

| 上游 | 下游 |
|---|---|
| **01 设计思维** | 03 拓扑表 — spec 登记 |
| 03 拓扑表 | **06 架构守卫** — 改动前查状态 |

## §6 我们的实践

- [docs/superpowers/specs/2026-07-07-kanban-layered-space-design.md](../superpowers/specs/2026-07-07-kanban-layered-space-design.md) — SP-1 spec 示例
- [docs/superpowers/plans/2026-07-07-sp1-kanban-layered-impl.md](../superpowers/plans/2026-07-07-sp1-kanban-layered-impl.md) — SP-1 plan 示例

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md