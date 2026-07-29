# S2 关键决策记录

> **本文件目标**: 记录 S2 念头实体阶段的**不可逆架构决策**,防止未来 agent 重写时困惑"为什么这么做"。

---

## thought-as-crystal

**决策**: 念头 (Thought) 是一种 3D 晶体 (SpatialEntity 子类),有 phase/material/shape/createdBy 四维属性 + displayScale 占空间比例
**时间**: 2026-07-08
**原因**: 念头不是抽象节点,必须有物理形态才能在 3D 空间"被照料";晶体比圆球更有"结晶"语义
**代价**: 晶体渲染比球复杂,但与"温度衰减+结晶"叙事吻合

---

## thought-entity-integration

**决策**: S2.8 集成 Thought + thought-mesh + memory-mesh + thought-bridge,3 个示例 Thought (光质/阴影/温度) 验证实例化管线
**时间**: 2026-07-10
**原因**: S2.1-S2.7 独立实现后,必须先验证跨调无 bug 再推 UI 接入
**代价**: 集成层暴露的 bug (getLayerById vs getLayer / 未声明变量) 已修,但每加新组件都有跨调风险

---

## s2-8-entity-integration

**决策**: v2 main.js 4.5 段插入 ThoughtMeshRenderer + MemoryMeshRenderer + thoughtRefs Map + spawnSampleThought 工具
**时间**: 2026-07-10
**原因**: 全局调试入口 __v2.thoughtMesh / memoryMesh / spawnSampleThought 必须可手动验证,无需 UI
**代价**: main.js 文件变大,但分阶段注释 (===== 1~8 =====) 让结构清晰

---

## thought-bridge

**决策**: 念头持久化 (thought-bridge) 走 Yjs Y.Map 嵌套 + 观察者分发,Yjs 接入时同步 / 未接入时 no-op
**时间**: 2026-07-08
**原因**: 与 v1 bridge 模式一致,Yjs 是单一权威源,bridge 是镜像;Yjs 缺失时不阻塞前端验证
**代价**: no-op 路径容易出现"看起来工作其实没存"的陷阱,需要后续接入 Yjs 时双重验证

---

## 默认层选择 con-middle

**决策**: spawnSampleThought 默认 layerId = layers[5] (con-middle),不是 layers[Math.floor(N/2)]
**时间**: 2026-07-10
**原因**: Math.floor(N/2) 在 11 层时选到 layer-bottom-external (0~0.1),0.5 位置会跨层;选 con-middle (vertical 0.57-0.73) 与默认 vertical 0.5 最接近
**代价**: 硬编码 index 5,层数变化时需同步;后续抽成 namedLayer("default")

---

## thought-mesh

**决策**: 念头渲染 = 锐利低面数体 (四面体/立方体/八面体) + 内置温度色映射 (蓝=冷/红=热) + displayScale 应用
**时间**: 2026-07-09
**原因**: 念头是"正在形成中的想法",锐利+小面数体现未结晶感;温度色让冷热感可见
**代价**: 面数少导致光照细节不足,但与"种子"叙事吻合;后续 phase-transition 动画会推进形态变化

---

## memory-mesh

**决策**: 记忆渲染 = 圆润高面数体 + 材质映射 (金属/玻璃/木质/液态/晶体) + 温度衰减 (默认 0.3)
**时间**: 2026-07-09
**原因**: 记忆是"已沉淀的想法",圆润+高面数=凝固感;材质映射让不同记忆类型有物理质感
**代价**: 高面数渲染开销大,但容量 100 + InstancedMesh 可控;材质参数需持续调

---

## render-pipeline-5-stages

**决策**: S2.10 render-pipeline 调度 = 5 阶段固定顺序 (input/state/transform/render/snapshot) + 阶段内 priority 升序 + 16ms 帧预算
**时间**: 2026-07-11
**原因**: 排查基础需要"可观察的每阶段耗时",固定顺序保证确定性,priority 在阶段内允许多回调并存;不追求绝对 16ms,而是暴露每阶段耗时让 AI 通过 `__v2.renderPipeline.getStats()` 自排查
**代价**: 5 阶段硬编码,新增阶段需改 STAGES 常量;阶段预算总和 16ms (1+3+6+4+2) 是经验值,实际负载不均时需要再调

---

## s2-10-pipeline-integration

**决策**: main.js 硬编码 animate() 升级为 RenderPipeline.registerStage() 模式; state→orbitCamera.update(); transform→预留 phase-transition hook (当前 recordCacheAccess 占位)
**时间**: 2026-07-11
**原因**: 注册式管线比硬编码流水更可观察 (每阶段计时 + 错误隔离), 符合"排查基础 = 错误可观察"原则
**代价**: 旧 animate() 里的 lastSnapshotTime 100ms 节流被取消, 改为 pipeline snapshot 阶段每帧调 captureIfNecessary (内部仍会节流)

## animation

**决策**: 通用缓动函数库 (linear / easeOutCubic / easeInCubic / easeInOutCubic / easeOutQuart / easeInOutQuart)
**时间**: 2026-07-09
**原因**: phase transition / 帧间插值 / 视口平滑都需要缓动, 集中管理避免散落
**代价**: 函数多了不熟的人会选错, 但 [OUTPUT] 注释清楚列出每种曲线适用场景

---

## dom-over-canvas

**决策**: debug overlay 用 DOM div (不是 canvas 绘制) — 文本清晰、样式可定制、跟主 canvas 解耦
**时间**: 2026-07-13
**原因**: 文本标签用 canvas 渲染需要额外字体纹理和布局系统, DOM 更快更稳
**代价**: 多个 div 增加 DOM 节点数, 但调试面板通常只 5-10 个, 性能影响可忽略

---

## console-fallback

**决策**: 调试面板加载失败时, console.log 仍能输出关键状态 (降级路径)
**时间**: 2026-07-13
**原因**: 调试面板是辅助工具, 不能因为它坏就让用户完全看不到状态
**代价**: console 输出需要手工格式化, 但 [v2.debugOverlay] 命名空间让过滤简单

---

## quick-add-panel

**决策**: 快速添加念头面板 — 输入框 + 5 按钮 (create/move/edit/delete/connect), 顶部右侧浮层
**时间**: 2026-07-16
**原因**: 主操作面板入口集中, 避免每个动作都要翻菜单; 顶部右侧不挡视野中心
**代价**: 5 按钮放一起, 误触风险, 但 [PROTOCOL] 强制 hover-tooltip 提示

---

## shortkey-n

**决策**: 快速添加面板快捷键 N (new thought), 跟系统 N 冲突时按 Esc 取消
**时间**: 2026-07-16
**原因**: 鼠标点击比快捷键慢 1-2s, 频繁创建念头时累积差距明显
**代价**: N 占用系统键, 但有 Esc 兜底, 用户可重映射

---

## position-topright

**决策**: quick-add-panel 默认位置 = 屏幕右上角, 离视口中心远, 不挡主流操作
**时间**: 2026-07-16
**原因**: 主流操作在中心区 (晶体空间), 调试/添加入口放边缘, 不抢焦点
**代价**: 右上角是浏览器通知/插件常用位置, 可能冲突, 但 [panel.position] 可拖

---

## s2-11-12-debug-integration

**决策**: main.js 集成 debug-overlay (S2.11) + expected-calculator (S2.12) — 启动时挂载 [v2.debugOverlay] + [v2.expectedCalculator] 命名空间
**时间**: 2026-07-14
**原因**: 这两个是 AI 自排查关键工具, 必须 main 启动就绪; 命名空间让 console 直接访问
**代价**: 启动时间 +5ms, 但调试价值远高于这点开销

---

## debug-overlay-integration

**决策**: main.js 第 312 行挂载 debug-overlay — __v2.debugOverlay.init() 紧跟 state 初始化
**时间**: 2026-07-14
**原因**: debug overlay 依赖 scene state 完整, 必须等 state 加载后再挂载
**代价**: 时序耦合, 启动顺序改动需同步更新这行

---

## quick-add-integration

**决策**: main.js 第 319 行挂载 quick-add-panel — __v2.quickAddPanel.init(), 紧跟 debug-overlay
**时间**: 2026-07-16
**原因**: quick-add-panel 依赖 scene state + debug overlay (日志), 必须最后挂
**代价**: 启动链长, 但每一步都是必要的依赖

---

## constants-from-measurement

**决策**: expected-calculator 常量 (温度阈值/相位概率) 全部从测量数据来, 不硬编码魔法数
**时间**: 2026-07-13
**原因**: 测量数据驱动 = AI 排查"为什么这个值"有据可查, 不会因为常量错而无法定位
**代价**: 常量文件长, 但分模块管理, 不是单文件堆叠

---

## Animation

(已合并入 `animation` 锚点 — alias for 兼容)

