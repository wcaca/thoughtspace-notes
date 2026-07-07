# GEB 治理强化 Spec

> 引用: [3 视角 agentteam 审计](docs/audit/2026-07-07-sp1-quality-review.md)
> 引用: [L1 宪法 CLAUDE.md](CLAUDE.md) §FORBIDDEN 死罪清单
> 引用: [GEB 基础设施 spec](docs/superpowers/specs/2026-07-05-geb-infrastructure-bootstrap-design.md)

## Why

3 视角 agentteam 并行审计综合评分 3.8/5,发现 3 个 P0 + 5 个 P1 治理缺口。当前 GEB 协议骨架已立(L3 头部 12/12 齐全、13 道门禁全活),但 FATAL 死罪仅 2/4 机器覆盖、render 层 5 处超 300 行红线失效、来源锚定功能缺位。系统性修复后综合分可达 4.4/5,并通过定时任务实现后台常驻治理。

## What Changes

- **P0-1: 实现 FATAL-001 机器检测** — check-geb.mjs 加 `git diff --name-only HEAD` 交叉验证,改代码不改 L3/L2 即报错
- **P0-2: 拆分 5 个超 300 行 render 文件** — observe-views(714→3)、zone-panel(474→2)、detail-panel(473→2)、main.js(357→3)、copilot-panel(337→2)
- **P0-3: 来源锚定功能** — createThought 加 `source: { type, ref? }` 字段 + detail-panel 展示
- **P1-1: dep-cruiser 规则 4 重命名** — `runtime-no-core` → `core-no-runtime`,语义对齐
- **P1-2: FATAL-005 自检** — check-geb.mjs 加 depcruise 规则名集合 ∈ L1 §ARCHITECTURE 段校验
- **P1-3: install-hooks mtime diff 提示** — 比较 SOURCE 与 .git/hooks 的 mtime,提示"已最新/已变"
- **P1-4: check-geb 反向 fixture 测试** — tests/scripts/check-geb.test.mjs 构造坏文件断言 FATAL
- **P1-5: L1-9 数值化等级 FATAL 守卫** — check-non-negotiable.mjs 新增 GUARD 禁止用户成长字段
- **后台常驻治理** — 用 Schedule 工具创建定时治理审计任务(每日跑 check:all + 生成报告)

## Impact

- Affected specs: geb-infrastructure-bootstrap, geb-precommit-and-l2-elevation, feature-flag-system, core-data-model
- Affected code:
  - [scripts/check-geb.mjs](scripts/check-geb.mjs) — 加 FATAL-001 检测 + FATAL-005 自检
  - [scripts/check-non-negotiable.mjs](scripts/check-non-negotiable.mjs) — 加 L1-9 数值化守卫
  - [scripts/install-hooks.mjs](scripts/install-hooks.mjs) — 加 mtime diff
  - [dependency-cruiser.config.mjs](dependency-cruiser.config.mjs) — 规则 4 重命名
  - [src/core/thought.js](src/core/thought.js) — 加 source 字段
  - [src/render/observe-views.js](src/render/observe-views.js) — 拆分
  - [src/render/zone-panel.js](src/render/zone-panel.js) — 拆分
  - [src/render/detail-panel.js](src/render/detail-panel.js) — 拆分
  - [src/render/copilot-panel.js](src/render/copilot-panel.js) — 拆分
  - [src/main.js](src/main.js) — 拆分
  - [tests/scripts/check-geb.test.mjs](tests/scripts/check-geb.test.mjs) — 新建

## ADDED Requirements

### Requirement: FATAL-001 孤立代码变更机器检测

系统 SHALL 在 check:geb 门禁中检测"改了 .js 但未同步 L3 头部或 L2 成员清单"的孤立变更。

#### Scenario: 改代码不改 L3
- **WHEN** git diff 显示某 .js 文件被修改,但该文件的 [INPUT]/[OUTPUT]/[POS]/[PROTOCOL] 头部未变
- **AND** 变更非纯空行/注释微调(行变更 ≥3 行)
- **THEN** check:geb 报 FATAL-001 并 exit 1

#### Scenario: 增删文件不改 L2
- **WHEN** git diff 显示 src/ 下新增或删除 .js 文件
- **AND** 该目录的 CLAUDE.md 成员清单未修改
- **THEN** check:geb 报 FATAL-004 并 exit 1

### Requirement: 来源锚定

系统 SHALL 为每个念头记录来源信息(manual / voice / import / copilot-suggest),并在详情面板展示。

#### Scenario: 手动创建念头
- **WHEN** 用户通过 quick-add 快速捕获创建念头
- **THEN** 该念头 source.type = 'manual'

#### Scenario: 语音创建念头
- **WHEN** 用户通过 voice-capture 语音录入创建念头
- **THEN** 该念头 source.type = 'voice'

### Requirement: L1-9 数值化等级守卫

系统 SHALL 在 check:non-negotiable 门禁中禁止 src/core/** 出现用户成长体系字段。

#### Scenario: 代码引入等级字段
- **WHEN** src/core/ 下任何 .js 文件出现 `userLevel|userExp|points|gradeTier|expPoints` 标识符
- **THEN** check:non-negotiable 报 FATAL-010 并 exit 1

### Requirement: 后台常驻治理

系统 SHALL 通过定时任务每日自动跑 check:all 并生成治理报告。

#### Scenario: 每日定时治理
- **WHEN** 到达每日调度时间
- **THEN** 自动跑 `npm run check:all`
- **AND** 生成 holo:report 全息报告
- **AND** 若有 FATAL 违规,报告标注待修

## MODIFIED Requirements

### Requirement: dep-cruiser 规则 4

规则 4 命名从 `runtime-no-core` 修改为 `core-no-runtime`,语义与检测方向(from core to runtime)对齐。同时新增反向规则 `runtime-no-core-entity` 禁止 runtime 直接 import core 实体(允许通过注入接口)。

### Requirement: check-geb.mjs 门禁

check-geb.mjs 新增 FATAL-001 检测段与 FATAL-005 自检段。FATAL-005 自检校验 dependency-cruiser.config.mjs 中的规则名集合是否与 L1 CLAUDE.md §ARCHITECTURE 段声明的约束一一对应。
