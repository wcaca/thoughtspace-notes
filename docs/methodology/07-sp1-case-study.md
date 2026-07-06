# 方法 07 · SP-1 案例研究

> **本文件目的**:展示**方法 01-06 怎么一起用**,而不是单独用。
>
> 读完本文件,你可以**重放 SP-1 的完整过程**,把方法用到你的项目。

## §1 SP-1 背景

**用户原话** (2026-07-07):
> "看板视图增加功能:可以自定义分层,比如按照显意识3层,潜意识3层的方式……既可以在里面放其他块,也能记录文字图片……排列和嵌套关系也能在整体的3D意识空间中反映意识状态"

**任务边界**: 跨 4 个独立子系统,不适合单个 spec。

## §2 时间线总览

| 阶段 | 方法 | 产物 |
|---|---|---|
| **Step 1** 探索 | 摸清项目现状 | git log / existing specs |
| **Step 2** 评估范围 | 01 §3.1 分解信号 | 3 个 sub-project: SP-1/SP-2/SP-3 |
| **Step 3** 一次一问澄清 | 01 §3.2 | 5 轮澄清决策 |
| **Step 4** 写 spec | 02 §2 模板 | kanban-layered-space-design.md |
| **Step 5** 写 plan | 02 §3 模板 | sp1-kanban-layered-impl.md |
| **Step 6** 最小验证 | 02 §4 任务化 | T0 数据层 (3 文件 + 87 测试) |
| **Step 7** 装配 | 06 架构守卫 | T1.4-T1.5 (15 测试) |
| **Step 8** UI 实施 | 04 笔记链向陷阱 | T2.1-T2.4 (14 测试) |
| **Step 9** 拓扑表更新 | 03 状态转换 | 🟡 → 🔵 |
| **Step 10** 沉淀方法 | 本文 | 你正在读 |

## §3 关键决策 (从对话提炼)

| 决策 | 出处 | 沉淀为 |
|---|---|---|
| **拆分 3 个 SP** | 用户原话"拆为 3 个 sub-project (推荐)" | methodology §1 |
| **几何学原理 Y 轴映射屏幕上下** | 用户原话"我们与屏幕界面的交互视角影响很大" | spec §1.1 |
| **不压制信念排序 (SP-1.P0)** | 用户原话"如果有一种固定的排序方式...会压制信念信息" | spec §2.3 + decisions.md |
| **多轴默认隐藏 (SP-1.P1)** | 用户原话"如果默认出现,又会打扰用户" | spec §2.4 + pitfalls.md |
| **window.__sp1State 而非 ESM** | 避免循环依赖 | decisions.md#why-window-globals |

## §4 易错陷阱 (从实施提炼)

| 陷阱 | 触发 | 修复 |
|---|---|---|
| **showObserveView 入口调 hideObserveView** | 切换观察模式时递归关闭 | 移除入口调用 + 重写 onClose |
| **activeOverlay 时序错位** | module-level 变量在闭包调用中被改 | 闭包只操作自己捕获的变量 |
| **renderTimeline 缺 className** | e2e 测试无锚点 | 加 `.ob-timeline` className |
| **fromJSON(undefined) 破坏数据** | clear() 在 isArray 检查之前 | 先检查再 clear |
| **默认模式渲染时 ob-content 未存在** | 在 root.appendChild 之前 querySelector | 必须 appendChild 之后 |

## §5 数据流 (跨 8 个函数)

```
main.js:createLayerStore() → currentLayerStore
    ↓
main.js:bootstrapPersistence() → yjs ready
    ↓
main.js:currentLayerStore.bootstrapDefaults() → 6 layers
    ↓
main.js:window.__sp1State = { ... }
    ↓
user clicks [V] → openObserveView('cards')
    ↓
main.js:showObserveView('cards', thoughts, callbacks)
    ↓
observe-views.js:buildCanvasTabs() → top tabs
    ↓
observe-views.js:renderBackgroundMode() / renderBlockMode()
    ↓
user drags card → onReorder callback
    ↓
main.js:applyObserveReorder() → thoughtBridge + recordOrder
    ↓
sort-axis.js:manualOrder saved (信念轨迹)
```

## §6 测试演进

| 阶段 | 测试数 | 关键 |
|---|---|---|
| 起点 | 388 | 基线 |
| T0 数据层 | 477 | +87 |
| T1 装配 | 492 | +15 |
| T2/T3 UI + e2e | 506 | +14 |
| **最终** | **506** | **+118** |

**每次跑全量**——零回归是底线。

## §7 给"你的项目"的复用模板

```bash
# 1. 拷贝 methodology 到新项目
cp -r docs/methodology/ /path/to/new-project/docs/

# 2. 写新 spec
$EDITOR /path/to/new-project/docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md

# 3. 按 §1 设计思维流程走
# 4. 按 §2 spec 驱动写 plan
# 5. 按 §3 拓扑表登记
# 6. 按 §4 笔记链接陷阱
# 7. 按 §5 系统调试失败
# 8. 按 §6 架构守卫提交
```

## §8 复盘

| 做得好的 | 没做好的 |
|---|---|
| 一次一问,信息密度高 | 实施后没立即补拓扑表 |
| 整合已有 spec,没抛弃方向 | "待审批"标识没及时改 |
| 三大原则形式化为代码 | 召唤手势长按 jsdom 不可测 |
| 零回归 | 持久化层未实施 |

**最重要的教训**:
> **方法的价值不在"知道",在"用"**。SP-1 用了方法 01-06,产出了 506 测试、零回归、清晰的笔记体系。

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md