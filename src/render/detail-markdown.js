/**
 * [INPUT]: text(markdown 字符串), DOM, thought, ctx(模板变量), callbacks(onToggleTodo, peekThought, onEditBody)
 * [OUTPUT]: markdownToHtml(text), escHtml(str), escHtmlAttr(str), panelInnerHtml(thought, ctx), setupMarkdownBody(panel, thought, callbacks) → { bodyTextarea, commit }
 * [POS]: src/render/detail-markdown.js — 详情面板的 markdown 渲染 + 笔记正文编辑器 + 面板 HTML 模板(textarea/预览切换/todo 复选框绑定)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const TODO_LINE_RE = /^(\s*[-*+]?\s*)\[([ xX])\]\s+(.+)$/;

export function markdownToHtml(text) {
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

export function escHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

export function escHtmlAttr(str) {
  return escHtml(str).replace(/"/g, '&quot;');
}

function bodySectionHtml(thought) {
  return `
    <div class="dp-section dp-section-body">
      <div class="dp-section-label">笔记正文</div>
      <div class="dp-body-toolbar">
        <button class="dp-body-btn dp-body-btn-edit" data-mode="edit" title="编辑">✎ 编辑</button>
        <button class="dp-body-btn dp-body-btn-preview" data-mode="preview" title="预览">👁 预览</button>
      </div>
      <textarea class="dp-body-textarea" id="dp-body-textarea" aria-label="笔记正文" placeholder="写点什么… 支持 markdown（**粗体** *斜体* [链接](url)）" spellcheck="false">${escHtml(thought.body || '')}</textarea>
      <div class="dp-body-preview" id="dp-body-preview" style="display:none;">${markdownToHtml(thought.body) || '<span class="dp-empty">还没有笔记内容</span>'}</div>
    </div>
  `;
}

export function panelInnerHtml(thought, ctx) {
  const {
    labelHtml, colorTagRow, colorTagKey, relationsHtml,
    tempPercent, barW, barColor,
    created, lastInteraction, mass, hintLabel, sourceBadge
  } = ctx;
  const archived = thought.temperature != null && thought.temperature < 0.1;
  return `
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
    ${bodySectionHtml(thought)}
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
        <div class="dp-meta-row"><span class="dp-label">创建</span><span>${created}${sourceBadge}</span></div>
        <div class="dp-meta-row"><span class="dp-label">上次交互</span><span>${lastInteraction}</span></div>
        <div class="dp-meta-row"><span class="dp-label">质量</span><span>${mass} · ${mass > 1.3 ? '引力强' : mass > 1 ? '中性' : '轻盈'}</span></div>
        <div class="dp-meta-row"><span class="dp-label">类型</span><span class="dp-hint-tag">${hintLabel}</span></div>
      </div>
      <div class="dp-actions">
        <button class="dp-btn dp-btn-archive" data-state="${archived ? 'archived' : 'active'}">${archived ? '↻ 解档' : '↓ 归档'}</button>
      </div>
    </div>
  `;
}

export function setupMarkdownBody(panel, thought, callbacks = {}) {
  const bodyTextarea = panel.querySelector('#dp-body-textarea');
  const bodyPreview = panel.querySelector('#dp-body-preview');
  const btnEdit = panel.querySelector('.dp-body-btn-edit');
  const btnPreview = panel.querySelector('.dp-body-btn-preview');

  // 注入 todo 项样式(与 markdown 渲染配套)
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    .dp-todo-item { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
    .dp-todo-check { margin: 0; cursor: pointer; accent-color: #7fe0c9; }
    .dp-todo-text { color: #e9e7f4; flex: 1; }
    .dp-todo-text.is-done { color: #5a6080; text-decoration: line-through; }
  `;
  panel.appendChild(styleEl);

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

  Object.assign(bodyTextarea.style, {
    width: '100%', height: '120px', minHeight: '80px', maxHeight: '200px',
    padding: '10px', background: 'rgba(20, 26, 51, 0.7)',
    border: '1px solid rgba(122, 140, 200, 0.22)', borderRadius: '8px',
    color: '#e9e7f4', fontFamily: '"PingFang SC", "Microsoft YaHei", monospace',
    fontSize: '12px', lineHeight: '1.6', resize: 'vertical', outline: 'none',
    transition: 'border-color 0.15s'
  });
  bodyTextarea.addEventListener('focus', () => { bodyTextarea.style.borderColor = 'rgba(127, 224, 201, 0.5)'; });
  bodyTextarea.addEventListener('blur', () => { bodyTextarea.style.borderColor = 'rgba(122, 140, 200, 0.22)'; });

  Object.assign(bodyPreview.style, {
    width: '100%', minHeight: '80px', padding: '10px',
    background: 'rgba(20, 26, 51, 0.5)', border: '1px dashed rgba(122, 140, 200, 0.2)',
    borderRadius: '8px', fontSize: '12px', lineHeight: '1.7',
    whiteSpace: 'pre-wrap', wordBreak: 'break-word'
  });
  bodyPreview.addEventListener('click', (ev) => {
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
  Object.assign(toolbar.style, { display: 'flex', gap: '6px', marginBottom: '6px' });

  const bodyBtns = panel.querySelectorAll('.dp-body-btn');
  bodyBtns.forEach((btn) => {
    Object.assign(btn.style, {
      padding: '3px 8px', background: 'rgba(20, 26, 51, 0.6)',
      border: '1px solid rgba(122, 140, 200, 0.2)', borderRadius: '6px',
      color: '#8b90ad', fontFamily: 'inherit', fontSize: '10px', cursor: 'pointer',
      transition: 'background 0.15s, border-color 0.15s, color 0.15s'
    });
    btn.addEventListener('hover', () => { btn.style.color = '#e9e7f4'; });
  });
  Object.assign(btnEdit.style, { borderColor: 'rgba(127, 224, 201, 0.4)', color: '#7fe0c9' });
  btnEdit.classList.add('is-active');

  const commit = () => {
    if (callbacks.onEditBody && bodyTextarea) {
      callbacks.onEditBody(thought.id, bodyTextarea.value);
    }
  };

  return { bodyTextarea, commit };
}
