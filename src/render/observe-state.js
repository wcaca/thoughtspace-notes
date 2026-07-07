/**
 * [INPUT]: Thought[] (传入), callbacks, sp1 状态宿主
 * [OUTPUT]: MODE_LABELS, sortByOrder(list), buildCanvasTabs(currentMode, onSwitch), buildSortSummon(onSummon, initialVisible), makeCard(t, callbacks), renderBlockMode(container, list, sp1, callbacks), renderBackgroundMode(container, list, sp1, callbacks)
 * [POS]: src/render/observe-state.js — 观察模式状态管理与层模式渲染(排序轴/模式 tab/卡片构件/块模式/背景模式);被 observe-views.js 与 observe-render.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

// 观察模式标签(cards/kanban/timeline)
export const MODE_LABELS = {
  cards: '卡片视图',
  kanban: '看板视图',
  timeline: '时间线视图'
};

// 排序轴:按 order 升序(手动重排),缺省回退到 createdAt
export function sortByOrder(list) {
  return [...list].sort((a, b) => {
    const ao = a.order != null ? a.order : (a.createdAt || 0);
    const bo = b.order != null ? b.order : (b.createdAt || 0);
    return ao - bo;
  });
}

// SP-1: 构建顶部双模式 tab (background / block)
export function buildCanvasTabs(currentMode, onSwitch) {
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
export function buildSortSummon(onSummon, initialVisible = false) {
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

// 单个念头卡片 DOM 构件(被 cards/kanban/block/background 共用)
export function makeCard(t, callbacks) {
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

// SP-1: 块模式渲染(念头按 sort-history 排序平铺)
export function renderBlockMode(container, list, sp1, callbacks) {
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
export function renderBackgroundMode(container, list, sp1, callbacks) {
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
