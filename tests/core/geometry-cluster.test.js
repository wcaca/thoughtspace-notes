/**
 * [INPUT]: src/core/geometry-cluster.js
 * [OUTPUT]: 验证几何聚类引擎 — clusterEngine.computeLayout / inferInitialCoordinates / evaluateCrystallization
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { clusterEngine, GeometryType } from '../../src/core/geometry-cluster.js';

describe('GeometryType', () => {
  it('exposes CLUSTER type', () => {
    expect(GeometryType.CLUSTER).toBe('cluster');
    expect(Object.isFrozen(GeometryType)).toBe(true);
  });
});

describe('clusterEngine', () => {
  it('has correct type and metadata', () => {
    expect(clusterEngine.type).toBe('cluster');
    expect(clusterEngine.requiresManualSetup).toBe(false);
  });

  describe('computeLayout', () => {
    it('returns empty object for zero thoughts', () => {
      const result = clusterEngine.computeLayout([], [], {});
      expect(result).toEqual({});
    });

    it('returns coords for each thought id', () => {
      const thoughts = [
        { id: 't1' },
        { id: 't2' },
        { id: 't3' }
      ];
      const result = clusterEngine.computeLayout(thoughts, [], {});
      expect(Object.keys(result).sort()).toEqual(['t1', 't2', 't3']);
      for (const id of ['t1', 't2', 't3']) {
        expect(typeof result[id].x).toBe('number');
        expect(typeof result[id].y).toBe('number');
      }
    });

    it('places thoughts in a circular pattern around centroid of existingCoords', () => {
      const thoughts = [
        { id: 't1' },
        { id: 't2' },
        { id: 't3' },
        { id: 't4' }
      ];
      const existing = {
        t1: { x: 100, y: 200 },
        t2: { x: 120, y: 220 },
        t3: { x: 80, y: 180 },
        t4: { x: 110, y: 210 }
      };
      const result = clusterEngine.computeLayout(thoughts, [], existing);
      const coords = Object.values(result);
      const cx = coords.reduce((s, c) => s + c.x, 0) / coords.length;
      const cy = coords.reduce((s, c) => s + c.y, 0) / coords.length;
      const expectedCx = (100 + 120 + 80 + 110) / 4;
      const expectedCy = (200 + 220 + 180 + 210) / 4;
      expect(cx).toBeCloseTo(expectedCx, 5);
      expect(cy).toBeCloseTo(expectedCy, 5);
    });

    it('uses fallback centroid (0,0) when no existing coords', () => {
      const thoughts = [
        { id: 't1' },
        { id: 't2' },
        { id: 't3' }
      ];
      const result = clusterEngine.computeLayout(thoughts, [], {});
      const coords = Object.values(result);
      const cx = coords.reduce((s, c) => s + c.x, 0) / coords.length;
      const cy = coords.reduce((s, c) => s + c.y, 0) / coords.length;
      expect(cx).toBeCloseTo(0, 5);
      expect(cy).toBeCloseTo(0, 5);
    });

    it('radius scales with thought count', () => {
      const few = Array.from({ length: 3 }, (_, i) => ({ id: `t${i}` }));
      const many = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}` }));
      const fewCoords = Object.values(clusterEngine.computeLayout(few, [], {}));
      const manyCoords = Object.values(clusterEngine.computeLayout(many, [], {}));

      const fewRadius = Math.sqrt(fewCoords[0].x ** 2 + fewCoords[0].y ** 2);
      const manyRadius = Math.sqrt(manyCoords[0].x ** 2 + manyCoords[0].y ** 2);
      expect(manyRadius).toBeGreaterThan(fewRadius);
    });

    it('all points are roughly equidistant from center', () => {
      const thoughts = Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` }));
      const result = clusterEngine.computeLayout(thoughts, [], {});
      const coords = Object.values(result);
      const distances = coords.map(c => Math.sqrt(c.x ** 2 + c.y ** 2));
      const avg = distances.reduce((s, d) => s + d, 0) / distances.length;
      for (const d of distances) {
        expect(d).toBeCloseTo(avg, 5);
      }
    });
  });

  describe('inferInitialCoordinates', () => {
    it('delegates to computeLayout with empty existing coords', () => {
      const thoughts = [{ id: 't1' }, { id: 't2' }];
      const result = clusterEngine.inferInitialCoordinates(thoughts, []);
      expect(Object.keys(result).sort()).toEqual(['t1', 't2']);
      expect(typeof result.t1.x).toBe('number');
    });
  });

  describe('evaluateCrystallization', () => {
    it('returns a number between 0 and 1', () => {
      const structure = {
        thoughtIds: ['t1', 't2', 't3'],
        edges: [],
        userConfirmed: false
      };
      const score = clusterEngine.evaluateCrystallization(structure);
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('returns higher score with more edges', () => {
      const ids = ['t1', 't2', 't3', 't4'];
      const few = {
        thoughtIds: ids,
        edges: [{ fromId: 't1', toId: 't2' }]
      };
      const many = {
        thoughtIds: ids,
        edges: [
          { fromId: 't1', toId: 't2' },
          { fromId: 't1', toId: 't3' },
          { fromId: 't2', toId: 't3' },
          { fromId: 't2', toId: 't4' }
        ]
      };
      const scoreFew = clusterEngine.evaluateCrystallization(few);
      const scoreMany = clusterEngine.evaluateCrystallization(many);
      expect(scoreMany).toBeGreaterThan(scoreFew);
    });
  });

  describe('getCrystallizedFormAsset', () => {
    it('returns null (cluster engine has no form asset)', () => {
      expect(clusterEngine.getCrystallizedFormAsset()).toBeNull();
    });
  });
});
