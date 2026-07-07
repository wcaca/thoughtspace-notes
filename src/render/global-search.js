/**
 * [INPUT]: DOM, src/core/thought 域内任意 getter(无依赖)
 * [OUTPUT]: showGlobalSearch({placeholder, onSelect(match), onClose}) → DOM; hideGlobalSearch();isGlobalSearchOpen()
 * [POS]: src/render/global-search.js — F 键唤起的顶部固定搜索面板,纯 DOM + 模糊子串匹配
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { normalizeLabel } from '../core/thought.js';
import { overscrollContain, prefersReducedMotion } from './a11y.js';

let activePanel = null;
let cleanupEsc = null;
let onSelectRef = null;
let onCloseRef = null;
let onChangeRef = null;
let matchesRef = [];
let cursorRef = 0;

export function showGlobalSearch({ placeholder = '搜索念头…', onSelect, onClose, onChange } = {}) {
  if (activePanel) {
    hideGlobalSearch();
  }
  onSelectRef = typeof onSelect === 'function' ? onSelect : null;
  onCloseRef = typeof onClose === 'function' ? onClose : null;
  onChangeRef = typeof onChange === 'function' ? onChange : null;
  matchesRef = [];
  cursorRef = 0;

  const root = document.createElement('div');
  root.id = 'global-search';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '全局搜索');

  const inputWrap = document.createElement('div');
  inputWrap.className = 'gs-input-wrap';
  const input = document.createElement('input');
  input.className = 'gs-input';
  input.type = 'text';
  input.setAttribute('aria-label', '搜索关键词');
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  inputWrap.appendChild(input);
  root.appendChild(inputWrap);

  const counter = document.createElement('div');
  counter.className = 'gs-counter';
  counter.textContent = '';
  root.appendChild(counter);

  const hintRow = document.createElement('div');
  hintRow.className = 'gs-hint';
  hintRow.textContent = '↑↓ 切换 · Enter 跳转 · Esc 关闭';
  root.appendChild(hintRow);

  const empty = document.createElement('div');
  empty.className = 'gs-empty';
  empty.textContent = '输入关键词在所有念头中匹配';
  root.appendChild(empty);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '120',
    left: '50%',
    top: '20%',
    transform: 'translateX(-50%) scale(0.96)',
    width: '420px',
    maxWidth: '90vw',
    background: 'rgba(14, 18, 36, 0.94)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
    borderRadius: '14px',
    border: '1px solid rgba(127, 224, 201, 0.3)',
    padding: '14px 16px 12px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 80px rgba(127, 224, 201, 0.18)',
    opacity: '0',
    transition: 'opacity 0.18s, transform 0.18s'
  });

  input.addEventListener('input', () => {
    const q = input.value.trim();
    if (onChangeRef) onChangeRef(q, matchesRef);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideGlobalSearch();
      return;
    }
    if (e.key === 'ArrowDown' || (e.key === 'j' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      moveCursor(1);
      return;
    }
    if (e.key === 'ArrowUp' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      moveCursor(-1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const m = currentMatch();
      if (m) {
        const sel = onSelectRef;
        if (sel) sel(m);
      }
      if (matchesRef.length > 1) moveCursor(1);
    }
  });

  document.body.appendChild(root);
  activePanel = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateX(-50%) scale(1)';
    input.focus();
  });

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideGlobalSearch();
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('search', root, () => hideGlobalSearch());
  }).catch(() => { /* ignore */ });
  return root;
}

export function setMatches(matches) {
  matchesRef = Array.isArray(matches) ? matches.slice() : [];
  cursorRef = 0;
  if (!activePanel) return;
  const counter = activePanel.querySelector('.gs-counter');
  if (counter) {
    if (matchesRef.length === 0) counter.textContent = '';
    else counter.textContent = `1/${matchesRef.length}`;
  }
  const empty = activePanel.querySelector('.gs-empty');
  if (empty) {
    const input = activePanel.querySelector('.gs-input');
    if (input && input.value.trim() && matchesRef.length === 0) {
      empty.textContent = '没有匹配的念头';
    } else if (!input || !input.value.trim()) {
      empty.textContent = '输入关键词在所有念头中匹配';
    } else {
      empty.textContent = '';
    }
  }
}

function moveCursor(delta) {
  if (matchesRef.length === 0) return;
  cursorRef = (cursorRef + delta + matchesRef.length) % matchesRef.length;
  if (!activePanel) return;
  const counter = activePanel.querySelector('.gs-counter');
  if (counter) counter.textContent = `${cursorRef + 1}/${matchesRef.length}`;
  const m = currentMatch();
  if (m && onSelectRef) onSelectRef(m);
}

function currentMatch() {
  if (matchesRef.length === 0) return null;
  return matchesRef[cursorRef] || null;
}

export function isGlobalSearchOpen() {
  return !!activePanel;
}

export function getQueryText() {
  if (!activePanel) return '';
  const input = activePanel.querySelector('.gs-input');
  return input ? input.value : '';
}

export function hideGlobalSearch() {
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
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('search'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
  matchesRef = [];
  cursorRef = 0;
  const cb = onCloseRef;
  onSelectRef = null;
  onChangeRef = null;
  onCloseRef = null;
  if (cb) cb();
}

function matchThought(thought, query) {
  if (!thought || !query) return 0;
  const q = normalizeLabel(query) || query.trim().toLowerCase();
  if (!q) return 0;
  const text = (thought.text || '').toLowerCase();
  const idx = text.indexOf(q);
  if (idx !== -1) return 1 - idx / 1000;
  const labels = Array.isArray(thought.labels) ? thought.labels.join(' ').toLowerCase() : '';
  if (labels.indexOf(q) !== -1) return 0.5;
  return 0;
}

export function searchThoughts(thoughts, query) {
  if (!Array.isArray(thoughts) || !query || !query.trim()) return [];
  const scored = [];
  for (const t of thoughts) {
    const score = matchThought(t, query);
    if (score > 0) scored.push({ thought: t, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.thought);
}

export const __test__ = { matchThought, searchThoughts };
