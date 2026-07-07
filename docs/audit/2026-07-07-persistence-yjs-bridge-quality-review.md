# persistence-yjs-bridge 质量审查 · 2026-07-07

> **本报告由 agent team 3 视角并行审查产出**:
> - 代码审查员 (代码不变式 + spec drift + bug)
> - 架构审查员 (Yjs 权威性 + bridge 一致性 + 数据流 + UndoManager origin 语义)
> - 工程治理审查员 (cross-review 合规 + 测试覆盖 + IndexedDB 镜像可重建性 + 状态机一致性)
>
> **审查对象**:persistence-yjs-bridge spec(`docs/superpowers/specs/2026-07-07-persistence-yjs-bridge-design.md`)及其代码产物
> **审查范围**:`src/persistence/` 下 10 个 `.js` + `CLAUDE.md`(共 11 文件,与 spec §0 引言"11 个文件"一致),关联消费层 `src/main.js`
> **目的**:补全 cross-review 回路 — 本 spec 标 `status: sediment / phase: implemented` 但 `docs/audit/` 仅 SP-1 与 topological-awareness-space 两份报告,违反 `docs/methodology/08-cross-review.md` §6.2"沉淀语义要求 ≥1 份完整 audit 报告"。
>
> **章节顺序严格遵循 `08-cross-review.md` §7 模板**(综合评分 / P0 / P1 / P2 / 亮点 / 修复优先级 / 元教训)。

---

## §0 综合评分

| 维度 | 评分 | 评语 |
|---|---|---|
| 代码不变式 | **1.5/5** | `_getFlagVariant` 未导入即调用(ReferenceError);生产 UndoManager 观察错误 Y 类型 |
| spec 对齐度 | **2.5/5** | bridge 五件套形态合规,但 exporter/importer 字段漏 `body`/`order`、integrity 返回形状 drift、setup 函数名 drift |
| 测试覆盖 | **3.0/5** | 8 份测试覆盖 8/10 模块;但生产路径(yjs-store 的 `getUndoManager`)零覆盖,正确实现(createUndoManager)只在测试里跑 |
| 治理合规 | **2.0/5** | sediment 无 audit(本报告填补)、CLAUDE.md 准确、dbName 与 spec 默认不一致 |
| **Yjs 权威性** | **2.0/5** | 设计意图正确(memory 是投影),但 main.js 绕过 bridge 直接 `yThoughts.set`,bridge 双向镜像在 生产装配 中根本未启动 |
| **bridge 模式一致性** | **3.5/5** | 5 bridge 共享 ORIGIN/suppressFromDoc/transactIfPossible/syncToStore/syncToDoc/destroy 形态;edge-bridge.syncToDoc 漏 hasDiff 更新 |
| **UndoManager origin 语义** | **1.5/5** | undo-manager.js 设计正确(trackedOrigins 排除 integrity-repair),但 yjs-store.js:17 与 main.js:48 用的是无 origin 过滤的破版本 |
| **IndexedDB 镜像可重建性** | **2.0/5** | dbName 在 spec(`thoughtspace-notes-phase0`)与 main.js(`topology-space-phase0`)不一致;冷启动能否恢复未验证 |
| **综合** | **2.2/5** | 设计骨架优秀,但生产装配把骨架拆了重接 — 典型"spec 凝固 ≠ 代码对齐"。对标 topological-awareness-space audit(2.2/5)持平 |

> 评分对标 SP-1(2.6/5)与 topological-awareness-space(2.2/5):本 spec 的设计骨架(5 bridge + UndoManager origin + integrity-repair 不可逆)质量明显高于前两者,但生产装配缺陷使综合持平。

---

## §1 P0 问题(必修)

### 1.1 代码:`_getFlagVariant` 未导入即调用 — `initPersistence()` 必抛 ReferenceError
- **位置**:`src/persistence/yjs-store.js:18`(`const _batchThreshold = _getFlagVariant('yjs-persistence-batch-write', { bucket: 0 });`)
- **症状**:`yjs-store.js` 顶部仅 `import * as Y from 'yjs'` 与 `import { IndexeddbPersistence } from 'y-indexeddb'`,**从未导入 `_getFlagVariant`**。全仓库 grep 确认:`_getFlagVariant` 只在 `src/render/viewport-state.js:30` 通过 `import { getVariant as _getFlagVariant } from '../runtime/flags/index.js'` 引入,作用域不跨文件。`initPersistence()` 一旦被 `main.js:27` 调用,立即抛 `ReferenceError: _getFlagVariant is not defined`。
- **根因**:跨模块复制代码片段时漏带 import;或残留的"flag 接入实验"代码未清理。
- **影响**:整个持久化层在浏览器首屏即崩,所有下游 bridge 装配失效;**spec §0 第 1 条"Yjs 是唯一权威数据源"在物理上不成立**。
- **修复建议**:
  1. 立即删除 `yjs-store.js:18-21` 整段(`_batchThreshold` 计算 + 挂到 `persistence._batchThreshold`),因为 `persistence._batchThreshold` 不是 y-indexeddb 公开 API,本就是无效挂载;
  2. 或若确实需要 batch-write flag,补 `import { getVariant as _getFlagVariant } from '../runtime/flags/index.js'`,并在 `runtime/flags` 注册 `yjs-persistence-batch-write`。

### 1.2 代码:UndoManager 观察错误 Y 类型 — `getText('thoughts')` 而非 `getMap('thoughts')`
- **位置**:`src/persistence/yjs-store.js:17`(`undoManager = new Y.UndoManager(ydoc.getText('thoughts'));`)
- **症状**:spec §1.3 明确"默认观察范围仅 `[thoughts, edges]` 两个 map";但代码用 `ydoc.getText('thoughts')` 取的是 **`Y.Text`** 类型,而真实数据存于 `ydoc.getMap('thoughts')`(**`Y.Map`** 类型)。Yjs 中 `getText` 与 `getMap` 取的是完全不同的 Y 实例:即使 `yMap.set(id, ...)` 写入再多次,`Y.Text` 上也不会产生任何变更事件,UndoManager 的 undoStack 永远为空。
- **根因**:复制粘贴 Y.Text 示例代码后未替换为 Y.Map;且无任何测试覆盖 `yjs-store.js` 的 `initPersistence`。
- **影响**:
  - `Ctrl+Z` 永远不生效(canUndo() 恒为 false)
  - 用户每次编辑都丢失撤销能力,但 UI 仍显示"可撤销"(若 UI 绑定 canUndo)
  - spec §1.3 "默认 trackedOrigins = {thought-bridge, edge-bridge, importer, bulk-action}" 形同虚设
- **修复建议**:
  ```js
  // yjs-store.js L17 改为:
  undoManager = new Y.UndoManager(
    [ydoc.getMap('thoughts'), ydoc.getMap('edges')],
    { trackedOrigins: new Set(['thought-bridge', 'edge-bridge', 'importer', 'bulk-action']),
      captureTimeout: 100 }
  );
  ```
  或更优:删除 yjs-store.js 内联创建,在 `initPersistence` 末尾调 `createUndoManager(ydoc)`(见 1.3)。

### 1.3 代码:生产用错的 `getUndoManager()`,正确的 `createUndoManager()` 只在测试里跑
- **位置**:`src/main.js:15`(`import { ..., getUndoManager, ... } from './persistence/yjs-store.js'`)+ `src/main.js:48`(`const undoManager = getUndoManager();`)+ `src/persistence/undo-manager.js:18`(正确的 `createUndoManager`)
- **症状**:仓库里有两套 UndoManager 实现:
  - **破版**(`yjs-store.js:17`):观察 Y.Text、无 trackedOrigins、无 captureTimeout、无 destroy/getManager/onChange 包装
  - **正版**(`undo-manager.js:18` `createUndoManager`):观察 `[getMap('thoughts'), getMap('edges')]`、trackedOrigins 4 项、mergeWindowMs=100、有 onChange/clear/destroy
  - main.js 用破版;`tests/persistence/undo-manager.test.js` 只测正版。**生产与测试走两条路**。
- **根因**:`undo-manager.js` 是 spec §1.3 的合规实现,但 main.js bootstrap 从未迁移到新 API;两版共存 + 没有任何"生产装配测试"暴露该问题。
- **影响**:所有 spec §1.3 的 origin 过滤设计(包括"integrity-repair 故意不在 trackedOrigins")在生产中**完全不生效**;integrity repair 也可能进 undo 栈(因为无 origin 过滤)。
- **修复建议**:
  1. main.js:15 改为 `import { createUndoManager } from './persistence/undo-manager.js';`
  2. main.js:48 改为 `const undoManager = createUndoManager(getDoc());`
  3. 删除 yjs-store.js:17 的 UndoManager 创建 + L34-36 的 `getUndoManager` 导出
  4. 在 yjs-store.js 顶部注释明示"UndoManager 由 undo-manager.js 创建,本模块不再导出 getUndoManager"

### 1.4 架构:main.js 完全绕过 bridge 装配,直接操作 Y.Map
- **位置**:`src/main.js:15`(只 import `getThoughts/getEdges`,未 import `setupThoughtPersistenceBridge`/`setupPersistenceBridge`/`setupActionPersistenceBridge`/`setupCrystalPersistenceBridge`)+ `src/main.js:43`(只对 zone 用了 `createZoneBridge`,其余 bridge 在 main.js 中**从未被实例化**)+ `src/main.js:71-76`(sim tick 直接 `yThoughts.set(n.id, {...t, x, y, z})`)
- **症状**:spec §5 装配契约要求"每个 bridge 提供 `setupXxxPersistenceBridge(...)` 入口",且 spec §0 第 2 条铁律"写入必须经 bridge/importer 路径,且包在 `doc.transact(fn, ORIGIN)` 内"。但 grep 全仓库确认 main.js **从未调用** `setupThoughtPersistenceBridge` / `setupPersistenceBridge` / `setupCrystalPersistenceBridge` / `setupActionPersistenceBridge`(只有 DEBUG_NOTES.md 提到)。生产中:
  - thought-bridge / edge-bridge / crystal-bridge / action-bridge 在 main.js 中**不存在实例**
  - memory thought Map 与 Y.Map('thoughts') 之间**没有双向镜像**
  - sim tick 直接 `yThoughts.set(...)` 写权威源,origin 是 `'sim'`(不在 trackedOrigins 中,所以即便 1.3 修好 UndoManager 也不会污染栈 — 这点设计正确)
  - 但用户在 UI 中编辑念头的位置/温度/标签时,没有 bridge 把 memory → Y,数据停留在内存,刷新即失
- **根因**:实施时跳过了 bridge 装配步骤,直接用 Y.Map 当 memory 用;spec §5 装配契约未在 main.js 落地。
- **影响**:
  - spec §0 第 1 条"Yjs 是唯一权威数据源,memory store 只是渲染投影"在生产中**反过来了** — Y.Map 既是权威源又是渲染源,没有 memory store 抽象层
  - 五座桥里四座在生产中是死代码,只 zone-bridge 活着
  - spec §6 R1 "bridge 同质化未抽取"实际更严重 — 不仅没抽取,4/5 还没装配
- **修复建议**:
  1. 在 main.js 引入 `import { setupThoughtPersistenceBridge } from './persistence/thought-bridge.js'` 等 4 个 setup
  2. 在 `initPersistence()` 后、`createSim3D()` 前,依次装配 5 座 bridge 并 `syncToStore()`
  3. sim tick 仍可保留直接写 Y.Map(origin='sim'),但 UI 编辑(拖拽念头、改标签)必须经 bridge 的 `updateOne(thought)`

### 1.5 治理:dbName 在 spec / main.js / 默认值 三处不一致 — IndexedDB 镜像可重建性破坏
- **位置**:
  - spec §1.1:`默认 dbName:thoughtspace-notes-phase0`
  - `src/persistence/yjs-store.js:16`:`dbName || 'thoughtspace-notes-phase0'`(与 spec 一致 ✓)
  - `src/main.js:27`:`await initPersistence('topology-space-phase0')`(显式传 `'topology-space-phase0'`)
- **症状**:main.js 显式传入与 spec 默认不同的 dbName。结果是浏览器 IndexedDB 里实际创建的数据库名为 `topology-space-phase0`,而 spec / yjs-store.js 默认值是 `thoughtspace-notes-phase0`。任何按 spec 默认值去定位 IndexedDB 的工具(迁移脚本、备份恢复、跨设备同步)都会找不到数据。
- **根因**:topological-awareness-space spec 实施时为了与 SP-1 数据隔离,自定义了 dbName,但未回填 persistence-yjs-bridge spec。
- **影响**:
  - spec §6 R4 "dbName 升级未做迁移"风险被放大 — 当前 dbName 已与 spec 默认不一致,任何"按 spec 默认 dbName 写迁移脚本"的尝试都会读到空数据库
  - IndexedDB 镜像**冷启动可重建性**存疑:用户若误删 yjs-store.js 中的默认值 fallback 或修改 main.js 的传参,数据即"消失"(实际是数据库名不匹配)
- **修复建议**:
  1. 二选一:把 main.js:27 改为 `await initPersistence()`(用 spec 默认值);或在 spec §1.1 明示"实际生产 dbName 由 main.js 决定,默认 `topology-space-phase0`"
  2. 推荐:在 spec §1.1 加表格"dbName 来源优先级:main.js 显式 > spec 默认 > yjs-store fallback",并要求 main.js 的 dbName 选择在 spec 中登记
  3. 补一份 `tests/persistence/yjs-store.test.js` 验证 dbName 传递链

### 1.6 治理:edge-bridge 的 setup 函数名与 spec §5 不一致 — spec drift
- **位置**:`src/persistence/edge-bridge.js:162`(`export async function setupPersistenceBridge(store, doc, dbName)`)+ spec §5 L189(`setupEdgePersistenceBridge 会立即调一次 syncToStore()`)
- **症状**:spec §5 明示函数名为 `setupEdgePersistenceBridge`,但代码导出 `setupPersistenceBridge`(无 `Edge` 前缀)。grep 确认 main.js 也未 import 该函数,所以这是孤儿 API — 名字不对、也没人调。
- **根因**:edge-bridge 是最早实现的 bridge,命名未遵循后续 4 个 bridge 的 `setupXxxPersistenceBridge` 约定。
- **影响**:cross-review 范围内若按 spec §5 找 `setupEdgePersistenceBridge` 会找不到,误判为"未实现";实际上有功能等价物但名字错。
- **修复建议**:
  1. `edge-bridge.js:162` 重命名为 `setupEdgePersistenceBridge`
  2. 全仓库 grep `setupPersistenceBridge` 用法(目前只有定义无调用,所以重命名安全)
  3. 或反向:把 spec §5 的 `setupEdgePersistenceBridge` 改为 `setupPersistenceBridge`,但破坏 5 bridge 命名一致性,不推荐

---

## §2 P1 问题(应该修)

### 2.1 代码:exporter 漏导出 `body` 与 `order` 字段(spec §2.2 thought META_FIELDS)
- **位置**:`src/persistence/exporter.js:14-28`(`buildExportPayload` 的 thought 清洗逻辑)
- **症状**:spec §2.2 thought META_FIELDS = `id, text, body, x, y, z, mass, temperature, colorTag, labels, lastInteractionAt, createdAt, order`(13 字段)。exporter 实际导出:`id, text, x, y, z, mass, temperature, colorTag, labels, createdAt, lastInteractionAt`(11 字段)。**漏 `body` 与 `order`**。
- **根因**:exporter 实施时 thought-bridge 的 META_FIELDS 还没加 `body`/`order`;后续 spec 升级时未回填 exporter。
- **影响**:导出的 JSON / Markdown 缺念头正文与排序字段;导入到新实例时 `body` 与 `order` 永久丢失。spec §7 变更协议第 3 条"若影响 META_FIELDS,同步更新 exporter 白名单与 importer validatePayload"被违反。
- **修复建议**:在 exporter.js L17-27 补 `if (t.body != null) out.body = t.body;` 与 `if (t.order != null) out.order = t.order;`。

### 2.2 代码:importer 清洗 thought 时漏 `body` 与 `order`(spec §2.2)
- **位置**:`src/persistence/importer.js:75-87`(`cleaned` 对象构造)
- **症状**:同 2.1,importer 的 `cleaned` 对象缺 `body` 与 `order` 字段。即便 exporter 修好导出,导入时仍会丢弃这两个字段。
- **根因**:同 2.1。
- **影响**:与 2.1 叠加 — 导出再导入循环丢失 `body`/`order`。
- **修复建议**:在 importer.js L75-87 的 `cleaned` 对象补 `body: typeof t.body === 'string' ? t.body : ''` 与 `order: Number.isFinite(t.order) ? t.order : 0`。

### 2.3 代码:temperature 默认值不一致 — importer 0.5 vs thought-bridge 1
- **位置**:`src/persistence/importer.js:82`(`temperature: Number.isFinite(t.temperature) ? t.temperature : 0.5`)+ `src/persistence/thought-bridge.js:27`(`if (typeof out.temperature !== 'number') out.temperature = 1;`)
- **症状**:导入时若 payload 的 temperature 缺失或非有限数,importer 默认填 `0.5`;但 thought-bridge 在 `toPlainThought` 时若 temperature 非数字,默认填 `1`。同一字段两个默认值。
- **根因**:两处独立实现,无共享常量。
- **影响**:同一念头经 importer 路径写入与经 thought-bridge 路径写入,temperature 缺省时落库值不同;沉积层 / 温度→Y 拉拽等下游消费方行为不稳定。
- **修复建议**:在 `src/core/thought.js` 或新建 `src/persistence/constants.js` 导出 `DEFAULT_TEMPERATURE = 1`(采用 thought-bridge 的值,因为它更接近"显意识"语义),importer 与 thought-bridge 共用。

### 2.4 代码:importer validatePayload 有死代码
- **位置**:`src/persistence/importer.js:24-27`
- **症状**:
  ```js
  if (!Array.isArray(p.thoughts)) return { ok: false, error: 'missing-thoughts-array' };
  if (!Array.isArray(p.edges)) return { ok: false, error: 'missing-edges-array' };
  if (typeof p.thoughts !== typeof []) return { ok: false, error: 'thoughts-not-array' };  // L26
  if (typeof p.edges !== typeof []) return { ok: false, error: 'edges-not-array' };        // L27
  ```
  L24-25 已经用 `Array.isArray` 校验过;L26-27 的 `typeof p.thoughts !== typeof []`(即 `!== 'object'`)对任何 `Array.isArray` 已通过的值恒为 false,**永远不可达**。spec §3.2 error 枚举里列了 `thoughts-not-array` / `edges-not-array`,但代码路径永远走不到。
- **根因**:复制 spec error 枚举时把"数组校验"与"类型校验"都写了,但 `Array.isArray` 已涵盖 `typeof` 校验。
- **影响**:测试若想触发 `thoughts-not-array` / `edges-not-array` 会失败(error 永不返回);dead code 误导新人。
- **修复建议**:删除 L26-27;或把 error 枚举里的 `thoughts-not-array` / `edges-not-array` 标记为 deprecated(由 `missing-thoughts-array` / `missing-edges-array` 覆盖)。

### 2.5 代码:integrity.repair 返回形状与 spec §4.2 不一致 — spec drift
- **位置**:`src/persistence/integrity.js:92-100`(return 语句)+ spec §4.2 L175(`返回 {fixed, removedOrphans, removedLoops, renamedDuplicates, total}`)
- **症状**:spec 说 repair 返回顶层 `{fixed, removedOrphans, removedLoops, renamedDuplicates, total}`;代码实际返回 `{...report, repaired: {removedOrphans, removedLoops, renamedDuplicates, total}}`(嵌套在 `repaired` 下,且无 `fixed` 字段)。audit 也类似:spec §4.1 说返回 `{thoughtCount, edgeCount, duplicateIds, orphanEdges, selfLoops}`,代码 L40-46 返回这些 ✓(audit 形状对)。
- **根因**:实施时把 repair 结果包了一层 `repaired` 字段,spec 未同步。
- **影响**:消费方(若按 spec 期望 `result.fixed` 接口)会拿到 undefined;cross-review 若按 spec 校验返回形状会假报。
- **修复建议**:二选一:
  1. 代码改为 `return { ...report, fixed: removedOrphans + removedLoops + renamedDuplicates, removedOrphans, removedLoops, renamedDuplicates, total: ... }`(展平,与 spec 对齐)
  2. 或 spec §4.2 改为 `返回 { ...audit, repaired: { removedOrphans, removedLoops, renamedDuplicates, total } }`(承认嵌套结构)

### 2.6 架构:edge-bridge.syncToDoc 不用 hasDiff 更新已存在边 — 与 thought-bridge 形态不一致
- **位置**:`src/persistence/edge-bridge.js:78-101`(syncToDoc 只在 `if (!cur)` 时 set,不更新已存在边)
- **症状**:thought-bridge.syncToDoc(L73-88)用 `hasDiff(cur, plain)` 判断是否更新已存在 thought;edge-bridge.syncToDoc 只检查 `if (!cur)`(只新增,不更新)。spec §2.1 共同规约"五个 bridge 遵循同一形态",但 edge-bridge 在 syncToDoc 中漏了 hasDiff 分支。
- **根因**:edge-bridge 早于 thought-bridge 实现,后续补 hasDiff 时漏改 edge。
- **影响**:memory 中 edge 的 `relationType` 改变后,syncToDoc 不会写回 Y.Map(只有新增才写);UI 改边类型的操作在生产中失效(虽然 1.4 也说 bridge 根本没装配,但即便修好 1.4,这个 bug 仍在)。
- **修复建议**:edge-bridge.syncToDoc 改为:
  ```js
  const cur = yMap.get(e.id);
  if (!cur || hasDiff(cur, { id: e.id, fromId: e.fromId, toId: e.toId, relationType: e.relationType, createdAt: e.createdAt })) {
    yMap.set(e.id, { ... });
    written++;
  }
  ```
  并补一个 edge-bridge 的 `hasDiff` 内部函数。

### 2.7 代码:importer.js ORIGIN 字符串字面量,未提为模块常量
- **位置**:`src/persistence/importer.js:56`(`doc.transact(fn, 'importer')`)
- **症状**:spec §2.1 共同规约"模块级常量 `ORIGIN` 用于 `doc.transact(fn, ORIGIN)`";其他 5 个 bridge 都有 `const ORIGIN = 'xxx-bridge'` 在文件顶部,importer 是字面量 `'importer'`。
- **根因**:importer 较短,字面量直接写;未遵循 spec §2.1 约定。
- **影响**:若未来要改 importer 的 origin(如改 `'importer-merge'` / `'importer-replace'`),需全文件搜索字符串;undo-manager.js DEFAULT_TRACKED_ORIGINS 里也是字符串 `'importer'`,两处硬编码易 drift。
- **修复建议**:importer.js 顶部加 `const ORIGIN = 'importer';`,L56 改为 `doc.transact(fn, ORIGIN)`;undo-manager.js 的 DEFAULT_TRACKED_ORIGINS 改为从 importer 导入常量(或新建 `constants.js` 共享)。

### 2.8 治理:yjs-store.js 零测试 — 1.1 / 1.2 的 bug 本可被测试捕获
- **位置**:`tests/persistence/` 目录(8 份测试:crystal-bridge / edge-bridge / exporter / importer / integrity / persistence-roundtrip / thought-bridge / undo-manager)
- **症状**:`yjs-store.js`(本 spec 的"数据源层"核心,spec §1.1)无任何测试。1.1(`_getFlagVariant` 未导入)与 1.2(`getText` vs `getMap`)都是单元测试即可暴露的问题,但 `tests/persistence/yjs-store.test.js` 不存在。
- **根因**:yjs-store.js 在 initPersistence 内调 `new IndexeddbPersistence`,需 mock IndexedDB,测试成本高于纯函数 bridge;实施时跳过。
- **影响**:生产路径的 UndoManager 创建从未被任何测试触达;1.1 / 1.2 / 1.3 三个 P0 在没有 cross-review 之前完全沉默。
- **修复建议**:补 `tests/persistence/yjs-store.test.js`,最小 3 个 case:
  - `initPersistence(dbName)` 不抛(覆盖 1.1)
  - `getUndoManager()` 返回的 manager 观察 `getMap('thoughts')` 而非 `getText('thoughts')`(覆盖 1.2)
  - `transact(fn, origin)` 在 init 前调用抛错(已实现 ✓,加回归测试锁住)

### 2.9 代码:undo-manager.js 订阅者异常被静默吞掉
- **位置**:`src/persistence/undo-manager.js:43`(`} catch (e) {}`)
- **症状**:`notifyChange` 遍历订阅者回调时,任何抛错的回调被 `catch (e) {}` 完全静默。无 console.warn,无错误事件。
- **根因**:防御性编程过度,把"调试信号"也吞了。
- **影响**:UI 若绑了 `onChange` 更新按钮 disabled 状态,回调抛错时 UI 永远停在错误状态,开发者无法定位。
- **修复建议**:改为 `} catch (e) { console.warn('[undo-manager] subscriber error', e); }`,或允许 `opts.onError` 注入。

### 2.10 治理:integrity.js `ALLOWED_OPTIONS` 导出但从未被消费
- **位置**:`src/persistence/integrity.js:105-108`
- **症状**:`ALLOWED_OPTIONS = { removeOrphanEdges: true, dedupeThoughtIds: true }` 被 export,但 grep 全仓库无任何 import / 引用。`repair` 函数的 opts 默认值在 L64-78 内联判断(`opts.removeOrphanEdges !== false`),不读 `ALLOWED_OPTIONS`。
- **根因**:可能是设计期想用 ALLOWED_OPTIONS 做运行时 opts 校验,但未落地。
- **影响**:dead export 误导新人以为这是配置入口;实际改 opts 行为只能改 repair 函数内部。
- **修复建议**:删除 L105-108;或在 repair 入口加 `opts = { ...ALLOWED_OPTIONS, ...opts }` 让 ALLOWED_OPTIONS 真起作用(后者更优,可让 spec §4.2 的"可通过 opts 关闭某一项"有显式默认值来源)。

---

## §3 P2 问题(锦上添花)

- **`src/persistence/crystal-bridge.js:34-39`**:`findIndex` 每次 O(n) 线性扫描;crystals 数量大时 syncToStore 是 O(n²)。建议改用 `Map<id, index>` 索引或直接换 memory 为 Map(与 thought/action 一致)。
- **`src/persistence/zone-bridge.js:44-53`**:`syncToStore` 调 `yMap.forEach` 两次(一次 apply,一次建 yIds);可合并为一次遍历同时 apply + 收集 yIds。
- **`src/persistence/undo-manager.js:76`**:`onChange` 订阅时 `setTimeout(notifyChange, 0)` 立即触发一次通知;若订阅者在 onChange 里又 setState,可能产生多余渲染。建议改为惰性:只在 stack 真正变化时通知。
- **`src/persistence/importer.js:94-108`**:merge 模式下 edge 按 id 覆盖写入,但 thought 按 id 跳过;spec §3.2 明示此设计 ✓,但与 exporter 的"全量导出"对称性差。建议加注释说明"thought 跳过是保护用户编辑,edge 覆盖是因 edge 无独立用户编辑"。
- **`src/persistence/yjs-store.js:20-21`**:`persistence._batchThreshold = _batchThreshold` 挂的是 y-indexeddb 未公开 API;即便 1.1 修好 import,此挂载也无效果。建议删除。
- **5 个 bridge 的 `destroy()`**:均只 `unobserve(observer)`,不置空 `yMap` / `doc` / `memoryMap` 引用;destroy 后再调 syncToStore 不会报错但会操作已 unobserve 的 yMap(静默失败)。建议加 `this._destroyed = true` 守卫。
- **`src/persistence/thought-bridge.js:15-17`**:`memoryMap instanceof Map === false && typeof memoryMap.forEach !== 'function'` — 运算符优先级陷阱,`instanceof Map === false` 先求值再 `&&`,逻辑等价于"不是 Map 且没有 forEach 才抛",但可读性差。建议拆为两个独立 if。
- **`src/persistence/edge-bridge.js:11-26`**:`_hasEdge` / `_linkEdge` / `_unlinkEdge` 三个 helper 在 store 缺方法时静默返回 false/null,不抛错;若 store 接口不完整,bug 会被掩盖。建议改为开发模式 `console.warn`。
- **`src/persistence/exporter.js:126-128`**:`relToArrow` 永远返回 `'--'`,所有关系类型 Mermaid 箭头相同;spec §3.1 未要求差异化箭头,但视觉上无法区分因果/并列/矛盾。建议按 relationType 映射 `-->` / `-.->` / `==>` 等。
- **`src/persistence/exporter.js:108`**:Mermaid 关系图节点截断 `slice(0, 100)`,但 spec §3.1 说"最多 100 节点";edge 未截断,可能产生 100 节点 + 1000 边的图,Mermaid 仍会卡。建议同步截断 edge。
- **`src/persistence/importer.js:133-140`**:`readFileAsText` 用 `FileReader` 而非 `file.text()`(现代 API);Node 测试环境无 FileReader 需 polyfill。建议 feature-detect `file.text?.()` 优先。
- **spec §0 引言 L37**:"11 个文件"包含 CLAUDE.md;但 `scope.files` frontmatter 只列 10 个 `.js`,未列 `CLAUDE.md`。建议 scope.files 显式加 `CLAUDE.md` 或把"11 个文件"改为"10 个代码文件 + CLAUDE.md"。

---

## §4 亮点(必须保留)

> cross-review 方法论 §7 强制要求:亮点必须明示,避免下次重构误删好的设计决策。

### 4.1 五座 bridge 共享同一形态骨架(ORIGIN / suppressFromDoc / transactIfPossible / syncToStore / syncToDoc / *One / destroy / observe)
- **位置**:`src/persistence/{thought,edge,zone,crystal,action}-bridge.js` 五文件统一形态
- **价值**:五个 bridge 文件结构高度同构 — 顶部 `const ORIGIN = 'xxx-bridge'`、`const META_FIELDS = [...]`、`let suppressFromDoc = false`、内部 `transactIfPossible` / `toPlain` / `applyXxxToMemory` / `syncToStore` / `syncToDoc` / `hasDiff` / `updateOne` / `removeOne` / `onYMapChange` / `destroy`。这是 spec §2.1"共同规约"的工程实现。**虽然 spec §6 R1 提到"未抽取 createMirrorBridge 工厂",但五份同构代码反而让每个 bridge 可独立调试、独立测试,且新增字段时改一份不影响其他**。
- **为什么保留**:下次重构若有人看到 70% 重复代码想强行抽 `createMirrorBridge` 工厂,必须先评估 — 当前形态的差异点(IGNORE_FIELDS、_linkEdge 间接调用、crystal 的 Array↔Map 转换)恰恰是各 bridge 的领域逻辑,强行抽取会把这些差异塞进 opts 配置地狱。**重复不总是坏事**,bridge 边界比工厂边界更稳。
- **示例**:thought-bridge 有 `IGNORE_FIELDS = {contentHint}` 屏蔽 UI 私有字段;edge-bridge 有 `swapEdgeDirection`;zone-bridge 有 `addOne` — 这些是各自领域必需的,工厂模式会强制统一接口反而丢失语义。

### 4.2 UndoManager origin 显式过滤 — 把"治理动作"与"用户动作"在数据层分离
- **位置**:`src/persistence/undo-manager.js:9-14`(DEFAULT_TRACKED_ORIGINS)+ `src/persistence/integrity.js:9`(`ORIGIN_REPAIR = 'integrity-repair'`)+ spec §0 第 4 条"不可逆治理动作不进 undo 栈"
- **价值**:`integrity-repair` 与 `replace-mode import` 这两个 origin **故意不在** trackedOrigins 中。这是把"治理动作"(repair 修断链、replace 整体替换)与"用户编辑动作"(thought-bridge 增删改)在数据层显式分层。用户 Ctrl+Z 永远不会误回退一次 repair 操作导致断链重现。这是 spec §0 第 4 条铁律的工程落地。
- **为什么保留**:这个设计看似简单,但很多 Yjs 项目把所有 origin 都纳入 undo 栈,导致 repair 后用户 Ctrl+Z 把修好的断链又退回来。本 spec 把 origin 作为"治理 vs 用户"的语义边界,是值得保留的核心决策。下次重构若有人想"统一所有 origin 都进 undo 栈便于用户回退",必须保留 `integrity-repair` 的豁免。

### 4.3 importer 边端点校验防孤儿 — 防御性写入边界
- **位置**:`src/persistence/importer.js:95-96`(`if (!newThoughtIds.has(e.fromId) && !existingThoughtIds.has(e.fromId)) { skipped++; continue; }`)
- **价值**:importer 在 merge / replace 模式下,对每条 edge 都校验 `fromId` 与 `toId` 是否落在 `newThoughtIds ∪ existingThoughtIds` 内。若不在,`skipped++` 而非写入。这是把"孤儿边"挡在写入边界之外 — 与 integrity.js 的 audit/repair 形成"前防后治"双层护栏。
- **为什么保留**:很多导入器只校验 payload 结构,不校验语义一致性(边端点是否在 thought 集合内)。本设计在写入前就拒绝孤儿边,避免事后 repair 的开销。下次重构若有人想"先全量写入再 repair 一次更简单",必须保留这层前置校验 — repair 是兜底,不是常规路径。

### 4.4 exporter SCHEMA_VERSION 冻结 — 前向兼容的版本契约
- **位置**:`src/persistence/exporter.js:8`(`const SCHEMA_VERSION = 1;`)+ spec §3.1"必须随字段冻结而冻结"
- **价值**:exporter 显式导出 `SCHEMA_VERSION = 1`,写入 payload 的 `schema` 字段。这是把"导出格式"作为有版本号契约的工程实践 — 未来若字段集变化(如 2.1 / 2.2 修好 `body`/`order`),需 bump 到 v2,importer 可按 schema 版本路由不同清洗逻辑。
- **为什么保留**:很多项目的导出是"当前内存啥样就 JSON.stringify 啥样",无版本号;字段一改老备份就导入失败。本设计把 schema 版本作为一等公民,虽然当前 importer 还没读 schema 字段做版本路由,但契约已立。下次重构若有人想"删掉 schema 字段省体积",必须保留 — 这是未来迁移的锚点。

### 4.5 thought-bridge `IGNORE_FIELDS` 屏蔽 UI 私有字段 — bridge 边界的精准切割
- **位置**:`src/persistence/thought-bridge.js:9`(`const IGNORE_FIELDS = new Set(['contentHint'])`)+ L36(`if (k in t && !IGNORE_FIELDS.has(k)) existing[k] = t[k]`)
- **价值**:`contentHint` 是 UI 层为渲染优化存的私有提示字段(如"该念头当前是否在视锥内"),不应进 Yjs 权威源。thought-bridge 在 `applyThoughtToMemory` 时显式跳过该字段,把"UI 临时态"与"持久化权威态"在 bridge 边界精准切割。这是 spec §0 第 1 条"memory store 只是渲染投影"的反向体现 — UI 私有字段不污染权威源。
- **为什么保留**:这个设计把 bridge 从"无脑全字段同步"升维到"字段白名单 + 黑名单双层过滤"。下次若 UI 层加更多临时字段(如 `isSelected` / `isDragging`),应复用 IGNORE_FIELDS 模式而非把它们也持久化。

---

## §5 修复优先级清单

> 决策矩阵(参考 cross-review §3.3):P0 当前会话必修,P1 应修(允许妥协/错峰),P2 可留 TODO。

| # | 问题 | 级别 | 决定 | 理由 |
|---|---|---|---|---|
| 1 | `_getFlagVariant` 未导入(1.1) | **P0** | 立即修 | initPersistence 必崩,删 4 行即可 |
| 2 | UndoManager 观察错误 Y 类型(1.2) | **P0** | 立即修 | Ctrl+Z 永久失效 |
| 3 | 生产用错 UndoManager(1.3) | **P0** | 立即修 | 与 1.2 合并修;切到 createUndoManager |
| 4 | main.js 绕过 bridge 装配(1.4) | **P0** | 立即修 | spec §0 第 1/2 条铁律在生产失效 |
| 5 | dbName 三处不一致(1.5) | **P0** | 立即修 | 数据可重建性破坏 |
| 6 | edge setup 函数名 drift(1.6) | **P0** | 立即修 | 一行重命名 |
| 7 | exporter 漏 body/order(2.1) | P1 | 立即修 | 与 2.2 同源,一并修 |
| 8 | importer 漏 body/order(2.2) | P1 | 立即修 | 与 2.1 同源 |
| 9 | temperature 默认值不一致(2.3) | P1 | 立即修 | 抽常量,5 行 |
| 10 | importer 死代码(2.4) | P1 | 立即修 | 删 2 行 |
| 11 | integrity 返回形状 drift(2.5) | P1 | 立即修 | 二选一:改代码或改 spec |
| 12 | edge-bridge.syncToDoc 漏 hasDiff(2.6) | P1 | 立即修 | 与 1.4 合并修(都在 bridge 装配) |
| 13 | importer ORIGIN 未提常量(2.7) | P1 | 立即修 | 3 行 |
| 14 | yjs-store 零测试(2.8) | P1 | 立即修 | 补 3 case,锁住 1.1-1.3 修复 |
| 15 | undo-manager 吞异常(2.9) | P1 | 立即修 | 一行 console.warn |
| 16 | ALLOWED_OPTIONS 死导出(2.10) | P1 | 立即修 | 删或启用 |
| 17-27 | 11 项 P2 | P2 | 写 TODO | 不影响功能,下次会话或写 backlog |

**修复顺序建议**:
```
1. 修 1.1(删 _getFlagVariant)— 阻断 initPersistence
2. 修 1.2+1.3(切到 createUndoManager)— 同一处代码
3. 修 1.6(edge setup 重命名)— 一行
4. 修 1.5(dbName)— 决定 spec 还是代码改
5. 修 1.4(装配 5 bridge)— 工作量最大,但解锁 spec §0 铁律
6. 修 2.1+2.2+2.3(字段+默认值)— 同源
7. 修 2.6(edge syncToDoc hasDiff)— 与 1.4 同区域
8. 修 2.4+2.5+2.7+2.10(死代码 + drift)— 一并清理
9. 修 2.8(补 yjs-store 测试)— 锁住 1.1-1.3
10. 修 2.9(吞异常)— 一行
```

---

## §6 元教训(完成感幻觉)

> cross-review 方法论 §7 要求每份 audit 暴露"完成感幻觉"。

### 6.1 "phase: implemented" ≠ "生产装配已通"

本 spec frontmatter 标 `phase: implemented`(P2-1: Yjs 持久化契约已实施),但审查发现:
- `initPersistence()` 必抛 ReferenceError(1.1)
- 生产 UndoManager 观察错误 Y 类型(1.2)
- main.js 完全绕过 bridge 装配(1.4)
- 生产用错的 `getUndoManager()`,正确的 `createUndoManager()` 只在测试里跑(1.3)

**教训**:`phase: implemented` 是 spec 状态,不是事实。spec 标 implemented 时若不强制要求"main.js bootstrap 实际调用 setupXxx",状态字段就是自我安慰。本 spec 的 5 座 bridge / UndoManager / integrity / exporter / importer 在**单元测试中均跑通**(8 份测试存在),但生产装配从未把它们接起来 — 测试绿不代表生产通。

**根本修复**:cross-review §6.2 应补充 `phase: implemented` 的前置门禁 — 必须有"main.js 实际 import + 调用 setupXxx"的 grep 证据,或集成测试覆盖 `initPersistence → setupXxx → syncToStore` 全链路。

### 6.2 "Yjs 是唯一权威源" ≠ "main.js 直接操作 Y.Map"

spec §0 第 1 条铁律"Yjs 是唯一权威数据源,memory store 只是渲染投影"在 spec 层面正确,但 main.js:71-76 的 sim tick 直接 `yThoughts.set(n.id, {...t, x, y, z})` 把 Y.Map 当 memory 用 — 既写权威源又当渲染源,bridge 抽象层形同虚设。

**教训**:bridge 模式的设计意图是"memory ↔ Y 双向镜像 + 写入边界",但若 main.js 绕过 bridge 直接操作 Y.Map,bridge 在生产中是死代码。spec §0 铁律需要在代码层有强制守卫 — 比如"Y.Map 的 set/delete 只允许在 bridge / importer / integrity 内调用",可用 lint 规则或 Proxy 实现。

**这是本 spec 最深的元教训**:数据层抽象(bridge)与生产装配(main.js)的脱节,比代码 bug 更隐蔽 — 单元测试覆盖 bridge,集成测试覆盖 main.js,但"bridge 是否在 main.js 中实例化"通常无测试覆盖。

### 6.3 "UndoManager origin 语义"设计正确 ≠ 生产 UndoManager 有效

undo-manager.js 的 `DEFAULT_TRACKED_ORIGINS` 与 `integrity.js` 的 `ORIGIN_REPAIR = 'integrity-repair'` 在设计层完美配合 — spec §0 第 4 条"不可逆治理动作不进 undo 栈"通过 origin 集合差集实现。但生产用的是 yjs-store.js:17 的破版 UndoManager(无 origin 过滤、观察 Y.Text),设计层的"治理 vs 用户"分层在生产中**完全不生效**。

**教训**:同一概念(UndoManager)在仓库里有两套实现,一套正确(测试覆盖)、一套错误(生产使用),这种"双版本共存"是 spec 凝固后实施 drift 的典型模式。cross-review §6.1 应补充:audit 报告必须**反向校验生产代码实际使用的 UndoManager 实例**,而非只审 spec / 测试中描述的版本。

### 6.4 "sediment 状态 + 8 份测试" ≠ "无 audit 即无沉淀"

本 spec 标 `status: sediment`,有 8 份 persistence 测试,看似满足 cross-review §6.2"沉淀语义"。但:
- 8 份测试覆盖的是 bridge / undo-manager / integrity / exporter / importer 的**单元行为**
- 生产路径(yjs-store 的 initPersistence + getUndoManager + main.js 装配链)零覆盖
- 无 audit 报告(本报告填补)

**教训**:测试数量 ≠ 测试有效性。8 份测试绿 + 0 份 audit,与"sediment"状态之间隔着 6 个 P0。cross-review §6.2 的"测试 100% 过"应明确为"生产路径测试过",而非"任何测试过"。本报告即填补该缺口。

### 6.5 "spec scope.files 完整" ≠ "审查范围已覆盖生产消费方"

本 spec scope.files 列了 10 个 `.js` 文件,看起来完整。但 cross-review 时若只审这 10 个文件,会漏掉 `src/main.js` — 而 main.js 是 1.1 / 1.3 / 1.4 / 1.5 四个 P0 的发生地。

**教训**:persistence spec 的"消费方"是 main.js bootstrap,cross-review 必须把消费方纳入审查范围。本报告主动扩展审查范围到 main.js(任务描述虽只列 src/persistence/ 10 文件,但架构视角无法绕过消费方)。这与 topological-awareness-space audit 的 6.4 元教训"scope.files 不完整 = 审查盲区的元问题"形成跨 spec 呼应 — 该元教训在两个 spec 上都成立。

---

## 附录:审查视角正交性检查

| 视角 | 主要查 | 不查 |
|---|---|---|
| 代码审查员 | 代码不变式 / spec drift / bug / 死代码 | 治理门禁 / 状态机 / 测试存在性 |
| 架构审查员 | Yjs 权威性 / bridge 一致性 / UndoManager origin 语义 / 数据流 | 测试覆盖 / 门禁脚本 |
| 工程治理审查员 | cross-review 合规 / 测试覆盖 / IndexedDB 可重建性 / 状态机 | 具体 bug / 代码风格 |
| (扩展)消费方审查 | main.js 是否实际装配 bridge / 是否用对 UndoManager | bridge 内部实现 |

**正交性验证**:三视角无重叠任务,但发现的问题有交叉(如 1.2 UndoManager 类型错误同时被代码视角和架构视角发现;1.4 main.js 绕过 bridge 同时被架构视角和治理视角发现)。合并后已去重。

**扩展视角说明**:任务描述只列 src/persistence/ 10 文件,但架构视角无法绕过 main.js 消费方(1.4 / 1.5 / 1.6 三个 P0 在 main.js)。本报告主动扩展范围到 main.js,符合 topological-awareness-space audit 6.4 元教训"审查范围必须反向校验 spec scope.files 完整性"。

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
