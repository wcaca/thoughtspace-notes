/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: createCanvasMode() → { getMode, setMode, is, subscribe, toJSON, fromJSON }
 * [POS]: src/render/canvas-mode.js — SP-1 看板双模式状态机
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 看板双模式:
 *  - background: 背景分区模式(层 × 块的 2D 投影)
 *  - block: 内容块模式(念头/记忆卡片平铺 + 排序轴)
 *
 * 设计原则 (SP-1.P0 / P1):
 *  - 模式是视图决策,不污染 Thought 数据
 *  - 与 observe-mode(cards/kanban/timeline)正交,可任意组合
 *  - 模式切换有订阅机制,UI 可响应
 */

export const CANVAS_MODES = Object.freeze({
  BACKGROUND: 'background',
  BLOCK: 'block'
});

const VALID_MODES = new Set(Object.values(CANVAS_MODES));
const DEFAULT_MODE = CANVAS_MODES.BACKGROUND;

function isValidMode(m) {
  return VALID_MODES.has(m);
}

export function createCanvasMode() {
  let current = DEFAULT_MODE;
  const listeners = new Set();

  function getMode() {
    return current;
  }

  function is(mode) {
    return current === mode;
  }

  function setMode(mode, opts = {}) {
    if (!isValidMode(mode)) return false;
    const prev = current;
    current = mode;
    if (prev === mode && !opts.force) return true;
    for (const fn of listeners) {
      try { fn({ from: prev, to: current, at: Date.now() }); } catch (e) { /* ignore */ }
    }
    return true;
  }

  function subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function toJSON() {
    return { mode: current };
  }

  function fromJSON(data) {
    if (data && isValidMode(data.mode)) current = data.mode;
  }

  function reset() {
    current = DEFAULT_MODE;
    listeners.clear();
  }

  return {
    getMode, is, setMode, subscribe,
    toJSON, fromJSON, reset,
    MODES: CANVAS_MODES
  };
}