#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (copyFile, chmod), 本仓库 scripts/hooks/pre-commit, git
 * [OUTPUT]: 把 scripts/hooks/pre-commit 复制到 git 的真实 hooks 目录并设可执行
 * [POS]: scripts/ 下,被 npm run hooks:install 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { copyFile, chmod } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'scripts', 'hooks', 'pre-commit');

// worktree 的 .git 是个文件;用 `git rev-parse` 找到真实 .git 目录
const gitRevParse = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, encoding: 'utf8' });
let gitDir;
if (gitRevParse.status === 0) {
  const p = gitRevParse.stdout.trim();
  gitDir = p.startsWith('/') || /^[a-zA-Z]:/.test(p) ? p : join(ROOT, p);
} else {
  // fallback
  gitDir = join(ROOT, '.git');
}

const HOOKS_DIR = join(gitDir, 'hooks');
const DST = join(HOOKS_DIR, 'pre-commit');

async function main() {
  if (!existsSync(SRC)) {
    console.error('✗ 源文件不存在:', SRC);
    process.exit(1);
  }
  // 确保 hooks 目录存在(worktree 的 gitdir 可能还没 hooks 目录)
  if (!existsSync(HOOKS_DIR)) {
    const { mkdirSync } = await import('node:fs');
    mkdirSync(HOOKS_DIR, { recursive: true });
  }
  await copyFile(SRC, DST);
  await chmod(DST, 0o755);
  console.log('✓ pre-commit hook installed at', DST);
  console.log('  (hooks 目录:', HOOKS_DIR, ')');
  console.log('  Test:');
  console.log('    git add .');
  console.log('    git commit -m "smoke"  (should fail if check:all fails)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
