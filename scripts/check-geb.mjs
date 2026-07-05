#!/usr/bin/env node
/**
 * [INPUT]: 本仓库 docs/,src/,CLAUDE.md,scripts/,*.html
 * [OUTPUT]: 检查 GEB 三层完整性;FATAL 错误 exit 1;SEVERE 警告仍 exit 0(由 CI 升级)
 * [POS]: scripts/ 下,被 npm run check:geb 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
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

const violations = [];
const srcExists = existsSync(join(ROOT, 'src'));

// FATAL-002 + SEVERE-001: 每个 src/.js 必须有 L3 头部
if (srcExists) {
  const srcFiles = (await walk(join(ROOT, 'src'))).filter(
    (f) => /\.(js|mjs|cjs)$/.test(f) && !/\.test\.|__tests__/.test(f)
  );
  for (const f of srcFiles) {
    const head = (await readFile(f, 'utf8')).slice(0, 800);
    const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
      head.includes(s)
    );
    if (!hasAll) {
      violations.push({ severity: 'FATAL-002', path: relative(ROOT, f), msg: '缺 L3 文件头部契约' });
    }
  }
}

// SEVERE-001 扩展:scripts/ 下的 .js 也应有 L3 头部(check-geb.mjs 自己除外避免递归)
const scriptsFiles = (await walk(join(ROOT, 'scripts'))).filter(
  (f) => /\.(js|mjs)$/.test(f) && !/\.test\.|__tests__/.test(f) && !f.endsWith('check-geb.mjs')
);
for (const f of scriptsFiles) {
  const head = (await readFile(f, 'utf8')).slice(0, 800);
  const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
    head.includes(s)
  );
  if (!hasAll) {
    violations.push({ severity: 'SEVERE-001', path: relative(ROOT, f), msg: 'scripts/ 下缺 L3 文件头部契约' });
  }
}

// FATAL-004: src/ 子目录无 CLAUDE.md
if (srcExists) {
  const subdirs = (await readdir(join(ROOT, 'src'), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => join('src', e.name));
  for (const sd of subdirs) {
    const claudePath = join(ROOT, sd, 'CLAUDE.md');
    if (!existsSync(claudePath)) {
      violations.push({ severity: 'FATAL-004', path: sd, msg: '子目录无 CLAUDE.md(L2 缺失)' });
    }
  }
}

let exitCode = 0;
if (violations.length === 0) {
  console.log('✓ GEB 一致性检查通过');
} else {
  for (const v of violations) {
    const sym = v.severity.startsWith('FATAL') ? '✗' : '⚠';
    console.error(`${sym} ${v.severity}  ${v.path}  ${v.msg}`);
    if (v.severity.startsWith('FATAL')) exitCode = 1;
  }
}
process.exit(exitCode);
