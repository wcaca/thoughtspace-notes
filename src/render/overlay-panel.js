/**
 * [INPUT]: src/core/thought, src/persistence/yjs-store
 * [OUTPUT]: createOverlayPanel(thought, container, callbacks) → HTMLDivElement
 * [POS]: src/render 下,被 thought-node 点击事件调起
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
export function createOverlayPanel(thought, container, callbacks) {
  const existing = document.getElementById('overlay-panel');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'overlay-panel';
  Object.assign(wrapper.style, {
    position: 'fixed',
    top: '20%',
    left: '50%',
    transform: 'translate(-50%, 0)',
    width: '320px',
    padding: '20px',
    background: 'rgba(20,26,51,0.95)',
    border: '1px solid #7fe0c9',
    borderRadius: '12px',
    color: '#e9e7f4',
    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
    zIndex: '999',
    backdropFilter: 'blur(10px)',
    opacity: '0',
    transition: 'opacity 0.3s'
  });

  wrapper.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <span style="color:#7fe0c9;font-size:11px;letter-spacing:2px">念头 · ${thought.id}</span>
      <button data-close style="background:none;border:1px solid #8b90ad;color:#8b90ad;border-radius:50%;width:24px;height:24px;cursor:pointer">&times;</button>
    </div>
    <textarea data-edit rows="3" style="width:100%;background:#0a0d1c;border:1px solid #2a3358;color:#e9e7f4;border-radius:6px;padding:8px;font-family:inherit;resize:vertical">${thought.text}</textarea>
    <div style="display:flex;gap:8px;margin-top:12px;font-size:12px;color:#8b90ad">
      <span>温度 ${(thought.temperature ?? 1).toFixed(2)}</span>
      <span>质量 ${(thought.mass ?? 1).toFixed(1)}</span>
    </div>
    <div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end">
      <button data-delete style="background:none;border:1px solid #e87aa8;color:#e87aa8;padding:6px 16px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:12px">删除</button>
      <button data-save style="background:#7fe0c9;border:none;color:#0a0d1c;padding:6px 20px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:600">保存</button>
    </div>
  `;

  requestAnimationFrame(() => { wrapper.style.opacity = '1'; });

  wrapper.querySelector('[data-close]').onclick = () => closePanel(wrapper);
  wrapper.querySelector('[data-delete]').onclick = () => {
    closePanel(wrapper);
    if (callbacks?.onDelete) callbacks.onDelete(thought.id);
  };
  wrapper.querySelector('[data-save]').onclick = () => {
    const text = wrapper.querySelector('[data-edit]').value;
    closePanel(wrapper);
    if (callbacks?.onSave) callbacks.onSave(thought.id, text);
  };

  const el = container || document.body;
  el.appendChild(wrapper);
  return wrapper;
}

function closePanel(panel) {
  panel.style.opacity = '0';
  setTimeout(() => panel.remove(), 300);
}
