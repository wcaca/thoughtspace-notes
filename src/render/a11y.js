/**
 * [INPUT]: window.matchMedia, navigator.userAgent
 * [OUTPUT]: prefersReducedMotion() / createLiveRegion() / ariaId() / escapeHTML() / focusableSelector
 * [POS]: src/render/a11y.js — 全局无障碍 + 排版工具,被各 render 模块消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let _mql = null;
let _mqlHandler = null;
const _listeners = new Set();

export function prefersReducedMotion() {
  if (!_mql && typeof window !== 'undefined' && window.matchMedia) {
    _mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    _mqlHandler = (e) => _listeners.forEach((cb) => cb(e.matches));
    if (_mql.addEventListener) _mql.addEventListener('change', _mqlHandler);
    else if (_mql.addListener) _mql.addListener(_mqlHandler);
  }
  return _mql ? _mql.matches : false;
}

export function onReducedMotionChange(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

let _liveRegion = null;
export function announce(message) {
  if (typeof document === 'undefined') return;
  if (!_liveRegion) {
    _liveRegion = document.createElement('div');
    _liveRegion.setAttribute('aria-live', 'polite');
    _liveRegion.setAttribute('aria-atomic', 'true');
    Object.assign(_liveRegion.style, {
      position: 'fixed',
      left: '-9999px',
      top: '0',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap'
    });
    document.body.appendChild(_liveRegion);
  }
  _liveRegion.textContent = '';
  setTimeout(() => { _liveRegion.textContent = message; }, 30);
}

let _idCounter = 0;
export function ariaId(prefix = 'a') {
  _idCounter++;
  return `${prefix}-${Date.now().toString(36)}-${_idCounter}`;
}

export function setSafeAria(el, role, label) {
  if (!el) return;
  if (role) el.setAttribute('role', role);
  if (label) el.setAttribute('aria-label', label);
}

export function trapFocus(container) {
  if (!container) return () => {};
  const handler = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = container.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  container.addEventListener('keydown', handler);
  return () => container.removeEventListener('keydown', handler);
}

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

export function applySafeAreaInsets(el, { padding = true, top = true, bottom = true } = {}) {
  if (!el) return;
  el.style.touchAction = 'manipulation';
  if (!padding) return;
  if (top) {
    el.style.paddingTop = 'calc(env(safe-area-inset-top, 0px) + ' + (el.style.paddingTop || '0px') + ')';
  }
  if (bottom) {
    el.style.paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + ' + (el.style.paddingBottom || '0px') + ')';
  }
}

export function overscrollContain(el) {
  if (!el) return;
  el.style.overscrollBehavior = 'contain';
  el.style.WebkitOverscrollBehavior = 'contain';
}