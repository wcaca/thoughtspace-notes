# 项目笔记系统 · thoughtspace-notes

> **目标**：让任何后续 agent / 你在遇到 bug 或不确定决策时,**按需加载**相关笔记,**5 分钟内**找到上下文。
>
> **核心原则**：
> 1. **按需加载** — 笔记放在独立文件,代码注释只放链接
> 2. **代码注释不臃肿** — 1 行链接就够,不复制笔记内容
> 3. **git 持久化** — 笔记跟随仓库,跨会话不丢
> 4. **可演进** — 每个 sub-project 一个目录(SP-1 → sp1/, SP-2 → sp2/)

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 创建者 | 用户提议 + 我执行 |
| 触发更新 | 新增易出错代码 / 新决策 / 新接触点 |

---

## §1 笔记类型

| 类型 | 命名约定 | 何时用 | 示例 |
|---|---|---|---|
| `pitfalls.md` | 易错陷阱 | 代码注释 `// ⚠️ 见 pitfalls.md#xxx` 链向 | main.js 装配易踩的坑 |
| `decisions.md` | 关键决策 | "为什么这么做"的不可逆决定 | 为什么用 window.__sp1State |
| `data-flow.md` | 数据流向 | 跨模块数据流转路径 | toJSON/fromJSON 时序 |
| `integration-points.md` | 与其他模块的接触点 | 模块依赖 / 事件订阅 / 全局变量 | observe-mode 与 canvas-mode 正交 |

---

## §2 注释约定(@note 机器可解析格式)

> ⚠️ **格式已升级** — 旧格式 `// 详见 [docs/notes/...]` 已废弃,改用 `@note(...)` 格式以被 check-note-links.mjs 门禁识别。
> 详见 [方法 04 按需加载笔记](../methodology/04-on-demand-notes.md) 和 [方法 09 时间拓扑精度](../methodology/09-time-topology.md)。

### 2.1 标准格式

```javascript
// @note(sub-project, type, anchor, since:YYYY-MM-DD)
```

**四参必填**:
1. `sub-project`: 子项目名(sp1, sp2, shape, topology)
2. `type`: pitfall / decision / data-flow / integration
3. `anchor`: 笔记文件中的 markdown 标题锚点
4. `since`: 引入日期(时间拓扑锚点,见 [09](../methodology/09-time-topology.md))

### 2.2 易错陷阱注释

```javascript
// ⚠️ 易错: 装配后必须调 bootstrapDefaults,否则 layers.size()=0
// @note(sp1, pitfall, T1.4-no-bootstrap, since:2026-07-07)
currentLayerStore.bootstrapDefaults();
```

### 2.3 决策注释

```javascript
// 📋 决策: 为什么用 window.__sp1State 而不是 ESM import?
// @note(sp1, decision, why-window-globals, since:2026-07-07)
window.__sp1State = { ... };
```

### 2.4 接触点注释

```javascript
// 🔗 接触点: 此函数被 observe-views.js 通过 window.__sp1State 调用
// @note(sp1, integration, observe-views, since:2026-07-07)
function setCanvasMode(m) { ... }
```

### 2.5 命名锚点

每个笔记文件用 markdown 标题做锚点,例如:

```markdown
## T1.4-no-bootstrap   ← 这就是锚点
```

`@note` 的 anchor 参数必须与此标题完全一致。

### 2.6 负向门禁(关键约束)

含以下触发词的文件,必须至少有 1 个 @note 链接,否则阻止 commit:

- `TODO` / `FIXME` / `XXX` / `HACK`
- `易错` / `未决` / `暂未启用`

**门禁**:check-note-links.mjs 的 `checkNegativeCoverage()` 函数执行此检查。

---

## §3 何时新增笔记

| 触发 | 动作 |
|---|---|
| 写易错代码时 | 同步在 `pitfalls.md` 加一段 |
| 做了不可逆决策时 | 同步在 `decisions.md` 加一段 |
| 发现跨模块流转时 | 同步在 `data-flow.md` 或 `integration-points.md` 加一段 |
| 调试时找到根因 | 同步在 `DEBUG_NOTES.md` 加症状记录 |

---

## §4 与现有文档体系的关系

| 现有 | 与 notes/ 关系 |
|---|---|
| `docs/CLAUDE.md` | L1 项目宪法,极稳定 |
| `docs/topology-priority.md` | L1.5 状态视图 |
| `docs/superpowers/specs/*` | L2 设计 spec(why + what) |
| `docs/superpowers/plans/*` | L2 实施 plan(when + how) |
| **`docs/notes/*` (新增)** | **L2.5 笔记 (traps + decisions + flows)** |
| `docs/DEBUG_NOTES.md` | L2 调试速查(保留独立) |
| `docs/audit/*` | L2 审查报告 |

**L2.5 笔记的特征**：
- **比 spec 短**：3-5 分钟读完
- **比代码注释长**：可以写完整段落
- **比 plan 专注**：只讲 1-2 个陷阱/决策
- **比 DEBUG_NOTES 抽象**：讲为什么,不是"症状→怀疑清单"

---

## §5 现状

| 笔记目录 | 内容 |
|---|---|
| `sp1/` | 已创建(本次) |
| `shape/` | 待创建(等形状哲学稳定) |
| `topology/` | 待创建(SP-3 时) |

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md