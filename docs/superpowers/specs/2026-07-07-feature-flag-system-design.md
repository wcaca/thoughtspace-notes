---
id: feature-flag-system
title: Feature Flag 系统与回归测试集成
status: focus
phase: experiment            # P2-1: Phase B 激活中,跨层使用但仍在验证
experiment_window: 2026-07-07 ~ 2026-07-14
layer: L1-architecture
scope:
  global: false
  modules: [src/runtime, src/core, src/render]
  files: []
  lines: []
priority: 85
created: 2026-07-07
updated: 2026-07-07
inherits-from:
  - geb-infrastructure-bootstrap
  - topological-awareness-space
supersedes: []
non-negotiable:
  - "Flag 单一真相源在 spec frontmatter 的 flags: 字段"
  - "src/core 禁止 import src/runtime（依赖方向不变）"
  - "Flag 引用必须显式声明，禁止硬编码 if (typeof window.__x)"
flags:
  - name: shape-resolver-weights-v2
    type: enum
    values: [ratio-first, hull-first, dwell-first, balanced]
    default: balanced
    status: experimental
    owner_spec: shape-adaptive-views
    since: 2026-07-07
    deprecation_window_days: 60
    scope:
      modules: [src/core]
      files: [src/core/shape-resolver.js]
    regression_subset:
      include:
        - tests/core/shape-resolver.test.js
      exclude: []
    rollout: 0
    cohort:
      type: hash
      weights:
        - variant: balanced
          weight: 100
    kill_switch: null
    depends_on: []
    conflicts_with: []

  - name: observe-mode-cohort-toggle
    type: boolean
    default: true
    status: beta
    owner_spec: kanban-layered-space
    since: 2026-07-07
    deprecation_window_days: 90
    scope:
      modules: [src/render, src/core]
      files: [src/main.js, src/render/observe-views.js, src/render/canvas-mode.js]
    regression_subset:
      include:
        - tests/render/sp1-canvas-modes.test.js
        - tests/render/observe-views.test.js
        - tests/integration/sp1-integration.test.js
      exclude: []
    rollout: 100
    kill_switch: KILL_SP1
    depends_on: []
    conflicts_with: []

  - name: yjs-persistence-batch-write
    type: number
    default: 50
    status: experimental
    owner_spec: persistence-yjs-bridge
    since: 2026-07-07
    deprecation_window_days: 60
    scope:
      modules: [src/persistence]
      files: [src/persistence/yjs-store.js]
    regression_subset:
      include:
        - tests/persistence/persistence-roundtrip.test.js
        - tests/persistence/undo-manager.test.js
      exclude: []
    rollout: 0
    kill_switch: null
    depends_on: []
    conflicts_with: []

---

# Feature Flag 系统与回归测试集成 — 设计 Spec

> 让功能开关不再是散落的 `window.__x` 或注释里的 "TODO experimental"，而是：
> 1. **代码理解**：每个 flag 都在 spec frontmatter 显式定义，开发者 grep `name:` 就能找到全貌
> 2. **代码实现**：`isOn('name')` / `getVariant('name')` 显式 lookup，禁止硬编码 if 守卫
> 3. **代码规范**：门禁自动校验 flag 引用一致性、scope 边界、生命周期、回归测试覆盖

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 状态 | **实验阶段 — 第 1 个 flag 在 shape-resolver 落地** |
| 优先级 | P1 体验治理 |
| 周期 | 持续推进 |
| 前置依赖 | spec 拓扑规则系统（已就位，2026-07-07） |

---

## §0 设计哲学

**多 spec 多视角 ≠ 多个 flag 互相打架**：flag 必须有 owner spec、有 lifecycle、有 regression subset、有门禁。
**flag 不是装饰，是生产代码的**第一类成员**。

---

## §1 三态分离（声明态 / 注册态 / 引用态）

| 形态 | 位置 | 何时用 |
|---|---|---|
| 声明态（Authoring） | `docs/superpowers/specs/*.md` 的 YAML frontmatter `flags:` | 设计、审批、跨人协作 |
| 注册态（Build） | `src/runtime/flags/registry.js`（从 spec 自动生成） | 运行时 lookup、门禁扫描 |
| 引用态（Code） | `isOn('name')` / `getVariant('name', defaults)` | 生产代码分支 |

**关键原则**：单一真相源在 spec，registry 由脚本从 spec 生成，源码通过显式 import lookup。

---

## §2 目录与文件组织

```
src/runtime/flags/
  index.js              # 对外 API: isOn, getVariant, setOverride, killSwitch
  registry.js           # 从 spec 生成: { name → { default, status, ... } }
  source-chain.js       # 4 层 lookup: URL > localStorage > Yjs > static
  variant.js            # cohort / rollout 解析
  kill-switch.js        # 紧急熔断 (KILL_<DOMAIN>)

scripts/
  generate-flag-registry.mjs   # 从 spec frontmatter 抽取生成 registry.js
  check-flag-topology.mjs       # 门禁：F1-F5 FATAL, W1-W5 WARN, I1-I4 INFO
```

**为什么放 src/runtime/ 而非 src/core/**：
- `src/core/**` 必须保持纯逻辑可单测（被 [project_rules.md](../../.trae/rules/project_rules.md) 约束）
- flag system 读 localStorage / 订阅 Yjs / 监听 URL hash，含副作用 + 环境耦合
- 依赖方向：`render → runtime → core`，单向不破坏拓扑

---

## §3 Flag 元数据 Schema

每个 spec 的 frontmatter `flags:` 字段（数组），每个元素结构：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `name` | string | ✓ | kebab-case 唯一标识（如 `shape-resolver-weights-v2`） |
| `type` | enum | ✓ | `boolean / enum / number / string / json` |
| `values` | array | enum 必填 | enum 类型的可选值列表 |
| `default` | any | ✓ | 兜底默认值 |
| `status` | enum | ✓ | `experimental / beta / ga / deprecated / archived` |
| `owner_spec` | string | ✓ | 拥有本 flag 的 spec id，门禁 F2 校验 |
| `since` | date | ✓ | 引入日期 |
| `deprecation_window_days` | number | deprecated 必填 | 废弃到清理的窗口 |
| `scope.modules` | array | ✓ | 允许引用的模块 |
| `scope.files` | array | ✓ | 允许引用的文件 |
| `regression_subset.include` | array | ✓ | flag 启用时跑的测试 |
| `regression_subset.exclude` | array | optional | flag 禁用时跑的测试 |
| `rollout` | number 0-100 | optional | 灰度百分比 |
| `cohort.type` | enum | optional | `hash / explicit` |
| `cohort.weights` | array | cohort 必填 | `[{variant, weight}]` |
| `kill_switch` | string | optional | 紧急熔断开关名（`KILL_<DOMAIN>`） |
| `depends_on` | array | optional | 依赖的其他 flag（链式求值） |
| `conflicts_with` | array | optional | 互斥的 flag |

---

## §4 生命周期（与 topology 表 5 状态机同源）

```
experimental → beta → ga → deprecated → archived
```

| 状态 | 升级条件 | 风险 |
|---|---|---|
| `experimental` | owner spec focus+；≥1 周观察 | 中 |
| `beta` | owner spec 通过率 ≥95% 累计 2 周 | 中低 |
| `ga` | spec 进入 sediment；变更需 24h notice | 低 |
| `deprecated` | 必须填 `deprecation_window_days ≥ 30` | 中 |
| `archived` | `check-flag-topology.mjs` 在 `since(deprecated) + deprecation_window_days` 过当天后自动标 | 低 |

**关键不变量**：`deprecated` 保留 registry 条目但 `isEnabledForRemoval()` 返回 false；门禁 W3 在窗口过期后转 WARN；下一次清理窗一并删。

---

## §5 运行时 Lookup API

```js
import { isOn, getVariant, setOverride, killSwitch } from 'src/runtime/flags/index.js';

// 简单开关
if (isOn('observe-mode-cohort-toggle')) { ... }

// 枚举/数值
const weights = getVariant('shape-resolver-weights-v2', 'balanced');

// Dev 覆盖
setOverride('shape-resolver-weights-v2', 'hull-first');

// 紧急熔断
killSwitch.trip('KILL_SP1'); // 全员关闭 SP-1 功能
```

### 4 层 Source Chain（按优先级倒序）

1. **URL query / hash**（dev 调试）：`?__flag__shape-resolver-weights-v2=hull-first`
2. **localStorage**（用户级持久覆盖）：key 前缀 `tsn.flag.`
3. **Yjs `flagOverrides` YMap**（协作级，会话内）：与 thoughts/edges/zones 同级 schema
4. **Static default**（registry 的 `default` 字段）：兜底

**特殊**：`kill_switch` 优先级高于一切，存在时强制 OFF。

### 核心 lookup 伪代码

```js
function isOn(name, ctx = currentContext()) {
  const def = registry.get(name);
  if (!def) throw new FlagNotDeclaredError(name);          // F1
  if (def.kill_switch && killSwitch.isTripped(def.kill_switch)) return false;
  if (def.depends_on?.some(d => !isOn(d, ctx))) return false;     // 链式
  if (def.conflicts_with?.some(c => isOn(c, ctx))) return false;  // 互斥
  const raw = sourceChain.resolve(name, def, ctx);                 // 4 层链
  return toBool(variant.resolve(def, raw, ctx), def);              // rollout + cohort
}
```

`currentContext()` 提供 `userId / bucket / now()`。`bucket` 取 Yjs awareness 的稳定 hash，保证同一用户跨刷新 cohort 不变。

---

## §6 回归测试集成

### 三个入口并存

```bash
npm test                              # 默认（registry default）
npm run test:flags:on  -- --flag=name # 启用后跑
npm run test:flags:off -- --flag=name # 禁用后跑
```

实现：新增 `vitest.flag.config.js`，setupFile 注入 `globalThis.__flag_overrides__`，`source-chain.js` 识别"测试源"插队到 URL/localStorage 之后、registry default 之前。

### 隐式依赖检测（门禁职责）

扫描"测试未声明 override 却在执行路径上能命中 `isOn('xxx')` 默认 false 处的代码" → 标 **WARN: implicit-flag-dependency**。修复方式：在测试 setup 显式 `setOverride('xxx', true)`。

---

## §7 门禁检查（`check-flag-topology.mjs`）

复用 `check-spec-topology.mjs` 的解析框架（js-yaml + parseFrontmatter + violations[]）。

### FATAL（exit 1）

- F1 代码 `isOn('foo')` 但未声明
- F2 `owner_spec` 引用不存在的 spec
- F3 flag 引用文件不在 `scope.files` 内（如 render flag 不能被 core 引用）
- F4 `type=enum` 的 `default` 不在 `values` 内
- F5 frontmatter `flags:` 字段 YAML 错误

### WARN（exit 0 累积）

- W1 声明但未被引用（孤儿）
- W2 `experimental` 超 30 天未升 beta
- W3 `deprecated` 超 `deprecation_window_days` 未删
- W4 `beta` 通过率 ≥95% 但未转 ga
- W5 `cohort.weights` 总和 ≠ 100

### INFO（仅打印）

- I1 `archived` flag 的代码引用残留
- I2 `regression_subset.include` 测试文件不存在
- I3 同 owner_spec 的 flag 数量 > 10
- I4 owner_spec 已 deprecated 但 flag 未 archived

---

## §8 迁移路径（5 阶段）

| Phase | 时长 | 内容 |
|---|---|---|
| A | 1 天 | 自动从 spec frontmatter 抽取 `flags:` 字段生成 `registry.js`，跑 `check-flag-topology` 期望全 INFO |
| B | 3 天 | 选最常变更的硬编码分支（首选 `shape-resolver.js DEFAULT_WEIGHTS`）建立首批 2 个 flag |
| C | 1 周 | 写 `lookup.js + source-chain.js`，对接 shape-resolver.js 实证 |
| D | 2 周 | 接入 vitest 双套并行 + e2e 验证隐式依赖检测 |
| E | 持续 | 用启发式扫描（`process.env.[A-Z_]+`、`localStorage.getItem('tsn.xxx')`、`*.switch/*.mode` 后缀的导出）逐步迁移剩余硬编码 |

---

## §9 当前 Phase B 状态（2026-07-07）

- ✅ Phase A：spec frontmatter 写入 3 个示例 flag
- ✅ Phase B.1：shape-resolver 默认权重改造为 flag（`shape-resolver-weights-v2`）
- ✅ Phase B.2：`observe-mode-cohort-toggle` 注册（已存在行为，添加 flag 治理）
- ✅ Phase B.3：`yjs-persistence-batch-write` 注册（批写阈值，未来启用）
- ⏳ Phase C：source-chain.js 完整实现（URL + localStorage + Yjs + static）

---

## §10 不引入重量级依赖的承诺

整套系统只用项目已有的 dev dependency：
- `js-yaml`（已在）
- `vitest`（已在）
- `yjs`（已在）

**不引入** LaunchDarkly / Unleash / Flagsmith / OpenFeature。所有 lookup、source chain、kill-switch、cohort bucketing 在 `src/runtime/flags/` 自实现约 600 行（含注释），与项目 L1 "代码即文档"哲学一致。

---

## §11 已注册的 Flag 清单

### 11.1 `shape-resolver-weights-v2`（enum, experimental）

- **Owner spec**: shape-adaptive-views
- **现状来源**: [src/core/shape-resolver.js#L43](file:///e:/魔方心厦/thoughtspace-notes/src/core/shape-resolver.js#L43) 的 `DEFAULT_WEIGHTS = Object.freeze({...})`
- **type**: enum `[ratio-first, hull-first, dwell-first, balanced]`
- **default**: `balanced` (保持与旧 DEFAULT_WEIGHTS 一致: ratio=0.6 hull=0.25 dwell=0.15)
- **regression_subset**: [tests/core/shape-resolver.test.js](file:///e:/魔方心厦/thoughtspace-notes/tests/core/shape-resolver.test.js)
- **rollout**: 0 (only test cohort)

### 11.2 `observe-mode-cohort-toggle`（boolean, beta）

- **Owner spec**: kanban-layered-space
- **现状来源**: `src/main.js:224` 的 SP-1 bootstrap 默认值 + `src/render/observe-views.js` 的 `window.__sp1State` 兜底
- **type**: boolean
- **default**: `true`
- **regression_subset**: tests/render/sp1-canvas-modes.test.js + tests/render/observe-views.test.js + tests/integration/sp1-integration.test.js
- **rollout**: 100 (GA 候选)

### 11.3 `yjs-persistence-batch-write`（number, experimental）

- **Owner spec**: persistence-yjs-bridge
- **现状来源**: `src/persistence/yjs-store.js` 的 transact 节流参数
- **type**: number
- **default**: `50`（批写阈值，毫秒）
- **regression_subset**: tests/persistence/persistence-roundtrip.test.js + tests/persistence/undo-manager.test.js
- **rollout**: 0 (only test cohort)

---

## §12 变更协议

[PROTOCOL]: 任何对 §1～§11 的修改必须：
1. 同步更新 `src/runtime/flags/registry.js`（如改 frontmatter 后跑 `generate-flag-registry.mjs`）
2. 同步更新 `docs/topology-priority.md` §3.4 scripts/ 段
3. 跑 `npm run check:flag-topology` 确保新 flag 引入不破坏门禁
4. 跑 `npm test` 与 `npm run test:flags:on/off -- --flag=新flag` 验证双套测试通过
5. 在 PR 描述中标注本 spec 是否需要 bump 到 v0.2