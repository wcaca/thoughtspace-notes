#!/usr/bin/env node
/**
 * [INPUT]: docs/topology-priority.md, src/**\/*.js, scripts/**\/*.mjs
 * [OUTPUT]: 检查拓扑表与实际文件的一致性;FATAL 退出 1,SEVERE 警告仍 exit 0
 * [POS]: scripts/ 下,被 npm run check:topology 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function walk(dir) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage') continue;
      files = files.concat(await walk(path));
    } else {
      files.push(path);
    }
  }
  return files;
}

function extractListedFiles(content, sectionHeading) {
  const files = new Set();
  const sectionRegex = new RegExp(`### ${sectionHeading}[\\s\\S]*?(?=\\n### |\\n---|\\n## |$)`);
  const match = content.match(sectionRegex);
  if (!match) return files;
  const section = match[0];
  const fileRegex = /`([a-zA-Z0-9_-]+\.(?:js|mjs|cjs))`/g;
  let m;
  while ((m = fileRegex.exec(section)) !== null) {
    files.add(m[1]);
  }
  return files;
}

const violations = [];

async function checkDir(relDir, sectionHeading, label) {
  const fullDir = join(ROOT, relDir);
  if (!existsSync(fullDir)) return;
  const actualFiles = (await readdir(fullDir))
    .filter((f) => /\.(js|mjs|cjs)$/.test(f))
    .filter((f) => !/\.test\.|__tests__/.test(f));
  const topologyContent = await readFile(join(ROOT, 'docs', 'topology-priority.md'), 'utf8');
  const listedFiles = extractListedFiles(topologyContent, sectionHeading);
  const actualSet = new Set(actualFiles);
  const missingInTopo = actualFiles.filter((f) => !listedFiles.has(f) && f !== 'index.js');
  const extraInTopo = [...listedFiles].filter((f) => !actualSet.has(f));
  if (missingInTopo.length > 0) {
    violations.push({
      severity: 'FATAL-T01',
      path: `${relDir}/`,
      msg: `${label}有 ${missingInTopo.length} 个文件未在拓扑表登记: ${missingInTopo.join(', ')}`
    });
  }
  if (extraInTopo.length > 0) {
    violations.push({
      severity: 'SEVERE-T01',
      path: `${relDir}/`,
      msg: `${label}拓扑表多出 ${extraInTopo.length} 个不存在的文件: ${extraInTopo.join(', ')}`
    });
  }
}

async function checkSpecs() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  if (!existsSync(specsDir)) return;
  const actualSpecs = (await readdir(specsDir))
    .filter((f) => f.endsWith('-design.md'));
  const topologyContent = await readFile(join(ROOT, 'docs', 'topology-priority.md'), 'utf8');
  const listedSpecs = new Set();
  const specTableMatch = topologyContent.match(/### 2\.1[\s\S]*?(?=\n### |\n---|$)/);
  if (specTableMatch) {
    const fileRegex = /`([a-zA-Z0-9_-]+\.md)`/g;
    let m;
    while ((m = fileRegex.exec(specTableMatch[0])) !== null) {
      listedSpecs.add(m[1]);
    }
  }
  const actualSet = new Set(actualSpecs);
  const missingInTopo = actualSpecs.filter((f) => !listedSpecs.has(f));
  const extraInTopo = [...listedSpecs].filter((f) => !actualSet.has(f));
  if (missingInTopo.length > 0) {
    violations.push({
      severity: 'SEVERE-T02',
      path: 'docs/superpowers/specs/',
      msg: `有 ${missingInTopo.length} 个 spec 未在拓扑表登记: ${missingInTopo.join(', ')}`
    });
  }
  if (extraInTopo.length > 0) {
    violations.push({
      severity: 'SEVERE-T03',
      path: 'docs/topology-priority.md',
      msg: `拓扑表多出 ${extraInTopo.length} 个不存在的 spec: ${extraInTopo.join(', ')}`
    });
  }
}

async function checkHealthMetrics(content) {
  // §3 代码文件状态表:统计各状态实际数量
  const codeSectionMatch = content.match(/## §3 代码文件状态表[\s\S]*?(?=## §4|$)/);
  if (!codeSectionMatch) return;
  const codeSection = codeSectionMatch[0];
  const statusCounts = { '🟢 底座': 0, '🟡 焦点': 0, '🔵 沉淀': 0, '⚪ 已废弃': 0, '🔴 孤儿': 0 };
  for (const status of Object.keys(statusCounts)) {
    const regex = new RegExp(status.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = codeSection.match(regex);
    statusCounts[status] = matches ? matches.length : 0;
  }

  // §6.2 健康指标:提取声明的数值
  // 用 \n--- 或 \n## 作为段落结束标记,避免匹配到空内容
  const healthSectionMatch = content.match(/### 6\.2 健康指标[\s\S]*?(?=\n---|\n## )/);
  const healthSection = healthSectionMatch ? healthSectionMatch[0] : '';

  // 提取"当前"列的数值(格式: **N 个**)
  // 用 [\s\S] 跨行匹配,因为表格行可能很长
  const extractDecl = (label) => {
    const re = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[\\s\\S]*?\\*\\*(\\d+)\\s*个\\*\\*');
    const m = healthSection.match(re);
    return m ? parseInt(m[1]) : null;
  };

  const declared = {
    '🟢 底座': extractDecl('🟢 底座数量'),
    '🟡 焦点': extractDecl('🟡 焦点数量'),
    '🔵 沉淀': extractDecl('🔵 沉淀数量'),
    '⚪ 已废弃': extractDecl('⚪ 废弃数量'),
    '🔴 孤儿': extractDecl('🔴 孤儿数量'),
  };

  console.log('📊 健康指标一致性检查');
  console.log('──────────────────');
  console.log('  状态      | 实际  | 声明');
  console.log('  ──────────┼───────┼──────');
  for (const [status, actual] of Object.entries(statusCounts)) {
    const decl = declared[status];
    if (decl != null) {
      const match = actual === decl ? '✓' : '✗';
      console.log(`  ${match} ${status.padEnd(8)} | ${String(actual).padStart(5)} | ${String(decl).padStart(5)}`);
      if (actual !== decl) {
        violations.push({
          severity: 'WARN-T05',
          path: 'docs/topology-priority.md §6.2',
          msg: `${status} 实际 ${actual} 个,但 §6.2 声明 ${decl} 个(偏差 ${actual - decl})`
        });
      }
    } else {
      console.log(`  • ${status.padEnd(8)} | ${String(actual).padStart(5)} | (未声明)`);
    }
  }
  console.log('');
}

async function main() {
  await checkDir('src/core', '3\\.1', 'src/core/');
  await checkDir('src/render', '3\\.2', 'src/render/');
  await checkDir('src/topology', '3\\.3', 'src/topology/');
  await checkDir('scripts', '3\\.4', 'scripts/');
  await checkSpecs();

  // 健康指标一致性检查(P1-2:防止 §6.2 数值与实际状态不一致)
  const topologyContent = await readFile(join(ROOT, 'docs', 'topology-priority.md'), 'utf8');
  await checkHealthMetrics(topologyContent);

  let exitCode = 0;
  if (violations.length === 0) {
    console.log('✓ 拓扑表一致性检查通过');
  } else {
    for (const v of violations) {
      const sym = v.severity.startsWith('FATAL') ? '✗' : '⚠';
      console.error(`${sym} ${v.severity}  ${v.path}  ${v.msg}`);
      if (v.severity.startsWith('FATAL')) exitCode = 1;
    }
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('FATAL: check-topology 运行失败', e);
  process.exit(1);
});
