---
id: topology-sim
title: 拓扑与仿真层（3D 力导向 / 凸包 / 魔方式相机）
status: sediment
phase: experiment            # P0-1 (2026-07-07): audit 证实 5 核心函数缺失 + 温度→Y 拉拽未实现,从 implemented 回退到 experiment
layer: L3-implementation
scope:
  global: false
  modules: [src/topology, src/sim]
  files:
    - src/topology/cube-camera.js
    - src/topology/convex-hull.js
    - src/sim/force-3d.js
  lines: []
priority: 75
created: 2026-07-07
updated: 2026-07-07
inherits-from:
  - topological-awareness-space
  - core-data-model
supersedes: []
decisions:
  - id: TSIM-001
    statement: "唯一允许的物理→持久化写回路径在 main.js rebuilder，origin='sim'"
    scope: src/main.js
  - id: TSIM-002
    statement: "温度→Y 拉拽：targetY = bottom + (top-bottom) * clamp(temperature, 0, 1)"
    scope: src/sim/force-3d.js
non-negotiable:
  - "温度→Y 拉拽的语义必须保留（核心心智模型）"
  - "cube-camera 的 6 面语义（意识剖面/低频区/鸟瞰/潜意识深渊/概念扩散 ×2）"
---

# 拓扑与仿真层规约 — 3D 力导向 / 凸包 / 魔方式相机

> 把 src/topology/ 与 src/sim/ 的职责凝成一份可执行规约。
> 清理由历史 SP-x 重构遗留的双实现并轨（force-3d.js 两份）与孤儿代码（force-engine.js）。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 状态 | **Draft v0.1** |
| 优先级 | P0 底座（Active 模块）+ P2 待迁移（topology/force-3d.js） |
| 前置依赖 | 拓扑意识空间 spec（已就位）+ 核心数据模型 spec（已就位） |

---

## §0 术语表

| 术语 | 含义 |
|---|---|
| 念头（Thought） | 节点，带 `{id, x, y, z, vx, vy, vz, mass, temperature, infoLevel}` |
| 边（Edge） | `{fromId, toId}` 关系，通过 `idToNode` 索引 |
| 力导向层（ForceSim） | 3D 物理仿真，分配念头最终坐标 |
| 拓扑层（TopologyShell） | 凸包 + 相机控制，几何/认知层 |
| reheat | α 重置，让物理过程再次持续 |
| keepAlive | α 不跌破 minAlpha，允许温度等慢变量持续生效 |
| setLayout | 切换初始布局模式 `circle ⇄ grid` |
| pin / unpin | `fx/fy/fz` 三维固定 / 解固定 |
| 面指示器（FaceIndicator） | 右下角相机面提示 UI |

---

## §1 架构定位

```
+-------------------------- main.js --------------------------+
|  render/* (Three.js scene + UI)                              |
|  persistence/* (Yjs store / undo)                           |
|                                                              |
|  ┌──────── topology/ ────────┐  ┌─────── sim/ ──────┐      |
|  │ cube-camera.js (active)    │  │ force-3d.js        │      |
|  │ convex-hull.js (active)    │  │   + 来自 topology  │      |
|  │ (force-3d.js → 迁出)       │  │   force-3d 的增强  │      |
|  └────────────────────────────┘  └────────────────────┘      |
+--------------------------------------------------------------+
```

**职责划分**：
- `src/sim/`：动力学，仅依赖 `d3-force-3d` 与 `core/*` 类型，无 DOM / 无 Three
- `src/topology/`：几何外壳与相机控制，依赖 Three.js 但不知 Yjs
- 两者通过 main.js 装配，通过 yjs tick 事件驱动写回

---

## §2 模块契约

### 2.1 src/sim/force-3d.js（Active + 待合并 topology 版）

#### API（导出）

```js
export function createSim3D(thoughts, edges, options = {});
// → { sim, nodes, idToNode }
export function restartSim(sim, alpha = 0.5);
export function stopSim();
export function pinSimNode(sim, id, x, y, z);
export function unpinSimNode(sim, id);
export function setSimLayout(sim, mode);
export function reheatSim(sim, alpha = 0.6);
export function keepSimAlive(sim, min = 0.15);
```

#### options

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `linkDistance` | number | 150 | 弹簧自然长度 |
| `repulse` | number | -200 (adaptive) | 库强 |
| `center` | [x,y,z] | [0,80,0] | 中心点 |
| `collide` | number | 30 | 球形碰撞半径 |
| `alphaDecay` | number | 0.015 | α 衰减率 |
| `temperatureYBounds` | [top,bottom] | [180,-180] | 温度→Y 映射区间 |
| `temperaturePull` | number | 0.012 | 温度拉拽系数 |
| `initialLayout` | 'circle'\|'grid' | 'circle' | 初始布局 |

#### 行为约束

1. 单例：`activeSim` 全局唯一，新 `createSim3D` 会先 `stop` 旧的
2. 温度拉拽：每 tick 计算 `targetY = bottom + (top-bottom) * clamp(temperature, 0, 1)`
3. 信息量→质量：`mass = 0.4 + infoLevel*1.2`
4. setLayout：不允许旧→同值；切换时给每个节点轻推 + reheat(0.6)

### 2.2 src/topology/cube-camera.js

#### 6 面定义

```js
FACES = {
  front:  { pos: [0,0,800],     label: '正面·意识剖面' },
  back:   { pos: [0,0,-800],    label: '背面·低频区' },
  top:    { pos: [0,800,50],    label: '顶面·鸟瞰' },
  bottom: { pos: [0,-800,50],   label: '底面·潜意识深渊' },
  left:   { pos: [-800,0,0],    label: '左面·概念扩散' },
  right:  { pos: [800,0,0],     label: '右面·概念扩散' }
}
```

#### API

```js
createCubeCamera(camera, domElement) → {
  update(),
  getCurrentFace(),
  switchTo(faceName),
  onFaceChange(cb),
  getCameraFront()
}
```

#### 行为约束

1. 滑动阈值 `0.3 * min(W,H)`，时间阈值 `dt < 800ms`
2. 缩放阻尼：`|position| ∈ [200, 2000]`
3. 双指捏合只触发缩放，不触发面切换
4. 切换面 lerp 系数 0.12（位置）和 slerp 系数 0.12（朝向）
5. **时序约束**：`onFaceChange` 必须在第一次 `update()` 之前注册

### 2.3 src/topology/convex-hull.js

```js
computeHull(thoughts) → { vertices: Vector3[], faces: number[][], valid: boolean }
```

#### 行为约束

1. `thoughts.length < 4` 直接返回 `{ valid: false }`
2. 失败兜底：`convexHull(points)` 返回空数组时，返回 `{ vertices: points, faces: [], valid: false }`
3. `vertices = thoughts.map(t => [t.x,t.y,t.z])`（原始坐标）
4. `faces` 保留 `convex-hull` 的三元顶点索引结构

### 2.4 src/topology/force-3d.js（To-deprecate）

- 标记 `@deprecated since:2026-07-07`
- 文件顶部加迁移指引：本模块已被 `src/sim/force-3d.js` 合并，请改用 `pinSimNode / setSimLayout / reheatSim`
- 计划在下一次 SP 重构时删除，删除前需 grep 确认零消费

---

## §3 集成约束

### 3.1 main.js 双驱动耦合点

- 唯一允许的"物理→持久化"写回路径：main.js 的 rebuildSim
- 写回必须用 `transact(fn, 'sim')`，**origin 固定为 `'sim'`**
- 在 `α < 0.02` 时早退，避免无限写回 storm

### 3.2 与 temperature 相关的横向约束

- 仿真层做"温度→Y"拉拽（空间维度）
- 渲染层（`render/sediment-layer.js`）基于 temperature 调整透明度与色相（视觉维度）
- 持久化层（`core/thought.js`）负责 temperature 的衰减与刷新语义
- 三层独立修改，通过 yjs `observeDeep` 触发重建

### 3.3 与意识轮廓（凸包）的耦合

- 每次 `yThoughts.observeDeep` 触发 `rebuildScene` 时重新 `computeHull`
- `valid=false` 时保留旧 hull 对象或直接 `scene.remove`，前者更平滑

---

## §4 文件 / 目录治理

### 4.1 落地清单

| # | 动作 | 文件 / 路径 | 验收 |
|---|---|---|---|
| 1 | ✅ 迁移 | topology → sim：`pin/unpin/setLayout/reheat/keepAlive` | P0-2 (2026-07-07) 已补全 5 函数 |
| 2 | ❌ 不删除 | `src/sim/force-engine.js` | P0-4 (2026-07-07): audit 证实仍被 canvas.js + thought-node.js + geometry-cluster.js 消费,是 2D 路径活代码,不是孤儿 |
| 3 | 待迁移完成后删除 | `src/topology/force-3d.js`（迁移完成 + 静默两周后） | grep 零消费 |
| 4 | ✅ 更新 | `src/topology/CLAUDE.md` | 已删除 `force-3d.js` 行 |
| 5 | ✅ 更新 | `src/sim/CLAUDE.md` | P0-4: 标注 force-engine.js 为 2D 路径活代码;force-3d.js 标注 P0-2 已补全 5 函数 |

### 4.2 命名建议（可选）

- 推荐：`topology/` → `scene-control/`（相机+凸包是几何外壳控制，力导向纯仿真放 sim/ 干净）
- 不建议：`sim/` 改名，它是工程通用语

---

## §5 测试与质量门

| 测试 | 方法 |
|---|---|
| `createSim3D` 单例 | 调两次，断言第一次返回的 `sim.alpha() === 0` |
| `pinSimNode` 行为 | 钉住后 10 tick，断言 `n.x === fx` |
| `setLayout` 切换 | 100 tick 后断言坐标均值迁移向新布局中心 |
| `computeHull` 边界 | 0/1/3/4 点全覆盖 |
| `cube-camera.switchTo` 时序 | 先 `update()` 后 `onFaceChange(cb)` 断言 cb 未触发；反过来断言 cb 触发 |

---

## §6 风险与开放问题

1. **d3-force-3d 与自实现动力学在 reheat 语义上不完全等价**：合并时需验证在 d3 上挂 post-tick 回调实现 keepAlive
2. **Orphan `src/sim/force-engine.js` 究竟是不是死代码**：建议先 grep 全 git 历史看是否有过 2D canvas 模式
3. **`cube-camera` 的 `onFaceChanged` 时序**：当前 main.js 安全，但建议把回调改成 `{ onFaceChange(cb){...}; fire(name){} }` 显式主动触发
4. **凸包重算性能**：N 接近 1000 时可能掉帧，建议加 debounce(50ms)+ in-flight 信号量

---

## §7 变更协议

[PROTOCOL]: 变更此 spec 时同步更新 §4.1 落地清单与 §5 测试矩阵。

---

## §8 关联代码

- [cube-camera.js](file:///e:/魔方心厦/thoughtspace-notes/src/topology/cube-camera.js)
- [convex-hull.js](file:///e:/魔方心厦/thoughtspace-notes/src/topology/convex-hull.js)
- [force-3d.js](file:///e:/魔方心厦/thoughtspace-notes/src/topology/force-3d.js)（待迁移）
- [force-3d.js](file:///e:/魔方心厦/thoughtspace-notes/src/sim/force-3d.js)
- [force-engine.js](file:///e:/魔方心厦/thoughtspace-notes/src/sim/force-engine.js)（待删除）