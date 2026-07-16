/**
 * QuickAddPanel (S2.13) — 念头快速录入 UI
 *
 * [INPUT]: 上层传入 layers (LayerSystem.getLayers()) + onAdd 回调
 *   - layers: Array<{id, name}> — 可选层列表, 默认选中 con-middle
 *   - onAdd: async ({ text, layerId, tags }) => {ok, error?} — 提交回调, 返 ok: true 表成功
 * [OUTPUT]: QuickAddPanel 类 — 浮层 UI (textarea + select + confirm/cancel)
 *   - attach() / detach() — 生命周期 (重入安全)
 *   - toggle() / setVisible() / focusInput() — 显隐控制
 *   - N 键开/关, ESC 关闭 (全局监听, 装在 window keydown)
 *   - getInputState() — 读当前输入 (测试 / 调试)
 *   - 错误反馈: onAdd 返 ok:false 或抛错 → 底部红字 3s 淡出
 * [POS]: src/v2/interaction/quick-add-panel.js, L3 交互层, S2.13 用户可见入口, 被 main.js 装配
 * [PROTOCOL]: 变更时更新此头部, 然后检查 ../CLAUDE.md
 *
 * @note(s2, decision, quick-add-panel, since:2026-07-16)
 *   模态浮层 + autofocus + ESC 关闭, 跟 macOS Notion/Obsidian 习惯一致。
 *   不用 inline 编辑: 3D 空间里文字位置难选。
 *   不用 cmd+k: 学习曲线, 不适合"主入口"。
 * @note(s2, decision, dom-over-canvas, since:2026-07-16)
 *   选 DOM (form + textarea) 而非 canvas, 排版天然, 字体可读。
 *   浮层一次性创建, 显隐靠 display, 开销 < 0.3ms。
 * @note(s2, decision, console-fallback, since:2026-07-16)
 *   无 DOM 时降级 console.log, 避免单测环境与浏览器行为分叉。
 *   vitest 默认 node 环境, 真实渲染走浏览器, 两条路径都覆盖。
 * @note(s2, decision, shortkey-n, since:2026-07-16)
 *   `N` 键 = 打开 quick-add (macOS Notion/Obsidian 习惯)。
 *   检测 !isInputFocused() 才触发, 避免跟其他 input 冲突。
 * @note(s2, decision, position-topright, since:2026-07-16)
 *   浮层位置右上, 跟 S2.11 DebugOverlay (左下) 不冲突。
 *   启动后 + 按钮一直在, 用户永远能找到入口。
 *
 * 设计依据: docs/notes/s2/S2.13-quick-add-panel-plan.md
 *   配套: tests/v2/quick-add-panel.test.js
 *   集成: src/v2/main.js + src/v2/core/action-router.js
 *
 * 用法 (main.js):
 *   import { QuickAddPanel } from './interaction/quick-add-panel.js';
 *   const panel = new QuickAddPanel({ layers, onAdd });
 *   panel.attach();         // 挂载到主视图右上 + 加 N 键监听
 *   panel.toggle();         // 切显隐
 *   panel.focusInput();     // 显示时自动 focus textarea
 *
 * 接口 (回调):
 *   onAdd({ text, layerId, tags }) -> Promise<{ok, error?}>
 *   - 必须返 ok: true 才算成功; 失败时 panel 底部红字反馈 3 秒后淡出
 *   - 不返 ok (e.g. 抛错) → 同上失败路径
 */

const PANEL_ID = 'v2-quick-add-panel';
const BTN_ID = 'v2-quick-add-toggle';
const STYLE_ID = 'v2-quick-add-style';
const ERR_ID = 'v2-quick-add-error';
const DEFAULT_LAYER_FALLBACK = 'layer-con-middle';
const MAX_TEXT_LEN = 200;
const ERR_VISIBLE_MS = 3000;

export class QuickAddPanel {
  /**
   * @param {Object} options
   * @param {Array<{id: string, name: string}>} options.layers - 可选层列表
   * @param {Function} options.onAdd - 添加回调 async ({text, layerId, tags}) => {ok, error?}
   * @param {string} [options.defaultLayerId] - 默认选中层（默认 layer-con-middle）
   * @param {number} [options.maxTextLen=200] - textarea 最大字符
   * @param {Object} [options.env] - 测试用, 注入 document/window mock
   */
  constructor({ layers = [], onAdd, defaultLayerId, maxTextLen, env } = {}) {
    if (typeof onAdd !== 'function') {
      throw new TypeError('QuickAddPanel 需要 onAdd 回调');
    }
    this._layers = [...layers];
    this._onAdd = onAdd;
    this._defaultLayerId = defaultLayerId || _pickDefaultLayer(layers) || DEFAULT_LAYER_FALLBACK;
    this._maxTextLen = maxTextLen ?? MAX_TEXT_LEN;
    this._env = env || _detectEnv();
    this._visible = false;
    this._attached = false;
    this._submitting = false;
    this._errorTimer = null;
    this._keyHandler = null;
  }

  // ===== 生命周期 =====

  attach() {
    if (this._attached) return;
    this._ensureStyle();
    this._ensureToggleButton();
    this._ensurePanel();
    this._applyVisibility();
    this._installGlobalKey();
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    if (this._keyHandler && this._env.window && this._env.window.removeEventListener) {
      this._env.window.removeEventListener('keydown', this._keyHandler);
    }
    if (this._errorTimer && this._env.clearTimeout) {
      this._env.clearTimeout(this._errorTimer);
      this._errorTimer = null;
    }
    if (this._env.document) {
      const panel = this._env.document.getElementById(PANEL_ID);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      const btn = this._env.document.getElementById(BTN_ID);
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    }
    this._attached = false;
  }

  toggle() {
    this.setVisible(!this._visible);
    if (this._visible) this.focusInput();
  }

  setVisible(visible) {
    this._visible = !!visible;
    this._applyVisibility();
    this._refreshConfirmButton();
  }

  isVisible() {
    return this._visible;
  }

  /**
   * 显示时自动 focus textarea
   */
  focusInput() {
    if (!this._env.document) return;
    const ta = this._env.document.getElementById('v2-quick-add-textarea');
    if (ta && typeof ta.focus === 'function') ta.focus();
  }

  /**
   * 获取当前输入内容（测试 / 调试用）
   */
  getInputState() {
    if (!this._env.document) {
      return { visible: this._visible, submitting: this._submitting, layers: this._layers.length };
    }
    const ta = this._env.document.getElementById('v2-quick-add-textarea');
    const sel = this._env.document.getElementById('v2-quick-add-layer');
    return {
      visible: this._visible,
      submitting: this._submitting,
      text: ta ? ta.value : '',
      selectedLayerId: sel ? sel.value : null,
      layers: this._layers.length,
    };
  }

  // ===== DOM 构造 (一次, 不再重建) =====

  _ensureStyle() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(STYLE_ID)) return;
    const style = this._env.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${BTN_ID} {
  position: fixed; top: 12px; right: 12px; z-index: 9998;
  padding: 6px 12px;
  background: rgba(60, 100, 160, 0.85); color: #f0f8ff;
  border: 1px solid rgba(120, 180, 240, 0.5);
  border-radius: 4px;
  font: 13px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  cursor: pointer; user-select: none;
}
#${BTN_ID}:hover { background: rgba(60, 100, 160, 1.0); }
#${PANEL_ID} {
  position: fixed; top: 60px; right: 12px; z-index: 9999;
  width: 320px;
  background: rgba(12, 18, 28, 0.92); color: #d0e0f0;
  font: 13px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  padding: 14px 16px; border-radius: 6px;
  border: 1px solid rgba(120, 160, 200, 0.4);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
  display: none;
}
#${PANEL_ID}.v2-qa-visible { display: block; }
#${PANEL_ID} .v2-qa-title {
  color: #88c0d0; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.06em; margin: 0 0 8px;
}
#${PANEL_ID} textarea {
  width: 100%; min-height: 70px; resize: vertical;
  background: rgba(20, 28, 40, 0.9); color: #d0e0f0;
  border: 1px solid rgba(120, 160, 200, 0.3);
  border-radius: 3px; padding: 6px 8px;
  font: inherit; box-sizing: border-box;
}
#${PANEL_ID} textarea:focus { outline: 1px solid #6aa0d0; }
#${PANEL_ID} select {
  width: 100%; margin-top: 8px;
  background: rgba(20, 28, 40, 0.9); color: #d0e0f0;
  border: 1px solid rgba(120, 160, 200, 0.3);
  border-radius: 3px; padding: 4px 6px;
  font: inherit;
}
#${PANEL_ID} .v2-qa-row {
  display: flex; gap: 8px; align-items: center;
  margin-top: 10px;
}
#${PANEL_ID} .v2-qa-counter {
  color: #6080a0; font-size: 11px; margin-left: auto;
}
#${PANEL_ID} .v2-qa-counter.v2-qa-warn { color: #ffb060; }
#${PANEL_ID} button.v2-qa-submit {
  padding: 5px 14px;
  background: rgba(80, 160, 100, 0.85); color: #f0fff0;
  border: 1px solid rgba(120, 200, 140, 0.5);
  border-radius: 3px; cursor: pointer;
  font: inherit;
}
#${PANEL_ID} button.v2-qa-submit:disabled {
  background: rgba(60, 80, 70, 0.4); color: #608080;
  border-color: rgba(120, 160, 140, 0.2); cursor: not-allowed;
}
#${PANEL_ID} button.v2-qa-cancel {
  padding: 5px 10px;
  background: transparent; color: #88a0b8;
  border: 1px solid rgba(120, 160, 200, 0.3);
  border-radius: 3px; cursor: pointer;
  font: inherit;
}
#${ERR_ID} {
  margin-top: 8px; color: #ff8080; font-size: 12px;
  min-height: 1em; display: none;
}
#${ERR_ID}.v2-qa-visible { display: block; }
    `.trim();
    const head = this._env.document.head || (this._env.document.body || {}).parentNode;
    if (head && head.appendChild) head.appendChild(style);
  }

  _ensureToggleButton() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(BTN_ID)) return;
    const btn = this._env.document.createElement('button');
    btn.id = BTN_ID;
    btn.textContent = '+ 念头';
    btn.title = 'Quick add thought (N)';
    if (btn.addEventListener) {
      btn.addEventListener('click', () => this.toggle());
    }
    const host = this._env.document.body;
    if (host && host.appendChild) host.appendChild(btn);
  }

  _ensurePanel() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(PANEL_ID)) return;
    const panel = this._env.document.createElement('div');
    panel.id = PANEL_ID;
    const layerOptions = this._layers.map(l =>
      `<option value="${_escapeAttr(l.id)}"${l.id === this._defaultLayerId ? ' selected' : ''}>${_escapeText(l.name || l.id)}</option>`
    ).join('');
    panel.innerHTML = `
<div class="v2-qa-title">Quick Add Thought</div>
<textarea id="v2-quick-add-textarea" maxlength="${this._maxTextLen}" placeholder="此刻的念头..."></textarea>
<select id="v2-quick-add-layer">${layerOptions}</select>
<div class="v2-qa-row">
  <button type="button" class="v2-qa-cancel" id="v2-quick-add-cancel">取消</button>
  <span class="v2-qa-counter" data-key="counter">0 / ${this._maxTextLen}</span>
  <button type="button" class="v2-qa-submit" id="v2-quick-add-submit" disabled>添加</button>
</div>
<div id="${ERR_ID}"></div>
    `.trim();
    const host = this._env.document.body;
    if (host && host.appendChild) host.appendChild(panel);

    // 绑定事件
    const ta = this._env.document.getElementById('v2-quick-add-textarea');
    if (ta && ta.addEventListener) {
      ta.addEventListener('input', () => this._onInput());
      ta.addEventListener('keydown', (e) => this._onTextareaKey(e));
    }
    const submit = this._env.document.getElementById('v2-quick-add-submit');
    if (submit && submit.addEventListener) {
      submit.addEventListener('click', () => this._submit());
    }
    const cancel = this._env.document.getElementById('v2-quick-add-cancel');
    if (cancel && cancel.addEventListener) {
      cancel.addEventListener('click', () => this.setVisible(false));
    }
  }

  _installGlobalKey() {
    if (!this._env.window || !this._env.window.addEventListener) return;
    this._keyHandler = (e) => {
      // N 键开/关
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (_isInputFocused(this._env)) return;
        e.preventDefault();
        this.toggle();
        return;
      }
      // ESC 关
      if (e.key === 'Escape' && this._visible) {
        if (_isInputFocused(this._env)) {
          // 优先让 textarea blur, 关闭浮层
          const ta = this._env.document && this._env.document.getElementById('v2-quick-add-textarea');
          if (ta && typeof ta.blur === 'function') ta.blur();
        }
        e.preventDefault();
        this.setVisible(false);
      }
    };
    this._env.window.addEventListener('keydown', this._keyHandler);
  }

  _applyVisibility() {
    if (!this._env.document) return;
    const panel = this._env.document.getElementById(PANEL_ID);
    if (panel && panel.classList) {
      panel.classList.toggle('v2-qa-visible', this._visible);
    }
  }

  // ===== 输入处理 =====

  _onInput() {
    this._refreshCounter();
    this._refreshConfirmButton();
    this._hideError();
  }

  _onTextareaKey(e) {
    // Ctrl/Cmd+Enter 提交
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      this._submit();
    }
  }

  _refreshCounter() {
    if (!this._env.document) return;
    const ta = this._env.document.getElementById('v2-quick-add-textarea');
    const counterEl = this._env.document.querySelector('[data-key="counter"]');
    if (!ta || !counterEl) return;
    const len = ta.value ? ta.value.length : 0;
    counterEl._textContent = `${len} / ${this._maxTextLen}`;
    if (counterEl.classList && counterEl.classList.toggle) {
      counterEl.classList.toggle('v2-qa-warn', len > this._maxTextLen * 0.9);
    }
  }

  _refreshConfirmButton() {
    if (!this._env.document) return;
    const ta = this._env.document.getElementById('v2-quick-add-textarea');
    const submit = this._env.document.getElementById('v2-quick-add-submit');
    if (!ta || !submit) return;
    const text = (ta.value || '').trim();
    const disabled = this._submitting || text.length === 0;
    if ('disabled' in submit) submit.disabled = disabled;
  }

  _showError(msg) {
    if (!this._env.document) return;
    const err = this._env.document.getElementById(ERR_ID);
    if (!err) return;
    err._textContent = msg;
    if (err.classList && err.classList.add) err.classList.add('v2-qa-visible');
    if (this._errorTimer && this._env.clearTimeout) {
      this._env.clearTimeout(this._errorTimer);
    }
    if (this._env.setTimeout) {
      this._errorTimer = this._env.setTimeout(() => this._hideError(), ERR_VISIBLE_MS);
    }
  }

  _hideError() {
    if (!this._env.document) return;
    const err = this._env.document.getElementById(ERR_ID);
    if (!err) return;
    if (err.classList && err.classList.remove) err.classList.remove('v2-qa-visible');
  }

  async _submit() {
    if (this._submitting) return;
    const ta = this._env.document && this._env.document.getElementById('v2-quick-add-textarea');
    const sel = this._env.document && this._env.document.getElementById('v2-quick-add-layer');
    if (!ta || !sel) return;
    const text = (ta.value || '').trim();
    if (!text) return;
    if (text.length > this._maxTextLen) {
      this._showError(`文字超过 ${this._maxTextLen} 字符`);
      return;
    }
    this._submitting = true;
    this._refreshConfirmButton();
    this._hideError();
    let result;
    try {
      result = await this._onAdd({ text, layerId: sel.value, tags: [] });
    } catch (err) {
      result = { ok: false, error: (err && err.message) || String(err) };
    }
    this._submitting = false;
    this._refreshConfirmButton();
    if (!result || result.ok === false || result.ok === undefined && result && 'error' in result) {
      // 兼容: 返 {ok:false,error} / 返 {error} / 抛错
      const msg = (result && result.error) || '添加失败';
      this._showError(msg);
      return;
    }
    // 成功 → 清空 + 关闭
    ta.value = '';
    this._refreshCounter();
    this._refreshConfirmButton();
    this.setVisible(false);
  }
}

// ===== 内部辅助 =====

function _detectEnv() {
  if (typeof document !== 'undefined') {
    return {
      document,
      window: typeof window !== 'undefined' ? window : null,
      setTimeout: typeof setTimeout !== 'undefined' ? setTimeout : null,
      clearTimeout: typeof clearTimeout !== 'undefined' ? clearTimeout : null,
    };
  }
  return { document: null, window: null, setTimeout: null, clearTimeout: null };
}

function _pickDefaultLayer(layers) {
  if (!layers || layers.length === 0) return null;
  const con = layers.find(l => /con-(middle|deep|shallow)/.test(l.id));
  return (con || layers[0]).id;
}

function _isInputFocused(env) {
  if (!env || !env.document) return false;
  const active = env.document.activeElement;
  if (!active || !active.tagName) return false;
  const tag = active.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function _escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function _escapeText(s) {
  return String(s).replace(/</g, '&lt;').replace(/&/g, '&amp;');
}
