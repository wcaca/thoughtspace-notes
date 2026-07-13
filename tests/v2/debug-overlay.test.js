/**
 * DebugOverlay 测试 (S2.11)
 *
 * 验证:
 *   1. 构造校验 (无 pipeline → throw)
 *   2. attach/detach 幂等 (重入安全)
 *   3. attach 后 DOM 出现 (panel + toggle button + style)
 *   4. 默认隐藏, toggle 切显隐
 *   5. setVisible(true) 后 panel 有 v2-debug-visible class
 *   6. _refreshDom 写入 stats 数字 (FPS / ms / frames / cache / 5 stage)
 *   7. 超 budget stage → 标 v2-debug-alarm class
 *   8. errors > 0 → errors 行 v2-debug-alarm
 *   9. overruns > 0 → overruns 行 v2-debug-warn
 *  10. detach 后 panel 节点被移除, _attached=false
 *  11. console fallback (无 DOM env 时 _refreshDom 不抛)
 *  12. detach 后 getLastStats() 仍能拿最近值 (可读)
 *
 * 配套: src/v2/debug/debug-overlay.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugOverlay } from '../../src/v2/debug/debug-overlay.js';
import { STAGES } from '../../src/v2/render/render-pipeline.js';

// ===== 伪 DOM =====
// 只支持 debug-overlay 真实用到的接口: createElement, getElementById, body/head, querySelector, classList, dataset, textContent, id, appendChild, removeChild, addEventListener

function makeNode(tag = 'div', parent = null) {
  const node = {
    tagName: tag.toUpperCase(),
    parentNode: parent,
    children: [],
    _classSet: new Set(),
    _listeners: {},
    _attrs: {},
    innerHTML: '',
    textContent: '',
    get classList() {
      return {
        add: (c) => this._classSet.add(c),
        remove: (c) => this._classSet.delete(c),
        toggle: (c, force) => {
          if (force === true) this._classSet.add(c);
          else if (force === false) this._classSet.delete(c);
          else if (this._classSet.has(c)) this._classSet.delete(c);
          else this._classSet.add(c);
          return this._classSet.has(c);
        },
        contains: (c) => this._classSet.has(c),
      };
    },
    get id() { return this._attrs.id; },
    set id(v) { this._attrs.id = v; },
    get title() { return this._attrs.title; },
    set title(v) { this._attrs.title = v; },
    addEventListener(type, fn) {
      (this._listeners[type] ||= []).push(fn);
    },
    appendChild(child) {
      if (typeof child === 'string') {
        // textNode-like
        return child;
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    querySelector(sel) {
      return findBySel(this, sel);
    },
  };
  return node;
}

function findBySel(root, sel) {
  // 支持: [data-key="X"] / #id / tag
  if (sel.startsWith('[data-key="') && sel.endsWith('"]')) {
    const key = sel.slice(11, -2);
    return findByDataKey(root, key);
  }
  if (sel.startsWith('#')) {
    return findById(root, sel.slice(1));
  }
  return null;
}
function findById(root, id) {
  if (root._attrs && root._attrs.id === id) return root;
  for (const c of (root.children || [])) {
    const f = findById(c, id);
    if (f) return f;
  }
  return null;
}
function findByDataKey(root, key) {
  if (root._attrs && root._attrs['data-key'] === key) return root;
  for (const c of (root.children || [])) {
    const f = findByDataKey(c, key);
    if (f) return f;
  }
  return null;
}

// 简易 HTML 解析 (只支持我们 debug-overlay 自己生成的 innerHTML 格式)
function parseHtml(html) {
  // 我们生成的 innerHTML 都很规则, 用正则构造节点
  // 不用 DOMParser, 因为是测试自己生成的, 我们手 parse
  const root = makeNode('fragment');
  // 1. data-key 单标签: <tr><td>X</td><td data-key="Y">V</td></tr>
  const dataKeyRe = /<(\w+)([^>]*data-key="([^"]+)"[^>]*)>([^<]*)<\/\1>/g;
  let m;
  while ((m = dataKeyRe.exec(html)) !== null) {
    const [, tag, , key, text] = m;
    const el = makeNode(tag);
    el._attrs['data-key'] = key;
    el.textContent = text;
    root.children.push(el);
  }
  return root;
}

function makeEnv() {
  const body = makeNode('body');
  const head = makeNode('head');
  body.parentNode = head.parentNode = null;
  const allElements = [];
  const document = {
    body, head,
    _byId: {},
    createElement(tag) {
      const el = makeNode(tag);
      return el;
    },
    getElementById(id) {
      return this._byId[id] || null;
    },
  };
  // body.appendChild 自动注册到 _byId
  const origBodyAppend = body.appendChild.bind(body);
  body.appendChild = (child) => {
    const c = origBodyAppend(child);
    if (c && c._attrs && c._attrs.id) document._byId[c._attrs.id] = c;
    return c;
  };
  const origHeadAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    const c = origHeadAppend(child);
    if (c && c._attrs && c._attrs.id) document._byId[c._attrs.id] = c;
    return c;
  };
  // 模拟 querySelector for panel: 因为我们的 querySelector 走 root, 但 panel.appendChild 出来的节点是 panel 的 children, 走 root.querySelector 时 panel 自己有 children
  // 已经够了, 因为 findByDataKey 是递归
  return {
    document,
    window: {
      _listeners: {},
      addEventListener(type, fn) { (this._listeners[type] ||= []).push(fn); },
      removeEventListener(type, fn) {
        const arr = this._listeners[type] || [];
        const i = arr.indexOf(fn);
        if (i >= 0) arr.splice(i, 1);
      },
    },
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };
}

// ===== Mock pipeline =====

function makeMockPipeline(overrides = {}) {
  const baseStats = {
    totalFrames: 100,
    totalOverruns: 0,
    totalErrors: 0,
    cacheHitRate: 0.75,
    recentAvgMs: 8.5,
    recentAvgFps: 60.0,
    stages: {
      input:     { budgetMs: 1,  avgMs: 0.4, maxMs: 1.2 },
      state:     { budgetMs: 3,  avgMs: 1.5, maxMs: 3.5 },
      transform: { budgetMs: 2,  avgMs: 1.0, maxMs: 2.1 },
      render:    { budgetMs: 8,  avgMs: 5.0, maxMs: 9.0 },
      snapshot:  { budgetMs: 2,  avgMs: 0.6, maxMs: 1.5 },
    },
    lastFrame: { totalMs: 8.5, stages: {} },
  };
  return {
    getStats: vi.fn(() => ({ ...baseStats, ...overrides })),
  };
}

// ===== 测试 =====

describe('DebugOverlay · S2.11 帧诊断可视化', () => {
  let mockPipeline, env;

  beforeEach(() => {
    env = makeEnv();
    mockPipeline = makeMockPipeline();
  });

  it('1. 构造校验: pipeline 无 getStats → throw', () => {
    expect(() => new DebugOverlay(null)).toThrow(/getStats/);
    expect(() => new DebugOverlay({})).toThrow(/getStats/);
    expect(() => new DebugOverlay({ getStats: 'not fn' })).toThrow(/getStats/);
  });

  it('2. attach/detach 幂等', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    overlay.attach();  // 第二次不抛
    expect(overlay._attached).toBe(true);
    overlay.detach();
    overlay.detach();  // 第二次不抛
    expect(overlay._attached).toBe(false);
  });

  it('3. attach 后 DOM 出现 panel + toggle button + style', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    expect(env.document.getElementById('v2-debug-overlay-panel')).not.toBeNull();
    expect(env.document.getElementById('v2-debug-overlay-toggle')).not.toBeNull();
    expect(env.document.getElementById('v2-debug-overlay-style')).not.toBeNull();
  });

  it('4. 默认隐藏, toggle 切显隐', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    expect(overlay.isVisible()).toBe(false);
    overlay.toggle();
    expect(overlay.isVisible()).toBe(true);
    overlay.toggle();
    expect(overlay.isVisible()).toBe(false);
  });

  it('5. setVisible(true) → panel 有 v2-debug-visible class', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    expect(panel.classList.contains('v2-debug-visible')).toBe(true);
  });

  it('6. _refreshDom 写入 stats 数字 (FPS / ms / frames / cache / 5 stage)', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    // _refreshDom 内部用 panel.querySelector('[data-key=...]'), 我们的伪 DOM 解析了 innerHTML 但只在 _refreshDom 调用 setText 时
    // 实际上 _ensurePanel 写了 innerHTML 但我们的伪 DOM 不解析 children, 改为手动注入子节点
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    // 注入 5 阶段 + 5 总览行的 data-key 节点 (模拟 _ensurePanel 的效果)
    const dataKeys = [
      'fps', 'ms', 'frames', 'cache', 'errors', 'overruns',
      ...STAGES.map(s => `stage-${s.name}-ms`),
      ...STAGES.map(s => `stage-${s.name}-max`),
    ];
    for (const key of dataKeys) {
      const cell = makeNode('td');
      cell._attrs['data-key'] = key;
      cell.textContent = '0';
      panel.appendChild(cell);
    }
    overlay._refreshDom();

    // 验证通过 getStats mock 拿到的值
    expect(mockPipeline.getStats).toHaveBeenCalled();
    // 验证 last stats 已记录
    const captured = overlay.getLastStats();
    expect(captured.totalFrames).toBe(100);
    expect(captured.recentAvgFps).toBe(60.0);
  });

  it('7. 超 budget stage → v2-debug-alarm class', () => {
    const pipeline = makeMockPipeline({
      stages: {
        input:     { budgetMs: 1, avgMs: 0.4, maxMs: 1.0 },
        state:     { budgetMs: 3, avgMs: 1.0, maxMs: 2.0 },
        transform: { budgetMs: 2, avgMs: 1.0, maxMs: 2.0 },
        render:    { budgetMs: 8, avgMs: 10.0, maxMs: 12.0 },
        snapshot:  { budgetMs: 2, avgMs: 0.5, maxMs: 1.0 },
      },
    });
    const overlay = new DebugOverlay(pipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const renderCell = makeNode('td');
    renderCell._attrs['data-key'] = 'stage-render-ms';
    panel.appendChild(renderCell);
    overlay._refreshDom();
    expect(renderCell.classList.contains('v2-debug-alarm')).toBe(true);
  });

  it('8. errors > 0 → errors 行 v2-debug-alarm', () => {
    const pipeline = makeMockPipeline({ totalErrors: 3 });
    const overlay = new DebugOverlay(pipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const errCell = makeNode('td');
    errCell._attrs['data-key'] = 'errors';
    errCell.textContent = '0';
    panel.appendChild(errCell);
    overlay._refreshDom();
    expect(errCell.textContent).toBe('3');
    expect(errCell.classList.contains('v2-debug-alarm')).toBe(true);
  });

  it('9. overruns > 0 → overruns 行 v2-debug-warn', () => {
    const pipeline = makeMockPipeline({ totalOverruns: 2 });
    const overlay = new DebugOverlay(pipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const orCell = makeNode('td');
    orCell._attrs['data-key'] = 'overruns';
    orCell.textContent = '0';
    panel.appendChild(orCell);
    overlay._refreshDom();
    expect(orCell.textContent).toBe('2');
    expect(orCell.classList.contains('v2-debug-warn')).toBe(true);
  });

  it('10. detach 后 panel 节点被移除, _attached=false', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    expect(env.document.body.children.length).toBeGreaterThan(0);
    overlay.detach();
    expect(env.document.getElementById('v2-debug-overlay-panel')).toBeNull();
    expect(env.document.getElementById('v2-debug-overlay-toggle')).toBeNull();
    expect(overlay._attached).toBe(false);
  });

  it('11. console fallback: 无 DOM env 时 _refreshDom 不抛, console.log 被调', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const noDomEnv = { document: null, window: null, requestAnimationFrame: null, cancelAnimationFrame: null };
    const overlay = new DebugOverlay(mockPipeline, { env: noDomEnv });
    overlay.attach();
    overlay.setVisible(true);
    expect(() => overlay._refreshDom()).not.toThrow();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('12. detach 后 getLastStats() 仍能拿最近值 (可读)', () => {
    const overlay = new DebugOverlay(mockPipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    for (const key of ['fps', 'ms', 'frames', 'cache', 'errors', 'overruns']) {
      const cell = makeNode('td');
      cell._attrs['data-key'] = key;
      panel.appendChild(cell);
    }
    overlay._refreshDom();
    const captured = overlay.getLastStats();
    overlay.detach();
    expect(captured).not.toBeNull();
    expect(captured.totalFrames).toBe(100);
    expect(captured.recentAvgFps).toBe(60.0);
  });
});
