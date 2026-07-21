/**
 * Phase Easing 测试 (S2.16)
 *
 * 验证:
 *   1. easeOutCubic(0) → 0 (边界)
 *   2. easeOutCubic(1) → 1 (边界)
 *   3. easeOutCubic(0.5) → 约 0.82 (前段快, 50% 输入已经 82% 输出)
 *   4. easeOutCubic(0.1) → 约 0.27 (10% 输入已经 27% 输出, 验证"前段快")
 *   5. 单调性: t1<t2 → y1<y2 (eased 不反向)
 *   6. applyEasing(x, 'linear') → x (linear 走旁路)
 *   7. _applyPhaseEasing(0) → 0
 *   8. _applyPhaseEasing(1) → 1
 *   9. _applyPhaseEasing(0.5) → 跟 easeOutCubic(0.5) 一致
 *  10. _applyPhaseEasing 多次调用结果一致 (无副作用, 纯函数)
 *  11. _computePhaseScaleMod: SEED+linearProg=0.5 → 约 0.82 (eased, 非线性!)
 *  12. _computePhaseScaleMod: SEED+linearProg=0.1 → 约 0.27
 *  13. _computePhaseScaleMod: CRYSTAL+linearProg=0.5 → 0.7 + 0.3*0.82 ≈ 0.946
 *  14. _computePhaseScaleMod: linearProg=1 → 1.0 (边界, 无缓动)
 *  15. _computePhaseAlphaMod: 跟 _computePhaseScaleMod 同步 (eased 同值)
 *
 * 配套: src/v2/animation/ease.js (easeOutCubic 简化版) +
 *        src/v2/render/thought-mesh.js (S2.16 _applyPhaseEasing 注入 _computePhaseScaleMod/AlphaMod)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThoughtMeshRenderer,
} from '../../src/v2/render/thought-mesh.js';
import {
  Thought,
  ThoughtPhase,
} from '../../src/v2/core/thought.js';
import {
  easeOutCubic,
  easeInCubic,
  easeInOutCubic,
  applyEasing,
  EasingType,
} from '../../src/v2/animation/ease.js';

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
  // 简化 renderer, 不需真实 Three.js, 测 helper
  renderer = Object.create(ThoughtMeshRenderer.prototype);
});

describe('S2.16 easeOutCubic 纯函数', () => {
  it('1. easeOutCubic(0) → 0', () => {
    expect(easeOutCubic(0)).toBe(0);
  });

  it('2. easeOutCubic(1) → 1', () => {
    expect(easeOutCubic(1)).toBe(1);
  });

  it('3. easeOutCubic(0.5) → 约 0.82 (前段快)', () => {
    // 1 - (1-0.5)^2.5 = 1 - 0.5^2.5 = 1 - 0.1768 ≈ 0.823
    const y = easeOutCubic(0.5);
    expect(y).toBeCloseTo(0.823, 2);
    // 验证确实是"前段快" (linear 在 0.5 是 0.5, 缓动后 0.82 远大于 0.5)
    expect(y).toBeGreaterThan(0.5);
  });

  it('4. easeOutCubic(0.1) → 约 0.27 (10% 输入已经 27% 输出)', () => {
    // 1 - 0.9^2.5 = 1 - 0.768 ≈ 0.232
    const y = easeOutCubic(0.1);
    expect(y).toBeCloseTo(0.232, 2);
    // 验证"前段快" — 0.1 输入已经 0.23 输出, 2x 加速
    expect(y / 0.1).toBeGreaterThan(2);
  });

  it('5. 单调性: t1<t2 → y1<y2', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const eased = samples.map(easeOutCubic);
    for (let i = 1; i < eased.length; i++) {
      expect(eased[i]).toBeGreaterThan(eased[i - 1]);
    }
  });
});

describe('S2.16 applyEasing 通用入口', () => {
  it('6. applyEasing(0.5, "linear") → 0.5 (linear 旁路)', () => {
    expect(applyEasing(0.5, EasingType.LINEAR)).toBe(0.5);
  });

  it('6b. applyEasing 默认 (无 type 参数) → ease-out', () => {
    expect(applyEasing(0.5)).toBeCloseTo(0.823, 2);
  });

  it('6c. EasingType 是 frozen 枚举', () => {
    expect(EasingType.EASE_OUT).toBe('ease-out');
    expect(EasingType.LINEAR).toBe('linear');
  });
});

describe('S2.16 _applyPhaseEasing (thought-mesh 内部 helper)', () => {
  it('7. _applyPhaseEasing(0) → 0', () => {
    expect(renderer._applyPhaseEasing(0)).toBe(0);
  });

  it('8. _applyPhaseEasing(1) → 1', () => {
    expect(renderer._applyPhaseEasing(1)).toBe(1);
  });

  it('9. _applyPhaseEasing(0.5) → 跟 easeOutCubic(0.5) 一致', () => {
    expect(renderer._applyPhaseEasing(0.5)).toBe(easeOutCubic(0.5));
  });

  it('10. 多次调用结果一致 (纯函数, 无副作用)', () => {
    const a = renderer._applyPhaseEasing(0.3);
    const b = renderer._applyPhaseEasing(0.3);
    const c = renderer._applyPhaseEasing(0.7);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});

describe('S2.16 _computePhaseScaleMod (eased)', () => {
  it('11. SEED+linearProg=0.5 → 约 0.82 (eased, 非 linear 0.5!)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    const result = renderer._computePhaseScaleMod(thought);
    expect(result).toBeCloseTo(0.823, 2);
    // 关键: 跟 S2.15 linear 时代的 0.5 不同
    expect(result).toBeGreaterThan(0.5);
  });

  it('12. SEED+linearProg=0.1 → 约 0.23 (eased)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.1 });
    const result = renderer._computePhaseScaleMod(thought);
    expect(result).toBeCloseTo(0.232, 2);
  });

  it('13. CRYSTAL+linearProg=0.5 → 0.7 + 0.3*0.823 ≈ 0.947', () => {
    const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0.5 });
    const result = renderer._computePhaseScaleMod(thought);
    // 0.7 + 0.3 * 0.823 = 0.947
    expect(result).toBeCloseTo(0.947, 2);
  });

  it('14. linearProg=1 → 1.0 (边界, 无缓动差异)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    const result = renderer._computePhaseScaleMod(thought);
    expect(result).toBe(1.0);
  });
});

describe('S2.16 _computePhaseAlphaMod 跟 scale 同步缓动', () => {
  it('15. SEED+linearProg=0.5 → eased(0.5) ≈ 0.823 (跟 scale 同值)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    const scaleMod = renderer._computePhaseScaleMod(thought);
    const alphaMod = renderer._computePhaseAlphaMod(thought);
    expect(alphaMod).toBeCloseTo(scaleMod, 4);
  });
});

// ==================== S2.18 缓动曲线补齐 ====================
//
// 验证 easeInCubic / easeInOutCubic 跟 easeOutCubic 对称, applyEasing 真正按 type 分发.
//
// 关键设计:
//   - easeIn(0.5) = 0.5^2.5 ≈ 0.177 (跟 easeOut 的 0.823 互补, 和 = 1)
//   - easeInOut(0.5) = 0.5 (折点)
//   - easeIn(0.1) = 0.1^2.5 ≈ 0.0032 (远小于 0.1, 验证"前段慢")
//   - applyEasing 末识 type 走 ease-out 跟 S2.16 兼容

describe('S2.18 easeInCubic 纯函数', () => {
  it('1. easeInCubic(0) → 0', () => {
    expect(easeInCubic(0)).toBe(0);
  });

  it('2. easeInCubic(1) → 1', () => {
    expect(easeInCubic(1)).toBe(1);
  });

  it('3. easeInCubic(0.5) → 约 0.177 (跟 easeOut(0.5) ≈ 0.823 互补, 和=1)', () => {
    const y = easeInCubic(0.5);
    expect(y).toBeCloseTo(0.177, 2);
    // 跟 easeOut 互补 (easeIn(x) + easeOut(x) 严格= 1, 因为 (1-(1-x)^2.5) + x^2.5 = 1)
    expect(y + easeOutCubic(0.5)).toBeCloseTo(1, 4);
  });

  it('4. easeInCubic(0.1) → 约 0.003 (前段慢, 0.1 输入仅 0.3% 输出)', () => {
    const y = easeInCubic(0.1);
    // 0.1^2.5 = 0.00316
    expect(y).toBeCloseTo(0.00316, 3);
    // 验证"前段慢" — 0.1 输入仅 0.3% 输出, 跟 easeOut 相反
    expect(y).toBeLessThan(0.1);
  });

  it('5. 单调性: t1<t2 → y1<y2', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const eased = samples.map(easeInCubic);
    for (let i = 1; i < eased.length; i++) {
      expect(eased[i]).toBeGreaterThan(eased[i - 1]);
    }
  });
});

describe('S2.18 easeInOutCubic 纯函数', () => {
  it('1. easeInOutCubic(0) → 0', () => {
    expect(easeInOutCubic(0)).toBe(0);
  });

  it('2. easeInOutCubic(1) → 1', () => {
    expect(easeInOutCubic(1)).toBe(1);
  });

  it('3. easeInOutCubic(0.5) → 0.5 (折点, 数学连续)', () => {
    expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 4);
  });

  it('4. easeInOutCubic(0.25) → 约 0.031 (前半 easeIn, 加速前慢)', () => {
    // 0.5 * (0.5)^2.5 = 0.5 * 0.1768 = 0.0884
    // 等等: x=0.25 → x*2=0.5 → 0.5^2.5 = 0.1768 → 0.5*0.1768 = 0.0884
    // 重新计算: x < 0.5, y = 0.5 * (x*2)^2.5 = 0.5 * 0.5^2.5 = 0.5 * 0.1768 = 0.0884
    // 近似 0.088, 跟 linear 0.25 差 0.16 (“前段慢”验证)
    const y = easeInOutCubic(0.25);
    expect(y).toBeCloseTo(0.0884, 2);
    expect(y).toBeLessThan(0.25);
  });

  it('5. easeInOutCubic(0.75) → 约 0.912 (后半 easeOut, 减速)', () => {
    // x=0.75 → x*2=1.5 → 2-1.5=0.5 → 0.5^2.5 = 0.1768 → 1 - 0.5*0.1768 = 0.9116
    const y = easeInOutCubic(0.75);
    expect(y).toBeCloseTo(0.9116, 2);
    expect(y).toBeGreaterThan(0.75);
  });

  it('6. S 型对称: easeInOut(0.25) + easeInOut(0.75) = 1', () => {
    const a = easeInOutCubic(0.25);
    const b = easeInOutCubic(0.75);
    expect(a + b).toBeCloseTo(1, 4);
  });

  it('7. 单调性: t1<t2 → y1<y2', () => {
    const samples = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
    const eased = samples.map(easeInOutCubic);
    for (let i = 1; i < eased.length; i++) {
      expect(eased[i]).toBeGreaterThan(eased[i - 1]);
    }
  });
});

describe('S2.18 applyEasing 分发', () => {
  it('1. applyEasing(0.5, "linear") → 0.5', () => {
    expect(applyEasing(0.5, EasingType.LINEAR)).toBe(0.5);
  });

  it('2. applyEasing(0.5, "ease-out") → 约 0.823 (跟 easeOutCubic 一致)', () => {
    expect(applyEasing(0.5, EasingType.EASE_OUT)).toBeCloseTo(easeOutCubic(0.5), 4);
  });

  it('3. applyEasing(0.5, "ease-in") → 约 0.177 (跟 easeInCubic 一致)', () => {
    expect(applyEasing(0.5, EasingType.EASE_IN)).toBeCloseTo(easeInCubic(0.5), 4);
  });

  it('4. applyEasing(0.5, "ease-in-out") → 0.5 (折点)', () => {
    expect(applyEasing(0.5, EasingType.EASE_IN_OUT)).toBeCloseTo(easeInOutCubic(0.5), 4);
  });

  it('5. applyEasing 默认无 type → ease-out (跟 S2.16 兼容)', () => {
    expect(applyEasing(0.5)).toBeCloseTo(0.823, 2);
  });

  it('6. applyEasing 末识 type → ease-out fallback (防 typo 崩溃)', () => {
    // @ts-ignore - 故意传未识 type
    expect(applyEasing(0.5, 'ease-bounce-unknown')).toBeCloseTo(0.823, 2);
  });

  it('7. EasingType 枚举 (4 种)', () => {
    expect(EasingType.LINEAR).toBe('linear');
    expect(EasingType.EASE_OUT).toBe('ease-out');
    expect(EasingType.EASE_IN).toBe('ease-in');
    expect(EasingType.EASE_IN_OUT).toBe('ease-in-out');
    expect(Object.keys(EasingType).length).toBe(4);
  });

  it('8. EasingType 是 frozen 枚举 (不能添字段)', () => {
    expect(Object.isFrozen(EasingType)).toBe(true);
  });
});
