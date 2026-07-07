---
id: phase-0-lightweight-restructure
title: Phase 0 轻量拆分 + Fable5 自推进循环
status: deprecated
# P2-1: deprecated 不需要 phase (历史 ADR 残留)
layer: L1-architecture
scope:
  global: true
  modules: []
  files: []
  lines: []
priority: 0
created: 2026-07-05
updated: 2026-07-07
inherits-from: []
supersedes: []
superseded-by: topological-awareness-space
# P2-1: 移除 conflicts-with — 已被 core-data-model 的 overrides 显式裁决
# 保留此处仅作为历史 ADR 记录 (P2-3)
non-negotiable: []
---

# Phase 0 轻量拆分 + Fable5 自推进循环 — 设计文档

> **For agentic workers:** 这是设计 spec,不是实施 plan。
> 实施 plan 由 `writing-plans` skill 另行产出,本文件仅供设计审阅。

> ⚠️ **本 spec 已被 `2026-07-05-topological-awareness-space-design.md` 取代**，本文档仅供历史查询。请勿基于本文档做新决策。

| 项目 | 值 |
|---|---|
| **创建日期** | 2026-07-05 |
| **作者** | AI 助手(基于用户战略决策) |
| **目标读者** | 用户(产品决策者)+ 未来任何接手的 agent |
| **路线代号** | 路线 B(轻量拆分 + Fable5 精神) |
| **周期预估** | 3-5 天(可见交付)+ 持续迭代 |
| **关联文档** | `../../../docs/念头空间_*.md` × 14 份规划 |

---

## §1 战略定位与范围

### 1.1 一句话定位
**把"430 行单文件原型"重构为"4-5 个独立可测文件 + 3 天可见交付",为 Fable5 式自主推进循环打下"够用、但不过度工程化"的地基。**

### 1.2 范围划界(明确做 / 不做)

#### ✅ 本 spec 覆盖(Phase 0 增强)
1. **拆分单文件**:`index.html`(430 行) → `index.html`(50 行壳) + `src/{core, render, persistence, ui, sim}.js`
2. **5 种关系类型视觉差异化**(因果/并列/矛盾/时序/从属)
3. **温度衰减自动运行**(Part 8 公式:`T = T_last × exp(-λ × Δt)`)
4. **节点详情面板**(点击念头 → 展开笔记,可编辑、可关闭)
5. **结晶动画**(手动触发 + 内聚度评分阈值 0.7,基于边密度算法)
6. **撤销/重做**(Yjs UndoManager,Ctrl+Z / Ctrl+Y)
7. **Vitest 引入**(验证 `core` 模块纯函数逻辑,核心目标 ≥85% 覆盖率)
8. **Fable5 自推进循环工具链**(`plans/` 目录 + Backlog 维护 + 自评提交模板)
9. **`.trae/rules/project_rules.md`**(TRAE 项目规则,锁住架构约束)

#### ❌ 本 spec **不**覆盖(明确推迟到 Phase 1+)
- React/Vue 框架引入
- Tauri 桌面壳打包
- SQL/SQLite 全文搜索
- 12 种几何结构(只先做星团 G2,其他结构留 Phase 1)
- 网络同步 / Multiplayer
- AI 拆分建议 / embedding 相似度
- 任何 TapTap / 移动端适配

### 1.3 战略决策(已敲定)
| 决策 | 选定值 | 理由 |
|---|---|---|
| 路线 | **B** | 用户 2026-07 选定 |
| LLM 编码 | **MiniMax-M3(本次会话)+ DeepSeek `v4-flash` API** | 用户给的 Key 已验证有效 |
| 验证栈 | **Vitest**(Playwright 暂缓) | 用户选定 |
| 向量库 | **暂不部署**(Phase 1+ 再上) | Phase 0 RAG 不必要 |
| Embedding | **本地 transformers.js + BGE**(Phase 3 再上) | Phase 0 不需要 |

---

## §2 架构设计

### 2.1 目录结构(目标态)
```
thoughtspace-notes/
├── CLAUDE.md                          # L1 项目宪法(已有)
├── README.md                          # 项目介绍(已有)
├── LICENSE                            # MIT(已有)
├── package.json                       # 新增 - pnpm 工作区根
├── pnpm-workspace.yaml                # 新增
├── .dependency-cruiser.cjs            # 新增 - 架构约束自动检查
├── vitest.config.js                   # 新增
├── .trae/
│   └── rules/
│       └── project_rules.md           # 新增 - TRAE 项目级规则
├── docs/
│   ├── CLAUDE.md                      # L2(已有)
│   ├── 念头空间_*.md                  # 14 份规划(已有,不动)
│   └── superpowers/
│       ├── specs/
│       │   └── 2026-07-05-phase-0-lightweight-restructure-design.md  # 本文件
│       └── plans/                     # 实施 plan 存放
├── src/                               # 新增 - 拆分后的核心代码
│   ├── core/                          # 纯逻辑,无 UI/无渲染依赖
│   │   ├── thought.js                 # Thought 数据创建/转换/温度衰减
│   │   ├── edge.js                    # Edge 数据 + 5 种关系类型判定
│   │   ├── structure.js               # 内聚度评分 + 结晶判定
│   │   ├── geometry-cluster.js        # G2 星团布局引擎(IGeometryEngine 接口雏形)
│   │   └── index.js                   # 桶导出
│   ├── persistence/
│   │   └── yjs-store.js               # Yjs Doc + IndexedDB 适配 + UndoManager
│   ├── sim/
│   │   └── force-engine.js            # d3-force 引擎封装(出/入 Thought 坐标)
│   ├── render/
│   │   ├── canvas.js                  # PixiJS 应用初始化、视口、缩放
│   │   ├── thought-node.js            # 单个念头精灵工厂(温度发光、拖拽)
│   │   ├── edge-line.js               # 关系连线工厂(5 种样式差异)
│   │   ├── crystallize-fx.js          # 结晶动画(GSAP-lite 自实现)
│   │   └── overlay-panel.js           # 节点详情面板(原生 DOM)
│   ├── ui/
│   │   └── toolbar.js                 # 工具栏按钮绑定(原生 DOM)
│   └── index.html                     # 50 行壳,只剩 import 和挂载点
└── tests/                             # 新增 - Vitest 测试
    ├── core/
    │   ├── thought.test.js            # 温度衰减公式
    │   ├── edge.test.js               # 关系类型校验
    │   └── structure.test.js          # 内聚度算法
    └── sim/
        └── force-engine.test.js       # 物理引擎边界条件
```

### 2.2 分层依赖关系(架构约束的核心)
```
            ┌─────────────────────────────────────┐
            │              渲染层                  │
            │  render/* + ui/*  (依赖 PixiJS DOM)  │
            └──────────────┬──────────────────────┘
                           ↓ 读写
            ┌──────────────▼──────────────────────┐
            │              仿真层                  │
            │      sim/force-engine.js             │
            └──────────────┬──────────────────────┘
                           ↓ 读写
            ┌──────────────▼──────────────────────┐
            │             持久化层                 │
            │     persistence/yjs-store.js         │
            └──────────────┬──────────────────────┘
                           ↓ 暴露纯函数
            ┌──────────────▼──────────────────────┐
            │              领域层                  │
            │ core/{thought, edge, structure,     │
            │      geometry-cluster}  (无外部依赖) │
            └─────────────────────────────────────┘
```

### 2.3 不可违反的依赖约束
- `core/**` 禁止 import `pixi.js` / `@pixi/*` / `d3-force` 之外的任何第三方
- `core/**` 禁止 import `render/` / `ui/` / `sim/` 的任何模块
- `sim/**` 禁止 import `render/` / `ui/` 的任何模块
- `persistence/**` 禁止 import `render/` / `ui/` 的任何模块
- 这些约束用 `.dependency-cruiser.cjs` 在 CI/本地预提交检查中**强制**(`pnpm run check:arch` 命令)

### 2.4 数据流(单次交互)
```
用户拖念头 A
   ↓
render/thought-node.js 捕获 pointermove
   ↓ dispatch(sim, payload={id, x, y})
sim/force-engine.js 把 x/y 写入临时位置,触发 d3-force 收敛
   ↓ tick 回调
sim/force-engine.js 把稳定坐标
   ↓ 写入 persistence
persistence/yjs-store.js Yjs transact
   ↓ doc.on('update') 触发
render/* 监听 Yjs Doc 变化,只 diff 变更的节点重绘
```

### 2.5 12 几何接口雏形(为 Phase 1 铺垫)
```typescript
// core/geometry-cluster.js
export const GeometryType = Object.freeze({
  CLUSTER: 'cluster',
  TREE: 'tree',         // Phase 1
  TIMELINE: 'timeline', // Phase 2
  MATRIX: 'matrix',     // Phase 2
  // ... Phase 1+ 扩展
});

// 现在只有 Cluster 实现,但接口已固定
export const clusterEngine = {
  type: GeometryType.CLUSTER,
  requiresManualSetup: false,
  computeLayout(thoughts, edges, existingCoords) { /* ... */ },
  inferInitialCoordinates(thoughts, edges) { /* ... */ },
  evaluateCrystallization(structure) { /* ... */ },
  getCrystallizedFormAsset(structure) { /* ... */ }
};
// 未来添加新引擎时,只需 export const treeEngine = { type: GeometryType.TREE, ... }
```

---

## §3 功能详细规格

### 3.1 关系类型视觉差异化(对应 Part 2 §九)
| 类型 | 视觉 | 颜色 | 用途 |
|---|---|---|---|
| `cause`(因果) | 实线 + 单向箭头 | `#7fe0c9` 水晶青 | "A 引起 B" |
| `parallel`(并列) | 虚线 + 双圆点 | `#8b90ad` 灰 | "A 和 B 同一类" |
| `conflict`(矛盾) | 锯齿线 | `#e87aa8` 玫红 | "A 与 B 冲突" |
| `sequence`(时序) | 带方向渐变线 | `#e8a865` 琥珀 | "A 之后 B" |
| `subordinate`(从属) | 树状直角连线 | `#9b8cf2` 紫 | "A 是 B 的子项" |

实现位置:`render/edge-line.js` 接收 `relationType` 参数,根据上述表选择样式。默认 `cause`。

### 3.2 温度衰减(对应 Part 8 §1.1)
```javascript
// core/thought.js
const DEFAULT_LAMBDA = 0.05;  // ~14 天半衰期
export function decayTemperature(t, nowMs) {
  const daysSince = (nowMs - t.lastInteractionAt) / 86400000;
  const decayed = (t.temperature ?? 1) * Math.exp(-DEFAULT_LAMBDA * daysSince);
  // 任何交互都会 reset t.lastInteractionAt 到 nowMs
  return Math.max(0, Math.min(1, decayed));
}

// 视觉: temperature < 0.2 → 节点缩小至 70%, 颜色去饱和
// temperature < 0.05 且 30 天无交互 → 弹出"是否归档"提示(非自动执行)
```

后台定时器:每 60 秒跑一次,只重算视觉(数据层不在后台写)。

### 3.3 节点详情面板(对应 Part 1 §3.A 模块 C)
- 点击节点 → 画布中央浮出 panel(不阻塞画布,半透明背景)
- 字段:id(只读)、text(可编辑)、temperature/mass(只读,显示当前值)
- 操作:`编辑保存` / `删除念头` / `关闭`
- 视觉效果:fade-in 300ms,关闭 fade-out 200ms
- 不进入"冥想聚焦态"(那是 Phase 2 的事儿)

### 3.4 结晶动画(对应 Part 1 §3.D 模块 D 第 16 条)
**触发条件**(满足任一):
- 用户长按某节点 2 秒 → 手动触发"我想清楚了"
- 用户选中一组念头 → 工具栏出现"提炼"按钮 → 点击触发

**内聚度算法**(Part 8 §1.2 已定公式):
```javascript
cohesion = 0.4 * 边密度 + 0.3 * 连接均衡 + 0.3 * userConfirm
```
- 边密度 = min(1, 实际边数 / (节点数 × 1.5))
- 连接均衡 = 1 - 归一化方差
- userConfirm = 选了"手动触发"则为 1
- 阈值 ≥ 0.7 才显示结晶动画

**视觉(自实现 GSAP-lite,不引依赖)**:
- 0.0-0.5s:念头缩小到 60%
- 0.5-1.5s:连线消失,念头位置插值收敛到中心点
- 1.5-2.5s:从中心向外扩散粒子光点 + 滤镜模糊
- 2.5s 后:留下一个永久的"图腾"节点(几何形态 = 内接六边形几何 SVG)

### 3.5 撤销/重做(Yjs UndoManager,Part 3 §4.3)
- 快捷键:`Ctrl/Cmd+Z` 撤销,`Ctrl/Cmd+Y` 或 `Ctrl/Cmd+Shift+Z` 重做
- 范围:Thoughts / Edges / Structures 的修改
- **不**记录:温度衰减(系统自动)、相机变换(平移/缩放)

### 3.6 Vitest 覆盖目标
- **必须 ≥85% 行覆盖率**:`core/*` 所有文件
- 测试用例:
  - `thought.test.js`:温度衰减公式在 t=0/t=14d/t=30d 的精确值,clamp 边界
  - `edge.test.js`:5 种关系类型校验,非法值抛错
  - `structure.test.js`:cohesion_score 三种输入场景(star/spread/balanced)
  - `force-engine.test.js`:空输入、单节点、1000 节点压力测试
- 命令:`pnpm test` / `pnpm test:coverage`

---

## §4 Fable5 式自推进循环工具链

### 4.1 工作流(每个 task 一轮)
```
1. 从 plans/YYYY-MM-DD-taskname.md 读下一个 task
2. 执行 task 代码变更
3. 跑 pnpm test + pnpm check:arch,确保全过
4. 自评:在 plans/<task>.md 末尾追加"完成度自评"section
   - 计划工时 vs 实际工时
   - 偏离原因
   - 不确定清单(Part 7 §3.5)
5. git commit(格式: feat|fix|chore|test(scope): message)
   - commit message 必须引用 task id 和 spec id
6. 自动取下一个 task
```

### 4.2 Backlog 维护
- 文件:`docs/superpowers/backlog.md`
- 格式:
```markdown
## In Progress
- [ ] T-005: 关系类型视觉差异化(预计 0.5 天)[90%]

## Up Next
- [ ] T-006: 温度衰减后台定时器(0.5 天)
- [ ] T-007: 节点详情面板(1 天)

## Done
- [x] T-001: 拆分 index.html (0.3 天)
- [x] T-002: 引入 pnpm + vitest (0.2 天)
```

### 4.3 异常升级(Part 9 §3.1)
- L1(单 task 验证失败)→ 我自动重试 ≤5 次,记录失败原因到 KB-3
- L2(5 次仍失败)→ 暂停 task,等用户拍板
- L3(架构约束违反)→ 立即 revert + 修 CI 规则,不修代码
- 详细规则写在 `.trae/rules/project_rules.md`

### 4.4 不在本 spec 内的 Fable5 特性(推迟)
以下 Part 11 特性**等到 Phase 1 之后**再开启:
- 自主任务生成(Backlog Groomer 子 agent):Phase 0 backlog 由我手动维护
- 自主规格补全:Phase 0 spec 已完整,不需要
- 多日断点续跑:Phase 1 再做

---

## §5 技术细节

### 5.1 `package.json`(关键字段)
```json
{
  "name": "thoughtspace-notes",
  "type": "module",
  "version": "0.0.0",
  "scripts": {
    "dev": "npx serve .",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "check:arch": "dependency-cruiser --config .dependency-cruiser.cjs src",
    "check:format": "prettier --check ."
  },
  "dependencies": {
    "yjs": "^13.6.18",
    "y-indexeddb": "^9.0.12",
    "pixi.js": "^7.4.0",
    "d3-force": "^3.0.0"
  },
  "devDependencies": {
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0",
    "dependency-cruiser": "^16.0.0",
    "prettier": "^3.3.0"
  }
}
```

### 5.2 `.dependency-cruiser.cjs`(架构护栏)
```javascript
module.exports = {
  forbidden: [
    {
      name: 'core-no-render',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: '^src/(render|ui|persistence|sim)' }
    },
    {
      name: 'core-no-third-party',
      severity: 'error',
      from: { path: '^src/core' },
      to: { path: 'node_modules/(?!d3-force)' }
    },
    {
      name: 'sim-no-render',
      severity: 'error',
      from: { path: '^src/sim' },
      to: { path: '^src/(render|ui)' }
    }
  ]
};
```

### 5.3 `.trae/rules/project_rules.md`(TRAE 项目规则)
约束 AI agent 在本项目内必须遵守的规则:
- 改 `src/core/**` 前必读 `docs/superpowers/specs/` 最新 spec
- 任何修改前 `pnpm check:arch` 必须通过
- 提交前必须跑 `pnpm test` 且全绿
- commit message 格式规范
- 引用 Part 4/8 的具体章节做 ADR

---

## §6 验收标准(DoD)

### 6.1 Phase 0 完成时必须达成的"硬指标"
| 指标 | 数值 | 验证方式 |
|---|---|---|
| `core/*` 行覆盖率 | ≥85% | `pnpm test:coverage` |
| 架构约束违规数 | 0 | `pnpm check:arch` |
| `index.html` 行数 | ≤80(纯壳) | `wc -l index.html` |
| 任何单个 src 文件行数 | ≤300 | `wc -l src/**/*.js` |
| 在浏览器打开 | 加载 < 1.5s | 手动测 |
| 拖 20 颗念头成结构 | 体感"顺滑" | 用户主观反馈 |
| 关系类型可视化 | 5 种视觉清晰区分 | 手动测 |
| 温度衰减 | 60 秒后可见 | 手动测 |
| 结晶动画 | 点击触发后流畅跑完 | 手动测 |
| 撤销/重做 | Ctrl+Z 回退最近变更 | 手动测 |

### 6.2 完成时必须上传的物
1. 拆分后的代码库(commit 历史清晰)
2. `docs/superpowers/backlog.md`(全任务标 done)
3. `docs/superpowers/plans/` 下每个 task 的自评 section
4. 一段 5 分钟使用 screencast 或 10 张连续截屏(游戏感证据)
5. 用户主观"顺滑/直观/流畅"打分 ≥7/10

---

## §7 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| PixiJS 在 ESM CDN 下加载慢 | 中 | 用户首次打开需等 2-3s | 本地 bundle 到 `vendor/`(Phase 1 再做) |
| d3-force 在 200+ 节点时掉帧 | 中 | 体验卡顿 | Phase 0 范围内限制 ≤200 节点,Phase 1+ 上物理引擎下沉到 Worker |
| Yjs+IndexedDB 偶发数据冲突 | 低 | 数据丢失 | Part 9 L3 处理流程 + 自动检查 |
| 我(LLM)在不知道 Yjs API 最新用法时出错 | 中 | task 反复重试 | "外部库用法" 引用 Part 3 §1.2 + 实际跑通为准 |
| 用户对"顺滑"定义模糊 | 高 | 反复重构 | 引入"每日 5min 试玩 + 文字反馈"机制,Phase 0 内循环校正 |

---

## §8 与既有规划文档的关系

| 引用源 | 引用要点 | 在本 spec 中的落地 |
|---|---|---|
| Part 1 §1.3 物理属性 | 念头应有质量/温度/张力 | §3.2 温度 + §3.5 撤销 |
| Part 1 §3.D 模块 D 第 16 条 | 结晶机制 | §3.4 |
| Part 2 几何结构接口 | IGeometryEngine 雏形 | §2.5 |
| Part 3 §4.3 Yjs schema | Y.Map 用法 | persistence/yjs-store.js |
| Part 3 §5.2 .dependency-cruiser | 架构护栏 | §5.2 |
| Part 4 §2.5 测试驱动 | 测试先行 | §3.6 |
| Part 8 §1.1 温度衰减公式 | exp(-λΔt) | §3.2 |
| Part 8 §1.2 结晶判定 | cohesion_score | §3.4 |
| Part 9 §3.1 L1-L4 异常分级 | 异常处理 | §4.3 |
| Part 11 §2.1 三层 DoD | task/Phase/项目 DoD | §6 |

---

## §9 不在本 spec 决策范围内的待办(给后续 spec 留接口)

1. 是否要将PixiJS打包进本地(Phase 1 评估)
2. 是否引入 pnpm 包管理(本 spec 默认引入,但您可改用 npm/yarn)
3. Vitest 覆盖阈值是否从 85% 提到 95%(Phase 1 可调)
4. 12 个几何结构何时逐个加(Phase 1 加 G3 树和 G12 管道)
5. React/Vue 引入时机(Phase 1 末或 Phase 2 初)

---

**审阅检查清单**:
- [ ] §1 战略与范围(做/不做)
- [ ] §2 目录结构与依赖约束
- [ ] §3 五大功能规格是否到位
- [ ] §4 Fable5 工作流是否太重/太轻
- [ ] §5 技术细节(package.json / CI 规则)
- [ ] §6 验收标准是否合理
- [ ] §7 风险评估
- [ ] §8 与原规划的对齐

**请在阅读后告诉我:**
- ✅ 直接 approve,进入 writing-plans
- 🔧 哪些 section 需要修改(指出具体)
- ❓ 哪些事情我理解错了(您要重新纠正)
