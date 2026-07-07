# topology-sim 质量审查 · 2026-07-07

> **本报告由 agent team 3 视角并行审查产出**:
> - 代码审查员 (API 表面 + 行为约束 + spec drift)
> - 架构审查员 (模块边界 + 落地清单 + 数据流)
> - 工程治理审查员 (cross-review 合规 + 状态机一致性 + 孤儿判定)
>
> **审查对象**:topology-sim spec(`docs/superpowers/specs/2026-07-07-topology-sim-design.md`,status=sediment + phase=implemented)
> **审查范围**:`src/topology/{cube-camera.js, convex-hull.js}` + `src/sim/{force-3d.js, force-engine.js}` + 关联消费层(`src/main.js`, `src/render/{canvas.js, thought-node.js}`)
> **目的**:补全 cross-review 回路 — W9 门禁(`check-spec-topology.mjs`)检测到本 spec 标 `phase: implemented` 但 `docs/audit/` 无对应 audit 报告,违反 `docs/methodology/08-cross-review.md` §6.2"沉淀语义要求 ≥1 份完整 audit 报告"。
>
> **章节顺序严格遵循 `08-cross-review.md` §7 模板**(§4 亮点 / §5 修复优先级 / §6 元教训)。

---

## §0 综合评分

| 维度 | 评分 | 评语 |
|---|---|---|
| spec §2.1 API 落地度 | **1.0/5** | 声明 7 个导出,实际 3 个,5 个完全缺失(pin/unpin/setLayout/reheat/keepAlive) |
| 温度→Y 心智模型 | **0.5/5** | non-negotiable 项,代码中 0 处实现,无 temperaturePull/targetY |
| spec §4.1 落地清单 | **2.0/5** | 5 项仅完成 2 项(item3 删 topology/force-3d.js ✓ / item4 更新 topology/CLAUDE.md ✓;item1/2/5 ✗) |
| force-engine.js 孤儿判定准确性 | **1.0/5** | spec 标"待删除孤儿",实际仍被 canvas.js + thought-node.js 消费 |
| cube-camera 6 面语义 | **4.5/5** | FACES 对象与 spec §2.2 完全对齐,语义命名首创 |
| convex-hull 防御性编程 | **4.0/5** | <4 点兜底 + 空数组兜底双保险,valid 标志优雅 |
| 治理合规 | **1.5/5** | phase=implemented 与实际严重不符;sediment 无 audit(本报告即补) |
| **综合** | **2.0/5** | cube-camera/convex-hull 质量高,但 force-3d.js API 大面积缺失 + 温度拉拽未实现使整体不达标 — 典型的"标 implemented 但实际 partial"完成感幻觉 |

> 评分对标:`topological-awareness-space` audit(2.2/5)、`SP-1` audit(2.6/5)。本 spec 综合略低,因 non-negotiable 项(温度→Y)未实现属硬性违规。

---

## §1 P0 问题(必修)

### 1.1 代码:force-3d.js 5 个导出函数完全缺失(spec §2.1 API 大面积 drift)
- **位置**:`src/sim/force-3d.js` L1-52(全文件仅 52 行,导出 createSim3D / restartSim / stopSim 三个函数)
- **症状**:spec §2.1 API 声明导出 7 个函数:
  ```js
  export function createSim3D(thoughts, edges, options = {});
  export function restartSim(sim, alpha = 0.5);
  export function stopSim();
  export function pinSimNode(sim, id, x, y, z);     // 缺失
  export function unpinSimNode(sim, id);             // 缺失
  export function setSimLayout(sim, mode);            // 缺失
  export function reheatSim(sim, alpha = 0.6);       // 缺失
  export function keepSimAlive(sim, min = 0.15);      // 缺失
  ```
  实际 `src/sim/force-3d.js` 只导出前 3 个,后 5 个**完全未实现**。
- **根因**:spec §4.1 item 1 "迁移 topology → sim:pin/unpin/setLayout/reheat/keepAlive" 标为已实施,但实际迁移从未发生 — `src/topology/force-3d.js` 已删除(P0-4 合并时清掉),但其内逻辑未移植到 `src/sim/force-3d.js`。
- **影响**:
  - `pinSimNode`/`unpinSimNode` 缺失 → 拖拽念头钉住功能无法实现(关联 topological-awareness-space audit 1.3 拖拽缺失)
  - `setSimLayout` 缺失 → spec §2.1 行为约束 4 "circle⇄grid 切换 + reheat(0.6)" 完全无法执行
  - `reheatSim`/`keepSimAlive` 缺失 → keepAlive 慢变量机制(spec §0 术语表)不存在,温度等慢变量无法持续生效
  - spec §5 测试矩阵 3 条("pinSimNode 行为"/"setLayout 切换")物理上无法跑
- **修复建议**:
  1. 在 `src/sim/force-3d.js` 补 5 个函数实现
  2. `pinSimNode(sim, id, x, y, z)`:查 `sim.nodes()` 找 id,设 `node.fx/fy/fz`
  3. `unpinSimNode(sim, id)`:`node.fx = node.fy = node.fz = null`
  4. `setSimLayout(sim, mode)`:若旧 mode === 新 mode 直接 return;否则给每节点轻推 `node.vx += (Math.random()-0.5)*20` 等,然后 `reheatSim(sim, 0.6)`
  5. `reheatSim(sim, alpha = 0.6)`:`sim.alpha(alpha).restart()`
  6. `keepSimAlive(sim, min = 0.15)`:挂 `sim.on('tick', () => { if (sim.alpha() < min) sim.alpha(min).restart(); })`

### 1.2 代码:温度→Y 拉拽心智模型完全未实现(违反 non-negotiable)
- **位置**:`src/sim/force-3d.js` L11-44(`createSim3D` 全函数)+ grep `temperaturePull|temperatureYBounds|targetY` 在 `src/` 下 **0 匹配**
- **症状**:spec frontmatter `non-negotiable` 第 1 条:"温度→Y 拉拽的语义必须保留(核心心智模型)";spec §2.1 行为约束 2:"每 tick 计算 `targetY = bottom + (top-bottom) * clamp(temperature, 0, 1)`";spec §2.1 options 表声明 `temperatureYBounds: [180,-180]` + `temperaturePull: 0.012`。
  实际 `force-3d.js`:
  - `createSim3D(thoughts, edges)` **不接受 options 参数**(spec 是 `createSim3D(thoughts, edges, options = {})`)
  - 不读取 `t.temperature` 用于 Y 拉拽(L21 只 `temperature: t.temperature ?? 1` 存进 node,但从不消费)
  - 不存在任何 force 把节点 Y 拉向 `targetY`
- **根因**:迁移时只搬了 `createSim3D` 的骨架(节点初始化 + 4 个 d3 force),把温度拉拽这个**核心心智模型**整个漏掉了。
- **影响**:
  - spec frontmatter `decisions[].id: TSIM-002` "温度→Y 拉拽"是 ADR 级决策,代码完全未落地
  - 与 `topological-awareness-space` spec §3.2 的"L0/L1/L2/L3 温度分层"心智模型断裂 — 念头 Y 坐标完全由 d3 随机初始化(L17 `Math.random() * 300 + 100`),与温度无关
  - cube-camera 6 面语义里的"底面·潜意识深渊"失去物理依据 — 低温念头不会自动下沉
- **修复建议**:
  1. `createSim3D` 签名改为 `(thoughts, edges, options = {})`,解构 `temperatureYBounds = [180, -180], temperaturePull = 0.012`
  2. 注册自定义 force:
     ```js
     sim.force('temperatureY', () => {
       const [top, bottom] = temperatureYBounds;
       for (const n of nodes) {
         const targetY = bottom + (top - bottom) * Math.max(0, Math.min(1, n.temperature ?? 0));
         n.vy += (targetY - n.y) * temperaturePull;
       }
     });
     ```
  3. 在 `check:spec-drift` 加 TSIM-002 决策的机器校验(grep `temperaturePull` 存在性)

### 1.3 代码:force-3d.js options 参数完全缺失(8 个配置项全硬编码)
- **位置**:`src/sim/force-3d.js` L11(`export function createSim3D(thoughts, edges)` — 无第三参)
- **症状**:spec §2.1 options 表声明 8 个可配置项:`linkDistance / repulse / center / collide / alphaDecay / temperatureYBounds / temperaturePull / initialLayout`。实际代码全部硬编码:
  ```js
  .force('link', forceLink(links).distance(150)...)    // 硬编码 150
  .force('charge', forceManyBody().strength(-200)...)   // 硬编码 -200
  .force('center', forceCenter(0, 80, 0))               // 硬编码 [0,80,0]
  .force('collide', forceCollide(30))                   // 硬编码 30
  .alphaDecay(0.015)                                    // 硬编码 0.015
  ```
- **根因**:迁移时取最简实现,丢弃了 spec 设计的可配置性。
- **影响**:
  - 调参必须改源码,无法运行时实验
  - spec §5 测试矩阵 "setLayout 切换" 需要 `initialLayout` 参数,物理上无法测
  - 与 topological-awareness-space spec §3.2 的 L0/L1/L2/L3 分层无法对齐(分层依赖 center/temperatureYBounds 可调)
- **修复建议**:补 `options = {}` 参数,解构默认值与 spec §2.1 options 表对齐,把硬编码数字替换为 options 字段。

### 1.4 治理:force-engine.js 不是孤儿,spec §4.1 item 2 "删除" 不可执行
- **位置**:`src/sim/force-engine.js`(67 行,完整 2D d3-force 封装)+ 消费方 `src/render/canvas.js:2` + `src/render/thought-node.js:2`
- **症状**:spec frontmatter 描述 "清理由历史 SP-x 重构遗留的双实现并轨与孤儿代码(force-engine.js)";spec §4.1 item 2:"删除 `src/sim/force-engine.js`,验收:grep 零消费";spec §6.2 "Orphan src/sim/force-engine.js 究竟是不是死代码"。
  但 grep 显示 **force-engine.js 仍被 2 个文件消费**:
  ```
  src/render/canvas.js:2: * [INPUT]: pixi.js, src/persistence/yjs-store, src/sim/force-engine, src/core
  src/render/thought-node.js:2: * [INPUT]: pixi.js, src/core/thought, src/persistence/yjs-store, src/sim/force-engine
  ```
  这两个文件是 SP-1 的 2D canvas 渲染路径,仍在仓库中。
- **根因**:spec 把 force-engine.js 误判为"孤儿" — 实际它是 2D 渲染路径(canvas.js / thought-node.js,基于 pixi.js)的活依赖。只有当 2D canvas 路径被整体删除后,force-engine.js 才能删。
- **影响**:
  - spec §4.1 item 2 的验收标准"grep 零消费"物理上无法满足 — 强删会 break canvas.js / thought-node.js
  - spec §6.2 的开放问题"是不是死代码"已有答案:**不是**,但有条件(待 2D 路径整体退役)
  - `check:orphans` 若基于 spec 声明删除,会误删活代码
- **修复建议**:
  1. 把 spec §4.1 item 2 改为"前置:删除 `src/render/canvas.js` + `src/render/thought-node.js` + `pixi.js` 依赖 → 然后删 force-engine.js"
  2. 或在 force-engine.js 文件顶部加 `@deprecated since:2026-07-07, 待 2D 路径退役后删除` 注释
  3. 在 `src/sim/CLAUDE.md` 明确标注 force-engine.js 的状态(目前是"活依赖,待 2D 路径退役")

### 1.5 治理:spec `phase: implemented` 与实际严重不符
- **位置**:`docs/superpowers/specs/2026-07-07-topology-sim-design.md` L5(`phase: implemented # P2-1: 仿真契约已实施,孤儿代码已清理`)
- **症状**:spec frontmatter 标 `phase: implemented`,但:
  - spec §2.1 API 7 个导出,5 个未实现(1.1)
  - spec non-negotiable 温度→Y 拉拽,0 处实现(1.2)
  - spec §4.1 落地清单 5 项,3 项未完成(item1 迁移 ✗ / item2 删 force-engine.js ✗ / item5 更新 sim/CLAUDE.md ✗)
  - spec §5 测试矩阵 5 条,0 条可执行(因 API 缺失)
  - 注释 "孤儿代码已清理" 与 force-engine.js 仍存在的事实矛盾(1.4)
- **根因**:状态机推进时未把"API 全导出落地 / non-negotiable 代码存在 / §4.1 清单全勾"作为 phase=implemented 的前置门禁。
- **影响**:
  - W9 门禁(`check-spec-topology.mjs`)基于 `phase: implemented` 触发"必须有 audit"检查,但 audit 报告无法基于"已实施"前提写(因实际未实施)
  - 新人/未来 agent 看 `phase: implemented` 会误以为可直接消费,实际调用 `pinSimNode` 会 import undefined
- **修复建议**:
  1. 把 `phase: implemented` 降级为 `phase: partial`(或 `phase: draft`)
  2. 或保留 `phase: implemented` 但在 spec 顶部加 "⚠️ 已知 gap:API 5 函数缺失 + 温度拉拽未实现,见 audit 报告 §1.1/§1.2"
  3. 在 `check-spec-topology.mjs` 加规则:`phase: implemented` 的 spec 必须通过 `check:spec-drift` 验证 spec 声明的导出函数在代码中存在

---

## §2 P1 问题(应该修)

### 2.1 代码:force-3d.js mass 未按 spec §2.1 计算
- **位置**:`src/sim/force-3d.js` L20(`mass: t.mass ?? 1`)
- **症状**:spec §2.1 行为约束 3:"信息量→质量:`mass = 0.4 + infoLevel*1.2`";实际代码直接读 `t.mass`,不读 `t.infoLevel`,不做 `0.4 + infoLevel*1.2` 计算。
- **影响**:念头质量与信息量脱钩,infoLevel 高的念头不会被 d3-force 区别对待(碰撞/引力计算都用 mass=1)。
- **修复建议**:L20 改为 `mass: t.mass ?? (0.4 + (t.infoLevel ?? 0) * 1.2)`。

### 2.2 治理:src/sim/CLAUDE.md 未按 spec §4.1 item 5 更新
- **位置**:`src/sim/CLAUDE.md` L4-6
- **症状**:spec §4.1 item 5:"更新 `src/sim/CLAUDE.md`:删除 `force-engine.js` 行,补 'force-3d.js 升级来自 topology'"。实际 CLAUDE.md:
  ```
  ## 成员清单
  - `force-engine.js`: d3-force 2D 仿真引擎(斥力 + 弹簧 + 中心 + 碰撞)
  - `force-3d.js`: d3-force-3d 3D 仿真封装(3D 力导向 / 引力 / 碰撞 / 中心力)
  ```
  force-engine.js 行未删(且不能删,因 1.4 仍被消费),force-3d.js 升级说明未补。
- **影响**:CLAUDE.md 与 spec §4.1 item 5 不一致;新人不知道 force-3d.js 的来源与升级历史。
- **修复建议**:把 force-engine.js 行改为 `- force-engine.js: d3-force 2D 仿真引擎(@deprecated,待 2D 渲染路径退役后删除,见 topology-sim audit §1.4)`,并在 force-3d.js 行补 `(P0-4 合并时从 topology/ 迁入)`。

### 2.3 代码:convex-hull.js header 注释漏 valid 字段
- **位置**:`src/topology/convex-hull.js` L3(`[OUTPUT]: computeHull(points) → { vertices, faces } (Three.js 可用格式)`)
- **症状**:header 声明返回 `{ vertices, faces }`,但实际返回 `{ vertices, faces, valid }`(L11/18/27 三处都有 valid)。消费方 `src/render/hull-mesh.js` 用 `if (!hullData.valid || ...)` 判定,valid 是一等字段。
- **影响**:header 与实现不一致,新人看 header 会以为 valid 不存在而不消费它。
- **修复建议**:L3 改为 `→ { vertices, faces, valid } (valid=false 表示退化,消费方应短路)`。

### 2.4 代码:cube-camera wheel 缩放被 lerp 抵消(继承自 topological audit 1.4)
- **位置**:`src/topology/cube-camera.js` L71-79(wheel) + L116-117(update 的 lerp)
- **症状**:wheel 事件 `camera.position.multiplyScalar(zoom)` 修改相机位置;但下一帧 `update()` 的 `camera.position.lerp(targetPos, 0.12)` 把相机拉回 targetPos,缩放在 ~0.4s 内被完全抵消。
- **根因**:`targetPos` 是面切换目标,wheel 缩放未同步更新 targetPos 的距离分量。
- **影响**:桌面用户滚轮缩放无效(本 spec §2.2 行为约束 2 "缩放阻尼 |position| ∈ [200, 2000]" 形同虚设)。
- **修复建议**:wheel 改为修改 `targetPos`(沿当前相机→原点方向缩放);或 wheel 时 `targetPos.copy(camera.position)` 再 scale。
- **注**:本问题在 `topological-awareness-space` audit §1.4 已记录,本 spec 继承该问题但未在 §6 风险表列出。

### 2.5 代码:cube-camera onFaceChange 时序约束未显式实现(spec §2.2 行为 5)
- **位置**:`src/topology/cube-camera.js` L113(`let onFaceChanged = null;`)+ L129(`onFaceChange(cb) { onFaceChanged = cb; }`)
- **症状**:spec §2.2 行为约束 5:"时序约束:`onFaceChange` 必须在第一次 `update()` 之前注册"。实际代码无任何时序检查 — 若先调 `update()` 再 `onFaceChange(cb)`,cb 不会触发(因 switchToFace 在 update 之前若被调则会调 onFaceChanged,但 update 本身不调 switchToFace)。
  更隐蔽的问题:`onFaceChanged` 是闭包变量,若用户在 `update()` 跑过几帧后才注册 cb,之前的 face 切换不会被回放。
- **影响**:spec §6.3 开放问题 "建议把回调改成显式主动触发" 未落地;若 main.js 改变初始化顺序可能踩坑。
- **修复建议**:
  1. `onFaceChange(cb)` 内立即 `cb(currentFace)` 回放当前面
  2. 或在 `update()` 加 `if (currentFace !== lastFiredFace && onFaceChanged) { onFaceChanged(currentFace); lastFiredFace = currentFace; }`

### 2.6 代码:createSim3D stopSim 单例生命周期不完整
- **位置**:`src/sim/force-3d.js` L9-12 + L50-52
- **症状**:`stopSim()` 把 `activeSim = null`,但 `createSim3D` 不检查 `activeSim === null` — 若 `stopSim()` 后再调 `createSim3D`,新 sim 正常创建,但旧 sim 的 nodes 引用可能仍被 main.js 持有,造成"幽灵引用"。
- **影响**:spec §2.1 行为约束 1 "单例"语义部分实现 — 单例创建正确,但旧 sim 的资源清理(GC)依赖 main.js 不再引用 nodes。
- **修复建议**:`stopSim()` 内加 `if (activeSim) { activeSim.stop(); activeSim.nodes = null; activeSim = null; }`,主动断引用。

### 2.7 架构:spec §6 风险表未把"force-engine.js 仍被消费"列为已知风险
- **位置**:`docs/superpowers/specs/2026-07-07-topology-sim-design.md` L233-239(§6 风险与开放问题)
- **症状**:spec §6.2 写 "Orphan src/sim/force-engine.js 究竟是不是死代码:建议先 grep 全 git 历史看是否有过 2D canvas 模式" — 但 grep 显示 canvas.js / thought-node.js 仍在仓库并消费 force-engine.js,2D canvas 模式**仍然活着**。
  spec §6.2 把已知的活依赖标为"开放问题",低估了删除难度。
- **影响**:spec §4.1 item 2 的"删除"动作基于 §6.2 的错误判断,不可执行。
- **修复建议**:把 §6.2 改为 "force-engine.js 是 2D canvas 路径(canvas.js + thought-node.js)的活依赖,需先整体退役 2D 路径才能删";或把 §6.2 标为"已闭合:见 audit §1.4"。

---

## §3 P2 问题(锦上添花)

- **`src/sim/force-3d.js` L17**:`y: t.y ?? (Math.random() - 0.5) * 300 + 100` 随机 Y ∈ [-50, 250],与 spec §3.2(继承自 topological spec)的 L0(>200)/L1(0-200)/L2(-200-0)/L3(<-200) 分布不符;建议改为按 temperature 决定初始 Y。
- **`src/sim/force-3d.js` L34-40**:`forceSimulation(nodes, 3)` 第三参 3 是维度,硬编码;建议提为 options.dim 或常量。
- **`src/sim/force-3d.js` L9**:`let activeSim` 全局单例虽是亮点(防多 sim 并发),但多场景时不灵活;建议改为类实例或 context。
- **`src/topology/convex-hull.js` L21**:`const faces = hull;` 直接赋值,未做 >3 顶点面的 triangulate;convex-hull npm 包可能返回多边形(虽然实测是三角化),建议 defensively triangulate。
- **`src/topology/cube-camera.js` L23-24**:`let targetPos/targetLookAt` 应为 `const`(引用不变,内部 .set 改值)。
- **`src/topology/cube-camera.js` L117-122**:`update()` 用固定 lerp(0.12),未基于 dt;高刷新率(120Hz)下动画过快。
- **`src/topology/cube-camera.js` L40-42**:`pointermove` 处理器 `if (!swiping) return;` 后空跑,可删除整个处理器(若 swiping 不在 pointermove 做事)。
- **`src/topology/cube-camera.js` L139-161**:`createFaceIndicator` 是文字标签,非 spec §4.5(继承自 topological spec)要求的小魔方示意图;本 spec 未明确要求但建议与 topological audit 2.5 一致处理。
- **`docs/superpowers/specs/2026-07-07-topology-sim-design.md` L11-13**:`scope.files` 列 3 个文件,但 force-engine.js 也在审查范围(§4.1 item 2 要删它),建议补进 scope.files。
- **`src/sim/force-engine.js` L1-6**:header `[INPUT]` 仍写 "src/core 的 Thought/Edge",与实际消费方(canvas.js 基于 pixi.js)一致,但未标注 @deprecated。

---

## §4 亮点(必须保留)

> cross-review 方法论 §7 强制要求:亮点必须明示,避免下次重构误删好的设计决策。

### 4.1 cube-camera 6 面语义化命名(首创,与 topological audit 4.1 一致)
- **位置**:`src/topology/cube-camera.js` L9-16(`FACES` 对象)
- **价值**:每个面不只给坐标,还给**意识语义 label**:`正面·意识剖面` / `背面·低频区` / `顶面·鸟瞰` / `底面·潜意识深渊` / `左面·概念扩散` / `右面·概念扩散`。本 spec §2.2 把 6 面定义从 topological spec 继承并精确化(pos + lookAt + label 三元组),与 spec frontmatter `non-negotiable` 第 2 条 "cube-camera 的 6 面语义" 完全对齐。
- **为什么保留**:这是产品可视化的核心创新 — 市面 3D 工具的相机都是"前/后/左/右/顶/底"纯几何命名,本设计把相机操作绑定到心理学语义,是 thoughtspace-notes 的差异化护城河。下次重构若有人觉得"label 多余"想删,必须保留。
- **代码对齐度**:FACES.pos 与 spec §2.2 表完全一致(L10-15 逐行比对);L18-19 `FACE_ORDER_Y/X` 是 spec 未明示但合理的辅助常量,用于 swipe 循环切换。

### 4.2 convex-hull valid 标志的防御性编程(与 topological audit 4.5 一致)
- **位置**:`src/topology/convex-hull.js` L10-12, L17-19, L24-28
- **价值**:`computeHull` 在 < 4 点时返回 `valid: false`(L10-12),在 hull 为空时也返回 `valid: false`(L17-19),成功时返回 `valid: true`(L27)。三层 valid 判定,消费方 `hull-mesh.js` 一行短路。这是把"几何退化"作为一等公民处理,而非 try-catch。
- **为什么保留**:3D 凸包的退化场景非常多(共面、共线、单点、空集),用 valid 标志比抛异常优雅;本 spec §2.3 行为约束 1-2 把 valid 语义明确为契约的一部分。
- **代码对齐度**:L10 `< 4 点` 与 spec §2.3 约束 1 完全一致;L17 空数组兜底与约束 2 完全一致;L25 `vertices: points`(原始坐标)与约束 3 完全一致。这是本 spec 中**唯一代码与 spec 逐行对齐的模块**。

### 4.3 force-3d.js activeSim 单例管理(防内存泄漏)
- **位置**:`src/sim/force-3d.js` L9-12(`let activeSim = null; if (activeSim) activeSim.stop()`)
- **价值**:模块级单例保证任意时刻只有一个 sim 在跑,创建新 sim 前自动 stop 旧 sim。d3-force-3d 的 sim 默认会持续 tick 直到 alpha 衰减,若不显式 stop 会导致内存泄漏 + CPU 累加。
- **为什么保留**:这是简单但容易被忽视的工程实践;本 spec §2.1 行为约束 1 "单例"语义由此实现。下次重构若改成多实例模式,必须保留等价的 stop 语义。
- **注**:本亮点在 topological audit 4.3 已记录,本 spec 的 force-3d.js 继承该设计;但单例生命周期不完整(见 §2.6)。

### 4.4 spec §6 风险表的诚实性(自我暴露开放问题)
- **位置**:`docs/superpowers/specs/2026-07-07-topology-sim-design.md` L233-239(§6 风险与开放问题)
- **价值**:spec 主动列出 4 个已知风险:d3-force-3d 与自实现动力学的 reheat 语义差异、force-engine.js 是否死代码、cube-camera onFaceChanged 时序、凸包重算性能。这是 spec 作者**不掩饰 gap** 的诚实表现 — 多数 spec 会把已知问题藏到实施时才暴露。
- **为什么保留**:这种"开放问题明示"的 spec 风格是 thoughtspace-notes 方法论的核心(08-cross-review §1.3 反例就是"完成感幻觉掩盖问题")。下次写新 spec 时应复用此模式。
- **注**:虽然 §6.2 的 force-engine.js 判断有误(见 §2.7),但"主动列出风险"本身是亮点。

### 4.5 spec §4.1 落地清单的 check-list 形式(可追踪)
- **位置**:`docs/superpowers/specs/2026-07-07-topology-sim-design.md` L204-212(§4.1 落地清单)
- **价值**:spec 用表格列 5 项落地动作 + 文件/路径 + 验收标准(如 "grep 零消费"、"单测覆盖 setLayout('circle'→'grid') 触发 reheat")。这种"动作 + 验收"配对的 check-list 形式,让实施进度可机器追踪。
- **为什么保留**:本 audit §1.1/§1.4/§2.2 的发现正是基于 §4.1 清单逐项核对 — 若 spec 没有这个清单,审查会变成无锚点的全文阅读。下次 spec 应复用此模式。
- **注**:清单本身是亮点,但"标 phase=implemented 前未逐项验证"是 §1.5 的根因。

---

## §5 修复优先级清单

> 决策矩阵(参考 cross-review §3.3):P0 当前会话必修,P1 应修(允许妥协/错峰),P2 可留 TODO。

| # | 问题 | 级别 | 决定 | 理由 |
|---|---|---|---|---|
| 1 | force-3d.js 5 函数缺失(1.1) | **P0** | 立即修 | spec §2.1 API 大面积 drift,5 个导出完全不存在 |
| 2 | 温度→Y 拉拽未实现(1.2) | **P0** | 立即修 | 违反 non-negotiable,核心心智模型断裂 |
| 3 | force-3d.js options 缺失(1.3) | **P0** | 立即修 | 8 个配置全硬编码,与 1.2 同源,合并修 |
| 4 | force-engine.js 误判孤儿(1.4) | **P0** | 立即决 | spec §4.1 item 2 不可执行,必须改 spec 或先删 2D 路径 |
| 5 | phase=implemented 与实际不符(1.5) | **P0** | 立即决 | 降级 phase 或加 gap 标注 |
| 6 | mass 未按 infoLevel 计算(2.1) | P1 | 立即修 | 一行改,与 1.1 合并 |
| 7 | sim/CLAUDE.md 未更新(2.2) | P1 | 立即修 | 与 1.4 决策后合并修 |
| 8 | convex-hull header 漏 valid(2.3) | P1 | 立即修 | 一行改 |
| 9 | wheel 缩放被 lerp 抵消(2.4) | P1 | 错峰修 | 继承自 topological audit,非本 spec 引入 |
| 10 | onFaceChange 时序未显式(2.5) | P1 | 错峰修 | 当前 main.js 安全,但 spec §6.3 已提 |
| 11 | stopSim 单例生命周期(2.6) | P1 | 错峰修 | 边界 case,不致命 |
| 12 | spec §6 风险表 force-engine 判断(2.7) | P1 | 立即修 | 与 1.4 决策后合并改 spec |
| 13-22 | 10 项 P2 | P2 | 写 TODO | 不影响功能,下次会话或 backlog |

**修复顺序建议**:
```
1. 决 1.4/1.5(force-engine.js 真相 + phase 降级)— 先把 spec 与事实对齐
2. 修 1.1/1.2/1.3/2.1(force-3d.js 全面补全)— 5 函数 + options + 温度拉拽 + mass,同文件一次改完
3. 修 2.2/2.3/2.7(CLAUDE.md + header + spec §6)— 文档对齐
4. 错峰:2.4/2.5/2.6(cube-camera 三项,继承问题 + 边界 case)
5. 写 TODO:10 项 P2
```

---

## §6 元教训(完成感幻觉)

> cross-review 方法论 §7 要求每份 audit 暴露"完成感幻觉"。

### 6.1 "phase: implemented" ≠ "API 已落地"

本 spec frontmatter 标 `phase: implemented`,注释写 "P2-1: 仿真契约已实施,孤儿代码已清理"。但审查发现:
- spec §2.1 API 声明 7 个导出,**5 个完全不存在**(pinSimNode/unpinSimNode/setSimLayout/reheatSim/keepAlive)
- spec non-negotiable 温度→Y 拉拽,**0 处实现**
- spec §4.1 落地清单 5 项,**3 项未完成**
- 注释 "孤儿代码已清理" 与 force-engine.js 仍存在的事实矛盾

**教训**:`phase: implemented` 是状态机声明,不是事实。状态机推进时若不把"spec 声明的导出函数在代码中存在 / non-negotiable 项有代码实现 / §4.1 清单逐项勾选"作为前置门禁,phase 字段就是自我欺骗。根本修复:`check-spec-topology.mjs` 加规则 — `phase: implemented` 的 spec 必须通过 `check:spec-drift` 验证 spec 声明的每个 export 在代码中存在。

### 6.2 "non-negotiable" 是声明,不是事实

spec frontmatter `non-negotiable` 第 1 条:"温度→Y 拉拽的语义必须保留(核心心智模型)"。但 grep `temperaturePull|temperatureYBounds|targetY` 在 `src/` 下 **0 匹配** — 这条"不可协商"的规则在代码中完全不存在。

**教训**:`non-negotiable` 字段是 spec 作者的自我承诺,但若没有机器校验(non-negotiable 项必须有对应代码 grep 命中),承诺就是空头支票。建议在 `check:non-negotiable.mjs` 加规则:每条 non-negotiable 必须有对应的 grep key(本例:`temperaturePull` 或 `targetY`),命中 0 次则 FATAL。

### 6.3 "孤儿代码" 判定必须 grep,不能靠记忆

spec §6.2 把 force-engine.js 列为"Orphan 究竟是不是死代码"的开放问题,§4.1 item 2 直接标"删除"。但 grep 显示它仍被 `src/render/canvas.js:2` 和 `src/render/thought-node.js:2` 消费 — **它不是孤儿,是活依赖**。

**教训**:判定孤儿代码的唯一可靠方法是 `grep -r "from '.*<module'"`,不是"我记得没人用它"。本 spec 作者可能记得 "2D canvas 路径已废弃",但 canvas.js / thought-node.js 仍在仓库,它们的 import 语句就是活证据。这也是 cross-review §1.1"单视角盲区"的体现 — 作者的记忆盲区被 grep 打破。

### 6.4 spec §4.1 落地清单是 check-list,不是 back-pat

spec §4.1 落地清单写得很好(动作 + 文件 + 验收,见 §4.5 亮点),但标 `phase: implemented` 前没有逐项验证:
- item 1 "迁移 pin/unpin/setLayout/reheat/keepAlive" — 验收"单测覆盖 setLayout" 未跑(且 setLayout 不存在)
- item 2 "删除 force-engine.js" — 验收"grep 零消费" 未跑(且消费存在)
- item 5 "更新 sim/CLAUDE.md" — 未做

**教训**:落地清单的价值在于"逐项可机器验证",但若标 phase 前不跑验证,清单就变成装饰。建议 `check-spec-topology.mjs` 加规则:`phase: implemented` 的 spec,其 §4.1 清单每项的"验收"列必须对应一条已通过的检查(grep / 单测 / 门禁)。

### 6.5 继承的 spec drift 不会自动消失(元教训的元教训)

本 spec 继承自 `topological-awareness-space` spec,后者在 audit(2026-07-07)中已记录 5 个 P0(无限循环 / 拖拽缺失 / wheel 抵消 / 三模块零测试 / sediment 违规)。本 spec 标 `inherits-from: topological-awareness-space`,但:
- 继承了 wheel 缩放被 lerp 抵消问题(§2.4)
- 继承了三模块零测试问题(spec §5 测试矩阵 0 条可执行)
- 继承了 cube-camera 文字面指示器问题(§3 P2)

**教训**:spec 继承不会自动修复上游 drift — 继承的是问题,不是解决方案。本 audit 的多个发现本质上是 topological audit 的未修问题在 new spec 上下文中的重新暴露。建议 cross-review §6 补充:`inherits-from` 的 spec 必须在 §6 风险表显式列出上游未修 P0/P1,否则继承关系会变成"问题传递链"。

---

## 附录:审查视角正交性检查

| 视角 | 主要查 | 不查 |
|---|---|---|
| 代码审查员 | API 表面 / spec drift / 行为约束 | 治理门禁 / 状态机 / CLAUDE.md |
| 架构审查员 | 模块边界 / 落地清单 / 数据流 / 孤儿判定 | 测试存在性 / header 注释 |
| 工程治理审查员 | cross-review 合规 / phase 一致性 / CLAUDE.md | 具体 bug / 视觉创新 |

**正交性验证**:三视角无重叠任务,但发现的问题有交叉(如 force-engine.js 孤儿判定同时被代码视角的 grep 和治理视角的 §4.1 清单发现;force-3d.js API 缺失同时被代码视角的 export 检查和架构视角的落地清单 item 1 发现)。合并后已去重。

**与 topological-awareness-space audit 的关系**:本 spec `inherits-from: topological-awareness-space`,两份 audit 共享 cube-camera / convex-hull / force-3d 三个模块的代码事实,但视角不同 — topological audit 看的是"视觉/交互创新 vs 实施 gap",本 audit 看的是"API 契约 vs 落地清单完成度"。两份报告互补,不可互相替代。

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
