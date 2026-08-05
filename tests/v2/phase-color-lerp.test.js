/**
 * Phase Color Lerp 测试 (S2.17)
 *
 * 注意: THREE.Color r/g/b 是 sRGB 转换后的值 (0~1), 不是 0xRR/255 的直读
 *   - 0x808080 (gray) 实际: r=g=b=0.216 (linear→sRGB)
 *   - 0xc9d6ea (TEMP_NEUTRAL) 实际: r=0.584, g=0.672, b=0.823
 *   - 0x4a90e2 (TEMP_COLD) 实际: r=0.068, g=0.279, b=0.760
 *
 * 验证:
 *   1. _computePhaseColorMod: SEED+progress=0 → 纯灰 (sRGB 0.216)
 *   2. _computePhaseColorMod: SEED+progress=1 → 真温度色 (跟 trueColor 一致)
 *   3. _computePhaseColorMod: CRYSTAL+progress=0.5 → 真温度色 (非 SEED, 不 lerp)
 *   4. _computePhaseColorMod: MEMORY+progress=0.5 → 真温度色 (非 SEED, 不 lerp)
 *   5. _computePhaseColorMod: SEED+progress=0.5 → gray*0.177 + trueColor*0.823 (eased 0.823)
 *   6. _computePhaseColorMod: SEED+progress=0.1 → gray*0.768 + trueColor*0.232 (eased 0.232)
 *   7. _computePhaseColorMod: SEED+progress=0.9 → gray*0.001 + trueColor*0.999 (eased 0.999)
 *   8. _computePhaseColorMod: 跟 _computePhaseScaleMod 同步 (eased prog 一致)
 *   9. _writeInstance: _tempColor.copy 后跟 _computePhaseColorMod 结果一致
 *  10. 集成: temperature=0 (蓝) + SEED+progress=0 → 灰色 (非蓝色)
 *
 * 配套: src/v2/render/thought-mesh.js (S2.17 _computePhaseColorMod + PHASE_GRAY_COLOR)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThoughtMeshRenderer,
  temperatureToColor,
} from '../../src/v2/render/thought-mesh.js';
import {
  Thought,
  ThoughtPhase,
} from '../../src/v2/core/thought.js';

function makeScene() {
  return {
    add: () => {},
    remove: () => {},
  };
}

function makeThought({ phase = ThoughtPhase.SEED, progress = 0, content = 'test' } = {}) {
  const t = new Thought({
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    content,
    layerId: 'default-layer',
    position: { vertical: 0.5, radial: 0.4, orbital: 0 },
  });
  // S2.17: 总是覆盖 _transient, 避免 new Thought 默认 phase=CRYSTAL 影响测试
  t._transient = t._transient || {};
  t._transient.currentPhase = phase;
  t._transient.phaseTransitionProgress = progress;
  // S2.25: 锁定振幅 0.3 (跟 phase-flash-color-lerp-integration.test.js 同步修)
  //   避免 S2.23 查表变更 (SEED→CRYSTAL=0.4) 导致测试期望硬编码 0.3 错位
  t.config = { ...t.config, flashAmplitudeOverride: 0.3 };
  return t;
}

let renderer;
const PHASE_GRAY = new THREE.Color(0x808080);  // sRGB converted: r=g=b=0.216

beforeEach(() => {
  renderer = Object.create(ThoughtMeshRenderer.prototype);
});

describe('S2.17 _computePhaseColorMod 基础', () => {
  it('1. SEED + progress=0 → 纯灰 (R=G=B=0.216, sRGB converted)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // PHASE_GRAY_COLOR = 0x808080, sRGB 后 r=g=b=0.216
    expect(result.r).toBeCloseTo(PHASE_GRAY.r, 2);
    expect(result.g).toBeCloseTo(PHASE_GRAY.g, 2);
    expect(result.b).toBeCloseTo(PHASE_GRAY.b, 2);
  });

  it('2. SEED + progress=1 → 真温度色 (跟 trueColor 一致)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });

  // S2.21: _computePhaseColorMod 链路 (S2.17 gray lerp + S2.20 flash) — expected 考虑 flash
  it('3. CRYSTAL + progress=0.5 → trueColor + 30% flash 偏白 (S2.17 不 lerp, S2.20 flash 加白)', () => {
    const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // S2.22: flash 用 eased progress, easeOutCubic(0.5) = 0.823
    //   flash = 0.3 * sin(π*0.823) ≈ 0.227 (跟 S2.21 旧 0.3 不同)
    const eased = 1 - Math.pow(0.5, 2.5);  // 0.8232
    const flash = 0.3 * Math.sin(Math.PI * eased);
    const WHITE = new THREE.Color(1, 1, 1);
    const expected = trueColor.clone().lerp(WHITE, flash);
    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });

  it('4. MEMORY + progress=0.5 → trueColor + flash 偏白 (S2.22 flash 用 eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.MEMORY, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // S2.22: flash 用 eased, easeOutCubic(0.5) = 0.823
    const eased = 1 - Math.pow(0.5, 2.5);  // 0.8232
    const flash = 0.3 * Math.sin(Math.PI * eased);
    const WHITE = new THREE.Color(1, 1, 1);
    const expected = trueColor.clone().lerp(WHITE, flash);
    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });
});

describe('S2.17 _computePhaseColorMod 缓动串联 (eased 0.823 / 0.232 / 0.999)', () => {
  // S2.21: expected = gray lerp (S2.17) + flash 0.3*sin(π*prog) (S2.20)
  it('5. SEED + progress=0.5 → gray*0.177 + trueColor*0.823 + flash 0.3 偏白', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    // 极端 trueColor (0=蓝) 方便验证
    const trueColor = new THREE.Color(0x4a90e2);  // TEMP_COLD, sRGB: r=0.068 g=0.279 b=0.760
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // S2.22: flash 用 eased, easeOutCubic(0.5) = 0.823
    //   flash = 0.3 * sin(π*0.823) ≈ 0.227
    const eased = 1 - Math.pow(0.5, 2.5);  // 0.8232
    const flash = 0.3 * Math.sin(Math.PI * eased);
    const WHITE = new THREE.Color(1, 1, 1);
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const expected_r = grayLerped.r * (1 - flash) + WHITE.r * flash;
    expect(result.r).toBeCloseTo(expected_r, 3);
  });

  it('6. SEED + progress=0.1 → gray*0.768 + trueColor*0.232 + flash 早段 (eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.1 });
    const trueColor = new THREE.Color(0x4a90e2);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // S2.22: flash 用 eased, easeOutCubic(0.1) = 0.232
    //   flash = 0.3 * sin(π*0.232) ≈ 0.211 (跟 S2.21 旧 0.093 不同, 反而更亮)
    const eased = 1 - Math.pow(0.9, 2.5);  // 0.2316
    const flash = 0.3 * Math.sin(Math.PI * eased);
    const WHITE = new THREE.Color(1, 1, 1);
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const expected_r = grayLerped.r * (1 - flash) + WHITE.r * flash;
    expect(result.r).toBeCloseTo(expected_r, 3);
  });

  it('7. SEED + progress=0.9 → gray*0.003 + trueColor*0.997 + flash 偏白 (eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.9 });
    // 用中性温度色 (R=0.584) 跟 gray (R=0.216) 差 0.368, 大于 0.3 验证
    const trueColor = temperatureToColor(0.5);  // 中性 sRGB: r=0.584
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // S2.22: flash 用 eased, easeOutCubic(0.9) = 0.997
    //   flash = 0.3 * sin(π*0.997) ≈ 0.003 (边界)
    const eased = 1 - Math.pow(0.1, 2.5);  // 0.997
    const flash = 0.3 * Math.sin(Math.PI * eased);
    const WHITE = new THREE.Color(1, 1, 1);
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const expected_r = grayLerped.r * (1 - flash) + WHITE.r * flash;
    expect(result.r).toBeCloseTo(expected_r, 3);
    // 验证: 几乎全是真色, 跟 gray 差很大 (> 0.3)
    expect(Math.abs(result.r - PHASE_GRAY.r)).toBeGreaterThan(0.3);
  });
});

describe('S2.17 _computePhaseColorMod 跟 _computePhaseScaleMod 同步', () => {
  it('8. SEED+progress=0.5: color lerp 系数 跟 scale 缓动值一致 (eased 0.823) + flash (eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    // scaleMod = easeOutCubic(0.5) ≈ 0.823 (S2.16)
    const scaleMod = renderer._computePhaseScaleMod(thought);
    expect(scaleMod).toBeCloseTo(0.823, 2);
    
    // S2.22: flash 用 eased, 跟 scale 同步 (都用 scaleMod 作 flash 输入)
    // flash = 0.3 * sin(π*0.823) ≈ 0.227
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    const WHITE = new THREE.Color(1, 1, 1);
    const flash = 0.3 * Math.sin(Math.PI * scaleMod);
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - scaleMod);
    const expected_r = grayLerped.r * (1 - flash) + WHITE.r * flash;
    expect(result.r).toBeCloseTo(expected_r, 3);
  });
});

describe('S2.17 _writeInstance 集成 (温度=0 蓝 + SEED+progress=0 → 灰)', () => {
  it('9. 完整 writeInstance 调用: _tempColor 是灰色而非蓝色', () => {
    const realRenderer = new ThoughtMeshRenderer({ scene: makeScene() });
    const thought = new Thought({
      id: 'temp-test',
      content: 'cold',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      metadata: { temperature: 0 },
    });
    thought._transient = { currentPhase: ThoughtPhase.SEED, phaseTransitionProgress: 0 };
    
    realRenderer.upsert(thought);
    // 验证 _tempColor: SEED 起步应该是灰色 (0.216), 不是蓝 (0.068)
    expect(realRenderer._tempColor.r).toBeCloseTo(PHASE_GRAY.r, 2);
    expect(realRenderer._tempColor.g).toBeCloseTo(PHASE_GRAY.g, 2);
    expect(realRenderer._tempColor.b).toBeCloseTo(PHASE_GRAY.b, 2);
  });

  it('10. temperature=0 + SEED+progress=1 → 真色 (蓝, sRGB R=0.068 G=0.279 B=0.760)', () => {
    const realRenderer = new ThoughtMeshRenderer({ scene: makeScene() });
    const thought = new Thought({
      id: 'temp-test-2',
      content: 'cold',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      metadata: { temperature: 0 },
    });
    thought._transient = { currentPhase: ThoughtPhase.SEED, phaseTransitionProgress: 1 };
    realRenderer.upsert(thought);
    // SEED+1 应该是真温度色 (冷蓝 TEMP_COLD_COLOR = 0x4a90e2, sRGB R=0.068 G=0.279 B=0.760)
    const trueColor = new THREE.Color(0x4a90e2);
    expect(realRenderer._tempColor.r).toBeCloseTo(trueColor.r, 2);
    expect(realRenderer._tempColor.g).toBeCloseTo(trueColor.g, 2);
    expect(realRenderer._tempColor.b).toBeCloseTo(trueColor.b, 2);
  });
});
