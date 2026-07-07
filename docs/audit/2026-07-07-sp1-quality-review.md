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

---

## §5 亮点(必须保留)

> M3-1 (2026-07-07) 补全:原报告缺本章节,违反 cross-review 方法论 §7 模板要求。
> 亮点必须明示,避免下次重构误删好的设计决策。

### 5.1 @note 注释时间拓扑门禁(首创)
- **位置**:scripts/check-note-links.mjs
- **价值**:把"代码注释 ↔ spec 决策"的关系做成机器可校验的时间拓扑图,不仅查链接存在,还查 `since` 时间戳语义
- **为什么保留**:这是 GEB 分形文档系统的机器守卫原型,未来 L2/L3 都可复用此模式
- **示例**:`sp1:pitfall:T1.4-recordOrder-side-effect ← src/core/sort-axis.js:148 (since 2026-07-07)` — 一眼看出哪个代码引用了哪个 spec 决策

### 5.2 agent team 质审查方法论(08-cross-review.md)
- **位置**:docs/methodology/08-cross-review.md
- **价值**:把"多视角并行审查"从口号变成可执行流程,有视角选择表、prompt 模板、决策矩阵、报告结构模板
- **为什么保留**:这是项目级的方法论资产,SP-N 收尾都可复用;跳过它就是"完成感幻觉"

### 5.3 SP-1 spec 二维状态拆分(status + phase)
- **位置**:P2-1 改造,所有 spec frontmatter
- **价值**:status(设计凝固度) + phase(实施进度)二维状态机,让"设计已凝固但未实施"(sediment + draft)、"试验中"(focus + experiment)等真实状态可精确表达
- **为什么保留**:这是化解 spec 矛盾的核心机制,未来 spec 数量增长后价值更大

### 5.4 check-spec-drift 决策漂移检测(P2-4)
- **位置**:scripts/check-spec-drift.mjs
- **价值**:把"规范指导试验"从口号变成机器可校验 — spec decisions[].statement 提取 key=value,代码中匹配,locked→FATAL / floating→WARN
- **为什么保留**:这是 L1-7(spec 算法权威)的真正守卫,比原 grep guard 精确得多

---

## §6 元教训(完成感幻觉)

> M3-1 (2026-07-07) 补全:cross-review 方法论 §7 要求每份 audit 报告暴露"完成感幻觉"。

### 6.1 "门禁全过" ≠ "治理在生效"

SP-1 收尾时 `npm run check:all` 全绿,但审查发现:
- pre-commit hook 从未安装(13 道门禁物理上从未生效)
- check-note-links 假设 cwd(从父目录跑直接 crash)

**教训**:"全过"可能是"从未跑过"。门禁必须验证它真的在跑,而不是 exit 0 就放心。

### 6.2 "可复用"是伪命题,直到第二个项目真的复用

methodology/ 8 个文件标"可独立 cp -r",但 6 个有 ../ 硬链接私域。

**教训**:"可复用"承诺必须有第二个项目验证,否则是文档层面的自我欺骗。

### 6.3 亮点不写 = 下次重构会误删

本报告原版缺 §4 亮点章节(违反自己的模板)。如果不补,下次重构可能误删 @note 拓扑门禁或 check-spec-drift 这些好的设计。

**教训**:亮点章节不是装饰,是防止"反向退化"的护城河。

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md