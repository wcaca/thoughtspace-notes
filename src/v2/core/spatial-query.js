/**
 * [INPUT]: spatial-state-field.js + state-snapshot.js + state-change-chain.js
 * [OUTPUT]: SpatialQuery类 — 统一查询语言（at/entity/ray/region/layer/timeline/causedBy/where/diff/trace）
 * [POS]: src/v2/core/spatial-query.js,L1领域核心层,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论.md §1.6 第6层·状态查询语言
 *   - 统一接口查询任意状态
 *   - 10种查询能力覆盖位置/实体/射线/区域/层/时间/因果/条件/差异/轨迹
 *   - 是排查基础6层架构的顶层入口，AI自排查的主要接口
 *
 * @note(s1, decision, unified-iface, since:2026-07-08)
 *   S1-B.1.18: 排查基础第6层，依赖1.14/1.15/1.16三个组件。
 *   SceneStateStore的AI自排查能力通过此组件暴露。
 *   diagnostic-engine.js(1.17)的诊断报告可由此组件的查询结果补充。
 */

// ===== 查询类型枚举 =====

/**
 * 查询类型枚举
 * @enum {string}
 * @property {string} AT - 点查询：某位置的状态
 * @property {string} ENTITY - 实体查询：某实体的完整状态附件
 * @property {string} RAY - 射线查询：射线穿过的所有状态
 * @property {string} REGION - 区域查询：某区域内所有状态
 * @property {string} LAYER - 层查询：某层的所有状态
 * @property {string} TIMELINE - 时间查询：某时间段的状态变更
 * @property {string} CAUSED_BY - 因果查询：某操作导致的所有变更
 * @property {string} WHERE - 条件查询：满足predicate的状态
 * @property {string} DIFF - 差异查询：两个快照的差异
 * @property {string} TRACE - 轨迹查询：某字段的历史变更轨迹
 */
export const QueryType = Object.freeze({
  AT: 'at',
  ENTITY: 'entity',
  RAY: 'ray',
  REGION: 'region',
  LAYER: 'layer',
  TIMELINE: 'timeline',
  CAUSED_BY: 'causedBy',
  WHERE: 'where',
  DIFF: 'diff',
  TRACE: 'trace',
});

// ===== 辅助函数 =====

/**
 * 数值保留两位小数
 * @param {number} n
 * @returns {number}
 * @private
 */
function round2(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/**
 * 格式化3D坐标为可读字符串
 * @param {{x:number,y:number,z:number}|null|undefined} p
 * @returns {string}
 * @private
 */
function formatPosition(p) {
  if (!p) return '(?)';
  return `(${round2(p.x)},${round2(p.y)},${round2(p.z)})`;
}

/**
 * 创建空结果（依赖缺失或参数无效时返回）
 * @param {string} type - QueryType
 * @param {string} reason - 未执行原因
 * @param {number} queryTime - 耗时ms
 * @returns {QueryResult}
 * @private
 */
function emptyResult(type, reason, queryTime) {
  return {
    type,
    data: null,
    metadata: {
      queryTime,
      resultCount: 0,
      source: 'none',
    },
    summary: `查询${type}未执行: ${reason}`,
  };
}

/**
 * 构造标准 QueryResult
 * @param {string} type - QueryType
 * @param {*} data - 查询结果数据
 * @param {number} queryTime - 耗时ms
 * @param {number} resultCount - 结果数量
 * @param {string} source - 数据来源组件
 * @param {string} summary - 人类可读摘要
 * @returns {QueryResult}
 * @private
 */
function makeResult(type, data, queryTime, resultCount, source, summary) {
  return {
    type,
    data,
    metadata: { queryTime, resultCount, source },
    summary,
  };
}

// ===== SpatialQuery 类 =====

/**
 * 统一查询语言 —— 排查基础第6层（排查方法论.md §1.6）
 *
 * 核心职责:
 *   1. 提供10种查询能力，覆盖位置/实体/射线/区域/层/时间/因果/条件/差异/轨迹
 *   2. 统一返回 QueryResult（含 type/data/metadata/summary），便于AI分析
 *   3. 三个依赖均通过DI注入，可选；缺失依赖的查询返回带说明的空结果
 *
 * 设计:
 *   - 直接查询：SpatialQuery 实例方法返回 QueryResult
 *   - 链式查询：createQuery() 工厂返回链式构建器，支持 .at().where() 风格
 *   - metadata.queryTime 用 performance.now() 测量
 *   - summary 生成人类可读字符串，供 AI 自排查分析
 *
 * 不职责:
 *   - 不存储状态（只查询，不修改）
 *   - 不依赖Three.js（纯逻辑）
 *   - 不负责渲染
 *
 * @example
 * // 直接查询
 * const q = new SpatialQuery({ stateField, snapshotStore, changeChain });
 * const at = q.at({x:0,y:0,z:0});
 * // 链式查询
 * const cq = createQuery(stateField, snapshotStore, changeChain);
 * const filtered = cq.at({x:0,y:0,z:0}).where(s => s.distortion > 0.5);
 */
export class SpatialQuery {
  /**
   * @param {Object} [deps] - 依赖组件（均可选，DI）
   * @param {import('./spatial-state-field.js').SpatialStateField} [deps.stateField] - 空间状态场（at/ray/region/layer/where查询）
   * @param {import('./state-snapshot.js').SnapshotStore} [deps.snapshotStore] - 快照存储（timeline/diff/trace/entity查询）
   * @param {import('./state-change-chain.js').StateChangeChain} [deps.changeChain] - 变更链（causedBy/timeline查询）
   */
  constructor({ stateField, snapshotStore, changeChain } = {}) {
    /** @type {import('./spatial-state-field.js').SpatialStateField|null} */
    this.stateField = stateField || null;
    /** @type {import('./state-snapshot.js').SnapshotStore|null} */
    this.snapshotStore = snapshotStore || null;
    /** @type {import('./state-change-chain.js').StateChangeChain|null} */
    this.changeChain = changeChain || null;
  }

  // ===== 位置/空间查询（依赖 stateField）=====

  /**
   * 点查询：返回某位置的 CellState
   * @param {{x:number,y:number,z:number}} point - 3D坐标
   * @returns {QueryResult} data 为 CellState|null
   */
  at(point) {
    const t0 = performance.now();
    if (!this.stateField) return emptyResult(QueryType.AT, '缺少stateField依赖', 0);
    if (!point) return emptyResult(QueryType.AT, 'point参数缺失', 0);
    const state = this.stateField.query(point);
    const t1 = performance.now();
    const summary = state
      ? `位置${formatPosition(point)}的深入度为${round2(state.depthValue)}，扭曲度为${round2(state.distortion)}，念头密度为${round2(state.thoughtDensity)}`
      : `位置${formatPosition(point)}越界或无状态`;
    return makeResult(QueryType.AT, state, t1 - t0, state ? 1 : 0, 'spatial-state-field', summary);
  }

  /**
   * 实体查询：返回某实体的完整状态附件
   *
   * S1阶段实体可能不存在，从最新快照的 entities 摘要中查找；
   * 找不到返回 data=null。
   *
   * @param {string} id - 实体ID
   * @returns {QueryResult} data 为 EntityStateSummary|null
   */
  entity(id) {
    const t0 = performance.now();
    if (!this.snapshotStore) return emptyResult(QueryType.ENTITY, '缺少snapshotStore依赖', 0);
    if (!id) return emptyResult(QueryType.ENTITY, 'id参数缺失', 0);
    const latest = this.snapshotStore.getLatest();
    let entity = null;
    if (latest && latest.entities) {
      const entities = latest.entities instanceof Map ? latest.entities : new Map();
      entity = entities.get(id) || null;
    }
    const t1 = performance.now();
    const summary = entity
      ? `实体${id}: layer=${entity.layerId ?? '?'}, position=${formatPosition(entity.position)}`
      : `实体${id}未找到（S1阶段实体可能不存在）`;
    return makeResult(QueryType.ENTITY, entity, t1 - t0, entity ? 1 : 0, 'snapshot-store', summary);
  }

  /**
   * 射线查询：返回射线穿过的所有 cell 状态
   * @param {{x:number,y:number,z:number}} origin - 射线起点
   * @param {{x:number,y:number,z:number}} direction - 射线方向（不需归一化）
   * @param {number} [maxDist] - 最大遍历距离（不传用默认值）
   * @returns {QueryResult} data 为 RayState {cells, totalLength, hitEntities}
   */
  ray(origin, direction, maxDist) {
    const t0 = performance.now();
    if (!this.stateField) return emptyResult(QueryType.RAY, '缺少stateField依赖', 0);
    if (!origin || !direction) return emptyResult(QueryType.RAY, 'origin/direction参数缺失', 0);
    const result = this.stateField.queryRay(origin, direction, maxDist);
    const t1 = performance.now();
    const cells = result.cells || [];
    const hitCount = (result.hitEntities || []).length;
    const summary = `射线从${formatPosition(origin)}沿方向${formatPosition(direction)}穿过${cells.length}个cell，总长度${round2(result.totalLength || 0)}，命中${hitCount}个实体`;
    return makeResult(QueryType.RAY, result, t1 - t0, cells.length, 'spatial-state-field', summary);
  }

  /**
   * 区域查询：返回某区域内所有非空 cell 状态
   * @param {{min:{x,y,z}, max:{x,y,z}}} bounds - 区域范围
   * @returns {QueryResult} data 为 RegionState {cells, bounds, avgDepth, avgDistortion, totalDensity}
   */
  region(bounds) {
    const t0 = performance.now();
    if (!this.stateField) return emptyResult(QueryType.REGION, '缺少stateField依赖', 0);
    if (!bounds || !bounds.min || !bounds.max) return emptyResult(QueryType.REGION, 'bounds参数缺失', 0);
    const result = this.stateField.queryRegion(bounds);
    const t1 = performance.now();
    const cells = result.cells || [];
    const summary = `区域${formatPosition(bounds.min)}~${formatPosition(bounds.max)}包含${cells.length}个非空cell，平均深入度${round2(result.avgDepth || 0)}，平均扭曲度${round2(result.avgDistortion || 0)}`;
    return makeResult(QueryType.REGION, result, t1 - t0, cells.length, 'spatial-state-field', summary);
  }

  /**
   * 层查询：返回某层的所有 cell 状态
   * @param {string} layerId - 层ID
   * @returns {QueryResult} data 为 LayerState {layerId, cells, avgDepth, avgDistortion, thoughtCount, error?}
   */
  layer(layerId) {
    const t0 = performance.now();
    if (!this.stateField) return emptyResult(QueryType.LAYER, '缺少stateField依赖', 0);
    if (!layerId) return emptyResult(QueryType.LAYER, 'layerId参数缺失', 0);
    const result = this.stateField.queryLayer(layerId);
    const t1 = performance.now();
    const cells = result.cells || [];
    const summary = result.error
      ? `层${layerId}查询失败: ${result.error}`
      : `层${layerId}包含${cells.length}个cell，平均深入度${round2(result.avgDepth || 0)}，扭曲度${round2(result.avgDistortion || 0)}，念头数${result.thoughtCount || 0}`;
    return makeResult(QueryType.LAYER, result, t1 - t0, cells.length, 'spatial-state-field', summary);
  }

  // ===== 时间/因果查询（依赖 snapshotStore + changeChain）=====

  /**
   * 时间查询：返回某时间段的状态变更（快照+变更链）
   * @param {number} t1 - 起始时间戳（含）
   * @param {number} t2 - 结束时间戳（含）
   * @returns {QueryResult} data 为 {snapshots: Array, changes: Array}
   */
  timeline(t1, t2) {
    const t0 = performance.now();
    const snapshots = this.snapshotStore ? this.snapshotStore.getRange(t1, t2) : [];
    const changes = this.changeChain ? this.changeChain.getByTimeRange(t1, t2) : [];
    const t1e = performance.now();
    const summary = `时间段[${round2(t1)}, ${round2(t2)}]包含${snapshots.length}个快照和${changes.length}个变更`;
    return makeResult(
      QueryType.TIMELINE,
      { snapshots, changes },
      t1e - t0,
      snapshots.length + changes.length,
      'snapshot-store+change-chain',
      summary
    );
  }

  /**
   * 因果查询：返回某操作导致的所有变更（子孙变更）
   * @param {string} actionId - 起始变更ID（变更链节点id）
   * @returns {QueryResult} data 为 {root: StateChangeRecord|null, descendants: StateChangeRecord[]}
   */
  causedBy(actionId) {
    const t0 = performance.now();
    if (!this.changeChain) return emptyResult(QueryType.CAUSED_BY, '缺少changeChain依赖', 0);
    if (!actionId) return emptyResult(QueryType.CAUSED_BY, 'actionId参数缺失', 0);
    const tree = this.changeChain.traceDown(actionId);
    // 展开所有子孙变更（不包括根本身）
    /** @type {Array} */
    const descendants = [];
    const walk = (node) => {
      if (!node || !node.children) return;
      for (const child of node.children) {
        if (child.change) descendants.push(child.change);
        walk(child);
      }
    };
    walk(tree);
    const t1 = performance.now();
    const rootComp = tree && tree.change && tree.change.source ? tree.change.source.component : '?';
    const summary = tree && tree.change
      ? `操作${actionId}(${rootComp})导致${descendants.length}个子孙变更`
      : `操作${actionId}未找到`;
    return makeResult(
      QueryType.CAUSED_BY,
      { root: tree ? tree.change : null, descendants },
      t1 - t0,
      descendants.length,
      'change-chain',
      summary
    );
  }

  // ===== 条件查询（依赖 stateField）=====

  /**
   * 条件查询：遍历 stateField 所有非空 cell，返回满足 predicate 的 CellState
   * @param {(state: CellState) => boolean} predicate - 谓词，接收 CellState 返回 boolean
   * @returns {QueryResult} data 为 CellState[]
   */
  where(predicate) {
    const t0 = performance.now();
    if (!this.stateField) return emptyResult(QueryType.WHERE, '缺少stateField依赖', 0);
    if (typeof predicate !== 'function') return emptyResult(QueryType.WHERE, 'predicate不是函数', 0);
    /** @type {Array} */
    const matched = [];
    for (const state of this.stateField.grid.values()) {
      try {
        if (predicate(state)) matched.push(state);
      } catch (_e) {
        // 跳过 predicate 抛错的 cell
      }
    }
    const t1 = performance.now();
    const total = this.stateField.grid.size;
    const summary = `条件查询匹配${matched.length}个cell（共${total}个非空cell）`;
    return makeResult(QueryType.WHERE, matched, t1 - t0, matched.length, 'spatial-state-field', summary);
  }

  // ===== 差异查询（依赖 snapshotStore）=====

  /**
   * 差异查询：比较两个快照的差异
   * @param {Object} snapshot1 - 旧快照
   * @param {Object} snapshot2 - 新快照
   * @returns {QueryResult} data 为 {addedEntities, removedEntities, changedEntities, viewChanged, performanceDiff}
   */
  diff(snapshot1, snapshot2) {
    const t0 = performance.now();
    if (!this.snapshotStore) return emptyResult(QueryType.DIFF, '缺少snapshotStore依赖', 0);
    if (!snapshot1 || !snapshot2) return emptyResult(QueryType.DIFF, 'snapshot参数缺失', 0);
    const d = this.snapshotStore.diff(snapshot1, snapshot2);
    const t1 = performance.now();
    const added = (d.addedEntities && d.addedEntities.length) || 0;
    const removed = (d.removedEntities && d.removedEntities.length) || 0;
    const changed = (d.changedEntities && d.changedEntities.length) || 0;
    const total = added + removed + changed;
    const summary = `快照差异: 新增${added}个实体，移除${removed}个，变更${changed}个，视角${d.viewChanged ? '已变' : '未变'}`;
    return makeResult(QueryType.DIFF, d, t1 - t0, total, 'snapshot-store', summary);
  }

  // ===== 轨迹查询（依赖 snapshotStore）=====

  /**
   * 轨迹查询：某字段的历史变更轨迹
   *
   * 遍历所有快照（按时间升序），提取每个快照中该 entity 的该字段值。
   *
   * @param {string} entityId - 实体ID
   * @param {string} field - 字段名（如 'position'/'layerId'）
   * @returns {QueryResult} data 为 Array<{timestamp:number, value:*}>
   */
  trace(entityId, field) {
    const t0 = performance.now();
    if (!this.snapshotStore) return emptyResult(QueryType.TRACE, '缺少snapshotStore依赖', 0);
    if (!entityId || !field) return emptyResult(QueryType.TRACE, 'entityId/field参数缺失', 0);
    /** @type {Array<{timestamp:number, value:*}>} */
    const trajectory = [];
    // 用极大时间范围获取全部快照（按时间升序）
    const snapshots = this.snapshotStore.getRange(0, Number.MAX_SAFE_INTEGER);
    for (const snap of snapshots) {
      if (!snap.entities) continue;
      const entities = snap.entities instanceof Map ? snap.entities : new Map();
      const entity = entities.get(entityId);
      if (entity && entity[field] !== undefined) {
        trajectory.push({ timestamp: snap.timestamp, value: entity[field] });
      }
    }
    const t1 = performance.now();
    const summary = `实体${entityId}字段${field}有${trajectory.length}个历史点`;
    return makeResult(QueryType.TRACE, trajectory, t1 - t0, trajectory.length, 'snapshot-store', summary);
  }

  // ===== 能力摘要 =====

  /**
   * 返回可用查询能力摘要
   * @returns {{component:string, capabilities:Object<string,boolean>, deps:Object<string,boolean>, queryTypes:string[]}}
   */
  getSummary() {
    const hasField = this.stateField !== null;
    const hasSnap = this.snapshotStore !== null;
    const hasChain = this.changeChain !== null;
    return {
      component: 'SpatialQuery',
      capabilities: {
        at: hasField,
        entity: hasSnap,
        ray: hasField,
        region: hasField,
        layer: hasField,
        timeline: hasSnap || hasChain,
        causedBy: hasChain,
        where: hasField,
        diff: hasSnap,
        trace: hasSnap,
      },
      deps: {
        stateField: hasField,
        snapshotStore: hasSnap,
        changeChain: hasChain,
      },
      queryTypes: Object.values(QueryType),
    };
  }
}

// ===== 链式查询构建器 =====

/**
 * 链式查询结果 — 包装 QueryResult 并支持 .where() 后过滤及继续链式查询
 *
 * @example
 * const cq = createQuery(stateField, snapshotStore, changeChain);
 * cq.at({x:0,y:0,z:0}).where(s => s.distortion > 0.5);
 * cq.region(bounds).where(s => s.depthValue > 1);
 */
class ChainableResult {
  /**
   * @param {QueryResult} result - 原始查询结果
   * @param {Object} builder - 链式构建器（持有内部 SpatialQuery 实例）
   */
  constructor(result, builder) {
    /** @type {string} */
    this.type = result.type;
    /** @type {*} */
    this.data = result.data;
    /** @type {{queryTime:number, resultCount:number, source:string}} */
    this.metadata = result.metadata;
    /** @type {string} */
    this.summary = result.summary;
    /** @private */
    this._builder = builder;
  }

  /**
   * 后过滤：对当前结果数据应用 predicate
   *
   * 支持的数据形态：
   *   - Array: 直接 filter
   *   - {cells: Array}: 过滤 cells，返回 cell.state 数组
   *   - 单对象: 测试 predicate，通过保留，否则 null
   *
   * @param {(item:*) => boolean} predicate - 谓词
   * @returns {ChainableResult} 过滤后的链式结果
   */
  where(predicate) {
    if (typeof predicate !== 'function') return this;
    const data = this.data;
    let filtered;
    if (Array.isArray(data)) {
      filtered = data.filter(predicate);
    } else if (data && Array.isArray(data.cells)) {
      // ray/region/layer 结果：过滤 cells，提取 state
      filtered = data.cells
        .map((c) => (c && c.state ? c.state : c))
        .filter(predicate);
    } else if (data && typeof data === 'object') {
      filtered = predicate(data) ? data : null;
    } else {
      filtered = data;
    }
    const count = Array.isArray(filtered) ? filtered.length : filtered ? 1 : 0;
    const newResult = {
      type: this.type,
      data: filtered,
      metadata: { ...this.metadata, resultCount: count },
      summary: `${this.summary} → 条件过滤后${count}个`,
    };
    return new ChainableResult(newResult, this._builder);
  }

  /**
   * 转换为普通 QueryResult（去除链式方法）
   * @returns {QueryResult}
   */
  value() {
    return {
      type: this.type,
      data: this.data,
      metadata: this.metadata,
      summary: this.summary,
    };
  }
}

// 为 ChainableResult 注入所有查询方法，使其可继续链式调用
['at', 'entity', 'ray', 'region', 'layer', 'timeline', 'causedBy', 'diff', 'trace'].forEach((method) => {
  ChainableResult.prototype[method] = function (...args) {
    const result = this._builder._query[method].apply(this._builder._query, args);
    return new ChainableResult(result, this._builder);
  };
});

/**
 * 创建链式查询构建器
 *
 * 返回的构建器每个查询方法返回 ChainableResult，支持 .where() 后过滤和继续链式查询。
 *
 * @param {import('./spatial-state-field.js').SpatialStateField} [stateField] - 空间状态场
 * @param {import('./state-snapshot.js').SnapshotStore} [snapshotStore] - 快照存储
 * @param {import('./state-change-chain.js').StateChangeChain} [changeChain] - 变更链
 * @returns {Object} 链式查询构建器
 *
 * @example
 * const cq = createQuery(stateField, snapshotStore, changeChain);
 * const r = cq.at({x:0,y:0,z:0}).where(s => s.distortion > 0.5);
 * console.log(r.summary, r.metadata.resultCount);
 */
export function createQuery(stateField, snapshotStore, changeChain) {
  const query = new SpatialQuery({ stateField, snapshotStore, changeChain });
  /** @type {{_query: SpatialQuery}} */
  const builder = { _query: query };
  ['at', 'entity', 'ray', 'region', 'layer', 'timeline', 'causedBy', 'where', 'diff', 'trace'].forEach((method) => {
    builder[method] = function (...args) {
      const result = query[method].apply(query, args);
      return new ChainableResult(result, builder);
    };
  });
  builder.getSummary = () => query.getSummary();
  return builder;
}

export default SpatialQuery;
