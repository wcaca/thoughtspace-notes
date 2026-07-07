/**
 * [INPUT]: DOM, Thought[] (传入)
 * [OUTPUT]: showObserveView(mode, thoughts, callbacks) → 全屏覆盖视图,拖动排序持久化; hideObserveView(); isObserveViewOpen()
 * [POS]: src/render/observe-views.js — 观察模式入口(全屏覆盖视图 + 事件绑定 + fireReorder 持久化);状态/层模式拆到 observe-state.js,卡片/看板/时间线 DOM 渲染拆到 observe-render.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { describeShape, applyShapeToBar, applyShapeToLabel } from './shape-indicator.js';
import { isOn as _isFlagOn } from '../runtime/flags/index.js';
import { MODE_LABELS, buildCanvasTabs, renderBlockMode, renderBackgroundMode } from './observe-state.js';
import {
  renderCards,
  renderKanban,
  renderTimeline,
  refreshContent
} from './observe-render.js';

let activeOverlay = null;
let cleanupEsc = null;

// SP-1 接通: callbacks.onReorder 未提供时,自动兜底到 window.__sp1State.recordManualOrder
// ⚠️ 此兜底是关键 — 没有它,信念轨迹不会累积
//   详见 [docs/notes/sp1/pitfalls.md#T1.4-recordOrder-side-effect]
// @note(sp1, pitfall, T1.4-recordOrder-side-effect, since:2026-07-07)
function fireReorder(newOrder, callbacks, opts = {}) {
  if (callbacks.onReorder) {
    callbacks.onReorder(newOrder, opts);
    return;
  }
  if (typeof window !== 'undefined' && window.__sp1State?.recordManualOrder) {
    window.__sp1State.recordManualOrder(newOrder);
  }
}

export function showObserveView(mode, thoughts, callbacks = {}) {
  const list = Array.from(thoughts || []);
  // fireReorder 绑定当前 callbacks 后注入渲染层,避免 observe-render.js 反向依赖本模块
  const boundFireReorder = (newOrder, opts) => fireReorder(newOrder, callbacks, opts);
  const renderCallbacks = { ...callbacks, fireReorder: boundFireReorder };

  const root = document.createElement('div');
  root.id = 'observe-overlay';

  const header = document.createElement('div');
  header.className = 'ob-header';
  const title = document.createElement('div');
  title.className = 'ob-title';
  title.textContent = MODE_LABELS[mode] || '观察模式';
  const meta = document.createElement('div');
  meta.className = 'ob-meta';
  meta.textContent = `${list.length} 个念头 · 只读凝视`;
  header.appendChild(title);
  header.appendChild(meta);

  const close = document.createElement('button');
  close.className = 'ob-close';
  close.textContent = '×';
  close.title = '关闭 (Esc)';
  header.appendChild(close);

  const switcher = document.createElement('div');
  switcher.className = 'ob-switcher';
  ['cards', 'kanban', 'timeline'].forEach((m) => {
    const btn = document.createElement('button');
    btn.className = 'ob-switch-btn' + (m === mode ? ' is-active' : '');
    btn.textContent = MODE_LABELS[m];
    btn.addEventListener('click', () => {
      if (m === mode) return;
      if (callbacks.onSwitch) callbacks.onSwitch(m);
    });
    switcher.appendChild(btn);
  });
  header.appendChild(switcher);

  // SP-1: 顶部双模式 tab (背景分区 / 内容块)
  // 与 observe-mode (cards/kanban/timeline) 正交,通过 window.__sp1State 接入
  // 🔗 接触点: 此函数被 main.js 的 window.__sp1State 间接调用
  //   详见 [docs/notes/sp1/integration-points.md#observe-views]
  // @note(sp1, integration, observe-views, since:2026-07-07)
  // 📋 决策: 为什么 canvas-mode 与 observe-mode 正交?
  // @note(sp1, decision, why-canvas-mode-orthogonal-to-observe-mode, since:2026-07-07)
  // 📊 数据流: 切换 canvas-mode → setCanvasMode → refreshContent → renderBlockMode / renderBackgroundMode
  //   详见 [docs/notes/sp1/data-flow.md#runtime-canvas-mode-switch]
  // @note(sp1, data-flow, runtime-canvas-mode-switch, since:2026-07-07)
  let sp1Host = null;
  try {
    if (_isFlagOn('observe-mode-cohort-toggle') && typeof window !== 'undefined' && window.__sp1State) {
      sp1Host = window.__sp1State;
      const canvasTabsHost = buildCanvasTabs(sp1Host.getCanvasMode(), (m) => {
        sp1Host.setCanvasMode(m);
        refreshContent(root, mode, list, renderCallbacks, sp1Host);
      });
      header.appendChild(canvasTabsHost.tabsEl);
    }
  } catch (e) { sp1Host = null; }

  root.appendChild(header);

  // 形状自适应指示器(wholesomeness 反映"看全貌 vs 看个体")
  // 当 wholesomeness > 0.5 时显示比例徽章,帮助用户感知当前观察距离
  const shapeIndicator = document.createElement('div');
  shapeIndicator.className = 'ob-shape-indicator';
  shapeIndicator.setAttribute('aria-live', 'polite');
  Object.assign(shapeIndicator.style, { padding: '8px 28px 4px', fontSize: '11px', color: '#5a6080', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '8px' });
  const shapeLabel = document.createElement('span');
  shapeLabel.className = 'ob-shape-label';
  shapeIndicator.appendChild(shapeLabel);
  const shapeBar = document.createElement('div');
  Object.assign(shapeBar.style, {
    width: '120px',
    height: '4px',
    background: 'rgba(127,224,201,0.12)',
    borderRadius: '2px',
    overflow: 'hidden',
    flex: '0 0 auto'
  });
  const shapeBarFill = document.createElement('div');
  shapeBarFill.className = 'ob-shape-bar-fill';
  Object.assign(shapeBarFill.style, {
    height: '100%',
    width: '0%',
    background: 'linear-gradient(90deg, #7fe0c9, #e8a865)',
    transition: 'width 0.4s ease'
  });
  shapeBar.appendChild(shapeBarFill);
  shapeIndicator.appendChild(shapeBar);
  root.appendChild(shapeIndicator);

  const content = document.createElement('div');
  content.className = 'ob-content';
  if (mode === 'cards') renderCards(content, list, renderCallbacks);
  else if (mode === 'kanban') renderKanban(content, list, renderCallbacks);
  else if (mode === 'timeline') renderTimeline(content, list, renderCallbacks);
  root.appendChild(content);

  // SP-1: 默认 background/block 模式覆盖原 observe-mode 渲染
  // ⚠️ 易错: 必须在 root.appendChild(content) 之后,否则 content=null
  //   详见 [docs/notes/sp1/pitfalls.md#T2.1-ob-content-not-yet-attached]
  // @note(sp1, pitfall, T2.1-ob-content-not-yet-attached, since:2026-07-07)
  if (sp1Host) {
    const initialMode = sp1Host.getCanvasMode();
    if (initialMode === 'background') {
      content.innerHTML = '';
      renderBackgroundMode(content, list, sp1Host, renderCallbacks);
    } else if (initialMode === 'block') {
      content.innerHTML = '';
      renderBlockMode(content, list, sp1Host, renderCallbacks);
    }
  }

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '115',
    left: '0', top: '0',
    width: '100vw', height: '100vh',
    background: 'rgba(8, 10, 22, 0.94)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    opacity: '0',
    transition: 'opacity 0.25s'
  });

  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '22px 32px',
    borderBottom: '1px solid rgba(127, 224, 201, 0.12)',
    background: 'linear-gradient(180deg, rgba(20,26,51,0.5), transparent)'
  });
  Object.assign(title.style, {
    fontSize: '20px',
    fontWeight: '500',
    letterSpacing: '4px',
    background: 'linear-gradient(120deg, #fff8dc, var(--crystal))',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
    margin: 0
  });
  Object.assign(meta.style, { fontSize: '11px', color: '#8b90ad', flex: '1', letterSpacing: '1.5px' });

  Object.assign(switcher.style, { display: 'flex', gap: '2px', padding: '3px', background: 'rgba(20,26,51,0.6)', borderRadius: '10px', border: '1px solid rgba(122,140,200,0.15)' });
  Array.from(switcher.children).forEach((btn) => {
    Object.assign(btn.style, {
      padding: '6px 14px',
      background: 'transparent',
      border: 'none',
      borderRadius: '7px',
      color: '#8b90ad',
      fontFamily: 'inherit',
      fontSize: '11px',
      letterSpacing: '1.5px',
      cursor: 'pointer',
      transition: 'all 0.2s var(--ease-out, ease-out)'
    });
  });
  const activeBtn = switcher.querySelector('.is-active');
  if (activeBtn) {
    Object.assign(activeBtn.style, {
      background: 'linear-gradient(135deg, rgba(127,224,201,0.25), rgba(127,224,201,0.1))',
      color: '#7fe0c9',
      boxShadow: '0 0 12px rgba(127,224,201,0.3), inset 0 1px 0 rgba(255,255,255,0.08)'
    });
  }

  Object.assign(close.style, {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#8b90ad',
    fontSize: '22px',
    cursor: 'pointer',
    padding: '0',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    transition: 'all 0.2s var(--ease-out, ease-out)',
    lineHeight: 1
  });

  Object.assign(content.style, {
    flex: '1',
    overflow: 'auto',
    padding: '28px 32px'
  });

  close.addEventListener('click', hideObserveView);

  cleanupEsc = (e) => { if (e.key === 'Escape') hideObserveView(); };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(root);
  requestAnimationFrame(() => { root.style.opacity = '1'; });
  activeOverlay = root;

  // 形状指示器:从总线订阅 wholesomeness,通过 shape-indicator 模块纯函数算出 UI 描述
  function updateShapeIndicator() {
    const bridge = typeof window !== 'undefined' ? window.__viewportState : null;
    if (!bridge) return;
    const snapshot = bridge.getState();
    const desc = describeShape(snapshot);
    applyShapeToBar(shapeBarFill, desc);
    applyShapeToLabel(shapeLabel, desc);
  }
  let shapeRaf = null;
  function scheduleShapeTick() {
    if (shapeRaf != null) return;
    shapeRaf = requestAnimationFrame(() => {
      shapeRaf = null;
      if (activeOverlay === root) {
        updateShapeIndicator();
        scheduleShapeTick();
      }
    });
  }
  updateShapeIndicator();
  scheduleShapeTick();
  // 注册到面板栈:panel-stack onClose 仅清理闭包对应旧 root,不动 activeOverlay/ESC(已指向新 root)
  // ⚠️ 易错: 不能动 activeOverlay,不能调 panel-stack.close('observe')(双重关闭)— T11 修复根因
  //   详见 [docs/notes/sp1/pitfalls.md#T2.1-panel-stack-onclose-collision]
  // @note(sp1, pitfall, T2.1-panel-stack-onclose-collision, since:2026-07-07)
import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('observe', root, () => {
      if (root && root.parentNode) {
        root.style.opacity = '0';
        setTimeout(() => { if (root.parentNode) root.remove(); }, 250);
      }
    });
  }).catch(() => { /* ignore */ });
  return root;
}

export function hideObserveView() {
  hideObserveViewInternal();
}

function hideObserveViewInternal() {
  if (activeOverlay) {
    activeOverlay.style.opacity = '0';
    const el = activeOverlay;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 250);
    activeOverlay = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('observe'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isObserveViewOpen() {
  return !!activeOverlay;
}
