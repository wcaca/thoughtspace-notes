/**
 * [INPUT]: DOM
 * [OUTPUT]: showQuickAdd({placeholder, onSubmit(text), onClose}) → DOM; hideQuickAdd(); isQuickAddOpen()
 * [POS]: src/render/quick-add.js — N 键唤起的快速捕获浮层;回车创建念头并触发回调,Esc 取消
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { overscrollContain, prefersReducedMotion } from './a11y.js';

let activePanel = null;
let cleanupEsc = null;
let onSubmitRef = null;
let onCloseRef = null;

export function showQuickAdd({ placeholder = '甩一个念头进来…', onSubmit, onClose } = {}) {
  if (activePanel) hideQuickAdd();
  onSubmitRef = typeof onSubmit === 'function' ? onSubmit : null;
  onCloseRef = typeof onClose === 'function' ? onClose : null;

  const root = document.createElement('div');
  root.id = 'quick-add';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '快速捕获念头');

  const inputWrap = document.createElement('div');
  inputWrap.className = 'qa-input-wrap';
  const input = document.createElement('input');
  input.className = 'qa-input';
  input.type = 'text';
  input.setAttribute('aria-label', '念头内容');
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 200;
  inputWrap.appendChild(input);
  root.appendChild(inputWrap);

  const hint = document.createElement('div');
  hint.className = 'qa-hint';
  hint.textContent = 'Enter 投入 · Esc 取消';
  root.appendChild(hint);

  const transition = prefersReducedMotion() ? 'opacity 0.1s' : 'opacity 0.25s var(--ease-out, ease-out), transform 0.25s var(--ease-out, ease-out)';
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '120',
    left: '50%',
    top: '18%',
    transform: prefersReducedMotion() ? 'translateX(-50%)' : 'translateX(-50%) translateY(12px) scale(0.96)',
    width: '440px',
    maxWidth: '90vw',
    background: 'linear-gradient(160deg, rgba(28, 22, 18, 0.94), rgba(20, 14, 22, 0.97))',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px',
    border: '1px solid rgba(232, 168, 101, 0.4)',
    padding: '18px 20px 14px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 80px rgba(232, 168, 101, 0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0',
    transition,
    overscrollBehavior: 'contain',
    touchAction: 'manipulation'
  });
  // 顶部发光装饰
  root.style.position = 'fixed';
  overscrollContain(root);

  // 内联输入框样式(与 global-search 风格一致,但用琥珀色焦点呼应"播种"调性)
  Object.assign(input.style, {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(20, 14, 22, 0.6)',
    border: '1px solid rgba(232, 168, 101, 0.3)',
    borderRadius: '10px',
    color: '#fff8dc',
    font: 'inherit',
    fontSize: '15px',
    letterSpacing: '0.5px',
    outline: 'none',
    transition: 'all 0.2s var(--ease-out, ease-out)',
    touchAction: 'manipulation'
  });
  input.addEventListener('focus', () => {
    input.style.borderColor = 'rgba(232, 168, 101, 0.75)';
    input.style.boxShadow = '0 0 28px rgba(232, 168, 101, 0.25), 0 0 0 3px rgba(232, 168, 101, 0.1)';
    input.style.background = 'rgba(232, 168, 101, 0.04)';
  });
  input.addEventListener('blur', () => {
    input.style.borderColor = 'rgba(232, 168, 101, 0.3)';
    input.style.boxShadow = 'none';
    input.style.background = 'rgba(20, 14, 22, 0.6)';
  });

  Object.assign(hint.style, {
    marginTop: '10px',
    fontSize: '10px',
    color: '#8b90ad',
    letterSpacing: '2.5px',
    textAlign: 'center',
    opacity: '0.75',
    textTransform: 'uppercase'
  });

  // 头部标题"播种新念头"提示
  const titleBar = document.createElement('div');
  titleBar.className = 'qa-title';
  titleBar.textContent = '✦ 播种新念头';
  Object.assign(titleBar.style, {
    fontSize: '12px',
    letterSpacing: '3px',
    color: '#e8a865',
    marginBottom: '10px',
    textAlign: 'center',
    fontWeight: '500'
  });
  root.insertBefore(titleBar, inputWrap);

  function submit() {
    const v = input.value.trim();
    if (!v) {
      hideQuickAdd();
      return;
    }
    const cb = onSubmitRef;
    if (cb) cb(v);
    // 提交后立即关闭,避免重复触发
    hideQuickAdd();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hideQuickAdd();
    }
  });

  document.body.appendChild(root);
  activePanel = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateX(-50%) scale(1)';
    input.focus();
  });
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('quick-add', root, () => hideQuickAdd());
  }).catch(() => { /* ignore */ });

  // 全局 Esc 捕获(防止输入框失焦后仍能关闭)
  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideQuickAdd();
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });
  return root;
}

export function hideQuickAdd() {
  if (activePanel) {
    const el = activePanel;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc, { capture: true });
    cleanupEsc = null;
  }
  const cb = onCloseRef;
  onSubmitRef = null;
  onCloseRef = null;
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('quick-add'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
  if (cb) cb();
}

export function isQuickAddOpen() {
  return !!activePanel;
}
