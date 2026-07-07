# topological-awareness-space 质量审查 · 2026-07-07

> **本报告由 agent team 3 视角并行审查产出**:
> - 代码审查员 (代码质量 + 不变式 + spec drift)
> - 架构审查员 (模块边界 + spec 对齐 + 数据流)
> - 工程治理审查员 (cross-review 合规 + 测试覆盖 + 状态机一致性)
>
> **审查对象**:topological-awareness-space spec(`docs/superpowers/specs/2026-07-05-topological-awareness-space-design.md`)及其代码产物
> **审查范围**:`src/topology/{cube-camera.js, convex-hull.js}` + `src/sim/force-3d.js` + 关联消费层(`src/main.js`, `src/render/{hull-mesh.js, sediment-layer.js, thought-sphere.js}`)
> **目的**:补全 cross-review 回路 — 本 spec 标 `status: sediment` 但 `docs/audit/` 仅 SP-1 一份报告,违反 `docs/methodology/08-cross-review.md` §6.2"沉淀语义要求 ≥1 份完整 audit 报告"。
>
> **章节顺序严格遵循 `08-cross-review.md` §7 模板**(SP-1 audit 报告把"修复优先级"放 §4、"亮点"放 §5,与模板反了,本报告予以纠正)。

---

## §0 综合评分

| 维度 | 评分 | 评语 |
|---|---|---|
| 代码不变式 | **1.5/5** | observeDeep→rebuildScene→transact→observeDeep 无限循环;拖拽念头核心交互完全缺失 |
| spec 对齐度 | **2.5/5** | 视觉概念强,但 Perlin 噪声用 sin 伪随机代替、6 种几何只实现 1 种、沉积漂移未实现 |
| 测试覆盖 | **0.5/5** | tests/ 目录 36 份测试,0 份覆盖 topology/convex-hull/force-3d 核心 |
| 治理合规 | **1.5/5** | sediment 状态违规(无 audit)、scope.files 漏 4 个核心文件、pixi.js 依赖未清 |
| 视觉/交互创新 | **4.0/5** | 6 面语义、温度→Y 拉拽心智模型是真正的产品级创新 |
| 架构边界 | **3.0/5** | topology/sim/render 三层清晰,但 main.js 同时承担 SP-1 与本 spec 职责 |
| **综合** | **2.2/5** | 创新强、收尾粗糙、治理违规 — 典型的"experiment 阶段提前标 sediment"完成感幻觉 |

> 评分对标 SP-1 audit(`2.6/5`):本 spec 视觉创新更高(SP-1 无),但 spec drift 与测试缺失更严重,故综合略低。

---

## §1 P0 问题(必修)

### 1.1 代码:observeDeep → rebuildScene → rebuildSim → transact → observeDeep 无限循环
- **位置**:`src/main.js` L65-104(L69-77 tick 写回 + L106-107 observe 触发 rebuild)
- **症状**:`yThoughts.observeDeep(() => requestAnimationFrame(rebuildScene))` 在每次 Yjs 数据变化时触发场景重建;`rebuildScene` 内部调用 `rebuildSim()`;`rebuildSim` 注册的 sim `tick` 回调在 L71-76 通过 `transact()` 写回 `yThoughts.set(n.id, { ...t, x, y, z })`;该写入再次触发 `observeDeep`,形成**自循环**。
- **根因**:观察者回调内部反向写回被观察的 Y.Map,缺少"来源标记"短路(sim 产生的 tick 不应再触发 rebuildScene)。
- **影响**:
  - 布局永远稳定不下来(sim alpha 永远重启到 0.5)
  - CPU 持续 100%、笔记本发热
  - Yjs Undo 栈被 sim tick 污染(每帧 N 条 undo entry),`Ctrl+Z` 失效
- **修复建议**:
  1. 在 `transact(..., 'sim')` 第二参添加来源标记,`observeDeep` 回调里检查 `origin === 'sim'` 时直接 return
  2. 或者把 sim tick 的位置写回改为**直接更新 mesh 位置**(L189-192 已有 `updateThoughtMesh`),不写回 Yjs — Yjs 只在用户主动操作时写
  3. 加防抖:同一帧内多次 observe 合并为一次 rebuild

### 1.2 治理:`status: sediment` 但 0 份 audit + 0 测试覆盖核心算法
- **位置**:`docs/superpowers/specs/2026-07-05-topological-awareness-space-design.md` L4(`status: sediment`)+ `docs/audit/`(仅 SP-1 一份)+ `tests/`(36 份测试无 topology/cube-camera/convex-hull/force-3d)
- **症状**:本 spec 已"沉淀",但 `docs/methodology/08-cross-review.md` §6.2 明确"`🔵 沉淀` 语义要求:测试 100% 过 / 门禁全过 / ≥1 份完整 audit 报告"。当前**两条都不满足**。
- **根因**:状态机推进时未把"cross-review 报告"作为 sediment 的前置门禁;`check:spec-topology` / `check:non-negotiable` 脚本未校验 audit 报告存在性。
- **影响**:cross-review 回路在物理上断裂,本 spec 进入"沉默退化"状态 — 6 个月后无人能回答"上次发现什么"。
- **修复建议**:
  1. 本报告即填补该缺口(本报告存在 = 修复 1.2 的一半)
  2. 在 `scripts/check-spec-topology.mjs` 加规则:`status: sediment` 的 spec 必须在 `docs/audit/` 找到对应 `<spec-id>-quality-review.md`
  3. 补 `tests/topology/convex-hull.test.js` + `tests/topology/cube-camera.test.js` + `tests/sim/force-3d.test.js` 三份最小覆盖

### 1.3 代码:拖拽念头核心交互完全缺失
- **位置**:`src/main.js` L113-169(只有 click 投念头 / dblclick 捞起,无 drag)
- **症状**:spec §4.2 明确"拖拽念头:在空间内移动位置(力导向暂时 override)" — main.js 注册了 `click` 和 `dblclick`,但**没有任何 pointermove + drag 处理**。
- **根因**:cube-camera 的 `pointermove`(L40-42)只用于 swipe 判定(且 `if (!swiping) return` 直接空跑),从未把拖拽事件路由到念头节点。
- **影响**:用户无法调整念头位置;力导向产出的布局是唯一来源,布局错乱时无人工修正手段;spec §7 验收"鼠标可以旋转/缩放/平移 3D 视角"中"平移"未达成。
- **修复建议**:
  1. 在 main.js 加 `pointerdown` 命中念头 → 设置 `meshesById.get(id).userData.isDragging = true` + `simNode.fx/fy/fz` 钉住
  2. `pointermove` 时 raycast 到当前面平面,更新 `fx/fy/fz`
  3. `pointerup` 释放钉住(或保留钉住,由 dblclick 解除)
  4. 注意与 cube-camera 的 swipe 冲突:用 pointer 长按 + 移动距离 > 阈值区分 drag 与 swipe

### 1.4 代码:cube-camera wheel 缩放被 lerp 抵消
- **位置**:`src/topology/cube-camera.js` L71-79(wheel) + L116-117(update 的 lerp)
- **症状**:wheel 事件 `camera.position.multiplyScalar(zoom)` 修改了相机位置;但下一帧 `update()` 里 `camera.position.lerp(targetPos, 0.12)` 把相机**拉回 targetPos**,缩放视觉效果在 0.4s 内被完全抵消。
- **根因**:`targetPos` 是面切换的目标,wheel 缩放未同步更新 `targetPos` 的距离分量。
- **影响**:滚轮缩放无效,用户只能用双指捏合(且仅 touch);spec §4.1"双指缩放拉近/拉远"达成,但桌面用户无缩放手段。
- **修复建议**:wheel 改为修改 `targetPos`(沿当前相机→原点方向缩放),让 lerp 平滑过渡;或在 wheel 时 `targetPos.copy(camera.position)`(锁定 target 为当前位置后再 scale)。

### 1.5 代码:convex-hull / cube-camera / force-3d 三模块零测试
- **位置**:`tests/`(36 份测试,无 topology/sim 任何一份)
- **症状**:本 spec 的三个核心算法模块(`convex-hull.js` 凸包计算、`cube-camera.js` 6 面切换/吸附、`force-3d.js` 3D 力导向)在 36 份测试中**无任何覆盖**。
- **根因**:spec §6 实施计划 S9 列了"测试 + 调参 1 天",但实际未执行;`check:test-spec-linkage` 门禁未把它们与 spec 关联。
- **影响**:
  - convex-hull 边界 case(< 4 点、共面点、退化凸包)未验证
  - cube-camera FACE_ORDER_Y/X 循环逻辑无回归保护
  - force-3d activeSim 单例生命周期未验证
- **修复建议**:补 3 份最小测试(每份 5-8 case 即可):
  - `tests/topology/convex-hull.test.js`:0 点 / 3 点 / 4 点正四面体 / 8 点立方体 / 共面退化
  - `tests/topology/cube-camera.test.js`:swipe 水平循环 / swipe 垂直循环 / wheel 边界 / face indicator 更新
  - `tests/sim/force-3d.test.js`:createSim3D 返回结构 / activeSim 单例 / restartSim alpha / stopSim 清理

---

## §2 P1 问题(应该修)

### 2.1 架构:spec `scope.files` 不完整(漏 4 个核心文件)
- **位置**:`docs/superpowers/specs/2026-07-05-topological-awareness-space-design.md` L11(`scope.files: [src/topology/convex-hull.js, src/topology/cube-camera.js]`)
- **症状**:scope.files 只列 2 个文件,但实际代码涉及 `src/sim/force-3d.js`(被 main.js L14 直接消费)+ `src/main.js`(bootstrap)+ `src/render/hull-mesh.js`(消费 convex-hull)+ `src/render/sediment-layer.js`(spec §4.4 沉积层)+ `src/render/thought-sphere.js`(spec §3.2 念头节点)。
- **根因**:scope 字段在 spec 创建时填写,后续添加新模块时未回填。
- **影响**:cross-review 审查范围天然不全;`check:spec-topology` / `check:non-negotiable` 可能基于不完整的 scope 给出"全过"假象。
- **修复建议**:scope.files 补全为 `[convex-hull.js, cube-camera.js, ../sim/force-3d.js, ../main.js, ../render/hull-mesh.js, ../render/sediment-layer.js, ../render/thought-sphere.js]`;或改用 scope.modules: `[src/topology, src/sim, src/render, src/main.js]`。

### 2.2 代码:沉积层漂移逻辑未实现(spec §4.4)
- **位置**:`src/render/sediment-layer.js` L41-60(只在念头下方生成粒子,不修改念头 Y)
- **症状**:spec §4.4"温度<0.3 的念头开始向 Y 轴负方向缓慢漂移(速度 2px/帧)" — 代码只在念头下方画一颗下沉粒子,**念头本身 Y 坐标完全不变**。
- **根因**:把"沉积"理解为视觉特效而非物理漂移;`force-3d.js` 也没有"sink force"把低温念头拉向 Y 负方向。
- **影响**:低温念头永远停留在原位,潜意识深渊视觉假象;spec §7 验收"低温念头自动下沉到沉积层"未达成。
- **修复建议**:在 `force-3d.js` 加自定义 force:`if (node.temperature < 0.3) node.vy -= 0.2;`(每帧 -0.2 单位 ≈ 2px/帧 @ 60fps);或在 sediment-layer.update 里直接 `t.y -= 2` 后写回(注意会触发 1.1 的循环)。

### 2.3 代码:提炼(Crystallize)功能完全缺失(spec §4.3)
- **位置**:`src/main.js`(无任何 crystallize 调用;`src/core/crystallize.js` 与 `src/render/crystallize-fx.js` 存在但未接通)
- **症状**:spec §4.3 描述的"选中一组念头 → 提炼成拓扑体节点 → 0.8 秒动画"完全未实现;toolbar 无提炼按钮。
- **根因**:实施计划 S5/S6 未完成,但 spec 已标 sediment。
- **影响**:核心创新"念头→多面体"流程断裂;spec §7 验收"选中一组念头 → 提炼成一个不规则凸包多面体"未达成。
- **修复建议**:补 toolbar 按钮 + 选中状态 + 调用 `core/crystallize.js`(已存在);或把 spec 降级回 `phase: experiment`/`focus` 并明示 crystallize 留给 SP-N+1。

### 2.4 代码:6 种几何布局只实现 1 种(spec §7 验收)
- **位置**:`src/topology/convex-hull.js`(只有 Hull);`src/core/geometry-cluster.js` 存在但 main.js 未消费 Voronoi/Spiral/Star/Grid/Free
- **症状**:spec §7 验收"6 种几何布局至少 3 种可用(凸包+Voronoi+螺旋优先)" — 实际只有 convex-hull 1 种接入 main.js。
- **根因**:S5 阶段未完成。
- **影响**:验收标准明确未达成,但 spec 已标 sediment。
- **修复建议**:至少补 Voronoi(用 d3-delaunay 3D 或自研)+ Spiral 两件;或显式在 spec 标注"6 → 1 收敛"作为已知 gap。

### 2.5 代码:面指示器是文字标签,非 spec 要求的小魔方示意图
- **位置**:`src/topology/cube-camera.js` L139-161(`createFaceIndicator` 只设置 textContent)
- **症状**:spec §4.5"屏幕右下角显示一个小型半透明魔方(边长 60px),当前正在看的面高亮(发光边框),相邻面半透明" — 实际实现是一个 60x60 的 div 显示文字"正面"。
- **根因**:实施时取了文字最简实现,放弃了空间隐喻。
- **影响**:用户失去"我在哪个面"的空间感;spec drift。
- **修复建议**:用 Three.js 渲染一个小立方体作为面指示器,当前面 emissive 高亮;或用 CSS 3D transform 旋转一个小立方体 div。

### 2.6 代码:Perlin 噪声用 sin 伪随机代替(spec drift)
- **位置**:`src/render/hull-mesh.js` L30-40(`(Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453) % 1`)
- **症状**:spec §3.4"多面体的每个面微微扭曲(在顶点上加 Perlin 噪声偏移)" — 代码用 GLSL 经典伪随机 sin 公式代替 Perlin,且 `% 1` 对负数返回负数(JS 行为),导致 noise ∈ [-1, 1) 而非 [0, 1),`(noise - 0.5) * 8` 偏移范围变成 [-12, 4] 而非 [-4, 4]。
- **根因**:复制 GLSL 片段未做 JS 适配;Perlin 与白噪声视觉差异大(Perlin 平滑、白噪声颗粒感)。
- **影响**:多面体扭曲不均匀,正负方向不对称;spec drift。
- **修复建议**:`const noise = Math.abs(Math.sin(...))` 或用 `simplex-noise` npm 包实现真 Perlin;同时把 magic number 提为常量。

### 2.7 代码:click 与 cube-camera pointerup 交互冲突
- **位置**:`src/main.js` L114-143(click 投念头)+ `src/topology/cube-camera.js` L44-69(pointerup 切换面)
- **症状**:cube-camera 在 `pointerup` 中用 `if (dt > 800) return` 排除慢滑动;但浏览器 `click` 事件在 pointerup 后**仍会触发**(只要 down/up 在同一点附近)。结果是:用户慢拖念头(0.8s 以上)→ cube-camera 不切面(对)→ main.js click 触发 → 在原位投下一颗新念头(错)。
- **根因**:两个监听器独立注册,未协调"是 swipe / drag / click"。
- **影响**:用户拖念头时误投新念头;数据污染。
- **修复建议**:在 main.js click 处理里检查 `cubeCam.isSwiping()` 或最近一次 pointerup 的 dt/moveDist,超过阈值则不投念头。

### 2.8 代码:desktop 用户无法切换面(swipe 仅 touch 触发)
- **位置**:`src/topology/cube-camera.js` L35-37(`if (e.pointerType === 'touch' && e.isPrimary) swiping = true`)
- **症状**:swiping 只在 `pointerType === 'touch'` 时设 true,鼠标拖动不触发 swipe;desktop 用户无键盘切换面(main.js 也未注册键盘快捷键)。
- **根因**:spec §4.1 只写"触屏滑动",但 desktop 是开发主场景。
- **影响**:desktop 开发者无法测试 6 面切换;验收"鼠标可以旋转"在桌面环境下不达成。
- **修复建议**:把 `e.pointerType === 'touch'` 改为同时接受 `mouse`;或加键盘 `1-6` 切换面 + `Q/E` 旋转。

### 2.9 治理:package.json 仍依赖 pixi.js(spec §9 说替换)
- **位置**:`package.json` L54(`"pixi.js": "^7.4.0"`)
- **症状**:spec §9 明确"重写:src/render(全部替换为 Three.js)";spec §2.1 技术选型表"PixiJS 2D → Three.js WebGL 3D"。但 pixi.js 仍在 dependencies,安装时仍会下载(增加 bundle 体积)。
- **根因**:迁移 Three.js 时未清理旧依赖。
- **影响**:bundle 体积膨胀 ~400KB;新人误以为还在用 PixiJS。
- **修复建议**:`npm uninstall pixi.js`;在删除前 grep 确认无 `import 'pixi.js'`(快速验证:本审查已 grep,main.js 与 render/ 全部用 three)。

### 2.10 治理:force-engine.js (2D) 仍在仓库(spec §9 说重写 src/sim)
- **位置**:`src/sim/force-engine.js`(完整 2D d3-force 封装,67 行)
- **症状**:spec §9"重写:src/sim(2D→3D)" — `force-engine.js` 是 2D 旧版,`force-3d.js` 是 3D 新版,二者并存。`src/sim/CLAUDE.md` 只列了 force-engine.js + force-3d.js,未说明 force-engine.js 是否废弃。
- **根因**:P0-4 合并时只删了 `src/topology/force-3d.js`(见 src/topology/CLAUDE.md L8 注释),没清理 `src/sim/force-engine.js`。
- **影响**:双仿真引擎并存,新人不知道用哪个;`check:orphans` 可能未捕获(因为 force-engine.js 仍被某些 render 文件引用?)。
- **修复建议**:grep `createSimulation` 引用;若已无消费方则删除 force-engine.js;若仍有消费方则明确状态(或迁移、或标 `@deprecated`)。

### 2.11 架构:window.__sp1State 在 topological-awareness-space 范围内污染
- **位置**:`src/main.js` L224-253(SP-1 残留的全局对象)
- **症状**:main.js 同时承担 SP-1(看板分层/双模式)与本 spec(3D 拓扑空间)职责,`window.__sp1State` 是 SP-1 的全局桥,但在本 spec 审查范围内是污染源。
- **根因**:两个 spec 共用同一个 main.js bootstrap,未做模块拆分。
- **影响**:本 spec 的 scope 不含 SP-1 内容,但 main.js 物理上耦合;审查边界模糊。
- **修复建议**:把 SP-1 的 layer/sort/canvas-mode/zone 拆出到 `src/sp1-bootstrap.js`,main.js 只保留 topology/sim/render;或在 spec scope 里显式声明 main.js 是共享入口。

### 2.12 治理:experiment_window 过半但实验未收尾
- **位置**:spec L6(`experiment_window: 2026-07-05 ~ 2026-07-12`)+ 今天 2026-07-07
- **症状**:实验窗口 7 天,今天是第 3 天,但 crystallize/拖拽/6 几何/沉积漂移/测试均未完成,且 spec 已标 `status: sediment`(设计凝固)。
- **根因**:`status: sediment` 与 `phase: experiment` 共存本就是矛盾信号(设计已凝固但实验还在进行);cross-review §6.2 要求 sediment 必须有 audit,但 experiment_window 内未规定 audit 时机。
- **影响**:实验窗口结束时(07-12)若仍无 audit + 无测试,spec 会陷入"既非真 sediment 也非真 experiment"的悬空状态。
- **修复建议**:要么把 status 降回 `focus`(实验中,允许无 audit),要么补齐 P0 后真正 sediment;二选一,不可兼得。

---

## §3 P2 问题(锦上添花)

- **`src/sim/force-3d.js` L17**:`y: t.y ?? (Math.random() - 0.5) * 300 + 100` 随机 Y ∈ [-50, 250],与 spec §3.2 的 L0(>200)/L1(0-200)/L2(-200-0)/L3(<-200) 分布不符;建议改为按 temperature 决定初始 Y(高温在上、低温在下)。
- **`src/sim/force-3d.js` L37**:`forceCenter(0, 80, 0)` 把念头拉到 Y=80,与 spec §3.2 "念头自由分布"矛盾;建议改为弱中心力或仅 XZ 中心。
- **`src/main.js` L82-104**:`rebuildScene` 每次 observeDeep 全量重建(O(n)),大场景卡顿;建议 diff 重建。
- **`src/main.js` L95**:`computeHull` 每次 rebuildScene 重算 O(n log n);建议缓存 + 节点变更时增量。
- **`src/topology/cube-camera.js` L23-24**:`let targetPos/targetLookAt` 从不重新赋值,应为 `const`。
- **`src/topology/cube-camera.js` L117-122**:`update()` 用固定 lerp(0.12),未基于 dt;高刷新率(120Hz)下动画过快。
- **`src/topology/convex-hull.js` L42-50**:`for (let i = 0; i < 3; i++)` 只用 face 前 3 顶点,convex-hull npm 包可能返回多边形(虽然实测是三角化,但代码 defensively 处理 <3 却不处理 >3);建议 triangulate。
- **`src/render/hull-mesh.js` L86-97**:顶点小球用 `noisyVerts` 而非 face indices,可能与面片错位;建议小球用原始顶点(无 noise)以保持几何一致性。
- **`src/topology/cube-camera.js`**:无键盘切换面(可访问性);spec §4.1 只写触屏,但 a11y 应支持键盘。
- **`src/sim/force-3d.js` L9**:`activeSim` 全局单例虽是亮点(防多 sim 并发),但多场景时不灵活;建议改为类实例或 context。
- **`src/main.js` L189-192**:`updateThoughtMesh` 用 `lerp(0.3)`,与 sim tick 频率不同步,可能产生抖动;建议 sim tick 直接更新 mesh 而非通过 Yjs 绕一圈。
- **`docs/superpowers/specs/2026-07-05-...md` L12**:`scope.lines: []` 空,未精确到行;建议补关键行号便于 cross-review 锚定。

---

## §4 亮点(必须保留)

> cross-review 方法论 §7 强制要求:亮点必须明示,避免下次重构误删好的设计决策。
> SP-1 audit 报告原版缺本章节(M3-1 补全),本报告从首版即包含。

### 4.1 cube-camera 6 面语义化命名(首创)
- **位置**:`src/topology/cube-camera.js` L9-16(`FACES` 对象)
- **价值**:每个面不只给坐标,还给**意识语义 label**:`正面·意识剖面` / `背面·低频区` / `顶面·鸟瞰` / `底面·潜意识深渊` / `左面·概念扩散` / `右面·概念扩散`。这与 spec §3.3 的 6 面表一一对应,把"相机视角"从纯几何操作升维到"意识观察角度"。
- **为什么保留**:这是产品可视化的核心创新 — 市面 3D 工具的相机都是"前/后/左/右/顶/底"纯几何命名,本设计把相机操作绑定到心理学语义,是 thoughtspace-notes 的差异化护城河。下次重构若有人觉得"label 多余"想删,必须保留。
- **示例**:`front: { pos: [0, 0, 800], lookAt: [0, 0, 0], label: '正面·意识剖面' }` — 一眼看出这个面是看"显意识→潜意识分层 + 概念扩散"。

### 4.2 温度 → Y 轴拉拽心智模型(核心创新)
- **位置**:`docs/superpowers/specs/2026-07-05-...md` §3.2(L89-103)+ `src/render/thought-sphere.js` L9-13(TEMP_COLORS 暖金/中灰/深蓝)+ `src/main.js` L161-169(双击捞起 Y=300)
- **价值**:把"念头的显隐程度"映射到 Y 轴空间位置 + 颜色温度 + 透明度三重信号:**Y 越往下 = 越潜意识 = 颜色越冷 = 越透明**。这是把抽象的"意识层次"用 3D 空间+视觉双编码具象化,用户无需学习即可直觉理解"为什么这个念头在下面"。
- **为什么保留**:这是 spec §3.2 的核心创新,也是"拓扑意识空间"区别于普通 3D 节点图的关键。下次重构若有人想"统一颜色"或"Y 轴自由布局",必须保留温度→Y 的强绑定。
- **示例**:双击捞起 → `refreshed.y = Math.max(refreshed.y ?? 0, 300)` + `refreshTemperature(t, now)` — 一次操作同时改 Y、温度、时间戳,三信号同步。

### 4.3 force-3d activeSim 单例管理(防内存泄漏)
- **位置**:`src/sim/force-3d.js` L9-12(`let activeSim = null; if (activeSim) activeSim.stop()`)
- **价值**:模块级单例保证任意时刻只有一个 sim 在跑,创建新 sim 前自动 stop 旧 sim。d3-force-3d 的 sim 默认会持续 tick 直到 alpha 衰减,若不显式 stop 会导致内存泄漏 + CPU 累加。
- **为什么保留**:这是简单但容易被忽视的工程实践;下次重构若改成"每场景一个 sim 实例"的多实例模式,必须保留等价的 stop 语义。

### 4.4 cube-camera getCameraFront 用于"点击空白投念头"
- **位置**:`src/topology/cube-camera.js` L131-135 + `src/main.js` L124-126
- **价值**:`getCameraFront()` 用四元数变换得到相机实际朝向(而非 FACES 静态方向),main.js 在 click 空白时 `camera.position.clone().add(front.multiplyScalar(spawnDist))` — 念头精准投到相机前方 400 单位处。这与 spec §4.1 "在当前相机前方投下一颗新念头" 完全对齐。
- **为什么保留**:用四元数而非欧拉角避免万向锁;用 `getCameraFront` 而非硬编码 FACES.direction 保证面切换动画中途也能正确投念头。

### 4.5 convex-hull valid 标志的防御性编程
- **位置**:`src/topology/convex-hull.js` L10-12, L17-19, L24-28
- **价值**:`computeHull` 在 < 4 点时返回 `valid: false`,在 hull 为空时也返回 `valid: false`;消费方 `hull-mesh.js` L10 `if (!hullData.valid || hullData.vertices.length === 0) return null` — 一行短路。这是把"几何退化"作为一等公民处理,而非抛异常。
- **为什么保留**:3D 凸包的退化场景非常多(共面、共线、单点、空集),用 valid 标志比 try-catch 优雅;下次扩展 Voronoi/Spiral 时应复用此模式。

### 4.6 sediment-layer 半透明暗平面 + 下沉粒子(视觉表达潜意识深渊)
- **位置**:`src/render/sediment-layer.js` L14-27(bed 半透明暗平面)+ L46-60(下沉粒子)
- **价值**:用 `PlaneGeometry(1000, 1000)` + `opacity: 0.3` + `color: 0x0a1020` 在 Y=-250 铺一张"潜意识床",再在低温念头下方挂一颗下沉粒子 — 三重视觉暗示"这里是有重量的、会下沉的"。即使物理漂移逻辑未实现(见 2.2),视觉表达已到位。
- **为什么保留**:这是把"潜意识"具象化为可感知空间的关键视觉资产;下次重构若有人觉得"bed 多余"想删,必须保留。

### 4.7 hull-mesh 三件套(面片 + 线框 + 顶点小球)
- **位置**:`src/render/hull-mesh.js` L54-97
- **价值**:凸包渲染分三层 — 半透明面片(`opacity: 0.15`)+ 线框边(`wireframe: true, opacity: 0.2`)+ 顶点小球(`opacity: 0.4`)。三层透明度递增,从"体"到"骨架"到"点",视觉层次清晰。
- **为什么保留**:spec §3.1 "多面体表面有微弱的晶格线(暗示结构但不喧宾夺主)" — 三件套正是这个"暗示但不喧宾"的工程实现;单层渲染要么太实要么太虚。

---

## §5 修复优先级清单

> 决策矩阵(参考 cross-review §3.3):P0 当前会话必修,P1 应修(允许妥协/错峰),P2 可留 TODO。

| # | 问题 | 级别 | 决定 | 理由 |
|---|---|---|---|---|
| 1 | observeDeep→rebuildScene 无限循环(1.1) | **P0** | 立即修 | 数据/性能双事故,布局永不稳定 |
| 2 | sediment 状态违规 + 0 测试(1.2) | **P0** | 立即修 | 本报告即修复一半;测试补 3 份最小集 |
| 3 | 拖拽念头核心交互缺失(1.3) | **P0** | 立即修 | spec §4.2 必备交互,验收硬指标 |
| 4 | wheel 缩放被 lerp 抵消(1.4) | **P0** | 立即修 | 一行改 targetPos 即可 |
| 5 | 三模块零测试(1.5) | **P0** | 立即修 | 与 1.2 合并修 |
| 6 | spec scope.files 不完整(2.1) | P1 | 立即修 | 一行改 frontmatter |
| 7 | 沉积漂移未实现(2.2) | P1 | 立即修 | 加 sink force,5 行代码 |
| 8 | crystallize 完全缺失(2.3) | P1 | 错峰修 | 工作量大,或降级 spec phase |
| 9 | 6 几何只实现 1 种(2.4) | P1 | 错峰修 | 与 2.3 一起决:补 2 种或显式收敛 |
| 10 | 面指示器是文字非魔方(2.5) | P1 | 错峰修 | 视觉提升,不影响功能 |
| 11 | Perlin 用 sin 伪随机(2.6) | P1 | 立即修 | 一行 `Math.abs` 修负数 bug |
| 12 | click/swipe 交互冲突(2.7) | P1 | 立即修 | 加 isSwiping 短路 |
| 13 | desktop 无法切面(2.8) | P1 | 立即修 | 改 pointerType 判断或加键盘 |
| 14 | pixi.js 依赖未清(2.9) | P1 | 立即修 | `npm uninstall` |
| 15 | force-engine.js 残留(2.10) | P1 | 立即修 | grep 后删或标 deprecated |
| 16 | window.__sp1State 污染(2.11) | P1 | 错峰修 | 涉及 SP-1,跨 spec 改造 |
| 17 | experiment_window 过半(2.12) | P1 | 立即决 | 二选一:降级 status 或补 P0 |
| 18-29 | 12 项 P2 | P2 | 写 TODO | 不影响功能,下次会话或写 backlog |

**修复顺序建议**:
```
1. 修 1.1(无限循环)— 阻断后续所有调试
2. 修 1.4(wheel)— 一行改
3. 修 2.11/2.13(交互冲突 + desktop 切面)— 同一处代码
4. 修 2.6(Perlin 负数)— 一行改
5. 修 2.9/2.10(pixi.js + force-engine.js)— 治理清理
6. 修 1.3(拖拽)— 核心交互补齐
7. 修 2.7(沉积漂移)— 加 sink force
8. 修 1.2(测试)— 补 3 份最小测试
9. 决 2.12(experiment_window)— 状态机二选一
10. 错峰:2.3/2.4/2.5/2.11(crystallize/几何/面指示器/SP-1 拆分)
```

---

## §6 元教训(完成感幻觉)

> cross-review 方法论 §7 要求每份 audit 暴露"完成感幻觉"。

### 6.1 "status: sediment" ≠ "已审查沉淀"

本 spec 在 frontmatter 标 `status: sediment`(设计已凝固),但:
- `docs/audit/` 只有 SP-1 一份报告,本 spec **0 份 audit**
- `tests/` 36 份测试,**0 份**覆盖 topology/convex-hull/force-3d
- spec §7 验收 9 条,硬性未达成至少 4 条(拖拽/crystallize/6 几何/沉积漂移)

**教训**:"sediment" 是状态机声明,不是事实。状态机推进时若不把"cross-review 报告存在"作为前置门禁,状态字段就是自我欺骗。本报告即填补该缺口,但根本修复是 `check:spec-topology` 加规则:`status: sediment` 必须有对应 audit 文件。

### 6.2 "spec 已凝固" ≠ "代码已对齐"

spec frontmatter `status: sediment` 表示"设计已凝固",但代码与 spec 多处 drift:
- Perlin 噪声 → sin 伪随机(2.6)
- 面指示器是小魔方 → 文字标签(2.5)
- 6 种几何 → 1 种(2.4)
- 沉积漂移 2px/帧 → 静止粒子(2.2)

**教训**:"设计凝固"是文档状态,"代码对齐"是工程状态,二者不可混用。spec 标 sediment 时应同时跑 `check:spec-drift` 验证代码 drift;否则"凝固"只是文档层面的自我安慰。

### 6.3 "experiment_window" 是日历,不是进度

spec 写 `experiment_window: 2026-07-05 ~ 2026-07-12`(7 天),今天 07-07(第 3 天),但 crystallize/拖拽/6 几何/沉积漂移/测试全未完成,且已提前标 sediment。

**教训**:`experiment_window` 字段若不与"窗口结束时必须 audit + 验收"挂钩,就是装饰性日历。建议在 cross-review §6.2 补充:`experiment_window` 结束日触发自动 audit 检查;未通过则 spec 强制降级回 `focus`。

### 6.4 "scope.files 不完整" = 审查盲区的元问题

spec `scope.files` 只列 2 个文件,但实际代码涉及 7+ 文件。本审查若机械按 scope.files 走,会漏掉 `src/sim/force-3d.js`、`src/main.js`、`src/render/sediment-layer.js` 等关键消费方。

**教训**:cross-review §2.1 派 agent 时强调"列出本次审查的具体路径",但若 spec 自身的 scope 不完整,审查范围天然不全。建议 cross-review §7 模板加一条:audit 报告必须**反向校验 spec scope.files 完整性**,发现漏列即作为 P1 治理问题上报。

### 6.5 任务来源本身可能 drift(元教训的元教训)

本任务描述里写"读相关代码:src/topology/ 目录(cube-camera.js, convex-hull.js, force-3d.js) + src/sim/force-3d.js" — 但 `src/topology/force-3d.js` **已不存在**(`src/topology/CLAUDE.md` L8 明确"3D 力导向仿真已废弃 — P0-4 合并时删除,生产代码使用 src/sim/force-3d.js 的 createSim3D")。任务来源带着过时信息。

**教训**:agent 接到任务时,即使任务描述给定了文件清单,也必须用 LS/Glob 反向校验文件存在性。任务来源 ≠ 事实;只有文件系统是事实。这也是 cross-review §1.1"单视角盲区"的体现 — 任务下发者的盲区被审查员打破。

---

## 附录:审查视角正交性检查

| 视角 | 主要查 | 不查 |
|---|---|---|
| 代码审查员 | 代码不变式 / spec drift / bug | 治理门禁 / 状态机 |
| 架构审查员 | 模块边界 / scope / 数据流 | 测试存在性 / 门禁脚本 |
| 工程治理审查员 | cross-review 合规 / 测试覆盖 / 状态机 | 具体 bug / 视觉创新 |

**正交性验证**:三视角无重叠任务,但发现的问题有交叉(如 1.1 无限循环同时被代码视角和架构视角发现)。合并后已去重。

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
