# docs/superpowers/plans/
> L3 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: 依赖 docs/superpowers/specs/CLAUDE.md 的命名与 spec→plan 关系
 * [OUTPUT]: 对外提供 .md 文件命名规范的目录,接受 YYYY-MM-DD-<feature>.md 命名
 * [POS]: 文档 / 治理 / plans 层,作为 spec 后实施路径,被 subagent-driven-development 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
存放已批准的 spec 对应的"可执行实施 plan"。每个 plan 是 bite-sized task 列表,每个 task 一个 checkbox,2-5 分钟一步。

## 命名约定
- `YYYY-MM-DD-<feature>.md` — 例:`2026-07-05-phase-0-lightweight-restructure.md`

## 使用
由 superpowers:subagent-driven-development 或 superpowers:executing-plans 消费。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
