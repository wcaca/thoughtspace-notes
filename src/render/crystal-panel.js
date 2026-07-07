/**
 * [INPUT]: DOM
 * [OUTPUT]: showCrystalPanel(cohesion, formName, count, callbacks) → 结构强度面板; hideCrystalPanel(); isCrystalPanelOpen()
 * [POS]: src/render/crystal-panel.js — 结晶入口面板:显示选中念头的结构强度 + 结晶按钮
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let activePanel = null;
let cleanupEsc = null;

export function showCrystalPanel(info, callbacks = {}) {
  hideCrystalPanel();
  const { thoughtCount, edgeCount, cohesion, formName, canCrystal, threshold } = info;

  const root = document.createElement('div');
  root.id = 'crystal-panel';

  const header = document.createElement('div');
  header.className = 'cp-header';
  const title = document.createElement('div');
  title.className = 'cp-title';
  title.textContent = '结构强度';
  header.appendChild(title);
  const close = document.createElement('button');
  close.className = 'cp-close';
  close.textContent = '×';
  close.title = '关闭 (Esc)';
  header.appendChild(close);
  root.appendChild(header);

  const body = document.createElement('div');
  body.className = 'cp-body';

  const stats = document.createElement('div');
  stats.className = 'cp-stats';
  stats.innerHTML = `
    <div class="cp-stat"><span class="cp-stat-label">念头</span><span class="cp-stat-val">${thoughtCount}</span></div>
    <div class="cp-stat"><span class="cp-stat-label">内部边</span><span class="cp-stat-val">${edgeCount}</span></div>
  `;
  body.appendChild(stats);

  const barWrap = document.createElement('div');
  barWrap.className = 'cp-bar-wrap';
  const barLabel = document.createElement('div');
  barLabel.className = 'cp-bar-label';
  const pct = Math.round(cohesion * 100);
  barLabel.innerHTML = `内聚度 <b>${pct}%</b> · ${pct >= (threshold * 100) ? '可结晶' : '还需更多连接'}`;
  barWrap.appendChild(barLabel);
  const barBg = document.createElement('div');
  barBg.className = 'cp-bar-bg';
  const barFill = document.createElement('div');
  barFill.className = 'cp-bar-fill';
  barFill.style.width = `${pct}%`;
  barFill.style.background = pct >= (threshold * 100) ? '#7fe0c9' : '#e8a865';
  barBg.appendChild(barFill);
  barWrap.appendChild(barBg);
  body.appendChild(barWrap);

  const formEl = document.createElement('div');
  formEl.className = 'cp-form';
  formEl.innerHTML = `预计形态: <b>${formName}</b>`;
  body.appendChild(formEl);

  const btnRow = document.createElement('div');
  btnRow.className = 'cp-btn-row';
  const crystalBtn = document.createElement('button');
  crystalBtn.className = 'cp-btn cp-btn-crystal';
  crystalBtn.textContent = '✦ 结晶';
  crystalBtn.disabled = !canCrystal;
  btnRow.appendChild(crystalBtn);
  body.appendChild(btnRow);

  root.appendChild(body);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '110',
    left: '50%',
    bottom: '24px',
    transform: 'translateX(-50%)',
    width: '320px',
    background: 'rgba(14, 18, 36, 0.94)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '14px',
    border: `1px solid ${canCrystal ? 'rgba(127, 224, 201, 0.4)' : 'rgba(232, 168, 101, 0.3)'}`,
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '12px',
    boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 60px ${canCrystal ? 'rgba(127, 224, 201, 0.15)' : 'rgba(232, 168, 101, 0.15)'}`,
    opacity: '0',
    transition: 'opacity 0.25s'
  });

  Object.assign(header.style, {
    display: 'flex', alignItems: 'center',
    padding: '10px 14px 6px',
    borderBottom: '1px solid rgba(122, 140, 200, 0.15)'
  });
  Object.assign(title.style, { fontSize: '12px', letterSpacing: '2px', flex: '1', color: '#8b90ad' });
  Object.assign(close.style, {
    background: 'transparent', border: 'none', color: '#5a6080',
    fontSize: '18px', cursor: 'pointer', padding: '0 4px'
  });

  Object.assign(body.style, { padding: '12px 14px 14px' });

  Object.assign(stats.style, {
    display: 'flex', gap: '16px', marginBottom: '10px'
  });
  root.querySelectorAll('.cp-stat').forEach(el => {
    Object.assign(el.style, { display: 'flex', flexDirection: 'column', gap: '2px' });
  });
  root.querySelectorAll('.cp-stat-label').forEach(el => {
    Object.assign(el.style, { fontSize: '10px', color: '#5a6080' });
  });
  root.querySelectorAll('.cp-stat-val').forEach(el => {
    Object.assign(el.style, { fontSize: '16px', color: '#fff8dc', fontWeight: '500' });
  });

  Object.assign(barLabel.style, { fontSize: '11px', color: '#8b90ad', marginBottom: '4px' });
  Object.assign(barBg.style, {
    height: '8px', borderRadius: '4px',
    background: 'rgba(20, 26, 51, 0.8)', overflow: 'hidden'
  });
  Object.assign(barFill.style, {
    height: '100%', borderRadius: '4px',
    transition: 'width 0.4s, background 0.3s'
  });

  Object.assign(formEl.style, {
    fontSize: '11px', color: '#8b90ad', marginTop: '10px', textAlign: 'center'
  });

  Object.assign(btnRow.style, { marginTop: '12px', textAlign: 'center' });
  Object.assign(crystalBtn.style, {
    padding: '8px 24px',
    background: canCrystal ? 'rgba(127, 224, 201, 0.15)' : 'rgba(20, 26, 51, 0.5)',
    border: `1px solid ${canCrystal ? 'rgba(127, 224, 201, 0.5)' : 'rgba(122, 140, 200, 0.2)'}`,
    borderRadius: '8px',
    color: canCrystal ? '#7fe0c9' : '#5a6080',
    fontFamily: 'inherit',
    fontSize: '12px',
    cursor: canCrystal ? 'pointer' : 'not-allowed',
    letterSpacing: '2px'
  });

  close.addEventListener('click', hideCrystalPanel);
  crystalBtn.addEventListener('click', () => {
    if (!canCrystal) return;
    if (callbacks.onCrystallize) callbacks.onCrystallize();
    hideCrystalPanel();
  });

  cleanupEsc = (e) => { if (e.key === 'Escape') hideCrystalPanel(); };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(root);
  requestAnimationFrame(() => { root.style.opacity = '1'; });
  activePanel = root;
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('crystal', root, () => hideCrystalPanel());
  }).catch(() => { /* ignore */ });
  return root;
}

export function hideCrystalPanel() {
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
    try { getPanelStack().close('crystal'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isCrystalPanelOpen() {
  return !!activePanel;
}
