/**
 * [INPUT]: DOM, src/core/thought(tempToHexColor, getName, decayTemperature, labelColorAt, COLOR_TAGS, extractTodos), src/render/detail-markdown(markdownToHtml, panelInnerHtml, setupMarkdownBody, escHtml, escHtmlAttr), src/render/a11y(overscrollContain, prefersReducedMotion, announce, FOCUSABLE_SELECTOR)
 * [OUTPUT]: showDetailPanel(thought, screenPos, callbacks) → 浮动毛玻璃面板(含 source 来源锚定徽章); hideDetailPanel(); isPanelOpen()
 * [POS]: src/render/detail-panel.js — 念头详情浮动面板(面板结构 + 标签/色温字段编辑 + source 徽章 + 按钮回调)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import {
  tempToHexColor, getName, decayTemperature,
  labelColorAt, COLOR_TAGS, extractTodos
} from '../core/thought.js';
import { overscrollContain, prefersReducedMotion, announce, FOCUSABLE_SELECTOR } from './a11y.js';
import { markdownToHtml, panelInnerHtml, setupMarkdownBody, escHtml, escHtmlAttr } from './detail-markdown.js';

let activePanel = null;
let cleanupEsc = null;

// source 来源锚定徽章图标(manual 默认不强调)
const SOURCE_ICONS = { manual: '✍', voice: '🎤', import: '📥', 'copilot-suggest': '✨' };

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

  // source 来源锚定徽章:manual 默认不强调(任务约束)
  const sourceType = (thought.source && thought.source.type) ? thought.source.type : 'manual';
  const sourceIcon = SOURCE_ICONS[sourceType] || SOURCE_ICONS.manual;
  const sourceBadge = sourceType === 'manual'
    ? ''
    : `<span class="dp-source-badge" title="来源: ${escHtmlAttr(sourceType)}">${sourceIcon} ${escHtml(sourceType)}</span>`;

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

  panel.innerHTML = panelInnerHtml(thought, {
    labelHtml, colorTagRow, colorTagKey, relationsHtml,
    tempPercent, barW, barColor,
    created, lastInteraction, mass, hintLabel, sourceBadge
  });

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

  // 注入 source 徽章样式(todo 样式由 detail-markdown.js 的 setupMarkdownBody 注入)
  const styleEl = document.createElement('style');
  styleEl.textContent = `.dp-source-badge { display: inline-block; margin-left: 8px; padding: 1px 6px; font-size: 10px; letter-spacing: 0.5px; color: #7fe0c9; background: rgba(127, 224, 201, 0.12); border: 1px solid rgba(127, 224, 201, 0.25); border-radius: 8px; vertical-align: middle; }`;
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
      if (e.target && e.target.classList && e.target.classList.contains('dp-title')) return;
      if (e.target && e.target.classList && e.target.classList.contains('dp-close')) return;
      dpDragging = true;
      header.style.cursor = 'grabbing';
      dpDragStartX = e.clientX;
      dpDragStartY = e.clientY;
      dpLeftStart = parseInt(panel.style.left || '0', 10);
      dpTopStart = parseInt(panel.style.top || '0', 10);
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
      if (dpDragging) { dpDragging = false; header.style.cursor = 'grab'; }
    });
  }

  // 笔记正文编辑器(textarea/预览切换/todo 复选框) — 来自 detail-markdown.js
  const { commit } = setupMarkdownBody(panel, thought, callbacks);

  // 高级选项折叠
  const advToggle = panel.querySelector('#dp-advanced-toggle');
  if (advToggle) {
    advToggle.addEventListener('click', () => {
      const isOpen = panel.dataset.advancedOpen === '1';
      if (isOpen) delete panel.dataset.advancedOpen;
      else panel.dataset.advancedOpen = '1';
    });
  }

  panel.querySelector('.dp-close').addEventListener('click', () => {
    commit();
    hideDetailPanel();
  });

  panel.querySelector('.dp-btn-warm').addEventListener('click', () => {
    commit();
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
    commit();
  });

  panel.querySelector('.dp-btn-archive').addEventListener('click', () => {
    commit();
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
      commit();
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
      commit();
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
