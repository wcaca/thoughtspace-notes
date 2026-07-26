// tests/v2/phase-flash-eased.test.mjs
// S2.22: phase-flash 接受 eased progress, 跟 thought-mesh color/flash 同步
// 跟 S2.20 phase-flash.test.mjs 互补: S2.20 测 linear, S2.22 测 eased (easeIn/easeInOut/linear)
//
// 18 case:
//   1-5: phaseFlashAmount 接 eased progress (5 easing × 边界验证)
//   6-10: phaseFlashAmount 跟 linear 调用结果对比 (eased-out 跟 linear 同样峰值位置在 0.5)
//   11-15: thought-mesh 源码静态分析 (确认 color lerp + flash 都走 getEasedPhaseProgress)
//   16-18: 端到端 — 4 种 easing 下 flash 跟 color lerp 同步验证 (用 mock Thought)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  phaseFlashAmount,
  shouldApplyPhaseFlash,
  PHASE_FLASH_AMPLITUDE,
  PHASE_FLASH_THRESHOLD,
} from '../../src/v2/render/phase-flash.js';
import {
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  applyEasing,
  EasingType,
} from '../../src/v2/animation/ease.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '../..');

// ===== 1-5: phaseFlashAmount 接 eased progress =====
test('S2.22: phaseFlashAmount 接 linear 仍 work (向后兼容)', () => {
  assert.equal(phaseFlashAmount(0), 0);
  assert.equal(phaseFlashAmount(1), 0);
  assert.equal(phaseFlashAmount(0.5), PHASE_FLASH_AMPLITUDE);
  assert.ok(Math.abs(phaseFlashAmount(0.25) - 0.2121) < 0.01);
});

test('S2.22: phaseFlashAmount 接 ease-out progress (easeOutCubic(0.5) ≈ 0.8232)', () => {
  // easeOutCubic(0.5) = 1 - 0.5^2.5 = 1 - 0.1768 = 0.8232
  const eased = easeOutCubic(0.5);
  const flash = phaseFlashAmount(eased);
  // flash 在 0.8232 位置: sin(π*0.8232) = sin(2.586) ≈ 0.527
  // 0.3 * 0.527 = 0.158
  assert.ok(flash > 0.15 && flash < 0.17, `got ${flash}`);
});

test('S2.22: phaseFlashAmount 接 ease-in progress (easeInCubic(0.5) ≈ 0.1768)', () => {
  // easeInCubic(0.5) = 0.5^2.5 = 0.1768
  const eased = easeInCubic(0.5);
  const flash = phaseFlashAmount(eased);
  // sin(π*0.1768) ≈ sin(0.555) ≈ 0.527, 跟 ease-out 0.5 算 0.8232 时 同 0.527 (sin 对称)
  // 0.3 * 0.527 = 0.158
  assert.ok(flash > 0.15 && flash < 0.17, `got ${flash}`);
});

test('S2.22: phaseFlashAmount 接 ease-in-out progress (easeInOutCubic(0.5) = 0.5)', () => {
  const eased = easeInOutCubic(0.5);
  const flash = phaseFlashAmount(eased);
  // eased = 0.5 仍峰值 0.3
  assert.equal(eased, 0.5);
  assert.equal(flash, PHASE_FLASH_AMPLITUDE);
});

test('S2.22: phaseFlashAmount 边界 (ease-out 0/1) 仍归零', () => {
  // easeOutCubic(0) = 0, easeOutCubic(1) = 1, 边界 0
  assert.equal(phaseFlashAmount(easeOutCubic(0)), 0);
  assert.equal(phaseFlashAmount(easeOutCubic(1)), 0);
  assert.equal(phaseFlashAmount(easeInCubic(0)), 0);
  assert.equal(phaseFlashAmount(easeInCubic(1)), 0);
  assert.equal(phaseFlashAmount(easeInOutCubic(0)), 0);
  // easeInOutCubic(1) = 1 - 0.5 * 0^2.5 = 1, flash 边界 = 0 (phaseFlashAmount(>=1) → 0)
  assert.equal(phaseFlashAmount(easeInOutCubic(1)), 0);
});

// ===== 6-10: 跟 linear 调用对比 =====
test('S2.22: flash 在 4 种 easing 下都不破坏 [0, 0.3] 范围', () => {
  const samples = [0.1, 0.25, 0.5, 0.75, 0.9];
  for (const x of samples) {
    const flashLinear = phaseFlashAmount(x);
    assert.ok(flashLinear >= 0 && flashLinear <= PHASE_FLASH_AMPLITUDE, `linear ${x}: ${flashLinear}`);

    for (const t of [EasingType.LINEAR, EasingType.EASE_OUT, EasingType.EASE_IN, EasingType.EASE_IN_OUT]) {
      const eased = applyEasing(x, t);
      const flashEased = phaseFlashAmount(eased);
      assert.ok(flashEased >= 0 && flashEased <= PHASE_FLASH_AMPLITUDE, `${t} ${x} (eased=${eased.toFixed(3)}): ${flashEased}`);
    }
  }
});

test('S2.22: linear vs ease-out flash 峰值位置不同 (linear 0.5, ease-out ~0.5)', () => {
  // linear 峰值在 x=0.5
  // ease-out 峰值位置: derivative sin(π*eas(x)) = cos(π*eas(x)) * π * eas'(x)
  //   ease-out derivative: 2.5*(1-x)^1.5
  //   峰值 when cos(π*eas(x)) = 0, 即 π*eas(x) = π/2, 即 eas(x) = 0.5
  //   1 - (1-x)^2.5 = 0.5 → (1-x)^2.5 = 0.5 → 1-x = 0.5^(1/2.5) ≈ 0.758
  //   x ≈ 0.242
  //   所以 ease-out flash 峰值在 x ≈ 0.242
  const xPeak_easeout = 0.242;
  const flash_easeout_peak = phaseFlashAmount(applyEasing(xPeak_easeout, EasingType.EASE_OUT));
  assert.ok(flash_easeout_peak > 0.29, `ease-out peak ${flash_easeout_peak} 应该接近 0.3`);

  // 跟 linear 对照
  const flash_linear_050 = phaseFlashAmount(0.5);
  const flash_linear_024 = phaseFlashAmount(0.242);
  // ease-out 在 0.242 时 flash 接近 0.3
  assert.ok(flash_easeout_peak > flash_linear_024);
});

test('S2.22: ease-in flash 峰值位置偏后 (x ≈ 0.758)', () => {
  const xPeak_easein = 0.758;
  const flash_easein_peak = phaseFlashAmount(applyEasing(xPeak_easein, EasingType.EASE_IN));
  // ease-in 峰值也接近 0.3 (sin 在 0.5 位置峰值, 跟 linear 同步, 但 x 位置不同)
  assert.ok(flash_easein_peak > 0.29, `ease-in peak ${flash_easein_peak} 应该接近 0.3`);
});

test('S2.22: shouldApplyPhaseFlash 跟 linear/eased 输入无关 (阈值固定)', () => {
  // 阈值 PHASE_FLASH_THRESHOLD = 0.001
  // 任何 flash > 0.001 都应用
  assert.equal(shouldApplyPhaseFlash(0), false);
  assert.equal(shouldApplyPhaseFlash(0.0005), false);
  assert.equal(shouldApplyPhaseFlash(0.002), true);
  // eased 0.5 = 0.3, 应用
  assert.equal(shouldApplyPhaseFlash(phaseFlashAmount(0.5)), true);
  // eased 0.99 接近 0 但 > 阈值
  assert.equal(shouldApplyPhaseFlash(phaseFlashAmount(0.99)), true);
});

test('S2.22: PHASE_FLASH_AMPLITUDE / THRESHOLD 常量未变', () => {
  assert.equal(PHASE_FLASH_AMPLITUDE, 0.3);
  assert.equal(PHASE_FLASH_THRESHOLD, 0.001);
});

// ===== 11-15: 源码静态分析 (确认 color lerp + flash 都走 getEasedPhaseProgress) =====
test('S2.22: thought-mesh.js _computePhaseColorMod 改用 getEasedPhaseProgress', () => {
  const src = readFileSync(join(REPO, 'src/v2/render/thought-mesh.js'), 'utf-8');
  // 应该用 thought.getEasedPhaseProgress() (S2.22) 而非 _applyPhaseEasing
  // 函数体内 should have getEasedPhaseProgress reference
  const fnStart = src.indexOf('_computePhaseColorMod(thought, trueColor)');
  const fnEnd = src.indexOf('_applyPhaseFlashMod(baseColor, progress)');
  const body = src.slice(fnStart, fnEnd);
  assert.ok(body.includes('thought.getEasedPhaseProgress'), 'color mod 应用 getEasedPhaseProgress');
  // 跟 v_scale 对齐
});

test('S2.22: thought-mesh.js _applyPhaseFlashMod 接 phaseProg (eased)', () => {
  const src = readFileSync(join(REPO, 'src/v2/render/thought-mesh.js'), 'utf-8');
  // 调用处应传 phaseProg (eased), 而非 linearProg
  assert.ok(src.includes('_applyPhaseFlashMod(resultColor, phaseProg)'),
    '_applyPhaseFlashMod 应接 phaseProg (eased) 而非 linearProg');
  // _applyPhaseFlashMod 函数定义应改名为 progress
  assert.ok(src.includes('_applyPhaseFlashMod(baseColor, progress)'),
    '_applyPhaseFlashMod 函数定义应改 progress');
});

test('S2.22: phase-flash.js 文档 + 参数改名 (linearProg → progress)', () => {
  const src = readFileSync(join(REPO, 'src/v2/render/phase-flash.js'), 'utf-8');
  // S2.22 段加
  assert.ok(src.includes('S2.22') || src.includes('S2.22:'),
    'phase-flash.js 应有 S2.22 注释段');
  // phaseFlashAmount 签名应接 progress 而非 linearProg
  const fnMatch = src.match(/export function phaseFlashAmount\(([^)]+)\)/);
  assert.ok(fnMatch, 'phaseFlashAmount 函数签名应存在');
  assert.ok(!fnMatch[1].includes('linear'),
    `phaseFlashAmount 不应接 linearProg, got: ${fnMatch[1]}`);
});

test('S2.22: thought-mesh.js 文档头加 S2.22 段', () => {
  const src = readFileSync(join(REPO, 'src/v2/render/thought-mesh.js'), 'utf-8');
  // 文档头应在 _computePhaseColorMod 函数体内提 S2.22 (注释或代码都可以)
  const fnStart = src.indexOf('_computePhaseColorMod(thought, trueColor)');
  const fnEnd = src.indexOf('  _applyPhaseFlashMod(', fnStart);
  const fn = src.slice(fnStart, fnEnd);
  assert.ok(/S2\.22/.test(fn), 'S2.22 段应加在 _computePhaseColorMod 函数体内');
});

test('S2.22: 4 种 easing 都通过 phase-flash 边界检查', () => {
  // 模拟 4 种 easing 下 progress 0/1 都返 0 flash
  for (const t of [EasingType.LINEAR, EasingType.EASE_OUT, EasingType.EASE_IN, EasingType.EASE_IN_OUT]) {
    assert.equal(phaseFlashAmount(applyEasing(0, t)), 0, `${t} 0`);
    assert.equal(phaseFlashAmount(applyEasing(1, t)), 0, `${t} 1`);
  }
});

// ===== 16-18: 端到端同步验证 =====
test('S2.22: EASE_OUT 同步验证 (color lerp 跟 flash 同步推进)', () => {
  // S2.19 之后, 4 种 easing 下 color 跟 flash 都用 eased progress
  // EASE_OUT 下: linearProg=0.3 → eased=1-0.7^2.5=0.592
  const linearProg = 0.3;
  const eased = applyEasing(linearProg, EasingType.EASE_OUT);
  const flash = phaseFlashAmount(eased);
  // sin(π*0.592) = sin(1.86) ≈ 0.961 → 0.3 * 0.961 ≈ 0.288
  assert.ok(flash > 0.28 && flash < 0.30, `EASE_OUT 0.3: flash=${flash}`);
  // S2.22 前: linearProg 0.3 → sin(π*0.3) = 0.809, flash = 0.243
  const flash_old = phaseFlashAmount(linearProg);
  assert.notEqual(flash, flash_old, `S2.22 后 flash 应跟 linear 不同 (${flash} vs ${flash_old})`);
});

test('S2.22: EASE_IN 同步验证 (color lerp 跟 flash 都后倾)', () => {
  // EASE_IN 下: linearProg=0.3 → eased=0.3^2.5=0.049, flash 起点
  const linearProg = 0.3;
  const eased = applyEasing(linearProg, EasingType.EASE_IN);
  const flash = phaseFlashAmount(eased);
  // sin(π*0.049) ≈ 0.154 → 0.3 * 0.154 ≈ 0.046
  assert.ok(flash > 0.04 && flash < 0.06, `EASE_IN 0.3: flash=${flash}`);
  // EASE_IN 后半段更亮
  const linearProg75 = 0.75;
  const eased75 = applyEasing(linearProg75, EasingType.EASE_IN);
  const flash75 = phaseFlashAmount(eased75);
  assert.ok(flash75 > flash, `EASE_IN 0.75 应比 0.3 更亮: 0.3=${flash} 0.75=${flash75}`);
});

test('S2.22: EASE_IN_OUT 跟 LINEAR 同步验证 (峰位都 0.5)', () => {
  // EASE_IN_OUT + LINEAR 都在 progress=0.5 时 flash 峰值
  for (const t of [EasingType.LINEAR, EasingType.EASE_IN_OUT]) {
    const eased = applyEasing(0.5, t);
    const flash = phaseFlashAmount(eased);
    assert.equal(flash, PHASE_FLASH_AMPLITUDE, `${t} 0.5 峰位 flash 应 = 0.3, got ${flash}`);
  }
});
