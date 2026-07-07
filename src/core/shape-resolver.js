/**
 * [INPUT]: { n: 总数, k: 聚焦数, hullHits: 0|1, dwellMs: 停留毫秒 }
 * [OUTPUT]: shapeResolve({n,k,hullHits,dwellMs,weights?}) → { shape, score, transitions[], isEdge, isEmpty }
 * [POS]: src/core/shape-resolver.js — 形状自适应视图的核心判定;纯函数无副作用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计哲学(T10 一致性修正):
 *  - 形状代表"用户看得多细",不是"全貌有多圆"
 *  - score = 个体性 individuality ∈ [0,1]
 *  - score 高 → 个体性强 → 方 · 看个体
 *  - score 低 → 个体性弱 → 圆 · 看全貌
 *  - 与 5 天前 spec 保持一致:
 *      看全貌=圆,看个体=方,看一半=方+圆
 *
 * 4 档(从圆到方):
 *  - continuous        (score ≤ 0.25)  圆 · 全貌
 *  - metric_with_anchors (0.25~0.5)   圆方 · 看大部分
 *  - discrete_with_metric (0.5~0.75)  方+ · 看一半
 *  - discrete          (≥ 0.75)        方 · 看个体
 *
 * 4 个一致性 bug 修复:
 *  - Bug 1 n=0 → 返回 isEmpty=true;shape='empty';score=0 (不再误判 continuous·全貌)
 *  - Bug 2 selection 反转: k=0 → 看全貌(圆);k=n → 看个体(方)
 *  - Bug 3 阈值在 score=0.5 时是 metric_with_anchors 与旧离散_with_metric 都保留
 *  - Bug 4 dwell=0 时低 individuality,自然落入圆档,不会被误推为方
 */

export const SHAPES = Object.freeze({
  EMPTY: 'empty',
  CONTINUOUS: 'continuous',
  METRIC_WITH_ANCHORS: 'metric_with_anchors',
  DISCRETE_WITH_METRIC: 'discrete_with_metric',
  DISCRETE: 'discrete'
});

export const SHAPE_ORDER = [
  SHAPES.CONTINUOUS,
  SHAPES.METRIC_WITH_ANCHORS,
  SHAPES.DISCRETE_WITH_METRIC,
  SHAPES.DISCRETE
];

const DEFAULT_WEIGHTS = Object.freeze({ ratio: 0.6, hull: 0.25, dwell: 0.15 });

const WEIGHT_PROFILES = Object.freeze({
  balanced:      Object.freeze({ ratio: 0.6, hull: 0.25, dwell: 0.15 }),
  'ratio-first': Object.freeze({ ratio: 0.7, hull: 0.2, dwell: 0.1 }),
  'hull-first':  Object.freeze({ ratio: 0.3, hull: 0.55, dwell: 0.15 }),
  'dwell-first': Object.freeze({ ratio: 0.3, hull: 0.2, dwell: 0.5 }),
});

const THRESHOLDS = Object.freeze([
  { max: 0.25, shape: SHAPES.CONTINUOUS },
  { max: 0.5,  shape: SHAPES.METRIC_WITH_ANCHORS },
  { max: 0.75, shape: SHAPES.DISCRETE_WITH_METRIC },
  { max: Infinity, shape: SHAPES.DISCRETE }
]);

const DWELL_FULL_MS = 30_000;
const DWELL_HALF_MS = 10_000;

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function buildSelectedRatio(n, k) {
  if (n <= 0) return 0;
  return clamp01(k / n);
}

function buildDwellRatio(dwellMs) {
  if (!Number.isFinite(dwellMs) || dwellMs <= 0) return 0;
  if (dwellMs >= DWELL_FULL_MS) return 1;
  if (dwellMs >= DWELL_HALF_MS) return 0.5 + ((dwellMs - DWELL_HALF_MS) / (DWELL_FULL_MS - DWELL_HALF_MS)) * 0.5;
  return (dwellMs / DWELL_HALF_MS) * 0.5;
}

function buildHullHits(hullHits) {
  if (hullHits === 1 || hullHits === true) return 1;
  if (hullHits === 0 || hullHits === false) return 0;
  return 0;
}

function pickShape(score) {
  for (const t of THRESHOLDS) {
    if (score <= t.max) return t.shape;
  }
  return SHAPES.DISCRETE;
}

let _flagResolver = null;

export function setShapeFlagResolver(resolver) {
  _flagResolver = typeof resolver === 'function' ? resolver : null;
}

function resolveWeights(weights) {
  if (weights) return { ...DEFAULT_WEIGHTS, ...weights };
  let profileName = 'balanced';
  if (_flagResolver) {
    try {
      const v = _flagResolver('shape-resolver-weights-v2', { bucket: 0 });
      if (v && typeof v === 'string' && WEIGHT_PROFILES[v]) profileName = v;
    } catch {}
  }
  return WEIGHT_PROFILES[profileName] || DEFAULT_WEIGHTS;
}

export function shapeResolve({ n, k, hullHits, dwellMs, weights, mode } = {}) {
  const safeN = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  const safeK = Number.isFinite(k) && k > 0 ? Math.floor(k) : 0;
  const isEmpty = safeN === 0;

  if (isEmpty) {
    return {
      shape: SHAPES.EMPTY,
      score: 0,
      isEmpty: true,
      isEdge: false,
      transitions: [],
      factors: { ratio: 0, hull: 0, dwell: 0, weighted: { ratio: 0, hull: 0, dwell: 0 } },
      mode: mode || null
    };
  }

  const ratioPart = buildSelectedRatio(safeN, safeK);
  const hullPart = buildHullHits(hullHits);
  const dwellPart = buildDwellRatio(dwellMs);

  const w = resolveWeights(weights);
  const ws = w.ratio + w.hull + w.dwell;
  const normR = ws > 0 ? w.ratio / ws : 0;
  const normH = ws > 0 ? w.hull / ws : 0;
  const normD = ws > 0 ? w.dwell / ws : 0;

  let score = normR * ratioPart + normH * hullPart + normD * dwellPart;
  score = clamp01(score);

  const shape = pickShape(score);

  const idx = SHAPE_ORDER.indexOf(shape);
  const transitions = SHAPE_ORDER.filter((_, i) => i !== idx);

  const isEdge = score > 0.22 && score < 0.28
    || score > 0.47 && score < 0.53
    || score > 0.72 && score < 0.78;

  return {
    shape,
    score,
    isEmpty: false,
    isEdge,
    transitions,
    factors: { ratio: ratioPart, hull: hullPart, dwell: dwellPart, weighted: { ratio: normR, hull: normH, dwell: normD } },
    mode: mode || null
  };
}

export function shapeBlend(left, right, t = 0.5) {
  if (!left || !right) return left || right;
  const li = SHAPE_ORDER.indexOf(left.shape);
  const ri = SHAPE_ORDER.indexOf(right.shape);
  if (li < 0 || ri < 0) return left;
  return {
    leftShape: left.shape,
    rightShape: right.shape,
    leftScore: left.score,
    rightScore: right.score,
    ratio: clamp01(t),
    crossStates: Math.abs(li - ri) > 1,
    dominantShape: ri > li ? right.shape : left.shape
  };
}