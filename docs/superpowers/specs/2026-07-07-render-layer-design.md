---
id: render-layer
title: 渲染层（Three.js 场景 / 视角总线 / 面板 / 工具）
status: sediment
phase: experiment            # P2-1: 视角总线/面板栈已实施,3D 模块持续演进
experiment_window: 2026-07-07 ~ 2026-07-21
layer: L3-implementation
scope:
  global: false
  modules: [src/render, src/ui]
  files: []
  lines: []
priority: 70
created: 2026-07-07
updated: 2026-07-07
inherits-from:
  - topological-awareness-space
  - core-data-model
# P2-1: kanban-layered-space 仍为 draft (设计已凝固但未实施)
# 移除 inherits-from, 改为 references (非强制继承, 仅参考其设计)
references:
  - kanban-layered-space
supersedes: []
non-negotiable:
  - "视角总线（viewport-state）是单一真相源，所有渲染模块只读不写"
  - "面板栈（panel-stack）协调单开，所有面板必须先注册"
  - "3D 模块只通过 viewport-state 读取选中/相机状态，禁止直接修改 camera 矩阵"
---

# 渲染层规约 — Three.js 场景 / 视角总线 / 面板 / 工具

> 把 src/render/ 下 36 个文件的契约统一形式化。
> 视角总线（viewport-state）+ 面板栈（panel-stack）是两条最稳定的契约轴；所有模块围绕它们组织。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 状态 | **Draft v0.1** |
| 优先级 | P0 底座（视角总线/面板栈）+ P1 演进（3D 实体/特效/工具） |
| 前置依赖 | 核心数据模型 spec（已就位）+ 拓扑与仿真 spec（已就位） |

---

## §0 原则

1. **视角总线为单一真相源**：所有"我看到了什么"统一从 `viewport-state.read()` 读取
2. **面板栈协调单开**：所有面板必须先注册到 `panel-stack`，单开 vs 瞬态有明确区分
3. **3D 模块只读不写**：节点/边/分区/沉积通过 `viewport-state` 读取选中/相机状态，禁止直接修改 camera 矩阵
4. **dispose 显式释放**：geometry/material/texture 必须显式 dispose，避免泄漏

---

## §1 渲染骨架（R-1）

### 1.1 canvas.js（唯一入口）
- 初始化 Three.js 场景、相机、renderer
- 接管 DOM 容器，绑定 resize 与 input 事件
- 装配 cube-camera、convex-hull、sim、yjs 等外部模块

### 1.2 scene.js（场景工厂）
- `createScene(domElement)` → 唯一创建入口
- 不得直接 `new THREE.Scene()`，必须经工厂
- resize 走 viewport-state 总线

---

## §2 视角总线与模式（R-2）

### 2.1 共享文件
- [viewport-state.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/viewport-state.js) — 单一真相源（订阅总线）
- [viewport-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/viewport-bridge.js) — 总线桥接
- [canvas-mode.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/canvas-mode.js) — SP-1 双模式状态机
- [observe-views.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js) — 观察模式三视图（卡片/看板/时间线）
- [shape-indicator.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/shape-indicator.js) — 形状哲学可视化

### 2.2 关键约束
- 写仅通过 `update/updateBatch`，受 `lockUpdates` 保护
- `cameraMood / wholesomeness / derivedShape` 在总线内派生，模块禁止重算
- 信号列表（订阅字段）由 viewport-state 统一管理

---

## §3 面板系统（R-3）

### 3.1 共享文件
- [panel-stack.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/panel-stack.js) — 单开面板协调器（不可变 schema）
- [overlay-panel.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/overlay-panel.js) — 浮动面板基类
- [outside-click.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/outside-click.js) — 空白点击关闭

### 3.2 具体面板
- detail-panel.js — 念头详情
- edge-panel.js — 边编辑
- crystal-panel.js — 结晶入口
- action-panel.js — 行动萃取
- copilot-panel.js — 灵感助手
- zone-panel.js — 分区管理
- help-panel.js — 按键说明
- export-panel.js — 导出导入

### 3.3 关键约束
- 所有面板必须先注册到 `panel-stack`
- `SINGLETON_IDS` 集合决定单开语义（同一 ID 打开第二个会关闭第一个）
- 瞬态面板（detail/edge/picker/contemplate）不入栈，可叠加
- `outside-click` 与 `Esc / long-press` 必触发 `closeAll`

---

## §4 3D 实体与特效（R-4）

### 4.1 几何实体
- [thought-sphere.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/thought-sphere.js) — 念头 3D 球体
- [thought-node.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/thought-node.js) — 念头 DOM 节点
- [edge-line.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/edge-line.js) — 边几何绘制
- [zone-mesh.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/zone-mesh.js) — 分区 3D 可视化
- [hull-mesh.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/hull-mesh.js) — 凸包网格
- [sediment-layer.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/sediment-layer.js) — 沉积层

### 4.2 特效
- [crystallize-fx.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/crystallize-fx.js) — 结晶特效
- [ambient-life.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/ambient-life.js) — 存在感引擎

### 4.3 关键约束
- 节点/边/分区/沉积只通过 `viewport-state` 读取选中/相机状态
- 特效（crystallize/ambient-life）禁止直接修改 camera 矩阵，只能 push 时间参数
- dispose 必须显式释放 geometry/material/texture

---

## §5 工具与冥想（R-5）

### 5.1 工具
- [toolbar.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/toolbar.js) — 工具条
- [quick-add.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/quick-add.js) — 快速录入
- [command-palette.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/command-palette.js) — 命令面板
- [global-search.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/global-search.js) — 全局搜索
- [voice-capture.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/voice-capture.js) — 语音录入
- [relation-picker.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/relation-picker.js) — 关系选择器

### 5.2 冥想/觉察
- [contemplate-overlay.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/contemplate-overlay.js) — 冥想浮层
- [reunion-toast.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/reunion-toast.js) — 重逢提示
- [awareness-hud.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/awareness-hud.js) — 觉察 HUD

### 5.3 关键约束
- 所有快捷键统一在 toolbar 注册表派发
- quick-add / command-palette / global-search 共享同一 fuzzy matcher
- voice 仅在能力检测通过时挂载（避免 SSR / 无麦克风时崩溃）

---

## §6 横切关注（R-6）

- [a11y.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/a11y.js) — 无障碍（announce / keymap / focus-trap）
- [error-handler.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/error-handler.js) — 白屏恢复 + 模块级 try/catch 包裹

### 6.1 关键约束
- 所有面板必须消费 a11y.js 提供的 announce/keymap
- error-handler 负责全局异常捕获，避免单模块崩溃导致白屏

---

## §7 文件状态盘点

| 模块 | 状态 | 备注 |
|---|---|---|
| R-2 视角总线 | 🟢 底座 | viewport-state 不可变 schema |
| R-3 面板栈 | 🟢 底座 | panel-stack 不可变 schema |
| R-1 渲染骨架 | 🔵 沉淀 | 稳定但仍演进 |
| R-4 3D 实体 | 🔵 沉淀 | 几何/特效正在迭代 |
| R-5 工具与冥想 | 🔵 沉淀 | 多数已稳定，voice/awareness 仍实验 |
| R-6 横切 | 🔵 沉淀 | a11y/error-handler 已稳定 |

---

## §8 已知缺口与未来拆分建议

1. **本 spec 是 umbrella**，未来如需进一步细分，建议拆为：
   - R-2.视角总线契约（最严，影响最大）
   - R-3.面板系统契约（单开 vs 瞬态的边界）
   - R-4.3D 实体几何（Three.js 实现细节）
2. **观测**：C5 数量多但都是 DOM 浮层，可合一
3. **风险**：voice-capture / awareness-hud 依赖浏览器能力，未在所有环境下测试

---

## §9 变更协议

[PROTOCOL]: 任何对 §1～§8 的修改必须：
1. 同步更新对应源文件顶部 `[INPUT]/[OUTPUT]/[POS]` 注释
2. 同步更新 `src/render/CLAUDE.md` 成员清单
3. 若影响 SINGLETON_IDS 或瞬态面板列表，同步更新 panel-stack
4. 若新增信号字段，同步更新 viewport-state
5. 在 PR 描述中标注本 spec 是否需要 bump 到 v0.2

---

## §10 关联代码（按集群分组）

- **R-1**：[canvas.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/canvas.js)、[scene.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/scene.js)
- **R-2**：[viewport-state.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/viewport-state.js)、[viewport-bridge.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/viewport-bridge.js)、[canvas-mode.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/canvas-mode.js)、[observe-views.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/observe-views.js)、[shape-indicator.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/shape-indicator.js)
- **R-3**：[panel-stack.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/panel-stack.js)、[overlay-panel.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/overlay-panel.js)、[outside-click.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/outside-click.js)、8 个 panel
- **R-4**：[thought-sphere.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/thought-sphere.js)、[thought-node.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/thought-node.js)、[edge-line.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/edge-line.js)、[zone-mesh.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/zone-mesh.js)、[hull-mesh.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/hull-mesh.js)、[sediment-layer.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/sediment-layer.js)、[crystallize-fx.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/crystallize-fx.js)、[ambient-life.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/ambient-life.js)
- **R-5**：[toolbar.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/toolbar.js)、[quick-add.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/quick-add.js)、[command-palette.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/command-palette.js)、[global-search.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/global-search.js)、[voice-capture.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/voice-capture.js)、[relation-picker.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/relation-picker.js)、[contemplate-overlay.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/contemplate-overlay.js)、[reunion-toast.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/reunion-toast.js)、[awareness-hud.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/awareness-hud.js)
- **R-6**：[a11y.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/a11y.js)、[error-handler.js](file:///e:/魔方心厦/thoughtspace-notes/src/render/error-handler.js)

外加 [src/ui/toolbar.js](file:///e:/魔方心厦/thoughtspace-notes/src/ui/toolbar.js) 跨 R-5 复用。