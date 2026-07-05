/**
 * [INPUT]: src/core/structure.js
 * [OUTPUT]: 验证 cohesionScore / isCrystallized
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { cohesionScore, isCrystallized } from '../../src/core/structure.js';

describe('structure', () => {
  it('cohesion returns 0 for <2 nodes', () => {
    expect(cohesionScore(['a'], [])).toBe(0);
  });

  it('cohesion returns 0 for no edges', () => {
    expect(cohesionScore(['a', 'b', 'c'], [])).toBe(0);
  });

  it('cohesion for triangle is high', () => {
    const edges = [
      { fromId: 'a', toId: 'b', id: 'e1' },
      { fromId: 'b', toId: 'c', id: 'e2' },
      { fromId: 'a', toId: 'c', id: 'e3' }
    ];
    const score = cohesionScore(['a', 'b', 'c'], edges);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('cohesion includes edge density and degree balance', () => {
    const edges = [{ fromId: 'a', toId: 'b', id: 'e1' }];
    const score = cohesionScore(['a', 'b'], edges);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.5);
  });

  it('isCrystallized triggers when userConfirmed and cohesion is above threshold', () => {
    const edges = [
      { fromId: 'a', toId: 'b', id: 'e1' },
      { fromId: 'b', toId: 'c', id: 'e2' },
      { fromId: 'a', toId: 'c', id: 'e3' }
    ];
    expect(isCrystallized(['a', 'b', 'c'], edges, true)).toBe(true);
  });

  it('isCrystallized false for isolated star', () => {
    const edges = [{ fromId: 'a', toId: 'b', id: 'e1' }];
    expect(isCrystallized(['a', 'b', 'c', 'd'], edges, false)).toBe(false);
  });
});
