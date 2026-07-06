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

## §2 注释约定

### 2.1 易错陷阱注释

```javascript
// ⚠️ 易错: 装配后必须调 bootstrapDefaults,否则 layers.size()=0
//   详见 [docs/notes/sp1/pitfalls.md#T1.4-no-bootstrap]
currentLayerStore.bootstrapDefaults();
```

**关键**: 链接是**相对路径**,跨平台可用。

### 2.2 决策注释

```javascript
// 📋 决策: 为什么用 window.__sp1State 而不是 ESM import?
//   详见 [docs/notes/sp1/decisions.md#why-window-globals]
window.__sp1State = { ... };
```

### 2.3 接触点注释

```javascript
// 🔗 接触点: 此函数被 observe-views.js 通过 window.__sp1State 调用
//   详见 [docs/notes/sp1/integration-points.md#observe-views]
function setCanvasMode(m) { ... }
```

### 2.4 命名锚点

每个笔记文件用 markdown 标题做锚点,例如:

```markdown
## T1.4-no-bootstrap   ← 这就是锚点
```

注释中用 `#T1.4-no-bootstrap` 跳到此处。

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