# Backlog

> Fable5 式自主推进任务队列。本文件由 AI agent 在每个 task 完成后自动维护。

## In Progress
- (空)

## Up Next
- (Phase 0 实施 plan 生成后填充)

## Done
- (Phase 0 完成时移入)

---

## 维护规则
- 模板:`- [ ] T-XXX: 任务名 (预计 N 天) [完成度]`
- 每个 task 完成后,从 In Progress 移到 Done,并填入实际工时
- Phase 0 任务 ID 范围:T-001 - T-099
- Phase 1 任务 ID 范围:T-100 - T-199

---

## L2 自动化重试规则(2026-07-05 由审计触发)

- 单 task 失败 ≤5 次自动重试(Part 9 §3.1 L1)
- 5 次仍失败 → **不在 backlog 标 done**,标 "⚠️ BLOCKED: L2 见用户"
- Agent 自己**不得**在 L2 时跳过反馈去取下一个 task
- 这是为了避免"修改了不该修改的代码,把多个错一起修了"风险

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
