/**
 * [INPUT]: DOM, callbacks {onExportJson, onExportMd, onImport, onClose}
 * [OUTPUT]: showExportPanel({thoughtCount, edgeCount, callbacks}) → DOM;hideExportPanel()
 * [POS]: src/render/export-panel.js — Ctrl+Shift+E 唤起的导出/导入浮动面板
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

let panelEl = null;
let cleanupEsc = null;
let onExportJsonCb = null;
let onExportMdCb = null;
let onImportCb = null;
let onResetCb = null;
let onAuditCb = null;
let onCloseCb = null;
let fileInputEl = null;

export function showExportPanel({ thoughtCount = 0, edgeCount = 0, callbacks = {} } = {}) {
  hideExportPanel();
  onExportJsonCb = callbacks.onExportJson || null;
  onExportMdCb = callbacks.onExportMd || null;
  onImportCb = callbacks.onImport || null;
  onResetCb = callbacks.onReset || null;
  onAuditCb = callbacks.onAudit || null;
  onCloseCb = callbacks.onClose || null;

  const root = document.createElement('div');
  root.id = 'export-panel';

  const header = document.createElement('div');
  header.className = 'ep-panel-header';
  const title = document.createElement('span');
  title.className = 'ep-panel-title';
  title.textContent = '导出 / 导入';
  const close = document.createElement('button');
  close.className = 'ep-panel-close';
  close.textContent = '×';
  close.title = '关闭';
  header.appendChild(title);
  header.appendChild(close);
  root.appendChild(header);

  const meta = document.createElement('div');
  meta.className = 'ep-panel-meta';
  meta.textContent = `当前数据 ${thoughtCount} 个念头 · ${edgeCount} 条关系`;
  root.appendChild(meta);

  const exportSec = document.createElement('div');
  exportSec.className = 'ep-panel-section';
  const exportLabel = document.createElement('div');
  exportLabel.className = 'ep-panel-section-label';
  exportLabel.textContent = '导出';
  exportSec.appendChild(exportLabel);

  const jsonBtn = mkButton('ep-action', '↓ JSON 文件 (备份)');
  const mdBtn = mkButton('ep-action', '↓ Markdown 文件 (含 mermaid 图)');
  jsonBtn.addEventListener('click', () => { if (onExportJsonCb) onExportJsonCb(); });
  mdBtn.addEventListener('click', () => { if (onExportMdCb) onExportMdCb(); });
  exportSec.appendChild(jsonBtn);
  exportSec.appendChild(mdBtn);
  root.appendChild(exportSec);

  const importSec = document.createElement('div');
  importSec.className = 'ep-panel-section';
  const importLabel = document.createElement('div');
  importLabel.className = 'ep-panel-section-label';
  importLabel.textContent = '导入';
  importSec.appendChild(importLabel);

  const importRow = document.createElement('div');
  importRow.className = 'ep-import-row';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  fileInput.id = 'ep-file-input';
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (f && onImportCb) onImportCb(f);
  });
  fileInputEl = fileInput;

  const pickBtn = mkButton('ep-action', '↑ 选择 JSON 文件…');
  pickBtn.addEventListener('click', () => fileInput.click());

  importRow.appendChild(pickBtn);
  importRow.appendChild(fileInput);
  importSec.appendChild(importRow);
  root.appendChild(importSec);

  const hint = document.createElement('div');
  hint.className = 'ep-panel-hint';
  hint.innerHTML = '<b>注意</b> 导入默认 <b>合并</b>(同 id 跳过)。需要替换可按住 <b>Shift</b>。';
  root.appendChild(hint);

  const resetSec = document.createElement('div');
  resetSec.className = 'ep-panel-section ep-panel-reset-section';
  const resetLabel = document.createElement('div');
  resetLabel.className = 'ep-panel-section-label';
  resetLabel.textContent = '维护';
  resetSec.appendChild(resetLabel);
  if (onAuditCb) {
    const auditBtn = mkButton('ep-action', '🔧 扫描 + 修复孤边 / 重 id');
    auditBtn.addEventListener('click', () => { if (onAuditCb) onAuditCb(); });
    resetSec.appendChild(auditBtn);
  }
  if (onResetCb) {
    const resetBtn = mkButton('ep-action ep-action-danger', '⚠ 清空全部数据(慎重)');
    resetBtn.addEventListener('click', () => { if (onResetCb) onResetCb(); });
    resetSec.appendChild(resetBtn);
  }
  root.appendChild(resetSec);

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '135',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%) scale(0.95)',
    width: '340px',
    background: 'rgba(14, 18, 36, 0.95)',
    backdropFilter: 'blur(22px)',
    WebkitBackdropFilter: 'blur(22px)',
    borderRadius: '14px',
    border: '1px solid rgba(232, 168, 101, 0.4)',
    padding: '18px 18px 16px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '13px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.6), 0 0 80px rgba(232,168,101,0.22)',
    opacity: '0',
    transition: 'opacity 0.2s, transform 0.2s'
  });

  close.addEventListener('click', hideExportPanel);

  document.body.appendChild(root);
  panelEl = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translate(-50%, -50%) scale(1)';
  });
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('export', root, () => hideExportPanel());
  }).catch(() => { /* ignore */ });

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideExportPanel();
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });
  return root;
}

function mkButton(cls, text) {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  return b;
}

export function hideExportPanel() {
  if (panelEl) {
    const el = panelEl;
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -50%) scale(0.95)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 220);
    panelEl = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc, { capture: true });
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('export'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
  fileInputEl = null;
  const cb = onCloseCb;
  onExportJsonCb = null;
  onExportMdCb = null;
  onImportCb = null;
  onResetCb = null;
  onAuditCb = null;
  onCloseCb = null;
  if (cb) cb();
}

export function isExportPanelOpen() {
  return !!panelEl;
}
