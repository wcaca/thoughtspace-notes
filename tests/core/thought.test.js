/**
 * [INPUT]: src/core/thought.js
 * [OUTPUT]: 验证 createThought / decayTemperature / refreshTemperature / updateMass / getName
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { createThought, decayTemperature, refreshTemperature, updateMass, getName } from '../../src/core/thought.js';

describe('thought', () => {
  it('create with defaults', () => {
    const t = createThought('t1', '一个念头');
    expect(t.id).toBe('t1');
    expect(t.temperature).toBe(1);
    expect(t.mass).toBe(1);
  });

  it('decay at 0 days is 1', () => {
    const t = createThought('t2', 'test');
    expect(decayTemperature(t, t.createdAt)).toBeCloseTo(1, 2);
  });

  it('decay at ~14 days is ~0.5', () => {
    const t = createThought('t3', 'test');
    const future = t.createdAt + 14 * 86400000;
    expect(decayTemperature(t, future)).toBeCloseTo(0.496, 1);
  });

  it('decay at 30 days is ~0.22', () => {
    const t = createThought('t4', 'test');
    const future = t.createdAt + 30 * 86400000;
    expect(decayTemperature(t, future)).toBeCloseTo(0.223, 1);
  });

  it('decay clamp to [0,1]', () => {
    const t = createThought('t5', 'test');
    expect(decayTemperature(t, t.createdAt + 365 * 86400000)).toBeGreaterThanOrEqual(0);
    expect(decayTemperature(t, t.createdAt - 86400000)).toBeLessThanOrEqual(1);
  });

  it('refresh resets temperature to 1', () => {
    const t = createThought('t6', 'test');
    const d = decayTemperature(t, t.createdAt + 30 * 86400000);
    expect(d).toBeLessThan(0.5);
    const r = refreshTemperature(t, Date.now());
    expect(r.temperature).toBe(1);
  });

  it('updateMass increases with editions', () => {
    const t = createThought('t7', 'test');
    const u = updateMass(t, 5, 3);
    expect(u.mass).toBeCloseTo(1 + 5 * 0.1 + 3 * 0.2, 2);
  });

  it('getName returns first 6 chars', () => {
    const t = createThought('t8', '很长很长很长的念头名字');
    expect(getName(t).length).toBeLessThanOrEqual(6);
  });
});
