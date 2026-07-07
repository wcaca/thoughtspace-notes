/**
 * [INPUT]: d3-force-3d, thoughts[], edges[], options?
 * [OUTPUT]: createSim3D(thoughts, edges, options) → { sim, nodes, idToNode }
 *          + pinSimNode/unpinSimNode/setSimLayout/reheatSim/keepSimAlive
 * [POS]: src/sim 下,被 src/main.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * P0-2/P0-3 (2026-07-07): 补全 spec §2.1 要求的 5 个导出函数 + 温度→Y 拉拽
 *   原先仅 createSim3D/restartSim/stopSim,5 函数缺失,温度拉拽未实现
 *   违反 non-negotiable "温度→Y 拉拽的语义必须保留(核心心智模型)"
 */
import { forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide } from 'd3-force-3d';

let activeSim = null;
let _config = null;

// 默认配置 (spec §2.1 options 表)
const DEFAULT_OPTIONS = Object.freeze({
  linkDistance: 150,
  repulse: -200,
  center: [0, 80, 0],
  collide: 30,
  alphaDecay: 0.015,
  temperatureYBounds: [180, -180],
  temperaturePull: 0.012,
  initialLayout: 'circle'
});

export function createSim3D(thoughts, edges, options = {}) {
  if (activeSim) activeSim.stop();

  const opts = { ...DEFAULT_OPTIONS, ...options };
  _config = opts;

  const nodes = thoughts.map((t) => ({
    id: t.id,
    x: t.x ?? (Math.random() - 0.5) * 400,
    y: t.y ?? (Math.random() - 0.5) * 300 + 100,
    z: t.z ?? (Math.random() - 0.5) * 200,
    vx: 0, vy: 0, vz: 0,
    mass: t.mass ?? 1,
    temperature: t.temperature ?? 1,
    infoLevel: t.infoLevel ?? 0,
    // P0-3: 温度→Y 拉拽目标 (spec §2.1 行为约束 2)
    _targetY: null
  }));

  const idToNode = new Map();
  for (const n of nodes) idToNode.set(n.id, n);

  const links = [];
  for (const e of edges) {
    const s = idToNode.get(e.fromId);
    const t = idToNode.get(e.toId);
    if (s && t) links.push({ source: s, target: t, id: e.id });
  }

  // P0-3: 温度→Y 拉拽 — 每 tick 计算目标 Y 并施加力 (spec §2.1 行为约束 2)
  // targetY = bottom + (top - bottom) * clamp(temperature, 0, 1)
  // spec TSIM-002 decision
  const [yTop, yBottom] = opts.temperatureYBounds;
  const pullCoef = opts.temperaturePull;

  const sim = forceSimulation(nodes, 3)
    .force('charge', forceManyBody().strength(opts.repulse).distanceMin(30).distanceMax(600))
    .force('link', forceLink(links).id((d) => d.id).distance(opts.linkDistance).strength(0.5))
    .force('center', forceCenter(opts.center[0], opts.center[1], opts.center[2]))
    .force('collide', forceCollide(opts.collide))
    .alphaDecay(opts.alphaDecay);

  // P0-3: 温度→Y 拉拽 (spec non-negotiable + TSIM-002 decision)
  // P1-5 (TAS audit 2.2): 沉积漂移 sink force — spec §4.4 "温度<0.3 的念头向 Y 轴负方向缓慢漂移(2px/帧)"
  sim.on('tick', () => {
    for (const n of nodes) {
      const tempClamped = Math.max(0, Math.min(1, n.temperature ?? 0));
      const targetY = yBottom + (yTop - yBottom) * tempClamped;
      // 施加拉拽力: 朝目标 Y 移动
      n.vy += (targetY - n.y) * pullCoef;
      // P1-5: 低温念头(< 0.3)额外下沉力 (2px/帧 ≈ 0.2 vy @ 60fps)
      if (tempClamped < 0.3) {
        n.vy -= 0.2;
      }
    }
  });

  // 初始布局 (spec §2.1 options initialLayout)
  _applyInitialLayout(nodes, opts.initialLayout);

  activeSim = sim;
  return { sim, nodes, idToNode };
}

// P0-2: pinSimNode — 钉住节点 (spec §2.1 API)
export function pinSimNode(sim, id, x, y, z) {
  if (!sim || !_config) return false;
  const node = sim.nodes().find((n) => n.id === id);
  if (!node) return false;
  node.fx = x;
  node.fy = y;
  if (z !== undefined) node.fz = z;
  return true;
}

// P0-2: unpinSimNode — 解除钉住 (spec §2.1 API)
export function unpinSimNode(sim, id) {
  if (!sim) return false;
  const node = sim.nodes().find((n) => n.id === id);
  if (!node) return false;
  node.fx = null;
  node.fy = null;
  node.fz = null;
  return true;
}

// P0-2: setSimLayout — 切换布局模式 (spec §2.1 行为约束 4)
// spec: 不允许旧→同值;切换时给每个节点轻推 + reheat(0.6)
export function setSimLayout(sim, mode) {
  if (!sim || !_config) return false;
  if (_config.initialLayout === mode) return false; // spec: 不允许旧→同值
  const nodes = sim.nodes();
  _applyInitialLayout(nodes, mode);
  _config = { ..._config, initialLayout: mode };
  // spec: 切换时给每个节点轻推 + reheat(0.6)
  for (const n of nodes) {
    n.vx += (Math.random() - 0.5) * 10;
    n.vy += (Math.random() - 0.5) * 10;
    n.vz += (Math.random() - 0.5) * 10;
  }
  reheatSim(sim, 0.6);
  return true;
}

// P0-2: reheatSim — α 重置 (spec §0 术语表)
export function reheatSim(sim, alpha = 0.6) {
  if (!sim) return;
  sim.alpha(alpha).restart();
}

// P0-2: keepSimAlive — α 不跌破 minAlpha (spec §0 术语表)
// spec: allow 温度等慢变量持续生效
export function keepSimAlive(sim, min = 0.15) {
  if (!sim) return;
  if (sim.alpha() < min) {
    sim.alpha(min).restart();
  }
}

export function restartSim(sim, alpha = 0.5) {
  sim.alpha(alpha).restart();
}

export function stopSim() {
  if (activeSim) { activeSim.stop(); activeSim = null; }
  _config = null;
}

// 内部: 应用初始布局 (spec §2.1 options initialLayout: 'circle' | 'grid')
function _applyInitialLayout(nodes, mode) {
  if (!nodes || nodes.length === 0) return;
  if (mode === 'circle') {
    const radius = Math.max(100, nodes.length * 15);
    nodes.forEach((n, i) => {
      const angle = (i / nodes.length) * Math.PI * 2;
      n.x = Math.cos(angle) * radius;
      n.z = Math.sin(angle) * radius;
    });
  } else if (mode === 'grid') {
    const side = Math.ceil(Math.sqrt(nodes.length));
    const spacing = 100;
    nodes.forEach((n, i) => {
      const row = Math.floor(i / side);
      const col = i % side;
      n.x = (col - side / 2) * spacing;
      n.z = (row - side / 2) * spacing;
    });
  }
}
