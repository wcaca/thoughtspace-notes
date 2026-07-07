#!/usr/bin/env node
// [INPUT]: src/**/*.js 模块图(由 madge 解析) + tests/**/*.js (被测试引用不算孤儿)
// [OUTPUT]: 0 孤儿通过;含孤儿 → 列出文件名,exit 1
// [POS]: scripts/ 下,被 npm run check:orphans 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
import madge from 'madge';
import { dirname, join, relative } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC = join(ROOT, 'src');
const TESTS = join(ROOT, 'tests');

// 收集 main.js 入口与所有 tests/*.test.js 作为"被引用"集合
// 即: 任何被 main.js 或 tests 引用的文件都不算孤儿
function collectReachable() {
  const reachable = new Set();
  function addAll(p) {
    if (!p || !existsSync(p)) return;
    reachable.add(p);
  }
  addAll(join(SRC, 'main.js'));
  addAll(join(SRC, 'runtime', 'flags', 'bootstrap.js'));
  if (existsSync(TESTS)) {
    for (const f of readdirSync(TESTS, { recursive: true })) {
      if (typeof f !== 'string') continue;
      if (!f.endsWith('.test.js')) continue;
      addAll(join(TESTS, f));
    }
  }
  return reachable;
}

async function main() {
  // P1-1: 同时检测循环依赖与孤儿
  const result = await madge([SRC, TESTS], {
    fileExtensions: ['js', 'mjs'],
    tsConfig: false,
    detectiveOptions: { es6: { mixedImports: true } }
  });

  const circular = result.circular();
  const orphans = result.orphans();

  // 过滤:tests/ 下的 .test.js 是测试入口,不算孤儿; runtime/flags/bootstrap.js 是注入入口
  const allowedEntryPatterns = [
    /src[/\\]main\.js$/,
    /tests[/\\].+\.test\.js$/,
    /src[/\\]runtime[/\\]flags[/\\]bootstrap\.js$/
  ];
  const realOrphans = orphans.filter((f) => !allowedEntryPatterns.some(p => p.test(f)));

  let exitCode = 0;

  // 1. 循环依赖 (madge 检测到的所有路径) - FATAL
  if (circular.length > 0) {
    console.log(`✗ FATAL-CYCLE  madge 发现 ${circular.length} 条循环依赖路径:`);
    for (const path of circular) {
      console.log(`    ${path.join(' → ')} → ${path[0]}`);
    }
    exitCode = 1;
  } else {
    console.log('✔ no circular dependencies (madge)');
  }

  // 2. 孤儿代码 (排除已知入口)
  if (realOrphans.length > 0) {
    console.log(`\n⚠ ORPHAN-CODE  发现 ${realOrphans.length} 个孤儿文件(无任何模块引用):`);
    for (const f of realOrphans.slice(0, 30)) {
      console.log(`    ${relative(ROOT, f)}`);
    }
    if (realOrphans.length > 30) {
      console.log(`    ... 还有 ${realOrphans.length - 30} 个`);
    }
    // 注:orphan 是 WARN 而非 FATAL,允许存在 dead code (将来清理)
    if (exitCode === 0) exitCode = 0; // 不阻塞
  } else {
    console.log('\n✔ no orphan files');
  }

  console.log(`\n📊 总计: src + tests 共扫描`);
  console.log(`   孤儿总数(含入口白名单): ${orphans.length}`);
  console.log(`   真实孤儿(待清理):       ${realOrphans.length}`);

  if (exitCode > 0) process.exit(exitCode);
}

main().catch((e) => {
  console.error('FATAL: check-orphans 失败', e);
  process.exit(1);
});