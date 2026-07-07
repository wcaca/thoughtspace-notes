# src/sim/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单
- `force-engine.js`: d3-force 2D 仿真引擎（斥力 + 弹簧 + 中心 + 碰撞）— **2D 路径活代码** (P0-4 2026-07-07: 被 canvas.js + thought-node.js + geometry-cluster.js 消费,不是孤儿)
- `force-3d.js`: d3-force-3d 3D 仿真封装（3D 力导向 / 引力 / 碰撞 / 中心力 / 温度→Y 拉拽）— P0-2 已补全 5 函数 (pinSimNode/unpinSimNode/setSimLayout/reheatSim/keepSimAlive)

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
