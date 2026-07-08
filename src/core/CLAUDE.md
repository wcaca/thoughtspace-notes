# src/core/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单

### 核心实体（念头/连接/结构）
- `thought.js`: 念头数据创建 / 温度衰减 / 标签管理 / 新建念头工厂（含 source 来源锚定: manual/voice/import/copilot-suggest），纯函数
- `note.js`: Note 数据模型 / `createNote` 工厂 + 4 个种子 Note（念头的源,提供详情页锚点）
- `thought-from-note.js`: 从 Note 自动提取 Thought / 种子 Thought 工厂（按温度散布 y 轴）
- `edge.js`: 边的 CRUD / 5 种关系类型 / `createEdgeStore` 内存存储
- `structure.js`: 结构内聚度评分 / 结晶判定（对应 phase-0 spec 公式）
- `geometry-cluster.js`: G2 星团布局引擎（d3-force 力导向）

### 空间分层与分区
- `layer-store.js`: SP-1 看板分层存储 / 6 层默认配置 / 重排序
- `zone.js`: 3D 球形分区模型 / 归属判定 / 距离计算
- `sort-axis.js`: 排序轴状态机 / 多轴并列（time/heat/volume/manual/lastInteraction）

### 形状与视图
- `shape-resolver.js`: 方圆四态判定（continuous / metric / discrete / empty）
- `crystallize.js`: 结晶机制 / 内聚度计算 / 形态建议（dyad→icosa）

### 游戏化与觉察
- `meditation.js`: 冥想/静观状态管理
- `reunion.js`: 重聚机制（相似念头重逢）
- `action.js`: 行动项 / Todo 模块
- `insight-copilot.js`: 洞察副驾 / 智能提示
- `hydrate-anim.js`: 水合动画参数配置

### 入口
- `index.js`: 桶导出

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
