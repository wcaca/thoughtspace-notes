/**
 * [INPUT]: time / thoughtById / stats
 * [OUTPUT]: createAwarenessHUD(thoughtStore) → { mount(container), update(now, stats), dispose }
 * [POS]: src/render/awareness-hud.js — 终极觉察 HUD(时间节律 + 心境趋势 + 能量场指示器)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计哲学:
 *  - 不打扰原则:HUD 始终存在但不显眼,只在数据变化时微动
 *  - 节律感知:晨/午/暮/夜四时段不同调性(色温 / 呼吸节奏)
 *  - 心境趋势:基于 7 日念头温度均值,折线图迷你显示
 *  - 能量场:念头数 / 关系密度 / 归档比例 三维指示
 */

const TIME_PHASES = [
  { id: 'dawn',    start: 5,  end: 9,  label: '晨',  primary: '#fff8dc', accent: '#e8a865', breath: 5.0, intensity: 0.6 },
  { id: 'noon',    start: 9,  end: 14, label: '午',  primary: '#7fe0c9', accent: '#fff8dc', breath: 3.5, intensity: 1.0 },
  { id: 'sunset',  start: 14, end: 18, label: '暮',  primary: '#e87aa8', accent: '#e8a865', breath: 4.5, intensity: 0.85 },
  { id: 'night',   start: 18, end: 23, label: '夜',  primary: '#9b8cf2', accent: '#7fe0c9', breath: 6.5, intensity: 0.55 },
  { id: 'deep',    start: 23, end: 5,  label: '深',  primary: '#7fe0c9', accent: '#9b8cf2', breath: 8.0, intensity: 0.35 }
];

export function getTimePhase(now = new Date()) {
  const h = now.getHours();
  for (const p of TIME_PHASES) {
    if (p.start < p.end) {
      if (h >= p.start && h < p.end) return p;
    } else {
      // 跨午夜(如 deep 23-5)
      if (h >= p.start || h < p.end) return p;
    }
  }
  return TIME_PHASES[0];
}

export function createAwarenessHUD({ thoughtById, edgeStore } = {}) {
  let root = null;
  let canvas = null;
  let ctx = null;
  let tempHistory = []; // 最近 7 天的平均温度
  let lastMountAt = 0;
  let lastPhaseId = null;

  let expanded = true; // 默认展开,首次访问有完整体验

  function mount(container = document.body) {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'awareness-hud awareness-hud-expanded';
    Object.assign(root.style, {
      position: 'fixed',
      right: '24px',
      top: '158px',
      zIndex: '40',
      padding: '14px 16px 12px',
      background: 'rgba(20, 26, 51, 0.55)',
      backdropFilter: 'blur(18px) saturate(180%)',
      WebkitBackdropFilter: 'blur(18px) saturate(180%)',
      border: '1px solid rgba(127, 224, 201, 0.12)',
      borderRadius: '16px',
      color: '#e9e7f4',
      fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
      width: '200px',
      pointerEvents: 'none',
      transition: 'all 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
      opacity: '0',
      transform: 'translateX(8px)'
    });

    // 顶部:节律指示
    const rhythmRow = document.createElement('div');
    rhythmRow.className = 'aw-rhythm';
    Object.assign(rhythmRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '11px',
      letterSpacing: '3px',
      marginBottom: '10px',
      fontWeight: '500'
    });
    const dot = document.createElement('span');
    dot.className = 'aw-dot';
    Object.assign(dot.style, {
      width: '8px',
      height: '8px',
      borderRadius: '50%',
      background: '#7fe0c9',
      boxShadow: '0 0 12px currentColor',
      animation: 'aw-breath 4s ease-in-out infinite'
    });
    const label = document.createElement('span');
    label.className = 'aw-label';
    label.textContent = '午后 · 显意识';
    // 区数指示(常态隐藏,stats.zones > 0 时显示)
    const zoneBadge = document.createElement('span');
    Object.assign(zoneBadge.style, {
      marginLeft: 'auto',
      padding: '2px 8px',
      background: 'rgba(127,224,201,0.12)',
      border: '1px solid rgba(127,224,201,0.35)',
      borderRadius: '8px',
      fontSize: '10px',
      color: '#7fe0c9',
      letterSpacing: '1px',
      fontWeight: '600',
      display: 'none'
    });
    zoneBadge.className = 'aw-zone-badge';
    rhythmRow.appendChild(dot);
    rhythmRow.appendChild(label);
    rhythmRow.appendChild(zoneBadge);
    root.appendChild(rhythmRow);

    // 中部:心境折线
    const tempLabel = document.createElement('div');
    Object.assign(tempLabel.style, {
      fontSize: '10px',
      color: '#8b90ad',
      letterSpacing: '2px',
      marginBottom: '4px',
      textTransform: 'uppercase'
    });
    tempLabel.textContent = '7 日心境';
    root.appendChild(tempLabel);

    canvas = document.createElement('canvas');
    canvas.className = 'aw-temp-canvas';
    canvas.width = 168;
    canvas.height = 36;
    Object.assign(canvas.style, {
      display: 'block',
      width: '100%',
      height: '36px',
      marginBottom: '10px'
    });
    root.appendChild(canvas);
    ctx = canvas.getContext('2d');

    // 底部:能量场
    const fieldLabel = document.createElement('div');
    Object.assign(fieldLabel.style, {
      fontSize: '10px',
      color: '#8b90ad',
      letterSpacing: '2px',
      marginBottom: '6px',
      textTransform: 'uppercase'
    });
    fieldLabel.textContent = '能量场';
    root.appendChild(fieldLabel);

    const fieldRow = document.createElement('div');
    fieldRow.className = 'aw-field';
    Object.assign(fieldRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      fontSize: '11px',
      color: '#e9e7f4',
      letterSpacing: '0.5px'
    });
    const fieldDot = document.createElement('span');
    Object.assign(fieldDot.style, {
      width: '10px',
      height: '10px',
      borderRadius: '50%',
      background: 'linear-gradient(135deg, #7fe0c9, #9b8cf2)',
      boxShadow: '0 0 12px rgba(127,224,201,0.4)'
    });
    const fieldText = document.createElement('span');
    fieldText.textContent = '— · —';
    fieldRow.appendChild(fieldDot);
    fieldRow.appendChild(fieldText);
    root.appendChild(fieldRow);

    // 注入动画关键帧(全局只注入一次)
    if (!document.getElementById('aw-style')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'aw-style';
      styleEl.textContent = `
        @keyframes aw-breath { 0%, 100% { transform: scale(1); opacity: 0.7; } 50% { transform: scale(1.4); opacity: 1; } }
        @keyframes aw-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.15); } }
        .awareness-hud { transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1), padding 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease, transform 0.8s cubic-bezier(0.16, 1, 0.3, 1); cursor: pointer; }
        .awareness-hud.show { opacity: 1 !important; transform: translateX(0) !important; }
        .awareness-hud .aw-dot { transition: background 1.2s ease, box-shadow 1.2s ease, color 1.2s ease; }
        .awareness-hud .aw-field span:last-child { transition: color 0.4s ease; }
        /* 折叠态:只显示节律 + 节律标签(最简化版) */
        .awareness-hud.awareness-hud-collapsed { width: 130px; padding: 8px 12px; }
        .awareness-hud.awareness-hud-collapsed .aw-temp-canvas,
        .awareness-hud.awareness-hud-collapsed .aw-field,
        .awareness-hud.awareness-hud-collapsed .aw-section-hidden { display: none !important; }
        /* 展开态 */
        .awareness-hud.awareness-hud-expanded { width: 220px; padding: 14px 16px 12px; }
        /* hover 提示 */
        .awareness-hud:hover { box-shadow: 0 12px 36px rgba(0,0,0,0.5), 0 0 30px rgba(127,224,201,0.15); border-color: rgba(127,224,201,0.3); }
        .awareness-hud .aw-zone-badge { transition: all 0.4s ease; animation: aw-zone-glow 3s ease-in-out infinite; }
        @keyframes aw-zone-glow {
          0%, 100% { box-shadow: 0 0 4px currentColor; }
          50% { box-shadow: 0 0 10px currentColor; }
        }
      `;
      document.head.appendChild(styleEl);
    }

    container.appendChild(root);
    requestAnimationFrame(() => root.classList.add('show'));

    // 点击展开/折叠
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      expanded = !expanded;
      root.classList.toggle('awareness-hud-expanded', expanded);
      root.classList.toggle('awareness-hud-collapsed', !expanded);
      root.title = expanded ? '点击收起' : '点击展开';
    });
    root.title = '点击收起';

    return root;
  }

  function drawTempChart(stats) {
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // 网格
    ctx.strokeStyle = 'rgba(122, 140, 200, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    // 数据
    if (!stats || stats.history.length === 0) {
      ctx.fillStyle = 'rgba(139, 144, 173, 0.6)';
      ctx.font = '10px "PingFang SC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('— 暂无数据 —', w / 2, h / 2 + 3);
      return;
    }
    const data = stats.history;
    const max = Math.max(1, ...data);
    const min = Math.min(0, ...data);
    const range = Math.max(0.3, max - min);
    const step = w / Math.max(1, data.length - 1);
    // 渐变填充
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(127, 224, 201, 0.3)');
    grad.addColorStop(1, 'rgba(127, 224, 201, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, h);
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      ctx.lineTo(x, y);
    });
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    // 折线
    ctx.strokeStyle = '#7fe0c9';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = i * step;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    // 末点发光
    const last = data.length - 1;
    const lastX = last * step;
    const lastY = h - ((data[last] - min) / range) * (h - 4) - 2;
    ctx.fillStyle = '#7fe0c9';
    ctx.shadowColor = '#7fe0c9';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function fieldDescription(stats) {
    if (!stats || stats.thoughts === 0) return '空 · 等待第一颗种子';
    const ratio = stats.edges / Math.max(1, stats.thoughts);
    const zCount = stats.zones || 0;
    const base = ratio > 1.5 ? `稠密 ${ratio.toFixed(1)}`
      : ratio > 0.8 ? `交织 ${ratio.toFixed(1)}`
      : ratio > 0.3 ? `松动 ${ratio.toFixed(1)}`
      : `稀疏 ${ratio.toFixed(1)}`;
    return zCount > 0 ? `${base} · ${zCount} 区` : base;
  }

  function update(now = Date.now(), stats) {
    if (!root) return;
    const phase = getTimePhase(new Date(now));
    if (phase.id !== lastPhaseId) {
      lastPhaseId = phase.id;
      const dot = root.querySelector('.aw-dot');
      const label = root.querySelector('.aw-label');
      if (dot) {
        dot.style.color = phase.accent;
        dot.style.background = phase.accent;
        dot.style.animationDuration = phase.breath + 's';
      }
      if (label) label.textContent = phase.label + '时 · 节律感知';
      root.style.borderColor = phase.primary + '33';
    }
    // 区数指示(无可隐藏)
    if (stats) {
      const zb = root.querySelector('.aw-zone-badge');
      if (zb) {
        if (stats.zones && stats.zones > 0) {
          zb.style.display = 'inline-block';
          zb.textContent = `${stats.zones} 区`;
          // 区数随时间影响主色
          zb.style.borderColor = phase.accent + '66';
          zb.style.background = phase.accent + '15';
          zb.style.color = phase.accent;
        } else {
          zb.style.display = 'none';
        }
      }
    }
    // 折线图
    if (stats && stats.history) drawTempChart(stats);
    // 能量场
    const fieldRow = root.querySelector('.aw-field');
    if (fieldRow) {
      const txt = fieldRow.querySelector('span:last-child');
      if (txt) txt.textContent = fieldDescription(stats);
    }
  }

  function dispose() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = null;
    canvas = null;
    ctx = null;
  }

  return { mount, update, dispose, getTimePhase };
}