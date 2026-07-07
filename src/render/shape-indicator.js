/**
 * [INPUT]: snapshot({ wholesomeness 0..1, selectionRatio 0..1, isEmpty bool })
 * [OUTPUT]: describeShape(snapshot) → { label, fillPct, color, shape }
 * [POS]: src/render/shape-indicator.js — 形状指示器纯文本/视觉描述;observe-views 调用此模块决定 UI
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 5 个状态(从空到方):
 *  - empty           → "空 · 等待第一个念头"
 *  - continuous      → "圆 · 全貌"     (individuality ≤ 0.25)
 *  - metric_with_anchors → "圆方 · 大部分"  (0.25~0.5)
 *  - discrete_with_metric → "方圆 · 看一半"  (0.5~0.75)
 *  - discrete        → "方 · 看个体"   (≥ 0.75)
 *
 * 语义统一(T10):
 *  - individuality 高 → 方(看个体)
 *  - individuality 低 → 圆(看全貌)
 *  - empty 单独档,与其他档互斥
 *  - selectionRatio 现在是"你聚焦了多少",越高越靠近方
 */

const SHAPE_PRESETS = Object.freeze([
  {
    shape: 'empty',
    label: () => '空 · 等待第一个念头',
    color: '#5a6080',
    defaultFillPct: 0
  },
  {
    shape: 'continuous',
    label: (sel) => sel > 0
      ? `圆 · 选 ${Math.round(sel * 100)}%`
      : `圆 · 全貌`,
    color: '#7fb6e8',
    defaultFillPct: 10
  },
  {
    shape: 'metric_with_anchors',
    label: (sel) => `圆方 · 选 ${Math.round(sel * 100)}%`,
    color: '#9bc0e8',
    defaultFillPct: 35
  },
  {
    shape: 'discrete_with_metric',
    label: (sel) => `方圆 · 选 ${Math.round(sel * 100)}%`,
    color: '#e8c265',
    defaultFillPct: 60
  },
  {
    shape: 'discrete',
    label: (sel) => `方 · 选 ${Math.round(sel * 100)}%`,
    color: '#e8a865',
    defaultFillPct: 85
  }
]);

const SHAPE_TO_IDX = new Map(SHAPE_PRESETS.map((p, i) => [p.shape, i]));

export function describeShape(snapshot = {}) {
  const wholesomeness = clamp01(snapshot.wholesomeness ?? 0);
  const selectionRatio = clamp01(snapshot.selectionRatio ?? 0);
  const isEmpty = snapshot.isEmpty === true || snapshot.shape === 'empty';

  if (isEmpty) {
    const preset = SHAPE_PRESETS[0];
    return {
      shape: preset.shape,
      label: preset.label(selectionRatio),
      fillPct: preset.defaultFillPct,
      color: preset.color,
      wholesomeness,
      selectionRatio,
      isEmpty: true
    };
  }

  const shapeName = snapshot.shape || snapshot.derivedShape;
  if (typeof shapeName === 'string' && SHAPE_TO_IDX.has(shapeName)) {
    const preset = SHAPE_PRESETS[SHAPE_TO_IDX.get(shapeName)];
    return {
      shape: preset.shape,
      label: preset.label(selectionRatio),
      fillPct: Math.round(wholesomeness * 100),
      color: preset.color,
      wholesomeness,
      selectionRatio,
      isEmpty: false
    };
  }

  const idx = Math.min(Math.floor(wholesomeness * 4), SHAPE_PRESETS.length - 2);
  const preset = SHAPE_PRESETS[idx + 1];
  return {
    shape: preset.shape,
    label: preset.label(selectionRatio),
    fillPct: Math.round(wholesomeness * 100),
    color: preset.color,
    wholesomeness,
    selectionRatio,
    isEmpty: false
  };
}

export function applyShapeToBar(barFill, description) {
  if (!barFill || !description) return;
  barFill.style.width = description.fillPct + '%';
  if (description.color) barFill.style.background = description.color;
}

export function applyShapeToLabel(labelEl, description) {
  if (!labelEl || !description) return;
  labelEl.textContent = description.label;
}

function clamp01(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}