/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: installOutsideClick() → 关闭顶层 panel
 * [POS]: src/render/outside-click.js — 监听全局点击,点击空白关闭当前最顶 panel
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 行为:点击到 singleton 面板内不关;点击非面板区域就关闭最顶 panel
 * 安装一次即可
 */
let installed = false;

export function installOutsideClick() {
  if (installed) return;
  installed = true;

  document.addEventListener('mousedown', (e) => {
    import('./panel-stack.js').then(({ getPanelStack }) => {
      const stack = getPanelStack();
      const top = stack.getOpen();
      if (!top || !top.el) return;
      // 点击到 top.el 内部不关
      if (top.el.contains(e.target)) return;
      // 点击到工具栏/HUD/header 不关(用户可能想点工具按钮触发新面板)
      const interactive = e.target.closest('header, .desktop-toolbar, .mobile-toolbar, .awareness-hud, #cmd-hint, .welcome-overlay, #face-label');
      if (interactive) return;
      // 关闭顶层
      stack.close(top.id);
    }).catch(() => { /* ignore */ });
  }, true);
}

export function uninstallOutsideClick() {
  installed = false;
}