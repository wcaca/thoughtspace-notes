/**
 * [INPUT]: core/thought.js, core/structure.js 导出的類型
 * [OUTPUT]: G2 星团布局引擎 — computeLayout / inferCoords / evaluateCrystallization
 * [POS]: src/core 下,IGeometryEngine 接口的 Cluster 实现,被 sim/force-engine 和 render/crystallize-fx 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { cohesionScore } from './structure.js';

export const GeometryType = Object.freeze({
  CLUSTER: 'cluster'
});

export const clusterEngine = {
  type: 'cluster',
  requiresManualSetup: false,

  computeLayout(thoughts, edges, existingCoords) {
    const ids = thoughts.map((t) => t.id);
    if (ids.length === 0) return {};

    const centroid = computeCentroid(existingCoords);
    const radius = 60 + ids.length * 8;
    const coords = {};
    ids.forEach((id, i) => {
      const angle = (2 * Math.PI * i) / ids.length;
      coords[id] = {
        x: centroid.x + radius * Math.cos(angle),
        y: centroid.y + radius * Math.sin(angle)
      };
    });
    return coords;
  },

  inferInitialCoordinates(thoughts, edges) {
    return this.computeLayout(thoughts, edges, {});
  },

  evaluateCrystallization(structure) {
    const { thoughtIds, edges, userConfirmed } = structure;
    return cohesionScore(thoughtIds, edges);
  },

  getCrystallizedFormAsset() {
    return null;
  }
};

function computeCentroid(existingCoords, fallback) {
  const vals = Object.values(existingCoords);
  if (vals.length === 0) {
    return fallback || { x: 0, y: 0 };
  }
  return {
    x: vals.reduce((a, c) => a + c.x, 0) / vals.length,
    y: vals.reduce((a, c) => a + c.y, 0) / vals.length
  };
}
