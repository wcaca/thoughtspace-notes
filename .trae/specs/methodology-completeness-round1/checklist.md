# 方法论完整性 Round 1 — 验证清单

> 关联 spec: [spec.md](./spec.md)
> 关联 tasks: [tasks.md](./tasks.md)

## Phase 1 验证

### T1 — 幻影锚点清除
- [ ] `grep -n '#启动时序' scripts/check-note-links.mjs` 返回 0 行
- [ ] `grep -n '@note(' scripts/check-note-links.mjs` 示例中每个 anchor 真实存在

### T2 — sp1/data-flow.md 6 章反向链接
- [ ] `grep -rn '@note(sp1, data-flow' src/` 返回 ≥3 处
- [ ] `src/bootstrap.js` 含 `sp1-dataflow-startup` 锚点
- [ ] `src/main.js` 含 `sp1-dataflow-drag-reorder` 锚点
- [ ] `src/render/observe-views.js` 含 `sp1-dataflow-canvas-mode-switch` 锚点

### T3 — 反向悬空补全
- [ ] `grep -n 'T2.1-panel-stack-onclose-collision' src/render/observe-views.js` ≥1 行
- [ ] `grep -n 'isEdge-boundary-precision' src/core/shape-resolver.js` ≥1 行

### T4 — CLAUDE.md 计数修正
- [ ] CLAUDE.md L242 含 "8 条" 而非 "7 条"
- [ ] grep `L1-[1-8]` 在 CLAUDE.md §ARCHITECTURE 返回 8 个不同行号

### Phase 1 整体
- [ ] `git log --oneline -1` 显示 P1 commit
- [ ] `npm run check:note-links` 不报 FATAL

## Phase 2 验证

### T5 — check-since-validity
- [ ] `scripts/check-since-validity.mjs` 存在
- [ ] `package.json` scripts.check:since-validity 存在
- [ ] `package.json` scripts.check:all 含 check:since-validity
- [ ] 测试缺 since 的 fixture:FATAL-SINCE-MISSING
- [ ] 测试 since=2025-13-40 的 fixture:FATAL-SINCE-FORMAT
- [ ] 测试 since=2099-01-01 的 fixture:FATAL-SINCE-FUTURE
- [ ] 测试 since 晚于 spec created 的 fixture:WARN-SINCE-LATER-SPEC

### T6 — check-cross-review
- [ ] `scripts/check-cross-review.mjs` 存在
- [ ] `package.json` scripts.check:cross-review 存在
- [ ] `package.json` scripts.check:all 含 check:cross-review
- [ ] 测试 audit 报告视角 < 3:FATAL-CROSS-VIEW-TOO-FEW
- [ ] 测试 P0 无 commit/spec 追溯:FATAL-CROSS-NO-TRACE

### T7 — 三环 GEB 怪圈环 1 闭合
- [ ] `03-topology-priority.md` 含 §10(与 09 时间拓扑对偶关系)
- [ ] 5 状态 since 映射表完整(🟢 底座 / 🟡 焦点 / 🔵 沉淀 / ⚪ 已废弃 / 🔴 孤儿)
- [ ] `09-time-topology.md` §3.1 引用 03 §10

### T8 — shape-resolver 注释前缀统一
- [ ] `grep -n '^\s*\* @note' src/core/shape-resolver.js` 返回 0 行
- [ ] `grep -n '^\s*// @note' src/core/shape-resolver.js` 返回 6 行

### T9 — 02 ↔ 06 上下游方向一致
- [ ] `02-spec-driven-dev.md` §5 表头含 "(以 02 为上游视角)"
- [ ] `06-arch-guard.md` §7 表头含 "(以 02 为上游视角,本表为下游视角)"

### Phase 2 整体
- [ ] `git log --oneline -1` 显示 P2 commit
- [ ] `npm run check:all` 全绿

## Phase 3 验证

### T10 — 10-product-guards.md
- [ ] 文件存在,长度 ≥ 100 行
- [ ] §1 AI 半透明预览设计模式 ≥ 1 个代码示例
- [ ] §2 默认不上云边界 ≥ 1 个数据流图
- [ ] CLAUDE.md 含 [L1-9]/[L1-10] 引用
- [ ] `check-non-negotiable.mjs` 含 10 号方法论守护
- [ ] README 索引含 10

### T11 — @note→spec-chapter 反向链接协议
- [ ] `04-on-demand-notes.md` §3 含反向链接语法段
- [ ] `check-note-links.mjs` 含 reverse-link 扫描函数
- [ ] `09-time-topology.md` §3 环 3 中间环协议段

### T12 — since git log 自动化
- [ ] `check-note-links.mjs` 含 `sinceFromGitLog(file)` 函数
- [ ] `check-since-gitlog.test.mjs` 测试存在

### T13 — 07 ↔ 08 案例对齐
- [ ] `07-sp1-case-study.md` §1 列出 08 描述的 5 个 P0
- [ ] `08-cross-review.md` §1.3 链接到 07 §1 对应位置

### Phase 3 整体
- [ ] `git log --oneline -1` 显示 P3 commit
- [ ] `npm run check:all` 全绿
- [ ] 重跑审计:综合评分 ≥ 8.0/10

## 综合验证

- [ ] V1: `npm run check:all` 全绿(13 道门禁全过)
- [ ] V2: 重跑 3 个审计 agent,综合评分 ≥ 8.0/10(原 6.7/10)
- [ ] V3: git push 3 个 commit 到 origin main
- [ ] V4: 更新审计报告顶部评分到 ≥ 8.0/10
- [ ] V5: 在 docs/audit/2026-07-07-methodology-completeness-audit.md 顶部加 "Round 1 修复完成" 横幅