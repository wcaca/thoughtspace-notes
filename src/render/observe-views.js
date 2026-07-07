/**
 * [INPUT]: DOM, Thought[] (传入)
 * [OUTPUT]: showObserveView(mode, thoughts, callbacks) → 全屏覆盖视图,拖动排序持久化; hideObserveView(); isObserveViewOpen()
 * [POS]: src/render/observe-views.js — 观察模式视图(卡片/看板/时间线);支持手动拖动重排(回调 onReorder)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { describeShape, applyShapeToBar, applyShapeToLabel } from './shape-indicator.js';
import { isOn as _isFlagOn } from '../runtime/flags/index.js';

let activeOverlay = null;
let cleanupEsc = null;

const MODE_LABELS = {
  cards: '卡片视图',
  kanban: '看板视图',
  timeline: '时间线视图'
};

export function showObserveView(mode, thoughts, callbacks = {}) {
  const list = Array.from(thoughts || []);

  // SP-1 接通: callbacks.onReorder 未提供时,自动兜底到 window.__sp1State.recordManualOrder
  // ⚠️ 此兜底是关键 — 没有它,信念轨迹不会累积
  //   详见 [docs/notes/sp1/pitfalls.md#T1.4-recordOrder-side-effect]
  // @note(sp1, pitfall, T1.4-recordOrder-side-effect, since:2026-07-07)
  function fireReorder(newOrder, opts = {}) {
    if (callbacks.onReorder) {
      callbacks.onReorder(newOrder, opts);
      return;
    }
    if (typeof window !== 'undefined' && window.__sp1State?.recordManualOrder) {
      window.__sp1State.recordManualOrder(newOrder);
    }
  }

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
  let sp1Host = null;
  try {
    if (_isFlagOn('observe-mode-cohort-toggle') && typeof window !== 'undefined' && window.__sp1State) {
      sp1Host = window.__sp1State;
      const canvasTabsHost = buildCanvasTabs(sp1Host.getCanvasMode(), (m) => {
        sp1Host.setCanvasMode(m);
        refreshContent(root, mode, list, callbacks, sp1Host);
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
  Object.assign(shapeIndicator.style, {
    padding: '8px 28px 4px',
    fontSize: '11px',
    color: '#5a6080',
    letterSpacing: '1px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  });
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
  if (mode === 'cards') renderCards(content, list, callbacks);
  else if (mode === 'kanban') renderKanban(content, list, callbacks);
  else if (mode === 'timeline') renderTimeline(content, list, callbacks);
  root.appendChild(content);

  // SP-1: 默认 background/block 模式覆盖原 observe-mode 渲染
  // ⚠️ 易错: 必须在 root.appendChild(content) 之后,否则 content=null
  //   详见 [docs/notes/sp1/pitfalls.md#T2.1-ob-content-not-yet-attached]
  // @note(sp1, pitfall, T2.1-ob-content-not-yet-attached, since:2026-07-07)
  if (sp1Host) {
    const initialMode = sp1Host.getCanvasMode();
    if (initialMode === 'background') {
      content.innerHTML = '';
      renderBackgroundMode(content, list, sp1Host, callbacks);
    } else if (initialMode === 'block') {
      content.innerHTML = '';
      renderBlockMode(content, list, sp1Host, callbacks);
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
  // 注册到面板栈:
// panel-stack 触发 onClose 时(切换时),仅清理"闭包对应的旧 root",不动 activeOverlay 与 ESC
// (因为 activeOverlay 此时已指向新 root,ESC 由新 root 自己注册)
// ⚠️ 易错: 不能动 activeOverlay,不能调 panel-stack.close('observe')(双重关闭)
//   这是 T11 修复根因,详见 [docs/notes/sp1/pitfalls.md#T2.1-panel-stack-onclose-collision]
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

// SP-1: 构建顶部双模式 tab (background / block)
function buildCanvasTabs(currentMode, onSwitch) {
  const tabsEl = document.createElement('div');
  tabsEl.className = 'ob-canvas-tabs';
  const tabs = [
    { key: 'background', label: '背景分区' },
    { key: 'block', label: '内容块' }
  ];
  const btns = [];
  for (const t of tabs) {
    const b = document.createElement('button');
    b.className = 'ob-canvas-tab' + (t.key === currentMode ? ' is-active' : '');
    b.dataset.canvasMode = t.key;
    b.textContent = t.label;
    b.addEventListener('click', () => {
      if (t.key === currentMode) return;
      btns.forEach((bb) => bb.classList.toggle('is-active', bb.dataset.canvasMode === t.key));
      onSwitch(t.key);
    });
    btns.push(b);
    tabsEl.appendChild(b);
  }
  return { tabsEl, btns };
}

// SP-1: 召唤图标(默认显示,点击触发排序轴条展开)
function buildSortSummon(onSummon, initialVisible = false) {
  const host = document.createElement('div');
  host.className = 'ob-sort-summon-host';
  const summonBtn = document.createElement('button');
  summonBtn.className = 'ob-sort-summon';
  summonBtn.textContent = '⤓';
  summonBtn.title = '长按或点击召唤排序轴';
  summonBtn.addEventListener('click', () => onSummon());
  host.appendChild(summonBtn);
  const bar = document.createElement('div');
  bar.className = 'ob-sort-axis-bar';
  bar.style.display = initialVisible ? '' : 'none';
  host.appendChild(bar);
  return { host, summonBtn, bar };
}

// SP-1: 刷新内容(根据 canvas-mode 分支)
function refreshContent(root, mode, list, callbacks, sp1) {
  const content = root.querySelector('.ob-content');
  if (!content) return;
  content.innerHTML = '';
  const canvasMode = sp1.getCanvasMode();
  if (canvasMode === 'block') {
    renderBlockMode(content, list, sp1, callbacks);
  } else if (canvasMode === 'background') {
    renderBackgroundMode(content, list, sp1, callbacks);
  } else {
    if (mode === 'cards') renderCards(content, list, callbacks);
    else if (mode === 'kanban') renderKanban(content, list, callbacks);
    else if (mode === 'timeline') renderTimeline(content, list, callbacks);
  }
}

// SP-1: 块模式渲染(念头按 sort-history 排序平铺)
function renderBlockMode(container, list, sp1, callbacks) {
  const ordered = sp1.getCurrentOrder ? sp1.getCurrentOrder(list) : list;
  const currentAxis = sp1.getCurrentAxis ? sp1.getCurrentAxis() : 'time';
  const bar = document.createElement('div');
  bar.className = 'ob-block-mode-bar';
  bar.textContent = `按 [${currentAxis}] 排序 · 拖动可记录手动顺序`;
  container.appendChild(bar);
  const grid = document.createElement('div');
  grid.className = 'ob-block-grid';
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '12px',
    padding: '4px'
  });
  for (const t of ordered) {
    grid.appendChild(makeCard(t, callbacks));
  }
  container.appendChild(grid);
}

// SP-1: 背景模式渲染(层 × 块)
// 当前用温度分桶作为 SP-1 简化版;后续可扩展为基于 layer-store 的真分层
// 📋 决策: 为什么用温度分桶而非真分层?
// @note(sp1, decision, why-no-layer-in-background-mode-yet, since:2026-07-07)
function renderBackgroundMode(container, list, sp1, callbacks) {
  const layers = sp1.getLayers ? sp1.getLayers() : [];
  const buckets = [
    { key: 'burning', label: '活跃燃烧 (>60%)', test: (t) => (t.temperature ?? 0) > 0.6 },
    { key: 'warm', label: '温暖流动 (30-60%)', test: (t) => (t.temperature ?? 0) > 0.3 && (t.temperature ?? 0) <= 0.6 },
    { key: 'cooling', label: '缓慢冷却 (10-30%)', test: (t) => (t.temperature ?? 0) > 0.1 && (t.temperature ?? 0) <= 0.3 },
    { key: 'sediment', label: '沉积态 (<10%)', test: (t) => (t.temperature ?? 0) <= 0.1 }
  ];
  const wrap = document.createElement('div');
  wrap.className = 'ob-background-mode';
  Object.assign(wrap.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    padding: '4px'
  });
  const layerInfo = document.createElement('div');
  layerInfo.className = 'ob-bg-layer-info';
  layerInfo.textContent = `${layers.length} 个层 · SP-1 背景分区模式`;
  wrap.appendChild(layerInfo);
  const cols = document.createElement('div');
  cols.className = 'ob-bg-cols';
  Object.assign(cols.style, {
    display: 'flex',
    gap: '14px',
    alignItems: 'flex-start'
  });
  for (const b of buckets) {
    const col = document.createElement('div');
    col.className = 'ob-bg-col';
    col.dataset.bucket = b.key;
    Object.assign(col.style, {
      flex: '1', minWidth: '220px',
      background: 'rgba(20, 26, 51, 0.4)',
      borderRadius: '10px', padding: '10px', minHeight: '80px'
    });
    const head = document.createElement('div');
    head.textContent = `${b.label}`;
    Object.assign(head.style, { fontSize: '11px', color: '#8b90ad', marginBottom: '8px', letterSpacing: '1px' });
    col.appendChild(head);
    for (const t of list.filter(b.test)) {
      col.appendChild(makeCard(t, callbacks));
    }
    cols.appendChild(col);
  }
  wrap.appendChild(cols);
  container.appendChild(wrap);
}

function renderCards(container, list, callbacks) {
  const sorted = sortByOrder(list);
  const grid = document.createElement('div');
  Object.assign(grid.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '14px'
  });
  for (const t of sorted) {
    const card = makeCard(t, callbacks);
    grid.appendChild(card);
  }
  container.appendChild(grid);
  setupDragReorder(grid, sorted.map((t) => t.id), callbacks);
}

function sortByOrder(list) {
  return [...list].sort((a, b) => {
    const ao = a.order != null ? a.order : (a.createdAt || 0);
    const bo = b.order != null ? b.order : (b.createdAt || 0);
    return ao - bo;
  });
}

function makeCard(t, callbacks) {
  const card = document.createElement('div');
  card.className = 'ob-card';
  const temp = t.temperature ?? 0;
  const tempPct = Math.round(temp * 100);
  const tempColor = tempPct > 60 ? '#e8a865' : tempPct > 30 ? '#7fe0c9' : '#9b8cf2';
  card.draggable = true;
  card.dataset.thoughtId = t.id;
  card.innerHTML = `
    <div class="ob-card-title"></div>
    <div class="ob-card-body"></div>
    <div class="ob-card-meta">
      <span class="ob-temp-dot" style="background:${tempColor}"></span>
      <span>${tempPct}%</span>
      <span class="ob-card-date">${new Date(t.createdAt || Date.now()).toLocaleDateString('zh-CN')}</span>
    </div>
  `;
  card.querySelector('.ob-card-title').textContent = t.text || '未命名念头';
  card.querySelector('.ob-card-body').textContent = (t.body || '').slice(0, 140);
  Object.assign(card.style, {
    background: 'rgba(20, 26, 51, 0.5)',
    border: `1px solid ${tempColor}33`,
    borderRadius: '10px',
    padding: '12px 14px',
    cursor: 'grab',
    transition: 'border-color 0.2s, transform 0.2s, opacity 0.15s'
  });
  card.addEventListener('mouseenter', () => { if (!card.dataset.dragging) card.style.transform = 'translateY(-2px)'; });
  card.addEventListener('mouseleave', () => { if (!card.dataset.dragging) card.style.transform = 'translateY(0)'; });
  card.addEventListener('click', (e) => {
    if (card.dataset.justDragged === '1') { card.dataset.justDragged = '0'; return; }
    if (callbacks.onJump) callbacks.onJump(t.id);
  });
  card.addEventListener('dragstart', (e) => {
    card.dataset.dragging = '1';
    card.style.opacity = '0.4';
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', t.id);
  });
  card.addEventListener('dragend', () => {
    card.dataset.dragging = '';
    card.dataset.justDragged = '1';
    card.style.opacity = '';
    card.style.transform = 'translateY(0)';
    document.querySelectorAll('.ob-drop-target').forEach((el) => el.classList.remove('ob-drop-target'));
    setTimeout(() => { card.dataset.justDragged = '0'; }, 100);
  });

  const titleEl = card.querySelector('.ob-card-title');
  Object.assign(titleEl.style, { fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#fff8dc' });
  const bodyEl = card.querySelector('.ob-card-body');
  Object.assign(bodyEl.style, {
    fontSize: '11px', color: '#8b90ad', lineHeight: '1.6',
    maxHeight: '60px', overflow: 'hidden', whiteSpace: 'pre-wrap'
  });
  const metaEl = card.querySelector('.ob-card-meta');
  Object.assign(metaEl.style, {
    display: 'flex', alignItems: 'center', gap: '6px',
    marginTop: '8px', fontSize: '10px', color: '#5a6080'
  });
  Object.assign(card.querySelector('.ob-temp-dot').style, {
    width: '6px', height: '6px', borderRadius: '50%'
  });
  return card;
}

function setupDragReorder(container, orderedIds, callbacks) {
  let dragId = null;

  function findCardById(id) {
    return container.querySelector(`.ob-card[data-thought-id="${id}"]`);
  }

  function getCards() {
    return Array.from(container.querySelectorAll('.ob-card[data-thought-id]'));
  }

  function onDragOver(e) {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const targetCard = e.target.closest('.ob-card[data-thought-id]');
    if (!targetCard || targetCard.dataset.thoughtId === dragId) return;
    document.querySelectorAll('.ob-drop-target').forEach((el) => el.classList.remove('ob-drop-target'));
    targetCard.classList.add('ob-drop-target');
  }

  function onDragLeave(e) {
    const targetCard = e.target.closest('.ob-card[data-thought-id]');
    if (targetCard && !targetCard.contains(e.relatedTarget)) {
      targetCard.classList.remove('ob-drop-target');
    }
  }

  function onDrop(e) {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData('text/plain');
    if (!droppedId) return;
    const targetCard = e.target.closest('.ob-card[data-thought-id]');
    if (!targetCard || targetCard.dataset.thoughtId === droppedId) return;
    const dragged = findCardById(droppedId);
    if (!dragged) return;

    const cards = getCards();
    const targetIdx = cards.indexOf(targetCard);
    const draggedIdx = cards.indexOf(dragged);
    if (targetIdx < 0 || draggedIdx < 0) return;

    if (targetIdx > draggedIdx) {
      targetCard.parentNode.insertBefore(dragged, targetCard.nextSibling);
    } else {
      targetCard.parentNode.insertBefore(dragged, targetCard);
    }
    targetCard.classList.remove('ob-drop-target');

    const newOrder = getCards().map((c) => c.dataset.thoughtId);
    fireReorder(newOrder);
  }

  container.addEventListener('dragover', onDragOver);
  container.addEventListener('dragleave', onDragLeave);
  container.addEventListener('drop', onDrop);

  container.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.ob-card[data-thought-id]');
    if (card) dragId = card.dataset.thoughtId;
  });
  container.addEventListener('dragend', () => { dragId = null; });
}

function renderKanban(container, list, callbacks) {
  // 按温度分四列:活跃燃烧 / 温暖流动 / 缓慢冷却 / 沉积态
  const cols = [
    { key: 'burning', title: '活跃燃烧 (>60%)', items: [] },
    { key: 'warm', title: '温暖流动 (30-60%)', items: [] },
    { key: 'cooling', title: '缓慢冷却 (10-30%)', items: [] },
    { key: 'sediment', title: '沉积态 (<10%)', items: [] }
  ];
  for (const t of list) {
    const temp = t.temperature ?? 0;
    const pct = Math.round(temp * 100);
    if (pct > 60) cols[0].items.push(t);
    else if (pct > 30) cols[1].items.push(t);
    else if (pct > 10) cols[2].items.push(t);
    else cols[3].items.push(t);
  }
  for (const col of cols) col.items = sortByOrder(col.items);

  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', gap: '14px', alignItems: 'flex-start', minHeight: '60vh' });
  for (const col of cols) {
    const colEl = document.createElement('div');
    colEl.className = 'ob-kanban-col';
    colEl.dataset.colKey = col.key;
    Object.assign(colEl.style, {
      flex: '1', minWidth: '220px',
      background: 'rgba(20, 26, 51, 0.4)',
      borderRadius: '10px',
      padding: '10px',
      minHeight: '80px'
    });
    const head = document.createElement('div');
    head.textContent = `${col.title} · ${col.items.length}`;
    Object.assign(head.style, { fontSize: '11px', color: '#8b90ad', marginBottom: '8px', letterSpacing: '1px' });
    colEl.appendChild(head);
    for (const t of col.items) {
      colEl.appendChild(makeCard(t, callbacks));
    }
    colEl.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/plain')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      colEl.style.background = 'rgba(40, 60, 100, 0.5)';
    });
    colEl.addEventListener('dragleave', (e) => {
      if (!colEl.contains(e.relatedTarget)) colEl.style.background = '';
    });
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.style.background = '';
      const droppedId = e.dataTransfer.getData('text/plain');
      if (!droppedId) return;
      const target = container.querySelector(`.ob-card[data-thought-id="${droppedId}"]`);
      if (!target) return;
      if (target.parentNode === colEl) return;
      colEl.appendChild(target);
      const newOrder = Array.from(container.querySelectorAll('.ob-card[data-thought-id]')).map((c) => c.dataset.thoughtId);
      fireReorder(newOrder, { fromKanban: true, colKey: col.key, thoughtId: droppedId });
    });
    wrap.appendChild(colEl);
  }
  container.appendChild(wrap);
}

function renderTimeline(container, list, callbacks) {
  // 按 order 升序(手动重排)
  const sorted = sortByOrder(list);
  const tl = document.createElement('div');
  tl.className = 'ob-timeline';
  Object.assign(tl.style, {
    position: 'relative',
    paddingLeft: '28px',
    maxWidth: '760px',
    margin: '0 auto'
  });
  const line = document.createElement('div');
  Object.assign(line.style, {
    position: 'absolute', left: '8px', top: '0', bottom: '0',
    width: '2px', background: 'rgba(122, 140, 200, 0.2)'
  });
  tl.appendChild(line);

  let lastDate = '';
  const nodes = [];
  for (const t of sorted) {
    const date = new Date(t.createdAt || Date.now()).toLocaleDateString('zh-CN');
    if (date !== lastDate) {
      const dateEl = document.createElement('div');
      dateEl.textContent = date;
      Object.assign(dateEl.style, {
        fontSize: '11px', color: '#5a6080', margin: '12px 0 6px',
        letterSpacing: '1px'
      });
      tl.appendChild(dateEl);
      lastDate = date;
    }
    const node = document.createElement('div');
    node.className = 'ob-card';
    node.draggable = true;
    node.dataset.thoughtId = t.id;
    Object.assign(node.style, {
      position: 'relative',
      marginBottom: '10px',
      padding: '8px 12px',
      background: 'rgba(20, 26, 51, 0.5)',
      border: '1px solid rgba(122, 140, 200, 0.18)',
      borderRadius: '8px',
      cursor: 'grab'
    });
    node.addEventListener('click', (e) => {
      if (node.dataset.justDragged === '1') { node.dataset.justDragged = '0'; return; }
      if (callbacks.onJump) callbacks.onJump(t.id);
    });
    node.addEventListener('dragstart', (e) => {
      node.dataset.dragging = '1';
      node.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', t.id);
    });
    node.addEventListener('dragend', () => {
      node.dataset.dragging = '';
      node.dataset.justDragged = '1';
      node.style.opacity = '';
      setTimeout(() => { node.dataset.justDragged = '0'; }, 100);
    });
    const dot = document.createElement('div');
    const temp = t.temperature ?? 0;
    const dotColor = temp > 0.6 ? '#e8a865' : temp > 0.3 ? '#7fe0c9' : '#9b8cf2';
    Object.assign(dot.style, {
      position: 'absolute', left: '-26px', top: '12px',
      width: '10px', height: '10px', borderRadius: '50%',
      background: dotColor, border: '2px solid rgba(8, 10, 22, 0.94)'
    });
    node.appendChild(dot);
    const title = document.createElement('div');
    title.textContent = t.text || '未命名念头';
    Object.assign(title.style, { fontSize: '13px', color: '#fff8dc', marginBottom: '4px' });
    node.appendChild(title);
    if (t.body) {
      const body = document.createElement('div');
      body.textContent = t.body.slice(0, 100);
      Object.assign(body.style, { fontSize: '11px', color: '#8b90ad' });
      node.appendChild(body);
    }
    nodes.push(node);
    tl.appendChild(node);
  }
  container.appendChild(tl);

  // 时间线拖动重排
  tl.addEventListener('dragover', (e) => {
    if (!e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });
  tl.addEventListener('drop', (e) => {
    e.preventDefault();
    const droppedId = e.dataTransfer.getData('text/plain');
    if (!droppedId) return;
    const dragged = tl.querySelector(`.ob-card[data-thought-id="${droppedId}"]`);
    if (!dragged) return;
    const target = e.target.closest('.ob-card[data-thought-id]');
    if (!target || target === dragged) {
      // 没指定目标,放到末尾
      tl.appendChild(dragged);
    } else {
      const r = target.getBoundingClientRect();
      const before = e.clientY < r.top + r.height / 2;
      if (before) tl.insertBefore(dragged, target);
      else tl.insertBefore(dragged, target.nextSibling);
    }
    const newOrder = Array.from(tl.querySelectorAll('.ob-card[data-thought-id]')).map((c) => c.dataset.thoughtId);
    fireReorder(newOrder);
  });
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
