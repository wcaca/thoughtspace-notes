/**
 * [INPUT]: src/core/edge.js (RelationType, EDGE_STYLES)
 * [OUTPUT]: showRelationPicker({anchorScreenPos, sourceName, targetName, onSelect(type)}) → 浮动 5 选 1; hideRelationPicker(); isPickerOpen()
 * [POS]: src/render/relation-picker.js — 拖拽中悬停目标念头 0.5s 后弹出,选 type 后回调,Esc 取消;纯 DOM,无 Three.js 依赖
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { RelationType, EDGE_STYLES } from '../core/edge.js';

let pickerEl = null;
let cleanupEsc = null;
let onSelectRef = null;
let onCancelRef = null;

const TYPES_ORDER = [
  RelationType.CAUSE,
  RelationType.PARALLEL,
  RelationType.CONFLICT,
  RelationType.SEQUENCE,
  RelationType.SUBORDINATE
];

export function showRelationPicker({ anchorScreenPos, sourceName, targetName, onSelect, onCancel }) {
  hideRelationPicker();
  onSelectRef = typeof onSelect === 'function' ? onSelect : null;
  onCancelRef = typeof onCancel === 'function' ? onCancel : null;

  const root = document.createElement('div');
  root.id = 'relation-picker';

  const label = document.createElement('div');
  label.className = 'rp-label';
  const src = truncate(sourceName || '源', 8);
  const tgt = truncate(targetName || '目标', 8);
  label.textContent = `${src} ↔ ${tgt}`;
  root.appendChild(label);

  const hint = document.createElement('div');
  hint.className = 'rp-hint';
  hint.textContent = '选择关系类型';
  root.appendChild(hint);

  const list = document.createElement('div');
  list.className = 'rp-list';
  for (const type of TYPES_ORDER) {
    const style = EDGE_STYLES[type];
    const btn = document.createElement('button');
    btn.className = 'rp-btn';
    btn.dataset.type = type;
    btn.title = style.label;

    const swatch = document.createElement('span');
    swatch.className = 'rp-swatch';
    swatch.style.background = style.color;
    swatch.textContent = style.symbol;

    const txt = document.createElement('span');
    txt.className = 'rp-text';
    txt.textContent = style.label;

    btn.appendChild(swatch);
    btn.appendChild(txt);
    btn.addEventListener('click', () => commit(type));
    btn.addEventListener('mouseenter', () => { btn.dataset.hover = '1'; });
    btn.addEventListener('mouseleave', () => { delete btn.dataset.hover; });
    list.appendChild(btn);
  }
  root.appendChild(list);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'rp-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', hideRelationPicker);
  root.appendChild(cancelBtn);

  const baseLeft = Math.round(anchorScreenPos.x);
  const baseTop = Math.round(anchorScreenPos.y - 200);
  const maxLeft = Math.max(8, window.innerWidth - 240);
  const maxTop = Math.max(8, window.innerHeight - 320);
  const left = Math.min(Math.max(8, baseLeft - 110), maxLeft);
  const top = Math.min(Math.max(8, baseTop), maxTop);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '120',
    left: left + 'px',
    top: top + 'px',
    width: '220px',
    background: 'rgba(14, 18, 36, 0.94)',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    borderRadius: '14px',
    border: '1px solid rgba(122, 140, 200, 0.3)',
    padding: '14px 14px 10px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    letterSpacing: '1px',
    boxShadow: '0 10px 36px rgba(0,0,0,0.55), 0 0 60px rgba(127,224,201,0.12)',
    opacity: '0',
    transform: 'translateY(8px) scale(0.96)',
    transition: 'opacity 0.22s, transform 0.22s'
  });

  document.body.appendChild(root);
  pickerEl = root;
  requestAnimationFrame(() => {
    if (pickerEl === root) {
      root.style.opacity = '1';
      root.style.transform = 'translateY(0) scale(1)';
    }
  });

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideRelationPicker();
    } else if (e.key >= '1' && e.key <= '5') {
      const idx = parseInt(e.key, 10) - 1;
      if (idx >= 0 && idx < TYPES_ORDER.length) {
        commit(TYPES_ORDER[idx]);
      }
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });
  return root;
}

function commit(type) {
  const cb = onSelectRef;
  hideRelationPicker();
  if (cb) cb(type);
}

export function hideRelationPicker() {
  if (pickerEl) {
    const el = pickerEl;
    el.style.opacity = '0';
    el.style.transform = 'translateY(8px) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 240);
    pickerEl = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc, { capture: true });
    cleanupEsc = null;
  }
  onSelectRef = null;
  if (onCancelRef) {
    const cancel = onCancelRef;
    onCancelRef = null;
    cancel();
  }
}

export function isPickerOpen() {
  return !!pickerEl;
}

function truncate(s, n) {
  if (!s) return '';
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}
