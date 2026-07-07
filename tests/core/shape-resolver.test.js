/**
 * [INPUT]: src/core/shape-resolver.js
 * [OUTPUT]: 验证 4 态阈值 / 复合判定 / 边界 case / blend 平滑 (T10 语义反转版)
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import {
  shapeResolve,
  shapeBlend,
  SHAPES,
  SHAPE_ORDER
} from '../../src/core/shape-resolver.js';

describe('shape-resolver (T10 语义反转: individuality 高→方)', () => {
  describe('SHAPES constant', () => {
    it('exposes 5 stable shape names including empty', () => {
      expect(SHAPES.EMPTY).toBe('empty');
      expect(SHAPES.CONTINUOUS).toBe('continuous');
      expect(SHAPES.METRIC_WITH_ANCHORS).toBe('metric_with_anchors');
      expect(SHAPES.DISCRETE_WITH_METRIC).toBe('discrete_with_metric');
      expect(SHAPES.DISCRETE).toBe('discrete');
    });
    it('SHAPE_ORDER is ordered from 圆 to 方 (continuous → discrete)', () => {
      expect(SHAPE_ORDER).toEqual([
        'continuous',
        'metric_with_anchors',
        'discrete_with_metric',
        'discrete'
      ]);
    });
  });

  describe('Bug 1: n=0 → empty (不再误判 continuous)', () => {
    it('n=0 时返回 empty 而不是 continuous', () => {
      const out = shapeResolve({ n: 0, k: 0, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.EMPTY);
      expect(out.isEmpty).toBe(true);
    });
    it('n=-1 也归 empty(防御)', () => {
      const out = shapeResolve({ n: -1, k: 5, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.EMPTY);
      expect(out.isEmpty).toBe(true);
    });
  });

  describe('Bug 2: selection 反转(选得少→圆,选得多→方)', () => {
    it('n=20, k=0 → 看全貌 (continuous, 低 individuality)', () => {
      const out = shapeResolve({ n: 20, k: 0, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.CONTINUOUS);
      expect(out.score).toBeLessThan(0.25);
    });
    it('n=20, k=1 → 仍偏圆 (low ratio)', () => {
      const out = shapeResolve({ n: 20, k: 1, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.CONTINUOUS);
    });
    it('n=20, k=10 (50%) → metric_with_anchors (中间态)', () => {
      const out = shapeResolve({ n: 20, k: 10, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.METRIC_WITH_ANCHORS);
    });
    it('n=20, k=20 (全选) → discrete_with_metric', () => {
      const out = shapeResolve({ n: 20, k: 20, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.DISCRETE_WITH_METRIC);
    });
    it('n=20, k=20 + hull=1 → discrete (最高方)', () => {
      const out = shapeResolve({ n: 20, k: 20, hullHits: 1, dwellMs: 60_000 });
      expect(out.shape).toBe(SHAPES.DISCRETE);
    });
  });

  describe('Bug 4: dwell=0 自然落入圆档(中性偏圆)', () => {
    it('n=10, k=0, dwell=0 → continuous', () => {
      const out = shapeResolve({ n: 10, k: 0, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.CONTINUOUS);
    });
    it('n=10, k=10, dwell=0 → discrete_with_metric (单 ratio 不足以触达 discrete)', () => {
      const out = shapeResolve({ n: 10, k: 10, hullHits: 0, dwellMs: 0 });
      expect(out.shape).toBe(SHAPES.DISCRETE_WITH_METRIC);
    });
  });

  describe('复合判定', () => {
    it('dwell 时间长把 individuality 拉高(向方推)', () => {
      const short = shapeResolve({ n: 100, k: 30, hullHits: 0, dwellMs: 1_000 });
      const long = shapeResolve({ n: 100, k: 30, hullHits: 0, dwellMs: 60_000 });
      expect(long.score).toBeGreaterThan(short.score);
    });
    it('hull=1 比 hull=0 individuality 更高', () => {
      const noHull = shapeResolve({ n: 100, k: 50, hullHits: 0, dwellMs: 0 });
      const withHull = shapeResolve({ n: 100, k: 50, hullHits: 1, dwellMs: 0 });
      expect(withHull.score).toBeGreaterThan(noHull.score);
    });
    it('factors 返回每个分量的原始值与权重', () => {
      const out = shapeResolve({ n: 20, k: 10, hullHits: 0, dwellMs: 15_000 });
      expect(out.factors.ratio).toBeCloseTo(0.5, 2);
      expect(out.factors.hull).toBe(0);
      expect(out.factors.dwell).toBeGreaterThan(0.5);
    });
    it('权重可定制', () => {
      const a = shapeResolve({ n: 20, k: 10, hullHits: 0, dwellMs: 0, weights: { ratio: 1, hull: 0, dwell: 0 } });
      const b = shapeResolve({ n: 20, k: 10, hullHits: 1, dwellMs: 0, weights: { hull: 1, ratio: 0, dwell: 0 } });
      expect(a.score).not.toBe(b.score);
    });
  });

  describe('boundary detection', () => {
    it('score 跨越阈值时 isEdge=true', () => {
      const out = shapeResolve({ n: 100, k: 26, hullHits: 0, dwellMs: 0 });
      if (out.score > 0.22 && out.score < 0.28) {
        expect(out.isEdge).toBe(true);
      }
    });
  });

  describe('shapeBlend', () => {
    it('返回平滑过渡信息', () => {
      const a = shapeResolve({ n: 20, k: 1, hullHits: 0, dwellMs: 0 });
      const b = shapeResolve({ n: 20, k: 20, hullHits: 1, dwellMs: 60_000 });
      const blend = shapeBlend(a, b, 0.5);
      expect(blend.leftShape).toBe(a.shape);
      expect(blend.rightShape).toBe(b.shape);
      expect(blend.crossStates).toBe(true);
    });
    it('相同 shape 不算 cross', () => {
      const a = shapeResolve({ n: 20, k: 0, hullHits: 0, dwellMs: 0 });
      const b = shapeResolve({ n: 20, k: 0, hullHits: 0, dwellMs: 5_000 });
      const blend = shapeBlend(a, b, 0.5);
      expect(blend.crossStates).toBe(false);
    });
  });

  describe('transitions', () => {
    it('empty 时无 transitions(独立档)', () => {
      const out = shapeResolve({ n: 0, k: 0, hullHits: 0, dwellMs: 0 });
      expect(out.transitions.length).toBe(0);
    });
    it('非空时返回其他 3 个 shape 作为过渡目标', () => {
      const out = shapeResolve({ n: 20, k: 10, hullHits: 0, dwellMs: 0 });
      expect(out.transitions.length).toBe(3);
      expect(out.transitions).not.toContain(out.shape);
    });
  });
});