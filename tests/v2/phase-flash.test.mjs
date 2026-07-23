// S2.20 phase 变化时温度色短暂闪烁 - 纯函数测试
// 用 node 内置 test runner 跑 (避免沙箱 npm install 装 vitest 卡死, 7-22 教训)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseFlashAmount,
  shouldApplyPhaseFlash,
  PHASE_FLASH_AMPLITUDE,
  PHASE_FLASH_THRESHOLD,
} from '../../src/v2/render/phase-flash.js';

describe('S2.20 phaseFlashAmount 纯函数', () => {
  it('prog=0 (phase 起点) → 0 无闪烁', () => {
    assert.equal(phaseFlashAmount(0), 0);
  });
  it('prog=1 (phase 终点) → 0 无闪烁', () => {
    assert.equal(phaseFlashAmount(1), 0);
  });
  it('prog=0.5 (phase 中点) → 峰值 0.3', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5) - 0.3) < 0.0001);
  });
  it('prog=0.25 (early phase) → 0.2121 (sin 早期值)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.25) - 0.2121) < 0.001);
  });
  it('prog=0.75 (late phase) → 0.2121 (sin 对称点)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.75) - 0.2121) < 0.001);
  });
  it('sin 对称性: 0.25 == 0.75', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.25) - phaseFlashAmount(0.75)) < 0.0001);
  });
  it('负数 → 0 (防御性)', () => {
    assert.equal(phaseFlashAmount(-0.5), 0);
  });
  it('>1 → 0 (防御性)', () => {
    assert.equal(phaseFlashAmount(1.5), 0);
  });
  it('NaN → 0 (防御性)', () => {
    assert.equal(phaseFlashAmount(NaN), 0);
  });
  it('undefined → 0 (防御性)', () => {
    assert.equal(phaseFlashAmount(undefined), 0);
  });
  it('AMPLITUDE 常量 = 0.3', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE, 0.3);
  });
  it('峰值永远 = AMPLITUDE', () => {
    assert.equal(phaseFlashAmount(0.5), PHASE_FLASH_AMPLITUDE);
  });
});

describe('S2.20 shouldApplyPhaseFlash 阈值', () => {
  it('flashAmount > 0.001 → true', () => {
    assert.equal(shouldApplyPhaseFlash(0.3), true);
    assert.equal(shouldApplyPhaseFlash(0.01), true);
  });
  it('flashAmount = 0.001 → false (边界)', () => {
    assert.equal(shouldApplyPhaseFlash(0.001), false);
  });
  it('flashAmount = 0 → false', () => {
    assert.equal(shouldApplyPhaseFlash(0), false);
  });
  it('负数 → false', () => {
    assert.equal(shouldApplyPhaseFlash(-0.1), false);
  });
  it('常量: THRESHOLD = 0.001', () => {
    assert.equal(PHASE_FLASH_THRESHOLD, 0.001);
  });
});

describe('S2.20 phase 进度 0~1 全程行为', () => {
  it('10 采样点 = 0.3 * sin(π * p) (sin 曲线定义)', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      const actual = phaseFlashAmount(p);
      const expected = 0.3 * Math.sin(Math.PI * p);
      assert.ok(Math.abs(actual - expected) < 0.0001, `p=${p}: actual=${actual}, expected=${expected}`);
    }
  });

  it('曲线积分近似 ≈ 0.191 (理论 0.3 * 2/π)', () => {
    const N = 100;
    let sum = 0;
    for (let i = 0; i < N; i++) {
      sum += phaseFlashAmount((i + 0.5) / N);
    }
    const avg = sum / N;
    assert.ok(Math.abs(avg - 0.19099) < 0.001, `积分均值=${avg}`);
  });
});
