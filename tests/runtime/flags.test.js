import { describe, it, expect, beforeEach } from 'vitest';
import {
  isOn,
  getVariant,
  setOverride,
  clearOverride,
  listEnabledFlags,
  killSwitch,
  FlagNotDeclaredError,
} from '../../src/runtime/flags/index.js';
import { FLAG_REGISTRY } from '../../src/runtime/flags/registry.js';

describe('feature flag system', () => {
  beforeEach(() => {
    clearOverride();
    killSwitch.reset();
  });

  describe('registry', () => {
    it('应至少有 3 个 flag 注册', () => {
      expect(Object.keys(FLAG_REGISTRY).length).toBeGreaterThanOrEqual(3);
    });

    it('每个 flag 必填字段必须存在', () => {
      for (const flag of Object.values(FLAG_REGISTRY)) {
        expect(flag.name).toBeTruthy();
        expect(flag.type).toBeTruthy();
        expect(flag.default).not.toBeUndefined();
        expect(flag.status).toBeTruthy();
        expect(flag.owner_spec).toBeTruthy();
        expect(flag.scope).toBeTruthy();
        expect(flag['regression_subset']).toBeTruthy();
      }
    });

    it('enum 类型 flag 的 default 必须在 values 内', () => {
      for (const flag of Object.values(FLAG_REGISTRY)) {
        if (flag.type === 'enum') {
          expect(flag.values).toContain(flag.default);
        }
      }
    });
  });

  describe('isOn', () => {
    it('shape-resolver-weights-v2 默认应为 balanced (非 default 值)', () => {
      expect(isOn('shape-resolver-weights-v2')).toBe(false);
    });

    it('observe-mode-cohort-toggle 默认应为 true', () => {
      expect(isOn('observe-mode-cohort-toggle')).toBe(true);
    });

    it('未声明的 flag 应抛错', () => {
      expect(() => isOn('not-a-real-flag')).toThrow(FlagNotDeclaredError);
    });

    it('memory override 应优先于 registry default', () => {
      setOverride('observe-mode-cohort-toggle', false);
      expect(isOn('observe-mode-cohort-toggle')).toBe(false);
    });

    it('kill_switch 命中时强制 OFF', () => {
      killSwitch.trip('KILL_SP1');
      expect(isOn('observe-mode-cohort-toggle')).toBe(false);
    });
  });

  describe('getVariant', () => {
    it('shape-resolver-weights-v2 默认应返回 balanced 字符串', () => {
      expect(getVariant('shape-resolver-weights-v2')).toBe('balanced');
    });

    it('override 后应返回 override 值', () => {
      setOverride('shape-resolver-weights-v2', 'hull-first');
      expect(getVariant('shape-resolver-weights-v2')).toBe('hull-first');
    });

    it('yjs-persistence-batch-write 默认应返回数字 50', () => {
      expect(getVariant('yjs-persistence-batch-write')).toBe(50);
    });

    it('override number 类型', () => {
      setOverride('yjs-persistence-batch-write', 100);
      expect(getVariant('yjs-persistence-batch-write')).toBe(100);
    });
  });

  describe('cohort + rollout', () => {
    it('rollout=100 时所有 ctx bucket 都应得 variant', () => {
      setOverride('observe-mode-cohort-toggle', true);
      for (let b = 0; b < 100; b++) {
        expect(getVariant('observe-mode-cohort-toggle', { bucket: b })).toBe(true);
      }
    });

    it('rollout=0 时所有 ctx bucket 都应得 default', () => {
      for (let b = 0; b < 100; b++) {
        const v = getVariant('shape-resolver-weights-v2', { bucket: b });
        expect(v).toBe('balanced');
      }
    });
  });

  describe('depends_on / conflicts_with', () => {
    it('depends_on 失败时 isOn 应返回 false', () => {
      const flag = Object.values(FLAG_REGISTRY).find(f => f.depends_on?.length > 0);
      if (flag) {
        flag.depends_on.push('not-a-real-flag');
        expect(() => isOn(flag.name)).toThrow();
        flag.depends_on.length = flag.depends_on.length - 1;
      }
    });
  });

  describe('listEnabledFlags', () => {
    it('应至少返回 1 个 enabled flag', () => {
      const enabled = listEnabledFlags();
      expect(enabled.length).toBeGreaterThan(0);
    });

    it('应包含 observe-mode-cohort-toggle (default=true)', () => {
      expect(listEnabledFlags()).toContain('observe-mode-cohort-toggle');
    });
  });
});

describe('shape-resolver 与 flag 集成', () => {
  beforeEach(() => {
    clearOverride();
    killSwitch.reset();
  });

  it('未注入 resolver 时,默认走 balanced profile', async () => {
    const { shapeResolve, setShapeFlagResolver } = await import('../../src/core/shape-resolver.js');
    setShapeFlagResolver(null);
    const result = shapeResolve({ n: 10, k: 5, hullHits: 0, dwellMs: 5000 });
    expect(result.shape).toBeTruthy();
    expect(result.factors.weighted.ratio).toBeCloseTo(0.6, 5);
  });

  it('注入 resolver 后,override 应影响权重', async () => {
    const { shapeResolve, setShapeFlagResolver } = await import('../../src/core/shape-resolver.js');
    setShapeFlagResolver(() => 'hull-first');
    const result = shapeResolve({ n: 10, k: 5, hullHits: 1, dwellMs: 5000 });
    expect(result.factors.weighted.hull).toBeCloseTo(0.55, 5);
    setShapeFlagResolver(null);
  });

  it('balanced profile 保持与旧 DEFAULT_WEIGHTS 一致', async () => {
    const { shapeResolve, setShapeFlagResolver } = await import('../../src/core/shape-resolver.js');
    setShapeFlagResolver(() => 'balanced');
    const result = shapeResolve({ n: 10, k: 5, hullHits: 0, dwellMs: 0 });
    expect(result.factors.weighted.ratio).toBeCloseTo(0.6, 5);
    expect(result.factors.weighted.hull).toBeCloseTo(0.25, 5);
    setShapeFlagResolver(null);
  });

  it('callable weights 优先于 flag', async () => {
    const { shapeResolve, setShapeFlagResolver } = await import('../../src/core/shape-resolver.js');
    setShapeFlagResolver(() => 'hull-first');
    const result = shapeResolve({ n: 10, k: 5, hullHits: 0, dwellMs: 5000, weights: { ratio: 0.9 } });
    expect(result.factors.weighted.ratio).toBeGreaterThan(0.5);
    setShapeFlagResolver(null);
  });
});