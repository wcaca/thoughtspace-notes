# 方法 04 · 按需加载笔记

> **TL;DR**:
> 1. **代码注释只放链接**,不复制笔记内容
> 2. **4 类笔记**: pitfalls / decisions / data-flow / integration-points
> 3. **每个 sub-project 一个目录** (sp1/, sp2/, shape/, topology/)
> 4. **git 持久化** — 跟随仓库,跨会话不丢

## §1 为什么需要按需加载

**反模式**:把陷阱 / 决策全写进代码注释 → 注释爆炸,代码不可读。

**按需加载**:代码注释只放 1 行链接 → Agent / 人需要时再打开笔记。

```
代码 (注释 1-2 行):
// ⚠️ 易错: 必须先检查再 clear,否则 fromJSON(undefined) 会破坏现有数据
//   详见 [docs/notes/sp1/pitfalls.md#T1.5-json-undefined-side-effect]
function fromJSON(arr) { ... }

笔记 (独立文件):
# T1.5-json-undefined-side-effect
## 症状: ...
## 根因: ...
## 修复: ...
## 验证: ...
```

## §2 笔记类型

| 类型 | 命名 | 何时用 |
|---|---|---|
| **pitfalls.md** | 易错陷阱 | 代码注释 `// ⚠️ 见 pitfalls.md#xxx` |
| **decisions.md** | 关键决策 | "为什么这么做"的不可逆决定 |
| **data-flow.md** | 数据流向 | 跨模块数据流转路径 |
| **integration-points.md** | 接触点 | 模块依赖 / 事件订阅 / 全局变量 |

## §3 注释约定

### 3.1 4 类图示

| 图示 | 含义 | 示例 |
|---|---|---|
| ⚠️ | 易错陷阱 | `// ⚠️ 易错: ...` |
| 📋 | 关键决策 | `// 📋 决策: 为什么...` |
| 🔗 | 接触点 | `// 🔗 接触点: 此函数被 ...` |
| 📌 | 引用 | `// 📌 详见 spec §X` |

### 3.2 链接格式

**相对路径**,跨平台可用:
```javascript
// 详见 [docs/notes/sp1/pitfalls.md#T1.5-json-undefined-side-effect]
```

**锚点命名**:用 markdown 标题,去掉特殊字符:
```markdown
## T1.5-json-undefined-side-effect   ← 锚点
```

### 3.3 注释密度

**规则**: 易出错代码才加,**平均每个文件 3-5 处**,不超过 10。

## §4 何时新增笔记

| 触发 | 动作 |
|---|---|
| 写易错代码 | 同步在 pitfalls.md 加一段 |
| 做了不可逆决策 | 同步在 decisions.md 加一段 |
| 发现跨模块流转 | 同步在 data-flow.md 或 integration-points.md |
| 调试时找到根因 | 同步在 DEBUG_NOTES.md |

## §5 笔记的目录组织

```
docs/notes/
├── README.md               # 协议 (本方法)
├── sp1/                    # 每个 sub-project 一个目录
│   ├── pitfalls.md
│   ├── decisions.md
│   ├── data-flow.md
│   └── integration-points.md
├── sp2/                    # 未来
└── shape/                  # 跨 sub-project 的主题
```

## §6 跨项目复用

**methodology/** 是跨项目方法,**notes/** 是项目特化。

如果想复用方法,只拷 methodology/。如果想看案例,看 notes/。

## §7 我们的实践

- [docs/notes/README.md](../notes/README.md) — 协议
- [docs/notes/sp1/pitfalls.md](../notes/sp1/pitfalls.md) — 8 个 SP-1 陷阱
- [docs/notes/sp1/decisions.md](../notes/sp1/decisions.md) — 6 个 SP-1 决策

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md