#!/usr/bin/env node
/**
 * [INPUT]: scripts/hooks/pre-commit (源 hook 模板)
 * [OUTPUT]: 安装到 .git/hooks/pre-commit (git 实际调用的 hook)
 * [POS]: scripts/install-hooks.mjs — hook 安装器,克隆仓库后必跑一次
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 为什么需要这个脚本:
 *  - scripts/hooks/pre-commit 是项目级 hook 模板(被 git 跟踪)
 *  - .git/hooks/pre-commit 是 git 实际调用的 hook(不被 git 跟踪,每个 clone 独立)
 *  - 修改 scripts/hooks/pre-commit 后必须跑此脚本同步到 .git/hooks/
 *  - M1-1 盲点: 修改了 scripts/hooks/pre-commit 跑 check:all,但没安装,.git/hooks/pre-commit 仍是旧版(只跑 4 道)
 */

import { copyFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SOURCE = join(ROOT, 'scripts', 'hooks', 'pre-commit');
const TARGET = join(ROOT, '.git', 'hooks', 'pre-commit');

if (!existsSync(SOURCE)) {
  console.error(`✗ 源 hook 不存在: ${SOURCE}`);
  process.exit(1);
}

const gitHooksDir = join(ROOT, '.git', 'hooks');
if (!existsSync(gitHooksDir)) {
  mkdirSync(gitHooksDir, { recursive: true });
}

try {
  copyFileSync(SOURCE, TARGET);
  chmodSync(TARGET, 0o755);
  console.log(`✓ pre-commit hook 已安装: ${SOURCE} → ${TARGET}`);
  console.log('  下次 git commit 将自动跑 check:all (13 道门禁)');
} catch (err) {
  console.error(`✗ 安装失败: ${err.message}`);
  process.exit(1);
}
