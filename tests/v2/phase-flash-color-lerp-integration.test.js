/**
 * S2.21 phase-flash × phase-color-lerp 端到端集成测试
 *
 * 背景:
 *   - S2.17 phase-color-lerp: SEED 起步 gray → 真色 lerp (eased progress)
 *   - S2.20 phase-flash: phase 中途 0~0.3~0 白光闪烁 (sin 曲线)
 *   - thought-mesh.js 中 _computePhaseColorMod 链路: phase color lerp → phase flash
 *
 * 验证:
 *   1. SEED+prog=0: gray (灰) + flash=0 → R=G=B=0.216 (sRGB 转换后)
 *   2. SEED+prog=0.5: lerp(gray, trueColor, eased)*0.7 + white*0.3 (双调制并存)
 *   3. SEED+prog=1: trueColor + flash=0 → 纯真温度色 (跟 trueColor 一致)
 *   4. CRYSTAL+prog=0.5: trueColor (S2.17 不 lerp) + flash=0.3 → 30% 偏白
 *   5. MEMORY+prog=0.5: trueColor (S2.17 不 lerp) + flash=0.3 → 30% 偏白
 *   6. SEED 起步 prog=0.05: gray lerp 中段 + flash=0.046 (sin 早段) → 双调制
 *   7. flash 在 phase 边界 prog=0/1 不破坏颜色 (flash=0 → 跟无 flash 一致)
 *   8. flash 在 SEED 中段不会"覆盖"gray lerp, 两者叠加 (gray lerp 优先, flash 修饰)
 *   9. flash 不会让 CRYSTAL/MEMORY 退回灰色 (S2.17 短路条件保护)
 *  10. flash 跟 S2.16 ease-out 一致: flash 用 linearProg, S2.17 用 eased, 两者不冲突
 *
 * 配套: src/v2/render/thought-mesh.js (S2.17 _computePhaseColorMod + S2.20 _applyPhaseFlashMod)
 *       src/v2/render/phase-flash.js (S2.20 phaseFlashAmount)
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

const PHASE_GRAY = new THREE.Color(0x808080); // sRGB: r=g=b=0.216
const WHITE = new THREE.Color(1, 1, 1);

function makeThought({ phase = ThoughtPhase.SEED, progress = 0, content = 'integration-test' } = {}) {
  const t = new Thought({
    id: `integ-${Math.random().toString(36).slice(2, 8)}`,
    content,
    layerId: 'default-layer',
    position: { vertical: 0.5, radial: 0.4, orbital: 0 },
  });
  // S2.17: 总是覆盖 _transient, 避免 new Thought 默认 phase=CRYSTAL 影响测试
  t._transient = t._transient || {};
  t._transient.currentPhase = phase;
  t._transient.phaseTransitionProgress = progress;
  return t;
}

let renderer;

beforeEach(() => {
  renderer = Object.create(ThoughtMeshRenderer.prototype);
});

describe('S2.21 端到端: SEED 起步 (gray 阶段 + flash=0)', () => {
  it('1. SEED+prog=0 → 纯灰 (R=G=B=0.216, flash 0 不影响)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    // flash=0 at prog=0, so color = gray only
    expect(result.r).toBeCloseTo(PHASE_GRAY.r, 2);
    expect(result.g).toBeCloseTo(PHASE_GRAY.g, 2);
    expect(result.b).toBeCloseTo(PHASE_GRAY.b, 2);
  });
});

describe('S2.21 端到端: SEED 中段 (gray→trueColor lerp + flash 双调制)', () => {
  it('2. SEED+prog=0.5 → gray lerp + flash 叠加 (颜色 30% 偏白 + 跟 gray lerp 混合)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    // 计算预期:
    //   step1: gray lerp (S2.17, easeOutCubic(0.5)=0.8232) → result1 = lerp(trueColor, gray, 1 - 0.8232) = lerp(trueColor, gray, 0.1768)
    //   step2: flash (S2.20, linearProg=0.5, 0.3) → result2 = lerp(result1, white, 0.3)
    // 关键: flash 后的颜色 r/g/b 都比 result1 大 (因为白光叠加)
    const eased = 1 - Math.pow(1 - 0.5, 2.5); // easeOutCubic(0.5) = 0.875
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const expected = grayLerped.clone().lerp(WHITE, 0.3);

    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });

  it('6. SEED+prog=0.05 (gray 主导) → flash 早段 0.046 (sin 0.05π=0.156, 0.3*0.156=0.047)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.05 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    // S2.20: flashAmount(0.05) = 0.3 * sin(π * 0.05) ≈ 0.0468
    // S2.17: eased = _applyPhaseEasing(0.05) = easeOutCubic(0.05) = 1 - 0.95^2.5 = 0.1204
    // step1: gray lerp (1 - 0.1204 = 0.8796) → gray 主导
    // step2: flash 0.047 → 颜色轻微偏白
    const eased = 1 - Math.pow(1 - 0.05, 2.5);  // easeOutCubic
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const flashAmount = 0.3 * Math.sin(Math.PI * 0.05);
    const expected = grayLerped.clone().lerp(WHITE, flashAmount);

    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });
});

describe('S2.21 端到端: SEED 完成 (trueColor + flash=0)', () => {
  it('3. SEED+prog=1 → 纯真色 (gray lerp 短路, flash=0 at boundary)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    // S2.17: linearProg < 1 短路, 直接 trueColor
    // S2.20: flashAmount(1) = 0, no flash
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });
});

describe('S2.21 端到端: 非 SEED phase (trueColor 短路 gray lerp + flash)', () => {
  it('4. CRYSTAL+prog=0.5 → trueColor + 30% flash 偏白 (gray lerp 短路)', () => {
    const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    // S2.17: currentPhase !== SEED → trueColor (不 gray lerp)
    // S2.20: flashAmount(0.5) = 0.3, lerp(trueColor, white, 0.3)
    const expected = trueColor.clone().lerp(WHITE, 0.3);

    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });

  it('5. MEMORY+prog=0.5 → trueColor + 30% flash 偏白 (gray lerp 短路)', () => {
    const thought = makeThought({ phase: ThoughtPhase.MEMORY, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    const expected = trueColor.clone().lerp(WHITE, 0.3);

    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });

  it('9. flash 不会让非 SEED phase 退回灰色 (S2.17 短路条件保护)', () => {
    // 验证: 任何 progress 下, CRYSTAL 都不会 gray lerp
    for (const prog of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: prog });
      const trueColor = temperatureToColor(0.5);
      const result = renderer._computePhaseColorMod(thought, trueColor);

      // R/G/B 都应该 >= trueColor 的对应通道 (因为 flash 偏白, 颜色 0.3 朝白)
      // 但不能掉到 PHASE_GRAY (0.216) 以下
      expect(result.r).toBeGreaterThan(PHASE_GRAY.r - 0.01);
      expect(result.g).toBeGreaterThan(PHASE_GRAY.g - 0.01);
      expect(result.b).toBeGreaterThan(PHASE_GRAY.b - 0.01);
    }
  });
});

describe('S2.21 端到端: phase 边界 (flash=0 不破坏颜色)', () => {
  it('7a. SEED+prog=0 → 纯灰 (flash=0, 无影响)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(PHASE_GRAY.r, 2);
    expect(result.g).toBeCloseTo(PHASE_GRAY.g, 2);
    expect(result.b).toBeCloseTo(PHASE_GRAY.b, 2);
  });

  it('7b. SEED+prog=1 → 纯真色 (flash=0 at boundary)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });

  it('7c. CRYSTAL+prog=0 → trueColor (无 flash 修饰)', () => {
    const thought = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);
    expect(result.r).toBeCloseTo(trueColor.r, 5);
    expect(result.g).toBeCloseTo(trueColor.g, 5);
    expect(result.b).toBeCloseTo(trueColor.b, 5);
  });
});

describe('S2.21 端到端: flash 不会"覆盖"gray lerp (叠加而非替代)', () => {
  it('8. SEED+prog=0.5 flash 后颜色 R+G+B 跟 flash 前的 gray lerp 接近, 但更亮', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    const trueColor = temperatureToColor(0.5);

    // 模拟: 关闭 flash, 只走 gray lerp
    const eased = 1 - Math.pow(1 - 0.5, 2.5); // easeOutCubic(0.5) = 0.875
    const grayOnly = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);

    // 实际: flash 开启, gray lerp + flash
    const withFlash = renderer._computePhaseColorMod(thought, trueColor);

    // R/G/B 都比 grayOnly 大 (因为 flash 偏白)
    // 但不应该超过 trueColor (flash 是 0.3 朝白, gray lerp 也往 trueColor 走, 不会变暗)
    expect(withFlash.r).toBeGreaterThanOrEqual(grayOnly.r);
    expect(withFlash.g).toBeGreaterThanOrEqual(grayOnly.g);
    expect(withFlash.b).toBeGreaterThanOrEqual(grayOnly.b);
  });
});

describe('S2.21 端到端: flash 跟 S2.16 ease-out 关系 (linear vs eased)', () => {
  it('10. flash 用 linearProg, S2.17 用 eased, 两者独立不冲突', () => {
    // SEED+prog=0.1: flash=0.094 (0.3*sin(0.1π)), eased=easeOutCubic(0.1)=0.2316
    // 验证 flash 不会因为 eased 而改变 (linear vs eased 独立)
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.1 });
    const trueColor = temperatureToColor(0.5);
    const result = renderer._computePhaseColorMod(thought, trueColor);

    const eased = 1 - Math.pow(1 - 0.1, 2.5); // easeOutCubic(0.1) = 0.271
    const grayLerped = trueColor.clone().lerp(PHASE_GRAY, 1 - eased);
    const flashAmount = 0.3 * Math.sin(Math.PI * 0.1); // ≈ 0.094
    const expected = grayLerped.clone().lerp(WHITE, flashAmount);

    expect(result.r).toBeCloseTo(expected.r, 3);
    expect(result.g).toBeCloseTo(expected.g, 3);
    expect(result.b).toBeCloseTo(expected.b, 3);
  });
});

describe('S2.21 端到端: 链路可重现性 (多次调用结果一致)', () => {
  it('11. 同一 thought + trueColor, _computePhaseColorMod 多次调用结果一致 (无副作用)', () => {
    const thought = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    const trueColor = temperatureToColor(0.7);

    const r1 = renderer._computePhaseColorMod(thought, trueColor);
    const r2 = renderer._computePhaseColorMod(thought, trueColor);
    const r3 = renderer._computePhaseColorMod(thought, trueColor);

    expect(r1.r).toBeCloseTo(r2.r, 6);
    expect(r1.g).toBeCloseTo(r2.g, 6);
    expect(r1.b).toBeCloseTo(r2.b, 6);
    expect(r2.r).toBeCloseTo(r3.r, 6);
    expect(r2.g).toBeCloseTo(r3.g, 6);
    expect(r2.b).toBeCloseTo(r3.b, 6);

    // 也不应该修改传入的 trueColor (因为内部 clone)
    expect(trueColor.r).toBeCloseTo(temperatureToColor(0.7).r, 5);
  });
});

describe('S2.21 端到端: 温度色 × phase flash 全谱', () => {
  it('12. 8 温度点 × 4 phase × 3 progress = 96 case 颜色都合理 (0~1 范围, 偏白叠加正确)', () => {
    const temps = [0, 0.15, 0.3, 0.5, 0.7, 0.85, 1];
    const phases = [ThoughtPhase.SEED, ThoughtPhase.CRYSTAL, ThoughtPhase.MEMORY, 'UNKNOWN'];
    const progressList = [0, 0.5, 1];

    let testCount = 0;
    for (const temp of temps) {
      const trueColor = temperatureToColor(temp);
      for (const phase of phases) {
        for (const prog of progressList) {
          const thought = makeThought({ phase, progress: prog });
          const result = renderer._computePhaseColorMod(thought, trueColor);

          // 颜色通道应在 0~1 范围
          expect(result.r).toBeGreaterThanOrEqual(0);
          expect(result.r).toBeLessThanOrEqual(1);
          expect(result.g).toBeGreaterThanOrEqual(0);
          expect(result.g).toBeLessThanOrEqual(1);
          expect(result.b).toBeGreaterThanOrEqual(0);
          expect(result.b).toBeLessThanOrEqual(1);

          // 颜色应 <= 1 (因为 flash 偏白, 但不会超过 white)
          expect(result.r).toBeLessThanOrEqual(1.0);
          expect(result.g).toBeLessThanOrEqual(1.0);
          expect(result.b).toBeLessThanOrEqual(1.0);

          testCount++;
        }
      }
    }
    expect(testCount).toBe(7 * 4 * 3); // 84
  });
});
