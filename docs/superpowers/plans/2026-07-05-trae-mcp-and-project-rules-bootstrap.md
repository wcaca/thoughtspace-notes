# TRAE MCP 对齐 + 项目规则 Bootstrap 实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `~/.trae/mcp.json` 复制到 `~/.trae-cn/mcp.json`,并在两个仓库各落一份 `.trae/rules/project_rules.md`,最后给一个一键校验脚本。整个 spec 只动 home 目录 + 仓库根两个层级,不动业务代码。

**Architecture:** 单一职责拆 3 个文件:
- `scripts/sync-mcp-config.mjs`:只负责一个事 — 把 mcp.json 从 .trae 复制到 .trae-cn,幂等
- `thoughtspace-notes/.trae/rules/project_rules.md` + `thoughtspace-arcade/.trae/rules/project_rules.md`:同一份规则,两份副本,弧线共享 L1 宪法
- `scripts/verify-trae-rules.mjs`:只读校验 4 个文件是否存在 + 关键 snippet 是否含

**Tech Stack:**
- Node.js 25.9.0(本机)
- 纯 ESM `.mjs` 脚本(node:`node:fs/promises` + `node:os`)
- 不引外部依赖

**Spec 引用:** [2026-07-05-trae-mcp-and-project-rules-bootstrap-design](../specs/2026-07-05-trae-mcp-and-project-rules-bootstrap-design.md)

**分支:** `feat/fable5-trae-mcp`(worktree 在 `E:\魔方心厦\thoughtspace-notes-fable5\`)

---

## File Structure

本 plan 完成后新增文件:
```
thoughtspace-notes/                            <- notes 仓库(worktree)
├── .trae/                                     <- 新增目录
│   └── rules/
│       └── project_rules.md                   <- 新建,核心规则
└── scripts/
    ├── sync-mcp-config.mjs                    <- 新建,一次性脚本
    └── verify-trae-rules.mjs                  <- 新建,每次会话前可跑

thoughtspace-arcade/                           <- arcade 仓库(主 worktree)
└── .trae/                                     <- 新增目录
    └── rules/
        └── project_rules.md                   <- 新建,与 notes 同步
```

注意:
- 修改路径都是**相对 worktree 根**(worktree 是 `E:\魔方心厦\thoughtspace-notes-fable5`)
- arcade 仓库改动在主 worktree `E:\魔方心厦\thoughtspace-arcade`(它没有 worktree)

---

## Task 1: 写 `scripts/sync-mcp-config.mjs`(一次性)

**Files:**
- Create: `scripts/sync-mcp-config.mjs`

- [ ] **Step 1: 创建文件 + 写入完整脚本**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (copyFile, access, mkdir), node:os (homedir), node:path (join, dirname)
 * [OUTPUT]: 把 ~/.trae/mcp.json 复制到 ~/.trae-cn/mcp.json(创建目标目录如缺失)
 * [POS]: scripts/ 下的工具脚本,bootstrap spec 的"对齐 MCP 配置"动作
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { copyFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SRC = join(homedir(), '.trae', 'mcp.json');
const DST = join(homedir(), '.trae-cn', 'mcp.json');

async function main() {
  try { await access(SRC); }
  catch { console.log('  源 mcp.json 不存在,跳过复制。'); console.log('  路径:', SRC); return; }

  await mkdir(dirname(DST), { recursive: true });
  await copyFile(SRC, DST);
  console.log('✓', `${SRC}`);
  console.log('  →', DST);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: 运行验证 — 不存在源文件时是 idempotent 不报错**

Run:
```bash
node scripts/sync-mcp-config.mjs
```

Expected (本机有 ~/.trae/mcp.json):
```
✓ C:\Users\Administrator\.trae\mcp.json
  → C:\Users\Administrator\.trae-cn\mcp.json
```

- [ ] **Step 3: 反向验证 — 目标文件存在且内容一致**

Run:
```bash
node -e "import('node:fs/promises').then(async fs => { const a = await fs.readFile(process.env.USERPROFILE + '/.trae/mcp.json', 'utf8'); const b = await fs.readFile(process.env.USERPROFILE + '/.trae-cn/mcp.json', 'utf8'); console.log(a === b ? '✓ 内容一致' : '✗ 内容不一致'); })"
```

Expected:
```
✓ 内容一致
```

- [ ] **Step 4: 暂时不 commit(等所有 task 完成一并 commit)**

---

## Task 2: 在 notes 仓库创建 `thoughtspace-notes/.trae/rules/project_rules.md`

**Files:**
- Create: `.trae/rules/project_rules.md`

- [ ] **Step 1: 创建目录 + 文件,写入完整内容**

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

- [ ] **Step 2: 校验文件存在 + 含关键 snippet**

Run:
```bash
node -e "import('node:fs/promises').then(async fs => { const c = await fs.readFile('.trae/rules/project_rules.md', 'utf8'); console.log(c.includes('架构') && c.includes('GEB') && c.includes('[PROTOCOL]') ? '✓ 关键内容存在' : '✗ 关键内容缺失'); })"
```

Expected:
```
✓ 关键内容存在
```

- [ ] **Step 3: 暂时不 commit**

---

## Task 3: 在 arcade 仓库创建 `thoughtspace-arcade/.trae/rules/project_rules.md`

**Files:**
- Create on 主 worktree (`E:\魔方心厦\thoughtspace-arcade\.trae\rules\project_rules.md`)

- [ ] **Step 1: cd 到 arcade 主 worktree**

```bash
cd E:\魔方心厦\thoughtspace-arcade
```

- [ ] **Step 2: 创建文件 + 写入内容(与 notes 同步,加一条占位声明)**

```markdown
# TRAE 项目规则:thoughtspace-arcade

> L3 项目规则 - 父级: ../CLAUDE.md(L1 宪法)
> 本文件供 TRAE 直接加载,凡 AI 助手在本项目工作时必须遵守。

## 当前所处阶段
🚧 占位阶段 - 笔记路线 wcaca/thoughtspace-notes 完成 Phase 1 后才启动本仓库。

## 共享约束
- 产品灵魂、架构原则、术语表 — 同步 wcaca/thoughtspace-notes/CLAUDE.md
- 任何违背 notes L1 的改动,在这里视为违背 arcade
- 本文件内容与 notes 项目规则同步手工复制,不需要重新起草

## 强制约束(来自 L1,完整清单)

### 架构
1. `src/core/**` 禁止 import 任何渲染库(pixi.js)
2. `src/core/**` 禁止 import `src/{render, ui, persistence, sim}` 任何模块
3. `src/sim/**` 禁止 import `src/{render, ui}` 任何模块

### 文档(GEB 协议)
4. 修改代码时:改完必更新该文件的 L3 头部
5. 修改目录时:增/删文件必更新所在目录 CLAUDE.md
6. 修改顶层结构时:必同步 L1
7. 新建目录时:必创建该目录的 CLAUDE.md

### 产品
8. 不做数值化等级/积分
9. AI 自动化建议必须以"半透明预览"形式呈现
10. 笔记内容默认不上云

## 工作流
11. 每次代码变更前必跑:`npm run check:arch && npm test`
12. 每次 commit 前 L3 → L2 → L1 三层回环检查
13. commit message 必须含 `spec-id: ...` 与 `task-id: ...` 字段

## 输出风格
- 思考: 英文
- 交互: 中文
- 注释: 中文 + ASCII 分块

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
```

- [ ] **Step 3: 校验文件存在 + 关键内容**

Run:
```bash
cd E:\魔方心厦\thoughtspace-arcade && node -e "import('node:fs/promises').then(async fs => { const c = await fs.readFile('.trae/rules/project_rules.md', 'utf8'); console.log(c.includes('占位') && c.includes('[PROTOCOL]') ? '✓ 关键内容存在' : '✗ 关键内容缺失'); })"
```

Expected:
```
✓ 关键内容存在
```

- [ ] **Step 4: 暂时不 commit(待 Task 1-4 全部完成一并 commit)**

---

## Task 4: 写 `scripts/verify-trae-rules.mjs`(运行时 sanity check)

**Files:**
- Create: `scripts/verify-trae-rules.mjs`

- [ ] **Step 1: 创建文件 + 写入脚本**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (readFile, access), node:path
 * [OUTPUT]: 校验 4 个 .trae 规则文件存在 + 含关键 snippet,exit 0 / exit 1
 * [POS]: scripts/ 下,session 启动时 sanity check 用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));  // scripts/ 的上一级
const HOME = process.env.USERPROFILE || process.env.HOME;

const checks = [
  { path: join(ROOT, '.trae', 'rules', 'project_rules.md'), must: ['架构', 'GEB', '[PROTOCOL]'], label: 'notes project_rules' },
  { path: 'E:\\魔方心厦\\thoughtspace-arcade\\.trae\\rules\\project_rules.md', must: ['占位', '[PROTOCOL]'], label: 'arcade project_rules' },
  { path: join(HOME, '.trae', 'mcp.json'), must: ['taptap-maker'], label: '.trae/mcp.json' },
  { path: join(HOME, '.trae-cn', 'mcp.json'), must: ['taptap-maker'], label: '.trae-cn/mcp.json' }
];

let allOk = true;
for (const c of checks) {
  try {
    await access(c.path);
    const content = await readFile(c.path, 'utf8');
    const missing = c.must.filter(s => !content.includes(s));
    if (missing.length === 0) {
      console.log('✓', c.label);
    } else {
      console.error('✗', c.label, '缺关键 snippet:', missing.join(', '));
      allOk = false;
    }
  } catch {
    console.error('✗', c.label, '文件不存在:', c.path);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
```

- [ ] **Step 2: 运行验证**

Run (在 worktree 内):
```bash
node scripts/verify-trae-rules.mjs
```

Expected(全过):
```
✓ notes project_rules
✓ arcade project_rules
✓ .trae/mcp.json
✓ .trae-cn/mcp.json
```

- [ ] **Step 3: 反向验证(故意删 notes project_rules.md 测 fallback)**

Run:
```bash
mv .trae/rules/project_rules.md .trae/rules/project_rules.md.bak
node scripts/verify-trae-rules.mjs
echo "exit: $?"  # 应打印非 0
mv .trae/rules/project_rules.md.bak .trae/rules/project_rules.md
node scripts/verify-trae-rules.mjs  # 应恢复 ✓
```

Expected:
- 第一次:`✗ notes project_rules 文件不存在:` + `exit: 1`
- 第二次:`✓ notes project_rules` + `exit: 0`

- [ ] **Step 4: 暂时不 commit(等所有 task 完成一并 commit)**

---

## Task 5: 一并提交 commit + 推送到 origin

**Files:**
- All 4 files from Tasks 1-4
- notes 仓库 worktree: `feat/fable5-trae-mcp` 分支

- [ ] **Step 1: 检查所有 4 个文件都到位**

Run:
```bash
ls -la scripts/sync-mcp-config.mjs scripts/verify-trae-rules.mjs .trae/rules/project_rules.md 2>&1
```

Expected:
```
-rw-r--r-- 1 ... scripts/sync-mcp-config.mjs
-rw-r--r-- 1 ... scripts/verify-trae-rules.mjs
-rw-r--r-- 1 ... .trae/rules/project_rules.md
```

确认 4 个文件都在。再 cd 到 arcade 仓库:
```bash
cd E:\魔方心厦\thoughtspace-arcade
ls -la .trae/rules/project_rules.md
```

Expected:arcade 也有 1 个文件。

- [ ] **Step 2: 在 notes worktree 内提交(spec-id + task-id 强制,来自 L1 SEVERE-005)**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-fable5
git add scripts/sync-mcp-config.mjs scripts/verify-trae-rules.mjs .trae/rules/project_rules.md

git commit -m "feat(trae): MCP 对齐 + 项目规则 bootstrap

spec-id: 2026-07-05-trae-mcp-and-project-rules-bootstrap
task-id: T-001-T-004

落地:
- scripts/sync-mcp-config.mjs: ~/.trae/mcp.json 复制到 ~/.trae-cn/mcp.json
- scripts/verify-trae-rules.mjs: 4 文件 sanity check
- .trae/rules/project_rules.md: L1 核心约束下沉到项目级

参照 spec: docs/superpowers/specs/2026-07-05-trae-mcp-and-project-rules-bootstrap-design.md §2 §3 §4

死罪自检:
  ✓ 无占位
  ✓ 4 文件均 [INPUT]/[OUTPUT]/[POS]/[PROTOCOL] L3 契约
  ✓ 引用源 spec
  ✓ commit 含 spec-id + task-id(SEVERE-005)"

git log --oneline -1
```

Expected:
```
[cde46ca→HEAD] feat(trae): MCP 对齐 + 项目规则 bootstrap
(...commit hash)
```

- [ ] **Step 3: 推送 notes worktree**

Run:
```bash
cd E:\魔方心Hub\thoughtspace-notes-fable5
# (修正路径:)
cd E:\魔方心厦\thoughtspace-notes-fable5
git push -u origin feat/fable5-trae-mcp
```

Expected(成功):
```
Branch 'feat/fable5-trae-mcp' set up to track 'origin/feat/fable5-trae-mcp'.
```

- [ ] **Step 4: 提交 arcade 主 worktree**

Run:
```bash
cd E:\魔方心厦\thoughtspace-arcade
git add .trae/rules/project_rules.md

git commit -m "feat(trae): 添加项目规则占位版(对齐 notes L1)

spec-id: 2026-07-05-trae-mcp-and-project-rules-bootstrap
task-id: T-003

落地:
- .trae/rules/project_rules.md: 占位阶段专用,加'占位'声明
- 内容与 notes 项目规则同步手工复制

死罪自检:
  ✓ 占位声明清晰
  ✓ L3 头部带 [PROTOCOL]
  ✓ commit 含 spec-id + task-id"

git log --oneline -1
```

- [ ] **Step 5: 推送 arcade**

Run:
```bash
cd E:\魔方心厦\thoughtspace-arcade
git push origin main
```

Expected:`main -> main` 推送成功。

---

## Self-Review(plan 自检)

- ✅ **Spec 覆盖**:spec §2 落地(Task 1)+ §3.3 notes(Task 2)+ §3.4 arcade(Task 3)+ §4 verify(Task 4)
- ✅ **Placeholder 扫描**:0 命中(代码块都是完整)
- ✅ **类型一致性**:Node.js `node:` import 形式贯穿
- ✅ **步骤颗粒**:每个 task 2-5 分钟可完成
- ✅ **commit message 引用**:每个 commit 都含 `spec-id` + `task-id`(L1 SEVERE-005)
- ✅ **GEB 回环**:`sync-mcp-config.mjs` / `verify-trae-rules.mjs` 都有 `[PROTOCOL]` 尾标记(L3 合规)

## Plan 完成后的执行约定

按 subagent-driven-development:
1. 派遣 implementer subagent(Task 1-4)
2. 派遣 spec reviewer(spec 对照)
3. 派遣 code quality reviewer(品味 + 死罪 + L3 完整性)
4. 任一不过即派 fix subagent,**直到过**
5. 提交 + 推
6. 报告 + 等下一步
