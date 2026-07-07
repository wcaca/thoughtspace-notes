# src/topology/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单
- `cube-camera.js`: 魔方旋转相机控制（6 面离散切换 / 滑动吸附 / 面指示器）
- `convex-hull.js`: 念头坐标 → 3D 凸包计算（convex-hull npm 封装）

> 注: 3D 力导向仿真 (`createForce3D`) 已废弃 — P0-4 合并时删除,生产代码使用 `src/sim/force-3d.js` 的 `createSim3D` (基于 d3-force-3d)。
> 详见 [docs/superpowers/specs/2026-07-07-topology-sim-design.md §4.1](file:///e:/魔方心厦/thoughtspace-notes/docs/superpowers/specs/2026-07-07-topology-sim-design.md)。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
