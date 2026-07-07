# 方法论完整性 Round 1 Spec

> 引用: [方法论完整性审计报告](docs/audit/2026-07-07-methodology-completeness-audit.md)
> 引用: [L1 宪法 CLAUDE.md §ARCHITECTURE](CLAUDE.md)
> 引用: [时间拓扑精度方法论 09](docs/methodology/09-time-topology.md)
> 引用: [跨视角审查方法论 08](docs/methodology/08-cross-review.md)

## Why

3 视角 agentteam 审计综合评分 **6.7/10**(L1 宪法↔方法论 6.0 + @note 协议 6.5 + 门禁实现 7.5),发现 **3 个 P0 + 9 个 P1 + 4 个 P2** 缺口。

**P0 致命**(任一即可让"通用编程方法沉淀"叙事崩盘):
- P0-1 `scripts/check-note-links.mjs:15` 示例锚点 `#启动时序` 是**幻影**(`§` 不在 markdown 锚点正则字符类内)
- P0-2 `sp1/data-flow.md` 整文件 6 章节**零代码 @note 引用**,单向悬空最严重
- P0-3 **08 跨视角审查(≥3 视角 + P0/P1/P2 分级)无机器门禁**
- P0-4 **09 时间拓扑 since 语义(必填 + YYYY-MM-DD + ≤ spec 创建日期)无机器校验**
- P0-5 **[L1-5]/[L1-6] 产品灵魂条款(半透明预览/不上云)无方法论承接**

系统性修复后综合分可达 **8.5/10**。

## What Changes

**Phase 1 — 立即修(本周,1-2 小时,4 项)**
- T1: 修 `check-note-links.mjs:15` 幻影示例锚点为真实 anchor
- T2: 补 sp1/data-flow.md 6 章 → 3 个代码位置的 `@note(sp1, data-flow, ...)` 反向链接
- T3: 补 2 个已存在的反向悬空(`observe-views.js:261 T2.1-panel-stack-onclose-collision` + `shape-resolver.js:166 isEdge-boundary-precision`)
- T4: 修 CLAUDE.md L242 计数漂移("7" → "8")

**Phase 2 — 短期修(下次会话,半天,5 项)**
- T5: 新增 `check-since-validity.mjs`,since 必填 / YYYY-MM-DD / 不晚于 spec 创建日期
- T6: 新增 `check-cross-review.mjs`,校验 audit 报告含 ≥3 视角 + P0/P1/P2 分级
- T7: 在 03-topology-priority.md 加 §10"与 09 对偶"小节,闭合 GEB 三环环 1
- T8: 改 shape-resolver.js L19/L22 从 `* @note` 为 `// @note` 注释前缀统一
- T9: 整 02 ↔ 06 上下游方向声明(以 02 为主视角)

**Phase 3 — 长期建设(独立 spec,1 周,4 项)**
- T10: 新建 `docs/methodology/10-product-guards.md`,承接 [L1-5]/[L1-6] 产品灵魂条款
- T11: 补"笔记反向指向 spec 章节"协议(`@note→spec-chapter` 反向链接语法),闭合 GEB 三环环 3
- T12: 在 `check-note-links.mjs` 加 `since = git log 最早 commit 日期` 自动取数
- T13: 写完整 08 案例描述对齐(07 案例研究引用 08 描述的"5 个 P0 是哪 5 个")

## Impact

- Affected specs:
  - [CLAUDE.md](CLAUDE.md) — L242 计数修正
  - [docs/methodology/03-topology-priority.md](docs/methodology/03-topology-priority.md) — 加 §10 对偶
  - [docs/methodology/02-spec-driven-dev.md](docs/methodology/02-spec-driven-dev.md) — 上下游声明
  - [docs/methodology/06-arch-guard.md](docs/methodology/06-arch-guard.md) — 上下游声明
  - [docs/methodology/08-cross-review.md](docs/methodology/08-cross-review.md) — 引用 07 补具体案例
  - [docs/methodology/09-time-topology.md](docs/methodology/09-time-topology.md) — 引用 03 对偶段
- Affected code:
  - [scripts/check-note-links.mjs](scripts/check-note-links.mjs) — 改示例 + 加 since 校验
  - [scripts/check-cross-review.mjs](scripts/check-cross-review.mjs) — 新建
  - [scripts/check-since-validity.mjs](scripts/check-since-validity.mjs) — 新建
  - [src/render/observe-views.js](src/render/observe-views.js) — 加 1 个 @note + L261 后补丁
  - [src/core/shape-resolver.js](src/core/shape-resolver.js) — 加 2 个 @note + 统一注释前缀
  - [src/main.js](src/main.js) — 加 sp1 data-flow @note(运行时拖动排序)
  - [src/bootstrap.js](src/bootstrap.js) — 加 sp1 data-flow @note(启动时序)
- New methodology:
  - [docs/methodology/10-product-guards.md](docs/methodology/10-product-guards.md) — 新建(承接 L1-5/L1-6)

## ADDED Requirements

### Requirement: @note 协议示例无幻影

系统 SHALL 保证 `check-note-links.mjs` 文件中所有 `@note(...)` 示例引用的 anchor 真实存在于 `docs/notes/` 笔记中。

#### Scenario: 示例锚点不可达
- **WHEN** `check-note-links.mjs` 中任意 `@note(sub, type, anchor, ...)` 注释的 anchor 不在 `docs/notes/*/` 任一 `##` 标题里
- **THEN** check-note-links.mjs 自检失败,exit 1(FATAL-NOTE-EXAMPLE)

### Requirement: data-flow 笔记章节全部反向链接

系统 SHALL 保证 `docs/notes/{shape,sp1}/data-flow.md` 每个 `##` 章节至少被 1 个代码 `@note(..., data-flow, ...)` 引用。

#### Scenario: data-flow 章节悬空
- **WHEN** `docs/notes/sp1/data-flow.md` 任一 `##` 标题在 src/ 中无对应 `@note(sp1, data-flow, ...)`
- **THEN** check-note-links 报 WARN-DATA-FLOW,exit 0(累积)

### Requirement: since 时间拓扑校验

系统 SHALL 在 `check-since-validity.mjs` 中校验所有 `@note` 的 `since:YYYY-MM-DD`:
1. 必填
2. 格式合法(YYYY-MM-DD)
3. 不晚于当前日期
4. 不晚于其引用的笔记章节所在 spec 的 `created` 日期

#### Scenario: since 缺失
- **WHEN** 任意 `@note(...)` 缺 `since:` 字段
- **THEN** check-since-validity 报 FATAL-SINCE-MISSING

#### Scenario: since 格式错
- **WHEN** `since:` 不是 YYYY-MM-DD
- **THEN** check-since-validity 报 FATAL-SINCE-FORMAT

#### Scenario: since 晚于 spec 创建
- **WHEN** `since` 日期 > 引用的 spec frontmatter `created` 字段
- **THEN** check-since-validity 报 WARN-SINCE-LATER-SPEC

### Requirement: 跨视角审查机器门禁

系统 SHALL 在 `check-cross-review.mjs` 中校验 docs/audit/ 下所有 review 报告含:
1. ≥3 个独立视角(如 design / implementation / spec-drift)
2. P0/P1/P2 显式分级
3. ≥1 个 P0 修复项 traceable 到 spec 或 commit

#### Scenario: review 报告视角不足
- **WHEN** docs/audit/*.md 报告标注的视角数 < 3
- **THEN** check-cross-review 报 FATAL-CROSS-VIEW-TOO-FEW

#### Scenario: P0 无追溯
- **WHEN** 报告有 P0 项但未指向具体 spec 章节或 commit hash
- **THEN** check-cross-review 报 FATAL-CROSS-NO-TRACE

### Requirement: 产品灵魂方法论承接

系统 SHALL 在 `docs/methodology/10-product-guards.md` 中描述:
1. [L1-5] AI 半透明预览的设计模式(用户输入前先展示 AI 提议,用户确认后才应用)
2. [L1-6] 笔记默认不上云的边界(本地 IndexedDB + 可选加密导出,默认行为不触发云端同步)

#### Scenario: 检视产品决策
- **WHEN** 任一 PR 涉及 AI 渲染逻辑或云同步路径
- **THEN** 必须在 PR 描述引用 10-product-guards.md 对应章节(门禁 W3,积累型)

## MODIFIED Requirements

### Requirement: CLAUDE.md L242 计数

[CLAUDE.md L242](CLAUDE.md) 注释"7 条"改为"8 条"以匹配实际 [L1-1] 到 [L1-8] 数量。

### Requirement: 三环 GEB 怪圈环 1 闭合

[03-topology-priority.md](docs/methodology/03-topology-priority.md) 新增 §10 "与 09 时间拓扑的对偶关系":
- 拓扑状态(底座/焦点/沉淀/废弃/孤儿)↔ since 时间维度
- 🟢 底座 ↔ since > 90 天
- 🟡 焦点 ↔ since < 14 天
- 🔵 沉淀 ↔ since 30-90 天
- ⚪ 已废弃 ↔ since > 180 天无变更
- 🔴 孤儿 ↔ since 缺位

### Requirement: 02 ↔ 06 上下游方向一致

[02-spec-driven-dev.md §5](docs/methodology/02-spec-driven-dev.md) 与 [06-arch-guard.md §7](docs/methodology/06-arch-guard.md) 上下游表统一以 02 为"上游"(spec 阶段先于实现)。

### Requirement: shape-resolver @note 注释前缀统一

[src/core/shape-resolver.js L19/L22](src/core/shape-resolver.js) 的 `* @note(...)` JSDoc 内注释改为 `// @note(...)` 行内注释,与文件其他 4 处 @note 风格一致。

## REMOVED Requirements

无

## 验证清单(checklist.md)

### Phase 1 验证
- [ ] `grep -n '#启动时序' scripts/check-note-links.mjs` 应返回 0 行
- [ ] `grep -rn '@note(sp1, data-flow' src/` 应返回 ≥6 处
- [ ] `grep -n 'T2.1-panel-stack-onclose-collision' src/render/observe-views.js` 应 ≥1 行
- [ ] `grep -n 'isEdge-boundary-precision' src/core/shape-resolver.js` 应 ≥1 行
- [ ] CLAUDE.md L242 含 "8 条"

### Phase 2 验证
- [ ] `npm run check:since-validity` 不报 FATAL
- [ ] `npm run check:cross-review` 不报 FATAL
- [ ] 03-topology-priority.md §10 含 5 状态 since 映射表
- [ ] shape-resolver.js 文件内 `* @note` 出现次数为 0
- [ ] 02-spec-driven-dev.md 与 06-arch-guard.md 上下游方向一致(均以 02 为上游)

### Phase 3 验证
- [ ] docs/methodology/10-product-guards.md 存在,含 §1 AI 半透明预览 + §2 默认不上云
- [ ] docs/methodology/04-on-demand-notes.md §3 加"@note→spec-chapter 反向链接语法"段
- [ ] check-note-links.mjs 加 `sinceFromGitLog(file)` 函数
- [ ] docs/methodology/07-sp1-case-study.md §1 引用 08 描述的 5 个 P0

### 综合验证
- [ ] `npm run check:all` 全绿
- [ ] 13 项修复 commit + push 到 GitHub
- [ ] 审计报告评分 ≥ 8.0/10(目标 8.5/10)