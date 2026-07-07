/**
 * [INPUT]: container (DOM), list (Thought[]), callbacks (含 fireReorder 注入), root, mode, sp1
 * [OUTPUT]: renderCards(container, list, callbacks), renderKanban(container, list, callbacks), renderTimeline(container, list, callbacks), setupDragReorder(container, orderedIds, callbacks), refreshContent(root, mode, list, callbacks, sp1)
 * [POS]: src/render/observe-render.js — 观察模式 DOM 渲染(卡片/看板/时间线 + 拖动重排 + 内容刷新);fireReorder 通过 callbacks 注入以避免与 observe-views.js 循环依赖
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { sortByOrder, makeCard, renderBlockMode, renderBackgroundMode } from './observe-state.js';

// 卡片视图:按 order 排序后平铺为网格,并接通拖动重排
export function renderCards(container, list, callbacks) {
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

// 拖动重排:监听 dragover/drop,重排 DOM 后通过 callbacks.fireReorder 持久化
// ⚠️ fireReorder 由 observe-views.js 注入到 callbacks.fireReorder(绑定当前 callbacks.onReorder)
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
    callbacks.fireReorder(newOrder);
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

// 看板视图:按温度分四列(活跃燃烧/温暖流动/缓慢冷却/沉积态),支持跨列拖动
export function renderKanban(container, list, callbacks) {
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
      callbacks.fireReorder(newOrder, { fromKanban: true, colKey: col.key, thoughtId: droppedId });
    });
    wrap.appendChild(colEl);
  }
  container.appendChild(wrap);
}

// 时间线视图:按 order 升序,日期分组,左侧时间轴 + 节点
export function renderTimeline(container, list, callbacks) {
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
    callbacks.fireReorder(newOrder);
  });
}

// SP-1: 刷新内容(根据 canvas-mode 分支选择渲染器)
export function refreshContent(root, mode, list, callbacks, sp1) {
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
