#!/usr/bin/env node
/**
 * [INPUT]: scripts/check-arch.mjs, scripts/check-geb.mjs, npm
 * [OUTPUT]: 一次性引导,跑 check:all 并打印 "GEB protocol active"
 * [POS]: scripts/ 下,被 npm run geb:bootstrap 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

console.log('🌱 GEB Bootstrap 启动...\n');

console.log('[1/3] 跑 check:arch ...');
const arch = spawnSync(npmCmd, ['run', 'check:arch'], { stdio: 'inherit', cwd: ROOT });
console.log('[2/3] 跑 check:geb ...');
const geb = spawnSync(npmCmd, ['run', 'check:geb'], { stdio: 'inherit', cwd: ROOT });
console.log('[3/3] 跑 test ...');
const test = spawnSync(npmCmd, ['test'], { stdio: 'inherit', cwd: ROOT });

if ([arch, geb, test].some((r) => r.status !== 0)) {
  console.error('\n✗ Bootstrap 失败,见上方错误');
  process.exit(1);
}
console.log('\n✓ GEB protocol active');
console.log('  下一步:');
console.log('  - node scripts/verify-trae-rules.mjs(校验 TRAE 项目规则)');
console.log('  - 修改 src/ 之前,先在 docs/superpowers/specs/ 写 spec');
console.log('  - 修改后跑 npm run check:all');
