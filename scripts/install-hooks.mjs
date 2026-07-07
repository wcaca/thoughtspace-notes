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

import { copyFileSync, chmodSync, existsSync, mkdirSync, statSync, utimesSync } from 'node:fs';
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
  // 比较 SOURCE 与 TARGET 的 mtime,提示安装/更新/已最新
  let sourceStat;
  try {
    sourceStat = statSync(SOURCE);
  } catch {
    // SOURCE 存在性已在上面校验,此处不会到达
    sourceStat = null;
  }

  let targetMtime = null;
  try {
    targetMtime = statSync(TARGET).mtimeMs;
  } catch {
    // TARGET 不存在,首次安装
  }

  const sourceMtime = sourceStat ? sourceStat.mtimeMs : null;
  const EPSILON = 1; // 1ms 容差,吸收文件系统 mtime 精度差异

  if (targetMtime === null) {
    console.log('→ 安装 pre-commit hook');
  } else if (Math.abs(sourceMtime - targetMtime) < EPSILON) {
    console.log('✓ hooks 已最新');
  } else if (sourceMtime > targetMtime) {
    console.log('→ hooks 已更新(SOURCE 比 .git/hooks 新)');
  } else {
    console.log('⚠ hooks 比 SOURCE 新(可能被手动修改),已覆盖为 SOURCE 版本');
  }

  copyFileSync(SOURCE, TARGET);
  chmodSync(TARGET, 0o755);
  // 同步 TARGET 的 mtime 到 SOURCE,保证下次 install 能正确判断"已最新"
  if (sourceStat) {
    try {
      utimesSync(TARGET, sourceStat.atime, sourceStat.mtime);
    } catch {
      // utimes 失败不影响安装主流程
    }
  }
} catch (err) {
  console.error(`✗ 安装失败: ${err.message}`);
  process.exit(1);
}
