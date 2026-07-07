/**
 * [INPUT]: DOM
 * [OUTPUT]: openContemplate(thought, opts) → 全屏静观覆盖层; closeContemplate(); isContemplateOpen()
 * [POS]: src/render/contemplate-overlay.js — 念头计时静观(呼吸圆环 + 倒计时 + 记录感受闭环)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let activeOverlay = null;
let cleanupEsc = null;
let rafId = null;
let timerId = null;

const DEFAULT_DURATION_MIN = 3;
const BREATH_CYCLE_MS = 8000; // 4s 吸 + 4s 呼

export function openContemplate(thought, opts = {}) {
  closeContemplate();
  const duration = opts.durationMinutes || DEFAULT_DURATION_MIN;

  const root = document.createElement('div');
  root.id = 'contemplate-overlay';
  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '120',
    left: '0', top: '0',
    width: '100vw', height: '100vh',
    background: 'radial-gradient(ellipse at center, rgba(14, 18, 36, 0.85) 0%, rgba(4, 6, 14, 0.97) 100%)',
    backdropFilter: 'blur(30px)',
    WebkitBackdropFilter: 'blur(30px)',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: '0',
    transition: 'opacity 0.5s'
  });

  const thoughtText = document.createElement('div');
  thoughtText.className = 'ct-thought';
  thoughtText.textContent = thought?.text || '';
  Object.assign(thoughtText.style, {
    fontSize: '18px',
    color: '#fff8dc',
    marginBottom: '50px',
    maxWidth: '480px',
    textAlign: 'center',
    lineHeight: '1.8',
    letterSpacing: '2px'
  });
  root.appendChild(thoughtText);

  // 呼吸圆环
  const ringWrap = document.createElement('div');
  ringWrap.className = 'ct-ring-wrap';
  Object.assign(ringWrap.style, {
    position: 'relative',
    width: '180px',
    height: '180px',
    marginBottom: '40px'
  });

  const ringOuter = document.createElement('div');
  ringOuter.className = 'ct-ring-outer';
  Object.assign(ringOuter.style, {
    position: 'absolute',
    inset: '0',
    borderRadius: '50%',
    border: '1px solid rgba(127, 224, 201, 0.3)',
    transform: 'scale(1)',
    transition: 'transform 4s cubic-bezier(0.4, 0, 0.6, 1)'
  });

  const ringInner = document.createElement('div');
  ringInner.className = 'ct-ring-inner';
  Object.assign(ringInner.style, {
    position: 'absolute',
    top: '50%', left: '50%',
    width: '100px', height: '100px',
    margin: '-50px 0 0 -50px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(127, 224, 201, 0.15) 0%, transparent 70%)',
    transform: 'scale(0.7)',
    transition: 'transform 4s cubic-bezier(0.4, 0, 0.6, 1)'
  });

  const breathText = document.createElement('div');
  breathText.className = 'ct-breath-text';
  breathText.textContent = '吸';
  Object.assign(breathText.style, {
    position: 'absolute',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '14px',
    color: '#7fe0c9',
    letterSpacing: '4px',
    opacity: '0.8'
  });

  ringWrap.appendChild(ringOuter);
  ringWrap.appendChild(ringInner);
  ringWrap.appendChild(breathText);
  root.appendChild(ringWrap);

  // 倒计时
  const timerEl = document.createElement('div');
  timerEl.className = 'ct-timer';
  Object.assign(timerEl.style, {
    fontSize: '32px',
    fontWeight: '300',
    color: '#8b90ad',
    letterSpacing: '4px',
    marginBottom: '8px'
  });
  root.appendChild(timerEl);

  const hint = document.createElement('div');
  hint.className = 'ct-hint';
  hint.textContent = `静观 ${duration} 分钟 · 跟随呼吸圆环`;
  Object.assign(hint.style, {
    fontSize: '11px',
    color: '#5a6080',
    letterSpacing: '2px'
  });
  root.appendChild(hint);

  // 底部按钮
  const btnRow = document.createElement('div');
  btnRow.className = 'ct-btn-row';
  Object.assign(btnRow.style, {
    position: 'absolute',
    bottom: '40px',
    display: 'flex',
    gap: '12px'
  });

  const btnExit = document.createElement('button');
  btnExit.textContent = '提前结束';
  Object.assign(btnExit.style, {
    padding: '6px 16px',
    background: 'transparent',
    border: '1px solid rgba(122, 140, 200, 0.3)',
    borderRadius: '6px',
    color: '#5a6080',
    fontFamily: 'inherit',
    fontSize: '11px',
    cursor: 'pointer',
    letterSpacing: '2px'
  });

  btnRow.appendChild(btnExit);
  root.appendChild(btnRow);

  document.body.appendChild(root);
  requestAnimationFrame(() => { root.style.opacity = '1'; });
  activeOverlay = root;

  // 呼吸动画循环(吸→呼→吸...)
  let breathPhase = 'inhale'; // inhale | exhale
  function tickBreath() {
    if (!activeOverlay) return;
    if (breathPhase === 'inhale') {
      ringOuter.style.transform = 'scale(1.25)';
      ringInner.style.transform = 'scale(1.1)';
      breathText.textContent = '吸';
    } else {
      ringOuter.style.transform = 'scale(1)';
      ringInner.style.transform = 'scale(0.7)';
      breathText.textContent = '呼';
    }
    breathPhase = breathPhase === 'inhale' ? 'exhale' : 'inhale';
    setTimeout(tickBreath, BREATH_CYCLE_MS / 2);
  }
  // 延迟启动,让 fade-in 先完成
  setTimeout(tickBreath, 800);

  // 倒计时
  let remaining = duration * 60;
  function updateTimer() {
    const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
    const ss = String(remaining % 60).padStart(2, '0');
    timerEl.textContent = `${mm}:${ss}`;
    if (remaining <= 0) {
      finishContemplate(thought, opts);
      return;
    }
    remaining--;
    timerId = setTimeout(updateTimer, 1000);
  }
  updateTimer();

  btnExit.addEventListener('click', () => finishContemplate(thought, opts));

  cleanupEsc = (e) => {
    if (e.key === 'Escape') finishContemplate(thought, opts);
  };
  document.addEventListener('keydown', cleanupEsc);

  return root;
}

function finishContemplate(thought, opts) {
  if (!activeOverlay) return;
  if (timerId) { clearTimeout(timerId); timerId = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }

  const root = activeOverlay;
  // 显示"记录此刻感受"输入
  const finishEl = document.createElement('div');
  finishEl.className = 'ct-finish';
  Object.assign(finishEl.style, {
    position: 'absolute',
    top: '50%', left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '360px',
    textAlign: 'center',
    opacity: '0',
    transition: 'opacity 0.4s'
  });

  const title = document.createElement('div');
  title.textContent = '静观结束';
  Object.assign(title.style, {
    fontSize: '16px',
    color: '#7fe0c9',
    marginBottom: '8px',
    letterSpacing: '4px'
  });
  finishEl.appendChild(title);

  const sub = document.createElement('div');
  sub.textContent = '记录此刻的感受？(可选)';
  Object.assign(sub.style, {
    fontSize: '11px',
    color: '#5a6080',
    marginBottom: '16px',
    letterSpacing: '2px'
  });
  finishEl.appendChild(sub);

  const input = document.createElement('textarea');
  input.placeholder = '此刻我感受到…';
  Object.assign(input.style, {
    width: '100%',
    height: '80px',
    padding: '10px',
    background: 'rgba(20, 26, 51, 0.6)',
    border: '1px solid rgba(122, 140, 200, 0.25)',
    borderRadius: '8px',
    color: '#e9e7f4',
    fontFamily: 'inherit',
    fontSize: '12px',
    lineHeight: '1.6',
    resize: 'none',
    outline: 'none',
    marginBottom: '12px',
    boxSizing: 'border-box'
  });
  input.addEventListener('focus', () => { input.style.borderColor = 'rgba(127, 224, 201, 0.5)'; });
  input.addEventListener('blur', () => { input.style.borderColor = 'rgba(122, 140, 200, 0.25)'; });
  finishEl.appendChild(input);

  const btnRow = document.createElement('div');
  Object.assign(btnRow.style, { display: 'flex', gap: '8px', justifyContent: 'center' });

  const btnSave = document.createElement('button');
  btnSave.textContent = '保存感受';
  Object.assign(btnSave.style, {
    padding: '6px 16px',
    background: 'rgba(127, 224, 201, 0.15)',
    border: '1px solid rgba(127, 224, 201, 0.5)',
    borderRadius: '6px',
    color: '#7fe0c9',
    fontFamily: 'inherit',
    fontSize: '11px',
    cursor: 'pointer',
    letterSpacing: '2px'
  });
  btnSave.addEventListener('click', () => {
    const text = input.value.trim();
    if (text && opts.onRecord) opts.onRecord(text);
    closeContemplate();
  });

  const btnSkip = document.createElement('button');
  btnSkip.textContent = '跳过';
  Object.assign(btnSkip.style, {
    padding: '6px 16px',
    background: 'transparent',
    border: '1px solid rgba(122, 140, 200, 0.25)',
    borderRadius: '6px',
    color: '#5a6080',
    fontFamily: 'inherit',
    fontSize: '11px',
    cursor: 'pointer',
    letterSpacing: '2px'
  });
  btnSkip.addEventListener('click', closeContemplate);

  btnRow.appendChild(btnSave);
  btnRow.appendChild(btnSkip);
  finishEl.appendChild(btnRow);

  // 替换内容
  while (root.firstChild) root.removeChild(root.firstChild);
  root.appendChild(finishEl);
  requestAnimationFrame(() => { finishEl.style.opacity = '1'; });
}

export function closeContemplate() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (activeOverlay) {
    activeOverlay.style.opacity = '0';
    const el = activeOverlay;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
    activeOverlay = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
}

export function isContemplateOpen() {
  return !!activeOverlay;
}
