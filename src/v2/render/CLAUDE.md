# render/
> L2 | 父级: src/v2/CLAUDE.md

L2渲染层（Three.js），晶体空间、层、念头体、相变动画、扭曲投影。

## 成员清单
crystal-space.js: 有限3D晶体空间渲染
layer-renderer.js: 6层+2外置层渲染
thought-mesh.js: 念头锐利低面数体
memory-mesh.js: 记忆圆润高面数体
phase-transition.js: 相变连续插值动画
space-reorganizer.js: 相变时空间重组
view-orbit-camera.js: 圆周轨道相机
base-plane.js: 3/4基准面（3D扭曲投影，非物理切片）
operation-zone.js: 1/4操作区
damper-mesh.js: 阻尼组件渲染
mark-renderer.js: 标记渲染（线/面/体）
unknown-mark-mesh.js: 未知块视觉
relation-line.js: 关系视觉表现
tag-attraction.js: 标签吸附视觉
reference-link.js: 引用链接视觉
content-editor.js: 内容格式编辑器
search-highlight.js: 搜索高亮
space-boundary.js: 空间外部信息边界渲染
subspace-transition.js: 子空间进入/退出过渡
todo-mesh.js: Todo 4形态渲染
shader/phase-interpolation.glsl: 相变插值着色器
shader/temperature-color.glsl: 温度颜色映射着色器
shader/material-mapping.glsl: 材质映射着色器
render-pipeline.js: 渲染管线（5阶段+帧调度16ms预算）——排查基础
debug-overlay.js: 3D Debug Overlay（10种可视化层）——排查基础
expected-calculator.js: 期望值计算器——排查基础
state-visualizer.js: 状态场完整可视化——排查基础
endoscope-shader.js: 内窥镜扭曲shader
projection-anchor.js: 3D→2D锚点投影
orbit-renderer.js: 轨道可视化（控制点+曲线）

[PROTOCOL]: 变更时更新此头部,然后检查 src/v2/CLAUDE.md
