/**
 * [INPUT]: zoneStore / zoneMesh / thoughtById / callbacks
 * [OUTPUT]: showZonePanel({ zoneStore, zoneMesh, thoughtById, callbacks }) → DOM; hideZonePanel(); isZonePanelOpen()
 * [POS]: src/render/zone-panel.js — 分区管理面板;列表渲染 + 入口 + 弹出 / 关闭;表单逻辑委托 zone-form.js
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

import { createZoneForm } from './zone-form.js';

let activePanel = null;
let cleanupEsc = null;

// callbacks 形状详见 zone-form.js 的 ZoneCallbacks typedef;此处仅转发给 createZoneForm。
export function showZonePanel({ zoneStore, zoneMesh, thoughtById, callbacks = {} } = {}) {
  if (activePanel) hideZonePanel();

  const root = document.createElement('div');
  root.id = 'zone-panel';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', '自定义分区');

  Object.assign(root.style, {
    position: 'fixed', zIndex: '120',
    left: '50%', top: '50%',
    transform: 'translate(-50%, -50%) translateY(8px) scale(0.96)',
    width: '520px', maxHeight: '80vh',
    display: 'flex', flexDirection: 'column',
    background: 'linear-gradient(160deg, rgba(22, 28, 56, 0.92) 0%, rgba(14, 18, 36, 0.94) 100%)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    borderRadius: '16px', border: '1px solid rgba(127, 224, 201, 0.25)',
    color: '#e9e7f4', fontFamily: '"PingFang SC", "Microsoft YaHei", sans-serif', fontSize: '13px',
    boxShadow: '0 20px 56px rgba(0,0,0,0.65), 0 0 80px rgba(127,224,201,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
    opacity: '0', overflow: 'hidden',
    transition: 'opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)'
  });

  // 头部
  const header = document.createElement('div');
  Object.assign(header.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '18px 22px 14px',
    borderBottom: '1px solid rgba(127, 224, 201, 0.12)',
    background: 'linear-gradient(180deg, rgba(127,224,201,0.06), transparent)'
  });
  const icon = document.createElement('div');
  Object.assign(icon.style, {
    width: '32px', height: '32px', borderRadius: '50%',
    background: 'linear-gradient(135deg, rgba(127,224,201,0.3), rgba(155,140,242,0.2))',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '16px', flexShrink: 0,
    boxShadow: '0 0 16px rgba(127,224,201,0.3)'
  });
  icon.textContent = '◯';
  const titleWrap = document.createElement('div');
  titleWrap.style.flex = '1';
  const title = document.createElement('div');
  Object.assign(title.style, {
    fontSize: '15px',
    fontWeight: '500',
    letterSpacing: '3px',
    background: 'linear-gradient(120deg, #fff8dc, var(--crystal, #7fe0c9))',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent'
  });
  title.textContent = '自定义分区';
  const subtitle = document.createElement('div');
  Object.assign(subtitle.style, {
    fontSize: '10px',
    color: '#8b90ad',
    letterSpacing: '1.5px',
    marginTop: '2px'
  });
  const zoneCount = zoneStore.size();
  subtitle.textContent = `当前 ${zoneCount} 个分区 · 念头自动归入最近区域`;
  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const close = document.createElement('button');
  Object.assign(close.style, {
    background: 'transparent', border: '1px solid transparent', color: '#8b90ad',
    fontSize: '20px', cursor: 'pointer', padding: '0',
    width: '28px', height: '28px', borderRadius: '50%',
    lineHeight: 1, transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
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

  // 动画样式注入
  if (!document.getElementById('zone-style')) {
    const s = document.createElement('style');
    s.id = 'zone-style';
    s.textContent = `
      #zone-panel .zp-section-title { font-size: 10px; color: #8b90ad; letter-spacing: 2.5px; margin: 14px 22px 8px; padding-bottom: 6px; border-bottom: 1px dashed rgba(122,140,200,0.18); text-transform: uppercase; font-weight: 500; }
      #zone-panel .zp-list { margin: 0 22px 10px; display: flex; flex-direction: column; gap: 6px; max-height: 240px; overflow-y: auto; }
      #zone-panel .zp-item { padding: 10px 12px; background: rgba(20,26,51,0.55); border: 1px solid rgba(122,140,200,0.18); border-radius: 10px; display: flex; align-items: center; gap: 10px; transition: all 0.2s ease; cursor: default; }
      #zone-panel .zp-item:hover { border-color: rgba(127,224,201,0.45); background: rgba(127,224,201,0.08); }
      #zone-panel .zp-color-dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 8px currentColor; }
      #zone-panel .zp-info { flex: 1; min-width: 0; }
      #zone-panel .zp-name { font-size: 13px; color: #fff; letter-spacing: 0.5px; word-break: break-word; }
      #zone-panel .zp-meta { font-size: 10px; color: #8b90ad; margin-top: 3px; letter-spacing: 1px; }
      #zone-panel .zp-actions { display: flex; gap: 4px; flex-shrink: 0; }
      #zone-panel .zp-icon-btn { width: 26px; height: 26px; border-radius: 6px; background: rgba(20,26,51,0.7); border: 1px solid rgba(122,140,200,0.2); color: #8b90ad; font-size: 13px; cursor: pointer; transition: all 0.15s ease; line-height: 1; }
      #zone-panel .zp-icon-btn:hover { background: rgba(127,224,201,0.15); border-color: rgba(127,224,201,0.5); color: #7fe0c9; }
      #zone-panel .zp-icon-btn.danger:hover { background: rgba(232,122,168,0.18); border-color: rgba(232,122,168,0.5); color: #fbe1ec; }
      #zone-panel .zp-form { margin: 0 22px 14px; padding: 14px; background: rgba(127,224,201,0.04); border: 1px dashed rgba(127,224,201,0.25); border-radius: 10px; }
      #zone-panel .zp-form-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
      #zone-panel .zp-label { font-size: 10px; color: #8b90ad; letter-spacing: 2px; flex: 0 0 50px; text-transform: uppercase; }
      #zone-panel .zp-input { flex: 1; padding: 6px 10px; background: rgba(20,26,51,0.7); border: 1px solid rgba(122,140,200,0.22); border-radius: 6px; color: #e9e7f4; font: inherit; font-size: 12px; outline: none; transition: all 0.15s; }
      #zone-panel .zp-input:focus { border-color: rgba(127,224,201,0.6); box-shadow: 0 0 0 2px rgba(127,224,201,0.1); }
      #zone-panel .zp-select { padding: 5px 8px; background: rgba(20,26,51,0.7); border: 1px solid rgba(122,140,200,0.22); border-radius: 6px; color: #e9e7f4; font: inherit; font-size: 11px; outline: none; cursor: pointer; }
      #zone-panel .zp-color-row { display: flex; gap: 5px; flex-wrap: wrap; }
      #zone-panel .zp-color-swatch { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; transition: all 0.15s; padding: 0; }
      #zone-panel .zp-color-swatch.is-on { border-color: #fff; transform: scale(1.15); box-shadow: 0 0 12px currentColor; }
      #zone-panel .zp-form-actions { display: flex; gap: 8px; margin-top: 12px; }
      #zone-panel .zp-btn { flex: 1; padding: 8px 12px; border-radius: 8px; font: inherit; font-size: 12px; cursor: pointer; transition: all 0.2s ease; letter-spacing: 1px; }
      #zone-panel .zp-btn-primary { background: linear-gradient(135deg, rgba(127,224,201,0.25), rgba(127,224,201,0.1)); border: 1px solid rgba(127,224,201,0.5); color: #e9e7f4; }
      #zone-panel .zp-btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(127,224,201,0.25); }
      #zone-panel .zp-btn-secondary { background: transparent; border: 1px solid rgba(122,140,200,0.25); color: #8b90ad; }
      #zone-panel .zp-btn-secondary:hover { color: #e9e7f4; border-color: rgba(122,140,200,0.5); }
      #zone-panel .zp-empty { padding: 20px; text-align: center; color: #8b90ad; font-size: 12px; font-style: italic; }
      #zone-panel .zp-hint { font-size: 10px; color: #8b90ad; letter-spacing: 1px; margin: 0 22px 14px; opacity: 0.7; line-height: 1.6; }
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

  // 新建表单标题
  const formTitle = document.createElement('div');
  formTitle.className = 'zp-section-title';
  formTitle.textContent = '+ 新建分区';
  content.appendChild(formTitle);

  // 列表标题 + 容器(先创建以便 renderList 闭包引用)
  const listTitle = document.createElement('div');
  listTitle.className = 'zp-section-title';
  listTitle.textContent = '现有分区';
  const list = document.createElement('div');
  list.className = 'zp-list';

  // formCtl 在 renderList 首次调用前赋值;renderList 通过闭包读取
  let formCtl;

  function renderList() {
    list.innerHTML = '';
    const zones = zoneStore.list();
    if (zones.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'zp-empty';
      empty.textContent = '还没有分区 · 创建一个开始组织念头';
      list.appendChild(empty);
      subtitle.textContent = `当前 0 个分区 · 念头自动归入最近区域`;
      return;
    }
    subtitle.textContent = `当前 ${zones.length} 个分区 · 念头自动归入最近区域`;
    for (const zone of zones) {
      const counts = countThoughtsIn(zone, thoughtById);
      const item = document.createElement('div');
      item.className = 'zp-item';

      const dot = document.createElement('div');
      dot.className = 'zp-color-dot';
      dot.style.background = zone.color;
      dot.style.color = zone.color;

      const info = document.createElement('div');
      info.className = 'zp-info';
      const name = document.createElement('div');
      name.className = 'zp-name';
      name.textContent = zone.name;
      const meta = document.createElement('div');
      meta.className = 'zp-meta';
      meta.textContent = `中心 (${Math.round(zone.center.x)}, ${Math.round(zone.center.y)}, ${Math.round(zone.center.z)}) · 半径 ${zone.radius} · 包含 ${counts} 个念头`;
      info.appendChild(name);
      info.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'zp-actions';
      const jumpBtn = iconBtn('◎', '聚焦到此分区', () => {
        if (callbacks.onJump) callbacks.onJump(zone);
        hideZonePanel();
      });
      const editBtn = iconBtn('✎', '编辑', () => formCtl.startEdit(zone));
      const delBtn = iconBtn('×', '删除', 'danger', () => {
        if (callbacks.onRemove) callbacks.onRemove(zone);
        else zoneStore.remove(zone.id);
        zoneMesh.removeZone(zone.id);
        if (callbacks.onChange) callbacks.onChange();
        renderList();
      });
      actions.appendChild(jumpBtn);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);

      item.appendChild(dot);
      item.appendChild(info);
      item.appendChild(actions);
      list.appendChild(item);
    }
  }

  function countThoughtsIn(zone, thoughtById) {
    let n = 0;
    for (const t of thoughtById.values()) {
      if (zoneStore.contains(zone, t)) n++;
    }
    return n;
  }

  function iconBtn(label, title, kind, onClick) {
    const b = document.createElement('button');
    b.className = 'zp-icon-btn' + (kind === 'danger' ? ' danger' : '');
    b.textContent = label;
    b.title = title;
    b.addEventListener('click', onClick);
    return b;
  }

  // 表单逻辑委托 zone-form.js
  formCtl = createZoneForm({ zoneStore, zoneMesh, thoughtById, callbacks, onRenderList: renderList });
  content.appendChild(formCtl.el);

  // hint
  const hint = document.createElement('div');
  hint.className = 'zp-hint';
  hint.textContent = '💡 提示:分区是 3D 球体,中心位置 / 半径可任意设;念头按"距离最近且包含在内"自动归入';
  content.appendChild(hint);

  content.appendChild(listTitle);
  content.appendChild(list);

  close.addEventListener('click', hideZonePanel);
  cleanupEsc = (e) => { if (e.key === 'Escape') hideZonePanel(); };
  document.addEventListener('keydown', cleanupEsc);

  document.body.appendChild(root);
  activePanel = root;
  requestAnimationFrame(() => {
    root.style.opacity = '1';
    root.style.transform = 'translate(-50%, -50%) translateY(0) scale(1)';
  });
  // 注册到面板栈
  import('./panel-stack.js').then(({ registerPanel }) => {
    registerPanel('zone', root, () => hideZonePanel());
  }).catch(() => { /* ignore */ });

  renderList();
  return root;
}

export function hideZonePanel() {
  if (activePanel) {
    const el = activePanel;
    el.style.opacity = '0';
    el.style.transform = 'translate(-50%, -50%) translateY(8px) scale(0.96)';
    setTimeout(() => { if (el.parentNode) el.remove(); }, 260);
    activePanel = null;
  }
  if (cleanupEsc) {
    document.removeEventListener('keydown', cleanupEsc);
    cleanupEsc = null;
  }
  import('./panel-stack.js').then(({ getPanelStack }) => {
    try { getPanelStack().close('zone'); } catch (e) { /* ignore */ }
  }).catch(() => { /* ignore */ });
}

export function isZonePanelOpen() {
  return !!activePanel;
}
