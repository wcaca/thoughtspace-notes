// S2.25 createThought opts.flashAmplitudeOverride 字段 - 纯函数测试
// 验证: 0~1 number 接受, 非法值 fallback 到 null, 字段可访问

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createThought } from '../../src/core/thought.js';

describe('S2.25 createThought flashAmplitudeOverride 字段', () => {
  it('不传 opts → flashAmplitudeOverride = null (走查表)', () => {
    const t = createThought('t1', 'text', 0, 0, 0);
    assert.equal(t.flashAmplitudeOverride, null);
  });

  it('传 flashAmplitudeOverride 0.5 → 字段 = 0.5', () => {
    const t = createThought('t2', 'text', 0, 0, 0, { flashAmplitudeOverride: 0.5 });
    assert.equal(t.flashAmplitudeOverride, 0.5);
  });

  it('传 flashAmplitudeOverride 0 (关闪) → 字段 = 0', () => {
    const t = createThought('t3', 'text', 0, 0, 0, { flashAmplitudeOverride: 0 });
    assert.equal(t.flashAmplitudeOverride, 0);
  });

  it('传 flashAmplitudeOverride 1 (max) → 字段 = 1', () => {
    const t = createThought('t4', 'text', 0, 0, 0, { flashAmplitudeOverride: 1 });
    assert.equal(t.flashAmplitudeOverride, 1);
  });

  it('传非法值 (负数) → 字段 = null (防御性 fallback)', () => {
    const t = createThought('t5', 'text', 0, 0, 0, { flashAmplitudeOverride: -0.5 });
    assert.equal(t.flashAmplitudeOverride, null);
  });

  it('传非法值 (>1) → 字段 = null', () => {
    const t = createThought('t6', 'text', 0, 0, 0, { flashAmplitudeOverride: 1.5 });
    assert.equal(t.flashAmplitudeOverride, null);
  });

  it('传非法值 (NaN) → 字段 = null', () => {
    const t = createThought('t7', 'text', 0, 0, 0, { flashAmplitudeOverride: NaN });
    assert.equal(t.flashAmplitudeOverride, null);
  });

  it('传非法值 (string) → 字段 = null', () => {
    const t = createThought('t8', 'text', 0, 0, 0, { flashAmplitudeOverride: '0.5' });
    assert.equal(t.flashAmplitudeOverride, null);
  });

  it('opts 是 undefined → 字段 = null (向后兼容)', () => {
    const t = createThought('t9', 'text', 0, 0, 0, undefined);
    assert.equal(t.flashAmplitudeOverride, null);
  });
});
