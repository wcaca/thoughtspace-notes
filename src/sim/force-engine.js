/**
 * [INPUT]: d3-force, src/core 的 Thought/Edge 输入
 * [OUTPUT]: d3-force 仿真引擎 — compute(thoughts,edges) → {sim, idToNode}
 * [POS]: src/sim 下,被 render/thought-node 拖拽 和 persistence 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force';

let activeSimulation = null;

export function createSimulation(thoughts, edges) {
  if (activeSimulation) activeSimulation.stop();

  const nodes = thoughts.map((t) => ({
    id: t.id,
    x: t.x ?? (Math.random() - 0.5) * 600,
    y: t.y ?? (Math.random() - 0.5) * 400,
    vx: 0,
    vy: 0
  }));

  const idToNode = new Map();
  for (const n of nodes) idToNode.set(n.id, n);

  const links = [];
  for (const e of edges) {
    const s = idToNode.get(e.fromId);
    const t = idToNode.get(e.toId);
    if (s && t) links.push({ source: s, target: t, id: e.id });
  }

  const sim = forceSimulation(nodes)
    .force('charge', forceManyBody().strength(-180))
    .force('link', forceLink(links).id((d) => d.id).distance(120).strength(0.4))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(34))
    .alphaDecay(0.02);

  activeSimulation = sim;
  return { sim, nodes, idToNode };
}

export function restartSimulation(sim, alpha) {
  sim.alpha(alpha || 0.6).restart();
}

export function stopSimulation() {
  if (activeSimulation) {
    activeSimulation.stop();
    activeSimulation = null;
  }
}

export function pinNode(idToNode, id, x, y) {
  const node = idToNode.get(id);
  if (!node) return false;
  node.fx = x;
  node.fy = y;
  return true;
}

export function unpinNode(idToNode, id) {
  const node = idToNode.get(id);
  if (!node) return false;
  node.fx = null;
  node.fy = null;
  return true;
}
