/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: createSortHistory() → { recordOrder, applyAxis, activate, deactivate, getCurrentOrder, getHistory, toJSON, fromJSON }
 * [POS]: src/core/sort-axis.js — SP-1 排序哲学:多轴并列 + 拖动记录 = 信念轨迹
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计原则 (SP-1.P0 不压制信念排序):
 *  - 排序不强制预设;默认按时间(最弱信号)
 *  - 拖动记录为 manualOrder,**不被后续覆盖**
 *  - 排序历史 = 信念轨迹(可查看,不可改)
 *  - 多轴并列(用户激活多个轴,所有都被记录)
 *
 * 轴定义:
 *  - time: 按 createdAt 排序(默认)
 *  - heat: 按 temperature 排序
 *  - volume: 按 mass/volume 排序
 *  - manual: 按用户拖动顺序(不可覆盖)
 *  - lastInteraction: 按 lastInteractionAt
 *
 * history 结构 (toJSON):
 *  {
 *    manualOrder: [{ order: thoughtId[], at: timestamp }, ...],
 *    activeAxes: [axisKey, ...],
 *    currentAxis: axisKey,
 *    evolution: [{ timestamp, currentAxis, manualOrder, activeAxes }]
 *  }
 */

export const SORT_AXES = Object.freeze({
  TIME: 'time',
  HEAT: 'heat',
  VOLUME: 'volume',
  MANUAL: 'manual',
  LAST_INTERACTION: 'lastInteraction'
});

export const SORT_AXIS_LABELS = Object.freeze({
  time: '时间',
  heat: '热度',
  volume: '体积',
  manual: '手动',
  lastInteraction: '最近操作'
});

const VALID_AXIS_KEYS = Object.values(SORT_AXES);
const DEFAULT_AXIS = SORT_AXES.TIME;
const MAX_HISTORY = 200;
const MIN_RECORD_INTERVAL_MS = 60_000;

function isValidAxis(key) {
  return VALID_AXIS_KEYS.includes(key);
}

function compareByKey(a, b, key) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  switch (key) {
    case SORT_AXES.TIME:
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    case SORT_AXES.HEAT:
      return (a.temperature ?? 0) - (b.temperature ?? 0);
    case SORT_AXES.VOLUME:
      return (a.mass ?? 0) - (b.mass ?? 0);
    case SORT_AXES.LAST_INTERACTION:
      return (a.lastInteractionAt ?? 0) - (b.lastInteractionAt ?? 0);
    case SORT_AXES.MANUAL:
      return 0;
    default:
      return 0;
  }
}

export function applyAxis(thoughts, axisKey, direction = 'desc', manualOrder = []) {
  if (!Array.isArray(thoughts)) return [];
  const key = isValidAxis(axisKey) ? axisKey : DEFAULT_AXIS;
  const arr = thoughts.slice();
  if (key === SORT_AXES.MANUAL) {
    const indexOf = new Map();
    for (let i = 0; i < manualOrder.length; i++) {
      indexOf.set(manualOrder[i], i);
    }
    arr.sort((a, b) => {
      const ai = indexOf.has(a.id) ? indexOf.get(a.id) : Infinity;
      const bi = indexOf.has(b.id) ? indexOf.get(b.id) : Infinity;
      return ai - bi;
    });
    return arr;
  }
  arr.sort((a, b) => compareByKey(a, b, key));
  if (direction === 'desc') arr.reverse();
  return arr;
}

export function createSortHistory() {
  let currentAxis = DEFAULT_AXIS;
  let activeAxes = [DEFAULT_AXIS];
  let manualOrder = [];
  let evolution = [];
  let lastRecordAt = 0;

  function recordEvolution() {
    const now = Date.now();
    if (now - lastRecordAt < MIN_RECORD_INTERVAL_MS) return;
    lastRecordAt = now;
    evolution.push({
      timestamp: now,
      currentAxis,
      activeAxes: activeAxes.slice(),
      manualOrder: manualOrder.slice()
    });
    if (evolution.length > MAX_HISTORY) {
      evolution = evolution.slice(-MAX_HISTORY);
    }
  }

  function activate(axisKey) {
    if (!isValidAxis(axisKey)) return false;
    if (!activeAxes.includes(axisKey)) activeAxes.push(axisKey);
    return true;
  }

  function deactivate(axisKey) {
    const idx = activeAxes.indexOf(axisKey);
    if (idx < 0) return false;
    activeAxes.splice(idx, 1);
    if (currentAxis === axisKey) {
      currentAxis = activeAxes[0] || DEFAULT_AXIS;
    }
    return true;
  }

  function setCurrentAxis(axisKey) {
    if (!isValidAxis(axisKey)) return false;
    currentAxis = axisKey;
    if (!activeAxes.includes(axisKey)) activeAxes.push(axisKey);
    recordEvolution();
    return true;
  }

  function recordOrder(newOrder) {
  if (!Array.isArray(newOrder)) return false;
  manualOrder = newOrder.slice();
  if (!activeAxes.includes(SORT_AXES.MANUAL)) activeAxes.push(SORT_AXES.MANUAL);
  currentAxis = SORT_AXES.MANUAL;
  // ⚠️ 易错: 副作用 = currentAxis 切到 manual,UI 需重读
  //   详见 [docs/notes/sp1/pitfalls.md#T1.4-recordOrder-side-effect]
  // 📋 SP-1.P0 最高原则: manualOrder 一旦记录,不被覆盖,= 信念轨迹
  //   详见 [docs/notes/sp1/decisions.md#why-sort-axis-default-time]
  recordEvolution();
  return true;
}

  function getCurrentOrder(thoughts) {
    return applyAxis(thoughts || [], currentAxis, 'desc', manualOrder);
  }

  function getManualOrder() {
    return manualOrder.slice();
  }

  function getCurrentAxis() {
    return currentAxis;
  }

  function getActiveAxes() {
    return activeAxes.slice();
  }

  function getHistory() {
    return evolution.slice();
  }

  function clearManualOrder() {
    manualOrder = [];
    if (currentAxis === SORT_AXES.MANUAL) currentAxis = DEFAULT_AXIS;
    recordEvolution();
  }

  function toJSON() {
    return {
      currentAxis,
      activeAxes: activeAxes.slice(),
      manualOrder: manualOrder.slice(),
      evolution: evolution.slice()
    };
  }

  function fromJSON(data) {
    if (!data || typeof data !== 'object') return;
    if (isValidAxis(data.currentAxis)) currentAxis = data.currentAxis;
    if (Array.isArray(data.activeAxes)) {
      activeAxes = data.activeAxes.filter(isValidAxis);
      if (activeAxes.length === 0) activeAxes = [DEFAULT_AXIS];
    }
    if (Array.isArray(data.manualOrder)) manualOrder = data.manualOrder.slice();
    if (Array.isArray(data.evolution)) evolution = data.evolution.slice();
  }

  function dispose() {
    currentAxis = DEFAULT_AXIS;
    activeAxes = [DEFAULT_AXIS];
    manualOrder = [];
    evolution = [];
    lastRecordAt = 0;
  }

  return {
    activate, deactivate, setCurrentAxis,
    recordOrder, getCurrentOrder, getManualOrder,
    getCurrentAxis, getActiveAxes, getHistory,
    clearManualOrder,
    toJSON, fromJSON, dispose,
    applyAxis
  };
}