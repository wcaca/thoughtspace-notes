/**
 * [INPUT]: actions 配置数组 [{ id, icon, label, hint, onTrigger, isActive? }]
 * [OUTPUT]: createToolbar({ actions, onChange }) → { setMode('desktop'|'mobile'), setActive(id), el, destroy }
 * [POS]: src/render 下 — 工具条渲染(桌面左上浮动 / 移动底部固定),响应式由 body.is-mobile 切换
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 设计原则(保留修改余地):
 *  - 工具条按钮完全由 actions 配置数组驱动,改按钮只改配置
 *  - 视觉模式(desktop/mobile)由 setMode 切换,不耦合 main.js 业务
 *  - active 状态由 setActive(id) 设置,可反映"冥想中"等动态状态
 *  - 所有按钮都是真 <button>,具备键盘可达 + focus-visible 焦点环
 *  - 移动端工具条预留安全区域(env(safe-area-inset-bottom))
 */

import { prefersReducedMotion } from './a11y.js';

const MODE_DESKTOP = 'desktop';
const MODE_MOBILE = 'mobile';

export function createToolbar({ actions = [], onChange = null } = {}) {
  let currentMode = MODE_DESKTOP;
  const activeSet = new Set();

  const desktopEl = document.createElement('div');
  desktopEl.className = 'desktop-toolbar';
  desktopEl.setAttribute('aria-label', '工具条');

  const mobileEl = document.createElement('div');
  mobileEl.className = 'mobile-toolbar';
  mobileEl.setAttribute('aria-label', '工具条');

  function renderButton(action, mode) {
    const btn = document.createElement('button');
    btn.className = 'tb-btn';
    btn.dataset.id = action.id;
    btn.dataset.label = action.label || action.id;
    btn.title = action.hint || action.label || '';
    btn.setAttribute('aria-label', action.label || action.id);
    btn.setAttribute('type', 'button');
    btn.tabIndex = 0;

    if (mode === MODE_MOBILE) {
      const icon = document.createElement('span');
      icon.className = 'tb-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = action.icon || '?';
      const label = document.createElement('span');
      label.className = 'tb-label';
      label.textContent = action.label || '';
      btn.appendChild(icon);
      btn.appendChild(label);
    } else {
      const iconSpan = document.createElement('span');
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.textContent = action.icon || '?';
      btn.appendChild(iconSpan);
    }

    if (action.isActive && action.isActive()) {
      btn.dataset.active = '1';
      activeSet.add(action.id);
    }

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (action.onTrigger) action.onTrigger();
      if (onChange) onChange(action.id);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        btn.click();
      }
    });
    return btn;
  }

  function renderDivider(mode) {
    const div = document.createElement('div');
    div.className = 'tb-divider';
    return div;
  }

  function rebuild() {
    desktopEl.innerHTML = '';
    mobileEl.innerHTML = '';
    activeSet.clear();
    actions.forEach((action, idx) => {
      if (action.divider) {
        desktopEl.appendChild(renderDivider(MODE_DESKTOP));
        return;
      }
      const dbtn = renderButton(action, MODE_DESKTOP);
      desktopEl.appendChild(dbtn);
      const mbtn = renderButton(action, MODE_MOBILE);
      mobileEl.appendChild(mbtn);
    });
  }

  function setMode(mode) {
    if (mode !== MODE_DESKTOP && mode !== MODE_MOBILE) return;
    currentMode = mode;
    if (mode === MODE_MOBILE) {
      document.body.classList.add('is-mobile');
      // 移动端:底部安全区域(避开 iPhone Home 指示条)
      mobileEl.style.paddingBottom = 'calc(env(safe-area-inset-bottom, 0px) + 6px)';
      mobileEl.style.touchAction = 'manipulation';
    } else {
      document.body.classList.remove('is-mobile');
    }
    // 触发显示动画(尊重 prefers-reduced-motion)
    if (prefersReducedMotion()) {
      if (mode === MODE_DESKTOP) desktopEl.classList.add('show');
      else mobileEl.classList.add('show');
      return;
    }
    requestAnimationFrame(() => {
      if (mode === MODE_DESKTOP) {
        desktopEl.classList.add('show');
      } else {
        mobileEl.classList.add('show');
      }
    });
  }

  function setActive(id, active = true) {
    if (active) activeSet.add(id); else activeSet.delete(id);
    [desktopEl, mobileEl].forEach((root) => {
      const btn = root.querySelector(`.tb-btn[data-id="${id}"]`);
      if (btn) {
        if (active) btn.dataset.active = '1';
        else delete btn.dataset.active;
      }
    });
  }

  function setEnabled(id, enabled = true) {
    [desktopEl, mobileEl].forEach((root) => {
      const btn = root.querySelector(`.tb-btn[data-id="${id}"]`);
      if (btn) {
        btn.disabled = !enabled;
        if (enabled) delete btn.dataset.disabled;
        else btn.dataset.disabled = '1';
      }
    });
  }

  function getMode() { return currentMode; }

  function destroy() {
    if (desktopEl.parentNode) desktopEl.remove();
    if (mobileEl.parentNode) mobileEl.remove();
    document.body.classList.remove('is-mobile');
  }

  rebuild();
  document.body.appendChild(desktopEl);
  document.body.appendChild(mobileEl);

  return {
    el: { desktop: desktopEl, mobile: mobileEl },
    setMode,
    getMode,
    setActive,
    setEnabled,
    rebuild,
    destroy,
    MODE_DESKTOP,
    MODE_MOBILE
  };
}

/**
 * isMobileViewport — 当前视口是否为移动端尺寸
 * 阈值与 CSS 中 @media (max-width: 767px) 一致,便于调整
 */
export function isMobileViewport() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 767px)').matches;
}

/**
 * watchViewport — 监听视口变化,跨过 768px 断点时回调
 * @param {(mode: 'desktop'|'mobile') => void} cb
 * @returns {() => void} 取消监听
 */
export function watchViewport(cb) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mql = window.matchMedia('(max-width: 767px)');
  const handler = (e) => cb(e.matches ? MODE_MOBILE : MODE_DESKTOP);
  if (mql.addEventListener) mql.addEventListener('change', handler);
  else if (mql.addListener) mql.addListener(handler);
  return () => {
    if (mql.removeEventListener) mql.removeEventListener('change', handler);
    else if (mql.removeListener) mql.removeListener(handler);
  };
}

export const TOOLBAR_MODES = { MODE_DESKTOP, MODE_MOBILE };
