/**
 * [INPUT]: DOM
 * [OUTPUT]: showReunionToast(pair, callbacks) → 边缘提示浮层; hideReunionToast(); isReunionToastOpen()
 * [POS]: src/render/reunion-toast.js — "意外重逢"低频提示;点击查看跳转,关闭则下次不再打扰
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let activeToast = null;
let dismissTimers = [];

export function showReunionToast(pair, callbacks = {}) {
  hideReunionToast();
  const { a, b, score } = pair;
  if (!a || !b) return;

  const root = document.createElement('div');
  root.id = 'reunion-toast';

  const icon = document.createElement('div');
  icon.className = 'rt-icon';
  icon.textContent = '✨';
  root.appendChild(icon);

  const body = document.createElement('div');
  body.className = 'rt-body';
  const title = document.createElement('div');
  title.className = 'rt-title';
  title.textContent = '一个念头和它远方的朋友很相似';
  body.appendChild(title);

  const pairEl = document.createElement('div');
  pairEl.className = 'rt-pair';
  const aChip = document.createElement('button');
  aChip.className = 'rt-chip';
  aChip.textContent = truncate(a.text, 18);
  const arrow = document.createElement('span');
  arrow.className = 'rt-arrow';
  arrow.textContent = '⇄';
  const bChip = document.createElement('button');
  bChip.className = 'rt-chip';
  bChip.textContent = truncate(b.text, 18);
  pairEl.appendChild(aChip);
  pairEl.appendChild(arrow);
  pairEl.appendChild(bChip);
  body.appendChild(pairEl);

  const scoreEl = document.createElement('div');
  scoreEl.className = 'rt-score';
  scoreEl.textContent = `相似度 ${Math.round(score * 100)}%`;
  body.appendChild(scoreEl);

  root.appendChild(body);

  const actions = document.createElement('div');
  actions.className = 'rt-actions';
  const btnView = document.createElement('button');
  btnView.className = 'rt-btn rt-btn-view';
  btnView.textContent = '看看';
  const btnLater = document.createElement('button');
  btnLater.className = 'rt-btn rt-btn-later';
  btnLater.textContent = '以后';
  actions.appendChild(btnView);
  actions.appendChild(btnLater);
  root.appendChild(actions);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '110',
    right: '20px',
    bottom: '20px',
    maxWidth: '320px',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '12px 14px',
    background: 'rgba(14, 18, 36, 0.92)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '12px',
    border: '1px solid rgba(232, 168, 101, 0.3)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 60px rgba(232, 168, 101, 0.18)',
    opacity: '0',
    transform: 'translateX(20px)',
    transition: 'opacity 0.3s, transform 0.3s'
  });

  Object.assign(icon.style, { fontSize: '20px', lineHeight: '1' });
  Object.assign(body.style, { flex: '1', minWidth: '0' });
  Object.assign(title.style, { fontSize: '11px', color: '#8b90ad', marginBottom: '6px', letterSpacing: '1px' });

  Object.assign(pairEl.style, { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '4px' });
  [aChip, bChip].forEach((el) => {
    Object.assign(el.style, {
      background: 'rgba(20, 26, 51, 0.7)',
      border: '1px solid rgba(122, 140, 200, 0.25)',
      borderRadius: '6px',
      padding: '3px 8px',
      color: '#fff8dc',
      fontFamily: 'inherit',
      fontSize: '11px',
      cursor: 'pointer',
      maxWidth: '120px',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    });
  });
  Object.assign(arrow.style, { color: '#7fe0c9', fontSize: '11px' });
  Object.assign(scoreEl.style, { fontSize: '10px', color: '#5a6080', marginTop: '2px' });

  Object.assign(actions.style, { display: 'flex', flexDirection: 'column', gap: '4px' });
  [btnView, btnLater].forEach((el) => {
    Object.assign(el.style, {
      padding: '4px 10px',
      borderRadius: '6px',
      border: '1px solid rgba(122, 140, 200, 0.25)',
      background: 'rgba(20, 26, 51, 0.6)',
      color: '#e9e7f4',
      fontFamily: 'inherit',
      fontSize: '11px',
      cursor: 'pointer'
    });
  });
  Object.assign(btnView.style, { borderColor: 'rgba(232, 168, 101, 0.5)', color: '#e8a865' });

  function close() {
    if (!activeToast) return;
    activeToast.style.opacity = '0';
    activeToast.style.transform = 'translateX(20px)';
    const el = activeToast;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
    activeToast = null;
    dismissTimers.forEach(t => clearTimeout(t));
    dismissTimers = [];
  }

  btnView.addEventListener('click', () => {
    if (callbacks.onView) callbacks.onView(pair);
    close();
  });
  btnLater.addEventListener('click', () => {
    if (callbacks.onDismiss) callbacks.onDismiss(pair);
    close();
  });
  aChip.addEventListener('click', () => { if (callbacks.onView) callbacks.onView({ ...pair, jumpTo: a.id }); close(); });
  bChip.addEventListener('click', () => { if (callbacks.onView) callbacks.onView({ ...pair, jumpTo: b.id }); close(); });

  document.body.appendChild(root);
  activeToast = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateX(0)';
  });

  // 自动消失(30 秒)
  dismissTimers.push(setTimeout(() => {
    if (callbacks.onDismiss) callbacks.onDismiss(pair);
    close();
  }, 30000));

  return root;
}

export function hideReunionToast() {
  if (activeToast) {
    const el = activeToast;
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
    activeToast = null;
  }
  dismissTimers.forEach(t => clearTimeout(t));
  dismissTimers = [];
}

export function isReunionToastOpen() {
  return !!activeToast;
}

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}
