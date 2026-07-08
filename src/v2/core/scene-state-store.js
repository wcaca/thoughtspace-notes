/**
 * [INPUT]: Yjs Doc（由persistence层创建，S1填充注入）
 * [OUTPUT]: SceneStateStore类 — 统一状态中枢，三层状态管理（Yjs权威层/瞬态层/渲染缓存层）
 * [POS]: src/v2/core/scene-state-store.js,L1领域核心,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 排查方法论核心: 3D空间是唯一真相源,本组件是状态容器。
 *   - yjsState: Yjs CRDT权威层（thoughts/viewConfigs/orbitPaths/markSystem/content）
 *   - transientState: 瞬态层（动画状态/视角过渡/扭曲度场）——不进Yjs
 *   - renderCache: 渲染缓存层（投影结果/锚点位置/深度场/绘制指令）——只读
 *
 * AI自排查能力（S0预留,S1+填充）:
 *   - serialize(): 所有实体状态序列化为JSON（供AI读取）
 *   - exportChangeChain(): 状态变更链导出（供AI分析因果）
 *   - generateDiagnosticReport(): 诊断报告生成（供AI自动检测问题）
 *   - getSnapshot(t): 时间线快照回放（供AI回溯问题）
 *
 * @note(s0, skeleton, state-store, since:2026-07-08)
 *   S0只建骨架,S1填充Yjs集成,S2填充渲染缓存,S3填充诊断引擎。
 *   当前所有方法返回占位值或抛NotImplementedError。
 */

/**
 * 未实现错误 —— S0骨架阶段占位方法抛出此错误
 */
export class NotImplementedError extends Error {
  constructor(methodName) {
    super(`SceneStateStore.${methodName} 尚未实现（S0骨架，S1+填充）`);
    this.name = 'NotImplementedError';
    this.methodName = methodName;
  }
}

/**
 * 统一状态中枢 —— 排查基础组件
 *
 * 三层状态管理:
 *   1. yjsState: Yjs CRDT权威层（持久化，多端同步）
 *   2. transientState: 瞬态层（动画/过渡，不持久化）
 *   3. renderCache: 渲染缓存层（投影结果，可重建）
 *
 * 单向数据流:
 *   用户操作 → applyUserAction() → 更新yjsState或transientState
 *   → 标记renderCache失效 → 帧调度器触发重算 → 渲染
 */
export class SceneStateStore {
  /**
   * @param {Object} options
   * @param {import('yjs').Doc|null} options.yjsDoc - Yjs文档（S1填充,null表示S0骨架）
   */
  constructor({ yjsDoc = null } = {}) {
    // ===== 第1层: Yjs权威层 =====
    /** @type {import('yjs').Doc|null} */
    this.yjsDoc = yjsDoc;
    // 以下Yjs Map在S1填充（yjsDoc非null时初始化）
    this.yjsState = {
      thoughts: null,        // Y.Map<Y.Map>  id → Thought
      relations: null,       // Y.Map<Y.Map>  id → Relation
      todos: null,           // Y.Map<Y.Map>  id → Todo
      rules: null,           // Y.Map<Y.Map>  id → Rule
      marks: null,           // Y.Map<Y.Map>  id → Mark
      dampers: null,         // Y.Map<Y.Map>  id → Damper
      spaceConfig: null,     // Y.Map  空间配置
      userConfig: null,      // Y.Map  用户配置
    };

    // ===== 第2层: 瞬态层（不进Yjs）=====
    this.transientState = {
      /** @type {Map<string, AnimationState>} 念头动画状态（相变t值等） */
      animationStates: new Map(),
      /** @type {ViewTransition|null} 视角过渡状态 */
      viewTransition: null,
      /** @type {Float32Array|null} 扭曲度场（32³降采样网格） */
      distortionField: null,
    };

    // ===== 第3层: 渲染缓存层（只读,可重建）=====
    this.renderCache = {
      /** @type {Map<string, ProjectedThought>} 投影后的念头（3D→2D结果） */
      projectedThoughts: new Map(),
      /** @type {Map<string, AnchorPosition>} 锚点位置（标记线投影） */
      anchorPositions: new Map(),
      /** @type {Float32Array|null} 深入度场（32³降采样网格） */
      depthField: null,
      /** @type {Array} 绘制指令队列 */
      drawCommands: [],
      /** @type {Set<string>} 失效的缓存key */
      invalidations: new Set(),
    };

    // ===== 排查基础（S1+填充）=====
    /** @type {Array<Snapshot>} 时间线快照（环形缓冲） */
    this._snapshots = [];
    /** @type {Map<string, StateChangeRecord>} 状态变更链 */
    this._changeChain = new Map();
    /** @type {string|null} 当前帧首个变更ID */
    this._currentFrameChangeHead = null;
  }

  // ===== 状态更新接口 =====

  /**
   * 应用用户操作（统一入口）
   * @param {Object} action - 用户操作（来自ActionRouter）
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, skeleton, apply-action, since:2026-07-08)
   *   S1实现: 解析action → 更新yjsState或transientState → 标记renderCache失效
   */
  applyUserAction(action) {
    throw new NotImplementedError('applyUserAction');
  }

  /**
   * 标记渲染缓存失效
   * @param {string} cacheKey - 失效的缓存key
   */
  invalidateCache(cacheKey) {
    this.renderCache.invalidations.add(cacheKey);
  }

  // ===== AI自排查能力（S0预留,S1+填充）=====

  /**
   * 序列化所有实体状态为JSON（供AI读取）
   * @returns {Object} 可JSON化的状态快照
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, skeleton, ai-serialize, since:2026-07-08)
   *   AI自排查能力: 让AI能读取任意实体的完整状态
   */
  serialize() {
    throw new NotImplementedError('serialize');
  }

  /**
   * 导出状态变更链（供AI分析因果）
   * @param {string} [changeId] - 起始变更ID（不传则导出全部）
   * @returns {Array<Object>} 变更记录列表
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, skeleton, ai-change-chain, since:2026-07-08)
   *   AI自排查能力: 让AI能追溯任意变更的因果关系
   */
  exportChangeChain(changeId) {
    throw new NotImplementedError('exportChangeChain');
  }

  /**
   * 生成诊断报告（供AI自动检测问题）
   * @returns {Object} 诊断报告
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, skeleton, ai-diagnostic, since:2026-07-08)
   *   AI自排查能力: 让AI能自动获取诊断报告
   */
  generateDiagnosticReport() {
    throw new NotImplementedError('generateDiagnosticReport');
  }

  /**
   * 获取时间点快照（供AI回溯问题）
   * @param {number} timestamp - 时间戳
   * @returns {Object|null} 快照
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, skeleton, ai-snapshot, since:2026-07-08)
   *   AI自排查能力: 让AI能回放任意时间点的状态
   */
  getSnapshot(timestamp) {
    throw new NotImplementedError('getSnapshot');
  }

  // ===== 调试接口 =====

  /**
   * 获取状态摘要（用于console调试）
   * @returns {Object} 状态摘要
   */
  getSummary() {
    return {
      mode: 's0-skeleton',
      yjsConnected: this.yjsDoc !== null,
      thoughtsCount: 0,
      animationCount: this.transientState.animationStates.size,
      cacheInvalidations: this.renderCache.invalidations.size,
      snapshotsCount: this._snapshots.length,
      changeChainSize: this._changeChain.size,
    };
  }
}

export default SceneStateStore;
