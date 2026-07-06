/**
 * [INPUT]: src/render/observe-views.js
 * [OUTPUT]: 验证观察模式核心场景,尤其是视图切换不递归关闭
 * [POS]: tests/render 下,被 vitest 消费(jsdom)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

async function flush(microtasks = 10) {
  for (let i = 0; i < microtasks; i++) {
    await new Promise((r) => setTimeout(r, 0));
  }
}

describe('observe-views 切换视图', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('T11 bug: 卡片→看板 切换,看板视图保留可见', async () => {
    const { showObserveView, hideObserveView, isObserveViewOpen } = await import('../../src/render/observe-views.js');
    const thoughts = [
      { id: 't1', text: 'first', x: 0, y: 0, z: 0, temperature: 0.7, labels: [], createdAt: 1 },
      { id: 't2', text: 'second', x: 1, y: 0, z: 0, temperature: 0.3, labels: [], createdAt: 2 }
    ];
    let currentMode = 'cards';
    let newOverlay = null;

    showObserveView('cards', thoughts, {
      onSwitch: (m) => {
        currentMode = m;
        newOverlay = showObserveView(m, thoughts, {});
      }
    });
    await new Promise((r) => setTimeout(r, 10));

    const kanbanBtn = Array.from(document.querySelectorAll('.ob-switch-btn'))
      .find((b) => b.textContent.includes('看板'));
    expect(kanbanBtn).toBeTruthy();
    kanbanBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    expect(currentMode).toBe('kanban');
    expect(isObserveViewOpen()).toBe(true);
    const allCards = document.querySelectorAll('.ob-kanban-col');
    expect(allCards.length).toBe(4);
    const oldRoots = document.querySelectorAll('[data-panel-id="observe"]');
    expect(oldRoots.length).toBeGreaterThanOrEqual(1);
  });

  it('卡片→时间线 切换,时间线视图保留可见', async () => {
    const { showObserveView, hideObserveView, isObserveViewOpen } = await import('../../src/render/observe-views.js');
    const thoughts = [
      { id: 't1', text: 'first', x: 0, y: 0, z: 0, temperature: 0.7, labels: [], createdAt: 1 },
      { id: 't2', text: 'second', x: 1, y: 0, z: 0, temperature: 0.3, labels: [], createdAt: 2 }
    ];
    let currentMode = 'cards';
    showObserveView('cards', thoughts, {
      onSwitch: (m) => {
        currentMode = m;
        hideObserveView();
        showObserveView(m, thoughts, {});
      }
    });
    await new Promise((r) => setTimeout(r, 10));

    const timelineBtn = Array.from(document.querySelectorAll('.ob-switch-btn'))
      .find((b) => b.textContent.includes('时间线'));
    expect(timelineBtn).toBeTruthy();
    timelineBtn.click();
    await new Promise((r) => setTimeout(r, 400));

    expect(currentMode).toBe('timeline');
    expect(isObserveViewOpen()).toBe(true);
    const tl = document.querySelector('.ob-timeline');
    expect(tl).toBeTruthy();
    const oldRoots = document.querySelectorAll('[data-panel-id="observe"]');
    expect(oldRoots.length).toBeGreaterThanOrEqual(1);
  });
});