/**
 * [INPUT]: src/core/meditation.js
 * [OUTPUT]: 验证冥想状态机 + 各 fade curve
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { createMeditationState } from '../../src/core/meditation.js';

describe('meditation state machine', () => {
  it('starts inactive', () => {
    const m = createMeditationState();
    expect(m.isActive()).toBe(false);
    expect(m.level(0)).toBe(0);
  });

  it('enter activates and ramps level to 1 over ~0.8s', () => {
    const m = createMeditationState();
    m.enter(0);
    expect(m.isActive()).toBe(true);
    expect(m.level(100)).toBeGreaterThan(0);
    expect(m.level(800)).toBeGreaterThan(0.95);
    expect(m.level(2000)).toBe(1);
  });

  it('level peaks at 1 while active', () => {
    const m = createMeditationState();
    m.enter(0);
    expect(m.level(100)).toBeLessThanOrEqual(1);
    expect(m.level(99999)).toBe(1);
  });

  it('exit decrements level to 0 in ~0.4s', () => {
    const m = createMeditationState();
    m.enter(0);
    m.level(1500);
    m.exit(2000);
    expect(m.isActive()).toBe(false);
    expect(m.level(2400)).toBeLessThan(0.1);
    expect(m.level(3000)).toBe(0);
  });

  it('saturationFactor attenuates as level rises', () => {
    const m = createMeditationState();
    expect(m.saturationFactor(0)).toBe(1);
    expect(m.saturationFactor(0.5)).toBeCloseTo(0.775, 3);
    expect(m.saturationFactor(1)).toBeCloseTo(0.55, 3);
  });

  it('pulseFactor attenuates harder than saturation', () => {
    const m = createMeditationState();
    expect(m.pulseFactor(0)).toBe(1);
    expect(m.pulseFactor(1)).toBeCloseTo(0.3, 3);
  });

  it('hueShift goes negative into meditation', () => {
    const m = createMeditationState();
    expect(Math.abs(m.hueShift(0))).toBeLessThan(1e-9);
    expect(m.hueShift(0.5)).toBeCloseTo(-5, 3);
    expect(m.hueShift(1)).toBeCloseTo(-10, 3);
  });

  it('decorationGain grows when not meditated', () => {
    const m = createMeditationState();
    expect(m.decorationGain(0)).toBe(1);
    expect(m.decorationGain(1)).toBeCloseTo(0.4, 3);
  });

  it('enter twice does not change activation source', () => {
    const m = createMeditationState();
    expect(m.enter(0)).toBe(true);
    expect(m.enter(100)).toBe(false);
  });

  it('exit twice does not crash', () => {
    const m = createMeditationState();
    m.enter(0);
    expect(m.exit(10)).toBe(true);
    expect(m.exit(20)).toBe(false);
  });
});
