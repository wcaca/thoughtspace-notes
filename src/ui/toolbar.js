/**
 * [INPUT]: DOM, src/persistence/yjs-store, src/core, src/render/crystallize-fx
 * [OUTPUT]: createToolbar(container, callbacks) → 工具栏 DOM
 * [POS]: src/ui 下,被 index.html 初始化调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

export function createToolbar(container, callbacks) {
  const bar = document.createElement('div');
  bar.id = 'toolbar';
  Object.assign(bar.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '10',
    display: 'flex',
    gap: '10px',
    background: 'rgba(20,26,51,0.7)',
    backdropFilter: 'blur(10px)',
    padding: '10px 16px',
    borderRadius: '30px',
    border: '1px solid #2a3358'
  });

  const buttons = [
    { id: 'btn-add', text: '+ 投下念头', cls: '', handler: callbacks?.onAdd },
    { id: 'btn-reset', text: '重置布局', cls: '', handler: callbacks?.onReset },
    { id: 'btn-sample', text: '载入示例', cls: '', handler: callbacks?.onSample },
    { id: 'btn-clear', text: '清空', cls: 'primary', handler: callbacks?.onClear }
  ];

  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.id = b.id;
    btn.textContent = b.text;
    Object.assign(btn.style, {
      background: 'transparent',
      border: b.cls === 'primary' ? '1px solid #e8a865' : '1px solid #2a3358',
      color: b.cls === 'primary' ? '#e8a865' : '#8b90ad',
      padding: '8px 16px',
      borderRadius: '18px',
      fontSize: '12px',
      cursor: 'pointer',
      letterSpacing: '1px',
      fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif'
    });
    btn.addEventListener('click', b.handler);
    bar.appendChild(btn);
  }

  (container || document.body).appendChild(bar);
  return bar;
}
