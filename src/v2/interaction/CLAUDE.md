# interaction/
> L2 | 父级: src/v2/CLAUDE.md

L3交互层，手势识别、菜单、拖拽、多选、搜索、撤销。

## 成员清单
gesture-recognizer.js: 手势识别状态机（点击/拖动/长按/双指/三指）
thought-menu.js: 念头右上角菜单（13项）
drag-handler.js: 拖拽处理（位置/层/有阻尼）
multi-select.js: 多选（菜单入口进入）
view-orbit-swipe.js: 1/4外层滑动切换视角
pinch-zoom.js: 双指捏合=缩放，双指展开=进入子空间
content-gesture.js: 内容编辑手势
search-ui.js: 搜索界面
settings-panel.js: 设置浮层
rule-editor.js: 规则算法编辑器
tag-editor.js: 标签数值编辑器
framework-switcher.js: 认知框架切换器
undo-redo.js: 撤销/重做（三指手势）
todo-panel.js: Todo面板交互
ai-preview.js: AI半透明预览层（L1-5约束）
mark-editor.js: 标记系统编辑器（3D空间中创建/编辑/删除标记实例）
view-customizer.js: 视角自定义编辑器（4项能力）

[PROTOCOL]: 变更时更新此头部,然后检查 src/v2/CLAUDE.md
