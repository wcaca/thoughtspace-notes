/**
 * [INPUT]: src/core/thought(Thought[]), src/core/edge(Edge[])
 * [OUTPUT]: calcCohesion(thoughtIds, edges) → 0..1; suggestForm(thoughts, edges) → formId
 * [POS]: src/core 下 — 结晶机制纯逻辑:结构强度计算 + 结晶形态建议
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

/**
 * 计算一组念头的结构强度(内聚度)。
 *   cohesion = (实际边数) / (完全连通图边数) 的加权
 * 同时考虑边的数量和念头数量的平衡,避免 2 个念头 1 条边就 100%。
 */
export function calcCohesion(thoughtIds, edges) {
  const idSet = new Set(thoughtIds);
  const n = idSet.size;
  if (n < 2) return 0;
  // 完全连通的最大边数 = n*(n-1) (有向边)
  const maxEdges = n * (n - 1);
  let actualEdges = 0;
  for (const e of edges) {
    if (idSet.has(e.fromId) && idSet.has(e.toId)) actualEdges++;
  }
  // 基础密度
  const density = actualEdges / maxEdges;
  // 规模惩罚:念头越多越难达到高内聚,用 log 平滑
  const scaleFactor = 1 - 1 / Math.log2(n + 1);
  return Math.min(1, density * scaleFactor * 2);
}

/**
 * 根据念头数量与边的"主导关系类型"建议结晶形态。
 * 返回形态 ID,调用方用它选几何体(tetra/octa/cube/dodeca/icosa/plane)。
 */
export function suggestForm(thoughtIds, edges) {
  const n = thoughtIds.length;
  if (n < 3) return 'dyad';
  // 统计主导关系类型
  const idSet = new Set(thoughtIds);
  const typeCount = {};
  let total = 0;
  for (const e of edges) {
    if (!idSet.has(e.fromId) || !idSet.has(e.toId)) continue;
    const t = e.relationType || 'parallel';
    typeCount[t] = (typeCount[t] || 0) + 1;
    total++;
  }
  const dominant = total > 0
    ? Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0][0]
    : 'parallel';

  // 按数量 + 主导关系选形态
  if (n <= 4) return dominant === 'sequence' ? 'tetra' : 'tetra';
  if (n <= 6) return dominant === 'cause' ? 'octa' : 'octa';
  if (n <= 8) return dominant === 'subordinate' ? 'cube' : 'cube';
  if (n <= 12) return dominant === 'conflict' ? 'dodeca' : 'dodeca';
  return 'icosa';
}

/**
 * 形态名称映射(给 UI 展示用)。
 */
export const FORM_NAMES = {
  dyad: '二元星',
  tetra: '四面体',
  octa: '八面体',
  cube: '立方体',
  dodeca: '十二面体',
  icosa: '二十面体'
};

/**
 * 判定是否达到可结晶阈值。
 * - 默认阈值 0.45
 * - 至少 2 个念头
 * - 至少 1 条边
 */
export function canCrystallize(thoughtIds, edges, threshold = 0.45) {
  if (thoughtIds.length < 2) return false;
  const cohesion = calcCohesion(thoughtIds, edges);
  // 至少有一条内部边
  const idSet = new Set(thoughtIds);
  const hasEdge = edges.some(e => idSet.has(e.fromId) && idSet.has(e.toId));
  return hasEdge && cohesion >= threshold;
}
