/**
 * [INPUT]: DOM, Action[]
 * [OUTPUT]: showActionPanel(actions, callbacks) → 行动列表浮层; hideActionPanel(); isActionPanelOpen()
 * [POS]: src/render/action-panel.js — 行动萃取的入口与列表;支持从念头提炼为 Action、状态流转
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let activePanel = null;
let cleanupEsc = null;

export function showActionPanel(actions, callbacks = {}) {
  hideActionPanel();
  const list = Array.from(actions || []);

  const root = document.createElement('div');
  root.id = 'action-panel';

  const header = document.createElement('div');
  header.className = 'ap-header';
  const title = document.createElement('div');
  title.className = 'ap-title';
  title.textContent = '行动';
  const count = document.createElement('div');
  count.className = 'ap-count';
  count.textContent = `${list.length}`;
  header.appendChild(title);
  header.appendChild(count);

  const close = document.createElement('button');
  close.className = 'ap-close';
  close.textContent = '×';
  close.title = '关闭 (Esc)';
  header.appendChild(close);
  root.appendChild(header);

  // "从已选念头提炼"按钮
  const extractBtn = document.createElement('button');
  extractBtn.className = 'ap-extract';
  extractBtn.textContent = '⬆ 从已选念头提炼';
  root.appendChild(extractBtn);

  const content = document.createElement('div');
  content.className = 'ap-content';
  if (list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'ap-empty';
    empty.textContent = '还没有行动 — 选中几个念头,然后点提炼';
    content.appendChild(empty);
  } else {
    // 按状态分组
    const groups = { todo: [], doing: [], done: [] };
    for (const a of list) {
      const s = a.status || 'todo';
      if (!groups[s]) groups[s] = [];
      groups[s].push(a);
    }
    const order = ['todo', 'doing', 'done'];
    const labels = { todo: '待办', doing: '进行中', done: '已完成' };
    for (const s of order) {
      if (groups[s].length === 0) continue;
      const groupEl = document.createElement('div');
      groupEl.className = 'ap-group';
      const head = document.createElement('div');
      head.className = 'ap-group-head';
      head.textContent = `${labels[s]} · ${groups[s].length}`;
      groupEl.appendChild(head);
      for (const a of groups[s]) {
        groupEl.appendChild(makeRow(a, callbacks));
      }
      content.appendChild(groupEl);
    }
  }
  root.appendChild(content);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '110',
    right: '20px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '340px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.92) 0%, rgba(14, 18, 36, 0.94) 100%)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px',
    border: '1px solid rgba(232, 168, 101, 0.25)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '13px',
    boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 80px rgba(232, 168, 101, 0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0',
    transition: 'opacity 0.25s var(--ease-out, ease-out), transform 0.25s var(--ease-out, ease-out)'
  });

  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 18px 12px',
    borderBottom: '1px solid rgba(232, 168, 101, 0.15)',
    background: 'linear-gradient(180deg, rgba(232,168,101,0.05), transparent)'
  });
  Object.assign(title.style, {
    fontSize: '16px',
    fontWeight: '500',
    letterSpacing: '3px',
    background: 'linear-gradient(120deg, #fff8dc, #e8a865)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  });
  Object.assign(count.style, {
    fontSize: '11px',
    color: '#e8a865',
    background: 'rgba(232, 168, 101, 0.18)',
    padding: '2px 9px',
    borderRadius: '9px',
    flex: '1',
    fontWeight: '600',
    letterSpacing: '0.5px'
  });
  Object.assign(close.style, {
    background: 'transparent', border: '1px solid transparent',
    color: '#8b90ad', fontSize: '20px', cursor: 'pointer',
    padding: '0', width: '26px', height: '26px', borderRadius: '50%',
    transition: 'all 0.2s var(--ease-out, ease-out)', lineHeight: 1
  });

  Object.assign(extractBtn.style, {
    margin: '12px 18px 0',
    padding: '10px 14px',
    background: 'linear-gradient(135deg, rgba(232, 168, 101, 0.25), rgba(232, 168, 101, 0.1))',
    border: '1px solid rgba(232, 168, 101, 0.55)',
    borderRadius: '10px',
    color: '#fff8dc',
    fontFamily: 'inherit',
    fontSize: '12px',
    fontWeight: '500',
    letterSpacing: '1px',
    cursor: 'pointer',
    transition: 'all 0.2s var(--ease-out, ease-out)',
    boxShadow: '0 4px 16px rgba(232,168,101,0.15)'
  });

  Object.assign(content.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '0 16px 14px'
  });

  close.addEventListener('click', hideActionPanel);
  close.addEventListener('mouseenter', () => {
    close.style.background = 'rgba(232,122,168,0.18)';
    close.style.color = '#fbe1ec';
    close.style.transform = 'rotate(90deg)';
  });
  close.addEventListener('mouseleave', () => {
    close.style.background = 'transparent';
    close.style.color = '#8b90ad';
    close.style.transform = 'rotate(0)';
  });
  extractBtn.addEventListener('mouseenter', () => {
    extractBtn.style.transform = 'translateY(-1px)';
    extractBtn.style.boxShadow = '0 8px 24px rgba(232,168,101,0.25)';
  });
  extractBtn.addEventListener('mouseleave', () => {
    extractBtn.style.transform = 'translateY(0)';
    extractBtn.style.boxShadow = '0 4px 16px rgba(232,168,101,0.15)';
  });
  extractBtn.addEventListener('click', () => {
    if (callbacks.onExtract) callbacks.onExtract();
  });

  cleanupEsc = (e) => { if (e.key === 'Escape') hideActionPanel(); };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(root);
  requestAnimationFrame(() => {
    root.style.opacity = '1';
  });
  activePanel = root;
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('action', root, () => hideActionPanel());
  }).catch(() => { /* ignore */ });
  return root;
}

function makeRow(action, callbacks) {
  const row = document.createElement('div');
  row.className = 'ap-row';
  const status = action.status || 'todo';
  const statusIcon = status === 'done' ? '✓' : status === 'doing' ? '◐' : '○';
  const statusColor = status === 'done' ? '#7fe0c9' : status === 'doing' ? '#e8a865' : '#5a6080';

  const icon = document.createElement('span');
  icon.className = 'ap-row-icon';
  icon.textContent = statusIcon;
  icon.style.color = statusColor;
  row.appendChild(icon);

  const titleEl = document.createElement('div');
  titleEl.className = 'ap-row-title';
  titleEl.textContent = action.title || '(未命名行动)';
  if (status === 'done') titleEl.style.textDecoration = 'line-through';
  row.appendChild(titleEl);

  const meta = document.createElement('div');
  meta.className = 'ap-row-meta';
  const srcCount = (action.sourceThoughtIds || []).length;
  meta.textContent = srcCount > 0 ? `源自 ${srcCount} 个念头` : '';
  row.appendChild(meta);

  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    margin: '4px 0',
    background: 'rgba(20, 26, 51, 0.4)',
    border: '1px solid rgba(122, 140, 200, 0.15)',
    borderRadius: '8px',
    cursor: 'pointer'
  });

  Object.assign(icon.style, { fontSize: '14px', flex: '0 0 auto' });
  Object.assign(titleEl.style, {
    flex: '1', fontSize: '12px', color: '#fff8dc',
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
  });
  Object.assign(meta.style, { fontSize: '10px', color: '#5a6080', flex: '0 0 auto' });

  row.addEventListener('click', () => {
    if (callbacks.onCycleStatus) callbacks.onCycleStatus(action.id);
  });

  return row;
}

export function hideActionPanel() {
  if (activePanel) {
    activePanel.style.opacity = '0';
    const el = activePanel;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 250);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('action'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isActionPanelOpen() {
  return !!activePanel;
}
