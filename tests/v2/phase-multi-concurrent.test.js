/**
 * Phase Multi-Concurrent 测试 (S2.19)
 *
 * 验证:
 *   1. startPhaseTransition(target, opts) 接受 easing / duration / delay
 *   2. delay > 0 时, tickPhaseTransition 在 delay 期间 progress 保持 0
 *   3. delay 结束后, progress 按 phaseDuration 推进
 *   4. easing=ease-in / ease-in-out / linear 跟 S2.18 applyEasing 一致
 *   5. phaseStartTime 字段自动设置 (Date.now() + delay*1000)
 *   6. _transient 默认值: phaseDuration=0.8, phaseEasing='ease-out', phaseDelay=0
 *   7. 多 thought 各自独立推进, 不相互影响
 *   8. delay=0 时跟 S2.16 行为一致 (默认 ease-out, 0.8s)
 *
 * 配套: src/v2/core/thought.js (S2.19 startPhaseTransition + tickPhaseTransition)
 *        src/v2/animation/ease.js (S2.18 applyEasing)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Thought, ThoughtPhase, genThoughtId } from '../../src/v2/core/thought.js';
import { applyEasing, EasingType } from '../../src/v2/animation/ease.js';

// ===== Helpers =====
function makeThought(overrides = {}) {
  return new Thought({
    id: overrides.id || genThoughtId(),
    content: overrides.content || 'test thought',
    layerId: 'L1',
    position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    space: null,
    layerSystem: null,
  });
}

describe('S2.19 startPhaseTransition 配置 opts', () => {
  it('1. _transient 默认值: duration=0.8, easing=ease-out, delay=0', () => {
    const t = makeThought();
    expect(t._transient.phaseDuration).toBe(0.8);
    expect(t._transient.phaseEasing).toBe('ease-out');
    expect(t._transient.phaseDelay).toBe(0);
    expect(t._transient.phaseStartTime).toBe(0);
  });

  it('2. startPhaseTransition 接受 opts.easing, opts.duration, opts.delay', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, {
      easing: 'ease-in',
      duration: 1.5,
      delay: 0.2,
    });
    expect(t._transient.phaseEasing).toBe('ease-in');
    expect(t._transient.phaseDuration).toBe(1.5);
    expect(t._transient.phaseDelay).toBe(0.2);
  });

  it('3. phaseStartTime 自动设置为 Date.now() + delay*1000', () => {
    const t = makeThought();
    const before = Date.now();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 0.5 });
    const after = Date.now();
    const expected = before + 500;
    // 容忍 ±50ms
    expect(t._transient.phaseStartTime).toBeGreaterThanOrEqual(expected - 50);
    expect(t._transient.phaseStartTime).toBeLessThanOrEqual(after + 500 + 50);
  });

  it('4. 缺省 opts 走默认 (ease-out, 0.8s, delay=0)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY);
    expect(t._transient.phaseEasing).toBe('ease-out');
    expect(t._transient.phaseDuration).toBe(0.8);
    expect(t._transient.phaseDelay).toBe(0);
  });

  it('5. duration=0 → 防 0 除 (clamp 到 0.001)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { duration: 0 });
    expect(t._transient.phaseDuration).toBe(0.001);
  });

  it('6. delay 负数 → clamp 到 0', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { delay: -0.5 });
    expect(t._transient.phaseDelay).toBe(0);
  });
});

describe('S2.19 tickPhaseTransition delay 处理', () => {
  it('7. delay 期间 progress 保持 0 (不推进)', () => {
    const t = makeThought();
    // delay = 1s, 模拟 tick 0.5s (delay 未结束)
    t.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 1.0, duration: 0.8 });
    // 手动把 phaseStartTime 改成 1s 后
    t._transient.phaseStartTime = Date.now() + 1000;
    t.tickPhaseTransition(0.5);  // tick 0.5s
    expect(t._transient.phaseTransitionProgress).toBe(0);
  });

  it('8. delay 结束后 progress 按 phaseDuration 推进 (linear → eased)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 0, duration: 1.0, easing: 'linear' });
    t._transient.phaseStartTime = Date.now();  // 立即开始
    t.tickPhaseTransition(0.5);  // tick 0.5s, 应当 0.5/1.0 = 0.5 (linear)
    expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
  });

  it('9. ease-out + duration=0.8 (默认), tick 0.4s → linear 0.5 (跟 S2.16 兼容)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY);  // 默认 ease-out, 0.8s
    t._transient.phaseStartTime = Date.now();
    t.tickPhaseTransition(0.4);  // linear 0.5
    expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    // getEasedPhaseProgress() 返 eased 0.823
    expect(t.getEasedPhaseProgress()).toBeCloseTo(0.823, 2);
  });

  it('10. ease-in + duration=0.8, tick 0.4s → linear 0.5 (eased 0.177)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'ease-in', duration: 0.8 });
    t._transient.phaseStartTime = Date.now();
    t.tickPhaseTransition(0.4);
    expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    expect(t.getEasedPhaseProgress()).toBeCloseTo(0.177, 2);
  });

  it('11. ease-in-out + duration=0.8, tick 0.4s → linear 0.5 (eased 0.5 折点)', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'ease-in-out', duration: 0.8 });
    t._transient.phaseStartTime = Date.now();
    t.tickPhaseTransition(0.4);
    expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    expect(t.getEasedPhaseProgress()).toBeCloseTo(0.5, 2);
  });

  it('12. tick 累加 — 多次 tick 后 progress 单调增', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'linear', duration: 1.0 });
    t._transient.phaseStartTime = Date.now();
    const progs = [];
    for (let i = 0; i < 5; i++) {
      t.tickPhaseTransition(0.1);
      progs.push(t._transient.phaseTransitionProgress);
    }
    // 0.1, 0.2, 0.3, 0.4, 0.5 (linear)
    for (let i = 1; i < progs.length; i++) {
      expect(progs[i]).toBeGreaterThanOrEqual(progs[i - 1]);
    }
    expect(progs[progs.length - 1]).toBeCloseTo(0.5, 2);
  });
});

describe('S2.19 多 thought 独立推进 (并发)', () => {
  it('13. 3 个 thought 各自独立 delay + duration 配置, tick 后进度互不干扰', () => {
    const t1 = makeThought({ id: 't1' });
    const t2 = makeThought({ id: 't2' });
    const t3 = makeThought({ id: 't3' });

    t1.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 0, duration: 0.8, easing: 'linear' });
    t2.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 0.1, duration: 0.8, easing: 'linear' });
    t3.startPhaseTransition(ThoughtPhase.MEMORY, { delay: 0.2, duration: 0.8, easing: 'linear' });

    // 立即开始 3 个
    t1._transient.phaseStartTime = Date.now();
    t2._transient.phaseStartTime = Date.now() + 100;
    t3._transient.phaseStartTime = Date.now() + 200;

    // tick 0.05s: t1 推进, t2/t3 还在 delay
    t1.tickPhaseTransition(0.05);
    t2.tickPhaseTransition(0.05);
    t3.tickPhaseTransition(0.05);

    expect(t1._transient.phaseTransitionProgress).toBeCloseTo(0.0625, 3);
    expect(t2._transient.phaseTransitionProgress).toBe(0);  // delay 中
    expect(t3._transient.phaseTransitionProgress).toBe(0);  // delay 中
  });

  it('14. 3 个 thought 各自独立 easing, tick 0.4s 后 eased 进度不同', () => {
    const t1 = makeThought({ id: 't1' });
    const t2 = makeThought({ id: 't2' });
    const t3 = makeThought({ id: 't3' });

    t1.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'ease-out', duration: 0.8 });
    t2.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'ease-in', duration: 0.8 });
    t3.startPhaseTransition(ThoughtPhase.MEMORY, { easing: 'linear', duration: 0.8 });

    t1._transient.phaseStartTime = Date.now();
    t2._transient.phaseStartTime = Date.now();
    t3._transient.phaseStartTime = Date.now();

    t1.tickPhaseTransition(0.4);
    t2.tickPhaseTransition(0.4);
    t3.tickPhaseTransition(0.4);

    // 3 个 linear progress 都是 0.5 (easing 在 getEasedPhaseProgress 那边)
    expect(t1._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    expect(t2._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    expect(t3._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);

    // 但 eased 进度不同: linear 0.5, easeOut 0.823, easeIn 0.177
    const p1 = t1.getEasedPhaseProgress();
    const p2 = t2.getEasedPhaseProgress();
    const p3 = t3.getEasedPhaseProgress();
    expect(p1).toBeCloseTo(0.823, 2);
    expect(p2).toBeCloseTo(0.177, 2);
    expect(p3).toBeCloseTo(0.5, 2);
    // 互不干扰
    expect(p1).not.toBe(p2);
    expect(p1).not.toBe(p3);
    expect(p2).not.toBe(p3);
  });
});

describe('S2.19 边界 + 兼容', () => {
  it('15. 已经在 targetPhase → startPhaseTransition 是 noop (S2.16 兼容)', () => {
    const t = makeThought();
    // 默认 phase=CRYSTAL, startPhaseTransition(CRYSTAL) 应当 noop
    t.startPhaseTransition(ThoughtPhase.CRYSTAL);
    expect(t._transient.phaseTransitionProgress).toBe(0);
  });

  it('16. tick 累加到 progress=1 后, currentPhase 切到 targetPhase', () => {
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY, { duration: 0.1, easing: 'linear' });
    t._transient.phaseStartTime = Date.now();
    t.tickPhaseTransition(0.05);
    expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 2);
    t.tickPhaseTransition(0.1);  // 0.5 + 0.1/0.1 = 1.5, clamp 1
    expect(t._transient.phaseTransitionProgress).toBe(1);
    expect(t._transient.currentPhase).toBe(ThoughtPhase.MEMORY);
  });

  it('17. progress=1 后 tick 不再变化', () => {
    const t = makeThought();
    t._transient.phaseTransitionProgress = 1;
    t.tickPhaseTransition(0.5);
    expect(t._transient.phaseTransitionProgress).toBe(1);
  });

  it('18. ease-out 默认行为跟 S2.16 完全一致 (linear 0.5, eased 0.823)', () => {
    // 验证 backward compat: 没传 opts 时, 跟 S2.16 数值一致
    const t = makeThought();
    t.startPhaseTransition(ThoughtPhase.MEMORY);
    t._transient.phaseStartTime = Date.now();
    t.tickPhaseTransition(0.4);  // linear 0.5
    const linear = t._transient.phaseTransitionProgress;
    const eased = t.getEasedPhaseProgress();
    // linear 进度 0.5, eased 跟 applyEasing(0.5, 'ease-out') 一致
    expect(linear).toBeCloseTo(0.5, 4);
    expect(eased).toBeCloseTo(applyEasing(0.5, EasingType.EASE_OUT), 4);
  });
});
