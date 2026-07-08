/**
 * [INPUT]: SceneStateStore的三层状态（yjsState/transientState/renderCache）
 * [OUTPUT]: SnapshotStore类 — 时间线快照管理（环形缓冲+关键事件强制快照）
 * [POS]: src/v2/core/state-snapshot.js,L1领域核心层,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论.md §1.3 第3层·时间线快照
 *   - 每100ms或关键事件拍摄快照，支持时间旅行调试
 *   - 环形缓冲保留最近1000个（约100秒）
 *   - 关键事件（用户操作、Yjs变更、错误）强制快照
 *
 * @note(s1, decision, ring-buffer, since:2026-07-08)
 *   S1-B.1.15: 排查基础第3层，SceneStateStore的辅助组件。
 *   spatial-query.js(1.18)依赖此组件的timeline查询能力。
 *   生产环境可减小maxSize控制内存。
 */

// ===== 快照触发类型 =====

/**
 * 快照触发类型枚举
 * @enum {string}
 * @property {string} TIMER - 定时触发（每intervalMs毫秒）
 * @property {string} USER_ACTION - 用户操作触发（关键事件，强制快照）
 * @property {string} YJS_CHANGE - Yjs变更触发（关键事件，强制快照）
 * @property {string} ERROR - 错误触发（关键事件，强制快照）
 * @property {string} MANUAL - 手动触发
 */
export const SnapshotTrigger = Object.freeze({
  TIMER: 'timer',
  USER_ACTION: 'user-action',
  YJS_CHANGE: 'yjs-change',
  ERROR: 'error',
  MANUAL: 'manual',
});

/** 关键事件触发类型集合（强制快照，不受intervalMs约束） */
const KEY_EVENT_TRIGGERS = new Set([
  SnapshotTrigger.USER_ACTION,
  SnapshotTrigger.YJS_CHANGE,
  SnapshotTrigger.ERROR,
]);

// ===== 内部辅助函数 =====

/**
 * 提取实体状态摘要（只存关键字段，控制内存）
 * 仅保留: id / type / layerId / position / screenPosition
 * @param {Object} entity - 实体完整状态
 * @returns {Object|null} 实体状态摘要
 */
function summarizeEntity(entity) {
  if (!entity || typeof entity !== 'object') return null;
  const summary = {};
  if (entity.id !== undefined) summary.id = entity.id;
  if (entity.type !== undefined) summary.type = entity.type;
  if (entity.layerId !== undefined) summary.layerId = entity.layerId;
  if (entity.position !== undefined) summary.position = entity.position;
  if (entity.screenPosition !== undefined) summary.screenPosition = entity.screenPosition;
  return summary;
}

/**
 * 提取所有实体的状态摘要（Map → 新Map，只存关键字段）
 * @param {Map<string, Object>|Object|null} entities - 实体集合
 * @returns {Map<string, Object>} entityId → EntityStateSummary
 */
function summarizeEntities(entities) {
  const result = new Map();
  if (!entities) return result;
  if (entities instanceof Map) {
    for (const [id, entity] of entities) {
      result.set(id, summarizeEntity(entity));
    }
  } else if (typeof entities === 'object') {
    for (const [id, entity] of Object.entries(entities)) {
      result.set(id, summarizeEntity(entity));
    }
  }
  return result;
}

/**
 * 浅比较两个值是否相等（支持基本类型与可JSON化结构）
 * @param {*} a
 * @param {*} b
 * @returns {boolean}
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * 序列化快照为可JSON化对象（Map转[key,value]数组）
 * @param {Object} snap - 快照
 * @returns {Object|null} 可JSON化的快照
 */
function serializeSnapshot(snap) {
  if (!snap) return null;
  const entities = snap.entities instanceof Map
    ? Array.from(snap.entities.entries())
    : snap.entities;
  return {
    timestamp: snap.timestamp,
    frame: snap.frame,
    trigger: snap.trigger || SnapshotTrigger.MANUAL,
    view: snap.view ? { ...snap.view } : null,
    entities,
    performance: snap.performance ? { ...snap.performance } : null,
    userAction: snap.userAction ? { ...snap.userAction } : null,
    yjsChanges: snap.yjsChanges
      ? (Array.isArray(snap.yjsChanges) ? snap.yjsChanges.map((c) => (c && typeof c === 'object' ? { ...c } : c)) : snap.yjsChanges)
      : null,
    changeChainHead: snap.changeChainHead || null,
  };
}

// ===== SnapshotStore 类 =====

/**
 * 时间线快照管理 —— 排查基础第3层（排查方法论.md §1.3）
 *
 * 环形缓冲存储时间线快照，支持:
 *   - 定时快照（每 intervalMs 毫秒）
 *   - 关键事件强制快照（用户操作/Yjs变更/错误）
 *   - 时间旅行调试（按时间戳/帧号查询）
 *   - 快照差异分析（diff）
 *   - 范围导出（供AI分析）
 *
 * 内存控制:
 *   EntityStateSummary 只存关键字段（id/type/layerId/position/screenPosition）。
 *   生产环境可减小 maxSize 控制内存。
 *
 * @example
 * const store = new SnapshotStore({ maxSize: 1000, intervalMs: 100 });
 * store.capture({ view: {...}, entities: entityMap, performance: {...} });
 * store.captureIfNecessary(elapsedMs, SnapshotTrigger.USER_ACTION, snap);
 * const latest = store.getLatest();
 * const d = store.diff(oldSnap, newSnap);
 */
export class SnapshotStore {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSize=1000] - 环形缓冲容量（保留最近N个快照）
   * @param {number} [options.intervalMs=100] - 定时快照间隔（毫秒）
   * @param {string} [options.environment='development'] - 运行环境（development/production）
   */
  constructor({ maxSize = 1000, intervalMs = 100, environment = 'development' } = {}) {
    const size = Math.max(1, Math.floor(Number(maxSize) || 1000));

    /** @type {number} 环形缓冲容量 */
    this._maxSize = size;
    /** @type {number} 定时快照间隔（毫秒） */
    this._intervalMs = Math.max(0, Number(intervalMs) || 0);
    /** @type {string} 运行环境 */
    this._environment = environment;

    // ===== 环形缓冲（定长数组）=====
    /** @type {Array<Object|null>} 快照环形缓冲 */
    this._buffer = new Array(size).fill(null);
    /** @type {number} 下一个写入位置 */
    this._head = 0;
    /** @type {number} 当前快照数量 */
    this._count = 0;

    // ===== 统计 =====
    /** @type {number} 自增帧号计数器（timestamp未提供时使用） */
    this._frameCounter = 0;
    /** @type {number} 累计捕获数量 */
    this._totalCaptured = 0;
    /** @type {number} 被覆盖丢弃的数量 */
    this._droppedCount = 0;

    /** @type {Object<string, number>} 各触发类型的捕获次数 */
    this._triggerStats = {
      [SnapshotTrigger.TIMER]: 0,
      [SnapshotTrigger.USER_ACTION]: 0,
      [SnapshotTrigger.YJS_CHANGE]: 0,
      [SnapshotTrigger.ERROR]: 0,
      [SnapshotTrigger.MANUAL]: 0,
    };
  }

  // ===== 内部辅助 =====

  /**
   * 环形缓冲中最旧快照的索引
   * @returns {number}
   * @private
   */
  _oldestIndex() {
    // 缓冲未满: 最旧在索引0；满后: 最旧在head位置（head指向下一个要覆盖的位置）
    return this._count < this._maxSize ? 0 : this._head;
  }

  /**
   * 环形缓冲中最新快照的索引
   * @returns {number}
   * @private
   */
  _newestIndex() {
    // 最新在head的前一个位置
    return (this._head - 1 + this._maxSize) % this._maxSize;
  }

  /**
   * 按时间顺序（旧→新）遍历快照
   * @param {(snap: Object, i: number) => void} callback
   * @private
   */
  _forEach(callback) {
    if (this._count === 0) return;
    const start = this._oldestIndex();
    for (let i = 0; i < this._count; i++) {
      const idx = (start + i) % this._maxSize;
      const snap = this._buffer[idx];
      if (snap !== null) callback(snap, i);
    }
  }

  // ===== 捕获接口 =====

  /**
   * 主动捕获快照
   *
   * 自动填充:
   *   - timestamp（如未提供，使用 Date.now()）
   *   - frame（如未提供，使用自增计数器）
   *
   * 内存控制:
   *   entities 会被提取为 EntityStateSummary（只存关键字段）
   *
   * @param {Object} snapshot - 快照数据
   * @param {Object} [snapshot.view] - 视角状态
   * @param {Map|Object} [snapshot.entities] - 实体集合
   * @param {Object} [snapshot.performance] - 性能指标
   * @param {Object|null} [snapshot.userAction] - 用户操作
   * @param {Array|null} [snapshot.yjsChanges] - Yjs变更
   * @param {string|null} [snapshot.changeChainHead] - 变更链头
   * @param {number} [snapshot.timestamp] - 时间戳（不传则自动填充）
   * @param {number} [snapshot.frame] - 帧号（不传则自动填充）
   * @param {string} [trigger=SnapshotTrigger.MANUAL] - 触发类型
   * @returns {Object} 已存储的快照（含自动填充字段与trigger）
   */
  capture(snapshot, trigger = SnapshotTrigger.MANUAL) {
    if (!snapshot || typeof snapshot !== 'object') {
      throw new TypeError('capture: snapshot必须是对象');
    }

    // 浅拷贝，避免外部修改污染缓冲
    const snap = { ...snapshot };

    // 自动填充 timestamp
    if (snap.timestamp === undefined || snap.timestamp === null) {
      snap.timestamp = Date.now();
    }

    // 自动填充 frame（自增计数器）
    if (snap.frame === undefined || snap.frame === null) {
      snap.frame = this._frameCounter++;
    } else {
      // 同步帧计数器，避免后续自增产生回退
      const f = Number(snap.frame);
      if (Number.isFinite(f) && f >= this._frameCounter) {
        this._frameCounter = f + 1;
      }
    }

    // 记录触发类型
    snap.trigger = trigger;

    // 实体状态摘要提取（只存关键字段，控制内存）
    snap.entities = summarizeEntities(snap.entities);

    // 写入环形缓冲（覆盖最旧）
    this._buffer[this._head] = snap;
    this._head = (this._head + 1) % this._maxSize;

    if (this._count < this._maxSize) {
      this._count++;
    } else {
      this._droppedCount++;
    }

    // 统计
    this._totalCaptured++;
    this._triggerStats[trigger] = (this._triggerStats[trigger] || 0) + 1;

    return snap;
  }

  /**
   * 按需捕获快照（时间间隔或关键事件触发）
   *
   * 触发条件（满足任一即捕获）:
   *   1. trigger 为关键事件（USER_ACTION / YJS_CHANGE / ERROR）—— 强制快照
   *   2. elapsedMs >= intervalMs —— 定时快照
   *
   * @param {number} elapsedMs - 距上次快照的毫秒数
   * @param {string} trigger - 触发类型（SnapshotTrigger枚举）
   * @param {Object} snapshot - 快照数据
   * @returns {Object|null} 已存储的快照（未触发则返回null）
   */
  captureIfNecessary(elapsedMs, trigger, snapshot) {
    const isKeyEvent = KEY_EVENT_TRIGGERS.has(trigger);
    const isTimeUp = elapsedMs >= this._intervalMs;

    if (isKeyEvent || isTimeUp) {
      return this.capture(snapshot, trigger);
    }
    return null;
  }

  // ===== 查询接口 =====

  /**
   * 按时间戳查找最接近的快照
   * @param {number} timestamp - 目标时间戳
   * @returns {Object|null} 最接近的快照（缓冲为空则null）
   */
  getSnapshot(timestamp) {
    if (this._count === 0) return null;
    let best = null;
    let bestDiff = Infinity;
    this._forEach((snap) => {
      const d = Math.abs(snap.timestamp - timestamp);
      if (d < bestDiff) {
        bestDiff = d;
        best = snap;
      }
    });
    return best;
  }

  /**
   * 按帧号查找快照（精确匹配优先，否则返回最接近的）
   * @param {number} frame - 目标帧号
   * @returns {Object|null} 匹配的快照（缓冲为空则null）
   */
  getSnapshotByFrame(frame) {
    if (this._count === 0) return null;
    let exact = null;
    let closest = null;
    let closestDiff = Infinity;
    this._forEach((snap) => {
      if (snap.frame === frame) {
        exact = snap;
      } else {
        const d = Math.abs(snap.frame - frame);
        if (d < closestDiff) {
          closestDiff = d;
          closest = snap;
        }
      }
    });
    return exact || closest;
  }

  /**
   * 获取时间范围内的所有快照（按时间升序）
   * @param {number} t1 - 起始时间戳（含）
   * @param {number} t2 - 结束时间戳（含）
   * @returns {Array<Object>} 范围内的快照列表
   */
  getRange(t1, t2) {
    const result = [];
    if (this._count === 0) return result;
    const lo = Math.min(t1, t2);
    const hi = Math.max(t1, t2);
    this._forEach((snap) => {
      if (snap.timestamp >= lo && snap.timestamp <= hi) {
        result.push(snap);
      }
    });
    return result;
  }

  /**
   * 获取最新的快照
   * @returns {Object|null} 最新快照（缓冲为空则null）
   */
  getLatest() {
    if (this._count === 0) return null;
    return this._buffer[this._newestIndex()];
  }

  /**
   * 获取最旧的快照
   * @returns {Object|null} 最旧快照（缓冲为空则null）
   */
  getOldest() {
    if (this._count === 0) return null;
    return this._buffer[this._oldestIndex()];
  }

  // ===== 分析接口 =====

  /**
   * 比较两个快照的差异
   * @param {Object} s1 - 旧快照
   * @param {Object} s2 - 新快照
   * @returns {Object} 差异对象
   * @returns {string[]} returns.addedEntities - 新增的实体ID列表（s2有s1无）
   * @returns {string[]} returns.removedEntities - 移除的实体ID列表（s1有s2无）
   * @returns {string[]} returns.changedEntities - 变更的实体ID列表（两者都有但内容不同）
   * @returns {boolean} returns.viewChanged - 视角是否变更
   * @returns {Object} returns.performanceDiff - 性能指标差异（key → {from, to}）
   */
  diff(s1, s2) {
    const empty = {
      addedEntities: [],
      removedEntities: [],
      changedEntities: [],
      viewChanged: false,
      performanceDiff: {},
    };
    if (!s1 || !s2) return empty;

    // 实体差异
    const addedEntities = [];
    const removedEntities = [];
    const changedEntities = [];

    const e1 = s1.entities instanceof Map ? s1.entities : new Map();
    const e2 = s2.entities instanceof Map ? s2.entities : new Map();

    const keys1 = new Set(e1.keys());
    const keys2 = new Set(e2.keys());

    // 新增：在s2但不在s1
    for (const k of keys2) {
      if (!keys1.has(k)) addedEntities.push(k);
    }
    // 移除：在s1但不在s2
    for (const k of keys1) {
      if (!keys2.has(k)) removedEntities.push(k);
    }
    // 变更：两者都有但内容不同
    for (const k of keys1) {
      if (keys2.has(k)) {
        if (!shallowEqual(e1.get(k), e2.get(k))) {
          changedEntities.push(k);
        }
      }
    }

    // 视角变更
    const viewChanged = !shallowEqual(s1.view, s2.view);

    // 性能差异
    const p1 = s1.performance || {};
    const p2 = s2.performance || {};
    const performanceDiff = {};
    const perfKeys = new Set([...Object.keys(p1), ...Object.keys(p2)]);
    for (const k of perfKeys) {
      if (p1[k] !== p2[k]) {
        performanceDiff[k] = { from: p1[k], to: p2[k] };
      }
    }

    return { addedEntities, removedEntities, changedEntities, viewChanged, performanceDiff };
  }

  // ===== 导出接口 =====

  /**
   * 导出时间范围内的快照为JSON数组（供AI分析）
   * Map会被转换为[key,value]数组以保证可JSON化
   * @param {number} t1 - 起始时间戳
   * @param {number} t2 - 结束时间戳
   * @returns {Array<Object>} 可JSON化的快照数组（按时间升序）
   */
  exportRange(t1, t2) {
    return this.getRange(t1, t2).map(serializeSnapshot);
  }

  /**
   * 导出最近n个快照为JSON数组（供AI分析）
   * @param {number} n - 导出数量
   * @returns {Array<Object>} 可JSON化的快照数组（按时间升序）
   */
  exportLatest(n) {
    const result = [];
    if (this._count === 0 || n <= 0) return result;
    const count = Math.min(Math.floor(n), this._count);
    // 从最新向前取 count 个，i 从大到小保证升序写入
    for (let i = count - 1; i >= 0; i--) {
      const idx = (((this._head - 1 - i) % this._maxSize) + this._maxSize) % this._maxSize;
      const snap = this._buffer[idx];
      if (snap !== null) {
        result.push(serializeSnapshot(snap));
      }
    }
    return result;
  }

  // ===== 统计接口 =====

  /**
   * 获取快照存储统计
   * @returns {Object} 统计信息
   * @returns {number} returns.currentSize - 当前快照数量
   * @returns {number} returns.maxSize - 缓冲容量
   * @returns {number|null} returns.oldestTimestamp - 最旧快照时间戳
   * @returns {number|null} returns.latestTimestamp - 最新快照时间戳
   * @returns {number} returns.totalCaptured - 累计捕获数量
   * @returns {number} returns.droppedCount - 被覆盖丢弃数量
   */
  getStats() {
    let oldestTimestamp = null;
    let latestTimestamp = null;
    if (this._count > 0) {
      const oldest = this._buffer[this._oldestIndex()];
      const latest = this._buffer[this._newestIndex()];
      if (oldest) oldestTimestamp = oldest.timestamp;
      if (latest) latestTimestamp = latest.timestamp;
    }
    return {
      currentSize: this._count,
      maxSize: this._maxSize,
      oldestTimestamp,
      latestTimestamp,
      totalCaptured: this._totalCaptured,
      droppedCount: this._droppedCount,
    };
  }

  /**
   * 获取摘要信息（用于console调试）
   * @returns {Object} 摘要信息（含统计、环境、触发类型分布）
   */
  getSummary() {
    const stats = this.getStats();
    return {
      type: 'SnapshotStore',
      environment: this._environment,
      ...stats,
      intervalMs: this._intervalMs,
      triggerStats: { ...this._triggerStats },
    };
  }

  // ===== 工具接口 =====

  /**
   * 清空快照缓冲（统计计数器保留，便于追踪生命周期总量）
   */
  clear() {
    this._buffer = new Array(this._maxSize).fill(null);
    this._head = 0;
    this._count = 0;
  }
}

export default SnapshotStore;
