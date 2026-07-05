# TRAE 环境适配审计 — 2026-07-05

> 由 AI 助手在用户要求"找找 TRAE 相关的,当前会话适配 TRAE 为主"后的探查产出。
> 与 `2026-07-05-comprehensive-audit.md` 是不同维度审计:
> - 上一篇审计对象:**项目仓库内部**(L1/L2/L3 文档 / 架构 / 流程)
> - 本篇审计对象:**TRAE 运行环境的整体适配**(MCP 配置 / 项目规则 / 工作会话 / 跨平台一致性)

| 项目 | 值 |
|---|---|
| 审计时间 | 2026-07-05 17:50 |
| 审计范围 | TRAE-CN(`~/.trae-cn/`) + 当前项目(`E:\魔方心厦\`)+ MCP 加载机制 |
| 审计依据 | 实际文件状态 + user_profile.md 偏好 + project_rules.md 缺失 |
| 输出性质 | **研究性产出,不动任何配置**(用户选了 A 路线) |

---

## §1 TRAE 运行环境全景

### 1.1 当前会话的关键标识
- **会话工作目录**:`E:\魔方心厦`(用户的代码作品集)
- **TRAE 会话 ID**:`s_魔方心厦-622bb240`
- **TRAE 模式**:`solo_agent_lite`(单 agent,非 multi-agent 编排)
- **驱动模型**:Claude Sonnet(由本会话上下文推断)
- **加载的 MCP**:仅 TapTap Maker MCP(`mcp_taptap-maker`,2 个工具)
- **用户 user_profile.md 偏好**:
  - 月弓重力(small iterations, continuous, no overreach)
  - CBA 三阶段(C:meta 反思 / B:action 引导 / A:代码 + 验证)
  - orchestrator/worker 分离(主 agent 规划,子 agent 实现)
  - 阶段推进 S1→S2→S3→S4→S5→S6,每步验证

### 1.2 TRAE 的 3 层配置结构(实操视角)
| 层级 | 目录 | 作用 | 当前就绪 |
|---|---|---|---|
| 全局 | `~/.trae-cn/` | TRAE-CN 客户端的所有运行时配置(builtin skills、内置 MCP、用户级 preferences) | ✅ |
| 用户级规则 | `~/.trae-cn/user_rules/` | 当前用户的全局偏好 | ✅ 仅 1 条 |
| 项目级 | `<project>/.trae/rules/` | 当前打开的代码仓库的专属规则 | ❌ **缺失** |
| 工作会话级 | `~/.trae-cn/work/<session-id>/` | 当前对话过程的临时数据、运行产物 | ⚠️ 31 个 ESLint 调试文件残留 |

### 1.3 MCP 加载机制观察(基于工具调用测试)
- **`run_mcp` 可调用**:`mcp_taptap-maker` 提供的工具
- **不可调用**:`taptap-maker`(虽然 `~/.trae/mcp.json` 写了这个名,但 TRAE-CN 没识别)
- **结论**:MCP **命名空间是 `mcp_<server-name>`**,而 mcp.json 中的 key 只是 CLI 配置名

---

## §2 错位点清单(可整改项)

### 错位 1 ❌ P0 · MCP 配置位置错位
**现象**:
- `~/.trae/mcp.json` 存在(用户之前写入)
- `~/.trae-cn/mcp.json` 不存在
- **当前运行的 TRAE-CN 实例只读 `~/.trae-cn/mcp.json`**

**影响**:
- 用户预期 `taptap-maker` MCP 工具可用
- 实际可用的是 `mcp_taptap-maker`(命名空间自适应)
- 如果是其他 MCP 没在 `~/.trae-cn/mcp.json` 注册,会完全不可用

**风险等级**:中(对 TapTap 来说已自适应,但其他 MCP 可能漏)

### 错位 2 ❌ P0 · 项目级 `.trae/rules/project_rules.md` 缺失
**现象**:
- 仓库 `thoughtspace-notes/.trae/rules/` 不存在
- L1 宪法中 `<WORKFLOW>` 段落明文要求"进入目录前读 project_rules.md"
- spec `geb-infrastructure-bootstrap` 已设计但未实施

**影响**:
- 当前会话的 AI 在 `thoughtspace-notes` 工作时,**没有任何项目级硬约束**可直接被 TRAE 加载
- L1/L2/L3 协议目前只能靠"我(助手)在 prompt 里读 CLAUDE.md"才能生效
- 如果换一个新会话或新 agent,**宪法约束丢失**

**风险等级**:高(L1 宪法承诺但工具未落地,FATAL 死罪无法自动化)

### 错位 3 ⚠️ P1 · `thoughtspace-arcade` 完全没有 TRAE 适配
**现象**:
- `thoughtspace-arcade/CLAUDE.md` 没有同步升级为完整 13 段(早在审计 §5.4 就指出)
- `thoughtspace-arcade/.trae/` 不存在
- `thoughtspace-arcade/.gitignore` 不存在

**影响**:
- 未来当 `thoughtspace-arcade` 真正启动时,TRAE 在该仓库内"看不到任何项目规则"
- 用户的"两条路线并行"愿景失去了一半的护栏

**风险等级**:中(目前未启动,但策划阶段就该预防)

### 错位 4 ⚠️ P2 · 31 个 ESLint 调试文件残留
**现象**:
```
E:\魔方心厦\thoughtspace-notes\eslint-all.txt
E:\魔方心厦\thoughtspace-notes\eslint-all2.txt
E:\魔方心厦\thoughtspace-notes\eslint-any.txt
...(30 个)
E:\魔方心厦\thoughtspace-notes\eslint-report.json
E:\魔方心厦\thoughtspace-notes\eslint-check.txt
E:\魔方心厦\thoughtspace-notes\run-eslint.js
E:\魔方心厦\thoughtspace-notes\run-tests.js
E:\魔方心厦\thoughtspace-notes\test-page.js
E:\魔方心厦\thoughtspace-notes\playwright-test.js
E:\魔方心厦\thoughtspace-notes\fix-any.js
E:\魔方心厦\thoughtspace-notes\fix-set-state.js
E:\魔方心厦\thoughtspace-notes\fix-unused-vars.js
```

**位置**:项目根 `thoughtspace-notes/`(应当放在 `tests/` 或被 `.gitignore` 排除)

**影响**:
- 这些是历史 ESLint 集成调试期产物,污染当前仓库根目录
- 不入 `.gitignore` 的话可能被错误 git add
- 视觉上让项目根看起来很乱

**风险等级**:低(不影响功能,但违反"为学日益为道日损")

### 错位 5 ⚠️ P2 · `s_魔方心厦-622bb240/solo_agent_lite` 缺少项目元数据
**现象**:
- TRAE-CN 工作区 `~/.trae-cn/work/s_魔方心厦-622bb240/` 存在调试残留
- 但没有显式的"项目地图"文件告诉 TRAE:
  - 工作目录下有 `thoughtspace-notes/`(笔记路线)
  - 工作目录下有 `thoughtspace-arcade/`(游戏路线)
  - 当前会话涉及的 active project 是 `thoughtspace-notes`
- **重要**:本会话每一次对话,在 TRAE 工作区视角**没有锚定当前 active project**

**影响**:
- 用户切换项目时,TRAE 没有自动跟随(可能)
- 当用户说"这个项目"时,AI 需要问"是 notes 还是 arcade"
- 月弓偏好的"专注一个事"被弱化

**风险等级**:低(用户体验问题,不影响功能)

### 错位 6 ⚠️ P3 · trae-configs 与项目脱钩
**现象**:
- `~/.trae-cn/trae-configs/.env` 含 38 个 var(含 GITHUB_TOKEN / SSH)
- 但 `thoughtspace-notes/` 项目内**没有引用**这份配置
- 例:GHA / CI 时 GITHUB_TOKEN 走 `.env`,而项目内 ESLint / deployment 脚本走另一套

**影响**:
- trae-configs 与项目配置**没有联动机制**(看起来就是"碰巧放在 .trae-cn 下面")
- 实际上 trae-configs 是您跨设备同步 .env 的工具,跟项目本身没强绑定

**风险等级**:极低(看您是否打算让项目用 trae-configs,如不打算则无须修)

---

## §3 整改优先级与建议

### 整改总表(建议执行顺序)
| 序 | 优先级 | 项 | 修复成本 | 触发 spec |
|---|---|---|---|---|
| 1 | **P0** | MCP 配置位置错位 | 中(改文件 + 重启 TRAE) | 触发新 spec `trae-mcp-config-alignment-design` |
| 2 | **P0** | 项目级 project_rules.md 缺失 | 低(30 分钟) | 已存在 spec:`geb-infrastructure-bootstrap` 中 §6 已设计 |
| 3 | **P1** | arcade 仓库 13 段宪法未同步 + project_rules | 低(20 分钟) | 已存在 spec:`geb-precommit-and-l2-elevation` 中 §4 已设计 |
| 4 | **P2** | 清掉 31 个 ESLint 调试文件 + 加 `.gitignore` | 极低(5 分钟) | 顺手做 |
| 5 | **P2** | 项目元数据锚定(可选) | 低(待定方案) | 暂不写 spec |
| 6 | **P3** | trae-configs 与项目联动(可选) | 待评估 | 暂不写 spec |

### 推荐整改路线
- **短期(S1-S2)**:先做 P0 两项(改 MCP 位置 + 写 project_rules.md)— 这一份新 spec 立即可起,0.5 天可完成
- **中期(S3)**:做 P1 arcade 同步
- **长期(S4+)**:清调试文件、项目锚定、trae-configs 联动均视需要触发

---

## §4 推荐的整改 spec 起点(草案)

如要执行,建议下一份 spec:`2026-07-05-trae-mcp-and-project-rules-bootstrap-design.md`

| 项 | 内容 |
|---|---|
| 范围 | MCP 配置位置对齐 + thoughtspace-notes 项目级规则落地 |
| 前置依赖 | 无(本 spec 自身是 P0) |
| 周期 | 0.5 天 |
| 关键动作 | |
|  | 1. 把 `~/.trae/mcp.json` 内容复制到 `~/.trae-cn/mcp.json`(保持原 key 名 `taptap-maker`,因为 MCP 命名空间是 `mcp_<key>`,运行时适配) |
|  | 2. 验证:关闭 + 重开 TRAE 会话,确认 `run_mcp` 看到 `mcp_taptap-maker` |
|  | 3. 在 `thoughtspace-notes/.trae/rules/project_rules.md` 落地(spec 2 §6 已设计) |
|  | 4. 在 `thoughtspace-arcade/.trae/rules/project_rules.md` 同步(arcade L1) |
|  | 5. 反向验证:故意违反 project_rules.md 第 X 条,看 AI 是否 still 遵守(灰盒测试) |
| 验收 | (1) MCP 在 cn 版可见 (2) project_rules 在 `.trae/rules/` 出现 (3) AI 引用 project_rules 而不是 L1 CLAUDE.md |
| 风险 | (1) 复制 mcp.json 后 key 名 vs 命名空间不一致 → 先尝试保持原 key,如失败再适配 (2) 项目规则被 AI 忽略 → 调试时改用更短更尖锐的规则 |

---

## §5 整体判断

### 5.1 TRAE 当前对"项目"的感知能力
- TRAE-CN 自身 ✓ 正常
- 它看到的 MCP ✓ 已适配(命名空间有差异,运行能用)
- 它看到的项目规则 ✗ 0 个(项目级 rules/ 目录全缺)
- 它看到的项目元数据 ✗ 仅 README(没有 .trae/rules/)

### 5.2 与"月弓重力" 偏好的契合度
- **结构性契合**:TRAE 单 agent + 用户 orchestrator/worker 偏好 = 完美(主 agent = 我,worker = brainstorming / writing-plans 工具)
- **流程性契合**:CBA 三阶段(C 反思 → B 引导 → A 代码)与 L1 `<thinking>` 现象/本质/哲学三层跃迁 = 天然契合
- **未契合**:
  - "阶段推进 S1→S2...→验证"在项目根 L1 写明但未机械化(无 check:all 命令)
  - "避免过度伸展"原则尚未落实为 pre-commit hook

### 5.3 AI agent 与 TRAE 当前的对话协议
- 我(AI 助手)的输出风格:Linus 严格挑剔 + 道家熵减哲学 + GEB 同构守护
- TRAE 客户端 UI 的支持:Markdown 渲染正常、代码块语法高亮正常、文件链接可点击
- **当前最大缺口**:**没有 `.trae/rules/project_rules.md` 作为该工作会话的"硬约束"**——L1 宪法依赖"AI 自觉遵守",没有强制力

---

## §6 本审计自身的 GEB 自检

- ✅ 占位扫描:0 命中
- ✅ 引用关系:本报告与上一篇 audit 引用关系明确(本报告探测 TRAE 环境,上一篇探测项目内文档)
- ✅ 范围聚焦:仅审计不动手
- ✅ 后续动作建议写成 spec 起点,**留待用户决策**
- ⚠️ 本报告未带 `[PROTOCOL]` 标记 — 与上一致(audit 产出物非 GEB 体系内文档,可豁免,但**若要把 audit 改造成 L3 文档,补上即可**)
- ✅ 命名:`2026-07-05-trae-environment-fit-audit.md` 符合 YYYY-MM-DD-<topic>-md 规范
- ✅ 路径:`docs/audit/`(已有 L2:docs/audit/CLAUDE.md)

---

## §7 一句话总结

**TRAE-CN 自身健康,但缺一层"项目级规则 + MCP 配置对齐"**,在 P0 顺位上要落地 `.trae/rules/project_rules.md` 和 MCP 配置位置修正,然后再谈后续。本审计**不动任何配置**,仅给出一份可整改清单 + 推荐的下一步 spec 起点。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
