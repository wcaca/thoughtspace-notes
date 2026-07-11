# render/
> L2 | 父级: ../CLAUDE.md

L2渲染层（Three.js），晶体空间、层、念头体、相变动画、视角控制、帧调度管线。

## 成员清单
- `crystal-space.js` — 有限3D晶体空间渲染（八面体边界线框+星尘背景）
- `layer-renderer.js` — 6层+2外置层渲染（层平面+标签+近大远小+分界线）
- `view-orbit-camera.js` — 圆周轨道视角相机（5预设位置+平滑过渡动画）
- `base-plane.js` — 3/4基准面（3D空间切片，厚度自适应）
- `operation-zone.js` — 1/4操作区（外层环绕+3D缩略图+视角旋转入口）
- `space-boundary.js` — 空间外部信息边界渲染（可见不可操作，暗示性粒子）
- `thought-mesh.js` — 念头实体渲染（锐利低面数多面体 + 温度色 + displayScale, S2.6）
- `memory-mesh.js` — 记忆实体渲染（圆润高面数体 + 材质映射, S2.7）
- `render-pipeline.js` — 帧调度管线（5阶段+16ms预算+每阶段计时,S2.10 排查基础）

## 待创建（后续阶段）
phase-transition.js / space-reorganizer.js / damper-mesh.js / mark-renderer.js / unknown-mark-mesh.js / relation-line.js / tag-attraction.js / reference-link.js / content-editor.js / search-highlight.js / subspace-transition.js / todo-mesh.js / shader/* / debug-overlay.js / expected-calculator.js / state-visualizer.js / endoscope-shader.js / projection-anchor.js / orbit-renderer.js

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
