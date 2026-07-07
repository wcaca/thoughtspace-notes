#!/usr/bin/env node
/**
 * [INPUT]: docs/superpowers/specs/*.md 的 flags: frontmatter + src/**\/*.js (isOn/getVariant 调用)
 * [OUTPUT]: 检查 flag 拓扑规则:声明一致性、scope、lifecycle、regression_subset、引用闭环
 * [POS]: scripts/ 下,被 npm run check:flag-topology 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  try { return yaml.load(match[1]) || {}; } catch { return null; }
}

const violations = [];
const stats = {
  totalFlags: 0,
  byStatus: {},
  byType: {},
  totalSpecsWithFlags: 0,
  declaredButNotUsed: 0,
  usedButNotDeclared: 0,
};

function v(severity, code, path, msg) {
  violations.push({ severity, code, path, msg });
}

async function walk(dir, exts = ['.js', '.mjs']) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage') continue;
      files = files.concat(await walk(path, exts));
    } else {
      if (exts.some(x => e.name.endsWith(x)) && !e.name.includes('.test.')) {
        files.push(path);
      }
    }
  }
  return files;
}

async function main() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const specFiles = (await readdir(specsDir)).filter(f => f.endsWith('-design.md'));
  const specsById = new Map();
  const allFlags = [];
  for (const f of specFiles) {
    const content = await readFile(join(specsDir, f), 'utf8');
    const meta = parseFrontmatter(content);
    if (!meta) continue;
    specsById.set(meta.id, { file: f, meta });
    if (Array.isArray(meta.flags)) {
      stats.totalSpecsWithFlags++;
      for (const flag of meta.flags) {
        allFlags.push({ ...flag, _spec_file: f });
      }
    }
  }

  const flagByName = new Map();
  for (const flag of allFlags) {
    if (!flag.name) {
      v('FATAL', 'F5', flag._spec_file, 'flag 缺少 name 字段');
      continue;
    }
    if (flagByName.has(flag.name)) {
      v('FATAL', 'F5', flag._spec_file, `flag "${flag.name}" 在多份 spec 中重复声明`);
      continue;
    }
    flagByName.set(flag.name, flag);
    stats.totalFlags++;
    stats.byStatus[flag.status] = (stats.byStatus[flag.status] || 0) + 1;
    stats.byType[flag.type] = (stats.byType[flag.type] || 0) + 1;
  }

  for (const [name, flag] of flagByName) {
    if (!flag.type || !['boolean', 'enum', 'number', 'string', 'json'].includes(flag.type)) {
      v('FATAL', 'F4', flag._spec_file, `flag "${name}" 缺少 type 或类型非法`);
    }
    if (flag.type === 'enum' && (!Array.isArray(flag.values) || !flag.values.includes(flag.default))) {
      v('FATAL', 'F4', flag._spec_file, `flag "${name}" 是 enum 类型但 default 不在 values 内`);
    }
    if (!flag.owner_spec) {
      v('FATAL', 'F2', flag._spec_file, `flag "${name}" 缺少 owner_spec`);
    } else if (!specsById.has(flag.owner_spec)) {
      v('FATAL', 'F2', flag._spec_file, `flag "${name}" 引用不存在的 owner_spec: ${flag.owner_spec}`);
    }
    if (!Array.isArray(flag['regression_subset']?.include)) {
      v('WARN', 'I2', flag._spec_file, `flag "${name}" regression_subset.include 缺失或非数组`);
    } else {
      for (const t of flag['regression_subset'].include) {
        const fullPath = join(ROOT, t);
        if (!existsSync(fullPath)) {
          v('WARN', 'I2', flag._spec_file, `flag "${name}" 引用不存在的测试文件: ${t}`);
        }
      }
    }
    if (flag.cohort && Array.isArray(flag.cohort.weights)) {
      const total = flag.cohort.weights.reduce((s, w) => s + (w.weight || 0), 0);
      if (total !== 100) {
        v('WARN', 'W5', flag._spec_file, `flag "${name}" cohort.weights 总和 ${total} ≠ 100`);
      }
    }
    if (flag.status === 'experimental') {
      const since = new Date(flag.since || '2026-07-07').getTime();
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - since > thirtyDays) {
        v('WARN', 'W2', flag._spec_file, `flag "${name}" experimental 超 30 天未升 beta`);
      }
    }
    if (flag.status === 'deprecated' && (!flag['deprecation_window_days'] || flag['deprecation_window_days'] < 30)) {
      v('FATAL', 'F5', flag._spec_file, `flag "${name}" deprecated 状态必须设 deprecation_window_days ≥ 30`);
    }
  }

  const codeFiles = await walk(join(ROOT, 'src'));
  const allCodeFiles = codeFiles.concat(await walk(join(ROOT, 'tests')));
  const flagUsage = new Map();
  const isOnRegex = /\b(?:_?isFlagOn|isOn)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const getVariantRegex = /\b(?:_?getFlagVariant|getVariant)\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const resolverRefRegex = /_flagResolver\s*\(\s*['"`]([^'"`]+)['"`]/g;
  for (const codePath of allCodeFiles) {
    const rel = codePath.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
    if (rel.includes('.test.')) continue;
    const content = await readFile(codePath, 'utf8');
    let m;
    while ((m = isOnRegex.exec(content)) !== null) {
      const name = m[1];
      if (!flagUsage.has(name)) flagUsage.set(name, []);
      flagUsage.get(name).push({ file: rel, kind: 'isOn' });
    }
    while ((m = getVariantRegex.exec(content)) !== null) {
      const name = m[1];
      if (!flagUsage.has(name)) flagUsage.set(name, []);
      flagUsage.get(name).push({ file: rel, kind: 'getVariant' });
    }
    while ((m = resolverRefRegex.exec(content)) !== null) {
      const name = m[1];
      if (!flagUsage.has(name)) flagUsage.set(name, []);
      flagUsage.get(name).push({ file: rel, kind: 'flagResolver' });
    }
  }

  for (const [name, usages] of flagUsage) {
    if (!flagByName.has(name)) {
      v('FATAL', 'F1', usages[0].file, `代码引用未声明的 flag: ${name}`);
      stats.usedButNotDeclared++;
    } else {
      const flag = flagByName.get(name);
      const allowedFiles = new Set(flag.scope?.files || []);
      const allowedModules = flag.scope?.modules || [];
      for (const usage of usages) {
        const inAllowedFile = allowedFiles.size === 0 || [...allowedFiles].some(f => usage.file.replace(/^\.\//, '').endsWith(f) || usage.file.endsWith(f));
        const inAllowedModule = allowedModules.length === 0 || allowedModules.some(m => usage.file.startsWith(m));
        if (!inAllowedFile && !inAllowedModule) {
          v('FATAL', 'F3', usage.file, `flag "${name}" 不在 scope.files/modules 内 (scope: ${[...allowedFiles].join(', ')})`);
        }
      }
    }
  }

  for (const [name, flag] of flagByName) {
    if (!flagUsage.has(name) && flag.status !== 'deprecated' && flag.status !== 'archived') {
      v('WARN', 'W1', flag._spec_file, `flag "${name}" 已声明但代码中无 isOn/getVariant 引用`);
      stats.declaredButNotUsed++;
    }
  }

  console.log('🚩 Feature Flag 拓扑规则检查报告');
  console.log('────────────────────────');
  console.log(`  总 flag 数:         ${stats.totalFlags}`);
  console.log(`  含 flag 的 spec 数: ${stats.totalSpecsWithFlags}`);
  console.log('');
  console.log('  按 status:');
  for (const [s, c] of Object.entries(stats.byStatus)) {
    console.log(`    ${s}: ${c}`);
  }
  console.log('');
  console.log('  按 type:');
  for (const [t, c] of Object.entries(stats.byType)) {
    console.log(`    ${t}: ${c}`);
  }
  console.log('');
  console.log(`  引用闭环: 声明但未引用 ${stats.declaredButNotUsed}, 引用但未声明 ${stats.usedButNotDeclared}`);
  console.log('');

  let exitCode = 0;
  if (violations.length === 0) {
    console.log('✓ Feature Flag 拓扑规则检查通过');
  } else {
    const byCode = {};
    for (const v of violations) {
      const k = `${v.severity}-${v.code}`;
      if (!byCode[k]) byCode[k] = [];
      byCode[k].push(v);
    }
    console.log('⚠ 发现以下问题:');
    for (const [k, list] of Object.entries(byCode)) {
      const sample = list[0];
      const sym = sample.severity.startsWith('FATAL') ? '✗' : sample.severity.startsWith('WARN') ? '⚠' : 'ℹ';
      console.log(`  ${sym} ${k} × ${list.length}`);
      for (const v of list.slice(0, 5)) {
        console.log(`      ${v.path}: ${v.msg}`);
      }
      if (list.length > 5) console.log(`      ... +${list.length - 5} more`);
      if (sample.severity.startsWith('FATAL')) exitCode = 1;
    }
  }

  process.exit(exitCode);
}

main().catch((e) => {
  console.error('FATAL: check-flag-topology 失败', e);
  process.exit(1);
});