/**
 * [INPUT]: src/render/canvas-mode.js
 * [OUTPUT]: 验证双模式状态机 + 订阅 + 持久化
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect, vi } from 'vitest';
import { createCanvasMode, CANVAS_MODES } from '../../src/render/canvas-mode.js';

describe('CanvasMode 双模式状态机 (SP-1)', () => {
  it('默认是 background 模式', () => {
    const cm = createCanvasMode();
    expect(cm.getMode()).toBe(CANVAS_MODES.BACKGROUND);
  });

  it('setMode 切换到 block', () => {
    const cm = createCanvasMode();
    expect(cm.setMode(CANVAS_MODES.BLOCK)).toBe(true);
    expect(cm.getMode()).toBe(CANVAS_MODES.BLOCK);
  });

  it('setMode 非法模式返回 false', () => {
    const cm = createCanvasMode();
    expect(cm.setMode('invalid')).toBe(false);
    expect(cm.getMode()).toBe(CANVAS_MODES.BACKGROUND);
  });

  it('setMode 切换相同模式不通知订阅者', () => {
    const cm = createCanvasMode();
    const fn = vi.fn();
    cm.subscribe(fn);
    cm.setMode(CANVAS_MODES.BACKGROUND);
    expect(fn).not.toHaveBeenCalled();
  });

  it('setMode 切换不同模式通知订阅者', () => {
    const cm = createCanvasMode();
    const fn = vi.fn();
    cm.subscribe(fn);
    cm.setMode(CANVAS_MODES.BLOCK);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith({
      from: CANVAS_MODES.BACKGROUND,
      to: CANVAS_MODES.BLOCK,
      at: expect.any(Number)
    });
  });

  it('subscribe 返回退订函数', () => {
    const cm = createCanvasMode();
    const fn = vi.fn();
    const off = cm.subscribe(fn);
    off();
    cm.setMode(CANVAS_MODES.BLOCK);
    expect(fn).not.toHaveBeenCalled();
  });

  it('subscribe 非函数被忽略', () => {
    const cm = createCanvasMode();
    const off = cm.subscribe('not_a_function');
    expect(typeof off).toBe('function');
    expect(() => cm.setMode(CANVAS_MODES.BLOCK)).not.toThrow();
  });

  it('订阅者抛错不影响其他订阅者', () => {
    const cm = createCanvasMode();
    const fn1 = vi.fn(() => { throw new Error('boom'); });
    const fn2 = vi.fn();
    cm.subscribe(fn1);
    cm.subscribe(fn2);
    cm.setMode(CANVAS_MODES.BLOCK);
    expect(fn2).toHaveBeenCalled();
  });

  it('is 判断当前模式', () => {
    const cm = createCanvasMode();
    expect(cm.is(CANVAS_MODES.BACKGROUND)).toBe(true);
    cm.setMode(CANVAS_MODES.BLOCK);
    expect(cm.is(CANVAS_MODES.BLOCK)).toBe(true);
    expect(cm.is(CANVAS_MODES.BACKGROUND)).toBe(false);
  });

  it('setMode force=true 即使相同模式也通知', () => {
    const cm = createCanvasMode();
    const fn = vi.fn();
    cm.subscribe(fn);
    cm.setMode(CANVAS_MODES.BACKGROUND, { force: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('MODES 暴露合法常量', () => {
    expect(CANVAS_MODES.BACKGROUND).toBe('background');
    expect(CANVAS_MODES.BLOCK).toBe('block');
  });

  it('toJSON / fromJSON 还原', () => {
    const a = createCanvasMode();
    a.setMode(CANVAS_MODES.BLOCK);
    const json = a.toJSON();
    expect(json).toEqual({ mode: CANVAS_MODES.BLOCK });
    const b = createCanvasMode();
    b.fromJSON(json);
    expect(b.getMode()).toBe(CANVAS_MODES.BLOCK);
  });

  it('fromJSON 非法 mode 静默忽略', () => {
    const cm = createCanvasMode();
    cm.fromJSON({ mode: 'bogus' });
    expect(cm.getMode()).toBe(CANVAS_MODES.BACKGROUND);
  });

  it('fromJSON 接受 null/非对象', () => {
    const cm = createCanvasMode();
    cm.setMode(CANVAS_MODES.BLOCK);
    cm.fromJSON(null);
    expect(cm.getMode()).toBe(CANVAS_MODES.BLOCK);
  });

  it('reset 清空订阅并回到默认', () => {
    const cm = createCanvasMode();
    const fn = vi.fn();
    cm.subscribe(fn);
    cm.reset();
    expect(cm.getMode()).toBe(CANVAS_MODES.BACKGROUND);
    cm.setMode(CANVAS_MODES.BLOCK);
    expect(fn).not.toHaveBeenCalled();
  });
});