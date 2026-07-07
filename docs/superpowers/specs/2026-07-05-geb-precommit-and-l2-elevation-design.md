---
id: geb-precommit-and-l2-elevation
title: GEB Pre-commit + L2 升级
status: base
phase: implemented           # P2-1: 流程底座已实施稳定
layer: L1-architecture
scope:
  global: false
  modules: [scripts]
  files: [scripts/check-arch.mjs, scripts/hooks/pre-commit]
  lines: []
priority: 95
created: 2026-07-05
updated: 2026-07-07
inherits-from:
  - geb-infrastructure-bootstrap
supersedes: []
non-negotiable:
  - "架构守卫必须挂在 git pre-commit hook"
  - "L2 文档必须有成员清单且与实际一致"
---

# GEB Pre-commit + L2 升级 — 整改 Spec

> 由 `2026-07-05-comprehensive-audit.md` 触发的派生 spec。
> 解决审计 §3-§4 发现的 P0 / P1 项中"流程层"和"文档层"部分。
> **架构层 P0** 由兄弟 spec `2026-07-05-geb-infrastructure-bootstrap` 解决。

| 项目 | 值 |
|---|---|
| 创建日期 | 2026-07-05 |
| 优先级 | **P0**(流程防线裸奔) + P1(文档子层升级) |
| 周期 | **0.3 天** |
| 前置依赖 | **ge-infrastructure-bootstrap 必须先完成** |
| 关系 | 与 geb-bootstrap 是兄弟 spec,**可合并**为一份实施 plan |

---

## §1 整改范围

### ✅ 做
1. `.git/hooks/pre-commit` 脚本安装,自动跑 `npm run check:all`(check:arch + check:geb + test)
2. `scripts/check-geb.mjs` 补"L3 缺位"反向用例(审计 §2.5)
3. `docs/superpowers/specs/CLAUDE.md` 与 `docs/superpowers/plans/CLAUDE.md` 升级为 L3 契约式(补 INPUT / OUTPUT / POS)
4. `thoughtspace-arcade/CLAUDE.md` 同步升级为完整 13 段(审计 §5.4)
5. `backlog.md` 增加"L2 重试用尽自动暂停反馈用户"显式规则(审计 §4.2)

### ❌ 不做
- npm 依赖安装(由 geb-bootstrap 负责)
- 任何 src/ 业务代码(由 phase-0-lightweight-restructure 负责)
- GHA CI 配置(Phase 1)

---

## §2 Pre-commit Hook 设计

**路径**:`.git/hooks/pre-commit`(每台开发者机器本地,不入 git 仓库)
**安装方式**:`scripts/install-hooks.mjs`(开发者首次 clone 后 `node scripts/install-hooks.mjs`)

### 2.1 pre-commit 脚本内容(伪)
```bash
#!/usr/bin/env bash
# .git/hooks/pre-commit
set -e
echo "→ GEB pre-commit: running check:all"

# 仅 staged 文件参与(节省时间)
STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(js|mjs|cjs|html|md)$' | tr '\n' ' ')

if [ -z "$STAGED" ]; then
  echo "  (no relevant staged files, skipping)"
  exit 0
fi

echo "  staged files: $STAGED"

# 跑核心检查(失败即 reject commit)
npm run check:arch || { echo "✗ FATAL: architecture rule violated"; exit 1; }
npm run check:geb  || { echo "✗ FATAL: GEB protocol violated"; exit 1; }
npm test --silent   || { echo "✗ FATAL: tests failed"; exit 1; }

echo "✓ GEB pre-commit: all passed"
```

### 2.2 install-hooks.mjs 设计
```javascript
#!/usr/bin/env node
// scripts/install-hooks.mjs
import { copyFile, chmod, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'scripts', 'hooks', 'pre-commit');
const DST = join(ROOT, '.git', 'hooks', 'pre-commit');

await copyFile(SRC, DST);
await chmod(DST, 0o755);
console.log('✓ pre-commit hook installed at', DST);
console.log('  Test: git commit -m "test"  (should fail on bad code)');
```

### 2.3 注入 npm script
```json
{
  "scripts": {
    "hooks:install": "node scripts/install-hooks.mjs",
    "hooks:uninstall": "rm -f .git/hooks/pre-commit"
  }
}
```
首次 `npm install` 后自动 hint:`console.log("→ run npm run hooks:install")` — 但**不强自动**(避免侵入)。

---

## §3 L2 → L3 升级细节

### 3.1 docs/superpowers/specs/CLAUDE.md(当前 → 目标)
**当前**(目录说明风格):
```markdown
# docs/superpowers/specs/
> L3 目录说明 - 父级: ../CLAUDE.md
## 用途
存放已批准的设计文档(spec)。...
```

**目标**(L3 契约式):
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
...
```

### 3.2 docs/superpowers/plans/CLAUDE.md 同样升级
(格式同上)

---

## §4 thoughtspace-arcade/CLAUDE.md 同步升级

### 4.1 当前状态
`thoughtspace-arcade/CLAUDE.md` 是早期版本,没有完整 13 段。
- 现状:约 30 行,无 `<identity>` `<quality>` 等段
- 目标:同 `thoughtspace-notes/CLAUDE.md` 完全一致的 13 段

### 4.2 升级策略
- **不复制粘贴**:notes 是真相源,arcade 是"引用 L1 + 自己的 L2 项目特定节"
- 实际方案:把 notes 的 L1 完整复制到 arcade,然后 arcade-only 节(`当前状态:占位阶段`)保留
- **长期方案**(本 spec 不做):用 git submodule 或 symbol link 共享,但目前不需要

### 4.3 同步增量(顺手写在 spec 内)
arcade 仅多两行特有内容:
```markdown
## 当前所处阶段
🚧 **占位阶段** - 笔记路线 wcaca/thoughtspace-notes 已完成 Phase 1 后,本仓库才启动。
## 共享约束
- 产品灵魂、架构原则、术语表 — 同步 wcaca/thoughtspace-notes/CLAUDE.md
- 任何违背 notes L1 的改动,在这里视为违背 arcade
```

---

## §5 backlog.md 增加的规则(L2 自动化)

```markdown
## L2 重试规则(由审计 2026-07-05 触发)
- 单 task 失败 ≤5 次自动重试(Part 9 §3.1 L1)
- 5 次仍失败 → **不在 backlog 标 done**,而标 "⚠️ BLOCKED: L2 见用户"
- Agent 自己**不得**在 L2 时跳过反馈去取下一个 task
- 这是为了避免"修改了不该修改的代码,把多个错一起修了"风险
```

---

## §6 验收标准(本 spec DoD)

- [ ] `.git/hooks/pre-commit` 生效(故意改坏代码 → `git commit` 应被拒)
- [ ] `scripts/install-hooks.mjs` 可重跑幂等
- [ ] `npm run hooks:install` 命令可用
- [ ] `docs/superpowers/specs/CLAUDE.md` 含 L3 块(`/** [INPUT]: ... [OUTPUT]: ... [POS]: ... [PROTOCOL]: ... */`)
- [ ] `docs/superpowers/plans/CLAUDE.md` 同上
- [ ] `thoughtspace-arcade/CLAUDE.md` 含完整 13 段
- [ ] `backlog.md` 含 L2 重试规则段
- [ ] 反向验证:`git commit -m "feat: smoke"` 后跑 `scripts/check-geb.mjs` 应能 catch "如果故意删个 L2 报 FATAL-004"

---

## §7 推荐:与 geb-bootstrap 合并为一份 plan

两份 spec 内容高度相关,合并实施可省 1 天安装/调试往返。

**合并 plan 任务草案**(`docs/superpowers/plans/2026-07-05-geb-full-bootstrap.md`):
| Task | 内容 | 来源 |
|---|---|---|
| T-001 | npm init + 安装依赖(devDeps only) | bootstrap |
| T-002 | vitest / eslint / prettier / dependency-cruiser 配置 | bootstrap |
| T-003 | `dependency-cruiser.config.mjs`(3 条护栏) | bootstrap |
| T-004 | `scripts/check-arch.mjs` + `scripts/check-geb.mjs`(含 L3 缺位检查) | bootstrap + **precommit** |
| T-005 | `scripts/install-hooks.mjs` + `.git/hooks/pre-commit` 模板 | **precommit** |
| T-006 | `scripts/bootstrap.mjs`(一次性引导) | bootstrap |
| T-007 | `.trae/rules/project_rules.md` | bootstrap |
| T-008 | 升级 `specs/CLAUDE.md` / `plans/CLAUDE.md` 到 L3 契约式 | **precommit** |
| T-009 | 同步升级 `thoughtspace-arcade/CLAUDE.md` | **precommit** |
| T-010 | `backlog.md` 加 L2 重试规则 | **precommit** |
| T-011 | 跑反向用例做最终验证 | bootstrap + precommit |

**周期**:**1-1.5 天**(原 bootstrap 0.5-1 天 + precommit 0.3 天,但因为共用 npm install 流程,只多 0.5 天)

---

## §8 风险

| 风险 | 缓解 |
|---|---|
| Pre-commit hook 在 Windows 上 chmod 不生效 | 测试 `git config core.fileMode false` 兼容方案 |
| Arcade CLAUDE.md 与 notes 长期分叉 | 写脚本 `scripts/sync-constitution.mjs` 比对差异(本期不做,Phase 1 引入) |
| `npm run check:all` 跑得太慢,commit 卡顿 | 只检测 staged 文件;jest/vitest 已支持 |
| L3 缺位检查影响 markdown 编辑流程 | 检查只针对 `.js/.mjs/.cjs`,放过 .md |

---

## §9 GEB 自检

- ✅ 占位扫描:0 命中(T-XXX 已替换为具体示例)
- ✅ L1/L2/L3 一致:本 spec 同时升级了两个 L2 和一个 L1
- ✅ 引用审计报告:`[2026-07-05-comprehensive-audit.md](../../audit/2026-07-05-comprehensive-audit.md)`
- ✅ 范围聚焦:本 spec 只关心"流程 + 文档子层",**架构层 P0 留给 bootstrap**

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
