# core/
> L2 | 父级: ../CLAUDE.md

L1领域核心层（纯逻辑，无渲染）。念头/记忆/层/关系/规则/标签/坐标/内容格式/视角轨道/认知框架/标记系统/空间本体。

## 成员清单
- `space.js` — 有限3D念头晶体空间边界（八面体）、三维度坐标系（vertical/radial/orbital）、子空间管理
- `mark-system.js` — 标记系统统一抽象，6种预设MarkType（layer/reference-line/damper/container-boundary/orbit-path/anchor），三种能力（asReference/asContainer/asMarker）
- `layer.js` — 6层+2外置层系统，基于mark-system预设实例化，近大远小计算
- `view-orbit.js` — 圆周轨道视角数学，5个默认位置（INITIAL/RIGHT1/RIGHT2/RIGHT3/LEFT），Catmull-Rom样条插值，可导出为orbit-path实例
- `cognitive-framework.js` — 可切换认知框架系统，7种预设（6层+2外置/三网络/曼陀罗/原型/脑区/八维/生命之树）+ 自定义框架，切换=重建LayerSystem层
- `spatial-state-field.js` — 3D空间状态场（排查基础第2层），32³降采样网格（32768 cell）+ 查询接口（点/射线/区域/层），SceneStateStore辅助组件，依赖space.js坐标系和layer.js层范围
- `state-snapshot.js` — 时间线快照管理（排查基础第3层），环形缓冲+关键事件强制快照，支持时间旅行调试与快照差异分析，SceneStateStore辅助组件
- `state-change-chain.js` — 状态变更链（排查基础第4层），causedBy/causedChanges双向追溯的DAG，支持环检测/热点分析/路径查询，SceneStateStore辅助组件
- `diagnostic-engine.js` — 诊断规则引擎（排查基础第5层），15条内置规则D001-D015（状态一致性/性能/因果链）+ 综合关联分析（同实体/同链/时间簇）+ 根因分析，依赖state-change-chain，SceneStateStore.generateDiagnosticReport()委托此组件
- `spatial-query.js` — 统一查询语言（排查基础第6层），10种查询能力（at/entity/ray/region/layer/timeline/causedBy/where/diff/trace），AI自排查主接口，依赖spatial-state-field+state-snapshot+state-change-chain

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
