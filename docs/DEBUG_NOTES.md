# 调试速查手册 · thoughtspace-notes

> **本文件目标**:让任何后续 agent / 你在遇到 bug 时,5 分钟内找到 "症状 → 怀疑清单 → 关键代码行" 一站式路径。
> 不是教程,不是设计意图,只是"如果 X 出问题,看 Y"。
>
> **上游**: [CLAUDE.md](../CLAUDE.md) · **约定**: 引用文件用相对路径;代码行号锚定文件顶部脚本入口

---

## 0 · 启动/调试命令

```bash
# 在 e:/魔方心厦/thoughtspace-notes/ 下

# 一把全跑(arch + geb + 150 tests),最常用
npm run check:all

# 仅测试(快)
npm test

# 单文件测试
npx vitest run tests/persistence/thought-bridge.test.js

# dev server,localhost:3000 (只要还在跑就刷新看)
# 由于是简单 http serve,dev 中改完文件 F5 即可(但要先 check:all)
```

⚠️ **没有热重载**——dev server 是固定 http 守护,改完要重新刷新浏览器;Y.Map 状态会通过 y-indexeddb 在 F5 后保留,这是双刃剑(可以"重置",但 `clearAll` 后台手工 stub)。

---

## 1 · 系统形态速览

### 1.1 模块层次(L2)

```
src/
├── core/           纯逻辑,无 DOM,无 three.js
│   ├── thought.js          // Thought 数据 + 温度/标签/色温
│   ├── edge.js             // RelationType + edgeStore + 5 种关系
│   ├── structure.js        // 内聚度评分
│   ├── geometry-cluster.js // G2 星团布局
│   ├── meditation.js       // 冥想状态机 (0.8s in / 0.4s out)
│   ├── hydrate-anim.js     // 启动动画状态机 (3.5s)
│   └── index.js            // 桶
│
├── persistence/    Yjs 持久化 + 序列化
│   ├── yjs-store.js        // Y.Doc + IndexedDB + Y.Map('thoughts'|'edges')
│   ├── thought-bridge.js   // memory ↔ Y.Map('thoughts'),节流 0.4s
│   ├── edge-bridge.js      // memory ↔ Y.Map('edges'),整表
│   ├── exporter.js         // JSON / Markdown (+ mermaid graph)
│   └── importer.js         // parseImportString + validatePayload + applyImport
│
├── render/         DOM + Three.js 渲染层
│   ├── scene.js            // 场景壳(renderer/camera/lights/stardust/fog)
│   ├── thought-sphere.js   // 念头球 + pulse + 选中/悬停/关联/颜色环/halo
│   ├── edge-line.js        // 5 种几何连线 + 圆柱 hit-proxy + hover/selected
│   ├── hull-mesh.js        // 凸包扰动 + 半透 + 毛刺边
│   ├── ambient-life.js     // 呼吸 + 漂移 + 雾 + 冥想调制
│   ├── relation-picker.js  // 建关系时 5 选 1 弹窗
│   ├── detail-panel.js     // 念头详情 + 标签 chips + 情绪色温 5 色
│   ├── edge-panel.js       // 双击边后弹 改 type / 删除
│   ├── global-search.js    // F 键搜索(子串 + 排序)
│   └── export-panel.js     // Ctrl+Shift+E 导出/导入浮动面板
│
├── sim/            仿真/力学 (L2 仅占位)
├── topology/       拓扑工具 (凸包 / 力导向 / cube camera)
├── ui/             (toolbar,UI 钩子)
└── main.js         单入口,组装以上所有
```

### 1.2 数据流核心

```
用户 ──► main.js
        │
        ├── 内存真相 (memoryMap / edgeStore)
        │     ├─ thoughtById: Map<id, Thought>
        │     └─ edgeStore.edges: Map<id, Edge>
        │
        │     ↓ markDirty(thought.id) [throttle 0.4s]
        │
        ├── thoughtBridge.updateOne(t) ──► Y.Map('thoughts')
        │     ▼                                    ▼
        │   一次性推 diff(hasDiff 比较)             y-indexeddb
        │                                          (浏览器 IndexedDB)
        │
        └── edgeBridge.syncToDoc() ◄───── 整表同步(改动少)
```

⚠️ **跟直觉相反:** 真存在了两份。memoryMap 是渲染真相,Y.Map 是持久化真相。两者不一致 → bug(常见)。
**两者如何同步?**:
- 用户动作 → main.js → 直接改 memoryMap + 调用 bridge 写到 Y
- 启动时 bridge.syncToStore() 把 Y 灌回到 memoryMap
- yjs-store 提供 `initPersistence()` 等待 IDB 加载完(防 cold start 时被覆盖)

### 1.3 真值 5 个常见位置(出 bug 时必看)

| 数据 | 位置 1 | 位置 2 | 位置 3 |
|---|---|---|---|
| Thought | memoryMap (Map) | Y.Map('thoughts') | IndexedDB |
| Edge | edgeStore.edges | Y.Map('edges') | IndexedDB |
| 选中态 | `group.userData.selected` (in Three.js group) | (非持久) | — |
| 关联发光态 | `group.userData.relatedTypes[]` | (非持久) | — |
| 冥想/搜索 | DOM 局部状态 | (非持久) | — |

**判断 bug 是"显示问题"还是"持久问题"**:
- F5 后消失 → 内存问题
- F5 后还在 → 持久问题(检查 Y.Map 是否更新)

---

## 2 · 键盘手势速查

> **菜单等价**:`[F]+[M]+[N]+[Shift]+[Ctrl+Shift+E]` → 顶部 hint 永远列出所有按键

| 键 | 行动 | 进入哪个面板 / 触发哪个 hook |
|---|---|---|
| F | 全局搜索 | `global-search.js → showGlobalSearch` |
| M | 切换冥想 | `meditation.enter() / exit()` + `meditation-badge` 数据属性 |
| N | 投新念头 | `createThought()` + `thoughtBridge.updateOne()` |
| Esc | 关当下 panel | `isPanelOpen() || isPickerOpen() || isEdgePanelOpen() || isGlobalSearchOpen() || isExportPanelOpen()` |
| Ctrl+Shift+E | 导出/导入 | `export-panel.js → buildExportPayload` |
| Shift+? 或 ? | 键位说明 | `help-panel.js → showHelpPanel` |
| Ctrl+Z | 撤销 | `getUndoManager().undo() → syncMemoryFromBridges → rebuildMesh` |
| Ctrl+Shift+Z | 重做 | `getUndoManager().redo() → ...` |
| 单击 thought | 详情面板 | `detail-panel.js → showDetailPanel` |
| 双击 thought | 回暖 | `pointerdown → dblclick → warmThought(t, 0.5)` |
| Shift+单击 thought | 选中 + 关联发光 | `selectThought(mesh) → applyRelatedHighlights()` |
| 单击在空白 | 取消悬停/选中? | main.js 早 return 没有 props |
| 双击边 | edge-panel | `pickEdgeAt + showEdgePanelFor` |
| 拖动 thought | 移动 + 节流持久 | `markDirty` + 0.4s throttle `flushDirty` |
| 拖 A→B 0.5s | 建关系 | `setTimeout(500) → showRelationPicker → linkEdge` |

**判断"按键没反应"**:
1. 检查是否焦点在 `<input>` / `contentEditable` 元素(`keydown` 早 return)
2. 检查是否已开其他 panel (`isPanelOpen() || isPickerOpen() || ...` 互斥)
3. console 打 `[persistence]` / `[edge-bridge]` log

---

## 3 · 渲染状态标志速查(三层 userData)

> 渲染层所有瞬态状态都挂在 Three.js group 的 `userData` 上。是排查"为什么没发光"的关键。

### 3.1 thought-sphere.js 的 group.userData

| 字段 | 含义 | 谁设置 / 谁清除 |
|---|---|---|
| `sphere / glow / selectRing / hintRing / relatedRing / colorTagRing` | Mesh refs | `createThoughtMesh` 一次性创建 |
| `thought` | 当前 Thought 引用 | `updateThoughtMesh` 每帧前更新 |
| `temperature` | 缓存(0~1) | `updateThoughtMesh` 同步 |
| `scale` | 基础缩放(由 mass 计算) | `createThoughtMesh` / `updateThoughtMesh` |
| `pulsePhase` | 脉冲相位(累加) | `pulseThoughtMesh` 每帧 +dt*2.8 |
| `medLevel` | 冥想衰减 (0~1) | main.js loop 设 |
| `spawnMul / spawnOpacity / tempMul` | 启动动画三轴 (0~1) | main.js loop 设 |
| `selected` | bool | `selectThought / deselectThought` 切 |
| `hovered` | bool | `hoverThought / unhoverThought` 切 |
| `related` / `relatedTypes[]` | 关联发光态 | `highlightAsRelated / unhighlightAsRelated` |
| `contentHint` | 'text'/'image'/'link'/'long' | `updateThoughtMesh` 改后调 `configureHintRing` |
| `hintColor` | hintRing 颜色 (0xRRGGBB) | `configureHintRing` 设 |
| `colorTag` / `colorTagRing` | 情绪色温 halo | `setColorTag` 切 |
| `creationTime` | 出生时刻(用于 birth pulse) | `createThoughtMesh` 设 |

### 3.2 edge-line.js 的 line.userData

| 字段 | 含义 | 谁设 |
|---|---|---|
| `proxy / proxyMat` | 圆柱 hit-test 代理 | `createEdge` |
| `style` | 'solid'/'dashed'/'zigzag'/'gradient'/'step' (之一) | `getEdgeStyle` |
| `selected / hovered` | bool | `applyLineHoverState` 读 |
| `spawnMul` | 启动动画 opacity 乘子 (0~1) | main.js loop |
| `related` / 相关 fields | (关联时也通过 applyLineHoverState) | `highlightEdgeAsRelated` |

### 3.3 调试 userData 的方法

```js
// 浏览器 console 任选一行:

window.__meshById = meshById; // 要先在 main.js 暴露(目前没暴露)
// → 之后: Array.from(__meshById.values()).map(m => ({ id: m.userData.thought?.id, sel: m.userData.selected, hovered: m.userData.hovered, related: m.userData.relatedTypes }))

// 或者用 mesh.userData 自查:
// → 选中一个 mesh, console 后:
m = $0; m.userData
```

⚠️ **调试通常需要修 main.js 加 `window.__xxx = xxx` 暴露句柄**,清理完毕要删。

---

## 4 · 持久化(Yjs)核心

### 4.1 三处真值

```
             ┌── Y.Map('thoughts') ──┐
             │                       │
memoryMap  ──┤                       ├─► y-indexeddb (IndexedDB)
             │                       │
(edgeStore)  └── Y.Map('edges') ────┘
```

| Map | Schema v1 字段 |
|---|---|
| `'thoughts'` | id, text, x, y, z, mass, temperature, colorTag, labels[], createdAt, lastInteractionAt, contentHint |
| `'edges'` | id, fromId, toId, relationType, createdAt |

⚠️ **`'thoughts'` 跟 edge 不一定同步持久**!`thoughtBridge` 走单条 `updateOne`,`edgeBridge` 走整表。两边**不会**触发回环(A 的 update 设了 origin=A,B 的 observer 看到 origin !== 自己则**忽略**)。

### 4.2 回环抑制(origin 标签)

- `thought-bridge.js: ORIGIN = 'thought-bridge'`
- `edge-bridge.js: ORIGIN = 'edge-bridge'`
- `importer.js: ORIGIN = 'importer'`

⚠️ 调试时**不要绕过这些 origin** 写 Y.Map,否则陷入死循环或不一致。

### 4.3 启动顺序 (bootstrapPersistence)

```
1. initPersistence(dbName) → 拿到 Y.Doc (异步等 IDB)
2. setupThoughtPersistenceBridge(memoryMap, doc) → 桥装好
   ├─ bridge.syncToStore() → 把 Y 的 thought 灌进 memory
   └─ if memoryMap 空 → seedThoughts() → syncToDoc 推回 Y
3. setupPersistenceBridge(edgeStore, doc) → 边缘桥装好
   ├─ bridge.syncToStore() → 把 Y 的 edge 灌进 edgeStore
   └─ if edgeStore 空 → seedEdges() → syncToDoc 推回 Y
4. rebuildMesh() / rebuildHull() / rebuildSim()
5. if memoryMap.size > 0 → hydrate.start(now)
6. requestAnimationFrame(loop)
```

⚠️ **顺序不能错**:thoughtBridge 必须先装,edgeBridge 才能正确监听 thought 存在性。F5 后 cold start 时 IDB 是空的,seed 是缓存版本(8 + 5),第二次启动则恢复。

### 4.4 bridge 失败兜底(catch 分支)

```js
} catch (e) {
  seedThoughts(); seedEdges();  // 在内存跑 seed
  rebuildMesh(); rebuildHull(); rebuildSim();
  requestAnimationFrame(loop);
  // 注意:catch 里**不**启 hydrate,因为是新 seed,seed 后应该立刻 active
}
```

⚠️ 接 bug 时如果**"页面完全空"**:看 console 是否有 `[persistence] unavailable`,这是 IDB 失败兜底,它会显示 seed 数据但是**不持久**。

### 4.5 IDB 手工重置

```js
// 浏览器 console:
indexedDB.deleteDatabase('thoughtspace-notes-phase0');
// 然后刷新,会看到 seed
```

### 4.5 IDB 手工重置

```js
// 浏览器 console:
indexedDB.deleteDatabase('thoughtspace-notes-phase0');
// 然后刷新,会看到 seed
```

### 4.6 UndoManager (undo / redo)

**入口**:`persistence/undo-manager.js → createUndoManager(doc)`。在 [yjs-store.js:17](../src/persistence/yjs-store.js#L17) 初始化后,`getUndoManager()` 拿到代理包。

**trackedOrigins**:`['thought-bridge', 'edge-bridge', 'importer', 'bulk-action']`。**只有这四个 origin 触发的 Y 写入会被纳入 undo stack**。任何 null / undefined origin(自己 undo/redo 时)不会记入。

**mergeWindowMs = 100**:同一 thought 在 100ms 内的多次更新合成一笔操作。(拖动几乎不产生 stack pollution。)

**historyLimit = 100**。

⚠️ **常见 bug 路径**:
1. **撤销"无形"**:某操作没显示在撤销栈上 → 它可能不在 `trackedOrigins` 列表中(直接 `yMap.set` 而不是 `doc.transact(... 'thought-bridge')`)。
2. **不入栈**:直接调 `getThoughts().set(...)` 而不是在 `doc.transact(fn, 'thought-bridge')`,trackedOrigin 是 undefined,这样**根本不入栈**。
3. **撤销后画面不刷新**:`performUndo` 同步刷新 mesh / hull,但如果你手动调 `undo()`(不通过 main.js)记得 `rebuildMesh()` + `syncMemoryFromBridges()`。
4. **跨 F5 持久**:撤销栈本身**不持久**。Yjs UndoManager 仅在内存里。F5 后清空。可接受,因为新会话**起点就是新视角**。

**测试方法**:
```js
// 浏览器 console:
const size = getUndoStackSize(); // { undo: N, redo: M }
  console.log(size);
  ```

  ## 5 · 调试"症状 → 怀疑清单"

### 5.1 我打开是空白/无渲染

**怀疑清单**:
1. console 有 `[persistence] unavailable` → IDB 失败,看 seed 分支
2. `thoughtById.size === 0` → bootstrap 失败或者 seed 失败
3. camera 不对(window resize 后 z 设大了) → 用 console 看 `camera.position`
4. Mesh 没 add 到 scene → `scene.children.length === 0` 直接 rebuild
5. hydrate 死循环(产生 spawnMul=0 永远不变) → 改用 `if (mesh.userData.spawnMul !== target) ...`

### 5.2 我拖动念头后,F5 位置丢了

**怀疑清单**(按概率):
1. **没调 `markDirty(t)`** → 拖动不标脏,flushDirty 没东西写
2. throttle window 期间被 unload → `setTimeout` 没 fire
3. `flushDirty(performance.now())` 在 loop 中,但循环被浏览器 idle → 没机会写
4. bridge 装反了:内存是 thoughtById 但 bridge 用的是别的 Map
5. thoughtBridge 没装成功(observe 抛错) → console 看

**验证手段**:
```js
// 浏览器 console:
indexedDB.databases().then(dbs => console.log(dbs.map(d => d.name)));
// → 应该有 thoughtspace-notes-phase0
```

### 5.3 我创建的边显示,但 detail-panel 边面板打不开

**怀疑清单**:
1. 双击事件被 `pointermove` 抢先吃掉 → main.js: `pointermove` 内 `dragging` 抢先派发 pointerdown
2. `pickerOpen` 没关掉 → `isEdgePanelOpen()` 早 return
3. 双击选中"念头"路径抢先 → `pickThoughtAt` 优先
4. edge-panel 的回调 `onChangeType` 没接 → 改 type 时无声

**调试**:
```js
// main.js 加: window.__pickEdgeAt = pickEdgeAt; 重启场景看返回值
m = $0; // 选中某个 thought mesh
console.log(m.userData.id);
// pickEdgeAt(event.clientX, event.clientY) 应该返回 line 对象
```

### 5.4 我按 F 键,搜索没出

**怀疑清单**:
1. 焦点在 `<input>` → 跳过
2. detail-panel 已开 → 跳过(`isPanelOpen()`)
3. picker 已开 → 跳过
4. 焦点在 contentEditable → 跳过
5. 主 hook 没注册: `if (e.key === 'f' && ...)` 这一段在 main.js:667 附近

### 5.5 我按 M 键,冥想没变化

**怀疑清单**:
1. `meditation` 状态机没绑 `performance.now()` 监视 → 检查 `meditation.isActive()`
2. `ambient.setMeditation(level)` 没传 → level 是 0
3. `mesh.userData.medLevel` 没有被每帧同步 → mesh 不动
4. **注意**冥想只影响 ambient + mesh,不影响 background 的 r/g/b(我没有调 scene.background.setRGB 而是 offsetHSL)

### 5.6 标签不显示

**怀疑清单**:
1. `chip` CSS 用了 `color-mix(...)` 而浏览器不支持(老 Safari) → 改显式 rgb
2. 详情面板 chips 渲染逻辑没跑 → `labelHtml || '<span class="dp-empty">'` 检测
3. `onAddLabel` 回调接错 → label 改但 detail-panel 不刷新

### 5.7 导出 JSON 不能 import

**怀疑清单**:
1. `validatePayload` 防御过严:schema 字段不全 → 看 `validatePayload` 列的字段
2. `parseImportString` JSON.parse 报错 → user 看 toast 而不是 console
3. 数值是字符串 → importer 的 `Number.isFinite` clamp 正常
4. 替换模式触发文件名没含 `.replace.` → 默认 merge(同 id 跳过)
5. 拖入的不是 `.json` 而是 user 改名的 `.txt`

### 5.8 hydrate 动画不播

**怀疑清单**:
1. `memoryMap.size === 0` 时不启
2. 用户提前用 F 切换搜索 → F 中 keydown 不算影响,但 Esc 会触发关闭是 hydration 期间不会产生
3. `level(now)` always returns 默认(0 时长) → state machine 永远不动 → 看 `startedAt`
4. ⚠️ **boolean truthy bug 修复**: `now != null` 而非 `now || perf.now()`(已修)

### 5.9 Reset 清空按钮无响应

**怀疑清单**:
1. **7 秒倒计时未到** — 按钮 disabled 等 7 秒。这是**有意为之**(防止误触)。
2. Esc 关掉 overlay 而没点清空 → 这是正常退出。
3. 清空后撤销栈不空 → 因为清空 applyImport 也走 `'importer'` origin,入 undo。**警告用户**:"导入新数据则撤销会无效"。

### 5.10 integrity 扫描说"重 id"

**事实**:Y.Map.set 同 key 会**覆盖而非并行** — duplicateIds **始终为空**。测试已固化这个不变性。

**怀疑清单**:
1. 真问题不是重 id 而是 `edge.fromId` 或 `toId` 指向已被删 thought → 属 `dangling-target`,会被 repair 移除。
2. audit 是纯函数,无副作用 — 跑多次也不会变状态。

---

## 6 · 已知陷阱清单(看完这些能省一半时间)

### 6.1 JS 基础
- `now || performance.now()` 在 `now === 0` 时会走 fallback。换成 `(now != null) ? now : ...`
- `truthy` 用于检测"未传参"在 0/空串/false 时全部失效。**显式判断 null/undefined**

### 6.2 Three.js
- 球/线/代理的 `material.opacity` 改动后,下一帧观察是否生效→ 用 `material.opacity` 而不是 `material.opacity` 默认值
- `group.userData` 字段名拼错 → userData._ 内部查找困难。**统一用 `?` 链式判断**而非 as-cast

### 6.3 Yjs
- `Y.Map.observe` 的回调签名是 `(YMapEvent, transaction)`,**不是事件数组**。YMapEvent 有 `keysChanged` (Set)
- `transaction.origin === 'xxx'` 用于回环抑制,**每个 writer 用唯一 origin 名**
- 同 id update 会被 Yjs 当"无变化"忽略 → 必须 `hasDiff` 比较

### 6.4 持久化节流
- `THOUGHT_SAVE_THROTTLE_MS = 400` 太短 → 拖动 60fps 每个 thought 都写
- 太长 → F5 后丢太多
- **flushDirty(now) 在 loop 主线**,不在 setTimeout(因为 loop 不跑就没数据)

### 6.5 渲染并发动画
- pulse + meditation + spawn 三衰减**独立计数**,不能合并到一个 uniform
- modLevel 调整 spped 因子 `phaseSpeedAttenuation = 1 - 0.5 * medLevel`,**已修**
- spawnMul 在 loop 阶段被每帧覆写,**uniform mesh vs 走 Three.js 标准** 比手算 hash 更稳

### 6.6 DOM 焦点
- detail-panel 的 contenteditable + Esc 触发 hide 时会**保留焦点**于消失的元素 → 下次按键 routing 失效
- export-panel 的 file input 用 display:none → 触发的 picker 也是 display:none 不要紧

### 6.7 调试 / 拓展
- 默认不暴露 handle 到 window. **调试加,然后记得清理**
- 没有 hot reload → `npm run check:all` 后才 F5

---

## 7 · 单元测试索引(150 tests)

```
tests/
├── core/
│   ├── thought.test.js        25 测   — 温/标/色/标签/色温
│   ├── edge.test.js           23 测   — link/unlink/changeType/edgesFromThought
│   ├── structure.test.js       6 测   — 内聚度
│   ├── meditation.test.js     10 测   — 状态机 + 5 factor
│   └── hydrate-anim.test.js   19 测   — 三轴 fade 总 3.5s
├── render/
│   ├── edge-line.test.js       7 测   — writeZigzag
│   └── global-search.test.js  11 测   — 排序/中文/label backoff
└── persistence/
    ├── thought-bridge.test.js  8 测   — Y 镜像
    ├── edge-bridge.test.js     6 测   — Y 镜像
    ├── persistence-roundtrip.test.js 3测 — 真重启模拟
    ├── exporter.test.js       15 测   — payload / JSON / MD / mermaid
    └── importer.test.js       17 测   — 解析 / 校验 / apply / 边界
```

⚠️ **写新功能先想**:能不能加 1~3 个 unit test 覆盖?Pure function 是最容易测的,pure unit tests 必须是回归保险。

---

## 8 · 文件清单 / 入口

| 入口 | 文件 | 备注 |
|---|---|---|
| HTML | [index.html](../index.html) | 唯一 HTML,含样式 |
| JS 入口 | [src/main.js](../src/main.js) | ~700 行,组装一切 |
| 包元 | [package.json](../package.json) | vite vitest 工具 |
| 配置 | [vite.config.js](../vite.config.js) | dev server 端口 3000 |
| 测试 | [tests/*](../tests/) | 150 tests,本目录 |
| 文档 | [CLAUDE.md](../CLAUDE.md) | 顶层协议 |
| 协议 | [src/*/CLAUDE.md](../src/) | 每个模块有 L2 |
| 设计 | [docs/Part1_*.md](../docs/) | 产品规划 |

---

## 9 · 调试时常用 console 命令

```js
// 暴露后:
window.__meshById.get('t0').userData
window.__edgeStore.edges.size()
window.__thoughtBridge.docGet().getMap('thoughts').size()

// 不暴露的时候:
Array.from(document.querySelectorAll('canvas')).length  // 有几个 canvas?
window.indexedDB.databases().then(d => console.log(d)) // idb 列表

// 监听 observer(临时调试):
const ym = window.__thoughtBridge.docGetMap?.();
ym.observe((ev, tx) => console.log('Y changed:', ev.keysChanged, tx.origin));
```

⚠️ **每次改 main.js 加 `window.__xxx`** 都是**短期** 的,commit 前清理。

---

## 10 · 启动 / 常见陷阱 / TL;DR

- 改完代码必须跑 `npm run check:all` 验证
- 改了 bridge 后,加 1 个 roundtrip 测试
- 改了 userData 后,所有依赖组要同步更新
- 改了 export/import 后,跑 1 次完整导出 + import 验证
- bug 报告时先看 §5 怀疑清单:通常能 5 分钟定位

[CLAUDE.md](../CLAUDE.md) · 一切从这里出发

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
