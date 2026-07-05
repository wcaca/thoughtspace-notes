/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: 内聚度评分函数(cohesion_score),按 Part 8 §1.2 公式
 * [POS]: src/core 下,被 render/crystallize-fx 和 geometry-cluster 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const COHESION_THRESHOLD = 0.7;

export function cohesionScore(thoughtIds, edges) {
  if (thoughtIds.length < 2) return 0;

  const nodeSet = new Set(thoughtIds);
  const relevantEdges = edges.filter((e) => nodeSet.has(e.fromId) && nodeSet.has(e.toId));
  const n = thoughtIds.length;
  const e = relevantEdges.length;

  if (e === 0) return 0;

  const edgeDensity = Math.min(1, e / (n * 1.5));
  const maxDegree = n - 1;
  const degrees = new Map();
  for (const edge of relevantEdges) {
    degrees.set(edge.fromId, (degrees.get(edge.fromId) || 0) + 1);
    degrees.set(edge.toId, (degrees.get(edge.toId) || 0) + 1);
  }
  const degValues = Array.from(degrees.values());
  const mean = degValues.reduce((a, b) => a + b, 0) / degValues.length;
  let variance = 0;
  for (const d of degValues) variance += (d - mean) ** 2;
  variance /= degValues.length;
  const normalizedVariance = maxDegree > 0 ? 1 - Math.min(1, Math.sqrt(variance) / maxDegree) : 0;

  return 0.4 * edgeDensity + 0.3 * normalizedVariance;
}

export function isCrystallized(thoughtIds, edges, userConfirmed) {
  const base = cohesionScore(thoughtIds, edges);
  const score = userConfirmed ? 0.4 * base + 0.3 * 1 + 0.3 * 1 : base;
  return score >= COHESION_THRESHOLD;
}
