#!/usr/bin/env node
/**
 * [INPUT]: docs/topology-priority.md, docs/superpowers/specs/*.md, src/**\/*.js, scripts/**\/*.mjs
 * [OUTPUT]: 检查 spec 与代码的关联覆盖率;FATAL 退出 1,SEVERE/WARN 仍 exit 0
 * [POS]: scripts/ 下,被 npm run check:spec 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function walk(dir, extensions = ['.js', '.mjs']) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage' || e.name === 'tests') continue;
      files = files.concat(await walk(path, extensions));
    } else {
      if (extensions.some(ext => e.name.endsWith(ext)) && !e.name.includes('.test.')) {
        files.push(path);
      }
    }
  }
  return files;
}

function extractSpecTable(content) {
  const specs = [];
  const sectionRegex = /### 2\.1[\s\S]*?(?=\n### |\n---|$)/;
  const match = content.match(sectionRegex);
  if (!match) return specs;
  const section = match[0];
  const rowRegex = /\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/g;
  let m;
  while ((m = rowRegex.exec(section)) !== null) {
    specs.push({
      file: m[1].trim(),
      status: m[2].trim(),
      created: m[3].trim(),
      relatedCode: m[4].trim(),
      note: m[5].trim()
    });
  }
  return specs;
}

function extractCodeSections(content, sectionHeading) {
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
const stats = {
  totalSpecs: 0,
  specsWithCodeRef: 0,
  specsWithoutCodeRef: 0,
  activeSpecs: 0,
  deprecatedSpecs: 0,
  orphanSpecs: 0,
  totalCodeFiles: 0,
  codeWithSpecRef: 0,
  codeWithoutSpecRef: 0,
};

async function main() {
  const topologyContent = await readFile(join(ROOT, 'docs', 'topology-priority.md'), 'utf8');
  const specTable = extractSpecTable(topologyContent);
  stats.totalSpecs = specTable.length;

  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const actualSpecFiles = (await readdir(specsDir))
    .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md');

  const actualSpecSet = new Set(actualSpecFiles);
  for (const spec of specTable) {
    if (!actualSpecSet.has(spec.file)) {
      violations.push({
        severity: 'SEVERE-S01',
        path: `docs/superpowers/specs/${spec.file}`,
        msg: `拓扑表中登记的 spec 文件不存在`
      });
    }
    if (spec.status.includes('废弃')) {
      stats.deprecatedSpecs++;
    } else if (spec.status.includes('孤儿')) {
      stats.orphanSpecs++;
    } else {
      stats.activeSpecs++;
    }
    if (spec.relatedCode && !spec.relatedCode.includes('已被') && !spec.relatedCode.includes('(已')) {
      stats.specsWithCodeRef++;
    } else {
      stats.specsWithoutCodeRef++;
    }
  }

  const srcFiles = await walk(join(ROOT, 'src'));
  const scriptFiles = await walk(join(ROOT, 'scripts'), ['.mjs']);
  const allCodeFiles = [...srcFiles, ...scriptFiles];
  stats.totalCodeFiles = allCodeFiles.length;

  const codeToSpecs = new Map();
  for (const spec of specTable) {
    if (spec.status.includes('废弃') || spec.status.includes('孤儿')) continue;
    const related = spec.relatedCode;
    if (!related || related.includes('已被') || related.includes('(已')) continue;

    const fileMatches = related.match(/[a-zA-Z0-9_-]+\.(?:js|mjs|cjs)/g) || [];
    for (const f of fileMatches) {
      if (!codeToSpecs.has(f)) codeToSpecs.set(f, []);
      codeToSpecs.get(f).push(spec.file);
    }

    if (related.includes('全集') || related.includes('/*') || related.includes('files)')) {
      const allCodeFiles = [...srcFiles, ...scriptFiles];
      for (const af of allCodeFiles) {
        const base = basename(af);
        if (!codeToSpecs.has(base)) codeToSpecs.set(base, []);
        if (!codeToSpecs.get(base).includes(spec.file)) {
          codeToSpecs.get(base).push(spec.file);
        }
      }
    }

    const dirPatterns = [
      { dir: 'src/persistence', full: join(ROOT, 'src', 'persistence') },
      { dir: 'src/render', full: join(ROOT, 'src', 'render') },
      { dir: 'src/core', full: join(ROOT, 'src', 'core') },
      { dir: 'src/topology', full: join(ROOT, 'src', 'topology') },
      { dir: 'src/sim', full: join(ROOT, 'src', 'sim') },
      { dir: 'src/ui', full: join(ROOT, 'src', 'ui') },
      { dir: 'scripts', full: join(ROOT, 'scripts') },
    ];
    for (const { dir, full } of dirPatterns) {
      if (related.includes(dir) && (related.includes('*') || related.includes('全集') || related.includes('all') || related.includes('files)'))) {
        if (existsSync(full)) {
          const dirFiles = (await readdir(full)).filter(f => /\.(js|mjs|cjs)$/.test(f) && !f.includes('.test.'));
          for (const df of dirFiles) {
            if (!codeToSpecs.has(df)) codeToSpecs.set(df, []);
            if (!codeToSpecs.get(df).includes(spec.file)) {
              codeToSpecs.get(df).push(spec.file);
            }
          }
        }
      }
    }
  }

  for (const codeFile of allCodeFiles) {
    const baseName = basename(codeFile);
    const relPath = relative(ROOT, codeFile);
    if (codeToSpecs.has(baseName)) {
      stats.codeWithSpecRef++;
    } else {
      stats.codeWithoutSpecRef++;
      if (!relPath.startsWith('src/sim/') && !relPath.startsWith('src/topology/') && !relPath.startsWith('src/ui/')) {
        violations.push({
          severity: 'WARN-S02',
          path: relPath,
          msg: `代码文件未关联任何 spec`
        });
      }
    }
  }

  const coverage = stats.totalCodeFiles > 0
    ? ((stats.codeWithSpecRef / stats.totalCodeFiles) * 100).toFixed(1)
    : '0.0';

  console.log('📊 Spec 覆盖率报告');
  console.log('────────────────────────');
  console.log(`  总 spec 数:    ${stats.totalSpecs}`);
  console.log(`    活跃 spec:   ${stats.activeSpecs}`);
  console.log(`    废弃 spec:   ${stats.deprecatedSpecs}`);
  console.log(`    孤儿 spec:   ${stats.orphanSpecs}`);
  console.log(`  有代码关联:    ${stats.specsWithCodeRef}`);
  console.log('');
  console.log(`  总代码文件:    ${stats.totalCodeFiles}`);
  console.log(`  有 spec 关联:  ${stats.codeWithSpecRef}`);
  console.log(`  无 spec 关联:  ${stats.codeWithoutSpecRef}`);
  console.log(`  覆盖率:        ${coverage}%`);
  console.log('');

  const specCoverage = stats.activeSpecs > 0
    ? ((stats.specsWithCodeRef / stats.activeSpecs) * 100).toFixed(1)
    : '0.0';
  console.log(`  活跃 spec 关联率: ${specCoverage}%`);
  console.log('');

  let exitCode = 0;
  if (violations.length === 0) {
    console.log('✓ Spec 覆盖率检查通过');
  } else {
    console.log('⚠ 发现以下问题:');
    for (const v of violations) {
      const sym = v.severity.startsWith('FATAL') ? '✗' : v.severity.startsWith('SEVERE') ? '⚠' : 'ℹ';
      console.log(`  ${sym} ${v.severity}  ${v.path}  ${v.msg}`);
      if (v.severity.startsWith('FATAL')) exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error('FATAL: check-spec-coverage 运行失败', e);
  process.exit(1);
});
