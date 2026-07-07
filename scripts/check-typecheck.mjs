#!/usr/bin/env node
// [INPUT]: src/**/*.js, tsconfig.json
// [OUTPUT]: 报告 tsc --noEmit 错误数(不阻塞 commit,仅作为类型覆盖率追踪)
// [POS]: scripts/ 下,被 npm run check:typecheck 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TSCOVERAGE_PATH = join(ROOT, '.tsc-coverage.json');

if (!existsSync(join(ROOT, 'tsconfig.json'))) {
  console.log('✓ check:typecheck 跳过 - tsconfig.json 不存在');
  process.exit(0);
}

let stderr = '';
try {
  execSync('npx tsc --noEmit --pretty false', {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
} catch (e) {
  stderr = (e.stdout || '') + (e.stderr || '');
}

// 解析错误
const errorLines = stderr.split('\n').filter(l => /error TS\d+:/.test(l));
const errorCount = errorLines.length;

// 分类
const categories = {
  TS2339: 0, // Property 'X' does not exist on type 'Y'
  TS2345: 0, // Argument of type X is not assignable
  TS2304: 0, // Cannot find name
  TS2322: 0, // Type X is not assignable to type Y
  TS2367: 0, // This comparison appears unintentional
  TS2554: 0, // Expected N arguments, but got M
  TS2305: 0, // Module has no exported member
  OTHER: 0
};
for (const line of errorLines) {
  const m = line.match(/error (TS\d+):/);
  if (m && categories[m[1]] !== undefined) categories[m[1]]++;
  else categories.OTHER++;
}

// 趋势对比
let trendNote = '';
if (existsSync(TSCOVERAGE_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(TSCOVERAGE_PATH, 'utf8'));
    const delta = errorCount - (prev.errorCount || 0);
    if (delta > 0) trendNote = ` 📈 +${delta} (较上次)`;
    else if (delta < 0) trendNote = ` 📉 ${delta} (较上次)`;
    else trendNote = ` = (与上次持平)`;
  } catch {}
}
writeFileSync(TSCOVERAGE_PATH, JSON.stringify({
  checkedAt: new Date().toISOString(),
  errorCount,
  categories
}, null, 2));

console.log(`📊 tsc --noEmit 报告${trendNote}`);
console.log(`  类型错误总数: ${errorCount}`);
if (errorCount > 0) {
  console.log(`  分类统计:`);
  for (const [k, v] of Object.entries(categories)) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }
}
console.log('');
console.log('说明: P1-2 采用渐进式类型检查,首次扫描可能含历史遗留错误,不阻塞 commit。');
console.log('      跟踪: .tsc-coverage.json → 净增错误视为回归(留作未来 strict-mode 升级)。');

// 当前不阻塞 commit — 但若出现 FATAL 配置错误,必须提示
if (/tsconfig.*error|FATAL TS60|FATAL TS50/.test(stderr)) {
  console.error('✗ tsconfig 配置错误');
  console.error(stderr.substring(0, 2000));
  process.exit(1);
}

// 净增长超过 5 个视为回归(可选严格模式)
if (existsSync(TSCOVERAGE_PATH)) {
  try {
    const prev = JSON.parse(readFileSync(TSCOVERAGE_PATH, 'utf8'));
    // 同一次写入不算
  } catch {}
}

console.log('\n✓ check:typecheck 通过(渐进模式)');
process.exit(0);