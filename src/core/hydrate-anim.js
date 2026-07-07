/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: createHydrateAnim() → { start(now, opts), level(now), shouldSpawnAt(now), isActive(now), dispose }
 * [POS]: src/core 下,启动(冷启 / 二次启动)场景"被看见"的状态机;控制 opacity / scale / emissive / edge fade
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const SPAWN_START_MS = 100;
const SPAWN_DURATION_MS = 1500;
const TEMPERATURE_START_MS = 600;
const TEMPERATURE_DURATION_MS = 1900;
const EDGE_FADE_START_MS = 1200;
const EDGE_FADE_DURATION_MS = 2300;
const TOTAL_DURATION_MS = 3500;

const MIN_SCALE_AT_START = 0.05;
const MAX_SCALE_AT_START = 0.55;

const MIN_OPACITY_AT_START = 0;
const MAX_OPACITY_AT_START = 1;

export function clamp01(x) {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

export function easeOutQuint(t) {
  return 1 - Math.pow(1 - t, 5);
}

export function easeOutCubic(t) {
  const k = 1 - t;
  return 1 - k * k * k;
}

export function createHydrateAnim() {
  let started = false;
  let startedAt = 0;
  let lastLevel = 0;

  function start(now, opts = {}) {
    if (started) return false;
    started = true;
    startedAt = (now != null) ? now : (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return true;
  }

  function isStarted() {
    return started;
  }

  function isActive(now) {
    if (!started) return false;
    return now - startedAt < TOTAL_DURATION_MS;
  }

  function level(now) {
    if (!started) return { spawn: 1, temperature: 1, edge: 1, overall: 1 };
    const since = now - startedAt;

    const spawnRatio = clamp01((since - SPAWN_START_MS) / SPAWN_DURATION_MS);
    const spawn = easeOutQuint(spawnRatio);

    const tempRatio = clamp01((since - TEMPERATURE_START_MS) / TEMPERATURE_DURATION_MS);
    const temperature = easeOutCubic(tempRatio);

    const edgeRatio = clamp01((since - EDGE_FADE_START_MS) / EDGE_FADE_DURATION_MS);
    const edge = easeOutCubic(edgeRatio);

    const overall = Math.min(1, Math.min(spawn, Math.min(temperature, edge)));
    lastLevel = overall;
    return { spawn, temperature, edge, overall };
  }

  function spawnScaleFactor(level) {
    return MIN_SCALE_AT_START + (MAX_SCALE_AT_START - MIN_SCALE_AT_START) * level;
  }

  function spawnOpacityFactor(level) {
    return MIN_OPACITY_AT_START + (MAX_OPACITY_AT_START - MIN_OPACITY_AT_START) * level;
  }

  function temperatureFadeFactor(level) {
    return clamp01(level);
  }

  function edgeOpacityFactor(level) {
    return clamp01(level) * 0.85;
  }

  function getLastLevel() {
    return lastLevel;
  }

  return {
    start,
    isStarted,
    isActive,
    level,
    spawnScaleFactor,
    spawnOpacityFactor,
    temperatureFadeFactor,
    edgeOpacityFactor,
    getLastLevel,
    constants: {
      SPAWN_START_MS,
      SPAWN_DURATION_MS,
      TEMPERATURE_START_MS,
      TEMPERATURE_DURATION_MS,
      EDGE_FADE_START_MS,
      EDGE_FADE_DURATION_MS,
      TOTAL_DURATION_MS
    }
  };
}

export const __test__ = { easeOutCubic, easeOutQuint, clamp01 };
