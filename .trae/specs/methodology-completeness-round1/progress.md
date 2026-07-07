# 方法论完整性 Round 1 — Progress

> 关联 spec: [spec.md](./spec.md)
> 关联 tasks: [tasks.md](./tasks.md)
> 关联 checklist: [checklist.md](./checklist.md)

## Round 1 — 启动(2026-07-07)

### 阶段 0: 触发原因

3 视角 agentteam 审计综合评分 **6.7/10**,发现 **3 个 P0 + 9 个 P1 + 4 个 P2** 缺口。

| 切片 | 评分 | 主要问题 |
|---|---|---|
| L1 宪法 ↔ 方法论 | 6.0/10 | 仅 1/9 文档反向引用宪法 |
| @note 协议三层连通 | 6.5/10 | 笔记 → 代码反向悬空 31% |
| 方法论 ↔ check-* | 7.5/10 | 08 跨视角 + 09 since + 02 同步缺门禁 |

### 阶段 1: 决策

用户选择: **"立项完整修复(含新增 check-* 与 10 号方法论)"** — 即 Phase 1 + Phase 2 + Phase 3 全做。

预计时长:
- Phase 1: 1-2 小时(立即)
- Phase 2: 半天(下次会话)
- Phase 3: 1 周(独立 spec 跟进)

## Round 1 — Phase 1(进行中)

### 已完成
- [x] 3 视角 agentteam 并行审计完成
- [x] 审计报告汇总(总分 6.7/10)
- [x] 用户确认立项完整修复
- [x] 创建 spec/tasks/checklist 三件套
- [x] T1: 修 `check-note-links.mjs:15` 幻影锚点 `resolve-pipeline`

### 进行中
- [ ] T2: 补 sp1/data-flow.md 6 章反向链接
- [ ] T3: 补 2 个反向悬空
- [ ] T4: 修 CLAUDE.md L242 计数

### 待开始
- T-Phase1-Commit

## Round 1 — Phase 2(待开始)

- T5-T9(5 项)

## Round 1 — Phase 3(待开始)

- T10-T13(4 项)

## 关键决策记录

### 决策 1:Phase 1 优先级

为什么先做 T1-T4 而不是 T5-T9:
- T1-T4 是单文件单行修改,风险极低,1-2 小时可完成
- T5-T6 是新门禁脚本,需要更多设计 + 测试
- T10-T13 是新方法论 + 新协议,影响面最大,留作最后

### 决策 2:since git log 自动化(T12)

为什么不立即做:
- 当前 16 处 @note 都是同一天(2026-07-07),手工改的成本是 16 行
- T12 设计的 `sinceFromGitLog()` 函数对未来新 @note 价值更大
- 推迟到 Phase 3,与 T10/T11 一起做"通用编程方法沉淀"的最后完善

## 复盘(待 Phase 3 完成后填写)

- 完成度:13/13 = ?
- 实际耗时:?
- 审计评分变化:6.7 → ?
- 关键经验:?
- 待 Round 2:?