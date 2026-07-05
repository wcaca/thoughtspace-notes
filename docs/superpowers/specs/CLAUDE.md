# docs/superpowers/specs/
> L3 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: 依赖 docs/superpowers/CLAUDE.md 的"命名约定"与"与 plans/ 关系"规则
 * [OUTPUT]: 对外提供 .md 文件命名规范的目录,接受 YYYY-MM-DD-<topic>-design.md 命名
 * [POS]: 文档 / 治理 / specs 层,作为 brainstorm 输出 → plan 输入的过渡容器
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
存放已批准的设计文档(spec)。每个 spec 描述"为什么这么做、做什么、不做什么"。

## 命名约定
- `YYYY-MM-DD-<topic>-design.md` — 例:`2026-07-05-phase-0-lightweight-restructure-design.md`

## 与 plans/ 的关系
- spec 批准后,由 writing-plans skill 生成对应 plan
- plan 路径:`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
