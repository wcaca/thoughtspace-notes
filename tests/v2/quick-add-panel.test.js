/**
 * QuickAddPanel 测试 (S2.13)
 *
 * 验证:
 *   1. 构造校验 (无 onAdd → throw)
 *   2. attach/detach 幂等
 *   3. attach 后 DOM 出现 (panel + toggle button + style)
 *   4. 默认隐藏, toggle 切显隐
 *   5. setVisible(true) 后 panel 有 v2-qa-visible class
 *   6. 文字空时 confirm 按钮 disabled
 *   7. 输入文字后 confirm enabled, _onAdd 收到正确 {text, layerId}
 *   8. _onAdd 返 {ok:false,error} → 显示错误 + 不关闭
 *   9. _onAdd 抛错 → 同失败路径
 *  10. 提交成功后清空 + 关闭
 *  11. N 键 (非 input 焦点) → toggle
 *  12. N 键 (input 焦点时) → 不触发
 *  13. ESC 关闭浮层
 *  14. detach 后节点被移除
 *  15. console fallback (无 DOM env 时不抛)
 *
 * 配套: src/v2/interaction/quick-add-panel.js
 *
 * 测试策略:
 *   复用 debug-overlay.test.js 的伪 DOM 风格, 解析 production code 真实生成的 innerHTML。
 *   setTimeout 用同步 fake, await microtask 链推进。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { QuickAddPanel } from '../../src/v2/interaction/quick-add-panel.js';

// ===== 伪 DOM (从 debug-overlay.test.js 复用 + 适配) =====

function makeNode(tag = 'div') {
  const node = {
    tagName: tag.toUpperCase(),
    parentNode: null,
    children: [],
    _classSet: new Set(),
    _listeners: {},
    _attrs: {},
    _dataset: {},
    _disabled: false,
    _value: '',
    _textContent: '',
    _innerHTML: '',
    _activeElement: null,
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
    get value() {
      // select 节点: 返 selected option 的 value
      if (this.tagName === 'SELECT' && this.children) {
        const opt = this.children.find(c => c.tagName === 'OPTION' && c._attrs && c._attrs.selected);
        if (opt) return opt._attrs.value || '';
        if (this.children.length > 0 && this.children[0]._attrs) return this.children[0]._attrs.value || '';
      }
      return this._value;
    },
    set value(v) { this._value = String(v); },
    get disabled() { return this._disabled; },
    set disabled(v) { this._disabled = !!v; },
    get textContent() { return this._textContent; },
    set textContent(v) { this._textContent = String(v); },
    get maxLength() { return parseInt(this._attrs.maxlength, 10) || 0; },
    addEventListener(type, fn) {
      (this._listeners[type] ||= []).push(fn);
    },
    fire(type, evt = {}) {
      const fns = this._listeners[type] || [];
      const fullEvt = { preventDefault: () => {}, stopPropagation: () => {}, ...evt };
      for (const fn of fns) fn(fullEvt);
    },
    focus() {
      if (this._env) this._env.document.activeElement = this;
    },
    blur() {
      if (this._env && this._env.document.activeElement === this) {
        this._env.document.activeElement = null;
      }
    },
    appendChild(child) {
      if (typeof child === 'string') return child;
      child.parentNode = this;
      this.children.push(child);
      if (child._attrs && child._attrs.id) {
        const env = this._env || (this._attrs && this._attrs.__env);
        if (env && env.document && env.document._byId) {
          env.document._byId[child._attrs.id] = child;
        }
      }
      return child;
    },
    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx >= 0) {
        this.children.splice(idx, 1);
        child.parentNode = null;
        if (child._attrs && child._attrs.id) {
          const env = this._env || (this._attrs && this._attrs.__env);
          if (env && env.document && env.document._byId) {
            delete env.document._byId[child._attrs.id];
          }
        }
      }
      return child;
    },
    querySelector(sel) {
      return findBySel(this, sel);
    },
  };
  return node;
}

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

function parseInnerHTML(parent, html) {
  html = html.trim();
  if (!html) return;
  let i = 0;
  while (i < html.length) {
    while (i < html.length && /\s/.test(html[i])) i++;
    if (i >= html.length) break;
    if (html[i] !== '<') {
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
    const end = html.indexOf('>', i);
    if (end === -1) break;
    const tagStr = html.slice(i + 1, end);
    i = end + 1;
    if (tagStr.endsWith('/')) {
      const tagName = tagStr.slice(0, -1).split(/\s+/)[0].toLowerCase();
      const el = makeNode(tagName);
      parent.appendChild(el); // 劫持会自动设 _env
      continue;
    }
    const spaceIdx = tagStr.search(/\s/);
    const tagName = (spaceIdx === -1 ? tagStr : tagStr.slice(0, spaceIdx)).toLowerCase();
    const attrStr = spaceIdx === -1 ? '' : tagStr.slice(spaceIdx + 1);
    const attrs = parseAttrs(attrStr);
    const el = makeNode(tagName);
    Object.assign(el._attrs, attrs);
    parent.appendChild(el); // 劫持会自动设 _env
    // 找到子节点后递归解析
    const closeTag = `</${tagName}>`;
    let depth = 1;
    let scan = i;
    while (scan < html.length && depth > 0) {
      const nextOpen = html.indexOf(`<${tagName}`, scan);
      const nextClose = html.indexOf(closeTag, scan);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        const charAfter = html[nextOpen + 1 + tagName.length];
        if (charAfter === ' ' || charAfter === '>' || charAfter === '/') {
          depth++;
          scan = nextOpen + 1 + tagName.length;
          continue;
        }
      }
      depth--;
      if (depth === 0) {
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

function makeNodeWithInnerHTML(tag) {
  const node = makeNode(tag);
  Object.defineProperty(node, 'innerHTML', {
    get() { return node._innerHTML; },
    set(v) {
      node._innerHTML = v;
      node.children = [];
      parseInnerHTML(node, v);
      // 解析后全树注册 id (用节点自己的 _env)
      _registerIds(node);
    },
  });
  return node;
}

function _registerIds(root) {
  if (root._attrs && root._attrs.id && root._env && root._env.document) {
    root._env.document._byId[root._attrs.id] = root;
  }
  if (root.children) for (const c of root.children) {
    if (!c._env && root._env) c._env = root._env;
    _registerIds(c);
  }
}

// 当节点被 appendChild 到有 _env 的 host 后, 同步重扫一次 id
function _reregisterFromRoot(root) {
  if (root._env && root._env.document) _registerIds(root);
}

function makeEnv() {
  const body = makeNodeWithInnerHTML('body');
  const head = makeNodeWithInnerHTML('head');
  const document = {
    body, head,
    _byId: {},
    activeElement: null,
    createElement(tag) {
      const n = makeNodeWithInnerHTML(tag);
      return n;
    },
    getElementById(id) { return this._byId[id] || null; },
    querySelector(sel) {
      return body.querySelector(sel) || head.querySelector(sel) || null;
    },
  };
  body._env = null; // 设到 env 形成环
  head._env = null;
  // 劫持 appendChild, 注册 id + 设 _env
  const wrap = (host) => {
    const orig = host.appendChild.bind(host);
    host.appendChild = (child) => {
      const ret = orig(child);
      if (child) {
        // _env 链: 优先用自身 _env, 否则从 parent 拿
        if (!child._env && host._env) child._env = host._env;
        if (child._attrs && child._attrs.id && child._env && child._env.document) {
          child._env.document._byId[child._attrs.id] = child;
        }
        // 如果 child 已经有 children (e.g. 已设过 innerHTML), 同步重扫
        if (child.children && child.children.length > 0) {
          _reregisterFromRoot(child);
        }
      }
      return ret;
    };
  };
  wrap(body);
  wrap(head);

  const listeners = { keydown: [] };
  const window = {
    addEventListener(type, fn) {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      const arr = listeners[type] || [];
      const idx = arr.indexOf(fn);
      if (idx >= 0) arr.splice(idx, 1);
    },
    _fire(type, evt) {
      const arr = listeners[type] || [];
      const fullEvt = { preventDefault: () => {}, stopPropagation: () => {}, ...evt };
      for (const fn of arr) fn(fullEvt);
    },
  };
  // 同步 setTimeout, 推进 microtask
  let timerId = 0;
  const timers = new Map();
  const setTimeout = (fn, ms) => {
    const id = ++timerId;
    timers.set(id, { fn, ms });
    return id;
  };
  const clearTimeout = (id) => { timers.delete(id); };
  const env = {
    document, window, setTimeout, clearTimeout,
    __timers: timers,
    __fireKey: (key, opts = {}) => window._fire('keydown', { key, ...opts }),
  };
  body._env = env;
  head._env = env;
  // _registerIds 用的是 root._env.document._byId, 现在已通
  return env;
}

const SAMPLE_LAYERS = [
  { id: 'layer-sub-deep', name: '潜意识·深层' },
  { id: 'layer-sub-middle', name: '潜意识·中层' },
  { id: 'layer-con-middle', name: '显意识·中层' },
  { id: 'layer-con-shallow', name: '显意识·表层' },
];

// ===== 测试 =====

describe('QuickAddPanel (S2.13)', () => {
  let env;
  let onAdd;

  beforeEach(() => {
    env = makeEnv();
    onAdd = vi.fn(async () => ({ ok: true }));
  });

  it('1. 构造校验: 无 onAdd → throw', () => {
    expect(() => new QuickAddPanel({ layers: SAMPLE_LAYERS })).toThrow(TypeError);
  });

  it('2. attach/detach 幂等 (重入安全)', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.attach(); // 二次 attach 不抛
    expect(panel._attached).toBe(true);
    panel.detach();
    panel.detach(); // 二次 detach 不抛
    expect(panel._attached).toBe(false);
  });

  it('3. attach 后 DOM 出现 (panel + toggle button + style)', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    expect(env.document.getElementById('v2-quick-add-panel')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-toggle')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-style')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-textarea')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-layer')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-submit')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-cancel')).toBeTruthy();
  });

  it('4. 默认隐藏, toggle 切显隐', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    expect(panel.isVisible()).toBe(false);
    panel.toggle();
    expect(panel.isVisible()).toBe(true);
    panel.toggle();
    expect(panel.isVisible()).toBe(false);
  });

  it('5. setVisible(true) 后 panel 有 v2-qa-visible class', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.setVisible(true);
    const p = env.document.getElementById('v2-quick-add-panel');
    expect(p._classSet.has('v2-qa-visible')).toBe(true);
  });

  it('6. 文字空时 confirm 按钮 disabled', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.setVisible(true);
    const submit = env.document.getElementById('v2-quick-add-submit');
    expect(submit.disabled).toBe(true);
  });

  it('7. 输入文字后 confirm enabled, _onAdd 收到正确 {text, layerId}', async () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.setVisible(true);
    const ta = env.document.getElementById('v2-quick-add-textarea');
    const sel = env.document.getElementById('v2-quick-add-layer');
    ta.value = '一段新念头';
    ta.fire('input');
    const submit = env.document.getElementById('v2-quick-add-submit');
    expect(submit.disabled).toBe(false);
    submit.fire('click');
    // 等 microtask
    await Promise.resolve();
    await Promise.resolve();
    expect(onAdd).toHaveBeenCalledTimes(1);
    const arg = onAdd.mock.calls[0][0];
    expect(arg.text).toBe('一段新念头');
    expect(arg.layerId).toBeTruthy();
    expect(arg.tags).toEqual([]);
  });

  it('8. _onAdd 返 {ok:false, error} → 显示错误 + 不关闭', async () => {
    const errOnAdd = vi.fn(async () => ({ ok: false, error: 'layer 已满' }));
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd: errOnAdd, env });
    panel.attach();
    panel.setVisible(true);
    const ta = env.document.getElementById('v2-quick-add-textarea');
    ta.value = '测试失败';
    ta.fire('input');
    const submit = env.document.getElementById('v2-quick-add-submit');
    submit.fire('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.isVisible()).toBe(true);
    const errEl = env.document.getElementById('v2-quick-add-error');
    expect(errEl._textContent).toBe('layer 已满');
    expect(errEl._classSet.has('v2-qa-visible')).toBe(true);
  });

  it('9. _onAdd 抛错 → 同失败路径', async () => {
    const throwOnAdd = vi.fn(async () => { throw new Error('boom'); });
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd: throwOnAdd, env });
    panel.attach();
    panel.setVisible(true);
    const ta = env.document.getElementById('v2-quick-add-textarea');
    ta.value = '抛错测试';
    ta.fire('input');
    const submit = env.document.getElementById('v2-quick-add-submit');
    submit.fire('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.isVisible()).toBe(true);
    const errEl = env.document.getElementById('v2-quick-add-error');
    expect(errEl._textContent).toBe('boom');
  });

  it('10. 提交成功后清空 + 关闭', async () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.setVisible(true);
    const ta = env.document.getElementById('v2-quick-add-textarea');
    ta.value = '成功路径';
    ta.fire('input');
    const submit = env.document.getElementById('v2-quick-add-submit');
    submit.fire('click');
    await Promise.resolve();
    await Promise.resolve();
    expect(panel.isVisible()).toBe(false);
    expect(ta.value).toBe('');
  });

  it('11. N 键 (非 input 焦点) → toggle', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    expect(panel.isVisible()).toBe(false);
    env.__fireKey('n');
    expect(panel.isVisible()).toBe(true);
    // 打开后 focus 在 textarea, 模拟用户切走 (ESC 关闭后 focus 释)
    env.document.activeElement = null;
    env.__fireKey('N'); // 大写 N 也能触发
    expect(panel.isVisible()).toBe(false);
  });

  it('12. N 键 (input 焦点时) → 不触发', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    const ta = env.document.getElementById('v2-quick-add-textarea');
    ta.focus();
    expect(env.document.activeElement).toBe(ta);
    env.__fireKey('n');
    expect(panel.isVisible()).toBe(false);
  });

  it('13. ESC 关闭浮层', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    panel.setVisible(true);
    expect(panel.isVisible()).toBe(true);
    env.__fireKey('Escape');
    expect(panel.isVisible()).toBe(false);
  });

  it('14. detach 后节点被移除, _attached=false', () => {
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env });
    panel.attach();
    expect(env.document.getElementById('v2-quick-add-panel')).toBeTruthy();
    expect(env.document.getElementById('v2-quick-add-toggle')).toBeTruthy();
    panel.detach();
    expect(env.document.getElementById('v2-quick-add-panel')).toBeNull();
    expect(env.document.getElementById('v2-quick-add-toggle')).toBeNull();
    expect(panel._attached).toBe(false);
  });

  it('15. console fallback (无 DOM env 时不抛)', async () => {
    const bareEnv = { document: null, window: null, setTimeout: null, clearTimeout: null };
    const panel = new QuickAddPanel({ layers: SAMPLE_LAYERS, onAdd, env: bareEnv });
    panel.attach();
    panel.setVisible(true);
    // 不应抛错
    expect(panel.isVisible()).toBe(true);
    const state = panel.getInputState();
    expect(state.visible).toBe(true);
    expect(state.layers).toBe(4);
  });
});
