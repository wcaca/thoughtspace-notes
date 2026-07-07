/**
 * [INPUT]: src/core/edge(RelationType, EDGE_STYLES), DOM
 * [OUTPUT]: showEdgePanel({edge, anchorScreenPos, sourceName, targetName, onChangeType, onDelete, onSwap, onClose}) → DOM 面板;hideEdgePanel();isEdgePanelOpen()
 * [POS]: src/render/edge-panel.js — 双击边后弹出的"改 type / 删除 / 互换方向"小面板;Esc 取消
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { RelationType, EDGE_STYLES } from '../core/edge.js';

let panelEl = null;
let cleanupEsc = null;
let onChangeTypeRef = null;
let onDeleteRef = null;
let onSwapRef = null;
let onCloseRef = null;

const TYPES_ORDER = [
  RelationType.CAUSE,
  RelationType.PARALLEL,
  RelationType.CONFLICT,
  RelationType.SEQUENCE,
  RelationType.SUBORDINATE
];

export function showEdgePanel({ edge, anchorScreenPos, sourceName, targetName, onChangeType, onDelete, onSwap, onClose }) {
  hideEdgePanel();
  onChangeTypeRef = typeof onChangeType === 'function' ? onChangeType : null;
  onDeleteRef = typeof onDelete === 'function' ? onDelete : null;
  onSwapRef = typeof onSwap === 'function' ? onSwap : null;
  onCloseRef = typeof onClose === 'function' ? onClose : null;

  const root = document.createElement('div');
  root.id = 'edge-panel';
  root.dataset.edgeId = edge.id;
  root.dataset.edgeType = edge.relationType;

  const header = document.createElement('div');
  header.className = 'ep-header';
  const src = truncate(sourceName || '源', 8);
  const tgt = truncate(targetName || '目标', 8);
  const style = EDGE_STYLES[edge.relationType];
  header.innerHTML = `<span class="ep-swatch" style="background:${style.color}">${style.symbol}</span><span class="ep-pair">${escHtml(src)} ↔ ${escHtml(tgt)}</span><button class="ep-close" title="关闭">×</button>`;
  root.appendChild(header);

  const sectionLabel = document.createElement('div');
  sectionLabel.className = 'ep-section';
  sectionLabel.textContent = '修改关系类型';
  root.appendChild(sectionLabel);

  const list = document.createElement('div');
  list.className = 'ep-list';
  for (const type of TYPES_ORDER) {
    const ts = EDGE_STYLES[type];
    const btn = document.createElement('button');
    btn.className = 'ep-type';
    if (type === edge.relationType) btn.classList.add('is-current');
    btn.dataset.type = type;

    const swatch = document.createElement('span');
    swatch.className = 'ep-type-swatch';
    swatch.style.background = ts.color;
    swatch.textContent = ts.symbol;

    const txt = document.createElement('span');
    txt.className = 'ep-type-text';
    txt.textContent = ts.label;

    btn.appendChild(swatch);
    btn.appendChild(txt);
    btn.addEventListener('click', () => {
      const cb = onChangeTypeRef;
      hideEdgePanel();
      if (cb) cb(type);
    });
    list.appendChild(btn);
  }
  root.appendChild(list);

  const swapBtn = document.createElement('button');
  swapBtn.className = 'ep-swap';
  const isSelf = edge.fromId === edge.toId;
  if (isSelf) swapBtn.disabled = true;
  swapBtn.textContent = isSelf ? '↔ 互换方向(自环不可)' : '↔ 互换 A↔B 方向';
  swapBtn.addEventListener('click', () => {
    if (swapBtn.disabled) return;
    const cb = onSwapRef;
    hideEdgePanel();
    if (cb) cb();
  });
  root.appendChild(swapBtn);

  const dangerLabel = document.createElement('div');
  dangerLabel.className = 'ep-section';
  dangerLabel.textContent = '危险动作';
  root.appendChild(dangerLabel);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'ep-delete';
  deleteBtn.textContent = '✕ 删除这条关系';
  deleteBtn.addEventListener('click', () => {
    const cb = onDeleteRef;
    hideEdgePanel();
    if (cb) cb();
  });
  root.appendChild(deleteBtn);

  const baseLeft = Math.round(anchorScreenPos.x - 130);
  const baseTop = Math.round(anchorScreenPos.y - 240);
  const maxLeft = Math.max(8, window.innerWidth - 268);
  const maxTop = Math.max(8, window.innerHeight - 380);
  const left = Math.min(Math.max(8, baseLeft), maxLeft);
  const top = Math.min(Math.max(8, baseTop), maxTop);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '125',
    left: left + 'px',
    top: top + 'px',
    width: '240px',
    background: 'rgba(14, 18, 36, 0.95)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '14px',
    border: '1px solid rgba(232, 168, 101, 0.35)',
    padding: '14px 14px 12px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    letterSpacing: '1px',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6), 0 0 60px rgba(232, 168, 101, 0.18)',
    opacity: '0',
    transform: 'translateY(8px) scale(0.96)',
    transition: 'opacity 0.22s, transform 0.22s'
  });

  root.querySelector('.ep-close').addEventListener('click', hideEdgePanel);

  document.body.appendChild(root);
  panelEl = root;
  requestAnimationFrame(() => {
    if (panelEl === root) {
      root.style.opacity = '1';
      root.style.transform = 'translateY(0) scale(1)';
    }
  });

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideEdgePanel();
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });

  return root;
}

export function hideEdgePanel() {
  if (panelEl) {
    const el = panelEl;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 240);
    panelEl = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc, { capture: true });
    cleanupEsc = null;
  }
  const cb = onCloseRef;
  onChangeTypeRef = null;
  onDeleteRef = null;
  onSwapRef = null;
  onCloseRef = null;
  if (cb) cb();
}

export function isEdgePanelOpen() {
  return !!panelEl;
}

function truncate(s, n) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
