// S2.23 per-transition phase flash 振幅 - 纯函数测试
// 跟 S2.20 一起, 用 node 内置 test runner 跑 (避免沙箱 npm install 装 vitest 卡死, 7-22 教训)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseFlashAmount,
  getPhaseFlashAmplitude,
  PHASE_FLASH_AMPLITUDE,
  PHASE_FLASH_AMPLITUDE_BY_TRANSITION,
} from '../../src/v2/render/phase-flash.js';

describe('S2.23 per-transition 振幅表 PHASE_FLASH_AMPLITUDE_BY_TRANSITION', () => {
  it('是 frozen 对象, 运行时改不动', () => {
    assert.throws(() => { PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal'] = 0.99; });
  });

  it('包含 4 个主转换 + 5 个同 phase no-op', () => {
    const keys = Object.keys(PHASE_FLASH_AMPLITUDE_BY_TRANSITION);
    assert.ok(keys.includes('seed→crystal'));
    assert.ok(keys.includes('crystal→memory'));
    assert.ok(keys.includes('memory→decomposing'));
    assert.ok(keys.includes('decomposing→seed'));
    assert.ok(keys.includes('crystal→crystal'));
    assert.ok(keys.includes('memory→memory'));
    assert.ok(keys.includes('seed→seed'));
    assert.ok(keys.includes('decomposing→decomposing'));
    assert.ok(keys.includes('phase-transitioning→phase-transitioning'));
  });

  it('SEED → CRYSTAL 振幅 = 0.4 (诞生强闪)', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal'], 0.4);
  });

  it('CRYSTAL → MEMORY 振幅 = 0.3 (默认, 跟 S2.20 一致)', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['crystal→memory'], 0.3);
  });

  it('MEMORY → DECOMPOSING 振幅 = 0.35 (消散中闪)', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['memory→decomposing'], 0.35);
  });

  it('DECOMPOSING → SEED 振幅 = 0.2 (重生弱闪)', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['decomposing→seed'], 0.2);
  });

  it('所有同 phase no-op 振幅 = 0 (无意义闪烁)', () => {
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['crystal→crystal'], 0);
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['memory→memory'], 0);
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→seed'], 0);
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['decomposing→decomposing'], 0);
    assert.equal(PHASE_FLASH_AMPLITUDE_BY_TRANSITION['phase-transitioning→phase-transitioning'], 0);
  });

  it('所有振幅值都在 0~1 范围 (合规)', () => {
    for (const [k, v] of Object.entries(PHASE_FLASH_AMPLITUDE_BY_TRANSITION)) {
      assert.ok(v >= 0 && v <= 1, `${k} = ${v} 越界`);
    }
  });
});

describe('S2.23 getPhaseFlashAmplitude 查表', () => {
  it('命中主转换表 — seed→crystal → 0.4', () => {
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal'), 0.4);
  });

  it('命中主转换表 — crystal→memory → 0.3', () => {
    assert.equal(getPhaseFlashAmplitude('crystal', 'memory'), 0.3);
  });

  it('命中主转换表 — memory→decomposing → 0.35', () => {
    assert.equal(getPhaseFlashAmplitude('memory', 'decomposing'), 0.35);
  });

  it('命中主转换表 — decomposing→seed → 0.2', () => {
    assert.equal(getPhaseFlashAmplitude('decomposing', 'seed'), 0.2);
  });

  it('同 phase no-op — crystal→crystal → 0', () => {
    assert.equal(getPhaseFlashAmplitude('crystal', 'crystal'), 0);
  });

  it('未命中表 — seed→memory (跳过 crystal) → 回退 PHASE_FLASH_AMPLITUDE', () => {
    assert.equal(getPhaseFlashAmplitude('seed', 'memory'), PHASE_FLASH_AMPLITUDE);
  });

  it('未命中表 — crystal→seed → 回退默认', () => {
    assert.equal(getPhaseFlashAmplitude('crystal', 'seed'), PHASE_FLASH_AMPLITUDE);
  });

  it('未命中表 — memory→crystal (反向) → 回退默认', () => {
    assert.equal(getPhaseFlashAmplitude('memory', 'crystal'), PHASE_FLASH_AMPLITUDE);
  });

  it('防御性: fromPhase 非字符串 → 回退默认', () => {
    assert.equal(getPhaseFlashAmplitude(null, 'crystal'), PHASE_FLASH_AMPLITUDE);
    assert.equal(getPhaseFlashAmplitude(undefined, 'crystal'), PHASE_FLASH_AMPLITUDE);
    assert.equal(getPhaseFlashAmplitude(123, 'crystal'), PHASE_FLASH_AMPLITUDE);
  });

  it('防御性: toPhase 非字符串 → 回退默认', () => {
    assert.equal(getPhaseFlashAmplitude('seed', null), PHASE_FLASH_AMPLITUDE);
    assert.equal(getPhaseFlashAmplitude('seed', undefined), PHASE_FLASH_AMPLITUDE);
  });

  it('防御性: 双方都非字符串 → 回退默认', () => {
    assert.equal(getPhaseFlashAmplitude(null, null), PHASE_FLASH_AMPLITUDE);
  });
});

describe('S2.23 phaseFlashAmount amplitude 参数', () => {
  it('不传 amplitude — 用默认 PHASE_FLASH_AMPLITUDE (向后兼容)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5) - 0.3) < 0.0001);
  });

  it('传 amplitude=0.4 (SEED→CRYSTAL) — 峰值 0.4', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, 0.4) - 0.4) < 0.0001);
  });

  it('传 amplitude=0.2 (DECOMPOSING→SEED) — 峰值 0.2', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, 0.2) - 0.2) < 0.0001);
  });

  it('传 amplitude=0 (同 phase) — 全程 0', () => {
    for (let p = 0; p <= 1; p += 0.1) {
      assert.equal(phaseFlashAmount(p, 0), 0);
    }
  });

  it('传 amplitude=1 (边界) — 峰值 1 (颜色全白)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, 1) - 1) < 0.0001);
  });

  it('prog=0 + 任意 amplitude → 0 (phase 边界)', () => {
    assert.equal(phaseFlashAmount(0, 0.4), 0);
    assert.equal(phaseFlashAmount(0, 0), 0);
    assert.equal(phaseFlashAmount(0, 1), 0);
  });

  it('prog=1 + 任意 amplitude → 0 (phase 边界)', () => {
    assert.equal(phaseFlashAmount(1, 0.4), 0);
  });

  it('prog=0.5 + amplitude=0.4 → 0.4 (峰值公式)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, 0.4) - 0.4) < 0.0001);
  });

  it('prog=0.25 + amplitude=A → A * sin(π/4) ≈ A * 0.7071', () => {
    const A = 0.4;
    const expected = A * Math.sin(Math.PI / 4);
    assert.ok(Math.abs(phaseFlashAmount(0.25, A) - expected) < 0.001);
  });

  it('sin 对称性: 振幅 0.4 下 0.25 == 0.75', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.25, 0.4) - phaseFlashAmount(0.75, 0.4)) < 0.0001);
  });

  it('防御性: 负数 amplitude → 回退默认', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, -0.4) - PHASE_FLASH_AMPLITUDE) < 0.0001);
  });

  it('防御性: NaN amplitude → 回退默认', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, NaN) - PHASE_FLASH_AMPLITUDE) < 0.0001);
  });

  it('防御性: undefined amplitude → 用默认 (等价不传)', () => {
    assert.ok(Math.abs(phaseFlashAmount(0.5, undefined) - PHASE_FLASH_AMPLITUDE) < 0.0001);
  });
});

describe('S2.23 端到端: per-transition 振幅差异化验证', () => {
  it('SEED→CRYSTAL (0.4) vs DECOMPOSING→SEED (0.2) — 峰位强度差 2x', () => {
    const seedToCrystal = phaseFlashAmount(0.5, getPhaseFlashAmplitude('seed', 'crystal'));
    const decomposingToSeed = phaseFlashAmount(0.5, getPhaseFlashAmplitude('decomposing', 'seed'));
    assert.ok(Math.abs(seedToCrystal / decomposingToSeed - 2) < 0.001);
  });

  it('同 phase CRYSTAL→CRYSTAL → 全程 0, 跟 CRYSTAL→MEMORY 区分明显', () => {
    const noop = phaseFlashAmount(0.5, getPhaseFlashAmplitude('crystal', 'crystal'));
    const real = phaseFlashAmount(0.5, getPhaseFlashAmplitude('crystal', 'memory'));
    assert.equal(noop, 0);
    assert.ok(real > 0.2, `real=${real} 应 > 0.2`);
  });

  it('未在表里的转换 — 跟默认 CRYSTAL→MEMORY (0.3) 行为一致', () => {
    const fallback = phaseFlashAmount(0.5, getPhaseFlashAmplitude('memory', 'crystal'));
    const direct = phaseFlashAmount(0.5, getPhaseFlashAmplitude('crystal', 'memory'));
    assert.equal(fallback, direct);
  });
});
