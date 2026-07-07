/**
 * [INPUT]: src/render/viewport-state.js
 * [OUTPUT]: 验证 viewport-state 总线:默认/读/订阅/写/批量/锁/边界/dispose
 * [POS]: tests/render 下,被 vitest 消费(纯内存)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getViewportState,
  resetViewportState
} from '../../src/render/viewport-state.js';
import { SHAPES } from '../../src/core/shape-resolver.js';

describe('viewport-state', () => {
  beforeEach(() => {
    resetViewportState();
  });

  describe('singleton & 默认值', () => {
    it('getViewportState 返回单例', () => {
      const a = getViewportState();
      const b = getViewportState();
      expect(a).toBe(b);
    });
    it('reset 后创建新实例', () => {
      const a = getViewportState();
      resetViewportState();
      const b = getViewportState();
      expect(a).not.toBe(b);
    });
    it('read 默认值正确', () => {
      const s = getViewportState().read();
      expect(s.cameraFace).toBe('front');
      expect(s.cameraDistance).toBe(0.5);
      expect(s.selectionCount).toBe(0);
      expect(s.totalCount).toBe(0);
      expect(s.selectionRatio).toBe(0);
      expect(s.derivedShape).toBe(SHAPES.EMPTY);
    });
    it('read() 返回 frozen 对象', () => {
      const s = getViewportState().read();
      expect(() => { s.cameraFace = 'top'; }).toThrow();
    });
  });

  describe('update 单字段', () => {
    it('写入有效字段成功', () => {
      const state = getViewportState();
      const changed = state.update('cameraFace', 'top');
      expect(changed.length).toBe(1);
      expect(state.read().cameraFace).toBe('top');
    });
    it('无效 key 返回空数组且 warn', () => {
      const state = getViewportState();
      const orig = console.warn;
      let warned = false;
      console.warn = () => { warned = true; };
      const changed = state.update('invented', 'x');
      console.warn = orig;
      expect(changed.length).toBe(0);
      expect(warned).toBe(true);
    });
    it('相同 Object.is 值不视为变化', () => {
      const state = getViewportState();
      const changed = state.update('cameraFace', 'front');
      expect(changed.length).toBe(0);
    });
    it('链式多次 update 累积生效', () => {
      const state = getViewportState();
      state.update('cameraFace', 'left');
      state.update('totalCount', 50);
      const snap = state.read();
      expect(snap.cameraFace).toBe('left');
      expect(snap.totalCount).toBe(50);
    });
  });

  describe('updateBatch 批量', () => {
    it('一次写多个字段都生效', () => {
      const state = getViewportState();
      const changed = state.updateBatch({
        cameraFace: 'right',
        totalCount: 100,
        selectionCount: 25
      });
      expect(changed.length).toBe(3);
      const s = state.read();
      expect(s.cameraFace).toBe('right');
      expect(s.totalCount).toBe(100);
      expect(s.selectionCount).toBe(25);
      expect(s.selectionRatio).toBe(0.25);
    });
    it('null 与非对象都返回空数组', () => {
      const state = getViewportState();
      expect(state.updateBatch(null).length).toBe(0);
      expect(state.updateBatch('str').length).toBe(0);
    });
    it('部分变化时只列变更 keys', () => {
      const state = getViewportState();
      state.update('cameraFace', 'back');
      const changed = state.updateBatch({ cameraFace: 'back', totalCount: 30 });
      expect(changed).toEqual(['totalCount']);
    });
  });

  describe('subscribe', () => {
    it('subscribe 返回 unsubscribe 函数', () => {
      const state = getViewportState();
      const off = state.subscribe(() => {});
      expect(typeof off).toBe('function');
      off();
    });
    it('update 后 listener 在 microtask 被调', async () => {
      const state = getViewportState();
      const fired = [];
      state.subscribe((snap, keys) => fired.push({ snap, keys }));
      state.update('totalCount', 10);
      await Promise.resolve();
      expect(fired.length).toBe(1);
      expect(fired[0].keys).toEqual(['totalCount']);
      expect(fired[0].snap.totalCount).toBe(10);
    });
    it('watchKeys 过滤不相关 keys', async () => {
      const state = getViewportState();
      const fired = [];
      state.subscribe((snap, keys) => fired.push(keys), { keys: ['totalCount'] });
      state.update('cameraFace', 'top');
      await Promise.resolve();
      expect(fired.length).toBe(0);
      state.update('totalCount', 5);
      await Promise.resolve();
      expect(fired.length).toBe(1);
    });
    it('unsubscribe 后不再触发', async () => {
      const state = getViewportState();
      const fired = [];
      const off = state.subscribe(() => fired.push(1));
      off();
      state.update('totalCount', 7);
      await Promise.resolve();
      expect(fired.length).toBe(0);
    });
    it('监听器异常被捕获不影响其他人', async () => {
      const state = getViewportState();
      const fired = [];
      state.subscribe(() => { throw new Error('boom'); });
      state.subscribe(() => fired.push(1));
      state.update('totalCount', 9);
      await Promise.resolve();
      await Promise.resolve();
      expect(fired.length).toBe(1);
    });
  });

  describe('锁机制', () => {
    it('lockUpdates(true) 后 update 不生效', () => {
      const state = getViewportState();
      state.lockUpdates(true);
      const changed = state.update('totalCount', 99);
      expect(changed.length).toBe(0);
      expect(state.read().totalCount).toBe(0);
    });
    it('lockUpdates(false) 解锁后生效', () => {
      const state = getViewportState();
      state.lockUpdates(true);
      state.lockUpdates(false);
      const changed = state.update('totalCount', 99);
      expect(changed.length).toBe(1);
    });
    it('锁状态可查询', () => {
      const state = getViewportState();
      expect(state.isLocked()).toBe(false);
      state.lockUpdates(true);
      expect(state.isLocked()).toBe(true);
    });
  });

  describe('派生字段', () => {
    it('selectionRatio 自动算 = selectionCount/totalCount', () => {
      const state = getViewportState();
      state.updateBatch({ totalCount: 200, selectionCount: 50 });
      expect(state.read().selectionRatio).toBe(0.25);
    });
    it('totalCount=0 时 selectionRatio=0 不 NaN', () => {
      const state = getViewportState();
      expect(state.read().selectionRatio).toBe(0);
    });
    it('cameraMood 与 distance 联动', () => {
      const state = getViewportState();
      state.updateBatch({ cameraStable: true, cameraDistance: 0.1 });
      expect(state.read().cameraMood).toBe('orbit');
      state.update('cameraDistance', 0.5);
      expect(state.read().cameraMood).toBe('face');
    });
    it('unstable 时 cameraMood=smooth', () => {
      const state = getViewportState();
      state.update('cameraStable', false);
      expect(state.read().cameraMood).toBe('smooth');
    });
    it('derivedShape 由 wholesomeness 计算', () => {
      const state = getViewportState();
      state.updateBatch({ totalCount: 100, selectionCount: 50 });
      const s = state.read();
      expect(typeof s.wholesomeness).toBe('number');
      expect(Object.values(SHAPES)).toContain(s.derivedShape);
    });
  });

  describe('dispose 与边界', () => {
    it('dispose 后 read 抛错', () => {
      const state = getViewportState();
      state.dispose();
      expect(() => state.read()).toThrow();
    });
    it('dispose 后 update 抛错', () => {
      const state = getViewportState();
      state.dispose();
      expect(() => state.update('totalCount', 1)).toThrow();
    });
    it('dispose 后 subscribe 抛错', () => {
      const state = getViewportState();
      state.dispose();
      expect(() => state.subscribe(() => {})).toThrow();
    });
    it('resetViewportState 清空旧实例', () => {
      const a = getViewportState();
      resetViewportState();
      const b = getViewportState();
      expect(a).not.toBe(b);
      expect(() => a.read()).toThrow();
    });
  });
});
