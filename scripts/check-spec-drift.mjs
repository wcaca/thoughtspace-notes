#!/usr/bin/env node
// [INPUT]: docs/superpowers/specs/*.md 的 decisions[] + scope, src/**/*.js
// [OUTPUT]: 代码↔决策漂移检测 — 当实验性 spec (floating decisions) 的代码偏离声明时 WARN
// [POS]: scripts/ 下,被 npm run check:spec-drift 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
//
// P2-4: 双向同步机制 — 规范指导试验
//   - spec decisions[] 声明 lock_state=floating → 代码可偏离但需 warn
//   - spec decisions[] 声明 lock_state=locked → 代码偏离 = FATAL
//   - 漂移检测: 对 floating decisions 计算 |code_value - spec_value| / spec_value, > drift_tolerance → WARN
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseFrontmatter(content) {
  const match = content.match(/---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) || {};
  } catch (e) {
    return null;
  }
}

async function walk(dir, exts = ['.js', '.mjs']) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage' || e.name === 'tests') continue;
      files = files.concat(await walk(p, exts));
    } else {
      if (exts.some(x => e.name.endsWith(x)) && !e.name.includes('.test.')) files.push(p);
    }
  }
  return files;
}

// P2-4: 从 spec 决策 statement 中提取数值约束
// 例如:
//   "shape 权重 α=0.5 β=0.3 γ=0.2"  → [{name: α, value: 0.5}, ...]
//   "温度→Y 拉拽 targetY = bottom + (top-bottom) * clamp(temperature, 0, 1)"
function parseDecisionValues(statement) {
  const values = [];
  // 匹配 "key=value" 形式 (支持 α=0.5 / limit=10 / min=0.3)
  const kvRe = /([αβγa-zA-Z_][\w]*)\s*[=:]\s*([\d.]+)/g;
  let m;
  while ((m = kvRe.exec(statement)) !== null) {
    const v = parseFloat(m[2]);
    if (!isNaN(v)) values.push({ key: m[1], value: v });
  }
  return values;
}

// P2-4: 从代码中提取同名数值
// 仅匹配"声明形式" (const X = {key:value} 或 Object.freeze({key:value}))
// 不匹配 profile/option 列表中的其他值
function extractCodeValues(codeText, key) {
  const results = [];
  const escapedKey = key.replace(/α/g, '\\u03B1').replace(/β/g, '\\u03B2').replace(/γ/g, '\\u03B3');
  // 模式 1: DEFAULT_X = Object.freeze({ key: value, ... })
  const objPattern = new RegExp(
    `(?:const|let|var)\\s+\\w*\\s*=\\s*Object\\.freeze\\s*\\(\\s*\\{[^}]*\\b${escapedKey}\\s*:\\s*([\\d.]+)[^}]*\\}`,
    'g'
  );
  // 模式 2: const X = { key: value } (顶层声明)
  const simplePattern = new RegExp(
    `(?:const|let|var)\\s+\\w*\\s*=\\s*\\{[^}]*\\b${escapedKey}\\s*:\\s*([\\d.]+)[^}]*\\}`,
    'g'
  );
  for (const p of [objPattern, simplePattern]) {
    let m;
    while ((m = p.exec(codeText)) !== null) {
      const v = parseFloat(m[1]);
      if (!isNaN(v)) results.push(v);
    }
  }
  return results;
}

async function main() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const specFiles = (await readdir(specsDir)).filter(f => f.endsWith('-design.md'));

  // 加载所有代码
  const codeFiles = await walk(join(ROOT, 'src'));
  const codeByBase = new Map();
  for (const f of codeFiles) {
    const base = f.split(/[/\\]/).pop();
    codeByBase.set(base, await readFile(f, 'utf8'));
  }

  const drifts = [];
  const orphanDecisions = [];

  for (const f of specFiles) {
    const meta = parseFrontmatter((await readFile(join(specsDir, f), 'utf8')));
    if (!meta || !Array.isArray(meta.decisions)) continue;

    // P2-4: 只检查 draft/experiment phase 的 spec (sediment 已固化不需要漂移检测)
    if (meta.phase === 'implemented') continue;

    for (const dec of meta.decisions) {
      if (!dec.id || !dec.statement || !dec.scope) continue;

      const scopeFile = dec.scope.split(/[/\\]/).pop();
      const code = codeByBase.get(scopeFile);
      if (!code) {
        orphanDecisions.push({
          spec: meta.id,
          decisionId: dec.id,
          scope: dec.scope,
          msg: `决策 ${dec.id} 指向文件 ${scopeFile} 但代码不存在`
        });
        continue;
      }

      // 提取声明值与代码值
      const declaredValues = parseDecisionValues(dec.statement);
      if (declaredValues.length === 0) continue;

      const lockState = dec.lock_state || 'floating';
      const driftTolerance = dec.drift_tolerance ?? 0.15;

      for (const dv of declaredValues) {
        const codeValues = extractCodeValues(code, dv.key);
        if (codeValues.length === 0) {
          // 代码未找到该 key, 不是 drift 也不算违规, 只是观察
          continue;
        }

        for (const cv of codeValues) {
          const drift = dv.value === 0 ? Math.abs(cv) : Math.abs(cv - dv.value) / Math.abs(dv.value);
          if (drift > driftTolerance) {
            const severity = lockState === 'locked' ? 'FATAL' : 'WARN';
            drifts.push({
              severity,
              spec: meta.id,
              decisionId: dec.id,
              key: dv.key,
              declared: dv.value,
              actual: cv,
              drift: (drift * 100).toFixed(1) + '%',
              tolerance: (driftTolerance * 100).toFixed(1) + '%',
              lockState,
              scope: dec.scope,
              msg: `[${meta.id}.${dec.id}] ${dv.key} 漂移: spec 声明 ${dv.value}, 代码实际 ${cv} (漂移 ${(drift * 100).toFixed(1)}%, 容忍 ${(driftTolerance * 100).toFixed(1)}%)`
            });
          }
        }
      }
    }
  }

  console.log('🔮 Spec 决策漂移检测 (P2-4)');
  console.log('────────────────────────────');
  console.log(` 扫描了 ${specFiles.length} 个 spec 中 draft/experiment 阶段的 decisions`);
  console.log('');

  if (orphanDecisions.length > 0) {
    console.log(`⚠ 孤儿决策 (scope 文件不存在):`);
    for (const o of orphanDecisions) {
      console.log(`  - ${o.spec}.${o.decisionId} → ${o.scope}: ${o.msg}`);
    }
    console.log('');
  }

  if (drifts.length === 0) {
    console.log('✅ 无决策漂移');
    console.log('   所有实验性 spec 的决策值与代码实现一致 (在容忍度内)');
    process.exit(0);
  }

  const bySeverity = { FATAL: [], WARN: [] };
  for (const d of drifts) bySeverity[d.severity].push(d);

  if (bySeverity.FATAL.length > 0) {
    console.log(`✗ FATAL 漂移 (locked decision 被违反):`);
    for (const d of bySeverity.FATAL) console.log(`    ${d.msg}`);
  }

  if (bySeverity.WARN.length > 0) {
    console.log(`⚠ WARN 漂移 (floating decision 但超出容忍度):`);
    for (const d of bySeverity.WARN) console.log(`    ${d.msg}`);
    console.log('');
    console.log('💡 处理建议:');
    console.log('   - 如果新值更好 → 更新 spec decision.statement + drift_tolerance');
    console.log('   - 如果代码误改 → 回滚代码');
    console.log('   - 如果实验方向调整 → 改 lock_state=reverted 或更新 spec');
  }

  // P2-4: phase=experiment + drift > 50% → 提示 spec 与代码严重脱钩
  const severeDrifts = drifts.filter(d => parseFloat(d.drift) > 50);
  if (severeDrifts.length > 0) {
    console.log('');
    console.log(`🚨 严重漂移 (>50%): ${severeDrifts.length} 个`);
    console.log('   说明: spec 决策与代码实际严重脱钩, 建议:');
    console.log('   1. 立即重新审视 spec 是否仍代表产品意图');
    console.log('   2. 或推进 spec phase → implemented 并同步代码到最新决策');
  }

  process.exit(bySeverity.FATAL.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error('FATAL: check-spec-drift 运行失败', e);
  process.exit(1);
});