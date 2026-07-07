/**
 * [INPUT]: src/core/hydrate-anim.js
 * [OUTPUT]: 验证 hydrate 状态机 + factor 曲线
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { createHydrateAnim, clamp01, easeOutQuint, easeOutCubic } from '../../src/core/hydrate-anim.js';

const SPAWN_START_MS = 100;
const SPAWN_DURATION_MS = 1500;
const TEMPERATURE_START_MS = 600;
const TEMPERATURE_DURATION_MS = 1900;
const EDGE_FADE_START_MS = 1200;
const EDGE_FADE_DURATION_MS = 2300;
const TOTAL_DURATION_MS = 3500;

describe('hydrate-anim helpers', () => {
  it('easeOutCubic at t=0 is 0', () => {
    expect(easeOutCubic(0)).toBeCloseTo(0, 6);
  });

  it('easeOutCubic at t=1 is 1', () => {
    expect(easeOutCubic(1)).toBeCloseTo(1, 6);
  });

  it('easeOutCubic midpoint > 0.5 (faster rise)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('easeOutQuint at t=0/1 is 0/1', () => {
    expect(easeOutQuint(0)).toBeCloseTo(0, 6);
    expect(easeOutQuint(1)).toBeCloseTo(1, 6);
  });

  it('clamp01 bounds correctly', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(2)).toBe(1);
  });
});

describe('createHydrateAnim', () => {
  it('starts not-active and provides default level', () => {
    const h = createHydrateAnim();
    expect(h.isStarted()).toBe(false);
    expect(h.isActive(100)).toBe(false);
    const lev = h.level(100);
    expect(lev.overall).toBe(1);
  });

  it('start() flips isStarted true', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.isStarted()).toBe(true);
  });

  it('start() is idempotent — second call no-op', () => {
    const h = createHydrateAnim();
    expect(h.start(0)).toBe(true);
    expect(h.start(1000)).toBe(false);
    const lev = h.level(1000);
    expect(lev.spawn).toBeGreaterThan(0);
  });

  it('spawn level starts ~0 at 0 ms and reaches ~1 by end', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.level(0).spawn).toBe(0);
    expect(h.level(100).spawn).toBe(0);
    expect(h.level(1700).spawn).toBeGreaterThan(0.99);
  });

  it('temperature level lags spawn by its offset', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.level(0).temperature).toBe(0);
    const total = TEMPERATURE_START_MS + TEMPERATURE_DURATION_MS + 100;
    expect(h.level(total).temperature).toBeGreaterThan(0.99);
  });

  it('edge level lags by EDGE offset', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.level(0).edge).toBe(0);
    const total = EDGE_FADE_START_MS + EDGE_FADE_DURATION_MS + 100;
    expect(h.level(total).edge).toBeGreaterThan(0.99);
  });

  it('isActive false after TOTAL_DURATION_MS elapsed', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.isActive(TOTAL_DURATION_MS + 500)).toBe(false);
  });

  it('isActive true while running', () => {
    const h = createHydrateAnim();
    h.start(0);
    expect(h.isActive(0)).toBe(true);
    expect(h.isActive(TOTAL_DURATION_MS - 100)).toBe(true);
  });

  it('spawnScaleFactor goes from MIN to MAX across [0,1]', () => {
    const h = createHydrateAnim();
    expect(h.spawnScaleFactor(0)).toBeCloseTo(0.05, 5);
    expect(h.spawnScaleFactor(1)).toBeCloseTo(0.55, 5);
    expect(h.spawnScaleFactor(0.5)).toBeGreaterThan(0.05);
    expect(h.spawnScaleFactor(0.5)).toBeLessThan(0.55);
  });

  it('spawnOpacityFactor goes from 0 to 1', () => {
    const h = createHydrateAnim();
    expect(h.spawnOpacityFactor(0)).toBeCloseTo(0, 5);
    expect(h.spawnOpacityFactor(1)).toBeCloseTo(1, 5);
  });

  it('temperatureFadeFactor is identity function', () => {
    const h = createHydrateAnim();
    expect(h.temperatureFadeFactor(0.7)).toBeCloseTo(0.7, 5);
  });

  it('edgeOpacityFactor caps at 0.85', () => {
    const h = createHydrateAnim();
    expect(h.edgeOpacityFactor(1)).toBeCloseTo(0.85, 5);
    expect(h.edgeOpacityFactor(0)).toBe(0);
  });

  it('start() defaults performance.now when called without time', () => {
    const h = createHydrateAnim();
    const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
    h.start();
    expect(h.isActive(t + TOTAL_DURATION_MS + 100)).toBe(false);
  });

  it('does not interfere across instances', () => {
    const a = createHydrateAnim();
    const b = createHydrateAnim();
    a.start(0);
    b.start(5000);
    expect(a.level(0).spawn).toBe(0);
    expect(b.level(5500).spawn).toBeGreaterThan(0);
  });
});
