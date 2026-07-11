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
