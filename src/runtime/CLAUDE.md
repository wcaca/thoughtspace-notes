# src/runtime/
> L2 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: 依赖 src/core/、src/runtime/flags/、Yjs Y.Doc、localStorage
 * [OUTPUT]: flag system + 未来 runtime 工具(实时配置/能力检测/性能监控等)
 * [POS]: 文档 / 治理 / runtime 层,与 core / render / persistence 平级
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
存放"运行时基础设施"——为生产代码提供**带副作用、与环境耦合、可被运行时配置**的服务。

## 成员清单
- `flags/registry.js` — Flag 静态注册表（从 spec frontmatter 自动生成）
- `flags/source-chain.js` — Flag 4 层 lookup（URL > localStorage > Yjs > static default）
- `flags/variant.js` — cohort / rollout 解析
- `flags/kill-switch.js` — 紧急熔断
- `flags/bootstrap.js` — 一次性注入 flag resolver 到 shape-resolver
- `flags/index.js` — 对外 API（isOn / getVariant / setOverride / killSwitch）

## 参考文档
- [spec/2026-07-07-feature-flag-system-design.md](../../docs/superpowers/specs/2026-07-07-feature-flag-system-design.md)

## 与 core 的关系
**core 禁止 import runtime**（保持纯逻辑可单测）；runtime 可被 core / render / persistence 引用。

## 命名约定
- `*.js` — 普通模块
- 子目录需有 `CLAUDE.md` 描述职责

[PROTOCOL]: 变更时更新此头部，然后检查 ../../CLAUDE.md