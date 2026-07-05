/**
 * [INPUT]: d3-force-3d, thoughts[], edges[]
 * [OUTPUT]: createSim3D(thoughts, edges) → { sim, idToNode }
 * [POS]: src/sim 下,被 src/main.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d';

let activeSim = null;

export function createSim3D(thoughts, edges) {
  if (activeSim) activeSim.stop();

  const nodes = thoughts.map((t) => ({
    id: t.id,
    x: t.x ?? (Math.random() - 0.5) * 400,
    y: t.y ?? (Math.random() - 0.5) * 300 + 100,
    z: t.z ?? (Math.random() - 0.5) * 200,
    vx: 0, vy: 0, vz: 0,
    mass: t.mass ?? 1,
    temperature: t.temperature ?? 1
  }));

  const idToNode = new Map();
  for (const n of nodes) idToNode.set(n.id, n);

  const links = [];
  for (const e of edges) {
    const s = idToNode.get(e.fromId);
    const t = idToNode.get(e.toId);
    if (s && t) links.push({ source: s, target: t, id: e.id });
  }

  const sim = forceSimulation(nodes, 3)
    .force('charge', forceManyBody().strength(-200).distanceMin(30).distanceMax(600))
    .force('link', forceLink(links).id((d) => d.id).distance(150).strength(0.5))
    .force('center', forceCenter(0, 80, 0))
    .force('collide', forceCollide(30))
    .alphaDecay(0.015)
    .stop();

  activeSim = sim;
  return { sim, nodes, idToNode };
}

export function restartSim(sim, alpha = 0.5) {
  sim.alpha(alpha).restart();
}

export function stopSim() {
  if (activeSim) { activeSim.stop(); activeSim = null; }
}
