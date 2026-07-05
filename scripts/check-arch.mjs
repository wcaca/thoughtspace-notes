#!/usr/bin/env node
/**
 * [INPUT]: dependency-cruiser,本仓库 src/,dependency-cruiser.config.mjs
 * [OUTPUT]: 架构违规时 exit 1;空 src/ 时温和通过 exit 0
 * [POS]: scripts/ 下,被 npm run check:arch 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

// src/ 不存在或为空时,跳过实际检查,温和通过
if (!existsSync(SRC)) {
  console.log('✓ check:arch 跳过 - src/ 目录不存在');
  console.log('  (Phase 0 业务代码尚未创建,无架构层需校验)');
  process.exit(0);
}

const depcruiseBin = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'depcruise.cmd' : 'depcruise');
try {
  execSync(`"${depcruiseBin}" src --config dependency-cruiser.config.mjs`, { stdio: 'inherit', cwd: ROOT });
  process.exit(0);
} catch (e) {
  process.exit(e.status || 1);
}
