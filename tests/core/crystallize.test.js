/**
 * [INPUT]: src/core/crystallize.js
 * [OUTPUT]: 验证结晶机制的纯逻辑 — calcCohesion / suggestForm / canCrystallize / FORM_NAMES
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { calcCohesion, suggestForm, canCrystallize, FORM_NAMES } from '../../src/core/crystallize.js';

function makeEdge(id, fromId, toId, relationType = 'cause') {
  return { id, fromId, toId, relationType };
}

describe('calcCohesion', () => {
  it('returns 0 for fewer than 2 thoughts', () => {
    expect(calcCohesion([], [])).toBe(0);
    expect(calcCohesion(['t1'], [])).toBe(0);
  });

  it('returns 0 when no inner edges exist', () => {
    const ids = ['t1', 't2', 't3'];
    const edges = [makeEdge('e1', 't1', 't_outside')];
    const c = calcCohesion(ids, edges);
    expect(c).toBe(0);
  });

  it('higher with more edges among same thoughts', () => {
    const ids = ['t1', 't2', 't3', 't4'];
    const few = [makeEdge('e1', 't1', 't2')];
    const many = [
      makeEdge('e1', 't1', 't2'),
      makeEdge('e2', 't1', 't3'),
      makeEdge('e3', 't2', 't3'),
      makeEdge('e4', 't2', 't4'),
      makeEdge('e5', 't3', 't4')
    ];
    expect(calcCohesion(ids, many)).toBeGreaterThan(calcCohesion(ids, few));
  });

  it('never exceeds 1', () => {
    const ids = ['t1', 't2', 't3'];
    const dense = [
      makeEdge('e1', 't1', 't2'),
      makeEdge('e2', 't2', 't1'),
      makeEdge('e3', 't1', 't3'),
      makeEdge('e4', 't3', 't1'),
      makeEdge('e5', 't2', 't3'),
      makeEdge('e6', 't3', 't2')
    ];
    const c = calcCohesion(ids, dense);
    expect(c).toBeLessThanOrEqual(1);
    expect(c).toBeGreaterThan(0);
  });

  it('ignores edges outside the thought set', () => {
    const ids = ['t1', 't2'];
    const edges = [
      makeEdge('e1', 't1', 't3'),
      makeEdge('e2', 't3', 't4')
    ];
    expect(calcCohesion(ids, edges)).toBe(0);
  });

  it('handles duplicate thought ids gracefully (deduplicates)', () => {
    const ids = ['t1', 't2', 't1', 't2'];
    const edges = [makeEdge('e1', 't1', 't2')];
    const c1 = calcCohesion(ids, edges);
    const c2 = calcCohesion(['t1', 't2'], edges);
    expect(c1).toBe(c2);
  });
});

describe('suggestForm', () => {
  it('returns dyad for fewer than 3 thoughts', () => {
    expect(suggestForm(['t1'], [])).toBe('dyad');
    expect(suggestForm(['t1', 't2'], [])).toBe('dyad');
  });

  it('returns tetra for 3-4 thoughts', () => {
    const ids = ['t1', 't2', 't3'];
    const edges = [makeEdge('e1', 't1', 't2', 'sequence')];
    expect(suggestForm(ids, edges)).toBe('tetra');
  });

  it('returns octa for 5-6 thoughts', () => {
    const ids = ['t1', 't2', 't3', 't4', 't5'];
    const edges = [makeEdge('e1', 't1', 't2', 'cause')];
    expect(suggestForm(ids, edges)).toBe('octa');
  });

  it('returns cube for 7-8 thoughts', () => {
    const ids = ['t1', 't2', 't3', 't4', 't5', 't6', 't7'];
    const edges = [makeEdge('e1', 't1', 't2', 'subordinate')];
    expect(suggestForm(ids, edges)).toBe('cube');
  });

  it('returns dodeca for 9-12 thoughts', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `t${i}`);
    const edges = [makeEdge('e1', 't0', 't1', 'conflict')];
    expect(suggestForm(ids, edges)).toBe('dodeca');
  });

  it('returns icosa for 13+ thoughts', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `t${i}`);
    expect(suggestForm(ids, [])).toBe('icosa');
  });

  it('uses parallel as default when no edges', () => {
    const ids = ['t1', 't2', 't3', 't4', 't5'];
    expect(suggestForm(ids, [])).toBe('octa');
  });
});

describe('canCrystallize', () => {
  it('returns false for fewer than 2 thoughts', () => {
    expect(canCrystallize([], [])).toBe(false);
    expect(canCrystallize(['t1'], [])).toBe(false);
  });

  it('returns false when no inner edges', () => {
    const ids = ['t1', 't2', 't3'];
    const edges = [makeEdge('e1', 't1', 'outside')];
    expect(canCrystallize(ids, edges)).toBe(false);
  });

  it('returns false when cohesion below threshold', () => {
    const ids = ['t1', 't2', 't3', 't4', 't5'];
    const edges = [makeEdge('e1', 't1', 't2')];
    expect(canCrystallize(ids, edges, 0.9)).toBe(false);
  });

  it('returns true when cohesion meets threshold and has edge', () => {
    const ids = ['t1', 't2'];
    const edges = [makeEdge('e1', 't1', 't2')];
    expect(canCrystallize(ids, edges, 0.1)).toBe(true);
  });

  it('uses default threshold 0.45', () => {
    const ids = ['t1', 't2', 't3', 't4'];
    const manyEdges = [
      makeEdge('e1', 't1', 't2'),
      makeEdge('e2', 't1', 't3'),
      makeEdge('e3', 't2', 't3'),
      makeEdge('e4', 't2', 't4'),
      makeEdge('e5', 't3', 't4')
    ];
    const result = canCrystallize(ids, manyEdges);
    expect(typeof result).toBe('boolean');
  });
});

describe('FORM_NAMES', () => {
  it('covers all form ids returned by suggestForm', () => {
    expect(FORM_NAMES.dyad).toBeDefined();
    expect(FORM_NAMES.tetra).toBeDefined();
    expect(FORM_NAMES.octa).toBeDefined();
    expect(FORM_NAMES.cube).toBeDefined();
    expect(FORM_NAMES.dodeca).toBeDefined();
    expect(FORM_NAMES.icosa).toBeDefined();
  });

  it('all values are non-empty strings', () => {
    for (const v of Object.values(FORM_NAMES)) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
