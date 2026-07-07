#!/usr/bin/env node
// [INPUT]: .holo-index.json (由 npm run holo:index 生成)
// [OUTPUT]: 生成 .holo-report.md 可视化仪表盘(决策时间线 + 孤儿清单 + 覆盖率条形图)
// [POS]: scripts/ 下,被 npm run holo:report 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const INDEX_PATH = join(ROOT, '.holo-index.json');
const REPORT_PATH = join(ROOT, '.holo-report.md');

if (!existsSync(INDEX_PATH)) {
  console.log('⚠ .holo-index.json 不存在,请先运行 npm run holo:index');
  process.exit(0);
}

const index = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
const lines = [];

lines.push('# 🔮 全息编程仪表盘 (Holo Report)');
lines.push('');
lines.push(`> 生成时间: ${new Date().toISOString()}`);
const stats = index.stats || {};
lines.push(`> Spec 数: ${stats.totalSpecs || 0} | 代码: ${stats.totalCodeFiles || 0} | 原文引用: ${stats.totalSourceQuotes || 0} | 代码覆盖率: ${stats.codeSpecCoverage || 'n/a'}`);
lines.push('');

// ============================================================
// §1. 决策时间线
// ============================================================
lines.push('## §1 决策时间线 (按 spec created 排序)');
lines.push('');
lines.push('| 日期 | spec | 状态 | 关联代码数 |');
lines.push('|---|---|---|---|');

const specsMap = index.layers?.spec || {};
const specsList = Object.values(specsMap).sort((a, b) => {
  const da = a.created || '';
  const db = b.created || '';
  return da.localeCompare(db);
});

const rings = index.rings || {};
for (const s of specsList) {
  const id = s.id || s.file;
  const icon = s.status || '?';
  const date = s.created || 'n/a';
  const codeCount = (rings.specToCode?.[id] || []).length;
  lines.push(`| ${date} | \`${id}\` | ${icon} | ${codeCount} |`);
}
lines.push('');

// ============================================================
// §2. 孤儿清单
// ============================================================
lines.push('## §2 孤儿清单 (P1-3 审计)');
lines.push('');
lines.push('### 2.1 无 spec 关联的代码');
lines.push('');
const orphanCode = [];
for (const [codeFile, specs] of Object.entries(rings.codeToSpec || {})) {
  if (!Array.isArray(specs) || specs.length === 0) orphanCode.push(codeFile);
}
if (orphanCode.length === 0) {
  lines.push('✅ 全部代码有 spec 关联');
} else {
  lines.push(`共 ${orphanCode.length} 个孤儿代码:`);
  for (const c of orphanCode.slice(0, 30)) {
    lines.push(`- \`${c}\``);
  }
  if (orphanCode.length > 30) lines.push(`- ... 还有 ${orphanCode.length - 30} 个`);
}
lines.push('');

lines.push('### 2.2 无代码关联的 spec');
lines.push('');
const orphanSpec = [];
for (const s of specsList) {
  const id = s.id || s.file;
  const codeCount = (rings.specToCode?.[id] || []).length;
  if (codeCount === 0) orphanSpec.push(s);
}
if (orphanSpec.length === 0) {
  lines.push('✅ 全部 spec 有代码关联');
} else {
  for (const s of orphanSpec) lines.push(`- \`${s.id || s.file}\` (${s.status})`);
}
lines.push('');

lines.push('### 2.3 无原文引用的 spec');
lines.push('');
const noQuoteSpec = [];
for (const s of specsList) {
  const id = s.id || s.file;
  const refs = rings.specToSource?.[id] || [];
  const quoteCount = Array.isArray(refs) ? refs.length : 0;
  if (quoteCount === 0) noQuoteSpec.push(s);
}
if (noQuoteSpec.length === 0) {
  lines.push('✅ 全部 spec 有原文引用');
} else {
  for (const s of noQuoteSpec) lines.push(`- \`${s.id || s.file}\``);
}
lines.push('');

// ============================================================
// §3. 覆盖率仪表盘
// ============================================================
lines.push('## §3 覆盖率仪表盘');
lines.push('');
lines.push('### 3.1 每个 spec 的代码覆盖数(降序)');
lines.push('');
lines.push('```');

const specCodeCount = [];
for (const s of specsList) {
  const id = s.id || s.file;
  const refs = rings.specToCode?.[id] || [];
  const count = Array.isArray(refs) ? refs.length : 0;
  const explicitCount = Array.isArray(refs) ? refs.filter(r => r && r.kind === 'explicit').length : 0;
  const wildcardCount = Array.isArray(refs) ? refs.filter(r => r && r.kind === 'wildcard').length : 0;
  specCodeCount.push({ id, count, explicitCount, wildcardCount, status: s.status });
}
specCodeCount.sort((a, b) => b.count - a.count);
const maxCount = Math.max(...specCodeCount.map(s => s.count), 1);
// M1-3 (2026-07-07): 区分 explicit vs wildcard,显式覆盖率才是真覆盖率
// 原先只显示 count,wildcard 撑出 100% 假象
let totalExplicit = 0, totalWildcard = 0;
for (const s of specCodeCount) { totalExplicit += s.explicitCount; totalWildcard += s.wildcardCount; }
const totalRefs = totalExplicit + totalWildcard;
const explicitPct = totalRefs > 0 ? Math.round(totalExplicit / totalRefs * 100) : 0;
lines.push(`显式覆盖率: ${totalExplicit}/${totalRefs} = ${explicitPct}% (wildcard 噪声 ${totalWildcard} 不计入真覆盖)`);
lines.push('');
lines.push('格式: 总数 [E:explicit / W:wildcard] bar spec-id');
lines.push('');
for (const { id, count, explicitCount, wildcardCount } of specCodeCount) {
  const barLen = Math.round((count / maxCount) * 40);
  const bar = '█'.repeat(barLen) || '·';
  lines.push(`${String(count).padStart(4)} [E:${explicitCount}/W:${wildcardCount}] ${bar} ${id}`);
}
lines.push('```');
lines.push('');

lines.push('### 3.2 高度耦合代码(被 ≥3 个 spec 引用)');
lines.push('');
const highCoupling = [];
for (const [codeFile, specs] of Object.entries(rings.codeToSpec || {})) {
  if (!Array.isArray(specs)) continue;
  const explicitCount = specs.filter(r => r.kind === 'explicit').length;
  const wildcardCount = specs.filter(r => r.kind === 'wildcard').length;
  if (specs.length >= 3) {
    highCoupling.push({ codeFile, count: specs.length, explicitCount, wildcardCount, specs });
  }
}
if (highCoupling.length === 0) {
  lines.push('✅ 无过度耦合文件');
} else {
  for (const { codeFile, count, explicitCount, wildcardCount, specs } of highCoupling) {
    const specIds = specs.slice(0, 3).map(r => r.specId || r).join(', ');
    lines.push(`- \`${codeFile}\` ← ${count} specs (explicit: ${explicitCount}, wildcard: ${wildcardCount}): ${specIds}${specs.length > 3 ? '...' : ''}`);
  }
}
lines.push('');

// ============================================================
// §4. 治理快照
// ============================================================
lines.push('## §4 治理快照');
lines.push('');
lines.push('| 维度 | 数值 |');
lines.push('|---|---|');
lines.push(`| Spec 总数 | ${stats.totalSpecs || 0} |`);
lines.push(`| 活跃 Spec | ${stats.activeSpecs || 'n/a'} |`);
lines.push(`| 代码文件 | ${stats.totalCodeFiles || 0} |`);
lines.push(`| 原文引用 | ${stats.totalSourceQuotes || 0} |`);
lines.push(`| 代码覆盖率 | ${stats.codeSpecCoverage || 'n/a'} |`);
lines.push(`| Spec 原文覆盖率 | ${stats.specSourceCoverage || 'n/a'} |`);
lines.push('');

// §5 关联类型统计 (P1-5)
lines.push('## §5 关联类型统计 (P1-5 explicit vs wildcard)');
lines.push('');
const kindStats = { explicit: 0, wildcard: 0, inheritance: 0, unknown: 0 };
const codeSpecKind = {};
for (const s of specsList) {
  const id = s.id || s.file;
  const refs = rings.specToCode?.[id] || [];
  for (const r of refs) {
    const k = r.kind || 'unknown';
    kindStats[k] = (kindStats[k] || 0) + 1;
    if (!codeSpecKind[k]) codeSpecKind[k] = 0;
    codeSpecKind[k]++;
  }
}
lines.push('| 关联 kind | 数量 | 说明 |');
lines.push('|---|---|---|');
lines.push(`| explicit | ${kindStats.explicit || 0} | spec 文本中明确列出的 .js 文件 |`);
lines.push(`| wildcard | ${kindStats.wildcard || 0} | 由"全集/通配"触发的推论 |`);
lines.push(`| inheritance | ${kindStats.inheritance || 0} | 由 inherits-from 继承 (未实现) |`);
lines.push(`| unknown | ${kindStats.unknown || 0} | 未分类 |`);
lines.push('');

// §6 每个 spec 的 explicit vs wildcard 分布
lines.push('### §6 每个 spec 的关联分布');
lines.push('');
lines.push('| spec | explicit | wildcard | 总计 |');
lines.push('|---|---|---|---|');
for (const s of specsList) {
  const id = s.id || s.file;
  const refs = rings.specToCode?.[id] || [];
  if (!Array.isArray(refs)) {
    lines.push(`| \`${id}\` | 0 | 0 | 0 |`);
    continue;
  }
  const explicitCount = refs.filter(r => r && r.kind === 'explicit').length;
  const wildcardCount = refs.filter(r => r && r.kind === 'wildcard').length;
  lines.push(`| \`${id}\` | ${explicitCount} | ${wildcardCount} | ${refs.length} |`);
}
lines.push('');

lines.push('---');
lines.push('');
lines.push('生成方式: `npm run holo:report` (基于 `.holo-index.json`)');

await writeFile(REPORT_PATH, lines.join('\n'));
console.log(`✓ 全息仪表盘已生成: .holo-report.md`);
console.log(`  决策时间线: ${specsList.length} 个 spec`);
console.log(`  孤儿代码:   ${orphanCode.length} 个`);
console.log(`  孤儿 spec:   ${orphanSpec.length} 个`);
console.log(`  无原文 spec: ${noQuoteSpec.length} 个`);
console.log(`  关联分类: explicit=${kindStats.explicit || 0}, wildcard=${kindStats.wildcard || 0}`);