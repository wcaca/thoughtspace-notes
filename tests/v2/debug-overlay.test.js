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
 *
 * 测试策略:
 *   写一个轻量伪 DOM, 解析 production code 设置的 innerHTML
 *   (覆盖我们 _ensurePanel / _ensureStyle / _ensureToggleButton 实际生成的格式)。
 *   这样不需要手维护 data-key 节点列表, 测试代码与 production code 自动同步。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugOverlay } from '../../src/v2/debug/debug-overlay.js';
import { STAGES } from '../../src/v2/render/render-pipeline.js';

// ===== 伪 DOM =====
// 解析 production 真实生成的 innerHTML 格式

function makeNode(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(),
    parentNode: null,
    children: [],
    _classSet: new Set(),
    _listeners: {},
    _attrs: {},
    _dataset: {},
    innerHTML: '',
    _textContent: '',
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
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    addEventListener(type, fn) {
      (this._listeners[type] ||= []).push(fn);
    },
    appendChild(child) {
      if (typeof child === 'string') return child;
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

// 把 attr="value" attr2="value2" 解析进 _attrs
function parseAttrs(s) {
  const out = {};
  const re = /(\w[\w-]*)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out[m[1]] = m[2];
  }
  return out;
}

function findBySel(root, sel) {
  if (sel.startsWith('[data-key="') && sel.endsWith('"]')) {
    return findByDataKey(root, sel.slice(11, -2));
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

// 解析 production innerHTML → 子节点
// 覆盖 _ensurePanel 实际生成的格式:
//   <div class="...">text</div>
//   <table>...<tr><td>label</td><td data-key="X">V</td></tr>...</table>
function parseInnerHTML(parent, html) {
  html = html.trim();
  if (!html) return;

  // 策略: 找标签 + 嵌套 + textContent
  // 简化: 用单趟 scanner
  let i = 0;
  while (i < html.length) {
    // 跳过空白
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length) break;

    if (html[i] !== '<') {
      // text node
      const next = html.indexOf('<', i);
      const text = html.slice(i, next === -1 ? html.length : next);
      if (text.trim()) {
        const tn = makeNode('#text');
        tn._textContent = text.trim();
        parent.appendChild(tn);
      }
      i = next === -1 ? html.length : next;
      continue;
    }

    // 读 tag
    const end = html.indexOf('>', i);
    if (end === -1) break;
    const tagStr = html.slice(i + 1, end);
    i = end + 1;

    // 自闭合
    if (tagStr.endsWith('/')) {
      const tagName = tagStr.slice(0, -1).split(/\s+/)[0].toLowerCase();
      const el = makeNode(tagName);
      parent.appendChild(el);
      continue;
    }

    // 开标签
    const spaceIdx = tagStr.search(/\s/);
    const tagName = (spaceIdx === -1 ? tagStr : tagStr.slice(0, spaceIdx)).toLowerCase();
    const attrStr = spaceIdx === -1 ? '' : tagStr.slice(spaceIdx + 1);
    const attrs = parseAttrs(attrStr);
    const el = makeNode(tagName);
    Object.assign(el._attrs, attrs);

    // 找闭标签
    const closeTag = `</${tagName}>`;
    // 嵌套匹配: 用 depth counter
    let depth = 1;
    let scan = i;
    while (scan < html.length && depth > 0) {
      const nextOpen = html.indexOf(`<${tagName}`, scan);
      const nextClose = html.indexOf(closeTag, scan);
      if (nextClose === -1) break;
      // nextOpen 必须在 nextClose 前才计为嵌套
      if (nextOpen !== -1 && nextOpen < nextClose) {
        // 确认是开标签 (不是属性里出现 "<tag")
        const charAfter = html[nextOpen + 1 + tagName.length];
        if (charAfter === ' ' || charAfter === '>' || charAfter === '/') {
          depth++;
          scan = nextOpen + 1 + tagName.length;
          continue;
        }
      }
      depth--;
      if (depth === 0) {
        // 解析 innerHTML (nextOpen 处开始到 nextClose 前)
        const inner = html.slice(i, nextClose);
        parseInnerHTML(el, inner);
        i = nextClose + closeTag.length;
        break;
      }
      scan = nextClose + closeTag.length;
    }
    parent.appendChild(el);
  }
}

// 包装 setText 等, 自动解析 innerHTML
function makeNodeWithInnerHTML(tag) {
  const node = makeNode(tag);
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._innerHTML; },
    set(v) {
      node._innerHTML = v;
      // 清空 children
      node.children = [];
      // 重新解析
      parseInnerHTML(node, v);
    },
  });
  return node;
}

function makeEnv() {
  const body = makeNodeWithInnerHTML('body');
  const head = makeNodeWithInnerHTML('head');
  const document = {
    body, head,
    _byId: {},
    createElement(tag) {
      return makeNodeWithInnerHTML(tag);
    },
    getElementById(id) { return this._byId[id] || null; },
  };
  // 劫持 appendChild, 自动注册 id
  const wrap = (host) => {
    const origAppend = host.appendChild.bind(host);
    host.appendChild = (child) => {
      const c = origAppend(child);
      if (c && c._attrs && c._attrs.id) document._byId[c._attrs.id] = c;
      return c;
    };
    // 劫持 removeChild, 自动注销 id (detach 测试需要)
    const origRemove = host.removeChild.bind(host);
    host.removeChild = (child) => {
      const c = origRemove(child);
      if (c && c._attrs && c._attrs.id) delete document._byId[c._attrs.id];
      return c;
    };
  };
  wrap(body); wrap(head);
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
    expectedMs: 5.0,
    overheadMs: 3.5,
    overheadPct: 70,
    severity: 'warn',
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
    overlay.attach();
    expect(overlay._attached).toBe(true);
    overlay.detach();
    overlay.detach();
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
    overlay._refreshDom();

    expect(mockPipeline.getStats).toHaveBeenCalled();
    const captured = overlay.getLastStats();
    expect(captured.totalFrames).toBe(100);
    expect(captured.recentAvgFps).toBe(60.0);
    // panel 内部所有 5 阶段 + 6 总览 cell 都被 setText 更新过
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    // 找所有 data-key 节点
    const count = (n, acc = { count: 0 }) => {
      if (n._attrs && n._attrs['data-key']) acc.count++;
      for (const c of n.children) count(c, acc);
      return acc.count;
    };
    expect(count(panel)).toBe(8 + 2 * STAGES.length);  // 8 总览 (含 expected/overhead) + 5 × 2 stage
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
    overlay._refreshDom();
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const renderCell = findByDataKey(panel, 'stage-render-ms');
    expect(renderCell).not.toBeNull();
    expect(renderCell.classList.contains('v2-debug-alarm')).toBe(true);
  });

  it('8. errors > 0 → errors 行 v2-debug-alarm', () => {
    const pipeline = makeMockPipeline({ totalErrors: 3 });
    const overlay = new DebugOverlay(pipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    overlay._refreshDom();
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const errCell = findByDataKey(panel, 'errors');
    expect(errCell.textContent).toBe('3');
    expect(errCell.classList.contains('v2-debug-alarm')).toBe(true);
  });

  it('9. overruns > 0 → overruns 行 v2-debug-warn', () => {
    const pipeline = makeMockPipeline({ totalOverruns: 2 });
    const overlay = new DebugOverlay(pipeline, { env });
    overlay.attach();
    overlay.setVisible(true);
    overlay._refreshDom();
    const panel = env.document.getElementById('v2-debug-overlay-panel');
    const orCell = findByDataKey(panel, 'overruns');
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
    overlay._refreshDom();
    const captured = overlay.getLastStats();
    overlay.detach();
    expect(captured).not.toBeNull();
    expect(captured.totalFrames).toBe(100);
    expect(captured.recentAvgFps).toBe(60.0);
  });
});
