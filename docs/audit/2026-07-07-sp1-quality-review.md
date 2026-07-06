# SP-1 质量审查 · 2026-07-07

> **本报告由 agent team 3 人并行审查产出**:
> - 代码审查员 (代码质量 + 不变式 + API 表面)
> - 文档审查员 (方法论 + 笔记 + 元问题)
> - 工程治理审查员 (门禁 + 跨平台 + 钩子)
>
> **审查对象**:SP-1 实施 + 编程方法论沉淀 + 注释时间拓扑门禁
> **目的**:打破"工作完结感幻觉"——独立视角发现内部盲区

---

## §0 综合评分

| 维度 | 评分 | 评语 |
|---|---|---|
| 代码不变式 | C+ | 1 个致命问题:核心功能未接通 |
| 错误处理 | B | 大部分 graceful |
| API 表面 | B | 重复暴露 / 缺关键方法 |
| 跨项目可复用 | 2.0/5 | 声称可复用,实际硬链接 |
| TL;DR 价值 | 3.0/5 | 有但不够 |
| 可发现性 | 1.5/5 | README 完全不引导 |
| 门禁鲁棒性 | C | hook 没装 / cwd 假设 |
| **综合** | **2.6/5** | 框架意识强,收尾粗糙 |

---

## §1 P0 问题(必修)

### 1.1 代码:`applyObserveReorder` 不存在
- **位置**:src/main.js, src/render/observe-views.js
- **影响**:SP-1 核心"信念轨迹"运行时永不累积
- **修复**:接通 callbacks.onReorder → window.__sp1State.recordManualOrder

### 1.2 代码:layer-store 暴露 _map
- **位置**:src/core/layer-store.js L150
- **影响**:绕过所有不变量验证
- **修复**:删除 _map 暴露

### 1.3 门禁:pre-commit hook 未安装
- **位置**:scripts/hooks/pre-commit, scripts/install-hooks.mjs
- **影响**:整套门禁从未生效
- **修复**:package.json 加 postinstall 自动装

### 1.4 门禁:check-note-links 假设 cwd
- **位置**:scripts/check-note-links.mjs L26-29
- **影响**:从父目录跑直接 crash
- **修复**:用 import.meta.url 解析 ROOT

### 1.5 文档:README 是 8 行空壳
- **位置**:README.md
- **影响**:新人完全无引导
- **修复**:加文档导航块

### 1.6 文档:methodology 硬链接私域
- **位置**:docs/methodology/01-07.md 6 个文件有 ../ 硬链接
- **影响**:"可复用"承诺是伪命题
- **修复**:每个文件加"⚠️ 项目实例"标记

---

## §2 P1 问题(应该修)

### 2.1 缺 getCurrentOrder
- main.js#__sp1State 没暴露 getCurrentOrder
- observe-views 块模式降级为不排序,但仍显示"[time] 排序"标签

### 2.2 reorder 不严格
- 新数组长度小于 size 时跳过剩余层,order 跳号

### 2.3 decisions.md 字段不全
- 6 个决策中 3 个缺"代价"或"缓解"

### 2.4 topology-priority 状态矛盾
- SP-1 spec 同时标"焦点"和"全部完成"

### 2.5 methodology 状态过度宣称
- 8 个文件标 🟢 底座,但无 spec 文件

---

## §3 P2 问题(锦上添花)

- CJK 扩展 B 区字符不支持
- walk 没 ignore node_modules
- 失败时仍写 .notes-link-graph.json
- 路径分隔符 Windows 反斜杠
- 锚点没 slug 标准化

---

## §4 修复优先级

```
1. 修 5 个 P0 (核心功能 + 治理)
2. 修 5 个 P1 (质量 + 完整性)
3. 修 P2 (可选,下次会话)
```

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md