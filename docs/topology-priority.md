# 优先级拓扑表（Topological Priority Registry）

> **单一真相源**：所有 spec / plan / 文件 / 功能 / 规范 当前的优先级与状态。
>
> **每次新增规范时**，必须在本表登记一次 + 设定状态。
> **每次大改动前**，先查本表确认要修改的目标处于哪个状态、对应什么处理规则。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-07 |
| 维护者 | GEB 分形文档系统 |
| 触发更新 | 新增 spec / 大改动前 / 周回顾 |
| 状态机 | 🟢 底座 / 🟡 当前焦点 / 🔵 已沉淀 / ⚪ 已废弃 / 🔴 孤儿 |

---

## §1 状态机定义与处理规则

### 1.1 状态图

```
   ┌─→ 🟢 底座 (Foundation)         ← 几乎不变,修改需走 GEB 完整流程
   │      │
   │      │ 重大变更触发
   │      ▼
   ├─→ 🟡 当前焦点 (Current Focus)  ← 活跃演进,可快速迭代
   │      │
   │      │ 完成/稳定
   │      ▼
   ├─→ 🔵 已沉淀 (Established)      ← 稳定但仍可演进,修改需补丁
   │      │
   │      │ 被新设计替代 或 与新规范冲突
   │      ▼
   ├─→ ⚪ 已废弃 (Deprecated)       ← 不再使用,保留仅供历史查询
   │
   └─→ 🔴 孤儿 (Orphaned)           ← 设计过时/冲突,需明确决策
                  │
                  │ 决策:升级 / 废弃 / 修复
                  ▼
              (回到任一状态)
```

### 1.2 各状态的修改规则

| 状态 | 修改规则 | 风险等级 |
|------|---------|---------|
| 🟢 **底座** | 必须走 GEB 完整流程(spec → plan → implement),且需在 L1 文档更新 | **极高** |
| 🟡 **焦点** | 可直接编辑当前 spec,无需新 spec；但每次改动要更新本表状态 | 中 |
| 🔵 **沉淀** | 修改需写补丁章节（不破坏原 spec）或新 spec 替代 | 中低 |
| ⚪ **废弃** | **禁止修改**,仅供历史查询 | N/A |
| 🔴 **孤儿** | **必须先决策**（升级 / 废弃 / 修复）才能继续 | 极高（决策风险）|

### 1.3 状态转换规则

| 从 | 到 | 触发条件 | 操作 |
|---|---|---|---|
| 🟢 底座 | 🟡 焦点 | 发生重大变更（5+ 文件、跨模块） | 创建新 spec,在本表登记 |
| 🟡 焦点 | 🔵 沉淀 | 验收完成 + 1 周无新需求 | 在 spec §元信息加"状态：已沉淀" |
| 🔵 沉淀 | ⚪ 废弃 | 被新设计替代且无引用 | 在 spec §元信息加"状态：已废弃"+ 本表标记 |
| 🔵 沉淀 | 🔴 孤儿 | 与新规范发生不可调和冲突 | 列入下个会话的孤儿治理议题 |
| ⚪ 废弃 | (任何) | 重新启用 | 创建新 spec,不修改旧 spec |
| 🔴 孤儿 | (任何) | 决策完成 | 在本表登记决策与新状态 |

---

## §2 规范（Spec）状态表

### 2.1 当前 spec 清单与状态

| Spec 文件 | 状态 | 创建 | 关联代码 / 模块 | 备注 |
|---|---|---|---|---|
| `2026-07-05-geb-infrastructure-bootstrap-design.md` | 🟢 底座 | 2026-07-05 | scripts/ 全集 | GEB 分形文档系统的元设计,几乎不变 |
| `2026-07-05-geb-precommit-and-l2-elevation-design.md` | 🟢 底座 | 2026-07-05 | scripts/check-arch.mjs + pre-commit | GEB 实施,守卫架构约束 |
| `2026-07-05-phase-0-lightweight-restructure-design.md` | ⚪ 已废弃 | 2026-07-05 | (已被拓扑空间 spec 替代) | 原 Phase 0 蓝图,被拓扑意识空间重做 |
| `2026-07-05-topological-awareness-space-design.md` | 🔵 沉淀 | 2026-07-05 | src/topology/* + 3D 主空间 | 3D 不规则多面体,已被实现但 SP-3 会进一步扩展 |
| `2026-07-05-trae-mcp-and-project-rules-bootstrap-design.md` | 🟢 底座 | 2026-07-05 | .trae/rules/project_rules.md | TRAE 规则引导,稳定 |
| `2026-07-06-shape-adaptive-views-design.md` | 🟡 焦点 | 2026-07-06 | src/core/shape-resolver.js + shape-indicator.js | 形状哲学,正在实验和修订（T10 语义反转后） |
| `2026-07-07-kanban-layered-space-design.md` | 🔵 沉淀 | 2026-07-07 | src/core/layer-store.js + sort-axis.js + canvas-mode.js + src/main.js + observe-views.js | SP-1 全部完成(T0 数据层 + T1 装配 + T2 UI + T3 测试),506 测试全过 |
| `2026-07-07-core-data-model-design.md` | 🔵 沉淀 | 2026-07-07 | src/core/thought.js + edge.js + zone.js | 核心不可变 schema 契约,底座 |
| `2026-07-07-persistence-yjs-bridge-design.md` | 🔵 沉淀 | 2026-07-07 | src/persistence/* (all files) | Yjs 单一权威源 + bridge 镜像 + 撤销/导入导出契约 |
| `2026-07-07-topology-sim-design.md` | 🔵 沉淀 | 2026-07-07 | src/topology/cube-camera.js + convex-hull.js + src/sim/force-3d.js | 力导向仿真+凸包+魔方相机;force-3d 合并治理完成 |
| `2026-07-07-render-layer-design.md` | 🔵 沉淀 | 2026-07-07 | src/render/* (all files) | 渲染层 umbrella:视角总线/面板栈/3D 实体/工具/横切 |
| `2026-07-07-feature-flag-system-design.md` | 🟡 焦点 | 2026-07-07 | src/runtime/flags/* (all files) | Feature Flag 三态分离 + 回归测试集成 + 5 状态生命周期 |

### 2.2 当前 plan 清单与状态

| Plan 文件 | 状态 | 关联 spec | 备注 |
|---|---|---|---|
| `2026-07-05-geb-infrastructure-bootstrap.md` | 🔵 沉淀 | geb-infrastructure-bootstrap | 已实施 |
| `2026-07-05-geb-precommit-and-l2-elevation.md` | 🔵 沉淀 | geb-precommit-and-l2-elevation | 已实施 |
| `2026-07-05-trae-mcp-and-project-rules-bootstrap.md` | 🔵 沉淀 | trae-mcp-and-project-rules | 已实施 |
| `2026-07-07-sp1-kanban-layered-impl.md` | 🔵 沉淀 | kanban-layered-space | SP-1 全部完成,506 测试全过,详见 [docs/notes/sp1/](docs/notes/sp1/) |

### 2.3 当前 audit 清单与状态

| Audit 文件 | 状态 | 备注 |
|---|---|---|
| `2026-07-05-comprehensive-audit.md` | 🔵 沉淀 | 项目综合审查,已纳入改进路径 |
| `2026-07-05-trae-environment-fit-audit.md` | 🔵 沉淀 | TRAE 环境适配审查,已纳入 |

---

## §3 代码文件状态表

### 3.1 src/core/（核心逻辑层,不应依赖 render）

| 文件 | 状态 | 角色 | 测试数 | 备注 |
|---|---|---|---|---|
| `thought.js` | 🟢 底座 | 念头数据模型 | 29 | 不可变 schema |
| `edge.js` | 🟢 底座 | 边数据模型 | 23 | 不可变 schema |
| `zone.js` | 🟡 焦点 | 用户自定义分区 | 10 | 已接入主流程,SP-3 深度集成念头归属 |
| `index.js` | 🟢 底座 | 桶导出 | - | 自动生成 |
| `action.js` | 🔵 沉淀 | 行为定义 | 19 | 已稳定 |
| `edge.js`（已有,见上）| - | - | - | - |
| `crystallize.js` | 🔵 沉淀 | 结晶算法 | 20 | 已稳定 |
| `geometry-cluster.js` | 🔵 沉淀 | 几何聚类 | 12 | 已稳定 |
| `hydrate-anim.js` | 🔵 沉淀 | 水合动画 | 19 | 已稳定 |
| `insight-copilot.js` | 🔵 沉淀 | 灵感助手 | 6 | 已稳定 |
| `meditation.js` | 🔵 沉淀 | 冥想 | 10 | 已稳定 |
| `reunion.js` | 🔵 沉淀 | 重聚 | 20 | 已稳定 |
| `shape-resolver.js` | 🟡 焦点 | 形状哲学核心 | 20 | T10 语义反转后,默认权重待体感验证 |
| `structure.js` | 🔵 沉淀 | 结构工具 | 6 | 已稳定 |
| `layer-store.js` | 🔵 沉淀 | SP-1 层管理 | 29 | SP-1 完成,已稳定 |
| `sort-axis.js` | 🔵 沉淀 | SP-1 排序哲学 | 43 | SP-1 完成,已稳定 |
| `note.js` | 🔵 沉淀 | 笔记数据模型 | - | 已稳定,L3头部governance修复 |
| `thought-from-note.js` | 🔵 沉淀 | 笔记→念头转换 | - | 已稳定,L3头部governance修复 |

### 3.2 src/render/（渲染层,负责 DOM/Canvas/3D）

| 文件 | 状态 | 角色 | 测试数 | 备注 |
|---|---|---|---|---|
| `canvas.js` | 🔵 沉淀 | 渲染入口 | - | 主入口 |
| `scene.js` | 🔵 沉淀 | Three.js 场景 | - | 已稳定 |
| `thought-sphere.js` | 🔵 沉淀 | 念头球体 3D | - | 已稳定 |
| `hull-mesh.js` | 🔵 沉淀 | 凸包网格 | - | 已稳定 |
| `instanced-thoughts.js` | 🔵 沉淀 | 念头实例化渲染 | - | 已稳定 |
| `zone-mesh.js` | 🔵 沉淀 | 分区 3D 可视化 | - | 已稳定 |
| `sediment-layer.js` | 🔵 沉淀 | 沉积层 | - | 已稳定 |
| `crystallize-fx.js` | 🔵 沉淀 | 结晶特效 | - | 已稳定 |
| `viewport-state.js` | 🟢 底座 | 统一视角总线 | 28 | 不可变 schema |
| `viewport-bridge.js` | 🔵 沉淀 | 总线桥接 | 9 | 已稳定 |
| `canvas-mode.js` | 🔵 沉淀 | SP-1 双模式状态机 | 15 | SP-1 完成 |
| `ambient-life.js` | 🔵 沉淀 | 存在感引擎 | - | 已稳定 |
| `thought-node.js` | 🔵 沉淀 | 念头节点渲染交互 | - | 已稳定 |
| `edge-line.js` | 🔵 沉淀 | 边几何绘制 | - | 已稳定 |
| `panel-stack.js` | 🟢 底座 | 单开面板协调器 | 6 | 不可变 schema |
| `overlay-panel.js` | 🔵 沉淀 | 浮动面板基类 | - | 已稳定 |
| `outside-click.js` | 🔵 沉淀 | 空白点击关闭 | - | 已稳定 |
| `detail-panel.js` | 🔵 沉淀 | 念头详情面板 | - | 已稳定,拆分后保留面板结构+字段编辑 |
| `detail-markdown.js` | 🔵 沉淀 | 念详情 markdown 渲染 | - | 拆分自 detail-panel.js,markdownToHtml+正文编辑器 |
| `edge-panel.js` | 🔵 沉淀 | 边编辑面板 | - | 已稳定 |
| `crystal-panel.js` | 🔵 沉淀 | 结晶入口面板 | - | 已稳定 |
| `action-panel.js` | 🔵 沉淀 | 行动萃取面板 | - | 已稳定 |
| `copilot-panel.js` | 🔵 沉淀 | 灵感助手面板 | - | 已稳定,拆分后保留面板结构+事件 |
| `copilot-preview.js` | 🔵 沉淀 | 灵感助手预览渲染 | - | 拆分自 copilot-panel.js,.cp-preview 卡片生成 |
| `zone-panel.js` | 🔵 沉淀 | 分区管理面板 | - | 已稳定,拆分后保留列表+入口 |
| `zone-form.js` | 🔵 沉淀 | 分区表单 | - | 拆分自 zone-panel.js,新建/编辑表单 |
| `help-panel.js` | 🔵 沉淀 | 按键说明面板 | - | 已稳定 |
| `export-panel.js` | 🔵 沉淀 | 导出导入面板 | - | 已稳定 |
| `observe-views.js` | 🔵 沉淀 | 观察模式入口 | 2 | SP-1 完成,拆分后保留入口+事件+fireReorder |
| `observe-state.js` | 🔵 沉淀 | 观察模式状态管理 | - | 拆分自 observe-views.js,排序轴/层/模式状态 |
| `observe-render.js` | 🔵 沉淀 | 观察模式渲染 | - | 拆分自 observe-views.js,卡片/看板/时间线 DOM |
| `shape-indicator.js` | 🔵 沉淀 | 形状哲学可视化 | 21 | SP-1 完成 |
| `toolbar.js` | 🔵 沉淀 | 工具条 | - | 已稳定 |
| `quick-add.js` | 🔵 沉淀 | 快速捕获浮层 | - | 已稳定 |
| `command-palette.js` | 🔵 沉淀 | 命令面板 | - | 已稳定 |
| `global-search.js` | 🔵 沉淀 | 全局搜索 | - | 已稳定 |
| `relation-picker.js` | 🔵 沉淀 | 关系选择器 | - | 已稳定 |
| `voice-capture.js` | 🔵 沉淀 | 语音录入 | - | 已稳定 |
| `contemplate-overlay.js` | 🔵 沉淀 | 静观计时 | - | 已稳定 |
| `reunion-toast.js` | 🔵 沉淀 | 重逢提示 | - | 已稳定 |
| `error-handler.js` | 🔵 沉淀 | 全局错误捕获 | - | 已稳定 |
| `awareness-hud.js` | 🔵 沉淀 | 觉察 HUD | - | 已稳定 |
| `a11y.js` | 🔵 沉淀 | 无障碍 | 8 | 已稳定 |
| `breath-particles.js` | 🔵 沉淀 | 节律粒子背景 | - | 200颗环形粒子 sin/cos 微波动 |
| `dust.js` | 🔵 沉淀 | 远景星尘 | - | 800颗 Points 空间感背景 |
| `frame.js` | 🔵 沉淀 | 框架对象基类 | - | 3D Plane+CanvasTexture+吸附盒+拖拽手柄 |
| `frame-drag.js` | 🔵 沉淀 | 框架拖拽+吸附 | - | raycast命中+重力井30px snap |
| `snap-points.js` | 🔵 沉淀 | 吸附位+重力井 | - | getNearestSnap+createSnapMarkers |
| `infinite-grid.js` | 🔵 沉淀 | 无限网格 | - | z=0平面 GridHelper 主背景层 |
| `interaction.js` | 🔵 沉淀 | 三件套交互 | - | wheel缩放+空白平移+拖Thought |
| `sediment-plane.js` | 🔵 沉淀 | 沉积层平面 | - | y<-50半透明+fog 顶点着色 |

### 3.3 src/topology/（3D 拓扑层）

| 文件 | 状态 | 角色 | 备注 |
|---|---|---|---|
| `cube-camera.js` | 🔵 沉淀 | 立方体相机 | 已稳定 |
| `convex-hull.js` | 🔵 沉淀 | 凸包计算 | 已稳定 |

> 注: force-3d.js 自有实现已于 2026-07-07 删除 (P0-4 合并),生产使用 src/sim/force-3d.js (基于 d3-force-3d)。

### 3.4 scripts/

| 文件 | 状态 | 角色 | 备注 |
|---|---|---|---|
| `check-arch.mjs` | 🟢 底座 | 架构守卫 | GEB 工具 |
| `check-geb.mjs` | 🟢 底座 | GEB 守卫 | GEB 工具 |
| `check-note-links.mjs` | 🔵 沉淀 | **注释时间拓扑门禁** | @note 格式 + 双向验证 + 生成 .notes-link-graph.json |
| `check-topology.mjs` | 🔵 沉淀 | **拓扑表一致性门禁** | 校验拓扑表与实际文件/spec 的对应关系 |
| `check-spec-coverage.mjs` | 🔵 沉淀 | **Spec 覆盖率门禁** | 检查代码与 spec 的关联覆盖率 |
| `check-spec-topology.mjs` | 🔵 沉淀 | **Spec 拓扑规则门禁** | 检查 spec 的层、scope、overrides、inherits、conflicts 拓扑规则 |
| `check-flag-topology.mjs` | 🔵 沉淀 | **Feature Flag 拓扑门禁** | 检查 flag 引用一致性、scope、lifecycle、regression_subset |
| `check-non-negotiable.mjs` | 🔵 沉淀 | **Non-negotiable 代码语义校验** | P0-6:把 spec 的 hard constraint 自动映射为代码语义检查 |
| `check-orphans.mjs` | 🔵 沉淀 | **孤儿代码 + madge 循环检测** | P1-1:补充 depcruise 漏掉的动态 import 循环 + 检测无引用文件 |
| `check-typecheck.mjs` | 🔵 沉淀 | **渐进式 tsc 类型检查** | P1-2:tsc --noEmit --checkJs,统计类型错误数(渐进模式,不阻塞 commit) |
| `check-test-spec-linkage.mjs` | 🔵 沉淀 | **测试-决策溯源** | P1-4:把测试失败按 spec 决策 ID 分组,定位违反哪条决策 |
| `check-spec-drift.mjs` | 🔵 沉淀 | **Spec 决策漂移检测** | P2-4:实验性 spec 的 decision 数值与代码实际值对比, 超出 drift_tolerance → WARN |
| `generate-flag-registry.mjs` | 🔵 沉淀 | **Flag registry 自动生成** | 从 spec frontmatter 抽取 flags: 字段生成 registry.js |
| `generate-holo-index.mjs` | 🔵 沉淀 | **全息索引生成** | 生成代码↔spec↔原文三层环形映射索引 |
| `generate-holo-report.mjs` | 🔵 沉淀 | **全息仪表盘生成** | P1-3:基于 .holo-index.json 生成决策时间线 + 孤儿清单 + 关联分类 |
| `bootstrap.mjs` | 🟢 底座 | 引导脚本 | GEB 工具 |
| `install-hooks.mjs` | 🟢 底座 | 安装 git hooks | GEB 工具 |
| `sync-mcp-config.mjs` | 🟢 底座 | 同步 MCP 配置 | GEB 工具 |
| `verify-trae-rules.mjs` | 🟢 底座 | 验证 TRAE 规则 | GEB 工具 |
| `hooks/pre-commit` | 🟢 底座 | Git 钩子 | GEB 工具 |

### 3.4.5 src/runtime/（运行时基础设施层）

| 文件 | 状态 | 角色 | 备注 |
|---|---|---|---|
| `flags/registry.js` | 🟡 焦点 | Flag 静态注册表 | 从 spec frontmatter 自动生成 |
| `flags/source-chain.js` | 🟡 焦点 | Flag 4 层 lookup（URL/localStorage/Yjs/static） | 运行时配置 |
| `flags/variant.js` | 🟡 焦点 | cohort / rollout 解析 | A/B 灰度 |
| `flags/kill-switch.js` | 🟡 焦点 | 紧急熔断 | KILL_<DOMAIN> 命名 |
| `flags/index.js` | 🟡 焦点 | 对外 API | isOn/getVariant/setOverride |
| `flags/bootstrap.js` | 🟡 焦点 | flag resolver 注入 | 一次性副作用 |

### 3.5 文档层

| 文件 | 状态 | 角色 | 备注 |
|---|---|---|---|
| `/CLAUDE.md` | 🟢 底座 | L1 项目宪法 | 极稳定,架构变更才更新 |
| `/src/core/CLAUDE.md` | 🟢 底座 | L2 核心层地图 | 文件增删时更新 |
| `/src/render/CLAUDE.md` | 🟢 底座 | L2 渲染层地图 | 文件增删时更新 |
| `/docs/superpowers/specs/CLAUDE.md` | 🟢 底座 | L2 spec 索引 | 文档系统规则 |
| `/docs/superpowers/specs/README-TOPOLOGY.md` | 🟡 焦点 | Spec 拓扑规则系统实施指南 | 多层非绝对指导性的元规则与裁决算法 |
| `/docs/superpowers/plans/CLAUDE.md` | 🟢 底座 | L2 plan 索引 | 文档系统规则 |
| `/docs/superpowers/CLAUDE.md` | 🟢 底座 | L2 superpowers 索引 | 文档系统规则 |
| `/docs/audit/CLAUDE.md` | 🟢 底座 | L2 audit 索引 | 文档系统规则 |
| `/docs/topology-priority.md` | 🟢 底座 | L1.5 优先级拓扑表 | 治理工具,稳定 |
| `/docs/DEBUG_NOTES.md` | 🟢 底座 | L2 调试速查 | "症状→怀疑清单"模式 |
| `/docs/notes/README.md` | 🟢 底座 | L2.5 笔记系统协议 | 按需加载模式 |
| `/docs/notes/sp1/` | 🟢 底座 | SP-1 笔记 | pitfalls/decisions/data-flow/integration-points |
| `/docs/methodology/README.md` | 🟢 底座 | **L1.6 编程方法论索引** | **跨项目可复用**,7 篇方法 |
| `/docs/methodology/01-design-thinking.md` | 🟢 底座 | 设计思维方法 | brainstorming + 整合 |
| `/docs/methodology/02-spec-driven-dev.md` | 🟢 底座 | spec → plan 驱动 | spec 模板 + plan 模板 |
| `/docs/methodology/03-topology-priority.md` | 🟢 底座 | 拓扑表方法 | 5 状态机 |
| `/docs/methodology/04-on-demand-notes.md` | 🟢 底座 | 按需加载笔记 | 4 类笔记 + 注释约定 |
| `/docs/methodology/05-debug-systematic.md` | 🟢 底座 | 系统性调试 | trace data flow |
| `/docs/methodology/06-arch-guard.md` | 🟢 底座 | 架构守卫 | CI + 测试金字塔 |
| `/docs/methodology/07-sp1-case-study.md` | 🟡 焦点 | SP-1 案例 | 方法怎么一起用(项目特化) |
| `/docs/methodology/08-cross-review.md` | 🟢 底座 | **跨视角并行审查** | agent team 强项制度化;SP 收尾阈值引用 |
| `/docs/methodology/09-time-topology.md` | 🟢 底座 | **时间拓扑精度** | @note since 时间锚点;与 03 空间拓扑时空对偶;三环联想(GEB 怪圈);L1-8 宪法声明 |
| `/docs/audit/2026-07-07-sp1-quality-review.md` | 🔵 沉淀 | SP-1 审查报告存档 | 08 方法的首次实践 |

---

## §4 原则 / 教义 / 架构约束（不可修改的规则）

> 此节是"底座中的底座"。修改任何一条必须先更新 CLAUDE.md §ARCHITECTURE / §DOCTRINE。

### 4.1 架构约束

| 约束 | 出处 | 状态 |
|---|---|---|
| `src/core/**` 禁止 import 任何渲染库 | CLAUDE.md §ARCHITECTURE | 🟢 底座 |
| 单文件 ≤800 行（Phase 0 阶段 core ≤300 行） | CLAUDE.md §quality | 🟢 底座 |
| L1/L2/L3 三层分形结构 | CLAUDE.md §ARCHITECTURE | 🟢 底座 |
| 数据层与视图层分离 | CLAUDE.md §DOCTRINE | 🟢 底座 |

### 4.2 形状哲学（CLAUDE.md §1.0）

| 原则 | 出处 | 状态 |
|---|---|---|
| 5 态语义反转:individuality 高→方 | spec/2026-07-06 + T10 | 🟡 焦点（仍在调权重） |
| 数据层不变,形状是视图决策 | spec/2026-07-06 §2.1 | 🟢 底座 |
| 形状切换须感官联动（视觉→光标/音频/触觉）| spec/2026-07-06 §2.4 | 🔵 沉淀（仅视觉已实现,其他未做） |
| 失败兜底:实验不通过则回退"手动切形态"开关 | spec/2026-07-06 | 🟡 焦点（未实施,但已承诺） |

### 4.3 SP-1 原则（CLAUDE.md §2.0）

| 原则 | 出处 | 状态 |
|---|---|---|
| **SP-1.P0（最高优先级）**:不压制信念排序 | spec/2026-07-07 | 🟢 底座（已形式化为代码） |
| **SP-1.P1**:多轴能力存在但默认隐藏 | spec/2026-07-07 | 🟢 底座（已形式化为代码） |
| **SP-1 几何学原理**:Y 轴天然映射屏幕上下 | spec/2026-07-07 | 🟡 焦点（代码完成,UI 实现时再绑） |
| 排序 = 多轴并列 + 拖动记录 = 信念轨迹 | spec/2026-07-07 | 🟢 底座 |

### 4.4 GEB 文档哲学

| 原则 | 出处 | 状态 |
|---|---|---|
| 代码即文档,文档即代码,两相同构 | CLAUDE.md §DOCTRINE | 🟢 底座 |
| 双重自证:文档证明代码 / 代码证明文档 | CLAUDE.md §DOCTRINE | 🟢 底座 |
| 修改任何文件必须在 L3 头部注释更新 | CLAUDE.md §ARCHITECTURE | 🟢 底座 |

---

## §5 决策治理（孤儿议题）

> 🔴 孤儿 = 设计过时 / 与新规范冲突 / 状态不明。每 1-2 周需要做决策。

| 议题 | 描述 | 状态 | 决策建议 |
|---|---|---|---|
| **phase-0-lightweight-restructure-design.md** | 原 Phase 0 蓝图,被拓扑意识空间 spec 完全重做 | ⚪ 已废弃 | 已决定废弃,保留仅供历史 |
| **zone.js 与 layer-store.js 关系** | zone 是 3D 球形分区(已有),layer 是用户自定义意识层级(SP-1 新增);两者关系未明确 | 🔵 已决策 | **结论:正交互补,互不替代**。Layer=意识深度(Y轴),Zone=内容主题(X-Z平面)。详见 [why-layer-orthogonal-to-zone](notes/sp1/decisions.md#why-layer-orthogonal-to-zone) |
| **shape-resolver 默认权重** | T10 后 ratio=0.6 / hull=0.25 / dwell=0.15,但 50% 选 100% 才落到 discrete_with_metric,可能需要调 | 🟡 焦点 | 待体感验证后调整,先移到 backlog |
| **failure fallback "手动切形态"开关** | spec 承诺实验不通过时回退,目前未实施 | 🟡 焦点 | 待形状哲学稳定后实施 |
| **观察模式 ↔ canvas-mode 关系** | observe-mode(cards/kanban/timeline) 与 canvas-mode(background/block) 正交,但 UI 上怎么组合 | 🔵 已决策 | **结论:正交,任意组合**。canvas-mode=block 时忽略 observe-mode。详见 [why-canvas-mode-orthogonal-to-observe-mode](notes/sp1/decisions.md#why-canvas-mode-orthogonal-to-observe-mode) |
| **SP-2 何时启动** | 内容块数据模型(嵌套笔记 + 富内容) 是独立 sub-project | 🟡 焦点 | SP-1 UI 完成或暂停时启动 |

---

## §6 治理节奏

### 6.1 何时更新本表

| 触发事件 | 操作 |
|---|---|
| 新增 spec | 在 §2 加一行,初始状态 🟡 焦点 |
| 新增文件 | 在 §3 加一行,初始状态 🟡 焦点 |
| 新增原则 | 在 §4 加一行,初始状态 🟡 焦点 |
| 状态转换 | 修改对应行,记录日期 |
| 发现孤儿 | 在 §5 加一行,标记 🔴 孤儿 |
| 完成一个里程碑 | 1-2 周回顾:把完成的 🟡 → 🔵 沉淀；把过时的 🔵 → ⚪ 废弃 |

### 6.2 健康指标

每两周检查一次：

| 指标 | 健康范围 | 当前 |
|---|---|---|
| 🟡 焦点数量 | 1-3 个（过多 = 注意力分散）| **10 个**（zone.js + shape-resolver.js + 6 个 flags/* 文件 + README-TOPOLOGY.md + 07-sp1-case-study.md,13 个 check-* 脚本已沉淀）|
| 🔴 孤儿数量 | 0-2 个 | **0 个**（zone vs layer 关系已决策）|
| ⚪ 废弃数量 | 历史保留,新增应少见 | **0 个**（§3 代码文件表无 ⚪ 已废弃,仅 spec 表 phase-0 为 ⚪）|
| 🟢 底座数量 | 10-20 个（稳定底座）| **32 个**（实际统计值）|
| 🔵 沉淀数量 | 30-60 个（稳定主体）| **79 个 (+src/v2/render/expected-calculator.js, S2.12 实做)**（+src/v2/debug/debug-overlay.js, S2.11 实做）|

> **当前健康**：健康。🟡 焦点从 23 个减到 10 个(13 个 check-* 脚本沉淀),🔴 孤儿清零。P1-2 机器检测已接入,健康指标自动校验。

---

## §7 与 CLAUDE.md 的关系

CLAUDE.md 是 L1 项目宪法（极稳定,基本不变）。

**本文档 (topology-priority.md) 是 L1.5 元文档**：
- 仍然在 `/docs/` 而非 `/`（避免污染 CLAUDE.md）
- 但**重要性仅次于 CLAUDE.md**
- **任何 Agent 在工作前先读本文档**

CLAUDE.md 增加一句指向本表：

```markdown
<PROTOCOL>
本会话开始前必读:
1. /CLAUDE.md (L1 项目宪法)
2. /docs/topology-priority.md (L1.5 优先级拓扑表)
3. 当前任务相关 spec
</PROTOCOL>
```

---

## §8 元信息

- 创建于用户原话："我感觉应该记录好文件、功能、规范的优先级的拓扑表，因为我们的规范变动很多，有新有旧"
- 这是**治理工具**而非功能实现
- 与 GEB 文档哲学一致（双重自证 / 文档即代码）
- 状态机的设计灵感来自软件架构的"废弃策略"+ 产品管理的"RICE 优先级"
- 2026-07-07 SP-1 设计阶段副产品

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md