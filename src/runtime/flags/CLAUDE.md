# src/runtime/flags/
> L2 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: spec frontmatter（自动生成registry）、URL参数、localStorage、Yjs Y.Doc
 * [OUTPUT]: Feature Flag系统（isOn/getVariant/setOverride/killSwitch）+ v2入口切换检测
 * [POS]: src/runtime/flags/,运行时flag治理子系统
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
Feature Flag 治理系统——4层lookup（URL > localStorage > Yjs > static default）、
cohort/rollout解析、紧急熔断、v2入口级切换检测。

## 成员清单
- `registry.js` — Flag静态注册表（从spec frontmatter自动生成）
- `source-chain.js` — Flag 4层lookup（URL > localStorage > Yjs > static default）
- `variant.js` — cohort/rollout解析
- `kill-switch.js` — 紧急熔断
- `bootstrap.js` — 一次性注入flag resolver到shape-resolver
- `index.js` — 对外API（isOn / getVariant / setOverride / killSwitch）
- `v2-migration.js` — v2入口级切换检测（URL参数?v2=true，独立于registry系统，发生在ESM加载链最前端）

## 设计说明
`v2-migration.js` 是入口级切换，不走registry系统：
- registry要求spec frontmatter声明+自动生成
- v2切换需要在ESM加载链最前端完成，无法等待registry初始化
- 由index.html的bootstrap脚本直接内联URL参数检测逻辑

## 参考文档
- [spec/2026-07-07-feature-flag-system-design.md](../../../docs/superpowers/specs/2026-07-07-feature-flag-system-design.md)
- [实现方案.md §2.2 S0](../../../docs/产品定位_v2-2026-07-08/实现方案.md)

[PROTOCOL]: 变更时更新此头部，然后检查 ../../CLAUDE.md
