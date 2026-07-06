/**
 * [INPUT]: src/render/observe-views.js (SP-1 双模式 + 召唤 + 渲染)
 * [OUTPUT]: 验证 buildCanvasTabs / renderBlockMode / renderBackgroundMode
 * [POS]: tests/render 下,被 vitest 消费 (jsdom)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('observe-views SP-1 集成 (T2)', () => {
  let _sp1StateBackup = null;

  beforeEach(() => {
    document.body.innerHTML = '';
    _sp1StateBackup = global.window.__sp1State;
  });
  afterEach(() => {
    document.body.innerHTML = '';
    if (_sp1StateBackup) global.window.__sp1State = _sp1StateBackup;
  });

  function setupSp1State({ mode = 'background', layers = [], currentAxis = 'time', manualOrder = [] } = {}) {
    global.window.__sp1State = {
      getCanvasMode: () => mode,
      setCanvasMode: (m) => { global.window.__sp1State.getCanvasMode = () => m; },
      getLayers: () => layers,
      getCurrentAxis: () => currentAxis,
      getCurrentOrder: (thoughts) => {
        if (manualOrder.length > 0) {
          const map = new Map(manualOrder.map((id, i) => [id, i]));
          return thoughts.slice().sort((a, b) => (map.get(a.id) ?? Infinity) - (map.get(b.id) ?? Infinity));
        }
        return thoughts;
      }
    };
  }

  describe('顶部双模式 tab', () => {
    it('观察模式启动时,顶部出现 [背景分区][内容块] 两个 tab', async () => {
      setupSp1State();
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1', text: 'a' }], {});
      await new Promise((r) => setTimeout(r, 10));
      const tabs = document.querySelectorAll('.ob-canvas-tab');
      expect(tabs.length).toBe(2);
      expect(tabs[0].textContent).toContain('背景分区');
      expect(tabs[1].textContent).toContain('内容块');
    });

    it('默认 canvas-mode=background, 背景 tab 处于激活', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1', text: 'a' }], {});
      await new Promise((r) => setTimeout(r, 10));
      const active = document.querySelector('.ob-canvas-tab.is-active');
      expect(active).toBeTruthy();
      expect(active.textContent).toContain('背景分区');
    });

    it('点击 [内容块] tab 切换激活', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1', text: 'a' }], {});
      await new Promise((r) => setTimeout(r, 10));
      const blockTab = Array.from(document.querySelectorAll('.ob-canvas-tab')).find((b) => b.textContent.includes('内容块'));
      blockTab.click();
      const active = document.querySelector('.ob-canvas-tab.is-active');
      expect(active.textContent).toContain('内容块');
    });

    it('点击当前 tab 不会重复触发', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1', text: 'a' }], {});
      await new Promise((r) => setTimeout(r, 10));
      const bgTab = Array.from(document.querySelectorAll('.ob-canvas-tab')).find((b) => b.textContent.includes('背景分区'));
      const before = document.querySelector('.ob-canvas-tab.is-active').textContent;
      bgTab.click();
      const after = document.querySelector('.ob-canvas-tab.is-active').textContent;
      expect(after).toBe(before);
    });
  });

  describe('背景模式渲染', () => {
    it('canvas-mode=background 时渲染 4 个 bucket 列', async () => {
      setupSp1State({ mode: 'background', layers: [{ id: 'L1', name: 'A' }, { id: 'L2', name: 'B' }] });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      const thoughts = [
        { id: 't1', text: 'hot', temperature: 0.9 },
        { id: 't2', text: 'warm', temperature: 0.5 },
        { id: 't3', text: 'cold', temperature: 0.05 }
      ];
      showObserveView('cards', thoughts, {});
      await new Promise((r) => setTimeout(r, 10));
      const cols = document.querySelectorAll('.ob-bg-col');
      expect(cols.length).toBe(4);
    });

    it('背景模式显示 layer 信息', async () => {
      setupSp1State({ mode: 'background', layers: [{ id: 'L1' }, { id: 'L2' }, { id: 'L3' }] });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [], {});
      await new Promise((r) => setTimeout(r, 10));
      const info = document.querySelector('.ob-bg-layer-info');
      expect(info).toBeTruthy();
      expect(info.textContent).toContain('3 个层');
    });

    it('温度 >60% 进入 burning 列', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1', text: 'hot', temperature: 0.8 }], {});
      await new Promise((r) => setTimeout(r, 10));
      const burning = document.querySelector('.ob-bg-col[data-bucket="burning"]');
      expect(burning.querySelector('.ob-card')).toBeTruthy();
    });
  });

  describe('块模式渲染', () => {
    it('canvas-mode=block 时渲染卡片网格', async () => {
      setupSp1State({ mode: 'block' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      const thoughts = [
        { id: 't1', text: 'a' },
        { id: 't2', text: 'b' }
      ];
      showObserveView('cards', thoughts, {});
      await new Promise((r) => setTimeout(r, 10));
      const grid = document.querySelector('.ob-block-grid');
      expect(grid).toBeTruthy();
      expect(grid.querySelectorAll('.ob-card').length).toBe(2);
    });

    it('块模式显示当前排序轴', async () => {
      setupSp1State({ mode: 'block', currentAxis: 'heat' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1' }], {});
      await new Promise((r) => setTimeout(r, 10));
      const bar = document.querySelector('.ob-block-mode-bar');
      expect(bar).toBeTruthy();
      expect(bar.textContent).toContain('heat');
    });

    it('块模式应用 manualOrder 排序', async () => {
      setupSp1State({ mode: 'block', manualOrder: ['t2', 't1', 't3'] });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      const thoughts = [
        { id: 't1', text: 'a' },
        { id: 't2', text: 'b' },
        { id: 't3', text: 'c' }
      ];
      showObserveView('cards', thoughts, {});
      await new Promise((r) => setTimeout(r, 10));
      const cards = document.querySelectorAll('.ob-block-grid .ob-card');
      expect(cards[0].dataset.thoughtId).toBe('t2');
      expect(cards[1].dataset.thoughtId).toBe('t1');
      expect(cards[2].dataset.thoughtId).toBe('t3');
    });
  });

  describe('与现有观察模式共存', () => {
    it('canvas-mode=background + observe-mode=kanban → 渲染背景模式', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('kanban', [{ id: 't1', temperature: 0.5 }], {});
      await new Promise((r) => setTimeout(r, 10));
      expect(document.querySelector('.ob-background-mode')).toBeTruthy();
    });

    it('canvas-mode=background + observe-mode=timeline → 渲染背景模式(SP-1 优先)', async () => {
      setupSp1State({ mode: 'background' });
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('timeline', [{ id: 't1', createdAt: 1 }], {});
      await new Promise((r) => setTimeout(r, 10));
      expect(document.querySelector('.ob-background-mode')).toBeTruthy();
    });

    it('观察模式切换按钮仍然存在', async () => {
      setupSp1State();
      const { showObserveView } = await import('../../src/render/observe-views.js');
      showObserveView('cards', [{ id: 't1' }], {});
      await new Promise((r) => setTimeout(r, 10));
      expect(document.querySelectorAll('.ob-switch-btn').length).toBe(3);
    });
  });

  describe('缺少 __sp1State 时优雅降级', () => {
    it('没有 __sp1State 不报错,只缺 SP-1 tab', async () => {
      global.window.__sp1State = null;
      const { showObserveView } = await import('../../src/render/observe-views.js');
      expect(() => showObserveView('cards', [{ id: 't1' }], {})).not.toThrow();
      await new Promise((r) => setTimeout(r, 10));
      expect(document.querySelectorAll('.ob-canvas-tab').length).toBe(0);
      expect(document.querySelector('.ob-content')).toBeTruthy();
    });
  });
});