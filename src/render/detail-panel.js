/**
 * [INPUT]: DOM, src/core/thought(tempToHexColor, getName, decayTemperature, labelColorAt, COLOR_TAGS, extractTodos)
 * [OUTPUT]: showDetailPanel(thought, screenPos, callbacks) → 浮动毛玻璃面板; hideDetailPanel(); isPanelOpen()
 * [POS]: src/render/detail-panel.js — 念头详情浮动面板(全生命周期+多模态元数据+标签/情绪色温编辑+笔记正文markdown+todo切换)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import {
  tempToHexColor, getName, decayTemperature,
  labelColorAt, COLOR_TAGS, extractTodos
} from '../core/thought.js';
import { overscrollContain, prefersReducedMotion, announce, FOCUSABLE_SELECTOR } from './a11y.js';

let activePanel = null;
let cleanupEsc = null;

const TODO_LINE_RE = /^(\s*[-*+]?\s*)\[([ xX])\]\s+(.+)$/;

function markdownToHtml(text) {
  if (!text) return '';
  const lines = text.split('\n');
  const todoLineSet = new Set();
  // 先标记 todo 行,避免被通用 markdown 规则改写
  for (let i = 0; i < lines.length; i++) {
    if (TODO_LINE_RE.test(lines[i])) todoLineSet.add(i);
  }
  let html = '';
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (todoLineSet.has(i)) {
      const m = TODO_LINE_RE.exec(line);
      const indent = m[1].replace(/[-*+]/, '').length;
      const checked = m[2] === 'x' || m[2] === 'X';
      const inner = inlineMd(m[3]);
      html += `<div class="dp-todo-item" data-line="${i}" style="margin-left:${indent * 14}px">`
        + `<input type="checkbox" class="dp-todo-check"${checked ? ' checked' : ''} data-line="${i}">`
        + `<span class="dp-todo-text${checked ? ' is-done' : ''}">${inner}</span></div>`;
      continue;
    }
    let out = inlineMd(line);
    // 标题
    if (/^### /.test(line)) out = `<h3>${inlineMd(line.slice(4))}</h3>`;
    else if (/^## /.test(line)) out = `<h2>${inlineMd(line.slice(3))}</h2>`;
    else if (/^# /.test(line)) out = `<h1>${inlineMd(line.slice(2))}</h1>`;
    // 列表
    else if (/^\s*[-*+]\s+/.test(line)) out = `<li>${inlineMd(line.replace(/^\s*[-*+]\s+/, ''))}</li>`;
    else if (/^\s*\d+\.\s+/.test(line)) out = `<li>${inlineMd(line.replace(/^\s*\d+\.\s+/, ''))}</li>`;
    html += out + '<br>';
  }
  return html;
}

function inlineMd(s) {
  let out = escHtml(s);
  out = out.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.*?)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return out;
}

export function showDetailPanel(thought, screenPos, callbacks = {}) {
  hideDetailPanel();

  const panel = document.createElement('div');
  panel.id = 'detail-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', `念头详情: ${thought.text || '未命名'}`);
  panel.tabIndex = -1;
  const tagColor = tempToHexColor(thought.temperature ?? 0);
  const now = Date.now();
  const currentTemp = thought.temperature ?? decayTemperature(thought, now);
  const tempPercent = Math.round(currentTemp * 100);
  const barW = Math.round(tempPercent * 1.2);
  const barColor = tempPercent > 60 ? '#e8a865' : tempPercent > 30 ? '#7fe0c9' : '#9b8cf2';
  const created = new Date(thought.createdAt || now).toLocaleDateString('zh-CN');
  const lastInteraction = new Date(thought.lastInteractionAt || now).toLocaleString('zh-CN');
  const mass = (thought.mass || 1).toFixed(1);
  const contentHint = thought.contentHint || 'text';
  const hintLabel = { image: '含图片', link: '含链接', long: '长文本', text: '纯文字' }[contentHint] || '纯文字';

  const labels = Array.isArray(thought.labels) ? thought.labels : [];
  const labelHtml = labels.map((label, i) => {
    const c = labelColorAt(i);
    return `<span class="dp-chip" data-label="${escHtmlAttr(label)}" style="--chip-color:${c}">${escHtml(label)}<button class="dp-chip-x" data-remove="${escHtmlAttr(label)}" title="移除">×</button></span>`;
  }).join('');

  const colorTagKey = thought.colorTag || '';
  const colorTagRow = Object.keys(COLOR_TAGS).map((key) => {
    const hex = COLOR_TAGS[key];
    const on = colorTagKey === key;
    return `<button class="dp-color-btn${on ? ' is-on' : ''}" data-color="${escHtmlAttr(key)}" style="--ct:${hex}" title="${escHtmlAttr(key)}"></button>`;
  }).join('');

  // 关联预览:被哪些念头关联 + 关联到哪些念头(由 main.js 注入)
  const relationsHtml = callbacks.renderRelations ? callbacks.renderRelations(thought.id) : '';

  panel.innerHTML = `
    <div class="dp-header">
      <span class="dp-title" contenteditable="true">${escHtml(thought.text || '未命名念头')}</span>
      <button class="dp-close" title="关闭">×</button>
    </div>

    <div class="dp-section dp-section-labels">
      <div class="dp-section-label">标签</div>
      <div class="dp-chips-row" id="dp-chips-row">${labelHtml || '<span class="dp-empty">还没有标签</span>'}</div>
      <div class="dp-add-label-row">
        <input class="dp-label-input" id="dp-label-input" type="text" placeholder="加标签 (回车)" maxlength="12" aria-label="新标签" spellcheck="false" />
      </div>
    </div>

    <div class="dp-section dp-section-color">
      <div class="dp-section-label">情绪色温</div>
      <div class="dp-color-row">${colorTagRow}<button class="dp-color-clear${!colorTagKey ? ' is-on' : ''}" id="dp-color-clear" title="清除">×</button></div>
    </div>

    <div class="dp-section dp-section-body">
      <div class="dp-section-label">笔记正文</div>
      <div class="dp-body-toolbar">
        <button class="dp-body-btn dp-body-btn-edit" data-mode="edit" title="编辑">✎ 编辑</button>
        <button class="dp-body-btn dp-body-btn-preview" data-mode="preview" title="预览">👁 预览</button>
      </div>
      <textarea class="dp-body-textarea" id="dp-body-textarea" aria-label="笔记正文" placeholder="写点什么… 支持 markdown（**粗体** *斜体* [链接](url)）" spellcheck="false">${escHtml(thought.body || '')}</textarea>
      <div class="dp-body-preview" id="dp-body-preview" style="display:none;">${markdownToHtml(thought.body) || '<span class="dp-empty">还没有笔记内容</span>'}</div>
    </div>

    <div class="dp-temp-bar-wrap">
      <div class="dp-temp-label">温度 <b>${tempPercent}%</b> · ${tempPercent > 60 ? '活跃燃烧' : tempPercent > 30 ? '温暖流动' : tempPercent > 10 ? '缓慢冷却' : '沉积态'}</div>
      <div class="dp-temp-bar"><div class="dp-temp-fill" style="width:${barW}px;background:${barColor}"></div></div>
    </div>

    <div class="dp-actions">
      <button class="dp-btn dp-btn-warm">🔥 重新关注</button>
      <button class="dp-btn dp-btn-edit">✎ 编辑标题</button>
      <button class="dp-btn dp-btn-link" title="建一条到选中念头的边">↔ 关联到选中</button>
    </div>
    <div class="dp-actions">
      <button class="dp-btn dp-btn-contemplate">◎ 静观 3 分钟</button>
    </div>

    <div class="dp-relations" id="dp-relations" aria-label="关联预览">${relationsHtml}</div>

    <button class="dp-advanced-toggle" id="dp-advanced-toggle" type="button">
      <span>高级选项</span><span class="dp-advanced-arrow">▾</span>
    </button>

    <div class="dp-advanced">
      <div class="dp-section dp-section-labels">
        <div class="dp-section-label">标签</div>
        <div class="dp-chips-row" id="dp-chips-row">${labelHtml || '<span class="dp-empty">还没有标签</span>'}</div>
        <div class="dp-add-label-row">
          <input class="dp-label-input" id="dp-label-input" type="text" placeholder="加标签 (回车)" maxlength="12" aria-label="新标签" spellcheck="false" />
        </div>
      </div>

      <div class="dp-section dp-section-color">
        <div class="dp-section-label">情绪色温</div>
        <div class="dp-color-row">${colorTagRow}<button class="dp-color-clear${!colorTagKey ? ' is-on' : ''}" id="dp-color-clear" title="清除">×</button></div>
      </div>

      <div class="dp-meta-bar">
        <div class="dp-meta-row"><span class="dp-label">创建</span><span>${created}</span></div>
        <div class="dp-meta-row"><span class="dp-label">上次交互</span><span>${lastInteraction}</span></div>
        <div class="dp-meta-row"><span class="dp-label">质量</span><span>${mass} · ${mass > 1.3 ? '引力强' : mass > 1 ? '中性' : '轻盈'}</span></div>
        <div class="dp-meta-row"><span class="dp-label">类型</span><span class="dp-hint-tag">${hintLabel}</span></div>
      </div>

      <div class="dp-actions">
        <button class="dp-btn dp-btn-archive" data-state="${(thought.temperature != null && thought.temperature < 0.1) ? 'archived' : 'active'}">${(thought.temperature != null && thought.temperature < 0.1) ? '↻ 解档' : '↓ 归档'}</button>
      </div>
    </div>
  `;

  Object.assign(panel.style, {
    position: 'fixed',
    zIndex: '100',
    left: Math.min(screenPos.x + 16, window.innerWidth - 296) + 'px',
    top: Math.min(screenPos.y - 20, window.innerHeight - 580) + 'px',
    width: '288px',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.92) 0%, rgba(14, 18, 36, 0.94) 100%)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px',
    border: '1px solid rgba(127, 224, 201, 0.18)',
    padding: '18px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '13px',
    letterSpacing: '0.3px',
    boxShadow: `0 18px 50px rgba(0,0,0,0.6), 0 0 80px ${tagColor}22, inset 0 1px 0 rgba(255,255,255,0.06)`,
    transition: prefersReducedMotion() ? 'none' : 'opacity 0.25s var(--ease-out, ease-out), transform 0.25s var(--ease-out, ease-out)',
    opacity: '0',
    transform: 'translateY(8px) scale(0.96)',
    transformOrigin: 'top left',
    maxHeight: 'calc(100vh - 40px)',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
    WebkitOverscrollBehavior: 'contain',
    touchAction: 'manipulation'
  });
  overscrollContain(panel);

  // 注入 todo 项样式
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .dp-todo-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
    .dp-todo-check { margin: 0; cursor: pointer; accent-color: #7fe0c9; }
    .dp-todo-text { color: #e9e7f4; flex: 1; }
    .dp-todo-text.is-done { color: #5a6080; text-decoration: line-through; }
  `;
  panel.appendChild(styleEl);

  // 详情面板可拖拽 — 抓住头部区域移动
  const header = panel.querySelector('.dp-header');
  let dpDragging = false;
  let dpDragStartX = 0, dpDragStartY = 0;
  let dpLeftStart = 0, dpTopStart = 0;
  if (header) {
    header.style.cursor = 'grab';
    header.style.userSelect = 'none';
    header.addEventListener('pointerdown', (e) => {
      // 避免和标题编辑冲突
      if (e.target && e.target.classList && e.target.classList.contains('dp-title')) return;
      if (e.target && e.target.classList && e.target.classList.contains('dp-close')) return;
      dpDragging = true;
      header.style.cursor = 'grabbing';
      dpDragStartX = e.clientX;
      dpDragStartY = e.clientY;
      const left = parseInt(panel.style.left || '0', 10);
      const top = parseInt(panel.style.top || '0', 10);
      dpLeftStart = left;
      dpTopStart = top;
      e.preventDefault();
    });
    window.addEventListener('pointermove', (e) => {
      if (!dpDragging) return;
      const dx = e.clientX - dpDragStartX;
      const dy = e.clientY - dpDragStartY;
      const w = panel.offsetWidth || 280;
      const h = panel.offsetHeight || 400;
      panel.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, dpLeftStart + dx)) + 'px';
      panel.style.top = Math.max(8, Math.min(window.innerHeight - 40, dpTopStart + dy)) + 'px';
    });
    window.addEventListener('pointerup', () => {
      if (dpDragging) {
        dpDragging = false;
        header.style.cursor = 'grab';
      }
    });
  }

  const bodyTextarea = panel.querySelector('#dp-body-textarea');
  const bodyPreview = panel.querySelector('#dp-body-preview');
  const btnEdit = panel.querySelector('.dp-body-btn-edit');
  const btnPreview = panel.querySelector('.dp-body-btn-preview');

  function setMode(mode) {
    if (mode === 'edit') {
      bodyTextarea.style.display = 'block';
      bodyPreview.style.display = 'none';
      btnEdit.classList.add('is-active');
      btnPreview.classList.remove('is-active');
    } else {
      bodyTextarea.style.display = 'none';
      bodyPreview.style.display = 'block';
      bodyPreview.innerHTML = markdownToHtml(bodyTextarea.value) || '<span class="dp-empty">还没有笔记内容</span>';
      btnEdit.classList.remove('is-active');
      btnPreview.classList.add('is-active');
      bindTodoCheckboxes();
    }
  }

  btnEdit.addEventListener('click', () => setMode('edit'));
  btnPreview.addEventListener('click', () => setMode('preview'));

  // 高级选项折叠
  const advToggle = panel.querySelector('#dp-advanced-toggle');
  if (advToggle) {
    advToggle.addEventListener('click', () => {
      const isOpen = panel.dataset.advancedOpen === '1';
      if (isOpen) delete panel.dataset.advancedOpen;
      else panel.dataset.advancedOpen = '1';
    });
  }

  Object.assign(bodyTextarea.style, {
    width: '100%',
    height: '120px',
    minHeight: '80px',
    maxHeight: '200px',
    padding: '10px',
    background: 'rgba(20, 26, 51, 0.7)',
    border: '1px solid rgba(122, 140, 200, 0.22)',
    borderRadius: '8px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", monospace',
    fontSize: '12px',
    lineHeight: '1.6',
    resize: 'vertical',
    outline: 'none',
    transition: 'border-color 0.15s'
  });
  bodyTextarea.addEventListener('focus', () => { bodyTextarea.style.borderColor = 'rgba(127, 224, 201, 0.5)'; });
  bodyTextarea.addEventListener('blur', () => { bodyTextarea.style.borderColor = 'rgba(122, 140, 200, 0.22)'; });

  Object.assign(bodyPreview.style, {
    width: '100%',
    minHeight: '80px',
    padding: '10px',
    background: 'rgba(20, 26, 51, 0.5)',
    border: '1px dashed rgba(122, 140, 200, 0.2)',
    borderRadius: '8px',
    fontSize: '12px',
    lineHeight: '1.7',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word'
  });
  bodyPreview.addEventListener('click', (ev) => {
    // 点击 todo checkbox 不切回编辑模式,由专门处理函数接管
    if (ev.target.classList && ev.target.classList.contains('dp-todo-check')) return;
    if (ev.target.closest && ev.target.closest('.dp-todo-item')) return;
    setMode('edit');
  });

  function bindTodoCheckboxes() {
    const checks = bodyPreview.querySelectorAll('.dp-todo-check');
    checks.forEach((cb) => {
      cb.addEventListener('click', (ev) => ev.stopPropagation());
      cb.addEventListener('change', () => {
        const lineNum = parseInt(cb.dataset.line, 10);
        if (Number.isNaN(lineNum)) return;
        if (callbacks.onToggleTodo) callbacks.onToggleTodo(thought.id, lineNum);
        // 回调更新 thought.body 后,需要重新渲染预览(用最新的 thought.body)
        const tt = callbacks.peekThought ? callbacks.peekThought(thought.id) : null;
        const newBody = tt ? tt.body : bodyTextarea.value;
        bodyTextarea.value = newBody;
        bodyPreview.innerHTML = markdownToHtml(newBody) || '<span class="dp-empty">还没有笔记内容</span>';
        bindTodoCheckboxes();
      });
    });
  }
  bindTodoCheckboxes();

  const toolbar = panel.querySelector('.dp-body-toolbar');
  Object.assign(toolbar.style, {
    display: 'flex',
    gap: '6px',
    marginBottom: '6px'
  });

  const bodyBtns = panel.querySelectorAll('.dp-body-btn');
  bodyBtns.forEach((btn) => {
    Object.assign(btn.style, {
      padding: '3px 8px',
      background: 'rgba(20, 26, 51, 0.6)',
      border: '1px solid rgba(122, 140, 200, 0.2)',
      borderRadius: '6px',
      color: '#8b90ad',
      fontFamily: 'inherit',
      fontSize: '10px',
      cursor: 'pointer',
      transition: 'background 0.15s, border-color 0.15s, color 0.15s'
    });
    btn.addEventListener('hover', () => { btn.style.color = '#e9e7f4'; });
  });
  Object.assign(btnEdit.style, { borderColor: 'rgba(127, 224, 201, 0.4)', color: '#7fe0c9' });
  btnEdit.classList.add('is-active');

  panel.querySelector('.dp-close').addEventListener('click', () => {
    if (callbacks.onEditBody && bodyTextarea) {
      callbacks.onEditBody(thought.id, bodyTextarea.value);
    }
    hideDetailPanel();
  });

  panel.querySelector('.dp-btn-warm').addEventListener('click', () => {
    if (callbacks.onEditBody && bodyTextarea) {
      callbacks.onEditBody(thought.id, bodyTextarea.value);
    }
    if (callbacks.onWarm) callbacks.onWarm(thought.id);
    hideDetailPanel();
  });

  // 关联到选中 — 在已选中其他念头时,建一条到首个选中念头的边
  const linkBtn = panel.querySelector('.dp-btn-link');
  if (linkBtn) {
    const selectedOthers = callbacks.peekOtherSelected ? callbacks.peekOtherSelected(thought.id) : [];
    if (selectedOthers.length === 0) {
      linkBtn.disabled = true;
      linkBtn.dataset.disabled = '1';
      linkBtn.title = '需先选中其他念头(Shift+单击 / 长按)';
    } else {
      linkBtn.title = `建一条到「${selectedOthers[0].text?.slice(0, 10) || ''}」的边`;
    }
    linkBtn.addEventListener('click', () => {
      if (callbacks.onLinkToSelected) callbacks.onLinkToSelected(thought.id);
      hideDetailPanel();
    });
  }

  // 关联预览 pill 点击 → 跳转到那个念头
  const relPills = panel.querySelectorAll('.dp-rel-pill');
  relPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      const targetId = pill.dataset.jump;
      if (callbacks.onJumpToThought && targetId) callbacks.onJumpToThought(targetId);
    });
  });

  panel.querySelector('.dp-btn-edit').addEventListener('click', () => {
    const titleEl = panel.querySelector('.dp-title');
    if (callbacks.onEdit) callbacks.onEdit(thought.id, titleEl.textContent.trim());
    if (callbacks.onEditBody && bodyTextarea) {
      callbacks.onEditBody(thought.id, bodyTextarea.value);
    }
  });

  panel.querySelector('.dp-btn-archive').addEventListener('click', () => {
    if (callbacks.onEditBody && bodyTextarea) {
      callbacks.onEditBody(thought.id, bodyTextarea.value);
    }
    if (callbacks.onArchiveToggle) {
      const state = panel.querySelector('.dp-btn-archive').dataset.state;
      callbacks.onArchiveToggle(thought.id, state === 'archived' ? 'unarchive' : 'archive');
    } else if (callbacks.onArchive) {
      callbacks.onArchive(thought.id);
    }
    hideDetailPanel();
  });

  const contemplateBtn = panel.querySelector('.dp-btn-contemplate');
  if (contemplateBtn) {
    contemplateBtn.addEventListener('click', () => {
      if (callbacks.onEditBody && bodyTextarea) {
        callbacks.onEditBody(thought.id, bodyTextarea.value);
      }
      if (callbacks.onContemplate) callbacks.onContemplate(thought.id);
    });
  }

  const labelInput = panel.querySelector('#dp-label-input');
  labelInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const v = labelInput.value;
      if (!v || !v.trim()) return;
      if (callbacks.onAddLabel) callbacks.onAddLabel(thought.id, v);
      labelInput.value = '';
      setTimeout(() => hideDetailPanel(), 80);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      labelInput.value = '';
      labelInput.blur();
    }
  });

  panel.querySelectorAll('.dp-chip-x').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const lab = btn.dataset.remove;
      if (lab && callbacks.onRemoveLabel) callbacks.onRemoveLabel(thought.id, lab);
      setTimeout(() => hideDetailPanel(), 80);
    });
  });

  panel.querySelectorAll('.dp-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.color;
      if (!tag) return;
      if (callbacks.onSetColorTag) callbacks.onSetColorTag(thought.id, tag);
      setTimeout(() => hideDetailPanel(), 80);
    });
  });

  const clear = panel.querySelector('#dp-color-clear');
  if (clear) {
    clear.addEventListener('click', () => {
      if (callbacks.onSetColorTag) callbacks.onSetColorTag(thought.id, '');
      setTimeout(() => hideDetailPanel(), 80);
    });
  }

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      if (callbacks.onEditBody && bodyTextarea) {
        callbacks.onEditBody(thought.id, bodyTextarea.value);
      }
      hideDetailPanel();
    }
  };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(panel);
  setTimeout(() => { panel.style.opacity = '1'; panel.style.transform = 'translateY(0) scale(1)'; }, 0);

  activePanel = panel;
  return panel;
}

export function hideDetailPanel() {
  if (activePanel) {
    activePanel.style.opacity = '0';
    const el = activePanel;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 260);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
}

export function isPanelOpen() {
  return !!activePanel;
}

function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escHtmlAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;');
}
