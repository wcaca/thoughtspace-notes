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

// ============================================================
// L1 §ARCHITECTURE 校验(P0-2 实施)
// ============================================================
{
  const rootClaudePath = join(ROOT, 'CLAUDE.md');
  if (existsSync(rootClaudePath)) {
    try {
      const content = await readFile(rootClaudePath, 'utf8');
      const m = content.match(/### 不可违反的架构约束[\s\S]*?(?=\n### |\n## |$)/);
      if (m) {
        const block = m[0];
        const constraintRegex = /\[L1-(\d+)\][^\n]*?(?:→|:|：)\s*([^\n]+)/g;
        const matches = [...block.matchAll(constraintRegex)];
        if (matches.length === 0) {
          violations.push({
            severity: 'FATAL-008',
            path: 'CLAUDE.md',
            msg: 'L1 §ARCHITECTURE 段未声明 [L1-N] 机器校验锚点'
          });
        } else {
          let cruiseRules = new Set();
          const cruisePath = join(ROOT, 'dependency-cruiser.config.mjs');
          if (existsSync(cruisePath)) {
            try {
              const cfgUrl = new URL(`file:///${cruisePath.replace(/\\/g, '/')}`).href;
              const { default: cruiseCfg } = await import(cfgUrl);
              cruiseRules = new Set((cruiseCfg.forbidden || []).map(r => r.name));
            } catch {}
          }
          for (const mm of matches) {
            const id = mm[1];
            const tail = mm[2];
            const depRuleMatch = tail.match(/depcruise\s*规则[:：]\s*`?([a-z-]+)`?/);
            const checkMatch = tail.match(/check-([a-z-]+)/);
            if (depRuleMatch) {
              const ruleName = depRuleMatch[1];
              if (!cruiseRules.has(ruleName)) {
                violations.push({
                  severity: 'FATAL-008',
                  path: 'CLAUDE.md',
                  msg: `[L1-${id}] 引用 depcruise 规则 "${ruleName}",但 dependency-cruiser.config.mjs 中不存在`
                });
              }
            } else if (checkMatch) {
              const scriptName = checkMatch[1];
              const scriptPath = join(ROOT, 'scripts', `check-${scriptName}.mjs`);
              if (!existsSync(scriptPath)) {
                violations.push({
                  severity: 'FATAL-008',
                  path: 'CLAUDE.md',
                  msg: `[L1-${id}] 引用 check-${scriptName}.mjs,但脚本不存在`
                });
              }
            }
          }
        }
      } else {
        violations.push({
          severity: 'SEVERE-004',
          path: 'CLAUDE.md',
          msg: 'L1 §ARCHITECTURE 段缺失:无"### 不可违反的架构约束"章节'
        });
      }
    } catch (e) {
      violations.push({ severity: 'SEVERE-002', path: 'CLAUDE.md', msg: '读取 CLAUDE.md 失败: ' + e.message });
    }
  }
}

// ============================================================
// L2/L3 检查
// ============================================================
if (srcExists) {
  const srcFiles = (await walk(join(ROOT, 'src'))).filter(
    (f) => /\.(js|mjs|cjs)$/.test(f) && !/\.test\.|__tests__/.test(f)
  );

  // FATAL-002: 每个 src/.js 必须有 L3 头部
  for (const f of srcFiles) {
    const head = (await readFile(f, 'utf8')).slice(0, 800);
    const hasAll = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
      head.includes(s)
    );
    if (!hasAll) {
      violations.push({ severity: 'FATAL-002', path: relative(ROOT, f), msg: '缺 L3 文件头部契约' });
    }
  }

  // FATAL-009 / L1-7 grep guard:代码中不得擅自修改核心算法阈值
  const overridePatterns = [
    /OVERRIDE_THRESHOLD/i,
    /TODO.*改.*阈值/,
    /TEMP_TWEAK/i
  ];
  for (const f of srcFiles) {
    const text = await readFile(f, 'utf8');
    for (const op of overridePatterns) {
      if (op.test(text)) {
        violations.push({
          severity: 'FATAL-009',
          path: relative(ROOT, f),
          msg: `L1-7 算法阈值守卫:检测到阈值覆盖标记 ${op},请通过 spec 修订而非代码 hack`
        });
      }
    }
  }

  // FATAL-004: src/ 子目录无 CLAUDE.md
  // FATAL-006: L2 成员清单与实际文件不一致(缺失)
  // FATAL-007: L2 成员清单与实际文件不一致(多出 — 文档撒谎)
  const subdirs = (await readdir(join(ROOT, 'src'), { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => join('src', e.name));
  for (const sd of subdirs) {
    const claudePath = join(ROOT, sd, 'CLAUDE.md');
    if (!existsSync(claudePath)) {
      violations.push({ severity: 'FATAL-004', path: sd, msg: '子目录无 CLAUDE.md(L2 缺失)' });
      continue;
    }
    try {
      const content = await readFile(claudePath, 'utf8');
      const listedFiles = new Set();
      const listedDirs = new Set();
      const memberMatch = content.match(/## 成员清单[\s\S]*?(?=\n## |\n\[PROTOCOL\]|$)/);
      if (memberMatch) {
        const memberSection = memberMatch[0];
        const fileRegex = /`([a-zA-Z0-9_-]+\.(?:js|mjs|cjs))`/g;
        const dirRegex = /`([a-zA-Z0-9_-]+)\/`/g;
        let m;
        while ((m = fileRegex.exec(memberSection)) !== null) {
          listedFiles.add(m[1]);
        }
        while ((m = dirRegex.exec(memberSection)) !== null) {
          listedDirs.add(m[1]);
        }
      }
      const sdFull = join(ROOT, sd);
      const actualEntries = (await readdir(sdFull, { withFileTypes: true }));
      const actualFiles = actualEntries
        .filter((e) => e.isFile())
        .map((e) => e.name)
        .filter((f) => /\.(js|mjs|cjs)$/.test(f))
        .filter((f) => !/\.test\.|__tests__/.test(f));
      const actualSubdirs = actualEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
      for (const sub of actualSubdirs) {
        if (listedDirs.has(sub)) {
          const subFiles = (await readdir(join(sdFull, sub)))
            .filter((f) => /\.(js|mjs|cjs)$/.test(f))
            .filter((f) => !/\.test\.|__tests__/.test(f));
          for (const sf of subFiles) actualFiles.push(`${sub}/${sf}`);
        }
      }
      const actualSet = new Set(actualFiles);
      const missingInList = actualFiles.filter((f) => {
        const base = f.includes('/') ? f.split('/').pop() : f;
        return !listedFiles.has(f) && !listedFiles.has(base);
      });
      const extraInList = [...listedFiles].filter((f) => !actualSet.has(f) && !actualFiles.some(af => af.endsWith('/' + f) || af === f));
      if (missingInList.length > 0) {
        violations.push({
          severity: 'SEVERE-003',
          path: sd + '/CLAUDE.md',
          msg: `L2 成员清单缺失 ${missingInList.length} 个文件: ${missingInList.join(', ')}`
        });
      }
      if (extraInList.length > 0) {
        // P0-5: 反转严重度 — 文档撒谎(清单有但无文件)比文档漏写更严重
        violations.push({
          severity: 'FATAL-007',
          path: sd + '/CLAUDE.md',
          msg: `L2 成员清单多出 ${extraInList.length} 个不存在的文件(文档撒谎): ${extraInList.join(', ')}`
        });
      }
    } catch (e) {
      violations.push({ severity: 'SEVERE-002', path: sd + '/CLAUDE.md', msg: '读取 CLAUDE.md 失败' });
    }
  }
}

// SEVERE-001: scripts/ 下的 .js 也应有 L3 头部(check-geb.mjs 自己除外)
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

// ============================================================
// 报告
// ============================================================
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