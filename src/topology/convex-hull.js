/**
 * [INPUT]: convex-hull npm包,念头坐标数组
 * [OUTPUT]: computeHull(points) → { vertices, faces } (Three.js 可用格式)
 * [POS]: src/topology 下,被 src/render/hull-mesh 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import convexHull from 'convex-hull';

export function computeHull(thoughts) {
  if (thoughts.length < 4) {
    return { vertices: [], faces: [], valid: false };
  }

  const points = thoughts.map((t) => [t.x, t.y, t.z]);
  const hull = convexHull(points);

  if (!hull || hull.length === 0) {
    return { vertices: points, faces: [], valid: false };
  }

  // convex-hull 返回的是顶点索引的三元组(每个面三个顶点)
  const faces = hull;

  return {
    vertices: points,
    faces,
    valid: true
  };
}
