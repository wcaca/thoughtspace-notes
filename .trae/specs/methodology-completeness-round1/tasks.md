# 方法论完整性 Round 1 — Tasks

> 关联 spec: [spec.md](./spec.md)
> 关联审计报告: docs/audit/2026-07-07-methodology-completeness-audit.md

## Phase 1 — 立即修(本周,1-2 小时)

- [x] **T1**: 修 `scripts/check-note-links.mjs:15` 幻影示例锚点 `#启动时序` → `resolve-pipeline`(或其他真实 anchor)
- [ ] **T2**: 补 `sp1/data-flow.md` 6 章 → 3 个代码位置的 `@note(sp1, data-flow, ...)` 反向链接
  - `src/bootstrap.js initBootstrap` → `sp1-dataflow-startup`
  - `src/main.js applyObserveReorder` → `sp1-dataflow-drag-reorder`
  - `src/render/observe-views.js buildCanvasTabs` → `sp1-dataflow-canvas-mode-switch`
- [ ] **T3a**: 在 `src/render/observe-views.js:261` 后加 `@note(sp1, pitfall, T2.1-panel-stack-onclose-collision, since:2026-07-07)`
- [ ] **T3b**: 在 `src/core/shape-resolver.js:166` 上方加 `@note(shape, pitfall, isEdge-boundary-precision, since:2026-07-07)`
- [ ] **T4**: 改 CLAUDE.md L242 注释 "7 条" → "8 条"
- [ ] **T-Phase1-Commit**: `git commit -m "fix(methodology-r1): P0-1/P0-2 + 2 个反向悬空 + 计数漂移"`

## Phase 2 — 短期修(下次会话,半天)

- [ ] **T5a**: 新建 `scripts/check-since-validity.mjs`(since 必填 / 格式 / 不晚于今天 / 不晚于 spec 创建)
- [ ] **T5b**: 在 `package.json` scripts 加 `check:since-validity`
- [ ] **T5c**: 在 `check:all` 编排加 `check:since-validity`
- [ ] **T5d**: 在 `check-geb.test.mjs` 加 since-validity fixture 测试(必填/格式/晚于 spec)
- [ ] **T6a**: 新建 `scripts/check-cross-review.mjs`(≥3 视角 + P0/P1/P2 分级 + P0 可追溯)
- [ ] **T6b**: 在 `package.json` scripts 加 `check:cross-review`
- [ ] **T6c**: 在 `check:all` 编排加 `check:cross-review`
- [ ] **T7a**: 在 `03-topology-priority.md` 加 §10 "与 09 时间拓扑的对偶关系"(5 状态 since 映射表)
- [ ] **T7b**: 在 `09-time-topology.md` §3.1 引用新加的 03 §10
- [ ] **T8**: 改 `shape-resolver.js` L19/L22 的 `* @note(...)` 为 `// @note(...)`(移出 JSDoc 块)
- [ ] **T9a**: 在 `02-spec-driven-dev.md` §5 表头加 "(以 02 为上游视角)"
- [ ] **T9b**: 在 `06-arch-guard.md` §7 表头加 "(以 02 为上游视角,本表为下游视角)"
- [ ] **T-Phase2-Commit**: `git commit -m "feat(governance): check-since-validity + check-cross-review + 三环闭合"`

## Phase 3 — 长期建设(独立 spec,1 周)

- [ ] **T10a**: 创建 `docs/methodology/10-product-guards.md` 大纲(§0-§5)
- [ ] **T10b**: §1 AI 半透明预览设计模式(用户输入前先展示 AI 提议)
- [ ] **T10c**: §2 默认不上云边界(本地 IndexedDB + 可选加密导出)
- [ ] **T10d**: 在 `CLAUDE.md` §ARCHITECTURE 加 [L1-9]/[L1-10] 引用 10 号方法论
- [ ] **T10e**: 在 `check-non-negotiable.mjs` 加 10 号方法论守护(L1-5/L1-6 实现核查)
- [ ] **T10f**: 在 `docs/methodology/README.md` 索引加 10
- [ ] **T11a**: 在 `04-on-demand-notes.md` §3 加"@note→spec-chapter 反向链接语法"段
- [ ] **T11b**: 在 `check-note-links.mjs` 加 reverse-link 扫描(笔记章节 → spec frontmatter 字段)
- [ ] **T11c**: 在 `09-time-topology.md` §3 环 3 加"中间环(笔记↔spec)标准协议"段
- [ ] **T12a**: 在 `check-note-links.mjs` 加 `sinceFromGitLog(file)` 函数(读 git log --follow 取最早 commit 日期)
- [ ] **T12b**: since 缺位时降级用 git log 最早日期,而不是默认 2026-07-07
- [ ] **T12c**: 加单元测试 `check-since-gitlog.test.mjs`
- [ ] **T13a**: 在 `07-sp1-case-study.md` §1 引用 08 §1.3 描述的 "5 个 P0",列出具体清单
- [ ] **T13b**: 在 `08-cross-review.md` §1.3 加超链接到 07 §1 对应位置
- [ ] **T-Phase3-Commit**: `git commit -m "feat(methodology-10): 产品灵魂方法论 + 反向链接协议 + since gitlog 自动化"`

## 综合验证

- [ ] **V1**: `npm run check:all` 全绿
- [ ] **V2**: 重跑 3 个审计 agent,确认综合评分 ≥ 8.0/10
- [ ] **V3**: git push 3 个 commit 到 origin main
- [ ] **V4**: 更新审计报告评分(原 6.7/10 → 新 8.0+/10)