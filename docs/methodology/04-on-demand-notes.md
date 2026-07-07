# 方法 04 · 按需加载笔记

> **TL;DR**:
> 1. **代码注释用 `@note(...)` 机器可解析格式**,不复制笔记内容
> 2. **4 类笔记**: pitfalls / decisions / data-flow / integration-points
> 3. **每个 sub-project 一个目录** (sp1/, sp2/, shape/, topology/)
> 4. **`since:YYYY-MM-DD` 是必填字段** — 时间锚点,构建时间拓扑(见 [09 时间拓扑精度](09-time-topology.md))
> 5. **负向门禁**:含 TODO/FIXME/易错/未决 的文件必须至少有 1 个 @note

## §1 为什么需要按需加载

**反模式**:把陷阱 / 决策全写进代码注释 → 注释爆炸,代码不可读。

**按需加载**:代码注释只放 1 行 `@note(...)` 链接 → Agent / 人需要时再打开笔记。

```
代码 (注释 1 行):
// @note(sp1, pitfall, T1.5-json-undefined-side-effect, since:2026-07-07)
function fromJSON(arr) { ... }

笔记 (独立文件):
# T1.5-json-undefined-side-effect
## 症状: ...
## 根因: ...
## 修复: ...
## 验证: ...
```

## §2 笔记类型

| 类型 | 命名 | 何时用 | @note type |
|---|---|---|---|
| **pitfalls.md** | 易错陷阱 | 代码注释 `// ⚠️ 易错: ...` | `pitfall` |
| **decisions.md** | 关键决策 | "为什么这么做"的不可逆决定 | `decision` |
| **data-flow.md** | 数据流向 | 跨模块数据流转路径 | `data-flow` |
| **integration-points.md** | 接触点 | 模块依赖 / 事件订阅 / 全局变量 | `integration` |

## §3 @note 注释格式(机器可解析)

### 3.1 标准格式

```javascript
// @note(sub-project, type, anchor, since:YYYY-MM-DD)
```

**四参必填**:
1. `sub-project`: 子项目名(sp1, sp2, shape, topology 等)
2. `type`: 笔记类型(pitfall / decision / data-flow / integration)
3. `anchor`: 笔记文件中的 markdown 标题锚点
4. `since`: 引入日期,时间拓扑锚点(见 [09](09-time-topology.md))

### 3.2 实例

```javascript
// 易错陷阱
// @note(sp1, pitfall, T1.4-recordOrder-side-effect, since:2026-07-07)
function fireReorder(newOrder, callbacks) { ... }

// 关键决策
// @note(sp1, decision, why-window-globals, since:2026-07-07)
window.__sp1State = { ... }

// 接触点
// @note(sp1, integration, observe-views, since:2026-07-07)
function setCanvasMode(m) { ... }

// 数据流向
// @note(sp1, data-flow, #启动时序, since:2026-07-07)
async function initBootstrap() { ... }
```

### 3.3 辅助图示(可选,与 @note 并列)

| 图示 | 含义 | 示例 |
|---|---|---|
| ⚠️ | 易错陷阱 | `// ⚠️ 易错: ...` |
| 📋 | 关键决策 | `// 📋 决策: 为什么...` |
| 🔗 | 接触点 | `// 🔗 接触点: 此函数被 ...` |
| 📌 | 引用 | `// 📌 详见 spec §X` |

```javascript
// ⚠️ 易错: 必须先检查再 clear,否则 fromJSON(undefined) 会破坏现有数据
// @note(sp1, pitfall, T1.5-json-undefined-side-effect, since:2026-07-07)
function fromJSON(arr) { ... }
```

### 3.4 命名锚点

笔记文件用 markdown 标题做锚点:

```markdown
## T1.5-json-undefined-side-effect   ← 锚点
```

`@note` 的 anchor 参数必须与此标题完全一致。

### 3.5 注释密度

**规则**: 易出错代码才加,**平均每个文件 3-5 处**,不超过 10。

## §4 负向门禁(关键约束)

**规则**:含以下触发词的文件,必须至少有 1 个 @note 链接:

| 触发词 | 含义 |
|---|---|
| `TODO` | 待办 |
| `FIXME` | 待修 |
| `XXX` | 待议 |
| `HACK` | 临时方案 |
| `易错` | 中文易错标记 |
| `未决` | 中文未决标记 |
| `暂未启用` | 中文暂缓标记 |

**为什么**:防止"按需加载笔记"机制被空集合绕过 — 如果文件标了易错却不链接笔记,笔记系统就失效了。

**门禁**:check-note-links.mjs 的 `checkNegativeCoverage()` 函数执行此检查,违规 → 阻止 commit。

## §5 何时新增笔记

| 触发 | 动作 |
|---|---|
| 写易错代码 | 同步在 pitfalls.md 加一段 + 代码加 @note |
| 做了不可逆决策 | 同步在 decisions.md 加一段 + 代码加 @note |
| 发现跨模块流转 | 同步在 data-flow.md 或 integration-points.md + 代码加 @note |
| 调试时找到根因 | 同步在 DEBUG_NOTES.md + 代码加 @note(since 用修复日期) |

## §6 笔记的目录组织

```
docs/notes/
├── README.md               # 协议 (本方法的落地实例)
├── sp1/                    # 每个 sub-project 一个目录
│   ├── pitfalls.md
│   ├── decisions.md
│   ├── data-flow.md
│   └── integration-points.md
├── sp2/                    # 未来
└── shape/                  # 跨 sub-project 的主题
```

## §7 跨项目复用

**methodology/** 是跨项目方法,**notes/** 是项目特化。

如果想复用方法,只拷 methodology/。如果想看案例,看 notes/。

**最小工具集**(跨项目带走):
- `scripts/check-note-links.mjs` — 门禁脚本
- `docs/notes/README.md` — 协议模板
- `docs/notes/<sub>/` — 目录结构

## §8 与其他方法的关系

| 上游 | 下游 | 关系 |
|---|---|---|
| **02 spec 驱动** | 04 | spec 产生决策 → 04 记录 |
| 04 | **09 时间拓扑** | 04 定义格式,09 定义时间语义 — **互锁** |
| 04 | **06 架构守卫** | 06 的 check-note-links.mjs 执行 04 的门禁 |
| **05 系统调试** | 04 | 调试找到根因 → 04 记录 pitfall |

**环形联想**(详见 [09](09-time-topology.md)):
```
03 空间拓扑(状态) ↔ 09 时间拓扑(since) ↔ 04 按需笔记(@note)
        ↑                    ↑                    ↑
    06 架构守卫(机器) ──────┘────────────────────┘
```

## §9 我们的实践

- [docs/notes/README.md](../notes/README.md) — 协议(已同步 @note 格式)
- [docs/notes/sp1/pitfalls.md](../notes/sp1/pitfalls.md) — SP-1 陷阱
- [docs/notes/sp1/decisions.md](../notes/sp1/decisions.md) — SP-1 决策
- [scripts/check-note-links.mjs](../scripts/check-note-links.mjs) — 门禁实现
- [.notes-link-graph.json](../../.notes-link-graph.json) — 自动生成的拓扑图

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
