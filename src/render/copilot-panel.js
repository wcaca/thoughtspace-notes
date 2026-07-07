/**
 * [INPUT]: copilot / thoughtById / edgeStore / bridge
 * [OUTPUT]: showCopilotPanel(copilot, ctx) → DOM; hideCopilotPanel(); isCopilotPanelOpen()
 * [POS]: src/render/copilot-panel.js — 灵感助手面板;展示 AI 发现的关系建议、标签建议、今日觉察
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

let activePanel = null;
let cleanupEsc = null;

export function showCopilotPanel(copilot, ctx) {
  if (activePanel) hideCopilotPanel();

  const root = document.createElement('div');
  root.id = 'copilot-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '灵感助手');

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '115',
    right: '24px',
    top: '50%',
    transform: 'translateY(-50%) translateX(8px) scale(0.96)',
    width: '320px',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.92) 0%, rgba(14, 18, 36, 0.94) 100%)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px',
    border: '1px solid rgba(127, 224, 201, 0.22)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '13px',
    boxShadow: '0 18px 50px rgba(0,0,0,0.6), 0 0 80px rgba(127,224,201,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0',
    transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
    pointerEvents: 'auto',
    overflow: 'hidden'
  });

  // 头部
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 18px 12px',
    borderBottom: '1px solid rgba(127, 224, 201, 0.12)',
    background: 'linear-gradient(180deg, rgba(127,224,201,0.06), transparent)'
  });

  const icon = document.createElement('div');
  Object.assign(icon.style, {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(127,224,201,0.3), rgba(155,140,242,0.2))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', flexShrink: 0,
    boxShadow: '0 0 16px rgba(127,224,201,0.3)',
    animation: 'copilot-pulse 3s ease-in-out infinite'
  });
  icon.textContent = '✦';

  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  const title = document.createElement('div');
  Object.assign(title.style, {
    fontSize: '14px',
    fontWeight: '500',
    letterSpacing: '2px',
    background: 'linear-gradient(120deg, #fff8dc, var(--crystal, #7fe0c9))',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  });
  title.textContent = '灵感助手';
  const subtitle = document.createElement('div');
  Object.assign(subtitle.style, {
    fontSize: '10px',
    color: '#8b90ad',
    letterSpacing: '1.5px',
    marginTop: '2px'
  });
  subtitle.textContent = '本机启发 · 离线可用';
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const close = document.createElement('button');
  Object.assign(close.style, {
    background: 'transparent',
    border: '1px solid transparent',
    color: '#8b90ad',
    fontSize: '20px',
    cursor: 'pointer',
    padding: '0',
    width: '28px', height: '28px',
    borderRadius: '50%',
    lineHeight: 1,
    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
  });
  close.textContent = '×';
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

  header.appendChild(icon);
  header.appendChild(titleWrap);
  header.appendChild(close);
  root.appendChild(header);

  // 动画样式
  if (!document.getElementById('copilot-style')) {
    const s = document.createElement('style');
    s.id = 'copilot-style';
    s.textContent = `
      @keyframes copilot-pulse { 0%, 100% { box-shadow: 0 0 16px rgba(127,224,201,0.3); transform: scale(1); } 50% { box-shadow: 0 0 24px rgba(127,224,201,0.6); transform: scale(1.05); } }
      #copilot-panel .cp-section-title { font-size: 10px; color: #8b90ad; letter-spacing: 2.5px; margin: 14px 18px 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(122,140,200,0.18); text-transform: uppercase; font-weight: 500; }
      #copilot-panel .cp-card { margin: 0 18px 10px; padding: 12px; background: rgba(20,26,51,0.5); border: 1px solid rgba(127,224,201,0.15); border-radius: 12px; transition: all 0.2s ease; }
      #copilot-panel .cp-card:hover { background: rgba(127,224,201,0.08); border-color: rgba(127,224,201,0.4); transform: translateY(-1px); }
      #copilot-panel .cp-card.cp-preview { background: rgba(232,168,101,0.12); border-color: rgba(232,168,101,0.5); box-shadow: 0 0 0 2px rgba(232,168,101,0.25), 0 8px 24px rgba(232,168,101,0.2); transform: translateY(-1px); }
      #copilot-panel .cp-card.cp-preview .cp-thought { background: rgba(232,168,101,0.1); border: 1px dashed rgba(232,168,101,0.4); }
      #copilot-panel .cp-pair { display: flex; align-items: center; gap: 8px; font-size: 12px; }
      #copilot-panel .cp-pair .cp-thought { flex: 1; padding: 6px 10px; background: rgba(127,224,201,0.08); border-radius: 8px; font-size: 11px; line-height: 1.4; word-break: break-word; }
      #copilot-panel .cp-pair .cp-arrow { color: #7fe0c9; font-size: 14px; }
      #copilot-panel .cp-action { margin-top: 8px; display: flex; gap: 6px; }
      #copilot-panel .cp-btn { padding: 5px 10px; background: rgba(127,224,201,0.18); border: 1px solid rgba(127,224,201,0.4); border-radius: 6px; color: #e9e7f4; font-family: inherit; font-size: 11px; cursor: pointer; transition: all 0.15s; }
      #copilot-panel .cp-btn:hover { background: rgba(127,224,201,0.35); transform: translateY(-1px); }
      #copilot-panel .cp-btn.danger { background: rgba(232,122,168,0.12); border-color: rgba(232,122,168,0.35); color: #fbe1ec; }
      #copilot-panel .cp-empty { padding: 20px 18px; text-align: center; color: #8b90ad; font-size: 12px; font-style: italic; }
      #copilot-panel .cp-similarity { display: inline-block; padding: 2px 8px; background: rgba(127,224,201,0.18); border-radius: 8px; font-size: 10px; color: #7fe0c9; margin-top: 6px; }
      #copilot-panel .cp-highlight { font-size: 13px; line-height: 1.6; color: #fff8dc; padding: 14px 18px; margin: 0 18px 10px; background: linear-gradient(135deg, rgba(232,168,101,0.15), rgba(232,168,101,0.04)); border: 1px solid rgba(232,168,101,0.25); border-radius: 12px; font-style: italic; }
      #copilot-panel .cp-highlight::before { content: '"'; color: #e8a865; font-size: 28px; vertical-align: -8px; margin-right: 4px; }
      #copilot-panel .cp-highlight::after { content: '"'; color: #e8a865; font-size: 28px; vertical-align: -8px; margin-left: 2px; }
      #copilot-panel .cp-summary { font-size: 11px; color: #8b90ad; padding: 0 18px 8px; letter-spacing: 1px; }
      #copilot-panel .cp-tag-pill { display: inline-block; padding: 3px 10px; background: rgba(127,224,201,0.12); border: 1px solid rgba(127,224,201,0.35); border-radius: 12px; font-size: 11px; margin: 3px 4px 3px 0; cursor: pointer; transition: all 0.15s; }
      #copilot-panel .cp-tag-pill:hover { background: rgba(127,224,201,0.3); transform: translateY(-1px); }
    `;
    document.head.appendChild(s);
  }

  // 内容滚动区
  const content = document.createElement('div');
  Object.assign(content.style, {
    flex: '1',
    overflowY: 'auto',
    padding: '8px 0 18px',
    overscrollBehavior: 'contain'
  });
  root.appendChild(content);

  const refresh = () => renderContent(content, copilot, ctx, root);

  refresh();

  close.addEventListener('click', hideCopilotPanel);
  cleanupEsc = (e) => { if (e.key === 'Escape') hideCopilotPanel(); };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(root);
  activePanel = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translateY(-50%) translateX(0) scale(1)';
  });
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('copilot', root, () => hideCopilotPanel());
  }).catch(() => { /* ignore */ });

  return { root, refresh };
}

function renderContent(content, copilot, ctx, root) {
  content.innerHTML = '';

  // === 今日觉察 ===
  const insight = copilot.dailyInsight();
  const sec1 = sectionTitle('今日觉察');
  content.appendChild(sec1);
  if (insight && insight.summary) {
    const sum = document.createElement('div');
    sum.className = 'cp-summary';
    sum.textContent = insight.summary;
    content.appendChild(sum);
  }
  if (insight && insight.highlight) {
    const h = document.createElement('div');
    h.className = 'cp-highlight';
    h.textContent = insight.highlight;
    content.appendChild(h);
  } else {
    const empty = document.createElement('div');
    empty.className = 'cp-empty';
    empty.textContent = '今日暂无觉察 · 持续投念头';
    content.appendChild(empty);
  }

  // === 关联建议 ===
  const clusters = copilot.suggestClusters(4);
  const sec2 = sectionTitle('未连却相近');
  content.appendChild(sec2);
  if (clusters.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'cp-empty';
    empty.textContent = '没有发现相近的孤立念头';
    content.appendChild(empty);
  } else {
    for (const c of clusters) {
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
      // M1-5 (2026-07-07): L1-5 半透明预览门禁修复
      // 原先点击"建关系"直接调用 ctx.onCreateEdge 违反 L1-5 (AI 自动化建议直接修改用户数据)
      // 现在改为两步式: 预览 → 确认 → 创建
      const enterPreview = () => {
        card.classList.add('cp-preview');
        actions.innerHTML = '';
        const confirmBtn = button('✓ 确认创建', () => {
          if (ctx.onCreateEdge) ctx.onCreateEdge(c.a, c.b);
          // 重新渲染
          const newContent = root.querySelector('div:nth-child(3)');
          if (newContent) renderContent(newContent, copilot, ctx, root);
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
      content.appendChild(card);
    }
  }

  // === 序列建议 ===
  const edges = copilot.suggestEdges(2);
  if (edges.length > 0) {
    const sec3 = sectionTitle('前后呼应');
    content.appendChild(sec3);
    for (const e of edges) {
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
      // M1-5 (2026-07-07): L1-5 半透明预览门禁修复 (同 "建关系" 按钮)
      // 原先点击"串联"直接调用 ctx.onCreateSequence 违反 L1-5
      // 现在改为两步式: 预览 → 确认 → 创建
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
      content.appendChild(card);
    }
  }
}

function sectionTitle(text) {
  const el = document.createElement('div');
  el.className = 'cp-section-title';
  el.textContent = text;
  return el;
}

function button(text, onClick, kind) {
  const b = document.createElement('button');
  b.className = 'cp-btn' + (kind === 'danger' ? ' danger' : '');
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}

export function hideCopilotPanel() {
  if (activePanel) {
    const el = activePanel;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-50%) translateX(8px) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 260);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('copilot'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isCopilotPanelOpen() {
  return !!activePanel;
}