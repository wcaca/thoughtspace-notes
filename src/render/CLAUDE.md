# src/render/
> L2 文档 - 父级: ../CLAUDE.md

## 成员清单

### 3D 场景与相机
- `canvas.js`: 渲染入口，index.html 壳引用的主入口
- `scene.js`: Three.js 场景初始化与管理
- `thought-sphere.js`: 念头球体 3D 渲染(选中态/提炼动画/沉积层用单 mesh group)
- `instanced-thoughts.js`: 大批量 idle 念头 InstancedMesh 渲染(Round 3 性能三件套,单 draw call)
- `hull-mesh.js`: 凸包 3D 网格(带 shouldRebuildHull 缓存)
- `zone-mesh.js`: 用户自定义分区的 3D 可视化（半透明球体 + 中心文字标签）
- `sediment-layer.js`: 沉积层渲染(节流 500ms 重建粒子)
- `crystallize-fx.js`: 结晶特效(Three.js;Shift+click 多选 + 工具栏 "✦ 提炼" 按钮触发,调用 animateCrystallization)

### 视角与状态
- `viewport-state.js`: 统一视角总线；所有面板/相机/观察模式从此读
- `viewport-bridge.js`: 同步现有 main.js 状态到 viewport-state 总线
- `canvas-mode.js`: SP-1 看板双模式状态机（block / background）
- `ambient-life.js`: "存在感"引擎：呼吸节奏 + 微动漂移 + 深度场 + 粒子生命

### 念头与边渲染
- `thought-node.js`: 念头节点渲染与交互（拖拽/点击/悬停）
- `edge-line.js`: 边的几何绘制（直线/折线/直角）

### 面板系统
- `panel-stack.js`: 全局面板栈（单开协调器）；保证任意时刻只有一个"主"面板可见
- `overlay-panel.js`: 浮动面板基类
- `outside-click.js`: 监听全局点击，点击空白关闭当前最顶 panel
- `detail-panel.js`: 念头详情浮动面板（面板结构 + 标签/色温字段编辑 + source 徽章 + 按钮回调）
- `detail-markdown.js`: 详情面板的 markdown 渲染 + 笔记正文编辑器 + 面板 HTML 模板（markdownToHtml / panelInnerHtml / setupMarkdownBody / escHtml / escHtmlAttr）
- `edge-panel.js`: 双击边后弹出的"改 type / 删除 / 互换方向"小面板
- `crystal-panel.js`: 结晶入口面板：显示选中念头的结构强度 + 结晶按钮
- `action-panel.js`: 行动萃取的入口与列表；支持从念头提炼为 Action、状态流转
- `copilot-panel.js`: 灵感助手面板结构 + 事件 + 今日觉察（预览卡片渲染委托 copilot-preview.js）；对外 API: showCopilotPanel/hideCopilotPanel/isCopilotPanelOpen
- `copilot-preview.js`: 灵感助手预览卡片渲染（关联建议卡片 + 序列建议卡片 + .cp-preview 两步确认逻辑）；被 copilot-panel.js 引用
- `zone-panel.js`: 分区管理面板；列表 / 入口 / 弹出关闭（表单逻辑委托 zone-form.js）
- `zone-form.js`: 分区表单子模块；新建 / 编辑表单 DOM + 输入验证 + 提交回调（被 zone-panel.js 引用）
- `help-panel.js`: Shift+/ 或 ? 唤起的按键说明面板
- `export-panel.js`: Ctrl+Shift+E 唤起的导出/导入浮动面板

### 观察模式与视图
- `observe-views.js`: 观察模式入口（全屏覆盖视图 + 事件绑定 + fireReorder 持久化）；对外 API 不变
- `observe-state.js`: 观察模式状态管理与层模式渲染（排序轴/模式 tab/卡片构件/块模式/背景模式）
- `observe-render.js`: 观察模式 DOM 渲染（卡片/看板/时间线 + 拖动重排 + 内容刷新）；fireReorder 通过 callbacks 注入
- `shape-indicator.js`: 形状指示器纯文本/视觉描述；observe-views 调用此模块决定 UI

### 交互与工具
- `toolbar.js`: 工具条渲染（桌面左上浮动 / 移动底部固定）
- `quick-add.js`: N 键唤起的快速捕获浮层
- `command-palette.js`: Ctrl+K 命令面板；模糊搜索可达的操作
- `global-search.js`: F 键唤起的顶部固定搜索面板，纯 DOM + 模糊子串匹配
- `relation-picker.js`: 拖拽中悬停目标念头 0.5s 后弹出，选 type 后回调
- `voice-capture.js`: 语音录入（Web Speech API）；仅当浏览器支持时启用
- `contemplate-overlay.js`: 念头计时静观（呼吸圆环 + 倒计时 + 记录感受闭环）
- `reunion-toast.js`: "意外重逢"低频提示；点击查看跳转，关闭则下次不再打扰

### 全局系统
- `error-handler.js`: 全局错误处理 + 白屏恢复面板
- `awareness-hud.js`: 终极觉察 HUD（时间节律 + 心境趋势 + 能量场指示器）
- `a11y.js`: 全局无障碍 + 排版工具，被各 render 模块消费

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
