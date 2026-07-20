/**
 * Phase Color Lerp 测试 (S2.17)
 *
 * 验证:
 *   1. _computePhaseColorMod: SEED+progress=0 → 纯灰 (RGB ≈ 0.5, 0.5, 0.5)
 *   2. _computePhaseColorMod: SEED+progress=1 → 真温度色 (跟 trueColor 一致)
 *   3. _computePhaseColorMod: CRYSTAL+progress=0.5 → 真温度色 (非 SEED, 不 lerp)
 *   4. _computePhaseColorMod: MEMORY+progress=0.5 → 真温度色 (非 SEED, 不 lerp)
 *   5. _computePhaseColorMod: SEED+progress=0.5 → gray*0.177 + trueColor*0.823 (eased 0.823)
 *   6. _computePhaseColorMod: SEED+progress=0.1 → gray*0.768 + trueColor*0.232 (eased 0.232)
 *   7. _computePhaseColorMod: SEED+progress=0.9 → gray*0.001 + trueColor*0.999 (eased 0.999, 几乎全色)
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
  if (phase !== ThoughtPhase.SEED || progress !== 0) {
    t._transient = t._transient || {};
    t._transient.currentPhase = phase;
    t._transient.phaseTransitionProgress = progress;
  }
  return t;
}

let renderer;

beforeEach(() => {
  renderer = Object.create(ThoughtMeshRenderer.prototype);
});

describe('S2.17 _computePhaseColorMod 基础', () => {
  it('1. SEED + progress=0 → 纯灰 (R=G=B=0.502)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0 });
    const trueColor = temperatureToColor(0.5);  // 中性色
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // PHASE_GRAY_COLOR = 0x808080, r=g=b=128/255=0.502
    expect(result.r).toBeCloseTo(0.502, 2);
    expect(result.g).toBeCloseTo(0.502, 2);
    expect(result.b).toBeCloseTo(0.502, 2);
  });

  it('2. SEED + progress=1 → 真温度色 (跟 trueColor 一致)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });

  it('3. CRYSTAL + progress=0.5 → 真温度色 (非 SEED, 不 lerp)', () => {
    const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });

  it('4. MEMORY + progress=0.5 → 真温度色 (非 SEED, 不 lerp)', () => {
    const thought = makeThought({ phase: ThoughtPhase.MEMORY, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });
});

describe('S2.17 _computePhaseColorMod 缓动串联 (eased 0.823 / 0.232 / 0.999)', () => {
  it('5. SEED + progress=0.5 → gray*0.177 + trueColor*0.823 (eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    // 极端 trueColor (0=蓝) 方便验证
    const trueColor = new THREE.Color(0x4a90e2);  // TEMP_COLD
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // easeOutCubic(0.5) ≈ 0.823
    // r = trueColor.r * 0.823 + gray.r * (1 - 0.823) = trueColor.r * 0.823 + 0.502 * 0.177
    const expected_r = trueColor.r * 0.823 + 0.502 * 0.177;
    expect(result.r).toBeCloseTo(expected_r, 3);
  });

  it('6. SEED + progress=0.1 → gray*0.768 + trueColor*0.232 (eased 前段快)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.1 });
    const trueColor = new THREE.Color(0x4a90e2);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // easeOutCubic(0.1) ≈ 0.232 (10% 输入 → 23% 输出)
    // r = trueColor.r * 0.232 + 0.502 * 0.768 ≈ 0.16 + 0.386 ≈ 0.546
    const expected_r = trueColor.r * 0.232 + 0.502 * 0.768;
    expect(result.r).toBeCloseTo(expected_r, 3);
  });

  it('7. SEED + progress=0.9 → gray*0.001 + trueColor*0.999 (eased 后段慢, 几乎全色)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.9 });
    const trueColor = new THREE.Color(0x4a90e2);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    // easeOutCubic(0.9) ≈ 0.999 (90% 输入 → 99.9% 输出, 几乎完成)
    const expected_r = trueColor.r * 0.999 + 0.502 * 0.001;
    expect(result.r).toBeCloseTo(expected_r, 3);
    // 验证: 几乎全是真色, 跟 gray 差很大
    expect(Math.abs(result.r - 0.502)).toBeGreaterThan(0.3);
  });
});

describe('S2.17 _computePhaseColorMod 跟 _computePhaseScaleMod 同步', () => {
  it('8. SEED+progress=0.5: color lerp 系数 跟 scale 缓动值一致 (eased 0.823)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    // scaleMod = easeOutCubic(0.5) ≈ 0.823 (S2.16)
    const scaleMod = renderer._computePhaseScaleMod(thought);
    expect(scaleMod).toBeCloseTo(0.823, 2);
    
    // 验证: 颜色 lerp 系数 (1 - 1*0.823 + 0.823*0) = ... 
    // 实际: color = trueColor * scaleMod + gray * (1 - scaleMod)
    //      = trueColor * 0.823 + 0.502 * 0.177
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    const expected_r = trueColor.r * scaleMod + 0.502 * (1 - scaleMod);
    expect(result.r).toBeCloseTo(expected_r, 4);
  });
});

describe('S2.17 _writeInstance 集成 (温度=0 蓝 + SEED+progress=0 → 灰)', () => {
  it('9. 完整 writeInstance 调用: _tempColor 是灰色而非蓝色', () => {
    // mock minimal renderer (不跑完整 Three.js)
    const realRenderer = new ThoughtMeshRenderer({ scene: makeScene() });
    // 设 thought temperature=0 (蓝色)
    const thought = new Thought({
      id: 'temp-test',
      content: 'cold',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      metadata: { temperature: 0 },  // 0 = 冷
    });
    thought._transient = { currentPhase: ThoughtPhase.SEED, phaseTransitionProgress: 0 };
    
    realRenderer.upsert(thought);
    // 验证 _tempColor: SEED 起步应该是灰色 (0.502), 不是蓝 (0.29)
    expect(realRenderer._tempColor.r).toBeCloseTo(0.502, 2);
    expect(realRenderer._tempColor.g).toBeCloseTo(0.502, 2);
    expect(realRenderer._tempColor.b).toBeCloseTo(0.502, 2);
  });

  it('10. temperature=0 + SEED+progress=1 → 真色 (蓝, R=0.29 G=0.565 B=0.886)', () => {
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
    // SEED+1 应该是真温度色 (冷蓝 TEMP_COLD_COLOR = 0x4a90e2)
    // r=74/255=0.29, g=144/255=0.565, b=226/255=0.886
    expect(realRenderer._tempColor.r).toBeCloseTo(0.29, 2);
    expect(realRenderer._tempColor.g).toBeCloseTo(0.565, 2);
    expect(realRenderer._tempColor.b).toBeCloseTo(0.886, 2);
  });
});
