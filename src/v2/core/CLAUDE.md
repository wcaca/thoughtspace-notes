# core/
> L2 | 父级: src/v2/CLAUDE.md

L1领域核心层（纯逻辑，无渲染），念头/记忆/层/关系/规则/标签/坐标/内容格式。

## 成员清单
thought.js: 念头/记忆实体（相变、内外结构、占据空间比例、displayScale）
layer.js: 6层+2外置层系统、近大远小——基于mark-system的预设实例化
space.js: 有限3D晶体空间（边界、三维度）
relation.js: 五种基础关系（合并/互斥/并列/包含/被包含）
rule-engine.js: 规则算法引擎（触发/判定/执行/优先级）
tag-system.js: 标签数值与吸附系统
coordinate.js: 坐标系（空间坐标、标记坐标）
reference.js: 念头引用系统
unknown-mark.js: 未知块标记系统
mark-algorithm.js: 标记坐标规则算法
content/block.js: 块（文字/念头/图片/音频/视频）
content/line.js: 行（一行/双行/三行）
content/inline.js: 行内元素
content/connection.js: 块连线
content/dimension.js: 维度叠加（字/行/块级）
view-orbit.js: 视角圆周轨道（含投影函数、深入度计算）
cognitive-framework.js: 可切换认知框架（8种）
space-organizer.js: 空间组织器（参考系+标记+容器统一）
damper.js: 阻尼组件
search.js: 全功能搜索（为AI控制准备）
history.js: 时间与历史版本
performance.js: 性能边界与认知负荷管理
subspace.js: 嵌套子空间系统
todo.js: Todo系统（4形态）
mark-system.js: 标记系统抽象（层/参考线/阻尼/容器/轨道/锚点的统一基础）
scene-state-store.js: 统一状态中枢（三层状态管理：Yjs权威层/瞬态层/渲染缓存层）——排查基础
action-router.js: 用户操作统一路由（手势冲突解决）——排查基础
spatial-state-field.js: 3D空间状态场（32³网格+查询接口）——排查基础
state-snapshot.js: 时间线快照管理（环形缓冲1000个）——排查基础
state-change-chain.js: 状态变更链（causedBy/causedChanges双向追溯）——排查基础
diagnostic-engine.js: 诊断规则引擎（15条内置规则D001-D015）——排查基础
spatial-query.js: 统一查询语言（at/entity/ray/region/layer/timeline/causedBy/where/diff/trace）——排查基础

[PROTOCOL]: 变更时更新此头部,然后检查 src/v2/CLAUDE.md
