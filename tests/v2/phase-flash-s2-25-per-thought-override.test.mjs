// S2.25 per-thought phase flash 振幅覆盖 - 纯函数测试
// 跟 S2.23 per-transition 振幅查表 一起, 用 node 内置 test runner 跑
// 优先级: thought.flashAmplitudeOverride > per-transition 查表 > PHASE_FLASH_AMPLITUDE 默认

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseFlashAmount,
  getPhaseFlashAmplitude,
  PHASE_FLASH_AMPLITUDE,
  PHASE_FLASH_AMPLITUDE_BY_TRANSITION,
} from '../../src/v2/render/phase-flash.js';

describe('S2.25 per-thought 振幅覆盖 getPhaseFlashAmplitude(from, to, thought)', () => {
  it('无 thought 参数时, 走查表 (向后兼容 S2.23)', () => {
    // 不传 thought, 等同 S2.23 行为
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal'), PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']);
    assert.equal(getPhaseFlashAmplitude('crystal', 'memory'), PHASE_FLASH_AMPLITUDE_BY_TRANSITION['crystal→memory']);
  });

  it('thought.flashAmplitudeOverride 是 0~1 number, 优先于查表', () => {
    // SEED→CRYSTAL 查表 0.4, override 0.7 → 用 0.7
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: 0.7 }), 0.7);
    // CRYSTAL→MEMORY 查表 0.3, override 0.1 → 用 0.1 (用户觉得太刺眼调低)
    assert.equal(getPhaseFlashAmplitude('crystal', 'memory', { flashAmplitudeOverride: 0.1 }), 0.1);
  });

  it('thought.flashAmplitudeOverride = 0 → 完全不闪 (用户主动关掉)', () => {
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: 0 }), 0);
  });

  it('thought.flashAmplitudeOverride = 1 → 100% 白光覆盖 (max 强度)', () => {
    assert.equal(getPhaseFlashAmplitude('memory', 'decomposing', { flashAmplitudeOverride: 1 }), 1);
  });

  it('override = null → 走查表 (用户恢复默认)', () => {
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: null }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
  });

  it('override = undefined → 走查表 (字段未设)', () => {
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: undefined }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
  });

  it('override 非法值 (负数 / >1 / NaN / string) → 走查表, 防御性', () => {
    // 负数
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: -0.1 }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
    // > 1
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: 1.5 }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
    // NaN
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: NaN }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
    // string
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: '0.5' }),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
  });

  it('override 优先于查表 miss 的默认 fallback (用户控制 last-mile)', () => {
    // 未知 phase 转换, 查表 miss → fallback 0.3, override 0.5 → 用 0.5
    assert.equal(getPhaseFlashAmplitude('crystal', 'crystal', { flashAmplitudeOverride: 0.5 }), 0.5);
  });

  it('thought 是 null/undefined → 不 crash, 走查表', () => {
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', null),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', undefined),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
  });

  it('v2 Thought class 字段: thought.config.flashAmplitudeOverride (双兼容)', () => {
    // v2 Thought class 把 config 放 this.config, v1 createThought 放顶层
    // getPhaseFlashAmplitude 应同时支持 2 种来源
    const v2Thought = { config: { flashAmplitudeOverride: 0.7 } };
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal', v2Thought), 0.7);

    const v1Thought = { flashAmplitudeOverride: 0.7 };
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal', v1Thought), 0.7);

    // v1 优先于 v2 (显式 v1 覆盖 v2 默认)
    const mixed = { flashAmplitudeOverride: 0.3, config: { flashAmplitudeOverride: 0.8 } };
    assert.equal(getPhaseFlashAmplitude('seed', 'crystal', mixed), 0.3);

    // config 字段非法值 → 走查表
    const badConfig = { config: { flashAmplitudeOverride: 1.5 } };
    assert.equal(
      getPhaseFlashAmplitude('seed', 'crystal', badConfig),
      PHASE_FLASH_AMPLITUDE_BY_TRANSITION['seed→crystal']
    );
  });
});

describe('S2.25 phaseFlashAmount(progress, amplitude) + override 集成', () => {
  it('override 0.6, progress 0.5 → flash = 0.6 * sin(π*0.5) = 0.6 (峰值)', () => {
    // 验证 override 真的被 phaseFlashAmount 用上 (端到端)
    const override = 0.6;
    const amplitude = getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: override });
    const flash = phaseFlashAmount(0.5, amplitude);
    assert.ok(Math.abs(flash - override) < 1e-9, `期望 ${override}, 实际 ${flash}`);
  });

  it('override 0 (用户关闪) → flashAmount 恒为 0, 后续 lerp 不触发', () => {
    const amplitude = getPhaseFlashAmplitude('seed', 'crystal', { flashAmplitudeOverride: 0 });
    // progress 任意值, flashAmount 都是 0
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const flash = phaseFlashAmount(p, amplitude);
      assert.equal(flash, 0, `progress=${p} flash 应为 0, 实际 ${flash}`);
    }
  });
});
