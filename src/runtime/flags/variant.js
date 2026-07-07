/**
 * [INPUT]: registry.js (cohort.weights, rollout) + ctx (bucket ∈ [0, 99])
 * [OUTPUT]: 根据 rollout% 与 cohort 权重,决定当前 ctx 应得 variant
 * [POS]: src/runtime/flags/variant.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

export function resolveVariant(def, raw, ctx) {
  const rollout = typeof def.rollout === 'number' ? def.rollout : 100;

  if (!ctx || typeof ctx.bucket !== 'number') {
    if (rollout >= 100) return raw;
    return def.default;
  }

  if (ctx.bucket >= rollout) {
    return def.default;
  }

  if (!def.cohort || !Array.isArray(def.cohort.weights) || def.cohort.weights.length === 0) {
    return raw;
  }

  const hash = stableHash(typeof raw === 'string' ? raw : JSON.stringify(raw));
  const inCohortBucket = hash % 100;
  const totalWeight = def.cohort.weights.reduce((s, w) => s + (w.weight || 0), 0);
  if (totalWeight <= 0) return raw;

  let acc = 0;
  for (const w of def.cohort.weights) {
    acc += ((w.weight || 0) / totalWeight) * 100;
    if (inCohortBucket < acc) {
      return w.variant;
    }
  }
  return def.cohort.weights[def.cohort.weights.length - 1].variant;
}

function stableHash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0x7fffffff;
  }
  return h;
}