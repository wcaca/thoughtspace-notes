#!/usr/bin/env node
/**
 * [INPUT]: docs/superpowers/specs/*.md (含 YAML frontmatter)
 * [OUTPUT]: 检查 spec 拓扑规则——四件套、inherits/supersedes 闭环、跨层方向、scope 一致性、phase 二维状态
 * [POS]: scripts/ 下,被 npm run check:spec-topology 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * P2-1: 引入 phase 字段 — 与 status 正交的"实施进度"维度
 *   status:       base | focus | sediment | deprecated | orphan   (设计凝固度)
 *   phase:        draft | experiment | implemented                 (实施进度)
 *
 * 3 条新门禁:
 *   F6: draft phase 的 spec 不可被代码 @note 引用或被 inherits-from
 *   F7: experiment phase 的 conflicts-with 应改为 proposes:
 *   W5: experiment_window 过期但 phase 仍为 draft/experiment
 */
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const LAYER_ORDER = ['L0', 'L1', 'L2', 'L3', 'L4'];
const ACTIVE_STATUSES = new Set(['base', 'focus', 'sediment']);
const VALID_STATUSES = new Set(['base', 'focus', 'sediment', 'deprecated', 'orphan']);
// P2-1: phase 字段允许值
const VALID_PHASES = new Set(['draft', 'experiment', 'implemented']);

function parseFrontmatter(content) {
  const match = content.match(/---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) || {};
  } catch (e) {
    return null;
  }
}

function layerRank(layer) {
  const m = layer?.toString().match(/^L(\d)/);
  return m ? parseInt(m[1], 10) : 99;
}

const violations = [];
const stats = {
  totalSpecs: 0,
  activeSpecs: 0,
  deprecatedSpecs: 0,
  orphanSpecs: 0,
  byLayer: {},
  byStatus: {},
  byPhase: {},         // P2-1 新增
  withOverrides: 0,
  withConflicts: 0,
  withProposes: 0,     // P2-1 新增
  withNonNegotiable: 0,
};

function v(severity, code, path, msg) {
  violations.push({ severity, code, path, msg });
}

async function main() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  if (!existsSync(specsDir)) {
    console.error('FATAL: specs dir not found', specsDir);
    process.exit(1);
  }

  const specFiles = (await readdir(specsDir)).filter(f =>
    f.endsWith('-design.md')
  );

  const specsById = new Map();
  for (const f of specFiles) {
    const content = await readFile(join(specsDir, f), 'utf8');
    const meta = parseFrontmatter(content);
    if (!meta) {
      v('FATAL', 'F1', f, '缺少 YAML frontmatter 或解析失败');
      continue;
    }
    const missing = [];
    if (!meta.id) missing.push('id');
    if (!meta.status) missing.push('status');
    if (!meta.layer) missing.push('layer');
    if (!meta.scope) missing.push('scope');
    if (missing.length > 0) {
      v('FATAL', 'F1', f, `frontmatter 缺失字段: ${missing.join(', ')}`);
      continue;
    }
    if (!LAYER_ORDER.some(l => meta.layer.toString().startsWith(l))) {
      v('FATAL', 'F1', f, `非法 layer: ${meta.layer} (应为 L0/L1/L2/L3/L4)`);
    }
    if (!VALID_STATUSES.has(meta.status)) {
      v('FATAL', 'F1', f, `非法 status: ${meta.status}`);
    }

    // P2-1: phase 字段校验 (可选,但声明了必须合法)
    if (meta.phase !== undefined && !VALID_PHASES.has(meta.phase)) {
      v('FATAL', 'F1', f, `非法 phase: ${meta.phase} (应为 draft|experiment|implemented)`);
    }

    // P2-1: phase 默认值推断
    //   - deprecated → phase 不强制
    //   - status=sediment → phase 默认 implemented
    //   - status=focus → phase 默认 experiment
    //   - status=base → phase 默认 implemented
    //   - 其他 → phase 必填
    const effectivePhase = meta.phase || (() => {
      if (meta.status === 'deprecated' || meta.status === 'orphan') return null;
      if (meta.status === 'sediment' || meta.status === 'base') return 'implemented';
      if (meta.status === 'focus') return 'experiment';
      return null;
    })();

    if (effectivePhase === null && meta.status !== 'deprecated' && meta.status !== 'orphan') {
      v('WARN', 'W6', f, `phase 未声明且 status=${meta.status} 无法推断,建议显式声明 phase`);
    }

    specsById.set(meta.id, { file: f, meta, phase: effectivePhase });
    stats.totalSpecs++;
    stats.byStatus[meta.status] = (stats.byStatus[meta.status] || 0) + 1;
    if (effectivePhase) stats.byPhase[effectivePhase] = (stats.byPhase[effectivePhase] || 0) + 1;
    stats.byLayer[meta.layer] = (stats.byLayer[meta.layer] || 0) + 1;
    if (ACTIVE_STATUSES.has(meta.status)) stats.activeSpecs++;
    if (meta.status === 'deprecated') stats.deprecatedSpecs++;
    if (meta.status === 'orphan') stats.orphanSpecs++;
    if (Array.isArray(meta.overrides) && meta.overrides.length > 0) stats.withOverrides++;
    if (Array.isArray(meta['conflicts-with']) && meta['conflicts-with'].length > 0) stats.withConflicts++;
    if (Array.isArray(meta['proposes']) && meta['proposes'].length > 0) stats.withProposes++;
    if (Array.isArray(meta['non-negotiable']) && meta['non-negotiable'].length > 0) stats.withNonNegotiable++;
  }

  // ============================================================
  // P2-1 规则 F6: draft phase 的 spec 不可被 inherits-from
  // ============================================================
  for (const [id, { file, meta, phase }] of specsById) {
    const inheritsFrom = meta['inherits-from'] || [];
    for (const parent of inheritsFrom) {
      if (!specsById.has(parent)) {
        v('FATAL', 'F2', file, `inherits-from 引用不存在的 spec: ${parent}`);
        continue;
      }
      // P2-1: draft 不可被继承
      const parentSpec = specsById.get(parent);
      if (parentSpec.phase === 'draft') {
        v('FATAL', 'F6', file, `inherits-from 引用了 draft 阶段的 spec (${parent}) — draft 未批准前不可被依赖`);
      }
    }

    // ============================================================
    // P2-1 规则 F7: experiment phase 的 spec 不应使用 conflicts-with
    //              应该用 proposes: 表达实验性提议
    // ============================================================
    if (phase === 'experiment' && Array.isArray(meta['conflicts-with']) && meta['conflicts-with'].length > 0) {
      v('FATAL', 'F7', file, `experiment 阶段的 spec 不应使用 conflicts-with (语义冲突只允许在 sediment/base 之间),应改用 proposes: 字段`);
    }

    // P2-1 规则 F7b: sediment/base 之间如需声明冲突, 应该升级为 overrides
    if ((meta.status === 'sediment' || meta.status === 'base') && Array.isArray(meta['conflicts-with']) && meta['conflicts-with'].length > 0) {
      v('INFO', 'I2', file, `sediment/base 的 conflicts-with 应优先通过 overrides 显式裁决, 仅保留作为冲突文档`);
    }

    const overrides = meta.overrides || [];
    for (const ov of overrides) {
      const targetId = typeof ov === 'string' ? ov : ov.id;
      if (!specsById.has(targetId)) {
        v('FATAL', 'F4', file, `overrides 引用不存在的 spec: ${targetId}`);
        continue;
      }
      const target = specsById.get(targetId);
      // P2-1: overrides 目标如果是 draft 状态 → FATAL
      if (target.phase === 'draft') {
        v('FATAL', 'F6', file, `overrides 引用了 draft 阶段的 spec (${targetId}) — draft 未批准前不可被覆盖`);
      }
      if (target.meta.status === 'base' && (typeof ov === 'object' && !ov.reason)) {
        v('FATAL', 'F4', file, `覆盖底座 spec (${targetId}) 必须提供 reason`);
      }
      if (target.meta.status === 'deprecated' || target.meta.status === 'orphan') {
        v('WARN', 'W1', file, `覆盖已废弃/孤儿的 spec (${targetId}) — overrides 自动失效`);
      }
      const myRank = layerRank(meta.layer);
      const targetRank = layerRank(target.meta.layer);
      if (myRank > targetRank && ACTIVE_STATUSES.has(meta.status) && ACTIVE_STATUSES.has(target.meta.status)) {
        v('FATAL', 'F3', file, `跨层覆盖方向倒置：${meta.layer} (低优先级) 试图覆盖 ${target.meta.layer} (高优先级) — ${targetId}`);
      }
    }

    // P2-1 规则 F7c: proposes 目标不应是 deprecated/orphan
    const proposes = meta['proposes'] || [];
    for (const p of proposes) {
      const targetId = typeof p === 'string' ? p : p.id;
      if (!specsById.has(targetId)) {
        v('FATAL', 'F7', file, `proposes 引用不存在的 spec: ${targetId}`);
        continue;
      }
      const target = specsById.get(targetId);
      if (target.meta.status === 'deprecated' || target.meta.status === 'orphan') {
        v('WARN', 'W7', file, `proposes 目标 ${targetId} 已废弃/孤儿 — 提议自动失声`);
      }
    }

    // P2-1: references 软引用 (非强制), 不触发任何 FATAL
    // 仅记录 draft/experiment 阶段被 references 提示风险
    const references = meta.references || [];
    for (const ref of references) {
      if (!specsById.has(ref)) {
        v('WARN', 'W8', file, `references 引用不存在的 spec: ${ref}`);
      }
    }

    const supersedes = meta.supersedes || [];
    for (const sub of supersedes) {
      if (!specsById.has(sub)) {
        v('FATAL', 'F1', file, `supersedes 引用不存在的 spec: ${sub}`);
      }
    }

    const supersededBy = meta.superseded_by;
    if (supersededBy && meta.status !== 'deprecated') {
      v('WARN', 'W2', file, `声明了 superseded-by 但 status 不是 deprecated（当前 ${meta.status}）`);
    }

    const scope = meta.scope || {};
    if (scope.global === true && Array.isArray(scope.modules) && scope.modules.length > 0) {
      v('WARN', 'W4', file, `scope.global=true 与 scope.modules 同时声明（建议二选一）`);
    }
    if (scope.global === undefined && (!scope.modules || scope.modules.length === 0)) {
      v('WARN', 'W2', file, `scope 未声明 global 或 modules（建议显式声明）`);
    }

    if (!meta.priority || meta.priority === 0) {
      if (meta.status !== 'deprecated') {
        v('WARN', 'W2', file, `priority 未声明或为 0（建议显式声明 0-100）`);
      }
    }

    // P2-1 规则 W5: experiment_window 过期但 phase 仍为 draft/experiment
    if (meta.experiment_window && (phase === 'draft' || phase === 'experiment')) {
      const m = meta.experiment_window.match(/(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})?/);
      if (m) {
        const endStr = m[2];
        if (endStr) {
          const end = new Date(endStr).getTime();
          const now = Date.now();
          if (now > end) {
            const daysOver = Math.floor((now - end) / (24 * 60 * 60 * 1000));
            v('WARN', 'W5', file, `experiment_window 已过期 ${daysOver} 天,但 phase 仍为 ${phase} — 应推进 phase 或转 deprecated`);
          }
        }
      }
    }
  }

  const layerGroups = {};
  for (const [id, { meta }] of specsById) {
    if (!ACTIVE_STATUSES.has(meta.status)) continue;
    const k = meta.layer;
    if (!layerGroups[k]) layerGroups[k] = [];
    layerGroups[k].push({ id, meta });
  }
  for (const [layer, list] of Object.entries(layerGroups)) {
    if (list.length > 5) {
      for (const { id } of list) {
        v('INFO', 'I1', `${id}.md`, `同层活跃 spec 数量 > 5（当前 ${list.length}），提示需要聚合或淘汰`);
      }
    }
  }

  const ninetyDays = 90 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, { file, meta }] of specsById) {
    if (!meta.updated) continue;
    const updated = new Date(meta.updated).getTime();
    if (now - updated > ninetyDays && ACTIVE_STATUSES.has(meta.status)) {
      v('WARN', 'W3', file, `updated 超过 90 天（${meta.updated}）`);
    }
  }

  // M3-2 (2026-07-07) W9: sediment + implemented spec 必须有 audit 报告 (cross-review 回路守卫)
  // 对应 CLAUDE.md WORKFLOW SUB-PROJECT 收尾阈值: ≥3 视角并行审查 + 报告存档
  // 豁免: frontmatter audit_exempt: true (基础设施 spec 可豁免)
  const auditDir = join(ROOT, 'docs', 'audit');
  let auditFiles = [];
  try {
    const { readdirSync } = await import('node:fs');
    auditFiles = readdirSync(auditDir).filter(f => f.endsWith('.md') && f !== 'CLAUDE.md');
  } catch { /* audit 目录不存在时无豁免 */ }

  for (const [id, { file, meta }] of specsById) {
    if (meta.status !== 'sediment') continue;
    if (meta.phase && meta.phase !== 'implemented') continue; // 仅 implemented 阶段需 audit
    if (meta.audit_exempt === true) continue;
    // 在 audit 文件名中找 spec id (含 id 子串即可)
    const hasAudit = auditFiles.some(f => f.includes(id) || f.includes(id.replace(/-/g, '_')));
    if (!hasAudit) {
      v('WARN', 'W9', file, `sediment + implemented spec 无 audit 报告 — cross-review 回路断裂 (CLAUDE.md WORKFLOW 强制 ≥3 视角审查 + docs/audit/ 存档; 或在 frontmatter 加 audit_exempt: true 豁免)`);
    }
  }

  console.log('🔮 Spec 拓扑规则检查报告');
  console.log('────────────────────────');
  console.log(`  总 spec 数:        ${stats.totalSpecs}`);
  console.log(`    活跃:            ${stats.activeSpecs}`);
  console.log(`    废弃:            ${stats.deprecatedSpecs}`);
  console.log(`    孤儿:            ${stats.orphanSpecs}`);
  console.log('');
  console.log('  按层分布:');
  for (const [layer, count] of Object.entries(stats.byLayer)) {
    console.log(`    ${layer}: ${count}`);
  }
  console.log('');
  console.log('  按状态(status / 设计凝固度):');
  for (const [s, count] of Object.entries(stats.byStatus)) {
    console.log(`    ${s}: ${count}`);
  }
  console.log('');
  console.log('  按阶段(phase / 实施进度):');
  for (const [p, count] of Object.entries(stats.byPhase)) {
    console.log(`    ${p}: ${count}`);
  }
  console.log('');
  console.log(`  含 overrides:     ${stats.withOverrides}`);
  console.log(`  含 conflicts:     ${stats.withConflicts}`);
  console.log(`  含 proposes:      ${stats.withProposes}`);
  console.log(`  含 non-negotiable:${stats.withNonNegotiable}`);
  console.log('');

  let exitCode = 0;
  if (violations.length === 0) {
    console.log('✓ Spec 拓扑规则检查通过');
  } else {
    const byCode = {};
    for (const v of violations) {
      const key = `${v.severity}-${v.code}`;
      if (!byCode[key]) byCode[key] = [];
      byCode[key].push(v);
    }
    console.log('⚠ 发现以下问题:');
    for (const [key, list] of Object.entries(byCode)) {
      const sample = list[0];
      const sym = sample.severity.startsWith('FATAL') ? '✗' : sample.severity.startsWith('WARN') ? '⚠' : 'ℹ';
      console.log(`  ${sym} ${key} × ${list.length}`);
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
  console.error('FATAL: check-spec-topology 运行失败', e);
  process.exit(1);
});