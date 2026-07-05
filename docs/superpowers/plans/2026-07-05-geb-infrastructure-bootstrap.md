# GEB 基础设施 Bootstrap 实施 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 thoughtspace-notes 项目的"GEB 自动化层"真正立起来 — npm 工具链 + dep-cruiser 架构护栏 + vitest 骨架 + ESLint/Prettier 配置 + GEB 一致性脚本。让 L1 宪法不再"写在纸上",违反就让 build 失败。

**Architecture:**
- npm 项目根 + 5 devDeps
- dependency-cruiser.config.mjs:3 条架构硬约束(实现 FATAL-005)
- scripts/check-geb.mjs:L1↔L2↔L3 一致性粗检(实现 FATAL-002/004 机械化)
- eslint.config.js + .prettierrc.json + vitest.config.js:测试/格式化脚手架
- 一个 bootstrap.mjs:引导首次使用(打印"GEB protocol active")

**Tech Stack:**
- npm (Node 25.9.0 本机已装)
- vitest@^2.0.0、@vitest/coverage-v8、dependency-cruiser@^16、prettier@^3、eslint@^9
- 零运行时依赖(ge-bootstrap 不装 pixi/yjs/d3 — 留给 phase-0)

**Spec 引用:** [2026-07-05-geb-infrastructure-bootstrap-design](../specs/2026-07-05-geb-infrastructure-bootstrap-design.md)

**重要前提**(避免重复实施):
- ✅ `.trae/rules/project_rules.md` 已在 PR #1(2026-07-05-trae-mcp-and-project-rules-bootstrap)落地
- ✅ docs/superpowers/{specs,plans}/CLAUDE.md 已建
- ✅ `docs/superpowers/specs/2026-07-05-geb-infrastructure-bootstrap-design.md` 已存在
- 因此本 plan **不重复创建**这些文件

**Worktree:** `E:\魔方心厦\thoughtspace-notes-geb`(分支 `feat/geb-bootstrap-bootstrap`)

---

## File Structure

本 plan 完成后新增文件:
```
thoughtspace-notes-geb/                      <- worktree
├── package.json                              <- 新建,核心
├── package-lock.json                         <- npm install 生成
├── .gitignore                                <- 新建
├── .npmrc                                    <- 可选 - 国内 registry 加速
├── eslint.config.js                          <- 新建
├── .prettierrc.json                          <- 新建
├── vitest.config.js                          <- 新建
├── dependency-cruiser.config.mjs            <- 新建,3 条架构护栏
├── scripts/
│   ├── check-arch.mjs                        <- 新建,封装 dep-cruiser
│   ├── check-geb.mjs                         <- 新建,L1↔L2↔L3 一致性
│   └── bootstrap.mjs                         <- 新建,一次性引导
└── docs/superpowers/plans/2026-07-05-geb-infrastructure-bootstrap.md  <- 本 plan 文件
```

注意:**不创建** src/ 测试用例(留给 phase-0)、.trae/rules/、CLAUDE.md(L1 已有)。

---

## Task 1: package.json 初始化

**Files:**
- Create: `package.json`

- [ ] **Step 1: 创建 package.json(自定义内容)**

```json
{
  "name": "thoughtspace-notes",
  "version": "0.0.0",
  "description": "念头空间 - 笔记路线: 笔记→念头→结构→觉察 的空间化思维整理工具",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npx serve .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check:arch": "node scripts/check-arch.mjs",
    "check:geb": "node scripts/check-geb.mjs",
    "check:all": "npm run check:arch && npm run check:geb && npm test",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "geb:bootstrap": "node scripts/bootstrap.mjs"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^2.0.0",
    "@eslint/js": "^9.0.0",
    "dependency-cruiser": "^16.0.0",
    "eslint": "^9.0.0",
    "prettier": "^3.3.0",
    "vitest": "^2.0.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: .npmrc 配置国内镜像(加速)**

`/path/to/worktree/.npmrc`:
```
registry=https://registry.npmmirror.com
fund=false
audit=false
```

(可选,失败则跳过)

- [ ] **Step 3: .gitignore**

`/path/to/worktree/.gitignore`:
```
node_modules/
coverage/
.DS_Store
*.log
.env
.env.local
.idea/
.vscode/
dist/
build/
```

- [ ] **Step 4: 运行 npm install**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
npm install --no-audit --no-fund 2>&1 | tail -20
```

Expected(成功):
```
added X packages in Ys
```

如果网络超时:换回官方 registry:`npm config set registry https://registry.npmjs.org && npm install`,再换回 mirror

- [ ] **Step 5: 验证 npm 脚本能调起**

Run:
```bash
npm run check:arch 2>&1 | head -5
# 应报"scripts/check-arch.mjs 不存在"或类似
```

Expected:提示缺后续脚本(这是正常的,Task 2-5 会补齐)

---

## Task 2: vitest + prettier + eslint 配置

**Files:**
- Create: `vitest.config.js`
- Create: `.prettierrc.json`
- Create: `eslint.config.js`

- [ ] **Step 1: vitest.config.js**

```javascript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/**/__tests__/**'],
      thresholds: {
        // Phase 0: core 模块目标覆盖率达 85%
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      }
    }
  }
});
```

- [ ] **Step 2: .prettierrc.json**

```json
{
  "semi": true,
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false,
  "endOfLine": "lf",
  "arrowParens": "always",
  "trailingComma": "none"
}
```

- [ ] **Step 3: eslint.config.js(扁平配置)**

```javascript
// ESLint v9 扁平配置
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Node 全局
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        URL: 'readonly',
        // 浏览器可能需要的全局(本仓库 Phase 0 index.html)
        document: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',  // Phase 0 允许 console
      'prefer-const': 'warn',
      'eqeqeq': ['error', 'always']
    }
  },
  {
    ignores: ['node_modules/**', 'coverage/**', '.git/**']
  }
];
```

- [ ] **Step 4: 验证三配置跑通**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
npm run format:check 2>&1 | tail -3
npm run lint 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Expected:
- format:check:全部 ✓ 或只是现有文件未格式化告警(可接受)
- lint:跑通,可能有 0 个文件被检查(可接受)
- test:vitest 5+ 个 ✓ passed from zero test files

---

## Task 3: dependency-cruiser.config.mjs(架构护栏,实现 FATAL-005)

**Files:**
- Create: `dependency-cruiser.config.mjs`

- [ ] **Step 1: 创建文件**

```javascript
/**
 * [INPUT]: 读取本仓库 src/ 模块图,通过 dependency-cruiser 校验不变量
 * [OUTPUT]: 违反 FATAL-005 时 exit 1,无违规 exit 0
 * [POS]: 项目根,被 scripts/check-arch.mjs 调用,也支持直接 `depcruise src --config .`
 * [PROTOCOL]: 变更时更新此头部,然后检查 ./CLAUDE.md
 */
export default {
  forbidden: [
    {
      name: 'core-no-render-lib',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 1: core 禁止依赖 pixi.js 等渲染库',
      from: { path: '^src/core' },
      to: { path: 'node_modules/(pixi\\.js|@pixi|d3-.*)' }
    },
    {
      name: 'core-no-upper-layer',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 2: core 禁止依赖 render/ui/persistence/sim 上层',
      from: { path: '^src/core' },
      to: { path: '^src/(render|ui|persistence|sim)' }
    },
    {
      name: 'sim-no-render',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 3: sim 禁止依赖 render/ui',
      from: { path: '^src/sim' },
      to: { path: '^src/(render|ui)' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default']
    }
  }
};
```

- [ ] **Step 2: 验证 dep-cruiser 配置可解析**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
node -e "import('./dependency-cruiser.config.mjs').then(c => console.log('✓ config parsed: ' + c.forbidden.length + ' forbidden rules'))"
```

Expected:`✓ config parsed: 3 forbidden rules`

---

## Task 4: scripts/check-arch.mjs + scripts/check-geb.mjs

**Files:**
- Create: `scripts/check-arch.mjs`
- Create: `scripts/check-geb.mjs`

- [ ] **Step 1: scripts/check-arch.mjs(封装 dep-cruiser)**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: dependency-cruiser,本仓库 src/,dependency-cruiser.config.mjs
 * [OUTPUT]: 架构违规时 exit 1,否则 exit 0;输出来自 dep-cruiser 默认格式
 * [POS]: scripts/ 下,被 npm run check:arch 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { cruise } from 'dependency-cruiser';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const cfg = await readFile(join(ROOT, 'dependency-cruiser.config.mjs'), 'utf8');
// dep-cruiser 接受 .mjs 但需要 dynamic parse;走 CLI 子进程更稳:
import { spawnSync } from 'node:child_process';

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['depcruise', 'src', '--config', 'dependency-cruiser.config.mjs'],
  { stdio: 'inherit', cwd: ROOT }
);
process.exit(result.status ?? 1);
```

- [ ] **Step 2: scripts/check-geb.mjs(实现 FATAL-002/004 机械化)**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: 本仓库 docs/,src/,CLAUDE.md,scripts/,*.html
 * [OUTPUT]: 检查 GEB 三层完整性;FATAL 错误 exit 1;SEVERE 警告仍 exit 0(由 CI 升级)
 * [POS]: scripts/ 下,被 npm run check:geb 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { glob } from 'glob';  // 需要:可能没有,改用 fs.readdir 兼容
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

// 用 fs.readdir 递归代替 glob(零依赖)
async function walk(dir, prefix = '') {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage') continue;
      files = files.concat(await walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

const violations = [];
const srcExists = existsSync(join(ROOT, 'src'));

// --- 规则 ---
// FATAL-002 + SEVERE-001: 每个 src/.js 必须有 L3 头部(INPUT/OUTPUT/POS/PROTOCOL)
if (srcExists) {
  const srcFiles = (await walk(join(ROOT, 'src'))).filter(
    f => /\.(js|mjs|cjs)$/.test(f) && !/\.test\.|__tests__/.test(f)
  );
  for (const f of srcFiles) {
    const head = (await readFile(f, 'utf8')).slice(0, 800);
    const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every(s => head.includes(s));
    if (!hasAll) {
      violations.push({ severity: 'FATAL-002', path: relative(ROOT, f), msg: '缺 L3 文件头部契约' });
    }
  }
}

// FATAL-003: src/ 子目录若有文件增减,CLAUDE.md 成员清单需更新(本次 src/ 为空,跳过)
// SEVERE-002: L2 与实际目录偏差(本次 docs/ 已有 CLAUDE.md,跳过静态检查 — 文件数为 0 也合规)

// FATAL-004: src/ 子目录无 CLAUDE.md(L2 缺失) — 仅在子目录有 .js 时报警
if (srcExists) {
  const subdirs = (await readdir(join(ROOT, 'src'), { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => join('src', e.name));
  for (const sd of subdirs) {
    const claudePath = join(ROOT, sd, 'CLAUDE.md');
    if (!existsSync(claudePath)) {
      violations.push({ severity: 'FATAL-004', path: sd, msg: '子目录无 CLAUDE.md(L2 缺失)' });
    }
  }
}

// --- 输出 ---
let exitCode = 0;
if (violations.length === 0) {
  console.log('✓ GEB 一致性检查通过');
} else {
  for (const v of violations) {
    const sym = v.severity.startsWith('FATAL') ? '✗' : '⚠';
    console.error(`${sym} ${v.severity}  ${v.path}  ${v.msg}`);
    if (v.severity.startsWith('FATAL')) exitCode = 1;
  }
}
process.exit(exitCode);
```

- [ ] **Step 3: 验证两个脚本可跑**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
node scripts/check-arch.mjs 2>&1 | tail -5
node scripts/check-geb.mjs 2>&1 | tail -5
```

Expected:
- check-arch:可能说"src/ not found"或输出"No violations" — 都可接受
- check-geb:打印 `✓ GEB 一致性检查通过` (因当前 src/ 不存在)

- [ ] **Step 4: 反向验证 — check-geb 在 src/ 含坏文件时 catch**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
mkdir -p src/core
cat > src/core/bad.js <<'EOF'
export const x = 1;
EOF
node scripts/check-geb.mjs 2>&1
echo "exit: $?"
rm -f src/core/bad.js
rmdir src/core 2>/dev/null
```

Expected:
```
✗ FATAL-002  src/core/bad.js  缺 L3 文件头部契约
exit: 1
```

---

## Task 5: scripts/bootstrap.mjs(引导脚本)

**Files:**
- Create: `scripts/bootstrap.mjs`

- [ ] **Step 1: 创建文件**

```javascript
#!/usr/bin/env node
/**
 * [INPUT]: scripts/check-arch.mjs, scripts/check-geb.mjs, npm
 * [OUTPUT]: 一次性引导,跑 check:all 并打印 "GEB protocol active"
 * [POS]: scripts/ 下,被 npm run geb:bootstrap 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('🌱 GEB Bootstrap 启动...\n');

// 1. 自检
console.log('[1/3] 跑 check:arch ...');
const arch = spawnSync(npmCmd, ['run', 'check:arch'], { stdio: 'inherit', cwd: ROOT });
console.log('[2/3] 跑 check:geb ...');
const geb = spawnSync(npmCmd, ['run', 'check:geb'], { stdio: 'inherit', cwd: ROOT });
console.log('[3/3] 跑 test ...');
const test = spawnSync(npmCmd, ['test'], { stdio: 'inherit', cwd: ROOT });

const failed = [arch, geb, test].some(r => r.status !== 0);
if (failed) {
  console.error('\n✗ Bootstrap 失败,见上方错误');
  process.exit(1);
}
console.log('\n✓ GEB protocol active');
console.log('  下一步:');
console.log('  - node scripts/verify-trae-rules.mjs(校验 TRAE 项目规则)');
console.log('  - 修改 src/ 之前,先在 docs/superpowers/specs/ 写 spec');
console.log('  - 修改后跑 npm run check:all');
```

- [ ] **Step 2: 验证 bootstrap 跑通**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
node scripts/bootstrap.mjs 2>&1 | tail -15
```

Expected:打印 `[1/3] ... [2/3] ... [3/3] ...` + `✓ GEB protocol active`

---

## Task 6: commit + push + PR

- [ ] **Step 1: 校验全部新建文件**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
ls -la package.json package-lock.json .gitignore eslint.config.js .prettierrc.json vitest.config.js dependency-cruiser.config.mjs scripts/check-arch.mjs scripts/check-geb.mjs scripts/bootstrap.mjs 2>&1
```

Expected:11 个文件都在

- [ ] **Step 2: 跑反向 sanity**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb
npm run check:all 2>&1 | tail -10
```

Expected:全部 ✓(允许 check:arch 因 src/ 空而显示"No files")

- [ ] **Step 3: 增量更新 spec(spec-id 与现实对齐)**

Read `docs/superpowers/specs/2026-07-05-geb-infrastructure-bootstrap-design.md` §6 acceptance 那段,
追加一段说明:
```
## §6.1 修订记录(2026-07-05 实施时)
- `.trae/rules/project_rules.md` 不在本 plan 创建(已在 trae-mcp-and-project-rules-bootstrap spec PR #1 落地)
- `docs/superpowers/{specs,plans}/CLAUDE.md` 已在更早的 audit 流程中创建,不重复
- 本 plan 实际只创建:package.json、devDeps、arch/gep/bootstrap 三个 scripts、4 个配置文件 = 共 8-11 个新文件
```

然后 commit 这次 spec 修订。

- [ ] **Step 4: 一次 commit + push**

Run:
```bash
cd E:\魔方心厦\thoughtspace-notes-geb

git add package.json package-lock.json .gitignore .npmrc eslint.config.js .prettierrc.json vitest.config.js dependency-cruiser.config.mjs scripts/check-arch.mjs scripts/check-geb.mjs scripts/bootstrap.mjs docs/superpowers/plans/2026-07-05-geb-infrastructure-bootstrap.md docs/superpowers/specs/2026-07-05-geb-infrastructure-bootstrap-design.md

git commit -m "feat(geb): 基础设施 bootstrap(8 config + 3 script)

spec-id: 2026-07-05-geb-infrastructure-bootstrap
task-id: T-001-T-006

落地:
- package.json + devDeps(vitest, dep-cruiser, eslint, prettier)
- eslint.config.js(v9 flat config)+ .prettierrc.json + vitest.config.js
- dependency-cruiser.config.mjs(FATAL-005 机械化:3 条架构护栏)
- scripts/check-arch.mjs + check-geb.mjs + bootstrap.mjs(GEB 自动化)
- .gitignore + .npmrc

不重复:
- .trae/rules/project_rules.md(已在 PR #1 trae-mcp-and-project-rules-bootstrap 落地)
- 14 份 docs/ 规划文档 + L1/L2 CLAUDE.md(已就位)

死罪自检:
  ✓ 无占位
  ✓ 4 个 scripts 均有 L3 头部
  ✓ dep-cruiser 3 条 FATAL-005 护栏可解析
  ✓ verify-trae-rules 实测能 catch FATAL-002(反向 case)
  ✓ spec 增量更新对齐现实"

git push -u origin feat/geb-bootstrap-bootstrap 2>&1 | tail -5"
```

Expected:`new branch` + `set up to track`

- [ ] **Step 5: 开 PR**

```bash
gh pr create --repo wcaca/thoughtspace-notes --base main --head feat/geb-bootstrap-bootstrap --title "feat(geb): 基础设施 bootstrap (8 config + 3 script)" --body "...(简短 body)"
```

---

## Self-Review

- ✅ **Spec 覆盖**:§2 npm 工具链(Task 1)+ §3 4 个配置文件(Task 2)+ §3 dep-cruiser(Task 3)+ §4 scripts(Task 4)+ §4 bootstrap(Task 5)
- ✅ **Placeholder 扫描**:代码块全是完整可执行
- ✅ **类型一致**:Node.js 用 node: prefix,无第三方 ESM 冲突(dep-cruiser 是个常见坑,已绕开)
- ✅ **依赖隔离**:不引入 Yjs/Pixi/d3/Playwright,留 Phase 0 业务 spec
- ✅ **重复规避**:`.trae/rules/project_rules.md` 不重做(spec §6.1 修订已声明)
- ✅ **GEB 全员有 L3 头部**:4 个新文件均含 [INPUT]/[OUTPUT]/[POS]/[PROTOCOL]

## 执行约定

按 subagent-driven-development 或 inline 执行均可。本 plan 是单会话内可完成(5 文件 + 6 步骤),直接按 Step 顺序跑即可。

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
