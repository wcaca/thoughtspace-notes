/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: showCommandPalette({ items, callbacks }) → DOM; hideCommandPalette(); isCommandPaletteOpen()
 * [POS]: src/render/command-palette.js — Ctrl+K 命令面板;模糊搜索可达的操作
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let activePanel = null;
let cleanupEsc = null;

export function showCommandPalette({ items = [], placeholder = '输入命令或快捷键...', onPick } = {}) {
  if (activePanel) hideCommandPalette();
  const root = document.createElement('div');
  root.id = 'cmd-palette';
  root.setAttribute('role', 'listbox');

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '140',
    left: '50%',
    top: '20%',
    transform: 'translateX(-50%) translateY(-12px) scale(0.96)',
    width: '460px',
    maxWidth: '90vw',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.96), rgba(14, 18, 36, 0.98))',
    backdropFilter: 'blur(28px) saturate(180%)',
    WebkitBackdropFilter: 'blur(28px) saturate(180%)',
    borderRadius: '14px',
    border: '1px solid rgba(127, 224, 201, 0.35)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    boxShadow: '0 24px 64px rgba(0,0,0,0.7), 0 0 80px rgba(127,224,201,0.2), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0',
    transition: 'opacity 0.2s cubic-bezier(0.16, 1, 0.3, 1), transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    overflow: 'hidden',
    pointerEvents: 'auto'
  });

  const input = document.createElement('input');
  Object.assign(input.style, {
    width: '100%',
    padding: '14px 18px',
    background: 'transparent',
    border: 'none',
    borderBottom: '1px solid rgba(127,224,201,0.15)',
    color: '#fff8dc',
    font: 'inherit',
    fontSize: '15px',
    outline: 'none'
  });
  input.placeholder = placeholder;
  input.spellcheck = false;
  root.appendChild(input);

  const list = document.createElement('div');
  Object.assign(list.style, {
    maxHeight: '50vh',
    overflowY: 'auto',
    padding: '6px 0'
  });
  root.appendChild(list);

  let currentItems = items.slice();
  let activeIdx = 0;

  function renderList(query) {
    list.innerHTML = '';
    const q = (query || '').toLowerCase().trim();
    const filtered = q ? currentItems.filter((it) => {
      return (it.label || '').toLowerCase().includes(q)
          || (it.hint || '').toLowerCase().includes(q)
          || (it.key || '').toLowerCase().includes(q);
    }) : currentItems;
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      Object.assign(empty.style, {
        padding: '20px',
        textAlign: 'center',
        color: '#8b90ad',
        fontSize: '12px'
      });
      empty.textContent = '没有匹配的命令';
      list.appendChild(empty);
      return;
    }
    filtered.forEach((it, i) => {
      const row = document.createElement('div');
      Object.assign(row.style, {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '10px 18px',
        cursor: 'pointer',
        transition: 'background 0.15s',
        background: i === activeIdx ? 'rgba(127,224,201,0.12)' : 'transparent',
        borderLeft: i === activeIdx ? '3px solid var(--crystal, #7fe0c9)' : '3px solid transparent'
      });
      const icon = document.createElement('span');
      Object.assign(icon.style, {
        width: '20px', textAlign: 'center', fontSize: '16px', flexShrink: 0,
        color: i === activeIdx ? '#7fe0c9' : '#8b90ad'
      });
      icon.textContent = it.icon || '·';
      const main = document.createElement('div');
      main.style.flex = '1';
      main.style.minWidth = '0';
      const label = document.createElement('div');
      Object.assign(label.style, { fontSize: '13px', color: i === activeIdx ? '#fff' : '#e9e7f4', letterSpacing: '0.5px' });
      label.textContent = it.label || '';
      const hint = document.createElement('div');
      Object.assign(hint.style, { fontSize: '10px', color: '#8b90ad', marginTop: '2px' });
      hint.textContent = it.hint || '';
      main.appendChild(label);
      if (it.hint) main.appendChild(hint);
      const keyBadge = document.createElement('span');
      if (it.key) {
        Object.assign(keyBadge.style, {
          padding: '2px 8px',
          background: 'rgba(127,224,201,0.1)',
          border: '1px solid rgba(127,224,201,0.25)',
          borderRadius: '4px',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: '10px',
          color: '#7fe0c9',
          letterSpacing: '0.5px'
        });
        keyBadge.textContent = it.key;
      }
      row.appendChild(icon);
      row.appendChild(main);
      if (it.key) row.appendChild(keyBadge);
      row.addEventListener('mouseenter', () => {
        activeIdx = filtered.indexOf(it);
        renderList(input.value);
      });
      row.addEventListener('click', () => {
        if (onPick) onPick(it);
        if (it.onPick) it.onPick();
        hideCommandPalette();
      });
      list.appendChild(row);
    });
  }

  input.addEventListener('input', () => {
    activeIdx = 0;
    renderList(input.value);
  });

  input.addEventListener('keydown', (e) => {
    const visible = list.querySelectorAll('[data-cmd-row]');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, currentItems.length - 1);
      renderList(input.value);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      renderList(input.value);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = input.value.toLowerCase().trim();
      const filtered = q ? currentItems.filter((it) => {
        return (it.label || '').toLowerCase().includes(q)
            || (it.hint || '').toLowerCase().includes(q)
            || (it.key || '').toLowerCase().includes(q);
      }) : currentItems;
      const it = filtered[activeIdx] || filtered[0];
      if (it) {
        if (onPick) onPick(it);
        if (it.onPick) it.onPick();
        hideCommandPalette();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hideCommandPalette();
    }
  });

  document.body.appendChild(root);
  activePanel = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateX(-50%) translateY(0) scale(1)';
    input.focus();
  });

  cleanupEsc = (e) => {
    if (e.key === 'Escape' && document.activeElement !== input) {
      hideCommandPalette();
    }
  };
  document.addEventListener('keydown', cleanupEsc);
  renderList('');
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('command-palette', root, () => hideCommandPalette());
  }).catch(() => { /* ignore */ });
  return root;
}

export function hideCommandPalette() {
  if (activePanel) {
    const el = activePanel;
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(-12px) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 220);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('command-palette'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isCommandPaletteOpen() {
  return !!activePanel;
}