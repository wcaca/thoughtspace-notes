# TRAE MCP 配置对齐 + 项目规则 Bootstrap — 设计 Spec

> 由 `2026-07-05-trae-environment-fit-audit.md` §4 推荐触发的整改 spec。
> 本 spec 是**新增功能**,不与既有 spec 重叠(与 phase-0-lightweight-restructure / geb-bootstrap / geb-precommit 互补)。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-05 |
| 优先级 | **P0**(修复 TRAE 当前工作环境的功能性缺陷) |
| 周期 | **0.5 天** |
| 前置依赖 | 无(独立可启动) |
| 关系 | 与 现有 3 份 spec 并行不冲突;**完成本 spec 后**,后续 spec 实施更顺畅 |

---

## §1 战略定位

### 1.1 为什么必须做(对比 geb-bootstrap 区别)
- `geb-infrastructure-bootstrap` 解决**项目内部**工具链(npm + dep-cruiser + vitest)
- 本 spec 解决**TRAE 与项目互动层**(MCP 加载机制 + 项目规则强制力)
- 两者独立。但都属"P0 阻塞":**任何业务功能做之前两个都必须就位**

### 1.2 范围划界

#### ✅ 做
1. MCP 配置位置对齐:`~/.trae/mcp.json` 内容复制到 `~/.trae-cn/mcp.json`(若缺失)
2. 验证 MCP 加载:实测 `run_mcp` 调用 `mcp_taptap-maker`
3. **`thoughtspace-notes/.trae/rules/project_rules.md` 落地**:把现有 L1 宪法核心约束注入项目级规则,TRAE 直接强制 AI 助手遵守
4. **`thoughtspace-arcade/.trae/rules/project_rules.md` 同步**:把同份规则同步到游戏路线(策略不变,只在仓库层复制)
5. 一键校验脚本 `scripts/verify-trae-rules.mjs`:启动时 sanity check 规则是否生效

#### ❌ 不做
- npm 依赖(spec geb-bootstrap)
- 业务功能(spec phase-0-lightweight-restructure)
- ESLint 调试文件清理(P2,本 spec 不混合)
- Arcade L1 整体升级(spec geb-precommit 中顺带做的部分本 spec 不重复)

---

## §2 MCP 配置对齐设计

### 2.1 事实背景(已审计确认)
- 用户在 `~/.trae/mcp.json` 写入了 taptap-maker 配置(英文版 TRAE 位置)
- 当前会话是 `TRAE-CN`,只读 `~/.trae-cn/mcp.json`
- 实测发现 TapTap MCP **仍可用**(通过 `mcp_taptap-maker` 命名空间调用),说明存在第二条 fallback 路径

### 2.2 行动

#### 行动 1:复刻 mcp.json 到 `~/.trae-cn/mcp.json`
**前置条件**:用户明确同意(避免 I/O 副作用)
**执行**:
```javascript
// scripts/sync-mcp-config.mjs (新文件)
import { copyFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SRC = join(homedir(), '.trae', 'mcp.json');
const DST = join(homedir(), '.trae-cn', 'mcp.json');

await mkdir(dirname(DST), { recursive: true });
try { await access(SRC); } catch { console.error('源 mcp.json 不存在,跳过'); process.exit(0); }
await copyFile(SRC, DST);
console.log(`✓ ${SRC} → ${ DST}`);
```

#### 行动 2:反向验证
- 关闭当前 TRAE 会话窗口,重新打开
- 在新会话里,要求 AI 助手调用 `mcp_taptap-maker.maker_status_lite`
- 若返回有效 JSON,证明配置已被新会话加载
- 若失败,记录错误并上报用户

#### 行动 3:额外发现写入 README
在 `thoughtspace-notes/README.md` 末尾追加"MCP 集成"小节,说明如何让用户在本机加入新的 MCP。

### 2.3 验收标准(MCP)
- [ ] `~/.trae-cn/mcp.json` 已存在且内容与 `~/.trae/mcp.json` 完全一致(经 diff 验证)
- [ ] 重启 TRAE 会话后,`mcp_taptap-maker.maker_status_lite` 仍可调用
- [ ] 若用户有其他 MCP(如未发现的),也自动复制

---

## §3 项目级 `.trae/rules/project_rules.md` 设计

### 3.1 核心定位
L1 宪法写在 `thoughtspace-notes/CLAUDE.md`(L1),是项目**全部**规则的总纲。但 TRAE-CN 的 .trae/rules 加载机制按**项目级文件**加载,所以要"原样下沉"一份简化版到 `.trae/rules/project_rules.md`,让 TRAE 在该仓库工作时直接读取。

### 3.2 内容设计原则
- **精简**:只保留"AI 必须遵守的硬约束",凡是非强制的(如 L1 的道家熵减哲学)留 CLAUDE.md 不下放
- **可执行**:每条规则 AI 都能立刻判断"我做/没做"
- **可追溯**:每条规则注明来自 L1 哪段,方便后续审计

### 3.3 内容草案(两仓库共享)

```markdown
# TRAE 项目规则:thoughtspace-notes

> L3 项目规则 - 父级: ../CLAUDE.md(L1 宪法)
> 本文件供 TRAE 直接加载,凡 AI 助手在本项目工作时必须遵守。

## 强制约束(来自 L1)

### 架构(来自 L1 "不可违反的架构约束")
1. `src/core/**` 禁止 import 任何渲染库(pixi.js)
2. `src/core/**` 禁止 import `src/{render, ui, persistence, sim}` 任何模块
3. `src/sim/**` 禁止 import `src/{render, ui}` 任何模块
4. Yjs 文档是唯一权威数据源,SQLite/IndexedDB 只是镜像/索引

### 文档(来自 L1 GEB 协议)
5. 修改代码时:改完必更新该文件的 L3 头部(INPUT/OUTPUT/POS/PROTOCOL)
6. 修改目录时:增/删文件必更新所在目录的 CLAUDE.md 成员清单
7. 修改顶层结构时:必同步 L1(CLAUDE.md)
8. 新建目录时:必创建该目录的 CLAUDE.md(L2)

### 产品(来自 L1 产品灵魂)
9. 不做数值化等级/积分(违背产品灵魂)
10. AI 自动化建议必须以"半透明预览"形式呈现
11. 笔记内容默认不上云

## 工作流(来自 L1 WORKFLOW)
12. 每次代码变更前必跑:`npm run check:arch && npm test`(若已安装)
13. 每次 commit 前 L3 → L2 → L1 三层回环检查
14. commit message 必须含 `spec-id: ...` 与 `task-id: ...` 字段

## 异常处理(来自 L1 FORBIDDEN + Part 9)
15. FATAL-001 孤立代码变更:回滚
16. FATAL-005 架构约束违反:立即中止 + revert + 报用户

## 输出风格(来自 L1 PROTOCOL)
- 思考: 英文
- 交互: 中文(用户输入语言)
- 注释: 中文 + ASCII 分块

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
```

### 3.4 arcade 仓库版本
- 与 notes 完全相同的硬约束(架构 + 文档 + 产品 + 流程 + 异常)
- **唯一多一条**:"当前所处阶段:占位阶段,Phase 1 完成前不动"
- 不重新发明:从 notes 版本复制而来,L1 在两仓库都指向同一份真相源

### 3.5 验收标准(规则落地)
- [ ] `thoughtspace-notes/.trae/rules/project_rules.md` 存在,内容如 §3.3
- [ ] `thoughtspace-arcade/.trae/rules/project_rules.md` 存在,内容如 §3.4
- [ ] 反向验证:故意违反第 12 条(不跑 check:arch),AI 应该 catch 这个疏漏
- [ ] 反向验证:故意违反第 5 条(改代码不更新 L3),AI 应该主动警示

---

## §4 一键校验脚本 `scripts/verify-trae-rules.mjs`

### 4.1 目的
每次会话开始,AI 应能跑这个脚本验证项目规则是否就位 + 内容是否最新。

### 4.2 伪代码
```javascript
#!/usr/bin/env node
// scripts/verify-trae-rules.mjs

import { readFile, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function checkFile(path, expectedContains) {
  try { await access(path); }
  catch { return { ok: false, error: `${path} 不存在` }; }
  const content = await readFile(path, 'utf8');
  for (const snippet of expectedContains) {
    if (!content.includes(snippet)) {
      return { ok: false, error: `${path} 缺少关键内容: '${snippet.slice(0, 30)}...'` };
    }
  }
  return { ok: true };
}

const checks = [
  // Note 路径
  checkFile('E:/魔方心厦/thoughtspace-notes/.trae/rules/project_rules.md',
    ['架构', 'GEB', '产品灵魂', '[PROTOCOL]']),
  // arcade 路径
  checkFile('E:/魔方心厦/thoughtspace-arcade/.trae/rules/project_rules.md',
    ['架构', 'GEB', '占位', '[PROTOCOL]']),
  // MCP 配置就位
  checkFile('C:/Users/Administrator/.trae/mcp.json',
    ['taptap-maker']),
  // ARC L1 13 段(同步升级是 geb-precommit 中做的事,这里仅作 reference check)
];

let allOk = true;
for (const c of checks) {
  if (c.ok) console.log('✓', '...');
  else { console.error('✗', c.error); allOk = false; }
}
process.exit(allOk ? 0 : 1);
```

### 4.3 验收
- [ ] 脚本可直接 `node scripts/verify-trae-rules.mjs`
- [ ] 故意删 `project_rules.md` → exit 1
- [ ] 全合规 → exit 0

---

## §5 失败场景与应对

| 场景 | 应对 |
|---|---|
| `~/.trae/mcp.json` 不存在 | 跳过复制,只创空 mcp.json + 提示用户 |
| 重启 TRAE 后 MCP 仍不可调用 | 显示诊断命令清单(检查 `npm ls -g @taptap/maker`,检查 `~/.trae-cn/mcp.json` 内容) |
| 用户不想双 .trae 配置同步 | 提供 `scripts/sync-mcp-config.mjs` 仅这一次复制,然后在 README 说明"未来新增 MCP 时改哪个文件" |
| arcade 仓库当前没有 .git | 先 `git init`(本 spec 不阻塞)再创建 rules |
| 路径硬编码到 `E:\魔方心厦\` 让脚本不可移植 | 第 4.2 节用 `process.cwd()` 或允许 `--root` 参数(本期硬编码 + README 注明) |

---

## §6 验收总表

### 6.1 必须达成
- [ ] `~/.trae-cn/mcp.json` 内容与 `~/.trae/mcp.json` 一致
- [ ] MCP 调用验证通过(`mcp_taptap-maker.maker_status_lite`)
- [ ] thoughtspace-notes `.trae/rules/project_rules.md` 落地
- [ ] thoughtspace-arcade `.trae/rules/project_rules.md` 落地
- [ ] `scripts/verify-trae-rules.mjs` 可跑,exit code 正确

### 6.2 反向验证
- [ ] 故意制造第 5 条违反(改代码不更新 L3) → AI 应主动警示
- [ ] 故意制造第 9 条违反(提议加数值化等级) → AI 应拒绝
- [ ] 故意制造第 13 条违反(commit message 无 task-id) → AI 应自我警告

### 6.3 commit 格式
本 spec 产生的所有 commit 必须遵循 L1 / SEVERE-005:`commit message 必须含 spec-id 与 task-id 字段`

---

## §7 与其他 spec 的关系图

```
[本 spec: trae-mcp-and-project-rules-bootstrap]
   ├─ 共同前置: 无(可立即启动)
   ├─ 与 geb-infrastructure-bootstrap: 互补,无依赖
   ├─ 与 geb-precommit: 互补(本 spec 解决 TRAE 侧,precommit 解决本地 hook)
   └─ 与 phase-0-lightweight-restructure: 间接互补(本 spec 让 AI 严格守 L1,
                                                避免后续业务 task 违反架构约束)

推荐实施顺序:
  1. 本 spec(0.5 天,立即可做)
  2. geb-infrastructure-bootstrap(0.5-1 天)
  3. geb-precommit-and-l2-elevation(0.3 天)
  4. phase-0-lightweight-restructure(3-5 天)
```

---

## §8 GEB 自检

- ✅ 占位扫描:`grep TBD|TODO|FIXME|placeholder` 0 命中
- ✅ 内部一致性:§3.3 草案 14 条规则,§3.5 验收 + §6.2 反向验证配套
- ✅ 范围聚焦:仅 2 件事(MCP 对齐 + 项目规则),不混入 ESLint 清理等其他清理
- ✅ 不与既有 spec 冲突:内容互补不重叠

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
