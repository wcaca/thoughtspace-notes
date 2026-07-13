/**
 * ExpectedFrameCalculator 测试 (S2.12)
 *
 * 验证:
 *   1. DEFAULT_EXPECTED_CONSTANTS 冻结 + 5 阶段 + base
 *   2. computeExpectedMs 空 stages → base only
 *   3. computeExpectedMs 加 callback 后线性增长
 *   4. computeExpectedMs 缺常数的 stage → 0 (不 throw)
 *   5. computeExpectedMs byStage 字段完整
 *   6. computeExpectedMs callbackMultiplier: 0/0 stage 边界
 *   7. computeOverhead 三档 severity (ok/warn/alarm)
 *   8. computeOverhead expectedMs=0 → overheadPct=0 不爆
 *   9. computeRemainingBudget 默认 frameBudget=16
 *  10. computeRemainingBudget 超 budget → remainingMs=0 + note
 *  11. computeRemainingBudget 自定义 budget
 *  12. 数字精度 round2 (两位小数)
 *
 * 配套: src/v2/render/expected-calculator.js
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPECTED_CONSTANTS,
  computeExpectedMs,
  computeOverhead,
  computeRemainingBudget,
} from '../../src/v2/render/expected-calculator.js';

function makeStages(map) {
  // 接受 {input: [{fn},{fn}], state: [{fn}]} 形式
  const m = new Map();
  const names = ['input', 'state', 'transform', 'render', 'snapshot'];
  for (const n of names) {
    m.set(n, map[n] || []);
  }
  return m;
}

describe('ExpectedFrameCalculator · S2.12 理论帧耗时', () => {
  describe('DEFAULT_EXPECTED_CONSTANTS', () => {
    it('1. 冻结 + 5 阶段 + base', () => {
      expect(Object.isFrozen(DEFAULT_EXPECTED_CONSTANTS)).toBe(true);
      const keys = Object.keys(DEFAULT_EXPECTED_CONSTANTS).sort();
      expect(keys).toEqual(['base', 'input', 'render', 'snapshot', 'state', 'transform']);
      // 5 阶段 + base 总和 < 16 (60fps 预算内)
      const total = keys.filter(k => k !== 'base').reduce((s, k) => s + DEFAULT_EXPECTED_CONSTANTS[k], 0);
      expect(total + DEFAULT_EXPECTED_CONSTANTS.base).toBeLessThanOrEqual(16);
    });
  });

  describe('computeExpectedMs', () => {
    it('2. 空 stages → base only', () => {
      const stages = makeStages({});
      const r = computeExpectedMs({ stages });
      expect(r.expectedMs).toBe(DEFAULT_EXPECTED_CONSTANTS.base);
      expect(r.byStage).toEqual({ input: 0, state: 0, transform: 0, render: 0, snapshot: 0 });
      expect(r.callbackMultiplier).toBe(0);
    });

    it('3. 加 callback 后线性增长', () => {
      const stages = makeStages({
        input: [{ fn: () => {} }],
        state: [{ fn: () => {} }, { fn: () => {} }],  // 2 个
        render: [{ fn: () => {} }],
      });
      const r = computeExpectedMs({ stages });
      // input: 0.3*1 + state: 1.0*2 + render: 4.0*1 + base: 0.5 = 6.8
      expect(r.expectedMs).toBe(6.8);
      expect(r.byStage.input).toBe(0.3);
      expect(r.byStage.state).toBe(2.0);
      expect(r.byStage.render).toBe(4.0);
      expect(r.byStage.transform).toBe(0);
      expect(r.byStage.snapshot).toBe(0);
    });

    it('4. 缺常数的 stage → 0 (不 throw)', () => {
      const m = new Map();
      m.set('input', [{ fn: () => {} }]);
      m.set('unknown_stage', [{ fn: () => {} }]);
      m.set('state', []);
      m.set('transform', []);
      m.set('render', []);
      m.set('snapshot', []);
      const r = computeExpectedMs({ stages: m });
      // 只算 input, 缺常数的 stage 跳过 (0)
      expect(r.expectedMs).toBeCloseTo(DEFAULT_EXPECTED_CONSTANTS.input + DEFAULT_EXPECTED_CONSTANTS.base, 2);
    });

    it('5. byStage 字段完整 (5 个 stage)', () => {
      const r = computeExpectedMs({ stages: makeStages({}) });
      expect(Object.keys(r.byStage).sort()).toEqual(['input', 'render', 'snapshot', 'state', 'transform']);
    });

    it('6. callbackMultiplier: 0/0 边界', () => {
      const stages = makeStages({});
      const r = computeExpectedMs({ stages });
      expect(r.callbackMultiplier).toBe(0);
    });

    it('7. callbackMultiplier: 加回调后 > 1', () => {
      const stages = makeStages({
        state: [{ fn: () => {} }, { fn: () => {} }, { fn: () => {} }],  // 3
        transform: [{ fn: () => {} }],  // 1
      });
      const r = computeExpectedMs({ stages });
      // totalCallbacks=4, activeStages=2, ratio=2
      expect(r.callbackMultiplier).toBe(2);
    });
  });

  describe('computeOverhead', () => {
    it('7. 三档 severity (ok/warn/alarm)', () => {
      expect(computeOverhead(5, 5).severity).toBe('ok');
      expect(computeOverhead(5, 6).severity).toBe('ok');        // overheadPct = -16% < 20%
      expect(computeOverhead(6, 5).severity).toBe('ok');        // 20% 边界 (不超 20)
      expect(computeOverhead(6.1, 5).severity).toBe('warn');    // 22% > 20 → warn
      expect(computeOverhead(7.5, 5).severity).toBe('warn');    // 50% 边界
      expect(computeOverhead(7.51, 5).severity).toBe('alarm');  // > 50%
    });

    it('8. expectedMs=0 → overheadPct=0 不爆', () => {
      const r = computeOverhead(5, 0);
      expect(r.overheadPct).toBe(0);
      expect(r.overheadMs).toBe(5);
      expect(r.severity).toBe('ok');  // overheadPct=0 → ok
    });

    it('9. overheadMs = actualMs - expectedMs (正负号)', () => {
      expect(computeOverhead(8, 10).overheadMs).toBe(-2);
      expect(computeOverhead(12, 10).overheadMs).toBe(2);
    });
  });

  describe('computeRemainingBudget', () => {
    it('10. 默认 frameBudget=16', () => {
      const stages = makeStages({});
      const r = computeRemainingBudget(stages);
      // 空 stages: expectedMs = base = 0.5, remaining = 15.5
      expect(r.remainingMs).toBe(15.5);
      expect(r.note).toBe('within budget');
    });

    it('11. 超 budget → remainingMs=0 + note', () => {
      const stages = makeStages({
        input: [{ fn: () => {} }],
        state: [{ fn: () => {} }, { fn: () => {} }],
        transform: [{ fn: () => {} }],
        render: new Array(10).fill({ fn: () => {} }),  // 10 个 = 40ms
      });
      const r = computeRemainingBudget(stages);
      expect(r.remainingMs).toBe(0);
      expect(r.note).toBe('over budget');
    });

    it('12. 自定义 frameBudget', () => {
      const stages = makeStages({});
      const r = computeRemainingBudget(stages, undefined, 8);  // 30fps
      expect(r.remainingMs).toBe(7.5);  // 8 - 0.5
    });
  });

  describe('数字精度', () => {
    it('13. round2: 两位小数', () => {
      const stages = makeStages({
        state: [{ fn: () => {} }, { fn: () => {} }],  // 2 * 1.0 = 2.0
        transform: [{ fn: () => {} }],                 // 1 * 1.5 = 1.5
      });
      const r = computeExpectedMs({ stages });
      // 0.5 + 2.0 + 1.5 = 4.0 (整数, OK)
      expect(r.expectedMs).toBe(4.0);
      // 故意构造非整数
      const stages2 = makeStages({ render: new Array(3).fill({ fn: () => {} }) });
      const r2 = computeExpectedMs({ stages: stages2 });
      // 0.5 + 12.0 = 12.5
      expect(r2.expectedMs).toBe(12.5);
    });
  });
});
