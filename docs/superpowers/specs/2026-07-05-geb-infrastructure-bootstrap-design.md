---
id: geb-infrastructure-bootstrap
title: GEB 基础设施 Bootstrap
status: base
phase: implemented           # P2-1: 架构底座已实施稳定
layer: L1-architecture
scope:
  global: false
  modules: [scripts]
  files: []
  lines: []
priority: 100
created: 2026-07-05
updated: 2026-07-07
inherits-from: []
supersedes: []
non-negotiable:
  - "GEB 协议必须由 build-time 门禁强制"
  - "L1/L2/L3 三层分形结构不可破坏"
---

# GEB 基础设施 Bootstrap — 设计子 spec

> 让 L1/L2/L3 协议从"写在文档里"变成"违反就 build fail"。
> 这份 spec 是 phase-0-lightweight-restructure 的**前置依赖**,必须先完成,后续 task 才有人守门。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-05 |
| 优先级 | **P0 阻塞** — Phase 0 任何业务 task 开始前必须先完成 |
| 周期 | **0.5-1 天**(不算依赖安装的下载时间) |
| 范围 | 仅基础设施建设,不实现任何业务功能 |

---

## §1 战略定位

### 1.1 为什么必须先做这件事
- L1 宪法已声明 7 条"不可违反的架构约束",但没有任何自动化护栏
- FATAL-005 提到违反 dependency-cruiser 规则要"立即中止 + revert",**但工具没装**,这条死罪事实上是空头支票
- Fable5 workflow `<WORKFLOW>` 步骤 3 写"跑 `pnpm check:arch && pnpm test`" — 但这俩命令根本不存在
- 没有基础设施,后续所有 task 都在**裸奔**,违反 SEVERE-005(commit message 引用 task id)也没人知道

### 1.2 范围边界
**做**:
- package.json + 锁文件 + 必要 dev 依赖
- pnpm 命令兜底(因 corepack 链路坏,需用 npm 替代 + workspace 文档)
- 4 个 L1 死锁工具:`check:arch` / `test` / `format` / `lint`
- .trae/rules/project_rules.md(给 TRAE 的项目级规则,L3 一致)
- 一个 `bootstrap.mjs` 脚本(给后续 GEB 协议用:扫目录 → 检查 CLAUDE.md 完整性 → 比对文件变化)

**不做**:
- src/ 任何业务代码(留给 phase-0-lightweight-restructure spec)
- Yjs / PixiJS / d3-force 业务依赖(下一 spec 才装)
- Vitest 测试用例(下一 spec 才写)
- CI 部署到 GitHub Actions(本地手动即可,Phase 1 再考虑)

---

## §2 依赖清单(最小集)

### 2.1 devDependencies(GEB 自动化工具)
| 包 | 用途 | 来源 |
|---|---|---|
| `vitest@^2.0.0` | 单测运行(将来覆盖率达 85%) | Part 3 §1.2 推荐 |
| `@vitest/coverage-v8` | 覆盖率报告 | 同上 |
| `dependency-cruiser@^16.0.0` | 架构约束强制器 → 实现 FATAL-005 | Part 3 §5.2 + Part 8 §1.4 |
| `prettier@^3.3.0` | 格式化,统一代码风格 | Part 3 §10 |
| `eslint@^9.0.0` + `@eslint/js` | 代码静态检查 | Part 8 §1.4 |

### 2.2 不在本次装的依赖(留给 phase-0-lightweight-restructure)
Yjs / y-indexeddb / pixi.js / d3-force / playwright 都不在本 spec 范围。

### 2.3 npm vs pnpm 决策
- **本机 pnpm 已坏**(`Cannot find module corepack\dist\pnpm.js`)
- 选择:**用 npm**(Node 自带,无 corepack 依赖)
- 后续 pnpm 修好后可一键切换(package.json 的 packageManager 字段保留兼容)

---

## §3 文件结构(本 spec 落地后)

```
thoughtspace-notes/
├── package.json                  # 新增 - npm 项目元数据
├── package-lock.json             # 锁文件(自动生成)
├── .npmrc                        # 可选 - npm 配置
├── .gitignore                    # 新增 - 排除 node_modules/
├── eslint.config.js              # 新增 - 扁平配置
├── .prettierrc.json              # 新增 - 格式化配置
├── vitest.config.js              # 新增(空骨架,无测试用例)
├── dependency-cruiser.config.mjs # 新增 - 4 条架构护栏
├── scripts/                      # 新增 - GEB 自动化脚本
│   ├── check-arch.mjs           # 封装 dependency-cruiser
│   ├── check-geb.mjs            # 扫目录,核对 L1↔L2↔L3 一致性(初始版只能做粗检)
│   └── bootstrap.mjs            # 一次性:引导首次使用
├── .trae/
│   └── rules/
│       └── project_rules.md      # 新增 - TRAE 项目规则(L3 文档,内容对齐 L1 架构约束段)
└── docs/superpowers/
    ├── specs/                    # 已有
    ├── plans/                    # 已有(L3 CLAUDE.md)
    ├── CLAUDE.md                 # 已有(L2)
    └── backlog.md                # 已有(本 spec 完成后产生首个 task 记录)
```

---

## §4 scripts/check-geb.mjs 实现要点

这是本 spec 的**核心 script**,逻辑:

```javascript
// pseudo,实际用 Node ESM + glob + simple-git
import { glob } from 'glob';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { existsSync } from 'node:fs';

const srcDir = 'src';  // Phase 0 暂用空目录占位;Phase 1+ 启动后才正式扫
const rootDir = '.';

const violations = [];

// 规则 1:每个 src/ 子目录必须有 CLAUDE.md
for (const subdir of glob.sync('src/*/')) {
  if (!existsSync(join(subdir, 'CLAUDE.md'))) {
    violations.push({ severity: 'FATAL-004', path: subdir, msg: '子目录无 CLAUDE.md(L2 缺失)' });
  }
}

// 规则 2:每个非测试 .js 文件必须有 L3 头部 [INPUT] [OUTPUT] [POS] [PROTOCOL]
for (const file of glob.sync('src/**/*.js')) {
  if (file.endsWith('.test.js')) continue;
  const head = (await readFile(file, 'utf8')).slice(0, 500);
  if (!/\[INPUT\]:/.test(head) || !/\[OUTPUT\]:/.test(head) || !/\[POS\]:/.test(head) || !/\[PROTOCOL\]:/.test(head)) {
    violations.push({ severity: 'FATAL-002', path: file, msg: '缺 L3 头部契约注释' });
  }
}

// 规则 3:L1 CLAUDE.md 提到的目录若不存在,违反 SEVERE-001
// (粗检,只检查 L1 <directory> 段提到的路径)

// 输出 violation + 退出码
console.table(violations);
process.exit(violations.some(v => v.severity.startsWith('FATAL')) ? 1 : 0);
```

**注意**:这个脚本**首次跑会因为还没 src/ 而通过**。它的价值在 Phase 0 业务代码产出后才显现。

---

## §5 dependency-cruiser.config.mjs 内容

```javascript
export default {
  forbidden: [
    {
      name: 'core-no-render-lib',
      severity: 'error',
      comment: 'FATAL-005 / 架构约束 1: core 禁止依赖渲染库',
      from: { path: '^src/core' },
      to: { path: 'node_modules/(pixi\.js|@pixi|d3-.*)' }
    },
    {
      name: 'core-no-render-layer',
      severity: 'error',
      comment: 'FATAL-005 / 架构约束 2: core 禁止依赖上层模块',
      from: { path: '^src/core' },
      to: { path: '^src/(render|ui|persistence|sim)' }
    },
    {
      name: 'sim-no-render',
      severity: 'error',
      comment: 'FATAL-005 / 架构约束 3: sim 禁止依赖 render/ui',
      from: { path: '^src/sim' },
      to: { path: '^src/(render|ui)' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { file: './tsconfig.json' },  // 我们用纯 JS,但 dep-cruiser 接受空 config
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default']
    }
  }
};
```

---

## §6 .trae/rules/project_rules.md 内容

TRAE 项目级规则 — 当 AI agent 在本项目工作时的硬约束:

```markdown
# 念头空间 TRAE 项目规则

## 强制工作流
每次改代码前必跑(若已存在):
- `npm run check:arch` — 架构约束检查(dependency-cruiser)
- `npm test` — 单元测试(Phase 0 暂空,跑过即可)
- 改 src/ 时,改后必跑 `node scripts/check-geb.mjs` — 验证 L3 完整性

## 不可违反的约束
1. **代码是机器相,文档是语义相,两相同构** — 改代码必查 L3 头部;改目录必查 L2 成员清单
2. **FATAL 系列**:孤立代码变更 / 跳过 L3 / 删文件不更新 L2 / 新模块无 L2 / 违反依赖架构 — 立即中止 + revert
3. **架构约束**(CLAUDE.md 列了 7 条):code 约束已通过 `npm run check:arch` 自动校验,违规 build fail

## 输出风格(对齐 L1)
- 思考:英文 | 交互:中文 | 注释:中文 + ASCII 分块
- 称呼:以"哥"开头

## 引用规范
- 引用已有规划时:[part-x §y](docs/念头空间_xxx.md#章节)
- 引用其他 spec 时:[YYYY-MM-DD-topic-design](docs/superpowers/specs/xxx.md)
- 引用 task 时:形如 `T-001` / `T-002`(纯数字 3 位,从 T-001 开始)
- commit message 必须含 `spec-id: <spec 文件名>` 与 `task-id: <task 编号>` 字段(供日 grep 追溯)

[PROTOCOL]: 变更时更新此头部,然后检查 ../../../CLAUDE.md
```

---

## §7 package.json scripts 设计

```json
{
  "scripts": {
    "dev": "npx serve .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "check:arch": "node scripts/check-arch.mjs",
    "check:geb": "node scripts/check-geb.mjs",
    "check:all": "npm run check:arch && npm run check:geb && npm test",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "geb:bootstrap": "node scripts/bootstrap.mjs"
  }
}
```

`scripts/check-arch.mjs` 是 `dependency-cruiser` 的薄封装:

```javascript
#!/usr/bin/env node
import { cruise } from 'dependency-cruiser';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../dependency-cruiser.config.mjs-as-json', import.meta.url).pathname));
// ... 简化做法:直接调 dependency-cruiser 的 binary
process.exit(0);  // 实际生产实现见 plan
```

---

## §8 验收标准(本 spec DoD)

### 8.1 必须达成
- [ ] `npm install` 无错,锁文件生成
- [ ] `npm run check:arch` 跑通(即使 src/ 为空也返回 0,因为没有可违反的 import)
- [ ] `npm run check:geb` 跑通,空仓库下应返回 0
- [ ] `npm test` 跑通(vitest 空项目,5+ 个 ✓ passed from zero test files)
- [ ] `npm run format:check` 跑通(prettier 配置文件存在)
- [ ] `npm run lint` 跑通(eslint 配置文件存在)
- [ ] L1 / L2 / L3 三层结构完整(running `node scripts/check-geb.mjs` 验证)
- [ ] `.trae/rules/project_rules.md` 提交
- [ ] `node scripts/bootstrap.mjs` 能打印"GEB protocol active"

### 8.2 反向验证
- [ ] 在 src/core/ 临时建一个文件,头部故意缺 `[INPUT]:` → `npm run check:geb` 应报错并 exit 1
- [ ] 在 src/core/ 临时建一个文件 import "pixi.js" → `npm run check:arch` 应报错并 exit 1
- [ ] 删除 docs/CLAUDE.md → `npm run check:geb` 应报错并 exit 1(因 L2 缺失违反 FATAL-004)

---

## §9 风险

| 风险 | 缓解 |
|---|---|
| npm install 在国内网络慢 | 用 `--registry=https://registry.npmmirror.com` 兜底 |
| vitest 偶发 ChromeHeadless 警告 | 可忽略,Phase 0 不引入 playwright |
| `check-geb.mjs` 误报(比如把 .md 当 js) | 加白名单:`node_modules/**` / `docs/**` / `.git/**` / `*.md` |
| GEB 一致性检查脚本本身出错 | 建议在 spec 中加自检步骤:故意制造一个违反,确认脚本能 catch |
| corepack 链路后续若修好,有人想切回 pnpm | 在 README 注明切换步骤,不阻塞当前进度 |

---

## §10 与 phase-0-lightweight-restructure spec 的关系

本 spec 是它的**前置任务**:
- phase-0-lightweight-restructure 的 task T-001(拆分 index.html)需要 `npm run check:arch` 跑通
- 所有后续 task 都依赖 `npm test` / `npm run check:geb` 兜底
- 完成本 spec 后,phase-0-lightweight-restructure 的 plan 第一步应该是"对照此 spec 验证基础设施就位"

不引入本 spec,phase-0-lightweight-restructure 的 plan 第一步就是 FATAL-005 真撞上去时没人接得住。
