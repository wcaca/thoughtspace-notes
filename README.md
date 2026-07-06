# thoughtspace-notes

> **念头空间 · 笔记路线** — 一款"笔记 → 念头 → 结构 → 觉察"一体化的空间化思维整理工具,游戏感交互。

## 🧭 战略决策(2026-07)
**先做软件本体,平台后适配。**
- 本仓库是"念头空间"的**唯一真相源**,形态是用户本机运行的桌面/Web 应用
- TapTap 小游戏 / 移动端 / Web SaaS 等平台适配**暂不启动**
- 平台适配会在 Phase 1 MVP 完成、用户实测反馈"手感顺手"达标后,以**可拆卸适配层**的形式接入

## 🎯 当前阶段:Phase 0 — 概念验证
- 验证无限画布 + 力导向布局 + 拖拽/连线的交互手感
- 0 个 npm 依赖之外的框架依赖(纯 PixiJS + d3-force + Yjs + IndexedDB)
- 在浏览器打开 `index.html` 即可试玩

## 🚀 试玩 Phase 0
```bash
git clone https://github.com/wcaca/thoughtspace-notes.git
cd thoughtspace-notes
npm install    # ⚠️ 自动装 pre-commit hook(GEB 门禁生效)
# 浏览器打开 index.html
# 单击空白处投念头 · 拖动聚集 · Shift+点击连线 · 刷新看持久化
```

## 📐 路线总览
详见仓库内 `docs/` 下 14 份规划文档(Part 1-12 + GEB 协议 + 早期原型)。

| Phase | 目标 | 周期(预估) |
|---|---|---|
| **0** 当前 | 验证核心交互手感 | 2-4 周 |
| 1 | MVP(笔记/星团/树/管道/观察模式 + SQLite 索引) | 1-2 月 |
| 2 | 游戏化深化(温度衰减/结晶/计时静观/回顾仪式) | 2-3 月 |
| 3 | 智能辅助(AI 拆分建议/意外重逢) | 2-3 月 |
| 4 | 多端协作(React Native + CRDT 同步) | 3 月+ |

## 📚 文档导航

**任何进入项目的人/Agent,按以下顺序读**:

| # | 路径 | 角色 | 谁需要 |
|---|---|---|---|
| 1 | [CLAUDE.md](CLAUDE.md) | 项目宪法 · L1 | **必读**(人 + Agent) |
| 2 | [docs/topology-priority.md](docs/topology-priority.md) | 状态视图 · L1.5 | **必读**(改文件前查) |
| 3 | [docs/methodology/README.md](docs/methodology/README.md) | 编程方法论 · L1.6 | **可复用**(跨项目) |
| 4 | [docs/notes/README.md](docs/notes/README.md) | 项目笔记 · L2.5 | 按需(遇到陷阱查) |
| 5 | [docs/superpowers/specs/](docs/superpowers/specs/) | 本项目设计 spec · L2 | 做对应任务前 |
| 6 | [docs/superpowers/plans/](docs/superpowers/plans/) | 本项目实施 plan · L2 | 做对应任务前 |
| 7 | [docs/DEBUG_NOTES.md](docs/DEBUG_NOTES.md) | 调试速查 | 出 bug 时 |

### 编程方法论(可移植到其他项目)
- [01 设计思维](docs/methodology/01-design-thinking.md) — 一次一问 + 整合不抛弃
- [02 spec 驱动开发](docs/methodology/02-spec-driven-dev.md) — spec → plan → implement
- [03 拓扑优先级表](docs/methodology/03-topology-priority.md) — 5 状态机治理
- [04 按需加载笔记](docs/methodology/04-on-demand-notes.md) — pitfalls/decisions/data-flow
- [05 系统性调试](docs/methodology/05-debug-systematic.md) — trace data flow
- [06 架构守卫](docs/methodology/06-arch-guard.md) — CI 守住分层
- [07 SP-1 案例](docs/methodology/07-sp1-case-study.md) — 方法怎么一起用
- [08 跨视角并行审查](docs/methodology/08-cross-review.md) — agent team 强项;SP 收尾阈值

### 仓库治理
- 架构守卫:`npm run check:arch`(dependency-cruiser)
- GEB 守卫:`npm run check:geb`(L3 完整性)
- 注释门禁:`npm run check:notes`(`@note` 链接完整性)
- 一把全跑:`npm run check:all`
- 自动化钩子:`npm install` 时自动装 pre-commit

## 🔗 关联仓库
- **游戏路线(占位)**: https://github.com/wcaca/thoughtspace-arcade — 等笔记路线稳了再启动

## 📜 协议
- [LICENSE](LICENSE) — MIT
- 遵循 GEB 分形文档协议(详见 [CLAUDE.md](CLAUDE.md))