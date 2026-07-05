# GEB Pre-commit + L2 升级 实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** 在 thoughtspace-notes 项目上落 pre-commit hook + 升级 3 个文档(L2→L3 + backlog + arcade L1)。

**Architecture:** 5 个文件变更:
- `scripts/hooks/pre-commit` — bash 脚本,跑 `npm run check:all`,失败 reject commit
- `scripts/install-hooks.mjs` — Node 脚本,把钩子复制到 `.git/hooks/`,幂等
- `scripts/check-geb.mjs` — 在 notes worktree 内**已经存在**(PR #2 后),需补"L3 缺位"反向用例
- `docs/superpowers/specs/CLAUDE.md` + `docs/superpowers/plans/CLAUDE.md` — 升级为 L3 契约式
- `thoughtspace-arcade/CLAUDE.md` — 同步升级为完整 13 段(在主 worktree)

**Tech Stack:**
- bash(Git for Windows 自带)
- Node.js(node:fs/promises)
- 修改的 scripts 已有(PR #2 创建的 check-geb.mjs),本 plan 只做"补差"

**Spec 引用:** [2026-07-05-geb-precommit-and-l2-elevation-design](../specs/2026-07-05-geb-precommit-and-l2-elevation-design.md)

**Worktree:** `E:\魔方心厦\thoughtspace-notes-precommit`(分支 `feat/geb-precommit`)

---

## File Structure

本 plan 完成后新增/修改文件:
```
thoughtspace-notes-precommit/
├── scripts/
│   ├── hooks/
│   │   └── pre-commit                # 新建(模板)
│   ├── install-hooks.mjs             # 新建
│   └── check-geb.mjs                  # 修改(PR #2 已存在,加 L3 缺位反向用例)
├── docs/superpowers/
│   ├── specs/CLAUDE.md               # 修改(L3 契约式)
│   └── plans/CLAUDE.md               # 修改(L3 契约式)
└── docs/superpowers/plans/2026-07-05-geb-precommit-and-l2-elevation.md  # 本 plan

thoughtspace-arcade/                  <- 主 worktree 改
└── CLAUDE.md                          # 修改(升级为完整 13 段)
```

---

## Task 1: scripts/hooks/pre-commit(bash 模板)

**Files:**
- Create: `scripts/hooks/pre-commit`

- [ ] **Step 1: 创建文件 + 写入完整 bash 脚本**

```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit (本文件由 scripts/install-hooks.mjs 复制过去)
# GEB pre-commit 钩子:每次 commit 前自动跑 npm run check:all
# 失败即 reject commit(对应 L1 FATAL-001/002/004/005)
set -e

echo "→ GEB pre-commit: running check:all"

# 仅当有 stage 文件时跑检查
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs|cjs|html|md)$' | tr '\n' ' ')

if [ -z "$STAGED" ]; then
  echo "  (no JS/MD staged, skipping check)"
  exit 0
fi

# Windows 下用 npm.cmd 兼容 spawn
NPM_CMD="npm"
if [ "$(uname)" = "MINGW"* ] || [ "$OS" = "Windows_NT" ]; then
  NPM_CMD="npm.cmd"
fi

echo "  staged: $STAGED"

# 三个串行检查,任一失败 → exit 1
$NPM_CMD run check:arch || { echo "  ✗ FATAL: architecture rule violated (FATAL-005)"; exit 1; }
$NPM_CMD run check:geb  || { echo "  ✗ FATAL: GEB protocol violated (FATAL-002/004)"; exit 1; }
$NPM_CMD test --silent  || { echo "  ✗ FATAL: tests failed"; exit 1; }

echo "  ✓ GEB pre-commit: all passed"
```

- [ ] **Step 2: 语法检查(bash -n)**

Run:
```bash
bash -n scripts/hooks/pre-commit
```

Expected:无输出(exit 0)— `bash -n` 只验语法不执行

---

## Task 2: scripts/install-hooks.mjs(安装器)

**Files:**
- Create: `scripts/install-hooks.mjs`

- [ ] **Step 1: 创建文件 + 写入脚本**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (copyFile, chmod, access), 本仓库 scripts/hooks/pre-commit
 * [OUTPUT]: 把 scripts/hooks/pre-commit 复制到 .git/hooks/pre-commit 并设可执行
 * [POS]: scripts/ 下,被 npm run hooks:install 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { copyFile, chmod } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'scripts', 'hooks', 'pre-commit');
const DST = join(ROOT, '.git', 'hooks', 'pre-commit');

async function main() {
  if (!existsSync(SRC)) {
    console.error('✗ 源文件不存在:', SRC);
    process.exit(1);
  }
  // 若目标存在则覆盖(Windows 上 .git/hooks/* 不在 git 里,安全)
  await copyFile(SRC, DST);
  await chmod(DST, 0o755);
  console.log('✓ pre-commit hook installed at', DST);
  console.log('  Test:');
  console.log('    git add .');
  console.log('    git commit -m "smoke"  (should fail if check:all fails)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 跑 script 装 hook**

Run:
```bash
node scripts/install-hooks.mjs
```

Expected:
```
✓ pre-commit hook installed at E:\魔方心厦\thoughtspace-notes-precommit\.git\hooks\pre-commit
```

- [ ] **Step 3: 验证 hook 文件到位 + 可执行**

Run (Windows 用 icacls 验,或只验存在):
```bash
ls -la .git/hooks/pre-commit
cat .git/hooks/pre-commit | head -3
```

Expected:`pre-commit` 文件存在 + 内容第一行是 `#!/usr/bin/env bash`

---

## Task 3: 升级 scripts/check-geb.mjs(补 L3 缺位反向用例,审计 §2.5)

**Files:**
- Modify: `scripts/check-geb.mjs`

- [ ] **Step 1: 编辑文件,在 FATAL-002 检查块后加 L3 缺位用例**

```diff
 // FATAL-002 + SEVERE-001: 每个 src/.js 必须有 L3 头部
 if (srcExists) {
   const srcFiles = (await walk(join(ROOT, 'src'))).filter(
     (f) => /\.(js|mjs|cjs)$/.test(f) && !/\.test\.|__tests__/.test(f)
   );
   for (const f of srcFiles) {
     const head = (await readFile(f, 'utf8')).slice(0, 800);
     const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
       head.includes(s)
     );
     if (!hasAll) {
       violations.push({ severity: 'FATAL-002', path: relative(ROOT, f), msg: '缺 L3 文件头部契约' });
     }
   }
 }

+// SEVERE-001 extended: 也检查 scripts/.js (但排除 check-geb.mjs 自己避免递归)
+const scriptFiles = (await walk(join(ROOT, 'scripts'))).filter(
+  (f) => /\.(js|mjs)$/.test(f) && !/\.test\.|__tests__/.test(f) && !f.endsWith('check-geb.mjs')
+);
+for (const f of scriptFiles) {
+  const head = (await readFile(f, 'utf8')).slice(0, 800);
+  const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
+    head.includes(s)
+  );
+  if (!hasAll) {
+    violations.push({ severity: 'SEVERE-001', path: relative(ROOT, f), msg: 'scripts/ 下缺 L3 文件头部契约' });
+  }
+}
+
 // FATAL-004: src/ 子目录无 CLAUDE.md
```

- [ ] **Step 2: 跑反向 case 验证**

Run:
```bash
# 故意备份当前 check-geb.mjs 后改它去掉 [PROTOCOL] 看是否能 catch
cp scripts/check-geb.mjs /tmp/check-geb.bak
sed -i 's/\[PROTOCOL\]:/\[PROTOCOL_TEMP\]:/' scripts/check-geb.mjs
node scripts/check-geb.mjs
echo "exit: $?"
# 还原
cp /tmp/check-geb.bak scripts/check-geb.mjs
node scripts/check-geb.mjs
echo "exit-restored: $?"
```

Expected:
- 第一次:`⚠ SEVERE-001 scripts/check-geb.mjs scripts/ 下缺 L3 文件头部契约` + `exit: 0`(SEVERE 不阻止)
- 第二次:`✓ GEB 一致性检查通过` + `exit-restored: 0`

> 注:Windows 上 sed 命令可能需要 git bash 或 PowerShell 等价:
> `(Get-Content scripts/check-geb.mjs) -replace '\[PROTOCOL\]:','[PROTOCOL_TEMP]:' | Set-Content scripts/check-geb.mjs`

---

## Task 4: 升级 docs/superpowers/specs/CLAUDE.md 与 plans/CLAUDE.md(L3 契约式)

**Files:**
- Modify: `docs/superpowers/specs/CLAUDE.md`
- Modify: `docs/superpowers/plans/CLAUDE.md`

- [ ] **Step 1: 重写 docs/superpowers/specs/CLAUDE.md**

```markdown
# docs/superpowers/specs/
> L3 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: 依赖 docs/superpowers/CLAUDE.md 的"命名约定"与"与 plans/ 关系"规则
 * [OUTPUT]: 对外提供 .md 文件命名规范的目录,接受 YYYY-MM-DD-<topic>-design.md 命名
 * [POS]: 文档 / 治理 / specs 层,作为 brainstorm 输出 → plan 输入的过渡容器
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
存放已批准的设计文档(spec)。每个 spec 描述"为什么这么做、做什么、不做什么"。

## 命名约定
- `YYYY-MM-DD-<topic>-design.md` — 例:`2026-07-05-phase-0-lightweight-restructure-design.md`

## 与 plans/ 的关系
- spec 批准后,由 writing-plans skill 生成对应 plan
- plan 路径:`docs/superpowers/plans/YYYY-MM-DD-<feature>.md`

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
```

- [ ] **Step 2: 重写 docs/superpowers/plans/CLAUDE.md**

```markdown
# docs/superpowers/plans/
> L3 目录契约 - 父级: ../CLAUDE.md

/**
 * [INPUT]: 依赖 docs/superpowers/specs/CLAUDE.md 的命名与 spec→plan 关系
 * [OUTPUT]: 对外提供 .md 文件命名规范的目录,接受 YYYY-MM-DD-<feature>.md 命名
 * [POS]: 文档 / 治理 / plans 层,作为 spec 后实施路径,被 subagent-driven-development 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

## 用途
存放已批准的 spec 对应的"可执行实施 plan"。每个 plan 是 bite-sized task 列表,每个 task 一个 checkbox,2-5 分钟一步。

## 命名约定
- `YYYY-MM-DD-<feature>.md` — 例:`2026-07-05-phase-0-lightweight-restructure.md`

## 使用
由 superpowers:subagent-driven-development 或 superpowers:executing-plans 消费。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
```

- [ ] **Step 3: 校验 L3 标记**

Run:
```bash
node -e "import('node:fs/promises').then(async fs => { const a = await fs.readFile('docs/superpowers/specs/CLAUDE.md', 'utf8'); const b = await fs.readFile('docs/superpowers/plans/CLAUDE.md', 'utf8'); const okA = ['[INPUT]:','[OUTPUT]:','[POS]:','[PROTOCOL]:'].every(s => a.includes(s)); const okB = ['[INPUT]:','[OUTPUT]:','[POS]:','[PROTOCOL]:'].every(s => b.includes(s)); console.log(okA && okB ? '✓ L3 标记齐全' : '✗ L3 缺'); })"
```

Expected:`✓ L3 标记齐全`

---

## Task 5: 升级 thoughtspace-arcade/CLAUDE.md 为完整 13 段(主 worktree 操作)

**⚠ 此 task 在主 worktree `E:\魔方心厦\thoughtspace-arcade\` 中操作,不在本 plan 的 git flow 里**

- [ ] **Step 1: cd 到 arcade 主 worktree**

```bash
cd E:\魔方心厦\thoughtspace-arcade
```

- [ ] **Step 2: 备份当前 CLAUDE.md**

```bash
cp CLAUDE.md CLAUDE.md.bak-precommit  # 仅作回滚备份
```

- [ ] **Step 3: 写新 CLAUDE.md(13 段完整版,内容与 notes L1 一致 + arcade 特有段)**

完整 13 段(同 notes/CLAUDE.md)+ 末尾 arcade 特有段"当前所处阶段:占位"+ "共享约束"。

> 完整内容太长,本 plan 略,实施时复制 notes/CLAUDE.md 的 13 段,然后改末尾两节为 arcade 占位声明。

- [ ] **Step 4: 在 arcade worktree commit + push**

```bash
cd E:\魔方心厦\thoughtspace-arcade
git add CLAUDE.md
git commit -m "feat(constitution): 同步升级 L1 宪法为完整 13 段(spec-id对齐)

spec-id: 2026-07-05-geb-precommit-and-l2-elevation
task-id: T-005

参照 wcaca/thoughtspace-notes/CLAUDE.md 同步:
- <identity> Linus 人设
- <thinking> 现象/本质/哲学
- <quality> SOLID + 坏味道
- <entropy> 熵减哲学
- <protocol> 输出风格
- <DOCTRINE> GEB 守护者
- <ARCHITECTURE> 三层分形
- <L1-L3_TEMPLATE>
- <WORKFLOW> GEB + Fable5
- <FORBIDDEN> FATAL/SEVERE
- <BOOTSTRAP> 播种机
- <VERIFICATION> [PROTOCOL] 必含
- <INVOCATION> 守护者自陈

末段 arcade 占位声明保留

死罪自检:
  ✓ 无占位
  ✓ 13 段全部在
  ✓ commit 含 spec-id + task-id(SEVERE-005)"

git push origin main
```

- [ ] **Step 5: 清理 backup**

```bash
rm CLAUDE.md.bak-precommit
```

---

## Task 6: 更新 docs/superpowers/backlog.md 加 L2 重试规则

**Files:**
- Modify: `docs/superpowers/backlog.md`

- [ ] **Step 1: 在 backlog.md 末尾追加 L2 重试规则段**

Read `docs/superpowers/backlog.md`,追加:

```markdown

---

## L2 自动化重试规则(2026-07-05 由审计触发)

- 单 task 失败 ≤5 次自动重试(Part 9 §3.1 L1)
- 5 次仍失败 → **不在 backlog 标 done**,标 "⚠️ BLOCKED: L2 见用户"
- Agent 自己**不得**在 L2 时跳过反馈去取下一个 task
- 这是为了避免"修改了不该修改的代码,把多个错一起修了"风险

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
```

- [ ] **Step 2: 验证**

Run:
```bash
grep "L2 自动化重试规则" docs/superpowers/backlog.md && grep "BLOCKED" docs/superpowers/backlog.md && echo "✓ L2 规则已写"
```

Expected:`✓ L2 规则已写`

---

## Task 7: 一次性 commit + push + PR

- [ ] **Step 1: 校验所有文件**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-precommit
git status --short
```

Expected:6 文件变更(2 新 + 3 改 + 1 新 plan)

- [ ] **Step 2: 一次 commit + push + PR**

```bash
cd E:\魔方心厦\thoughtspace-notes-precommit

git add scripts/hooks/pre-commit scripts/install-hooks.mjs scripts/check-geb.mjs docs/superpowers/specs/CLAUDE.md docs/superpowers/plans/CLAUDE.md docs/superpowers/backlog.md docs/superpowers/plans/2026-07-05-geb-precommit-and-l2-elevation.md

git commit -m "feat(geb): pre-commit hook + L2 升级 (5 文件)

spec-id: 2026-07-05-geb-precommit-and-l2-elevation
task-id: T-001-T-006

落地:
- scripts/hooks/pre-commit: bash 钩子(跑 npm run check:all)
- scripts/install-hooks.mjs: 幂等安装器
- scripts/check-geb.mjs: 补 SEVERE-001 scripts/ 检查(审计 §2.5 L3 缺位修复)
- docs/superpowers/{specs,plans}/CLAUDE.md: 升级 L3 契约式
- docs/superpowers/backlog.md: 加 L2 重试规则段

不在本 plan 落地(在主 worktree 单独 commit):
- thoughtspace-arcade/CLAUDE.md 同步升级 13 段(T-005)

死罪自检:
  ✓ 无占位
  ✓ 5 文件均有 L3 头部
  ✓ bash -n 语法 OK
  ✓ 反向 case SEVERE-001 可被 catch(check-geb 在故意篡改 [PROTOCOL] 后告警)
  ✓ commit 含 spec-id + task-id(SEVERE-005)

后续 task:
- T-007(arcade L1 同步): 在主 worktree 完成,见 T-005 输出"

git push -u origin feat/geb-precommit
```

- [ ] **Step 3: 开 PR**

```bash
gh pr create --repo wcaca/thoughtspace-notes --base main --head feat/geb-precommit --title "feat(geb): pre-commit hook + L2 升级 (5 文件)" --body "## 摘要
按 spec 2026-07-05-geb-precommit-and-l2-elevation 落地 pre-commit + 升级 L2 + backlog 规则。

## 变更
- scripts/hooks/pre-commit + install-hooks.mjs: 一键装 pre-commit
- scripts/check-geb.mjs: 补 SEVERE-001 scripts/ 检查
- docs/superpowers/{specs,plans}/CLAUDE.md: L3 契约式升级
- docs/superpowers/backlog.md: L2 重试规则段

## 验证
- bash -n scripts/hooks/pre-commit ✓
- 反向 case: 故意篡改 [PROTOCOL] → check-geb 告警
- npm run hooks:install 装 hook 成功

## 兄弟 commit
arcade/CLAUDE.md 同步升级 13 段(单独 commit + push,因不在本 worktree)。"
```

---

## Self-Review

- ✅ Spec 覆盖:§2 hook(Task 1-2)+ §2.5 scripts 补差(Task 3)+ §3 L2 升级(Task 4)+ §5 backlog(Task 6)+ 兄弟 §4 arcade(Task 5)
- ✅ Placeholder 扫描:无
- ✅ 类型一致:`[PROTOCOL]:` 标记在每个 .md / scripts/.mjs 末尾
- ✅ 依赖隔离:仅 bash + node 内置,**不引新 npm 依赖**
- ✅ 不与既有冲突:arcade 改动明确分主 worktree

## 执行约定

按 subagent-driven-development 或 inline 执行均可。本 plan 7 task × 30 秒/步 ≈ 1 轮对话即可。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
