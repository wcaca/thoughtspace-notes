/**
 * [INPUT]: window 全局错误事件,three.js renderer
 * [OUTPUT]: 全局错误捕获 + 白屏恢复 + 用户友好提示
 * [POS]: src/render 下,在 main.js 启动时初始化
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let errorOverlay = null;
let errorCount = 0;
let lastErrorAt = 0;
let isRecovering = false;

const ERROR_THRESHOLD = 5;
const ERROR_WINDOW_MS = 10000;

function createErrorOverlay(message, detail) {
  if (errorOverlay) {
    const msgEl = errorOverlay.querySelector('.err-message');
    const detailEl = errorOverlay.querySelector('.err-detail');
    if (msgEl) msgEl.textContent = message;
    if (detailEl) detailEl.textContent = detail || '';
    return errorOverlay;
  }

  const overlay = document.createElement('div');
  overlay.id = 'error-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 30, 0.92);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    z-index: 99999; font-family: 'Segoe UI', system-ui, sans-serif;
    color: #e0e8ec; padding: 20px;
    backdrop-filter: blur(8px);
  `;
  overlay.innerHTML = `
    <div style="max-width: 480px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 16px;">⚠</div>
      <div class="err-message" style="font-size: 18px; font-weight: 600; margin-bottom: 8px; color: #7fe0c9;">
        ${message}
      </div>
      <div class="err-detail" style="font-size: 13px; color: #8a9ba5; margin-bottom: 24px; word-break: break-all; max-height: 120px; overflow: auto;">
        ${detail || ''}
      </div>
      <button id="err-retry-btn" style="
        background: #7fe0c9; color: #0a161c; border: none;
        padding: 10px 28px; font-size: 14px; font-weight: 600;
        border-radius: 8px; cursor: pointer;
        font-family: inherit;
      ">刷新页面恢复</button>
      <button id="err-dismiss-btn" style="
        background: transparent; color: #8a9ba5; border: 1px solid #3a4a52;
        padding: 10px 20px; font-size: 13px; margin-left: 10px;
        border-radius: 8px; cursor: pointer;
        font-family: inherit;
      ">忽略继续</button>
    </div>
  `;

  const retryBtn = overlay.querySelector('#err-retry-btn');
  const dismissBtn = overlay.querySelector('#err-dismiss-btn');
  if (retryBtn) retryBtn.addEventListener('click', () => window.location.reload());
  if (dismissBtn) dismissBtn.addEventListener('click', () => {
    overlay.remove();
    errorOverlay = null;
    isRecovering = false;
    errorCount = 0;
  });

  document.body.appendChild(overlay);
  errorOverlay = overlay;
  return overlay;
}

function registerError(message, source) {
  const now = Date.now();
  if (now - lastErrorAt > ERROR_WINDOW_MS) errorCount = 0;
  errorCount++;
  lastErrorAt = now;

  if (errorCount >= ERROR_THRESHOLD && !isRecovering) {
    isRecovering = true;
    console.warn(`[error-handler] ${ERROR_THRESHOLD} errors in ${ERROR_WINDOW_MS}ms, showing recovery overlay`);
    createErrorOverlay(
      '空间遇到了一些问题',
      `${source}: ${message}`
    );
  }
}

export function setupGlobalErrorHandler() {
  window.addEventListener('error', (event) => {
    console.error('[global-error]', event.error || event.message, event.filename, event.lineno);
    registerError(event.message || 'unknown error', event.filename || 'window.error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandled-promise]', event.reason);
    const msg = event.reason?.message || String(event.reason) || 'unhandled promise rejection';
    registerError(msg, 'promise');
  });

  if (console && console.error) {
    const origError = console.error;
    console.error = (...args) => {
      origError.apply(console, args);
      try {
        // 过滤 three.js 内部的几何警告(BoundingSphere NaN 等)— 这些不影响页面正常运行
        const txt = args.map(a => a?.message || (typeof a === 'string' ? a : '') || '').join(' ');
        if (/THREE\.|BufferGeometry|computeBoundingSphere|raycast|CubeTexture/i.test(txt)) return;
        const msg = args.map(a => a?.message || String(a)).join(' ');
        registerError(msg.substring(0, 200), 'console.error');
      } catch (_) {}
    };
  }
}

export function wrapRenderLoop(loopFn) {
  return function safeLoop() {
    try {
      loopFn();
    } catch (e) {
      console.error('[render-loop] error in loop:', e);
      registerError(e?.message || String(e), 'render-loop');
      requestAnimationFrame(safeLoop);
    }
  };
}

export function showCriticalError(message, detail) {
  createErrorOverlay(message, detail);
}

export function getErrorCount() {
  return errorCount;
}
