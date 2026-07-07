# core-data-model 质量审查 · 2026-07-07

> **本报告由 agent team 3 视角并行审查产出**:
> - 代码审查员(数据契约 / 字段完整性 / spec drift / 不变式)
> - 架构审查员(模块边界 / API 表面 / 工厂签名 / 数据流)
> - 工程治理审查员(cross-review 合规 / non-negotiable 一致性 / scope 完整性)
>
> **审查对象**:core-data-model spec(`docs/superpowers/specs/2026-07-07-core-data-model-design.md`,status=sediment + phase=implemented)
> **审查范围**:`src/core/{thought.js, edge.js, zone.js, structure.js, geometry-cluster.js}`
> **目的**:补全 cross-review 回路 — 本 spec 已标 `status: sediment + phase: implemented`,但 `docs/audit/` 仅 SP-1 与 topological-awareness-space 两份报告,违反 `docs/methodology/08-cross-review.md` §6.2"沉淀语义要求 ≥1 份完整 audit 报告"。W9 门禁(`check-spec-topology.mjs`)已检测到本 spec 无 audit 报告。
>
> **章节顺序严格遵循 `08-cross-review.md` §7 模板**(§0 综合评分 / §1 P0 / §2 P1 / §3 P2 / §4 亮点 / §5 修复优先级 / §6 元教训)。

---

## §0 综合评分

| 维度 | 评分 | 评语 |
|---|---|---|
| 数据模型完整性 | **2.0/5** | thought.js 缺 4 字段(body/z/labels/order)、edge.js 缺 createdAt、EDGE_STYLES schema 完全 drift |
| Object.freeze 一致性 | **1.5/5** | 3 模型仅 zone.js freeze;spec §0 non-negotiable"所有模型返回不可变对象"形同虚设 |
| spec decisions 对齐度 | **2.0/5** | 5 处签名/API drift:createThought 对象→位置参数、decayTemperature (λ,dt)→nowMs、reheat→warmThought、swapEdgeDirection 缺失、store API 名称全变 |
| 不变量保护 | **1.5/5** | edge.js L104 暴露 `edges` Map + zone.js L148 暴露 `_map`,绕过所有 linkEdge/unlinkEdge 验证 |
| 代码质量(逻辑) | **3.5/5** | 函数干净、闭包封装得当、createEdge 校验 relationType、zone.classify 几何分类清晰 |
| 治理合规 | **3.0/5** | 本报告填补 audit 缺口;但 scope.files 仅列 3 文件,漏 structure.js + geometry-cluster.js |
| **综合** | **2.3/5** | "phase: implemented" 但 spec drift 严重 — 典型的"代码先于 spec 跑"完成感幻觉 |

> 评分对标:SP-1 audit `2.6/5`、topological-awareness-space audit `2.2/5`。本 spec 综合 2.3/5 — 代码逻辑质量高于 topological(无无限循环 / 无核心交互缺失),但 spec drift 与 non-negotiable 违反比 SP-1 更系统化(3 个模型里 2 个不遵守 frontmatter non-negotiable)。

---

## §1 P0 问题(必修)

### 1.1 代码:Object.freeze 不一致,违反 spec §0 non-negotiable"所有模型返回不可变对象"

- **位置**:
  - `src/core/thought.js` L24-37(`createThought` 返回纯对象,无 freeze)
  - `src/core/edge.js` L18-29(`createEdge` 返回纯对象,无 freeze)
  - `src/core/zone.js` L24-32 / L40-42(对比:`Object.freeze` ✓)
- **症状**:spec frontmatter L19-22 明确三条 non-negotiable,第一条即"所有模型返回不可变对象(浅拷贝)"。但 3 个核心模型中**只有 zone.js 调用 `Object.freeze`**,thought.js 和 edge.js 都返回可变纯对象,调用方可以 `thought.x = 999` 直接改字段而不触发任何警告。
- **根因**:non-negotiable 写在 spec frontmatter,但代码未对应实现;`check:non-negotiable` 门禁可能只查字段存在性,未查 freeze 调用。
- **影响**:
  - 持久化层的浅比较(`JSON.stringify` diff)可能因意外 mutation 而漏判变更
  - 多个调用方共享同一 thought 引用时,任一方 mutation 会污染所有调用方(SP-1 audit 1.2 同类问题:layer-store 暴露 _map)
  - non-negotiable 字段失去契约意义 — spec 写"不可变"但代码"可变",文档与实然割裂
- **修复建议**:
  1. `createThought` L26-36 返回前包一层 `Object.freeze({...})`
  2. `createEdge` L23-28 同样包 `Object.freeze`
  3. 所有返回新 thought/edge 的工厂(`addLabel` L75-83、`setColorTag` L92-93、`changeEdgeType` L119-121、`warmThought` L69-73 等)统一 freeze 返回值
  4. 在 `check:non-negotiable` 加规则:扫描 `create*` 工厂返回值是否调用 `Object.freeze`

### 1.2 代码:edge.js L104 暴露内部 `edges` Map,绕过 linkEdge/unlinkEdge 验证

- **位置**:`src/core/edge.js` L102-104
  ```
  // ⚠️ 'edges' Map 引用暴露 — 让 edge-bridge.js 的 store.edges.values() 工作
  // 公开为只读约定: 调用方不应修改此 Map, 否则绕过 linkEdge/unlinkEdge 验证
  return { list, get, has, hasEdge, linkEdge, unlinkEdge, size, clear, edges };
  ```
- **症状**:createEdgeStore 闭包返回的 API 对象**直接暴露了内部 `edges` Map 引用**。注释自己写明"调用方不应修改此 Map, 否则绕过 linkEdge/unlinkEdge 验证" — 这是"约定式只读",JavaScript 不强制。任何调用方都可以 `store.edges.set(fakeId, fakeEdge)` 注入非法边(无 fromId/toId/relationType 校验)。
- **根因**:`edge-bridge.js` 用 `store.edges.values()` 直接遍历,作者为兼容该消费方暴露了 Map;未走 `store.list()` API。
- **影响**:与 SP-1 audit 1.2(layer-store 暴露 _map)同类问题 — 一旦 P0 已识别过,本次再现说明根因未根除。
- **修复建议**:
  1. 删除 `edges` 暴露,改让 `edge-bridge.js` 调用 `store.list()`(已存在,L55-57)
  2. 若 edge-bridge 需要迭代器,提供 `store.values()` 方法返回 `edges.values()`(只读迭代器,无法 set/delete)

### 1.3 代码:zone.js L148 暴露内部 `_map: zoneById`,同类不变量绕过

- **位置**:`src/core/zone.js` L148
  ```
  return { ..., dispose, _map: zoneById };
  ```
- **症状**:与 1.2 同类 — zoneStore 闭包返回的 API 直接暴露 `_map` 引用。调用方可以 `store._map.set(fakeId, {center: NaN, radius: -1})` 绕过 `add/update` 的 Object.freeze 与字段默认值。
- **根因**:与 edge.js 同模式 — "私有 Map 通过下划线前缀约定暴露"。spec §0 non-negotiable"不可变 schema"再次被绕过。
- **影响**:zone 数据完整性无保障;后续若加 zone-level 校验(如 radius > 0),_map 直写可绕过。
- **修复建议**:
  1. 删除 `_map` 暴露
  2. 若有调试需求,改提供 `store.entries()` / `store.toArray()` 只读方法
  3. 全仓库 grep `store\._map` 确认无消费方依赖(本审查已 grep:仅 zone.js 自身定义)

### 1.4 代码:thought.js createThought 缺 4 个 spec §1.1 必需字段

- **位置**:`src/core/thought.js` L24-37
- **症状**:spec §1.1 数据字段表列出 11 个字段:`id, text, body, x/y/z, temperature, mass, colorTag, labels, order, createdAt, lastInteractionAt`。代码实际返回字段:`id, text, x, y, mass, temperature, colorTag, lastInteractionAt, createdAt` — **缺 4 个字段**:
  - `body`(念头详情,富文本/Markdown)— 缺失
  - `z`(3D 坐标 Z 轴)— 缺失(spec 默认 0)
  - `labels`(标签数组,spec 默认 `[]`)— 缺失
  - `order`(排序权重,spec 默认 0)— 缺失
- **根因**:代码先于 spec 演进,createThought 实现时 spec 字段表尚未冻结;后续 spec 补字段时未回填代码。
- **影响**:
  - 持久化层若按 spec 字段集序列化,`body/z/labels/order` 会丢失(undefined → JSON null)
  - `addLabel` L75-83 因 `thought.labels` 不存在,走 `Array.isArray(thought.labels) ? [...] : []` 兜底 — 功能侥幸不 crash,但每次 addLabel 都从零创建数组,丢失"已有 labels 应保留"语义
  - sort-axis(消费 `order` 字段)无字段可写
- **修复建议**:
  ```js
  return {
    id,
    text: text || '',
    body: '',                  // 新增
    x: x ?? 0,                 // spec 默认 0,非 random
    y: y ?? 0,                 // spec 默认 0,非 random
    z: 0,                      // 新增
    mass: 1,
    temperature: 0.5,          // spec 默认 0.5,非 1
    colorTag: null,
    labels: [],                // 新增
    order: 0,                  // 新增
    lastInteractionAt: now,
    createdAt: now
  };
  ```

### 1.5 代码:edge.js createEdge 缺 spec §2.1 必需的 `createdAt` 字段

- **位置**:`src/core/edge.js` L18-29
- **症状**:spec §2.1 Edge 数据字段表明确列出 `createdAt: number, 默认 Date.now()`。但 `createEdge` 返回的对象只有 `{ id, fromId, toId, relationType }` — **缺 `createdAt` 字段**。
- **根因**:与 1.4 同因 — 代码先于 spec。
- **影响**:
  - 持久化层序列化 edge 时 `createdAt` 丢失
  - 按时间排序边的功能(若未来需要)无字段可用
  - spec §4.3 "时间字段统一为 Date.now() 数值"在 edge 模型上未实施
- **修复建议**:
  ```js
  return {
    id,
    fromId,
    toId,
    relationType: type,
    createdAt: Date.now()       // 新增
  };
  ```

### 1.6 代码:EDGE_STYLES schema 完全 drift(spec §2.3 字段集与颜色均不一致)

- **位置**:`src/core/edge.js` L31-37 vs spec §2.3 L110-118
- **症状**:spec §2.3 给出的 EDGE_STYLES 定义:
  ```
  cause:       { color: '#5f8fff', width: 2, dash: null }
  parallel:    { color: '#5fbf9f', width: 1, dash: '4 4' }
  ...
  ```
  代码实际:
  ```
  cause:       { line: 'solid',         arrow: 'single',      color: '#7fe0c9', label: '因果' }
  parallel:    { line: 'dashed',        arrow: 'double-dot',  color: '#8b90ad', label: '并列' }
  ...
  ```
  **三重 drift**:
  - 字段集不同:spec `{ color, width, dash }`(SVG-like 3 字段)vs 代码 `{ line, arrow, color, label }`(4 字段,不同 schema)
  - 颜色完全不同:spec cause `#5f8fff`(蓝)vs 代码 cause `#7fe0c9`(青绿);5 种关系颜色全部不同
  - 代码多 `label` 字段(中文标签),spec 无此字段;代码无 `width/dash`,spec 有
- **根因**:代码与 spec 各自演进,从未对齐;`check:spec-drift` 未覆盖 EDGE_STYLES 字段集。
- **影响**:
  - 视觉层若按 spec 颜色实现,与代码实际颜色不一致,视觉返工
  - spec §6 变更协议第 4 条"若新增关系类型或样式,需在 §2.2 / §2.3 显式登记" — 代码改了样式字段集却未登记
- **修复建议**:
  1. 二选一对齐:要么代码改回 spec 的 `{ color, width, dash }`(若视觉层已按 spec 实现),要么 spec 更新为代码的 `{ line, arrow, color, label }`(若代码已是事实标准)
  2. 推荐后者(代码已有 `label` 中文标签,产品价值更高),但必须在 spec §2.3 显式登记新 schema + 在 PR 描述标注 spec bump 到 v0.2

---

## §2 P1 问题(应该修)

### 2.1 代码:createThought 签名 drift(spec 对象 vs 代码位置参数)

- **位置**:`src/core/thought.js` L24(`export function createThought(id, text, x, y)`)vs spec §1.2 L72(`createThought({ id, text, ... })`)
- **症状**:spec 写工厂签名为对象解构 `createThought({ id, text, ... })`,代码实然为位置参数 `(id, text, x, y)`。调用方按 spec 写 `createThought({ id, text })` 会得到 `{ id: {id, text}, text: undefined, ... }`。
- **根因**:代码先于 spec;spec 冻结时未对齐代码签名。
- **影响**:新人按 spec 写代码直接 crash;`check:spec-drift` 未覆盖工厂签名。
- **修复建议**:二选一:
  1. 代码改为 `createThought({ id, text, body, x, y, z, temperature, mass, colorTag, labels, order } = {})`,与 spec 对齐
  2. spec 改为位置参数 `createThought(id, text, x, y)`,与代码对齐
  3. 推荐方案 1(对象解构更易扩展,符合 spec §6 变更协议"字段集可能扩展")

### 2.2 代码:decayTemperature 签名 drift(spec (λ, dt) vs 代码 nowMs)

- **位置**:`src/core/thought.js` L39(`export function decayTemperature(thought, nowMs)`)vs spec §1.2 L75(`decayTemperature(thought, lambda = 0.05, dt)`)
- **症状**:spec 签名 `decayTemperature(thought, lambda = 0.05, dt)` 调用方传衰减系数与时间增量;代码实然 `decayTemperature(thought, nowMs)` 调用方传当前时间戳,内部用 `(nowMs - lastInteractionAt) / 86400000` 算 daysSince 作为 dt,lambda 硬编码 `DEFAULT_LAMBDA = 0.05`。
- **根因**:代码采用了更"易用"的 API(调用方只传 nowMs),但 spec 冻结的是更"灵活"的 API(可调 λ)。
- **影响**:调用方无法实验不同 λ(如 0.1 快衰减);spec drift。
- **修复建议**:
  1. 代码改为 `decayTemperature(thought, nowMs, lambda = 0.05)`,既保留易用性又暴露 λ
  2. 或 spec 更新为 `decayTemperature(thought, nowMs, lambda = 0.05)`,承认 nowMs 是更易用的入参
  3. 推荐方案 1,代码小改 + spec 小改,双方对齐

### 2.3 代码:spec §1.2 `reheat` 函数缺失,代码用 `warmThought` 代替

- **位置**:spec §1.2 L76(`reheat(thought, delta = 0.2) → clamp(temperature + delta, 0, 1)`)vs 代码 `src/core/thought.js` L69-73(`warmThought(thought, nowMs, amount)`)
- **症状**:spec 列出 `reheat(thought, delta = 0.2)`,代码无 `reheat` 函数,只有 `warmThought(thought, nowMs, amount)`。两者语义相近(都是加温度 + 更新时间戳)但:
  - 函数名不同(reheat vs warmThought)
  - 参数顺序不同(spec `delta` 第二参 vs 代码 `nowMs` 第二参、`amount` 第三参)
  - 默认值不同(spec `delta = 0.2` vs 代码 `amount ?? 0.5`)
- **根因**:代码用更语义化的 `warmThought`(对仗 `decayTemperature`),spec 用更物理化的 `reheat`。
- **影响**:调用方按 spec 调 `reheat(t, 0.2)` 直接 ReferenceError;`check:spec-drift` 未覆盖函数名。
- **修复建议**:
  1. 代码加 `export function reheat(thought, delta = 0.2) { return warmThought(thought, Date.now(), delta); }` 作为别名
  2. 或 spec 更新为 `warmThought(thought, nowMs, amount = 0.5)`,承认代码已用更优命名
  3. 推荐方案 2(代码命名更一致)+ 在 spec 加一行"原 reheat 已重命名为 warmThought"

### 2.4 代码:spec §2.4 `swapEdgeDirection(edgeId)` 缺失

- **位置**:spec §2.4 L126(`swapEdgeDirection(edgeId) → 翻转 fromId / toId`)vs 代码 `src/core/edge.js`(无此函数)
- **症状**:spec 明确列出 edge 的 3 个工厂/操作函数,代码实现了 `createEdge` 和 `createEdgeStore`,但**完全缺失 `swapEdgeDirection`**。
- **根因**:实施时未实现;spec 已 sediment 但函数未补。
- **影响**:用户无法翻转边的方向(因果倒置 / 主从互换);spec drift。
- **修复建议**:
  1. 在 `createEdgeStore` 内加 `function swapDirection(id) { const e = edges.get(id); if (!e) return null; const swapped = { ...e, fromId: e.toId, toId: e.fromId }; return linkEdge(swapped); }`
  2. 同时维护 byPair 索引(linkEdge 内部已处理 prev/fromId 不一致时删除旧 pairKey,L75-78)

### 2.5 代码:spec §2.4 createEdgeStore API 名称 drift(add/remove/update vs linkEdge/unlinkEdge)

- **位置**:spec §2.4 L125(`createEdgeStore() → { add, remove, update, byPair, list, ... }`)vs 代码 `src/core/edge.js` L104(`{ list, get, has, hasEdge, linkEdge, unlinkEdge, size, clear, edges }`)
- **症状**:spec 列出 store 应暴露 `add / remove / update / byPair`,代码实然暴露 `linkEdge / unlinkEdge`(无 `add / remove / update / byPair`)。
- **根因**:代码用了更动词化的命名(`link/unlink` 比 `add/remove` 更体现"边是连接"的语义),但 spec 未更新。
- **影响**:调用方按 spec 写 `store.add(edge)` 直接 TypeError;`byPair` 缺失意味着无法按 `(fromId, toId)` 查询边(虽有 `hasEdge` 但不返回边对象)。
- **修复建议**:
  1. 在 store 加 `function byPair(fromId, toId) { const id = byPairMap.get(pairKey(fromId, toId)); return id ? edges.get(id) : null; }`
  2. 加 `add = linkEdge` / `remove = unlinkEdge` 别名,兼容 spec 命名
  3. 或 spec 更新为 `linkEdge / unlinkEdge`,承认代码命名更优

### 2.6 代码:默认值 drift(temperature 0.5 vs 1;x/y 0 vs random)

- **位置**:
  - `src/core/thought.js` L32(`temperature: 1`)vs spec §1.1 L62(`默认 0.5`)
  - `src/core/thought.js` L29-30(`x: (Math.random() - 0.5) * 600, y: (Math.random() - 0.5) * 400`)vs spec §1.1 L61(`默认 0`)
- **症状**:两处默认值 drift:
  - `temperature` 代码默认 1(满热),spec 默认 0.5(中) — 语义差异大:1 表示新念头"沸腾",0.5 表示"常温"
  - `x/y` 代码用随机散布(spec 未规定随机),spec 默认 0 — 代码的随机散布是"无主见时别重叠"的工程兜底,但 spec 默认 0 是"调用方负责赋值"的契约
- **根因**:代码为"开箱即用"做了随机兜底,spec 为"显式契约"留 0。
- **影响**:新建念头的初始温度/位置不可预测;测试无法断言(随机性)。
- **修复建议**:
  1. 代码改 `temperature: 0.5` 与 spec 对齐
  2. `x/y` 改为 `x: x ?? 0, y: y ?? 0`,把随机散布移到调用方(main.js 投念头时传 random)
  3. 测试用例无需 mock Math.random

### 2.7 治理:spec scope.files 漏列 structure.js 和 geometry-cluster.js

- **位置**:spec frontmatter L10(`files: [src/core/thought.js, src/core/edge.js, src/core/zone.js]`)
- **症状**:scope.files 只列 3 文件,但 `src/core/` 实际有 5 个文件,其中:
  - `structure.js`(cohesionScore + isCrystallized,被 geometry-cluster 消费)— 消费 thought/edge 数据,与 spec §5 已知缺口 #1"mass 计数"相关
  - `geometry-cluster.js`(clusterEngine,实现 IGeometryEngine 接口)— 消费 thought + edges 算布局
  - 二者都是 spec 数据模型的下游消费方,但 spec scope 未列入,导致 cross-review 审查范围天然不全(本次审查若机械按 scope.files 走,会漏掉 structure.js 的 cohesionScore 公式问题,见 §3 P2)。
- **根因**:scope 在 spec 创建时填写,后续 src/core 扩展时未回填。
- **影响**:`check:spec-topology` / `check:non-negotiable` 基于不完整的 scope 给出"全过"假象;与 topological-awareness-space audit 2.1 同类问题。
- **修复建议**:scope.files 补全为 `[thought.js, edge.js, zone.js, structure.js, geometry-cluster.js]`;或改用 `scope.modules: [src/core]` 全模块覆盖。

### 2.8 架构:spec §5 已知缺口未升级为 P1 修复任务

- **位置**:spec §5 L181-186(3 条已知缺口)
- **症状**:spec §5 诚实列出了 3 条已知缺口:
  1. `mass` 中的 `editions / references` 计数来源不明(代码无累计逻辑)
  2. `order` 字段由 sort-axis 维护,但写入时序冲突边界未 spec
  3. `lastInteractionAt` 的"交互"定义不明(编辑/引用/召唤/聚焦?代码无统计实现)
  但这些缺口在 spec 标 `phase: implemented` 后**未升级为 P1 修复任务**,而是停留在"已知"状态。代码中 `updateMass(editions, references)` L49-52 存在但无调用方;`order` 字段在 createThought 中根本不存在(见 1.4);`lastInteractionAt` 仅在 `warmThought`/`refreshTemperature` 时更新,无"引用/召唤/聚焦"事件触发。
- **根因**:`phase: implemented` 与"已知缺口未修"矛盾 — implemented 应表示字段集已落地,但 3 个字段未落地。
- **影响**:数据模型完整性虚假宣称;下游(行为引擎 / 持久化层)按 spec 字段集实现时找不到对应字段。
- **修复建议**:
  1. 在 spec §5 每条缺口后加 `→ 修复任务: <issue-id> / <owner> / <due-date>`
  2. 或把 `phase` 降级为 `partial-implemented`,明示 3 字段未落地
  3. 或删除未落地字段(body/z/labels/order/mass 公式),spec 收敛到代码已实现的部分

---

## §3 P2 问题(锦上添花)

- **`src/core/structure.js` L34**:cohesionScore 公式 `0.4 * edgeDensity + 0.3 * normalizedVariance` 权重和 0.7 而非 1.0,推测缺第三项(如 sizeFactor 0.3)。当前 max score = 0.7 = 阈值 COHESION_THRESHOLD(0.7),只有完美 edge density + 完美 variance 才过阈值。建议补第三项或调阈值。
- **`src/core/structure.js` L39**:`isCrystallized` 当 `userConfirmed=true` 时 score = `0.4 * base + 0.6`,即 base=0.25 即可过 0.7 阈值 — 用户确认的低内聚集群也会被判为"已结晶",可能非预期。建议 userConfirmed 权重降到 0.3 或要求 base ≥ 0.4 才允许 userConfirmed 过阈。
- **`src/core/geometry-cluster.js` L26-30**:`computeLayout` 只算 `x, y`,无 `z` — 与 spec §1.1 thought 的 3D 坐标规约不符(虽然 cluster 是 2D 概念,但若用于 3D 场景需补 z)。
- **`src/core/thought.js` L64-67`normalizeLabel`**:去除 `#+` 前缀 + 压缩空格 + 转小写 — spec §1.1 labels 字段说明"去重 + 归一化"未明示归一化规则,代码隐含 `#标签` → `标签`。建议 spec §1.1 补归一化定义。
- **`src/core/zone.js` L19**:`nextId()` 用 `Math.random()` 非加密强,虽不影响稳定性(每次 add 生成新 id,持久化保留),但与 spec §4.1"推荐 crypto.randomUUID()"建议不符。建议改 `crypto.randomUUID()`(Node 19+ / 浏览器原生支持)。
- **`src/core/zone.js` L78 vs L66-68**:`classify` 用 `thought.x || 0`,`distanceTo` 用 `point.x ?? 0` — 两个操作符混用。`||` 对 falsy(0/NaN)与 undefined 同样处理,`??` 仅对 null/undefined。对 number 字段无功能差异,但风格不一致。建议统一 `??`。
- **`src/core/edge.js` L52`pairKey`**:不处理 `fromId === toId` 自环边 — 自环边会成功 linkEdge 但 byPair 索引 key 相同。建议 spec §2 显式声明是否允许自环。
- **`src/core/edge.js` L79`linkEdge` 用 `{ ...prev, ...edge }` 合并**:若 edge 携带 schema 外字段(如 `__meta`),会被一并写入,无 schema 白名单。建议加字段过滤。
- **`src/core/thought.js` L54-56`getName`**:返回 `text.slice(0, 6)` 硬编码 6 字符 — spec §1.1 规定 `text ≤ 120 字`,但未规定 display name 长度。建议提为常量 `DISPLAY_NAME_LEN = 6`。
- **`src/core/thought.js` 无 `removeLabel` 在 spec 中登记**:代码 L85-90 有 `removeLabel`,但 spec §1.2 未列出。建议 spec 补登记(与 addLabel 对称)。
- **`src/core/edge.js` 无 `update` 方法**:spec §2.4 列出 store 应有 `update`,代码无。需与 2.5 一并修。
- **`docs/superpowers/specs/2026-07-07-...md` L11**:`scope.lines: []` 空,未精确到行;建议补关键行号(如 thought.js L24-37、edge.js L18-29)便于 cross-review 锚定。

---

## §4 亮点(必须保留)

> cross-review 方法论 §7 强制要求:亮点必须明示,避免下次重构误删好的设计决策。

### 4.1 zone.js 的 Object.freeze(唯一遵守 non-negotiable 的模型)

- **位置**:`src/core/zone.js` L24-32(`add` 内 `Object.freeze({...})`)+ L40-42(`update` 内 `Object.freeze({ ...z, ...patch })`)
- **价值**:3 个核心模型中**只有 zone.js 真正实施了 spec §0 non-negotiable"所有模型返回不可变对象"**。`add` 和 `update` 返回前都包 `Object.freeze`,任何调用方尝试 `zone.name = 'x'` 都会在严格模式下抛 TypeError,非严格模式下静默失败(不污染内部 Map)。
- **为什么保留**:这是 spec non-negotiable 的"正确实现范本"。下次重构若有人觉得"freeze 影响性能"想删,必须保留 — 性能影响可忽略(V8 优化良好),但不变量保护是数据模型底座的护城河。同时也是 1.1 修复 thought.js / edge.js 时可参考的模板。

### 4.2 edge.js createEdge 的 relationType 校验(防御性编程)

- **位置**:`src/core/edge.js` L18-29(`createEdge`)+ L20-22(throw on invalid)
- **价值**:`createEdge` 在构造前显式校验 `relationType` 是否在 `VALID_TYPES` 内,不合法直接 `throw new Error(...)` 并列出合法值。这是把"非法数据"挡在工厂门口,而非让脏数据流入系统后被消费方 crash。
- **为什么保留**:这是数据模型底座应有的"契约式编程"实践。下次重构若有人想"宽恕非法输入给默认值",必须保留 throw 语义 — 默认值会掩盖 bug,throw 暴露 bug。

### 4.3 edge.js createEdgeStore 的 byPair 双索引(空间换时间)

- **位置**:`src/core/edge.js` L48-49(`edges` Map + `byPair` Map 双索引)+ L51-53(`pairKey`)+ L72-83(`linkEdge` 维护双索引)+ L67-70(`hasEdge` O(1) 查询)
- **价值**:EdgeStore 维护两份索引 — `edges`(id → edge)和 `byPair`(`${fromId}::${toId}` → edgeId)。`hasEdge(fromId, toId)` O(1) 返回,无需遍历。`linkEdge` 在写入时同步维护两份索引,`unlinkEdge` 同步清理两份。这是把"按端点查边"的高频查询从 O(n) 降到 O(1) 的经典空间换时间。
- **为什么保留**:边的"端点对查询"是渲染层(画线)、行为引擎(因果传递)、持久化层(去重)的共同高频操作。下次重构若有人觉得"两份 Map 内存浪费"想合并,必须保留 — 内存换的是每次渲染帧的 N 倍性能。

### 4.4 zone.js classify 的"最近包含"几何分类(干净的空间归属算法)

- **位置**:`src/core/zone.js` L77-89(`classify`)+ L65-70(`distanceTo`)+ L72-74(`contains`)
- **价值**:`classify(thought)` 遍历所有 zone,计算 thought 到每个 zone 球心的欧氏距离,返回**距离最近且在半径内**的 zone id。处理了三个边界:① thought 不在任何 zone 内(返回 null);② 多个 zone 重叠(取最近);③ thought 在 zone 边界(`<=` 包含)。算法干净,无浮点误差陷阱。
- **为什么保留**:spec §3.2 归属算法明确"一个 thought 只属一个 zone(最近的)" — 代码精确实现了 spec 的"最近"语义。下次扩展为"多 zone 归属"或"模糊归属"时,此算法是基线参考。

### 4.5 thought.js normalizeLabel 的标签归一化(去 # + 压空格 + 小写)

- **位置**:`src/core/thought.js` L64-67(`normalizeLabel`)+ L75-83(`addLabel` 调用归一化)+ L85-90(`removeLabel` 调用归一化)
- **价值**:`normalizeLabel` 三步归一化:① 去前导 `#`(兼容 markdown hashtag 写法);② 压缩中间多空格为单空格;③ 转小写。`addLabel` 和 `removeLabel` 都先归一化再操作,保证 `#Tag` / `tag` / `  Tag  ` 三种写法视为同一标签 — 这是把"用户输入多样性"挡在数据层之前。
- **为什么保留**:标签去重与查找依赖归一化后的稳定 key。下次重构若有人想"保留原始大小写",必须保留归一化(可用 displayCase/originalCase 字段,但 key 必须归一)。

### 4.6 structure.js cohesionScore 的"内聚度量化"(把抽象概念变可计算)

- **位置**:`src/core/structure.js` L10-35(`cohesionScore`)+ L37-41(`isCrystallized`)
- **价值**:把"一组念头的内聚度"从主观判断变为可计算公式 — 边密度(40%)+ 度分布均匀性(30%)。这是 spec §0"念头是第一公民"在数据层的延伸:不仅念头是对象,念头之间的关系也有可量化的"质量"。`isCrystallized` 进一步引入 `userConfirmed` 作为人工确认信号,把机器评分与人类判断组合。
- **为什么保留**:这是后续 crystallize 行为引擎(spec §0 后续项)的算法底座。下次重构若有人想"用 GPT 算内聚度",必须保留此公式作为 baseline 与对照。

---

## §5 修复优先级清单

> 决策矩阵(参考 cross-review §3.3):P0 当前会话必修,P1 应修(允许妥协/错峰),P2 可留 TODO。

| # | 问题 | 级别 | 决定 | 理由 |
|---|---|---|---|---|
| 1 | Object.freeze 不一致(1.1) | **P0** | 立即修 | spec §0 non-negotiable 违反,3 模型仅 1 freeze |
| 2 | edge.js 暴露 edges Map(1.2) | **P0** | 立即修 | 绕过 linkEdge/unlinkEdge 验证;SP-1 同类问题再现 |
| 3 | zone.js 暴露 _map(1.3) | **P0** | 立即修 | 与 1.2 同类,一并清理 |
| 4 | thought.js 缺 4 字段(1.4) | **P0** | 立即修 | 数据模型完整性;影响持久化与下游消费 |
| 5 | edge.js 缺 createdAt(1.5) | **P0** | 立即修 | 一行补字段,spec §2.1 明确列出 |
| 6 | EDGE_STYLES schema drift(1.6) | **P0** | 立即决 | 二选一对齐:代码改回 spec 或 spec 更新为代码 |
| 7 | createThought 签名 drift(2.1) | P1 | 立即修 | 与 1.4 合并修:改对象解构 |
| 8 | decayTemperature 签名 drift(2.2) | P1 | 立即修 | 加 lambda 参数,默认 0.05 |
| 9 | reheat 缺失(2.3) | P1 | 立即修 | 加别名或 spec 更新 |
| 10 | swapEdgeDirection 缺失(2.4) | P1 | 立即修 | 5 行加 store 方法 |
| 11 | store API 名称 drift(2.5) | P1 | 立即修 | 加 add/remove 别名 + byPair 方法 |
| 12 | 默认值 drift(2.6) | P1 | 立即修 | temperature 1→0.5;x/y random→0 |
| 13 | scope.files 漏 2 文件(2.7) | P1 | 立即修 | 一行改 frontmatter |
| 14 | 已知缺口未升级任务(2.8) | P1 | 立即决 | spec §5 加 owner/due-date,或降 phase |
| 15-25 | 11 项 P2 | P2 | 写 TODO | 不影响功能,下次会话或 backlog |

**修复顺序建议**:
```
1. 修 1.1(Object.freeze)— 在 thought.js + edge.js 加 freeze,zone.js 已有范本
2. 修 1.2/1.3(Map 暴露)— 删 edges/_map,改让消费方走 list()
3. 修 1.4/1.5(字段缺失)— 一并补 thought 4 字段 + edge createdAt
4. 修 2.6(默认值)— temperature 0.5 / x/y 0
5. 决 1.6(EDGE_STYLES)— 与视觉层对齐二选一
6. 修 2.1/2.2/2.3(签名 drift)— createThought 改对象 + decayTemperature 加 λ + reheat 别名
7. 修 2.4/2.5(store API)— swapEdgeDirection + byPair + add/remove 别名
8. 修 2.7(scope.files)— 一行改 frontmatter
9. 决 2.8(已知缺口)— owner 分配或 phase 降级
10. 错峰:P2 11 项写 backlog
```

---

## §6 元教训(完成感幻觉)

> cross-review 方法论 §7 要求每份 audit 暴露"完成感幻觉"。

### 6.1 "phase: implemented" ≠ "代码与 spec 对齐"

本 spec frontmatter 标 `phase: implemented`(P2-1:数据契约已实施,门禁通过),但代码与 spec 多处 drift:
- 5 处工厂签名/API drift(createThought / decayTemperature / reheat / swapEdgeDirection / store API)
- 6 处字段 drift(thought 缺 4 字段 / edge 缺 createdAt / EDGE_STYLES schema)
- 1 处 non-negotiable 违反(Object.freeze 仅 1/3 模型实施)

**教训**:`phase: implemented` 是状态机声明,不是事实。状态机推进时若不跑 `check:spec-drift` 验证代码与 spec decisions 对齐,`implemented` 就是自我安慰。建议在 `check:spec-topology` 加规则:`phase: implemented` 的 spec 必须通过 `check:spec-drift` 0 警告。

### 6.2 "non-negotiable" 写在 spec ≠ 代码遵守 non-negotiable

spec frontmatter L19-22 明确三条 non-negotiable:
1. "所有模型返回不可变对象(浅拷贝)" — 3 模型仅 zone.js freeze
2. "id 必须稳定字符串" — zone.js nextId 用 Math.random()(非稳定生成,虽持久化后稳定)
3. "time 字段统一为 Date.now() 毫秒数值" — edge.js createEdge 缺 createdAt

**教训**:non-negotiable 是"红线",但红线只在 spec 文档里画了,代码未对应实现。`check:non-negotiable` 门禁若只查"字段是否存在",不查"Object.freeze 是否调用" / "createdAt 是否设置",non-negotiable 就是装饰性字段。建议 cross-review §7 模板加一条:audit 报告必须**反向校验 non-negotiable 在代码中的实施情况**,发现未实施即作为 P0 上报。

### 6.3 "spec §5 已知缺口" 是诚实,但不是"已完成"

spec §5 诚实列出 3 条已知缺口(mass 计数 / order 时序 / lastInteractionAt 定义)— 这种诚实值得肯定。但缺口停留在"已知"状态,而 spec 已标 `phase: implemented` — 矛盾。

**教训**:"已知缺口"是过渡状态,必须升级为"修复任务"或降级 spec phase。`phase: implemented` 与"3 个字段未落地"不可共存。建议 spec 模板加规则:`§5 已知缺口` 每条必须挂 `<issue-id> / <owner> / <due-date>`,否则 phase 不可标 `implemented`。

### 6.4 "代码先于 spec 跑"是常见模式,但 spec 必须回填

本 spec 多处 drift(createThought 签名、EDGE_STYLES schema、默认值)都是"代码先实现,spec 后冻结"导致 — 代码已用更优命名(warmThought > reheat)或更易用 API(nowMs > lambda,dt),但 spec 冻结时未回填代码的改进。

**教训**:"代码先于 spec"是敏捷开发的常态,但 spec 冻结时**必须**回填代码的实然改进,否则 spec 与代码永远 drift。建议在 spec §6 变更协议加一条:`phase: implemented` 前,spec 作者必须跑一次 `diff spec-vs-code`,把代码已改进的命名/API 回填到 spec。

### 6.5 "scope.files 不完整" = 审查盲区的元问题(复发)

本 spec `scope.files` 列 3 文件,但 `src/core/` 实际有 5 文件,漏 structure.js 和 geometry-cluster.js。本次审查若机械按 scope.files 走,会漏掉 structure.js 的 cohesionScore 公式问题(§3 P2)。

**教训**:与 topological-awareness-space audit 2.1 / 6.4 同类问题 — scope.files 不完整是审查盲区的元问题,在两个 spec 上连续复现。根因是 spec 创建时填 scope,后续扩展模块时无机制回填。建议 cross-review §7 模板加规则(已在 topological audit 6.4 提出,此处复述强化):audit 报告必须**反向校验 spec scope.files 完整性**,发现漏列即作为 P1 治理问题上报;同时 `check:spec-topology` 加规则:`scope.modules` 下列出的目录,其所有 `.js` 文件必须在 `scope.files` 中或显式标 `excluded`。

### 6.6 SP-1 audit 的 P0 在 core-data-model 再现(Map 暴露)

SP-1 audit 1.2 发现 `layer-store.js` 暴露 `_map`,本 audit 1.2/1.3 发现 `edge.js` 暴露 `edges`、`zone.js` 暴露 `_map` — **同类问题在 3 个 store 上独立复现**。这说明 SP-1 修复时未把"Map 暴露"作为模式问题根除,而是只修了 layer-store 一处。

**教训**:audit 发现的 P0 若只修"该文件"而不 grep 全仓库同类模式,问题会在下一个 audit 复现。建议 cross-review §3.1 收到报告后加一步:**对每个 P0 在全仓库 grep 同类模式**,一并修复。本次 audit 已触发该教训 — 建议立即 grep `store\._map` / `store\.\w+Map` 全仓库,确认无第四处暴露。

---

## 附录:审查视角正交性检查

| 视角 | 主要查 | 不查 |
|---|---|---|
| 代码审查员 | 字段完整性 / spec drift / Object.freeze / 不变式保护 | 治理门禁 / 状态机 / scope |
| 架构审查员 | 工厂签名 / store API / 模块边界 / 数据流 | 测试存在性 / non-negotiable 字段 / 公式正确性 |
| 工程治理审查员 | non-negotiable 一致性 / scope 完整性 / spec §5 缺口 | 具体 bug / 算法细节 |

**正交性验证**:三视角无重叠任务,但发现的问题有交叉(如 Object.freeze 违反同时被代码视角和治理视角发现;scope.files 不完整同时被架构视角和治理视角发现)。合并后已去重。

**与既有 audit 的对标**:
- SP-1 audit(2.6/5):核心功能未接通 + 治理 hook 缺失 — 偏"接通性"问题
- topological-awareness-space audit(2.2/5):spec drift + 测试缺失 — 偏"实施完整性"问题
- 本 audit(2.3/5):spec drift + non-negotiable 违反 — 偏"契约一致性"问题

三者共同暴露"完成感幻觉"的同构性:状态机推进时未把 cross-review 作为前置门禁。

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
