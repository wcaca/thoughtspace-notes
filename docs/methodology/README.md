# 编程方法论 · thoughtspace-notes

> **目的**：沉淀**可复用**的编程方法论,**与项目解耦**,其他项目可独立拿走。
>
> 与 `docs/superpowers/specs/` 的区别:
> - `specs/` = **本项目**的具体设计(形状哲学、拓扑意识空间、SP-1)
> - `methodology/` = **跨项目**可复用的方法(brainstorming 流程、拓扑表、笔记系统)

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 创建触发 | 用户原话:"如何把以上所有讨论涉及到编程方法的部分沉淀到github仓库,方便分享和复用" |
| 复用场景 | 新项目启动 / 多人协作 / AI Agent 协作 / 个人知识管理 |

---

## §1 方法索引

| # | 方法 | TL;DR (3 行) | 完整 |
|---|---|---|---|
| **01** | [设计思维](01-design-thinking.md) | "分解 → 提问澄清 → 设计 → 写 spec"四步;一次只问一个问题 | [详细](01-design-thinking.md) |
| **02** | [spec 驱动开发](02-spec-driven-dev.md) | 任何改动先写 spec → plan → 再 implement;spec 是 single source of truth | [详细](02-spec-driven-dev.md) |
| **03** | [拓扑优先级表](03-topology-priority.md) | 5 状态机:🟢底座 / 🟡焦点 / 🔵沉淀 / ⚪废弃 / 🔴孤儿;治理混乱 | [详细](03-topology-priority.md) |
| **04** | [按需加载笔记](04-on-demand-notes.md) | pitfalls / decisions / data-flow / integration-points 4 类;注释只放链接 | [详细](04-on-demand-notes.md) |
| **05** | [系统性调试](05-debug-systematic.md) | 4 阶段失败要重审架构;trace data flow 找到 activeOverlay 时序错位 | [详细](05-debug-systematic.md) |
| **06** | [架构守卫](06-arch-guard.md) | dependency-cruiser 守住分层;CI 跑零越层 | [详细](06-arch-guard.md) |
| **07** | [SP-1 案例研究](07-sp1-case-study.md) | 我们怎么把方法 01-06 一起用到 SP-1 | [详细](07-sp1-case-study.md) |

---

## §2 怎么复用

### 2.1 给"下一个项目"复用

```bash
# 1. 拷贝 methodology/ 目录到新项目
cp -r docs/methodology/ /path/to/new-project/docs/

# 2. 改 README.md,把"导航链接"指向新项目的 docs/
# 3. 删除 sp1 案例(那是本项目特化)
# 4. 按本项目的 spec → plan → implement 流程
```

### 2.2 ⚠️ 复用时一定要做的事

**`01` `02` `03` `04` `05` `06` 的"我们的实践" / "参见 / 引用"段是项目实例**:
- 迁移到新项目时**全部删除**
- 只保留 §1-§4 的方法本身

**`07-sp1-case-study.md` 是完整案例**:
- 这是 thoughtspace-notes 的特化案例,**不属于方法论本身**
- 跨项目时**不要拷贝**(或移到 `docs/methodology/examples/` 子目录)
- 真正可复用的是方法 01-06

### 2.3 给"AI Agent"复用

把 `docs/methodology/` 加入 Agent 的 system prompt 读取清单:

```
必读 (顺序不可乱):
1. /CLAUDE.md (项目宪法)
2. /docs/topology-priority.md (状态视图)
3. /docs/methodology/README.md (方法论索引)
4. 当前任务相关 spec
```

### 2.4 给"团队新人"复用

新人入职第一天:
1. 读 [01-design-thinking.md](01-design-thinking.md) — 理解"为什么这么做"
2. 读 [03-topology-priority.md](03-topology-priority.md) — 理解"什么能动"
3. 读 [07-sp1-case-study.md](07-sp1-case-study.md) — 看完整案例
4. 跑项目,边做边查其他方法

---

## §3 方法之间的关系

```
01 设计思维 (顶层)
  ↓ 输出: 一份可讨论的 spec 草案
02 spec 驱动开发 (流程)
  ↓ 输出: spec + plan
03 拓扑优先级表 (治理)
  ↓ 输入: spec 的状态
04 按需加载笔记 (易错点)
  ↓ 链接到: 03 (状态) / 02 (spec)
05 系统性调试 (排错)
  ↓ 输入: 测试失败
06 架构守卫 (CI)
  ↓ 输入: 代码提交
07 案例 (SP-1)
  ↑ 综合展示 01-06
```

**核心循环**:
```
新需求 → 01 设计思维 → 02 写 spec → 03 登记到拓扑表 → 实施 → 06 架构守卫
  ↑                                                                   ↓
  └─────────────────────── 05 失败时调试 ←─── 04 找到相关笔记 ────────┘
```

---

## §4 与现有文档体系的关系

| 文档 | 层级 | 角色 |
|---|---|---|
| `/CLAUDE.md` | L1 | 项目宪法,极稳定 |
| `docs/topology-priority.md` | L1.5 | 状态视图 |
| `docs/methodology/README.md` (本文) | **L1.6** | **方法论索引** |
| `docs/superpowers/specs/*` | L2 | 项目特化设计 |
| `docs/superpowers/plans/*` | L2 | 项目特化实施 |
| `docs/notes/*` | L2.5 | 项目易错笔记 |
| `docs/DEBUG_NOTES.md` | L2 | 调试速查 |
| `docs/audit/*` | L2 | 审查报告 |

**L1.6 方法论索引**的特征:
- **跨项目可移植** —— 不依赖 thoughtspace-notes 的特定代码
- **方法而非实现** —— 讲"怎么做",不写"做了什么"
- **可独立发布** —— 可以单独 `cp -r docs/methodology/ ~/methodology/`

---

## §5 何时新增方法

| 触发 | 动作 |
|---|---|
| 跨项目通用的设计模式被发现 | 在 `methodology/` 加一篇 |
| 跨项目通用的流程模式被发现 | 同上 |
| 一个方法被复用 2+ 次 | 把它从 notes/ 升级到 methodology/ |
| 一个方法被证伪 / 重构 | 编辑或废弃对应文件,在 §6 加 changelog |

---

## §6 变更日志

| 日期 | 变更 | 备注 |
|---|---|---|
| 2026-07-07 | 初始创建 7 个方法 | SP-1 实践沉淀 |

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md