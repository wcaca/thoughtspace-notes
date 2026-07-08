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
import { execSync } from 'node:child_process';

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
            const depRuleMatch = tail.match(/depcruise\s*规则[:：]\s*`?([a-z0-9-]+)`?/);
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
// FATAL-005 自检: depcruise 规则名与 L1 架构约束交叉校验
// ============================================================
// FATAL-005 自检: depcruise 规则名与 L1 架构约束交叉校验
{
  const cruisePath = join(ROOT, 'dependency-cruiser.config.mjs');
  const rootClaudePath = join(ROOT, 'CLAUDE.md');
  if (existsSync(cruisePath) && existsSync(rootClaudePath)) {
    try {
      // SubTask 2.1: dynamic import 读取 dependency-cruiser.config.mjs,提取所有规则 name 与 comment
      const cfgUrl = new URL(`file:///${cruisePath.replace(/\\/g, '/')}`).href;
      const { default: cruiseCfg } = await import(cfgUrl);
      const rules = (cruiseCfg.forbidden || []).map((r) => ({
        name: r.name,
        comment: r.comment || ''
      }));

      // SubTask 2.2: 读 CLAUDE.md,提取 §ARCHITECTURE 段声明的约束
      const content = await readFile(rootClaudePath, 'utf8');
      const m = content.match(/### 不可违反的架构约束[\s\S]*?(?=\n### |\n## |$)/);
      if (m) {
        const block = m[0];

        // 从 L1 提取所有 depcruise 规则引用:ruleName → [L1-N] 编号
        const l1DepRules = new Map();
        const depRuleRegex = /\[L1-(\d+)\][^\n]*?depcruise\s*规则[:：]\s*`?([a-z0-9-]+)`?/g;
        let depMatch;
        while ((depMatch = depRuleRegex.exec(block)) !== null) {
          l1DepRules.set(depMatch[2], depMatch[1]);
        }

        // SubTask 2.3 比对 1: depcruise config 中每条规则的 comment 应引用 L1 架构约束编号
        for (const rule of rules) {
          const cmtMatch = rule.comment.match(/L1\s*架构约束\s*(\d+)/);
          if (!cmtMatch) {
            violations.push({
              severity: 'SEVERE-005',
              path: 'dependency-cruiser.config.mjs',
              msg: `FATAL-005 自检: 规则 "${rule.name}" 的 comment 未引用任何 L1 架构约束编号`
            });
          }
        }

        // SubTask 2.3 比对 2: L1 声明的 depcruise 规则应在 config 中存在对应规则
        const cfgRuleNames = new Set(rules.map((r) => r.name));
        for (const [ruleName, l1Id] of l1DepRules) {
          if (!cfgRuleNames.has(ruleName)) {
            violations.push({
              severity: 'SEVERE-005',
              path: 'dependency-cruiser.config.mjs',
              msg: `FATAL-005 自检: L1-${l1Id} 声明 depcruise 规则 "${ruleName}",但 config 中无对应规则`
            });
          }
        }
      }
    } catch {
      // dependency-cruiser.config.mjs 无法读取或解析 → graceful 跳过,不阻塞
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

// ============================================================
// FATAL-001: 孤立代码变更检测(改代码不改 L3/L2)
// ============================================================
// FATAL-001: 孤立代码变更检测
{
  let changedEntries = null;
  try {
    // 用 git diff --name-status HEAD 同时获取状态码与路径(A/M/D)
    const out = execSync('git diff --name-status HEAD', {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    changedEntries = out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const parts = l.split('\t');
        return { status: parts[0] || '', path: parts[1] || '' };
      });
  } catch {
    // git 不可用 / 非 git 仓库 / 无 HEAD → graceful 跳过,不阻塞
    changedEntries = null;
  }

  if (changedEntries) {
    const changedPathSet = new Set(changedEntries.map((c) => c.path));

    for (const c of changedEntries) {
      const p = c.path;
      // 仅检查 src/**/*.js,排除 .test.js
      if (!p.startsWith('src/')) continue;
      if (!p.endsWith('.js')) continue;
      if (p.endsWith('.test.js')) continue;

      if (c.status === 'M') {
        // SubTask 1.2: 修改文件 — 检查 L3 头部是否同步更新
        let diff = '';
        try {
          diff = execSync(`git diff HEAD -- ${JSON.stringify(p)}`, {
            cwd: ROOT,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'ignore']
          });
        } catch {
          continue;
        }
        if (!diff) continue;

        // 统计变更行数(以 + 或 - 开头,排除 +++/--- 头与纯空行)
        const diffLines = diff.split('\n');
        let changedLines = 0;
        for (const line of diffLines) {
          if (/^\+(?!\+\+)/.test(line) || /^-(?!--)/.test(line)) {
            if (line.slice(1).trim() !== '') changedLines++;
          }
        }
        if (changedLines < 3) continue;

        // 读前 500 字符,确认 L3 头部存在(若缺失则由 FATAL-002 处理)
        const absPath = join(ROOT, ...p.split('/'));
        let head = '';
        try {
          head = (await readFile(absPath, 'utf8')).slice(0, 500);
        } catch {
          continue;
        }
        const hasL3 = ['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every((s) =>
          head.includes(s)
        );
        if (!hasL3) continue;

        // 检查 L3 头部是否在 diff 中被修改
        const headerModified = diffLines.some(
          (line) =>
            (/^\+(?!\+\+)/.test(line) || /^-(?!--)/.test(line)) &&
            /\[(INPUT|OUTPUT|POS|PROTOCOL)\]:/.test(line)
        );
        if (!headerModified) {
          violations.push({
            severity: 'FATAL-001',
            path: p,
            msg: `孤立代码变更: ${p} 改了代码但未同步 L3 头部`
          });
        }
      } else if (c.status === 'A' || c.status === 'D') {
        // SubTask 1.3: 新增/删除文件 — 检查所在目录的 CLAUDE.md 是否在变更列表中
        const slashIdx = p.lastIndexOf('/');
        const dir = slashIdx > 0 ? p.substring(0, slashIdx) : '';
        const claudeRel = dir ? `${dir}/CLAUDE.md` : 'CLAUDE.md';
        if (!changedPathSet.has(claudeRel)) {
          violations.push({
            severity: 'FATAL-004',
            path: p,
            msg: `孤立 ${c.status === 'A' ? '新增' : '删除'}: ${p} 但 ${claudeRel} 未同步更新`
          });
        }
      }
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