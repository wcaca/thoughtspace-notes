#!/usr/bin/env node
/**
 * [INPUT]: dependency-cruiser, src/ 模块图, dependency-cruiser.config.mjs
 * [OUTPUT]: 架构违规时 exit 1;空 src/ 时温和通过 exit 0
 * [POS]: scripts/ 下,被 npm run check:arch 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import depcruise from 'dependency-cruiser';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');

if (!existsSync(SRC)) {
  console.log('✓ check:arch 跳过 - src/ 目录不存在');
  console.log('  (Phase 0 业务代码尚未创建,无架构层需校验)');
  process.exit(0);
}

const configPath = join(ROOT, 'dependency-cruiser.config.mjs');
const configUrl = new URL(`file:///${configPath.replace(/\\/g, '/')}`).href;
const { default: cruiseConfig } = await import(configUrl);

const result = await depcruise.cruise(['src'], {
  ...cruiseConfig,
  outputType: 'json'
});

const data = typeof result.output === 'string' ? JSON.parse(result.output) : result.output;
const summary = data.summary || {};
const violations = summary.violations || [];
const cruiseStats = Array.isArray(summary.cruise) ? summary.cruise[0] : summary.cruise;

let fatalCount = 0;
let cycleCount = 0;

for (const violation of violations) {
  if (violation.rule === 'not-in-allowed') {
    cycleCount++;
    console.log(`✗ FATAL-CYCLE  ${violation.from} → ${violation.to}`);
    console.log(`    ${violation.comment || '检测到循环依赖'}`);
  } else {
    fatalCount++;
    console.log(`✗ FATAL-005  ${violation.from} → ${violation.to}`);
    console.log(`    规则: ${violation.rule}`);
    console.log(`    说明: ${violation.comment || '架构违反'}`);
  }
}

if (cruiseStats && typeof cruiseStats.totalCruised === 'number') {
  console.log(`📊 扫描模块: ${cruiseStats.totalCruised}`);
}

if (fatalCount === 0 && cycleCount === 0) {
  console.log('✔ no dependency violations found (含循环依赖检测)');
  process.exit(0);
}

console.log('');
console.log(`总计: ${fatalCount} 个架构违规, ${cycleCount} 个循环依赖`);
process.exit(1);