/**
 * [INPUT]: 用户操作（ActionRouter）+ Yjs变更 + 动画/系统事件
 * [OUTPUT]: StateChangeChain类 — 状态变更链（causedBy/causedChanges双向追溯）
 * [POS]: src/v2/core/state-change-chain.js,L1领域核心层,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论.md §1.4 第4层·状态变更链
 *   - 每次状态变更记录完整因果关系
 *   - causedBy向上追溯根因，causedChanges向下追溯影响
 *   - 形成有向无环图（DAG），支持任意变更的因果分析
 *
 * @note(s1, decision, causal-dag, since:2026-07-08)
 *   S1-B.1.16: 排查基础第4层，SceneStateStore的辅助组件。
 *   diagnostic-engine.js(1.17)依赖此组件进行根因分析。
 *   spatial-query.js(1.18)依赖此组件的causedBy查询能力。
 */

/**
 * 变更来源类型枚举
 */
export const ChangeSourceType = Object.freeze({
  USER_ACTION: 'user-action',
  YJS_SYNC: 'yjs-sync',
  ANIMATION: 'animation',
  SYSTEM: 'system',
});

/**
 * 状态变更链 —— 排查基础第4层组件
 *
 * 记录每次状态变更的完整因果关系，形成有向无环图（DAG）：
 *   - causedBy: 指向触发本变更的父变更id（null表示根变更）
 *   - causedChanges: 本变更直接导致的子变更id列表
 *
 * 支持：
 *   - 双向追溯（向上找根因，向下找影响）
 *   - 多维查询（组件/来源类型/时间范围）
 *   - 分析（统计/热点/环检测）
 *   - 导出（因果链/时间范围）
 */
export class StateChangeChain {
  constructor() {
    /** @type {Map<string, StateChangeRecord>} 变更记录存储 */
    this._records = new Map();
    /** @type {number} id计数器 */
    this._counter = 0;
  }

  /**
   * 生成唯一变更id
   * @returns {string}
   * @private
   */
  _generateId() {
    return 'c' + Date.now() + '-' + (this._counter++);
  }

  /**
   * 规范化source对象（填充默认值）
   * @param {Object} [source]
   * @returns {Object}
   * @private
   */
  _normalizeSource(source) {
    return {
      type: (source && source.type) || ChangeSourceType.SYSTEM,
      action: (source && source.action) || null,
      component: (source && source.component) || '',
      stackTrace: (source && source.stackTrace) || '',
    };
  }

  /**
   * 规范化effects对象（填充默认值）
   * @param {Object} [effects]
   * @returns {Object}
   * @private
   */
  _normalizeEffects(effects) {
    return {
      yjsUpdates: (effects && Array.isArray(effects.yjsUpdates)) ? effects.yjsUpdates : [],
      transientUpdates: (effects && Array.isArray(effects.transientUpdates)) ? effects.transientUpdates : [],
      cacheInvalidations: (effects && Array.isArray(effects.cacheInvalidations)) ? effects.cacheInvalidations : [],
      renderRequests: (effects && Array.isArray(effects.renderRequests)) ? effects.renderRequests : [],
    };
  }

  /**
   * 记录一个变更（自动填充id/timestamp，并更新父变更的causedChanges）
   * @param {Partial<StateChangeRecord>} change - 变更记录（id/timestamp可省略）
   * @returns {StateChangeRecord} 记录完成的变更（含生成的id/timestamp）
   */
  record(change) {
    const id = change.id || this._generateId();
    const timestamp = change.timestamp || Date.now();
    const record = {
      id,
      timestamp,
      source: this._normalizeSource(change.source),
      effects: this._normalizeEffects(change.effects),
      causedChanges: Array.isArray(change.causedChanges) ? [...change.causedChanges] : [],
      causedBy: change.causedBy || null,
      beforeState: change.beforeState || {},
      afterState: change.afterState || {},
    };
    this._records.set(id, record);
    // 自动更新父变更的causedChanges
    if (record.causedBy) {
      const parent = this._records.get(record.causedBy);
      if (parent && !parent.causedChanges.includes(id)) {
        parent.causedChanges.push(id);
      }
    }
    return record;
  }

  /**
   * 记录根变更（causedBy=null）
   * @param {Object} source - 来源信息 {type, action, component, stackTrace}
   * @param {Object} effects - 影响信息 {yjsUpdates, transientUpdates, cacheInvalidations, renderRequests}
   * @param {Object} beforeState - 变更前状态快照
   * @param {Object} afterState - 变更后状态快照
   * @returns {StateChangeRecord}
   */
  recordRoot(source, effects, beforeState, afterState) {
    return this.record({
      source,
      effects,
      beforeState,
      afterState,
      causedBy: null,
    });
  }

  /**
   * 记录子变更（causedBy=parentId，自动加入父变更的causedChanges）
   * @param {string} parentId - 父变更id
   * @param {Object} source - 来源信息
   * @param {Object} effects - 影响信息
   * @param {Object} beforeState - 变更前状态
   * @param {Object} afterState - 变更后状态
   * @returns {StateChangeRecord}
   */
  recordChild(parentId, source, effects, beforeState, afterState) {
    return this.record({
      source,
      effects,
      beforeState,
      afterState,
      causedBy: parentId,
    });
  }

  /**
   * 获取单个变更
   * @param {string} changeId
   * @returns {StateChangeRecord|undefined}
   */
  getChange(changeId) {
    return this._records.get(changeId);
  }

  /**
   * 向上追溯因果链（causedBy链）
   * @param {string} changeId - 起始变更id
   * @returns {StateChangeRecord[]} [change, parent, grandparent, ...] 到根
   */
  traceUp(changeId) {
    const chain = [];
    const visited = new Set();
    let current = this._records.get(changeId);
    while (current) {
      if (visited.has(current.id)) break; // 防御环
      visited.add(current.id);
      chain.push(current);
      current = current.causedBy ? this._records.get(current.causedBy) : undefined;
    }
    return chain;
  }

  /**
   * 向下追溯影响链（causedChanges树）
   * @param {string} changeId - 起始变更id
   * @param {number} [maxDepth=10] - 最大深度
   * @returns {{change: StateChangeRecord, children: Array}} 树结构
   */
  traceDown(changeId, maxDepth = 10) {
    const build = (id, depth, visited) => {
      const change = this._records.get(id);
      if (!change) return null;
      if (visited.has(id)) return null; // 防御环
      visited.add(id);
      const node = { change, children: [] };
      if (depth < maxDepth && change.causedChanges) {
        for (const childId of change.causedChanges) {
          const child = build(childId, depth + 1, visited);
          if (child) node.children.push(child);
        }
      }
      return node;
    };
    return build(changeId, 0, new Set()) || { change: null, children: [] };
  }

  /**
   * 找到变更链的根
   * @param {string} changeId
   * @returns {StateChangeRecord|undefined}
   */
  getRoot(changeId) {
    const chain = this.traceUp(changeId);
    return chain.length > 0 ? chain[chain.length - 1] : undefined;
  }

  /**
   * 获取直接子变更
   * @param {string} changeId
   * @returns {StateChangeRecord[]}
   */
  getChildren(changeId) {
    const change = this._records.get(changeId);
    if (!change || !change.causedChanges) return [];
    return change.causedChanges
      .map(id => this._records.get(id))
      .filter(c => c !== undefined);
  }

  /**
   * 两个变更之间的最短路径（BFS，双向遍历causedBy+causedChanges）
   * @param {string} changeId1
   * @param {string} changeId2
   * @returns {StateChangeRecord[]|null} 路径数组（从id1到id2），找不到返回null
   */
  getPath(changeId1, changeId2) {
    if (!this._records.has(changeId1) || !this._records.has(changeId2)) return null;
    if (changeId1 === changeId2) return [this._records.get(changeId1)];

    const getNeighbors = (id) => {
      const change = this._records.get(id);
      if (!change) return [];
      const neighbors = [];
      if (change.causedBy) neighbors.push(change.causedBy);
      if (change.causedChanges) neighbors.push(...change.causedChanges);
      return neighbors;
    };

    const queue = [[changeId1]];
    const visited = new Set([changeId1]);
    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      for (const next of getNeighbors(current)) {
        if (visited.has(next)) continue;
        if (!this._records.has(next)) continue;
        visited.add(next);
        const newPath = [...path, next];
        if (next === changeId2) {
          return newPath.map(id => this._records.get(id));
        }
        queue.push(newPath);
      }
    }
    return null;
  }

  /**
   * 按触发组件查询
   * @param {string} component
   * @returns {StateChangeRecord[]}
   */
  getByComponent(component) {
    const result = [];
    for (const change of this._records.values()) {
      if (change.source && change.source.component === component) result.push(change);
    }
    return result;
  }

  /**
   * 按来源类型查询（user-action/yjs-sync/animation/system）
   * @param {string} sourceType
   * @returns {StateChangeRecord[]}
   */
  getBySourceType(sourceType) {
    const result = [];
    for (const change of this._records.values()) {
      if (change.source && change.source.type === sourceType) result.push(change);
    }
    return result;
  }

  /**
   * 按时间范围查询
   * @param {number} t1 - 起始时间戳
   * @param {number} t2 - 结束时间戳
   * @returns {StateChangeRecord[]} 按时间升序
   */
  getByTimeRange(t1, t2) {
    const result = [];
    for (const change of this._records.values()) {
      if (change.timestamp >= t1 && change.timestamp <= t2) result.push(change);
    }
    return result.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 最近n个变更
   * @param {number} n
   * @returns {StateChangeRecord[]} 按时间降序
   */
  getRecent(n) {
    const all = Array.from(this._records.values());
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, n);
  }

  /**
   * 统计信息
   * @returns {{total: number, bySourceType: Object<string, number>, averageChainLength: number, maxChainLength: number, rootCount: number}}
   */
  getStats() {
    const total = this._records.size;
    const bySourceType = {};
    let totalChainLength = 0;
    let maxChainLength = 0;
    let rootCount = 0;
    for (const change of this._records.values()) {
      const type = change.source ? change.source.type : 'unknown';
      bySourceType[type] = (bySourceType[type] || 0) + 1;
      const chain = this.traceUp(change.id);
      totalChainLength += chain.length;
      if (chain.length > maxChainLength) maxChainLength = chain.length;
      if (!change.causedBy) rootCount++;
    }
    return {
      total,
      bySourceType,
      averageChainLength: total > 0 ? totalChainLength / total : 0,
      maxChainLength,
      rootCount,
    };
  }

  /**
   * 变更密集的时间点（可能有性能问题）
   * @param {number} [windowMs=1000] - 时间窗口大小（毫秒）
   * @returns {Array<{windowStart: number, count: number}>} 按密集度降序
   */
  getHotspots(windowMs = 1000) {
    if (this._records.size === 0) return [];
    const all = Array.from(this._records.values()).sort((a, b) => a.timestamp - b.timestamp);
    const hotspots = [];
    let windowStart = all[0].timestamp;
    let count = 0;
    for (const change of all) {
      if (change.timestamp - windowStart <= windowMs) {
        count++;
      } else {
        if (count > 1) hotspots.push({ windowStart, count });
        windowStart = change.timestamp;
        count = 1;
      }
    }
    if (count > 1) hotspots.push({ windowStart, count });
    return hotspots.sort((a, b) => b.count - a.count);
  }

  /**
   * 检测循环引用（正常应返回false，用于完整性检查）
   *
   * 仅沿 causedChanges（parent→child）有向边检测环。
   * 不沿 causedBy 反向遍历，否则 parent→child→parent 会被误判为环
   * （二者是同一条因果边的正向/反向表示）。
   * @returns {boolean} true表示检测到环
   */
  detectCycles() {
    const WHITE = 0, GRAY = 1, BLACK = 2;
    const color = new Map();
    for (const id of this._records.keys()) color.set(id, WHITE);

    const dfs = (id) => {
      color.set(id, GRAY);
      const change = this._records.get(id);
      if (change && change.causedChanges) {
        for (const next of change.causedChanges) {
          if (!color.has(next)) continue; // 悬空引用跳过
          const c = color.get(next);
          if (c === GRAY) return true;
          if (c === WHITE && dfs(next)) return true;
        }
      }
      color.set(id, BLACK);
      return false;
    };

    for (const id of this._records.keys()) {
      if (color.get(id) === WHITE) {
        if (dfs(id)) return true;
      }
    }
    return false;
  }

  /**
   * 导出从changeId开始的整条因果链（JSON可序列化数组）
   * 包含changeId所在连通分量的所有变更，按时间升序
   * @param {string} changeId
   * @returns {StateChangeRecord[]}
   */
  exportChain(changeId) {
    if (!this._records.has(changeId)) return [];
    // 双向BFS收集连通分量
    const visited = new Set();
    const queue = [changeId];
    visited.add(changeId);
    const getNeighbors = (id) => {
      const change = this._records.get(id);
      if (!change) return [];
      const neighbors = [];
      if (change.causedBy) neighbors.push(change.causedBy);
      if (change.causedChanges) neighbors.push(...change.causedChanges);
      return neighbors;
    };
    while (queue.length > 0) {
      const current = queue.shift();
      for (const next of getNeighbors(current)) {
        if (!visited.has(next) && this._records.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    return Array.from(visited)
      .map(id => this._records.get(id))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * 导出时间范围内的所有变更
   * @param {number} t1 - 起始时间戳
   * @param {number} t2 - 结束时间戳
   * @returns {StateChangeRecord[]} 按时间升序
   */
  exportRange(t1, t2) {
    return this.getByTimeRange(t1, t2);
  }

  /**
   * 清理超过maxAge的旧记录（毫秒），并修复悬空引用
   * @param {number} maxAge - 最大年龄（毫秒）
   * @returns {number} 清理的记录数
   */
  prune(maxAge) {
    const now = Date.now();
    const threshold = now - maxAge;
    let pruned = 0;
    const toRemove = [];
    for (const [id, change] of this._records) {
      if (change.timestamp < threshold) toRemove.push(id);
    }
    for (const id of toRemove) {
      this._records.delete(id);
      pruned++;
    }
    // 修复悬空引用
    for (const change of this._records.values()) {
      if (change.causedBy && !this._records.has(change.causedBy)) {
        change.causedBy = null;
      }
      if (change.causedChanges) {
        change.causedChanges = change.causedChanges.filter(cid => this._records.has(cid));
      }
    }
    return pruned;
  }

  /**
   * 清空所有记录
   */
  clear() {
    this._records.clear();
    this._counter = 0;
  }

  /**
   * 返回摘要信息
   * @returns {{total: number, rootCount: number, sourceTypes: string[], bySourceType: Object<string, number>, components: string[], hasCycles: boolean, averageChainLength: number, maxChainLength: number, oldestTimestamp: number|null, newestTimestamp: number|null}}
   */
  getSummary() {
    const stats = this.getStats();
    let oldest = null;
    let newest = null;
    const components = new Set();
    for (const change of this._records.values()) {
      if (oldest === null || change.timestamp < oldest) oldest = change.timestamp;
      if (newest === null || change.timestamp > newest) newest = change.timestamp;
      if (change.source && change.source.component) components.add(change.source.component);
    }
    return {
      total: stats.total,
      rootCount: stats.rootCount,
      sourceTypes: Object.keys(stats.bySourceType),
      bySourceType: stats.bySourceType,
      components: Array.from(components),
      hasCycles: this.detectCycles(),
      averageChainLength: Math.round(stats.averageChainLength * 100) / 100,
      maxChainLength: stats.maxChainLength,
      oldestTimestamp: oldest,
      newestTimestamp: newest,
    };
  }
}

export default StateChangeChain;
