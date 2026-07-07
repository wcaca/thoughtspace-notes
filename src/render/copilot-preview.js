/**
 * [INPUT]: cluster/edge 建议数据 + ctx 回调 + refresh()
 * [OUTPUT]: createClusterCard(c, ctx, refresh) → DOM; createEdgeCard(e, ctx) → DOM
 * [POS]: src/render/copilot-preview.js — 灵感助手预览卡片渲染(关联建议卡片 + 序列建议卡片 + .cp-preview 两步确认逻辑)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

/**
 * 创建"未连却相近"关联建议卡片,含两步预览确认。
 * M1-5 (2026-07-07): L1-5 半透明预览门禁修复
 * 原先点击"建关系"直接调用 ctx.onCreateEdge 违反 L1-5 (AI 自动化建议直接修改用户数据)
 * 现在改为两步式: 预览 → 确认 → 创建
 */
export function createClusterCard(c, ctx, refresh) {
  const card = document.createElement('div');
  card.className = 'cp-card';

  const pair = document.createElement('div');
  pair.className = 'cp-pair';
  const a = document.createElement('div');
  a.className = 'cp-thought';
  a.textContent = c.a.text || '—';
  const arrow = document.createElement('div');
  arrow.className = 'cp-arrow';
  arrow.textContent = '↔';
  const b = document.createElement('div');
  b.className = 'cp-thought';
  b.textContent = c.b.text || '—';
  pair.appendChild(a);
  pair.appendChild(arrow);
  pair.appendChild(b);
  card.appendChild(pair);

  const sim = document.createElement('span');
  sim.className = 'cp-similarity';
  sim.textContent = `相近度 ${(c.similarity * 100).toFixed(0)}%`;
  card.appendChild(sim);

  const actions = document.createElement('div');
  actions.className = 'cp-action';

  const enterPreview = () => {
    card.classList.add('cp-preview');
    actions.innerHTML = '';
    const confirmBtn = button('✓ 确认创建', () => {
      if (ctx.onCreateEdge) ctx.onCreateEdge(c.a, c.b);
      if (refresh) refresh();
    });
    const cancelBtn = button('✗ 取消', () => {
      card.classList.remove('cp-preview');
      actions.innerHTML = '';
      actions.appendChild(linkBtn);
      actions.appendChild(dismissBtn);
    }, 'danger');
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
  };
  const linkBtn = button('预览', enterPreview);
  const dismissBtn = button('忽略', () => card.remove(), 'danger');
  actions.appendChild(linkBtn);
  actions.appendChild(dismissBtn);
  card.appendChild(actions);

  return card;
}

/**
 * 创建"前后呼应"序列建议卡片,含两步预览确认。
 * M1-5 (2026-07-07): L1-5 半透明预览门禁修复 (同 "建关系" 按钮)
 * 原先点击"串联"直接调用 ctx.onCreateSequence 违反 L1-5
 * 现在改为两步式: 预览 → 确认 → 创建
 */
export function createEdgeCard(e, ctx) {
  const card = document.createElement('div');
  card.className = 'cp-card';

  const pair = document.createElement('div');
  pair.className = 'cp-pair';
  const a = document.createElement('div');
  a.className = 'cp-thought';
  a.textContent = e.from.text || '—';
  const arrow = document.createElement('div');
  arrow.className = 'cp-arrow';
  arrow.textContent = '→';
  const b = document.createElement('div');
  b.className = 'cp-thought';
  b.textContent = e.to.text || '—';
  pair.appendChild(a);
  pair.appendChild(arrow);
  pair.appendChild(b);
  card.appendChild(pair);

  const sim = document.createElement('span');
  sim.className = 'cp-similarity';
  const mins = Math.round(e.dt / 60000);
  sim.textContent = `相隔 ${mins} 分钟 · 相近度 ${(e.similarity * 100).toFixed(0)}%`;
  card.appendChild(sim);

  const actions = document.createElement('div');
  actions.className = 'cp-action';

  const enterPreview = () => {
    card.classList.add('cp-preview');
    actions.innerHTML = '';
    const confirmBtn = button('✓ 确认串联', () => {
      if (ctx.onCreateSequence) ctx.onCreateSequence(e.from, e.to);
      card.remove();
    });
    const cancelBtn = button('✗ 取消', () => {
      card.classList.remove('cp-preview');
      actions.innerHTML = '';
      actions.appendChild(linkBtn);
    }, 'danger');
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
  };
  const linkBtn = button('预览', enterPreview);
  actions.appendChild(linkBtn);
  card.appendChild(actions);

  return card;
}

function button(text, onClick, kind) {
  const b = document.createElement('button');
  b.className = 'cp-btn' + (kind === 'danger' ? ' danger' : '');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
