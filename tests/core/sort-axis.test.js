/**
 * [INPUT]: src/core/sort-axis.js
 * [OUTPUT]: 验证多轴排序 + 信念轨迹 + 持久化
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect, vi } from 'vitest';
import {
  createSortHistory,
  applyAxis,
  SORT_AXES,
  SORT_AXIS_LABELS
} from '../../src/core/sort-axis.js';

function makeThought(id, opts = {}) {
  return {
    id,
    text: `t-${id}`,
    createdAt: opts.createdAt ?? 0,
    temperature: opts.temperature ?? 0,
    mass: opts.mass ?? 1,
    lastInteractionAt: opts.lastInteractionAt ?? 0
  };
}

describe('applyAxis 排序函数', () => {
  it('按时间升序', () => {
    const arr = [makeThought('a', { createdAt: 3 }), makeThought('b', { createdAt: 1 }), makeThought('c', { createdAt: 2 })];
    const out = applyAxis(arr, SORT_AXES.TIME, 'asc');
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
  it('按时间降序', () => {
    const arr = [makeThought('a', { createdAt: 3 }), makeThought('b', { createdAt: 1 })];
    const out = applyAxis(arr, SORT_AXES.TIME, 'desc');
    expect(out.map((t) => t.id)).toEqual(['a', 'b']);
  });
  it('按热度降序', () => {
    const arr = [
      makeThought('cold', { temperature: 0.1 }),
      makeThought('hot', { temperature: 0.9 }),
      makeThought('warm', { temperature: 0.5 })
    ];
    const out = applyAxis(arr, SORT_AXES.HEAT, 'desc');
    expect(out.map((t) => t.id)).toEqual(['hot', 'warm', 'cold']);
  });
  it('按体积降序', () => {
    const arr = [
      makeThought('small', { mass: 1 }),
      makeThought('big', { mass: 5 }),
      makeThought('mid', { mass: 3 })
    ];
    const out = applyAxis(arr, SORT_AXES.VOLUME, 'desc');
    expect(out.map((t) => t.id)).toEqual(['big', 'mid', 'small']);
  });
  it('按最近操作', () => {
    const arr = [
      makeThought('old', { lastInteractionAt: 100 }),
      makeThought('new', { lastInteractionAt: 200 })
    ];
    const out = applyAxis(arr, SORT_AXES.LAST_INTERACTION, 'desc');
    expect(out.map((t) => t.id)).toEqual(['new', 'old']);
  });
  it('按手动顺序 (manualOrder 数组)', () => {
    const arr = [
      makeThought('a'),
      makeThought('b'),
      makeThought('c')
    ];
    const out = applyAxis(arr, SORT_AXES.MANUAL, 'asc', ['b', 'a', 'c']);
    expect(out.map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });
  it('非法 axis 回退默认 time', () => {
    const arr = [makeThought('a', { createdAt: 1 }), makeThought('b', { createdAt: 2 })];
    const out = applyAxis(arr, 'invalid_axis', 'desc');
    expect(out.map((t) => t.id)).toEqual(['b', 'a']);
  });
  it('非数组 thoughts 返回空数组', () => {
    expect(applyAxis(null, SORT_AXES.TIME)).toEqual([]);
    expect(applyAxis(undefined, SORT_AXES.TIME)).toEqual([]);
  });
  it('空数组返回空数组', () => {
    expect(applyAxis([], SORT_AXES.TIME)).toEqual([]);
  });
  it('手动顺序时,manualOrder 中不存在的元素排到最后', () => {
    const arr = [makeThought('a'), makeThought('b'), makeThought('c'), makeThought('d')];
    const out = applyAxis(arr, SORT_AXES.MANUAL, 'asc', ['b']);
    expect(out.map((t) => t.id)).toEqual(['b', 'a', 'c', 'd']);
  });
});

describe('createSortHistory 状态机', () => {
  it('默认当前轴是 time,激活轴包含 time', () => {
    const h = createSortHistory();
    expect(h.getCurrentAxis()).toBe(SORT_AXES.TIME);
    expect(h.getActiveAxes()).toContain(SORT_AXES.TIME);
  });

  it('activate 添加轴', () => {
    const h = createSortHistory();
    h.activate(SORT_AXES.HEAT);
    expect(h.getActiveAxes()).toContain(SORT_AXES.HEAT);
  });
  it('activate 非法轴返回 false', () => {
    const h = createSortHistory();
    expect(h.activate('not_a_real_axis')).toBe(false);
  });
  it('activate 重复激活同一轴不重复添加', () => {
    const h = createSortHistory();
    h.activate(SORT_AXES.HEAT);
    h.activate(SORT_AXES.HEAT);
    const axes = h.getActiveAxes();
    expect(axes.filter((a) => a === SORT_AXES.HEAT).length).toBe(1);
  });

  it('deactivate 移除轴', () => {
    const h = createSortHistory();
    h.activate(SORT_AXES.HEAT);
    h.deactivate(SORT_AXES.HEAT);
    expect(h.getActiveAxes()).not.toContain(SORT_AXES.HEAT);
  });
  it('deactivate 当前轴 → 回退第一个激活轴', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    h.deactivate(SORT_AXES.HEAT);
    expect(h.getCurrentAxis()).not.toBe(SORT_AXES.HEAT);
  });
  it('deactivate 不存在的轴返回 false', () => {
    const h = createSortHistory();
    expect(h.deactivate(SORT_AXES.VOLUME)).toBe(false);
  });

  it('setCurrentAxis 切换当前轴', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    expect(h.getCurrentAxis()).toBe(SORT_AXES.HEAT);
  });
  it('setCurrentAxis 自动激活新轴', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.VOLUME);
    expect(h.getActiveAxes()).toContain(SORT_AXES.VOLUME);
  });
  it('setCurrentAxis 非法轴返回 false', () => {
    const h = createSortHistory();
    expect(h.setCurrentAxis('bad')).toBe(false);
  });
});

describe('信念轨迹 (SP-1.P0)', () => {
  it('recordOrder 保存手动顺序', () => {
    const h = createSortHistory();
    h.recordOrder(['b', 'a', 'c']);
    expect(h.getManualOrder()).toEqual(['b', 'a', 'c']);
  });
  it('recordOrder 非数组返回 false', () => {
    const h = createSortHistory();
    expect(h.recordOrder(null)).toBe(false);
  });
  it('recordOrder 自动激活 manual 并设为当前', () => {
    const h = createSortHistory();
    h.recordOrder(['x', 'y']);
    expect(h.getActiveAxes()).toContain(SORT_AXES.MANUAL);
    expect(h.getCurrentAxis()).toBe(SORT_AXES.MANUAL);
  });
  it('recordOrder 多次调用,后者覆盖前者', () => {
    const h = createSortHistory();
    h.recordOrder(['a', 'b']);
    h.recordOrder(['c', 'd']);
    expect(h.getManualOrder()).toEqual(['c', 'd']);
  });
  it('manualOrder 是副本,不影响内部数据', () => {
    const h = createSortHistory();
    h.recordOrder(['a', 'b']);
    const out = h.getManualOrder();
    out.push('c');
    expect(h.getManualOrder()).toEqual(['a', 'b']);
  });
  it('clearManualOrder 清空手动顺序并回退默认轴', () => {
    const h = createSortHistory();
    h.recordOrder(['a', 'b']);
    h.clearManualOrder();
    expect(h.getManualOrder()).toEqual([]);
    expect(h.getCurrentAxis()).toBe(SORT_AXES.TIME);
  });
});

describe('getCurrentOrder 当前排序结果', () => {
  it('默认按时间降序', () => {
    const h = createSortHistory();
    const thoughts = [
      makeThought('a', { createdAt: 1 }),
      makeThought('b', { createdAt: 3 }),
      makeThought('c', { createdAt: 2 })
    ];
    const out = h.getCurrentOrder(thoughts);
    expect(out.map((t) => t.id)).toEqual(['b', 'c', 'a']);
  });
  it('setCurrentAxis 后立即生效', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    const thoughts = [
      makeThought('cold', { temperature: 0.1 }),
      makeThought('hot', { temperature: 0.9 })
    ];
    expect(h.getCurrentOrder(thoughts).map((t) => t.id)).toEqual(['hot', 'cold']);
  });
  it('recordOrder 后手动顺序生效', () => {
    const h = createSortHistory();
    h.recordOrder(['c', 'a', 'b']);
    const thoughts = [makeThought('a'), makeThought('b'), makeThought('c')];
    expect(h.getCurrentOrder(thoughts).map((t) => t.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('信念历史 evolution', () => {
  it('setCurrentAxis 记录 evolution', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    expect(h.getHistory().length).toBeGreaterThan(0);
  });
  it('recordOrder 记录 evolution', () => {
    const h = createSortHistory();
    h.recordOrder(['a', 'b']);
    expect(h.getHistory().length).toBeGreaterThan(0);
  });
  it('clearManualOrder 记录 evolution', () => {
    const h = createSortHistory();
    h.clearManualOrder();
    expect(h.getHistory().length).toBeGreaterThan(0);
  });
  it('evolution 有时间戳、轴、手动顺序', () => {
    const h = createSortHistory();
    h.recordOrder(['a']);
    const hist = h.getHistory();
    expect(hist[0].timestamp).toBeGreaterThan(0);
    expect(hist[0].currentAxis).toBe(SORT_AXES.MANUAL);
    expect(hist[0].manualOrder).toEqual(['a']);
  });
  it('evolution 限速:1 分钟内多次操作只记一次', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'));
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    h.setCurrentAxis(SORT_AXES.VOLUME);
    h.setCurrentAxis(SORT_AXES.HEAT);
    expect(h.getHistory().length).toBe(1);
    vi.setSystemTime(new Date('2026-07-07T00:02:00Z'));
    h.setCurrentAxis(SORT_AXES.VOLUME);
    expect(h.getHistory().length).toBe(2);
    vi.useRealTimers();
  });
});

describe('SORT_AXES 与标签', () => {
  it('SORT_AXES 是 stable 字符串', () => {
    expect(SORT_AXES.TIME).toBe('time');
    expect(SORT_AXES.HEAT).toBe('heat');
    expect(SORT_AXES.VOLUME).toBe('volume');
    expect(SORT_AXES.MANUAL).toBe('manual');
    expect(SORT_AXES.LAST_INTERACTION).toBe('lastInteraction');
  });
  it('SORT_AXIS_LABELS 提供中文标签', () => {
    expect(SORT_AXIS_LABELS.time).toBe('时间');
    expect(SORT_AXIS_LABELS.heat).toBe('热度');
    expect(SORT_AXIS_LABELS.volume).toBe('体积');
    expect(SORT_AXIS_LABELS.manual).toBe('手动');
    expect(SORT_AXIS_LABELS.lastInteraction).toBe('最近操作');
  });
});

describe('持久化 (toJSON / fromJSON)', () => {
  it('toJSON 包含全部状态', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    h.recordOrder(['a', 'b']);
    const json = h.toJSON();
    expect(json.currentAxis).toBe(SORT_AXES.MANUAL);
    expect(json.activeAxes).toContain(SORT_AXES.HEAT);
    expect(json.manualOrder).toEqual(['a', 'b']);
    expect(Array.isArray(json.evolution)).toBe(true);
  });
  it('fromJSON 还原', () => {
    const a = createSortHistory();
    a.setCurrentAxis(SORT_AXES.VOLUME);
    a.recordOrder(['x', 'y', 'z']);
    const json = a.toJSON();
    const b = createSortHistory();
    b.fromJSON(json);
    expect(b.getCurrentAxis()).toBe(SORT_AXES.MANUAL);
    expect(b.getManualOrder()).toEqual(['x', 'y', 'z']);
    expect(b.getActiveAxes()).toContain(SORT_AXES.VOLUME);
  });
  it('fromJSON 接受 null/非对象静默忽略', () => {
    const h = createSortHistory();
    h.setCurrentAxis(SORT_AXES.HEAT);
    h.fromJSON(null);
    expect(h.getCurrentAxis()).toBe(SORT_AXES.HEAT);
  });
  it('fromJSON 过滤非法 axis', () => {
    const h = createSortHistory();
    h.fromJSON({ currentAxis: 'bogus_axis', activeAxes: ['bogus', 'time'] });
    expect(h.getCurrentAxis()).toBe(SORT_AXES.TIME);
  });
  it('fromJSON 空 activeAxes 回退默认', () => {
    const h = createSortHistory();
    h.fromJSON({ activeAxes: [] });
    expect(h.getActiveAxes()).toContain(SORT_AXES.TIME);
  });
  it('完整 round-trip', () => {
    const a = createSortHistory();
    a.activate(SORT_AXES.HEAT);
    a.setCurrentAxis(SORT_AXES.HEAT);
    a.recordOrder(['m', 'n']);
    const json = a.toJSON();
    const b = createSortHistory();
    b.fromJSON(json);
    const thoughts = [
      makeThought('m', { temperature: 0.5 }),
      makeThought('n', { temperature: 0.1 }),
      makeThought('x', { temperature: 0.9 })
    ];
    expect(b.getCurrentOrder(thoughts).map((t) => t.id)).toEqual(['m', 'n', 'x']);
  });
});

describe('dispose', () => {
  it('dispose 清空所有状态', () => {
    const h = createSortHistory();
    h.activate(SORT_AXES.HEAT);
    h.recordOrder(['a', 'b']);
    h.dispose();
    expect(h.getCurrentAxis()).toBe(SORT_AXES.TIME);
    expect(h.getManualOrder()).toEqual([]);
    expect(h.getActiveAxes()).toEqual([SORT_AXES.TIME]);
  });
});