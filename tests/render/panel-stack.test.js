/**
 * [POS]: tests/render/panel-stack.test.js — 面板栈单开原则
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { getPanelStack } from '../../src/render/panel-stack.js';

describe('panel stack', () => {
  beforeEach(() => {
    const s = getPanelStack();
    s.dispose();
  });

  it('starts empty after dispose', () => {
    const s = getPanelStack();
    expect(s.isAnyOpen()).toBe(false);
  });

  it('open and close single panel', () => {
    const s = getPanelStack();
    const el = { dataset: {}, parentNode: null };
    s.open('test', el);
    expect(s.isOpen('test')).toBe(true);
    s.close('test');
    expect(s.isOpen('test')).toBe(false);
  });

  it('singleton 强制单开:打开新 singleton 自动关旧 singleton', () => {
    const s = getPanelStack();
    const elA = { dataset: {}, parentNode: null };
    const elB = { dataset: {}, parentNode: null };
    s.open('help', elA);
    s.open('zone', elB);
    expect(s.isOpen('help')).toBe(false);
    expect(s.isOpen('zone')).toBe(true);
  });

  it('closeAll 关闭所有', () => {
    const s = getPanelStack();
    s.open('a', { dataset: {} });
    s.open('b', { dataset: {} });
    s.open('c', { dataset: {} });
    const n = s.closeAll();
    expect(n).toBe(3);
    expect(s.isAnyOpen()).toBe(false);
  });

  it('onChange 通知', () => {
    const s = getPanelStack();
    let count = 0;
    s.onChange(() => count++);
    s.open('x', { dataset: {} });
    s.close('x');
    expect(count).toBe(2);
  });

  it('多次开同一个 id 替换', () => {
    const s = getPanelStack();
    const elA = { dataset: {} };
    const elB = { dataset: {} };
    s.open('help', elA);
    s.open('help', elB);
    expect(s._stack.filter((x) => x.id === 'help').length).toBe(1);
  });
});