# 方法 09 · 时间拓扑精度

> **TL;DR**:
> 1. **`since:YYYY-MM-DD` 是时间锚点** — 每个 @note 必须带,构建时间维度
> 2. **与 03 空间拓扑形成对偶** — 03 回答"什么状态",09 回答"何时形成"
> 3. **三环联想**:空间↔时间 / 格式↔门禁 / 代码↔笔记(自指怪圈)
> 4. **精度即追溯力** — 没有 since 的笔记是死笔记,有 since 才能回溯演进

## §1 为什么需要时间拓扑

**反模式**:笔记只记"是什么"不记"何时引入" → 半年后看到 `window.__sp1State` 不知道是 SP-1 还是 SP-2 引入的,无法回溯决策时机。

**时间拓扑**:每个 @note 带 `since:YYYY-MM-DD`,形成时间轴 → Agent / 人可沿时间轴回溯"这个陷阱是何时埋下的、这个决策是何时做的"。

```
空间维度 (03 拓扑表):
  文件 → 状态(🟢🟡🔵⚪🔴)→ "它现在是什么"

时间维度 (09 时间拓扑):
  文件 → @note → since → "它何时变成这样"
```

**两者结合 = 时空分形坐标**:任何代码实体都有 (空间状态, 时间锚点) 二元坐标。

## §2 since 字段的语义

### 2.1 何时填 since

| 场景 | since 填什么 |
|---|---|
| 新增易错代码 | 写代码的日期 |
| 新做决策 | 决策确定的日期 |
| 修复 bug | 修复日期(不是引入 bug 的日期) |
| 重构 | 重构日期,旧 @note 保留原 since |
| 废弃笔记 | since 不变,在笔记内容标注"已废弃于 YYYY-MM-DD" |

### 2.2 since 不是 git blame

| 维度 | git blame | since |
|---|---|---|
| 粒度 | 行级 | 概念级(一个陷阱/决策) |
| 含义 | 最后修改时间 | 首次引入时间 |
| 可读性 | 机器生成,人难读 | 人写,带语义 |
| 用途 | 追究责任 | 追溯演进 |

**关键区别**:git blame 告诉你"这行代码最后谁动过",since 告诉你"这个决策何时形成" — 后者才是回溯演进需要的。

### 2.3 since 与 spec 的关系

spec 也有创建日期。`since` 应与 spec 创建日期对齐:

```
spec: 2026-07-07-kanban-layered-space-design.md (创建 2026-07-07)
  ↓ 产生决策
@note(sp1, decision, why-window-globals, since:2026-07-07)
  ↓ since 与 spec 创建日期一致
```

**门禁建议**(未来可加):check-note-links.mjs 可校验 since ≤ spec 创建日期(决策不能早于 spec)。

## §3 三环联想(GEB 怪圈)

### 3.1 环 1:空间 ↔ 时间(03 ↔ 09)

```
03 空间拓扑(状态)
    ↑
    │ 文件状态变更 → 触发笔记更新
    │
    ↓
09 时间拓扑(since)
    ↑
    │ since 记录变更时间 → 映射回状态机
    │
    └──→ 回到 03(状态转换有时间戳)
```

**对偶关系**:

| 03 空间拓扑 | 09 时间拓扑 |
|---|---|
| 状态:🟢🟡🔵⚪🔴 | 时间:since:YYYY-MM-DD |
| 空间位置:文件路径 | 时间位置:since 日期 |
| 回答"这是什么" | 回答"何时形成" |
| 5 状态机 | 线性时间轴 |
| 修改规则:状态转换 | 修改规则:since 不变(除非重构) |

**结合力**:任何代码实体都有 `(状态, since)` 二元坐标 — 空间定位 + 时间定位。

### 3.2 环 2:格式 ↔ 门禁(04 ↔ 06)

```
04 按需笔记(格式)
    ↑
    │ 定义 @note(sub, type, anchor, since)
    │
    ↓
06 架构守卫(机器)
    ↑
    │ check-note-links.mjs 验证格式 + 负向门禁
    │
    └──→ 回到 04(格式被机器强制 → 格式不会漂移)
```

**互锁关系**:04 教格式,06 守格式 — 没有 06,04 会漂移(人懒得不写 since);没有 04,06 无据可依。

### 3.3 环 3:自指怪圈(GEB 核心)

```
代码
  │ @note(...)
  ↓
笔记(pitfalls/decisions)
  │ 记录决策
  ↓
spec(设计文档)
  │ 产生新代码
  ↓
代码(新的 @note...)
  │ since: 新日期
  ↓
... (循环永不终止)
```

**怪圈本质**:代码生成笔记 → 笔记指导 spec → spec 产生新代码。每一步都有 since 时间戳,形成可回溯的时间螺旋。

**与 GEB 的对应**:
- 哥德尔:代码@note 自指笔记(代码谈论自己)
- 艾舍尔:层级互锁(代码↔笔记↔spec 互相引用)
- 巴赫:时间螺旋(每个 since 是一个变奏,主题循环递进)

## §4 时间拓扑图(.notes-link-graph.json)

check-note-links.mjs 自动生成拓扑图:

```json
{
  "stats": {
    "totalLinks": 10,
    "uniqueAnchors": 9,
    "filesWithNotes": 5
  },
  "forward": {
    "src/bootstrap.js": [
      { "subProject": "sp1", "type": "pitfall", "anchor": "T1.4-no-bootstrap", "since": "2026-07-07" }
    ]
  },
  "reverse": {
    "sp1:pitfall:T1.4-no-bootstrap": [
      { "file": "src/bootstrap.js", "line": 29, "since": "2026-07-07" }
    ]
  }
}
```

**正向查询**(文件 → 笔记):"这个文件有哪些陷阱?"
**反向查询**(笔记 → 代码):"这个陷阱在哪些文件出现?"
**时间查询**(since → 全部):"2026-07-07 引入了哪些决策?"(未来可加)

## §5 精度的意义

### 5.1 精度 = 追溯力

| 精度 | 追溯力 | 场景 |
|---|---|---|
| 无 since | 无法追溯 | "这个决策哪来的?" → 不知道 |
| since 精确到日 | 可定位 spec | "2026-07-07 引入" → 查那天的 spec |
| since + spec 关联 | 可定位决策 | "SP-1 的 why-window-globals" → 直接跳到 spec §X |

### 5.2 精度 = Agent 上下文

Agent 遇到 `window.__sp1State` 时:
1. 读 @note → 知道是 sp1 的 decision
2. 读 since → 知道是 2026-07-07 引入
3. 跳到 spec → 知道为什么用 window 全局
4. 5 分钟内获取完整上下文(对比:无 @note 时需 grep 全仓库)

### 5.3 精度 = 治理健康度

时间拓扑图的统计指标:
- `totalLinks / filesWithNotes`:平均每文件几个 @note(健康:3-5)
- `uniqueAnchors / totalLinks`:锚点复用率(健康:< 1.5,说明没重复)
- `filesWithNotes / totalFiles`:笔记覆盖率(健康:> 20% 的核心文件)

## §6 与其他方法的关系

| 方法 | 关系 | 互锁点 |
|---|---|---|
| **03 拓扑优先级表** | 空间↔时间对偶 | 状态机 ↔ since 时间轴 |
| **04 按需加载笔记** | 格式↔语义互锁 | @note 格式 ↔ since 语义 |
| **06 架构守卫** | 机器执行 | check-note-links.mjs |
| **02 spec 驱动** | 上游 | spec 产生决策 → 09 记录 since |
| **05 系统调试** | 下游 | 调试时用 since 回溯"何时引入的 bug" |
| **08 跨视角审查** | 验证 | 审查时检查时间拓扑覆盖率 |

## §7 跨项目复用

**最小工具集**(跨项目带走):
- `scripts/check-note-links.mjs` — 门禁(含 since 验证 + 负向门禁)
- `docs/methodology/09-time-topology.md` — 本方法
- `docs/methodology/04-on-demand-notes.md` — 配套格式方法
- `.notes-link-graph.json` — 自动生成的拓扑图(运行后产生)

**实施步骤**:
1. 拷贝上述文件到新项目
2. 创建 `docs/notes/<sub>/` 目录
3. 在 CLAUDE.md §ARCHITECTURE 加 `[L1-N] @note 注释时间拓扑协议 → check-note-links.mjs`
4. 跑 `node scripts/check-note-links.mjs` 验证空集不报错
5. 开始写代码,每个易错/决策加 @note

## §8 我们的实践

- [CLAUDE.md](../../CLAUDE.md) §ARCHITECTURE [L1-8] — 宪法层声明
- [scripts/check-note-links.mjs](../scripts/check-note-links.mjs) — 门禁实现
- [.notes-link-graph.json](../../.notes-link-graph.json) — 拓扑图(10 链接 / 9 锚点 / 5 文件)
- [docs/notes/sp1/](../notes/sp1/) — SP-1 笔记实例
- [04-on-demand-notes.md](04-on-demand-notes.md) — 配套格式方法

## §9 何时 NOT 用时间拓扑

| 场景 | 为什么不用 |
|---|---|
| 一次性脚本 | 不会演进,无需追溯 |
| 纯 UI 样式调整 | 无决策,无陷阱 |
| 自动生成的代码 | 机器生成,人无需理解 |
| 临时代码(将删除) | 浪费精力 |

**规则**:时间拓扑精度只用于**会演进的、有决策的、人需要理解的核心代码**。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
