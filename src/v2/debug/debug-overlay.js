/**
 * DebugOverlay (S2.11)
 *
 * 把 RenderPipeline 的 stats 可视化到屏幕。
 *
 * 目标:
 *   1. 持续显示 FPS / 总 ms / 5 stage ms / cache hit rate / 错误 / 帧数
 *   2. 渲染开销 < 0.5ms / 帧 (DOM 文本节点更新, 不重排)
 *   3. 默认隐藏, 按 `~` (反引号) 或点 [⏱] 按钮切换
 *   4. 切换显隐时内容已经是"最近一帧"的数据, 不会跳 0
 *   5. 无 DOM 环境 (Node 单元测试) 时降级到 console.log, 不抛错
 *
 * 用法 (main.js):
 *   import { DebugOverlay } from './debug/debug-overlay.js';
 *   const overlay = new DebugOverlay(renderPipeline);
 *   overlay.attach();   // 启动 RAF 更新
 *   overlay.detach();   // 停掉
 *   overlay.toggle();   // 切显隐
 *
 * 设计权衡:
 *   - 用 DOM (div + table) 而非 canvas: < 0.5ms 易达成, 排版天然, 字体随系统
 *   - 5 Hz 采样: 太密看不出变化, 太稀看不出抖动
 *   - 只在 frame 推进时 update DOM 文本内容, 不重排, 不重建节点
 *   - 错误 / 越界用颜色高亮 (琥珀 / 红), 不抢戏
 *   - console fallback 让无 DOM 环境 (vitest 默认 node) 也能跑
 *
 * @note(s2, decision, dom-over-canvas, since:2026-07-13)
 *   选 DOM 而非 canvas, 理由: < 0.5ms 排版天然, 字体可读, 易隐藏。
 *   canvas overlay 在 5Hz 采样下省不了 0.3ms, 反而让调试链路多一层。
 * @note(s2, decision, console-fallback, since:2026-07-13)
 *   无 DOM 时降级 console.log, 避免单测环境与浏览器行为分叉。
 *   vitest 默认 node 环境, 真实渲染走浏览器, 两条路径都覆盖。
 */

const REFRESH_INTERVAL_MS = 200;       // 5 Hz 屏幕刷新
const PANEL_ID = 'v2-debug-overlay-panel';
const TOGGLE_BTN_ID = 'v2-debug-overlay-toggle';
const STYLE_ID = 'v2-debug-overlay-style';
const STAGE_NAMES = ['input', 'state', 'transform', 'render', 'snapshot'];

export class DebugOverlay {
  /**
   * @param {import('../render/render-pipeline.js').RenderPipeline} pipeline
   * @param {Object} [opts]
   * @param {boolean} [opts.visible=false] - 初始是否显示
   * @param {number} [opts.refreshMs=200] - 屏幕刷新间隔
   * @param {Object} [opts.env] - 测试用, 注入 document/window/raf mock
   */
  constructor(pipeline, opts = {}) {
    if (!pipeline || typeof pipeline.getStats !== 'function') {
      throw new TypeError('DebugOverlay 需要 pipeline.getStats()');
    }
    this._pipeline = pipeline;
    this._visible = !!opts.visible;
    this._refreshMs = opts.refreshMs ?? REFRESH_INTERVAL_MS;
    this._env = opts.env || _detectEnv();
    this._rafHandle = null;
    this._lastRefreshAt = 0;
    this._lastStats = null;
    this._attached = false;
  }

  // ===== 生命周期 =====

  attach() {
    if (this._attached) return;
    this._ensureStyle();
    this._ensureToggleButton();
    this._ensurePanel();
    this._applyVisibility();
    this._loop = this._loop.bind(this);
    this._scheduleNext();
    this._attached = true;
  }

  detach() {
    if (!this._attached) return;
    if (this._rafHandle != null && this._env.cancelAnimationFrame) {
      this._env.cancelAnimationFrame(this._rafHandle);
      this._rafHandle = null;
    }
    if (this._env.document) {
      const panel = this._env.document.getElementById(PANEL_ID);
      if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      const btn = this._env.document.getElementById(TOGGLE_BTN_ID);
      if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    }
    if (this._keyHandler && this._env.window && this._env.window.removeEventListener) {
      this._env.window.removeEventListener('keydown', this._keyHandler);
    }
    this._attached = false;
  }

  toggle() {
    this.setVisible(!this._visible);
  }

  setVisible(visible) {
    this._visible = !!visible;
    this._applyVisibility();
  }

  isVisible() {
    return this._visible;
  }

  /**
   * 获取 overlay 当前的 stats 快照 (与最近一次屏幕刷新同步)
   * @returns {Object|null}
   */
  getLastStats() {
    return this._lastStats;
  }

  // ===== 主循环 =====

  _scheduleNext() {
    if (this._env.requestAnimationFrame) {
      this._rafHandle = this._env.requestAnimationFrame(this._loop);
    }
  }

  _loop(now) {
    if (now - this._lastRefreshAt >= this._refreshMs) {
      this._lastRefreshAt = now;
      this._refreshDom();
    }
    this._scheduleNext();
  }

  _refreshDom() {
    const stats = this._pipeline.getStats();
    this._lastStats = stats;

    if (!this._env.document) {
      // Node 环境 / 无 DOM: 降级 console.log (5Hz, 不淹)
      if (this._visible) {
        // eslint-disable-next-line no-console
        console.log(`[v2-debug] fps=${stats.recentAvgFps.toFixed(1)} ms=${stats.recentAvgMs.toFixed(2)} ` +
          `frames=${stats.totalFrames} cache=${(stats.cacheHitRate * 100).toFixed(0)}% ` +
          `errors=${stats.totalErrors} overruns=${stats.totalOverruns}`);
      }
      return;
    }

    const panel = this._env.document.getElementById(PANEL_ID);
    if (!panel) return;

    // 1. 总览
    setText(panel, 'fps', stats.recentAvgFps.toFixed(1));
    setText(panel, 'ms', stats.recentAvgMs.toFixed(2));
    setText(panel, 'frames', stats.totalFrames);
    setText(panel, 'cache', `${(stats.cacheHitRate * 100).toFixed(0)}%`);

    // S2.12 expected / overhead (实际 vs 理论)
    if (typeof stats.expectedMs === 'number') {
      setText(panel, 'expected', stats.expectedMs.toFixed(2));
      const overheadEl = setText(panel, 'overhead',
        `${stats.overheadMs?.toFixed(2) ?? '0.00'} (${stats.overheadPct?.toFixed(0) ?? '0'}%)`);
      if (stats.severity === 'alarm') overheadEl.classList.add('v2-debug-alarm');
      else if (stats.severity === 'warn') overheadEl.classList.add('v2-debug-warn');
    }

    // 2. 错误 / 越界 (颜色高亮)
    const errEl = setText(panel, 'errors', stats.totalErrors);
    errEl.classList.toggle('v2-debug-alarm', stats.totalErrors > 0);
    const overrunEl = setText(panel, 'overruns', stats.totalOverruns);
    overrunEl.classList.toggle('v2-debug-warn', stats.totalOverruns > 0);

    // 3. 5 阶段
    for (const stageName of STAGE_NAMES) {
      const stageStats = stats.stages[stageName];
      if (!stageStats) continue;
      const stageEl = setText(panel, `stage-${stageName}-ms`, stageStats.avgMs.toFixed(2));
      const maxEl = setText(panel, `stage-${stageName}-max`, stageStats.maxMs.toFixed(2));
      const budget = stageStats.budgetMs;
      const overBudget = stageStats.avgMs > budget;
      const nearBudget = !overBudget && stageStats.avgMs > budget * 0.8;
      stageEl.classList.toggle('v2-debug-alarm', overBudget);
      stageEl.classList.toggle('v2-debug-warn', nearBudget);
      maxEl.classList.toggle('v2-debug-alarm', stageStats.maxMs > budget);
    }
  }

  // ===== DOM 构造 (一次, 不再重建) =====

  _ensureStyle() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(STYLE_ID)) return;
    const style = this._env.document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
#${PANEL_ID} {
  position: fixed; top: 12px; left: 12px; z-index: 9999;
  background: rgba(8, 12, 20, 0.78); color: #d0e0f0;
  font: 12px/1.4 ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  padding: 10px 12px; border-radius: 6px;
  border: 1px solid rgba(120, 160, 200, 0.25);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  min-width: 240px; user-select: none; pointer-events: auto; display: none;
}
#${PANEL_ID}.v2-debug-visible { display: block; }
#${PANEL_ID} table { border-collapse: collapse; width: 100%; }
#${PANEL_ID} th, #${PANEL_ID} td {
  text-align: right; padding: 1px 4px; font-weight: 400;
}
#${PANEL_ID} th:first-child, #${PANEL_ID} td:first-child { text-align: left; }
#${PANEL_ID} thead th { color: #88a0b8; border-bottom: 1px solid rgba(120, 160, 200, 0.2); }
#${PANEL_ID} .v2-debug-section { color: #88c0d0; font-size: 10px; margin: 6px 0 2px; text-transform: uppercase; letter-spacing: 0.05em; }
#${PANEL_ID} .v2-debug-alarm { color: #ff7070; font-weight: 600; }
#${PANEL_ID} .v2-debug-warn { color: #ffb060; }
#${PANEL_ID} .v2-debug-budget { color: #506070; font-size: 10px; }
#${TOGGLE_BTN_ID} {
  position: fixed; top: 12px; left: 12px; z-index: 9998;
  width: 28px; height: 28px;
  background: rgba(8, 12, 20, 0.6); color: #d0e0f0;
  border: 1px solid rgba(120, 160, 200, 0.25);
  border-radius: 4px;
  font: 14px ui-monospace, monospace; cursor: pointer; padding: 0; line-height: 1;
}
#${TOGGLE_BTN_ID}:hover { background: rgba(8, 12, 20, 0.85); }
#${TOGGLE_BTN_ID}.v2-debug-visible { left: 270px; }
    `.trim();
    const head = this._env.document.head || (this._env.document.body || {}).parentNode;
    if (head && head.appendChild) head.appendChild(style);
  }

  _ensureToggleButton() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(TOGGLE_BTN_ID)) return;
    const btn = this._env.document.createElement('button');
    btn.id = TOGGLE_BTN_ID;
    btn.textContent = '⏱';
    btn.title = 'Toggle debug overlay (~)';
    if (btn.addEventListener) {
      btn.addEventListener('click', () => this.toggle());
    }
    const host = this._env.document.body;
    if (host && host.appendChild) host.appendChild(btn);
    // 全局快捷键: ~ (反引号)
    this._keyHandler = (e) => {
      if (e.key === '`' || e.key === '~') {
        const tag = (e.target && e.target.tagName) || '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        this.toggle();
      }
    };
    if (this._env.window && this._env.window.addEventListener) {
      this._env.window.addEventListener('keydown', this._keyHandler);
    }
  }

  _ensurePanel() {
    if (!this._env.document) return;
    if (this._env.document.getElementById(PANEL_ID)) return;
    const panel = this._env.document.createElement('div');
    panel.id = PANEL_ID;
    const stageRows = STAGE_NAMES.map(n =>
      `<tr><td>${n}</td><td data-key="stage-${n}-ms">0.00</td><td data-key="stage-${n}-max">0.00</td><td class="v2-debug-budget">—</td></tr>`
    ).join('');
    panel.innerHTML = `
<div class="v2-debug-section">Render Pipeline</div>
<table>
  <tr><td>FPS</td><td data-key="fps">0.0</td></tr>
  <tr><td>ms / frame</td><td data-key="ms">0.00</td></tr>
  <tr><td>expected</td><td data-key="expected">0.00</td></tr>
  <tr><td>overhead</td><td data-key="overhead">0.00 (0%)</td></tr>
  <tr><td>frames</td><td data-key="frames">0</td></tr>
  <tr><td>cache hit</td><td data-key="cache">0%</td></tr>
  <tr><td>errors</td><td data-key="errors">0</td></tr>
  <tr><td>overruns</td><td data-key="overruns">0</td></tr>
</table>
<div class="v2-debug-section">Stages</div>
<table>
  <thead><tr><th>name</th><th>avg</th><th>max</th><th>budget</th></tr></thead>
  <tbody>${stageRows}</tbody>
</table>
    `.trim();
    const host = this._env.document.body;
    if (host && host.appendChild) host.appendChild(panel);
  }

  _applyVisibility() {
    if (!this._env.document) return;
    const panel = this._env.document.getElementById(PANEL_ID);
    if (panel) {
      if (panel.classList) panel.classList.toggle('v2-debug-visible', this._visible);
    }
    const btn = this._env.document.getElementById(TOGGLE_BTN_ID);
    if (btn) {
      if (btn.classList) btn.classList.toggle('v2-debug-visible', this._visible);
    }
  }
}

// ===== 内部辅助 =====

function setText(panel, key, value) {
  const el = panel.querySelector(`[data-key="${key}"]`);
  if (el) el.textContent = String(value);
  return el;
}

function _detectEnv() {
  // 浏览器/Node 自动识别
  if (typeof document !== 'undefined') {
    return {
      document,
      window: typeof window !== 'undefined' ? window : null,
      requestAnimationFrame: typeof requestAnimationFrame !== 'undefined'
        ? (cb) => requestAnimationFrame(cb) : null,
      cancelAnimationFrame: typeof cancelAnimationFrame !== 'undefined'
        ? (h) => cancelAnimationFrame(h) : null,
    };
  }
  return { document: null, window: null, requestAnimationFrame: null, cancelAnimationFrame: null };
}
