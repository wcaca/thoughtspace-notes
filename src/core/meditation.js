/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: createMeditationState() → { enter(now), exit(now), isActive(), level(now), fade, decorationGain }
 * [POS]: src/core 下,冥想模式状态机 — 提供背景饱和度、脉冲减弱、相机阻尼等数值
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const ENTRY_WINDOW_MS = 800;
const EXIT_WINDOW_MS = 400;
const LEVEL_FLOOR = 0;

export function createMeditationState() {
  let active = false;
  let enteredAt = 0;
  let exitedAt = 0;

  function enter(now) {
    if (active) return false;
    active = true;
    enteredAt = now;
    return true;
  }

  function exit(now) {
    if (!active) return false;
    active = false;
    exitedAt = now;
    return true;
  }

  function isActive() {
    return active;
  }

  function level(now) {
    if (active) {
      const since = now - enteredAt;
      if (since <= 0) return 0;
      const ratio = Math.min(1, since / ENTRY_WINDOW_MS);
      return easeOut(ratio);
    }
    if (exitedAt > 0) {
      const since = now - exitedAt;
      if (since >= EXIT_WINDOW_MS) return LEVEL_FLOOR;
      const ratio = since / EXIT_WINDOW_MS;
      return 1 - easeIn(ratio);
    }
    return LEVEL_FLOOR;
  }

  function saturationFactor(level) {
    return 1 - 0.45 * level;
  }

  function pulseFactor(level) {
    return 1 - 0.7 * level;
  }

  function hueShift(level) {
    return -10 * level;
  }

  function decorationGain(level) {
    return 0.4 + 0.6 * (1 - level);
  }

  return { enter, exit, isActive, level, saturationFactor, pulseFactor, hueShift, decorationGain };
}

function easeIn(t) {
  return t * t * (3 - 2 * t);
}

function easeOut(t) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
