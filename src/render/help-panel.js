/**
 * [INPUT]: DOM 焦点,无外部依赖
 * [OUTPUT]: showHelpPanel() → DOM; hideHelpPanel(); isHelpPanelOpen()
 * [POS]: src/render/help-panel.js — Shift+/ 或 ? 唤起的按键说明面板
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const SECTIONS = [
  {
    title: '观察',
    items: [
      { key: '鼠标拖动', desc: '旋转魔方面 / 缩放' },
      { key: '滚动', desc: '推进 / 拉远' }
    ]
  },
  {
    title: '念头',
    items: [
      { key: '单击', desc: '打开详情面板(含笔记正文 + todo)' },
      { key: 'Shift + 单击', desc: '选中(关联边高亮)' },
      { key: '双击', desc: '回暖 / 解档' },
      { key: '拖动', desc: '移动(松手即持久化)' },
      { key: 'A 拖 B 悬停 0.5s', desc: '建关系(5 选 1)' },
      { key: 'N', desc: '甩念头(回车投入 · 自动聚焦落点)' }
    ]
  },
  {
    title: '关系(边)',
    items: [
      { key: '悬停边 0.25s', desc: '边显形' },
      { key: '双击边', desc: '改 type / 删除 / 互换方向' }
    ]
  },
  {
    title: '搜索 / 标签 / 心情',
    items: [
      { key: 'F', desc: '全局搜索 → 跳转选中' },
      { key: '详情面板输入', desc: '加标签(回车提交)' },
      { key: '× 颜色', desc: '清除情绪色温' }
    ]
  },
  {
    title: '模式 / 持久 / 出入',
    items: [
      { key: 'M', desc: '切冥想 / 观察模式' },
      { key: 'V', desc: '观察视图(卡片/看板/时间线)' },
      { key: 'A', desc: '行动面板(从已选念头提炼)' },
      { key: 'C', desc: '结晶(选中≥2念头,结构达到阈值)' },
      { key: '◎ 静观', desc: '详情面板点"静观 3 分钟"进入' },
      { key: 'Ctrl + Z', desc: '撤销(100 步内)' },
      { key: 'Ctrl + Shift + Z', desc: '重做' },
      { key: 'Ctrl + Shift + E', desc: '导出 / 导入 JSON' },
      { key: 'Shift + ?', desc: '本帮助面板 / Esc 关掉' }
    ]
  },
  {
    title: '系统(非常用)',
    items: [
      { key: 'Ctrl + Shift + Backspace', desc: '重置所有(多重确认)' },
      { key: 'Esc', desc: '关当前面板' }
    ]
  }
];

let panelEl = null;
let cleanupEsc = null;

export function showHelpPanel() {
  if (panelEl) return panelEl;
  const root = document.createElement('div');
  root.id = 'help-panel';

  const header = document.createElement('div');
  header.className = 'help-panel-header';
  const title = document.createElement('span');
  title.className = 'help-panel-title';
  title.textContent = '键盘与手势';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'help-panel-close';
  closeBtn.textContent = '×';
  closeBtn.title = '关闭';
  header.appendChild(title);
  header.appendChild(closeBtn);
  root.appendChild(header);

  for (const section of SECTIONS) {
    const sec = document.createElement('div');
    sec.className = 'help-section';
    const t = document.createElement('div');
    t.className = 'help-section-title';
    t.textContent = section.title;
    sec.appendChild(t);
    for (const item of section.items) {
      const row = document.createElement('div');
      row.className = 'help-row';
      const k = document.createElement('span');
      k.className = 'help-key';
      k.textContent = item.key;
      const d = document.createElement('span');
      d.className = 'help-desc';
      d.textContent = item.desc;
      row.appendChild(k);
      row.appendChild(d);
      sec.appendChild(row);
    }
    root.appendChild(sec);
  }

  Object.assign(root.style, {
    position: 'fixed',
    zIndex: '130',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%) scale(0.96)',
    width: '460px',
    maxHeight: '80vh',
    overflow: 'auto',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.92) 0%, rgba(14, 18, 36, 0.94) 100%)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px',
    border: '1px solid rgba(127, 224, 201, 0.25)',
    padding: '20px 24px 22px',
    color: '#e9e7f4',
    fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize: '13px',
    boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 80px rgba(127,224,201,0.18), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0',
    transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  closeBtn.addEventListener('click', hideHelpPanel);

  document.body.appendChild(root);
  panelEl = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translate(-50%, -50%) scale(1)';
  });

  cleanupEsc = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      hideHelpPanel();
    }
  };
  document.addEventListener('keydown', cleanupEsc, { capture: true });
  // 注册到面板栈(单开原则)
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('help', root, () => hideHelpPanel());
  }).catch(() => { /* ignore */ });
  return root;
}

export function hideHelpPanel() {
  if (panelEl) {
    const el = panelEl;
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -50%) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 200);
    panelEl = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc, { capture: true });
    cleanupEsc = null;
  }
  // 同步移除面板栈中的注册
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('help'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isHelpPanelOpen() {
  return !!panelEl;
}
