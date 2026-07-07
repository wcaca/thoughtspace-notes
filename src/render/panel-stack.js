/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: getPanelStack() → { open(id, el, opts), close(id), closeAll, isOpen, isAnyOpen, currentId, onChange, dispose }
 * [POS]: src/render/panel-stack.js — 全局面板栈(单开协调器);保证任意时刻只有一个"主"面板可见(除 detail 等瞬态)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 设计哲学:
 *  - 用户明确"打开 X"→ 自动关闭其他"主"面板(单开原则,防止重叠)
 *  - 保留"瞬态"面板槽位(detail/edge/picker/contemplate 不入栈,叠加)
 *  - 打开新面板时,记录回调 → close 时反向 cleanup
 *  - 提供 closeAll 让用户一键全关(也是 Esc 长按 / 点击空白处的行为)
 */

const SINGLETON_IDS = new Set([
  'help',
  'observe',
  'action',
  'export',
  'search',
  'copilot',
  'zone',
  'command-palette'
]);

export function getPanelStack() {
  if (panelStack._instance) return panelStack._instance;

  const stack = []; // [{ id, el, onClose }]
  const listeners = new Set();

  function notify() {
    for (const l of listeners) {
      try { l({ open: stack[stack.length - 1]?.id || null, count: stack.length }); } catch (e) { /* ignore */ }
    }
  }

  function open(id, el, opts = {}) {
    if (!id || !el) return false;
    const isSingleton = SINGLETON_IDS.has(id) || opts.singleton;
    if (isSingleton) {
      // 关闭所有同 singleton 的旧面板(理论上只一个)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].id === id) {
          try { if (stack[i].onClose) stack[i].onClose(); } catch (e) { /* ignore */ }
          stack.splice(i, 1);
        }
      }
      // 同时关闭其他 singleton 面板(单开原则)
      for (let i = stack.length - 1; i >= 0; i--) {
        if (SINGLETON_IDS.has(stack[i].id)) {
          try {
            if (stack[i].onClose) stack[i].onClose();
            else if (stack[i].el && stack[i].el.parentNode) stack[i].el.parentNode.removeChild(stack[i].el);
          } catch (e) { /* ignore */ }
          stack.splice(i, 1);
        }
      }
    }
    stack.push({ id, el, onClose: opts.onClose, singleton: isSingleton });
    el.dataset.panelId = id;
    notify();
    return true;
  }

  function close(id) {
    let removed = false;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].id === id) {
        try {
          if (stack[i].onClose) stack[i].onClose();
          else if (stack[i].el && stack[i].el.parentNode) stack[i].el.parentNode.removeChild(stack[i].el);
        } catch (e) { /* ignore */ }
        stack.splice(i, 1);
        removed = true;
        break;
      }
    }
    if (removed) notify();
    return removed;
  }

  function closeAll() {
    let n = 0;
    for (let i = stack.length - 1; i >= 0; i--) {
      try {
        if (stack[i].onClose) stack[i].onClose();
        else if (stack[i].el && stack[i].el.parentNode) stack[i].el.parentNode.removeChild(stack[i].el);
      } catch (e) { /* ignore */ }
      n++;
    }
    stack.length = 0;
    if (n > 0) notify();
    return n;
  }

  function isOpen(id) {
    return stack.some((s) => s.id === id);
  }

  function isAnyOpen() {
    return stack.length > 0;
  }

  function getOpen() {
    return stack[stack.length - 1] || null;
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function dispose() {
    closeAll();
    listeners.clear();
    panelStack._instance = null;
  }

  panelStack._instance = {
    open, close, closeAll, isOpen, isAnyOpen, getOpen, onChange, dispose,
    _stack: stack
  };
  return panelStack._instance;
}

const panelStack = { _instance: null };

// 便捷:判断当前是否有任何 singleton 面板打开
export function isAnySingletonPanelOpen() {
  const s = getPanelStack();
  return s._stack.some((x) => x.singleton);
}

// 同步注册(sync 上下文;若 stack 尚未加载,异步落空也算 ok 因为 stack 是常驻单例)
// 修复 P1-1 循环依赖: 不再用动态 import('./panel-stack.js') (madge 报告 circular)
// 改为同模块引用 getPanelStack — 已经天然是同一个文件内的 lazy init
export function registerPanel(id, el, onClose) {
  const stack = getPanelStack();
  try {
    if (stack) stack.open(id, el, { onClose });
  } catch (e) { /* ignore */ }
}