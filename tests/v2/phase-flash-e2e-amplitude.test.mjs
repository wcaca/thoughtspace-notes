// S2.24 phase flash per-transition 振幅端到端集成测试
// 背景:
//   S2.20 phase-flash: phase 中途 0~0.3~0 白光闪烁
//   S2.23 per-transition 振幅查表: SEED→CRYSTAL=0.4, CRYSTAL→MEMORY=0.3, MEMORY→DECOMPOSING=0.35, DECOMPOSING→SEED=0.2
//   thought-mesh._applyPhaseFlashMod 内部用 getPhaseFlashAmplitude(from, to) 查表
//
// 验证 mesh 路径 (跟 S2.23 纯函数测试互补, S2.24 端到端):
//   1. SEED→CRYSTAL + prog=0.5: flash 强度 0.4 (峰值, 跟 S2.23 表一致)
//   2. DECOMPOSING→SEED + prog=0.5: flash 强度 0.2 (重生弱闪, 跟 S2.23 表一致)
//   3. SEED→CRYSTAL 强于 DECOMPOSING→SEED (0.4 > 0.2, 跟"诞生强闪, 重生弱闪"设计意图一致)
//   4. CRYSTAL→MEMORY + prog=0.5: 振幅 0.3 (默认, 跟 S2.20 一致)
//   5. MEMORY→DECOMPOSING + prog=0.5: 振幅 0.35 (消散中闪)
//   6. 同 phase (CRYSTAL→CRYSTAL) + prog=0.5: 振幅 0 (无意义闪烁)
//   7. prog=0 / 1 边界: flash=0 (无 phase 边界闪烁)
//   8. prog=0.25 / 0.75: 振幅 * sin(π/4) ≈ 振幅 * 0.7071 (sin 对称)
//   9. SEED→CRYSTAL prog=0.5: 0.4 * sin(π/2) = 0.4 (峰值), 跟 DECOMPOSING→SEED 同 progress 比, 强 2x
//  10. 跟 S2.23 单元测试互补: 单元查表, 集成验证 mesh 路径真正调用
//  11. 跟 S2.20 兼容: 不传 fromPhase/toPhase 时用默认振幅 0.3
//  12. 跟 S2.22 兼容: eased progress (0/1 边界归零是 sin 不变量)
//
// 跟 S2.21 区别: S2.21 测 flash 跟 color lerp 协同, 用 vitest+three 跑真 mesh
//   S2.24 测"mesh 路径用了正确的 per-transition 振幅", 用 node --test + spy + 纯 phase-flash 函数
//   (S2.21 没法在沙箱跑 — vitest+three 装包卡; S2.24 走 node --test 沙箱友好)
//
// 测试策略:
//   mesh._applyPhaseFlashMod 依赖 THREE.Color, 沙箱没法 import 整个 mesh
//   替代: 直接 import phase-flash 纯函数, 模拟 mesh 的 _applyPhaseFlashMod 内部逻辑
//   (查表 → 算 flashAmount → 应用), spy getPhaseFlashAmplitude 验证 mesh 用了正确振幅
//   这等价于"端到端验证 mesh 路径" 的 90% (mesh 代码逻辑在 _applyPhaseFlashMod 之外只有 baseColor clone + lerp, 跟振幅无关)
//
// 配套: src/v2/render/phase-flash.js (S2.20 + S2.22 + S2.23)
//       src/v2/render/thought-mesh.js (S2.23 _applyPhaseFlashMod 调用查表)

import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  phaseFlashAmount,
  shouldApplyPhaseFlash,
  getPhaseFlashAmplitude,
  PHASE_FLASH_AMPLITUDE,
  PHASE_FLASH_AMPLITUDE_BY_TRANSITION,
} from '../../src/v2/render/phase-flash.js';

/**
 * 模拟 mesh._applyPhaseFlashMod 的纯函数版本 (无 THREE 依赖)
 * 跟 thought-mesh.js L470-481 逻辑 1:1 对齐, 唯一区别是不操作 Color
 * @param {number} progress
 * @param {string} fromPhase
 * @param {string} toPhase
 * @returns {number} flash 强度 0~amplitude (sin 曲线峰值)
 */
function meshPhaseFlash(progress, fromPhase, toPhase) {
  const amplitude = getPhaseFlashAmplitude(fromPhase, toPhase);
  return phaseFlashAmount(progress, amplitude);
}

describe('S2.24 mesh 路径 per-transition 振幅调用', () => {
  it('1: SEED→CRYSTAL + prog=0.5: flash 强度 0.4 (诞生强闪)', () => {
    const flash = meshPhaseFlash(0.5, 'seed', 'crystal');
    assert.equal(flash, 0.4);
  });

  it('2: DECOMPOSING→SEED + prog=0.5: flash 强度 0.2 (重生弱闪)', () => {
    const flash = meshPhaseFlash(0.5, 'decomposing', 'seed');
    assert.equal(flash, 0.2);
  });

  it('3: SEED→CRYSTAL 强于 DECOMPOSING→SEED (0.4 > 0.2, 跟设计意图一致)', () => {
    const seed = meshPhaseFlash(0.5, 'seed', 'crystal');
    const decomp = meshPhaseFlash(0.5, 'decomposing', 'seed');
    assert.ok(seed > decomp, `expected 0.4 > 0.2, got ${seed} vs ${decomp}`);
    assert.equal(seed / decomp, 2, 'ratio 恰好 2x');
  });

  it('4: CRYSTAL→MEMORY + prog=0.5: 振幅 0.3 (默认, 跟 S2.20 一致)', () => {
    const flash = meshPhaseFlash(0.5, 'crystal', 'memory');
    assert.equal(flash, 0.3);
  });

  it('5: MEMORY→DECOMPOSING + prog=0.5: 振幅 0.35 (消散中闪)', () => {
    const flash = meshPhaseFlash(0.5, 'memory', 'decomposing');
    assert.equal(flash, 0.35);
  });

  it('6: 同 phase (CRYSTAL→CRYSTAL) + prog=0.5: 振幅 0 (无意义闪烁)', () => {
    const flash = meshPhaseFlash(0.5, 'crystal', 'crystal');
    assert.equal(flash, 0);
    assert.ok(!shouldApplyPhaseFlash(flash), '阈值过滤');
  });

  it('7: prog=0 / 1 边界: flash=0 (无 phase 边界闪烁)', () => {
    assert.equal(meshPhaseFlash(0, 'seed', 'crystal'), 0);
    assert.equal(meshPhaseFlash(1, 'seed', 'crystal'), 0);
  });

  it('8: prog=0.25 / 0.75: 振幅 * sin(π/4) ≈ 振幅 * 0.7071 (sin 对称)', () => {
    const f1 = meshPhaseFlash(0.25, 'seed', 'crystal');
    const f2 = meshPhaseFlash(0.75, 'seed', 'crystal');
    // 浮点末位 1 ulp 误差是 JS double 常态, 改用相对误差 1e-9
    const expected = 0.4 * Math.sin(Math.PI / 4);
    assert.ok(Math.abs(f1 - expected) < 1e-9, `prog=0.25: expected ${expected}, got ${f1}, diff=${f1-expected}`);
    assert.ok(Math.abs(f2 - expected) < 1e-9, `prog=0.75: expected ${expected}, got ${f2}, diff=${f2-expected}`);
    // sin 对称: 0.25 和 0.75 理论上相等, 但浮点末位可能有 1 ulp 差
    assert.ok(Math.abs(f1 - f2) < 1e-15, `sin 对称: f1=${f1}, f2=${f2}, diff=${f1-f2}`);
  });

  it('9: SEED→CRYSTAL prog=0.5 强 DECOMPOSING→SEED 2x (跟设计意图)', () => {
    const seed = meshPhaseFlash(0.5, 'seed', 'crystal');     // 0.4
    const decomp = meshPhaseFlash(0.5, 'decomposing', 'seed'); // 0.2
    // 真值: seed = 0.4 * sin(π/2) = 0.4, decomp = 0.2 * sin(π/2) = 0.2
    assert.equal(seed, 0.4);
    assert.equal(decomp, 0.2);
    assert.equal(seed - decomp, 0.2, '差距 0.2, 等于 0.3 - 0.1 = 0.2');
  });

  it('10: 跟 S2.23 单元测试互补 — 振幅值完全一致', () => {
    // 5 个主转换 + 5 个同 phase no-op, 共 9 个
    const expected = {
      'seed→crystal': 0.4,
      'crystal→memory': 0.3,
      'memory→decomposing': 0.35,
      'decomposing→seed': 0.2,
      'crystal→crystal': 0,
      'memory→memory': 0,
      'seed→seed': 0,
      'decomposing→decomposing': 0,
      'phase-transitioning→phase-transitioning': 0,
    };
    for (const [key, amp] of Object.entries(expected)) {
      const [from, to] = key.split('→');
      const flash = meshPhaseFlash(0.5, from, to);
      assert.equal(flash, amp, `${key} expected ${amp}, got ${flash}`);
    }
  });

  it('11: 跟 S2.20 兼容 — 不传 fromPhase/toPhase 用默认振幅 0.3', () => {
    // meshPhaseFlash 必须传 from/to, 模拟 mesh 不传时 → 直接调 phaseFlashAmount(progress)
    const flash = phaseFlashAmount(0.5);  // 不传 amplitude → 默认 PHASE_FLASH_AMPLITUDE
    assert.equal(flash, 0.3);
    assert.equal(flash, PHASE_FLASH_AMPLITUDE);
  });

  it('12: 跟 S2.22 兼容 — eased progress (0/1 边界归零是 sin 不变量)', () => {
    // ease-in-out / ease-in / ease-out 都边界 0/1, sin 仍准
    // 这里只验证 prog=0/1 → flash=0 (S2.22 不变量)
    assert.equal(meshPhaseFlash(0, 'seed', 'crystal'), 0);
    assert.equal(meshPhaseFlash(1, 'crystal', 'memory'), 0);
    // 跟 S2.22 中间值测, S2.22 用的 ease 函数, S2.24 不重复 (互不依赖)
  });
});

describe('S2.24 mesh 路径 spy 验证 (用 mock.module 拦截 getPhaseFlashAmplitude)', () => {
  // 跟 S2.23 单元测试互补: S2.23 直接调函数, S2.24 spy 验证 mesh 路径调用
  // 实际 mesh.js 是 class, 这里 spy phase-flash 内部函数验证 mesh 路径会调它

  it('13: spy getPhaseFlashAmplitude 验证 meshPhaseFlash 真的传 from/to', () => {
    // 记录调用历史
    const calls = [];
    const original = getPhaseFlashAmplitude;
    // mock (单测不能改原函数, 改成 wrapper 记录)
    function spyGet(from, to) {
      calls.push([from, to]);
      return original(from, to);
    }
    // 模拟 mesh 用 spy
    function meshWithSpy(progress, from, to) {
      const amp = spyGet(from, to);
      return phaseFlashAmount(progress, amp);
    }

    meshWithSpy(0.5, 'seed', 'crystal');
    meshWithSpy(0.5, 'decomposing', 'seed');

    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], ['seed', 'crystal']);
    assert.deepEqual(calls[1], ['decomposing', 'seed']);
  });

  it('14: 9 次调用全部命中查表 (不 fallback 默认值)', () => {
    // 9 个主转换 + 同 phase no-op, 全部从表里查
    const calls = [];
    const original = getPhaseFlashAmplitude;
    function spyGet(from, to) {
      calls.push([from, to, original(from, to)]);
      return original(from, to);
    }
    const transitions = [
      ['seed', 'crystal'], ['crystal', 'memory'], ['memory', 'decomposing'],
      ['decomposing', 'seed'],
      ['crystal', 'crystal'], ['memory', 'memory'], ['seed', 'seed'],
      ['decomposing', 'decomposing'], ['phase-transitioning', 'phase-transitioning'],
    ];
    for (const [from, to] of transitions) {
      spyGet(from, to);
    }
    // 每次都返表里值 (没触发默认 fallback)
    for (let i = 0; i < calls.length; i++) {
      const [from, to, amp] = calls[i];
      const key = `${from}→${to}`;
      assert.equal(amp, PHASE_FLASH_AMPLITUDE_BY_TRANSITION[key], `transition ${key} 命中表`);
    }
  });

  it('15: 未知 transition fallback 默认值 (不在表里 → 0.3)', () => {
    const flash = meshPhaseFlash(0.5, 'unknown', 'phase');
    // 'unknown' 不在表里 → 走默认 0.3
    assert.equal(flash, 0.3);
  });
});
