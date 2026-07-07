#!/usr/bin/env node
// [INPUT]: vitest JSON 输出 + docs/superpowers/specs/*.md
// [OUTPUT]: 按 spec 决策 ID 分组显示失败测试(溯源: 失败 → spec 决策)
// [POS]: scripts/ 下,被 npm run check:test-spec-linkage 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const RESULT_PATH = join(ROOT, '.vitest-result.json');

// 跑测试并捕获 JSON
console.log('🧪 收集 vitest JSON 结果...');
let jsonOut = '';
try {
  execSync('npx vitest run --reporter=json --outputFile=.vitest-result.json --passWithNoTests', {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024
  });
} catch (e) {
  // 测试可能失败,但 JSON 已生成
}

if (!existsSync(RESULT_PATH)) {
  console.error('✗ 无法生成 vitest JSON');
  process.exit(1);
}

const result = JSON.parse(readFileSync(RESULT_PATH, 'utf8'));

// 收集 spec 决策 ID
const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
const decisions = new Set();
for (const f of readdirSync(specsDir)) {
  if (!f.endsWith('.md') || f === 'CLAUDE.md') continue;
  const text = readFileSync(join(specsDir, f), 'utf8');
  const m = text.match(/decision_id:\s*(\S+)/g) || [];
  for (const d of m) {
    const id = d.split(':')[1]?.trim();
    if (id) decisions.add(id);
  }
  // 也匹配 spec id
  const idMatch = f.match(/^\d{4}-\d{2}-\d{2}-(.+)-design\.md$/);
  if (idMatch) decisions.add(idMatch[1]);
}

// 解析失败测试
const DECISION_RE = /(?:decision|why-|pitfall|T\d+)[:\s-]+(\S+)/i;
const failures = [];
for (const t of result.testResults || []) {
  if (t.status !== 'failed') continue;
  for (const a of t.assertionResults || []) {
    if (a.status !== 'failed') continue;
    failures.push({ name: a.fullName, file: t.name });
  }
}

// 按决策 ID 分组
const grouped = new Map();
const ungrouped = [];
for (const f of failures) {
  const m = f.name.match(DECISION_RE);
  const key = m ? m[1] : null;
  if (key && decisions.has(key)) {
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(f);
  } else {
    ungrouped.push(f);
  }
}

console.log('');
console.log('🔮 Spec 决策分组 (P1-4 test-spec-linkage)');
console.log('────────────────────────────');
if (failures.length === 0) {
  console.log('✅ 无测试失败');
  process.exit(0);
}
console.log(`  总失败数: ${failures.length}`);
for (const [dec, tests] of grouped) {
  console.log(`  [${dec}] → ${tests.length} 个失败`);
  for (const t of tests.slice(0, 3)) {
    console.log(`    ✗ ${t.name}`);
  }
  if (tests.length > 3) console.log(`    ... 还有 ${tests.length - 3} 个`);
}
if (ungrouped.length > 0) {
  console.log(`  [未分组] → ${ungrouped.length} 个失败`);
  for (const t of ungrouped.slice(0, 3)) {
    console.log(`    ✗ ${t.name}`);
  }
}

// 不阻塞 commit — 只是溯源信息
process.exit(0);