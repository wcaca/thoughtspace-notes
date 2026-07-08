/**
 * [INPUT]: yjs (Y.Doc), core/layer.js (LayerSystem)
 * [OUTPUT]: LayerBridge类 — 层配置持久化桥接（Yjs CRDT双向同步）
 * [POS]: src/v2/persistence/layer-bridge.js,L0持久化层,层桥接
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 实现方案.md §1.3 Yjs Schema (spaceConfig.layers)
 *   - 层定义持久化到Yjs CRDT，支持多端同步
 *   - 框架ID持久化（spaceConfig.framework）
 *   - UndoManager追踪层增删改（origin='layer-bridge'）
 *
 * @note(s1, decision, layer-bridge, since:2026-07-08)
 *   S1-D.1.12: 层配置持久化，与LayerSystem双向同步。
 *   框架切换时framework-switcher(1.13)调用此组件保存框架ID。
 *   Yjs操作在事务中，origin='layer-bridge'便于UndoManager追踪。
 */

import * as Y from 'yjs';
import { LayerSystem, DEFAULT_LAYERS } from '../core/layer.js';

/**
 * 事务origin标识，便于UndoManager追踪本组件产生的变更。
 * @type {string}
 */
const BRIDGE_ORIGIN = 'layer-bridge';

/**
 * 默认框架ID（spaceConfig.framework 未设置时回退值）。
 * @type {string}
 */
const DEFAULT_FRAMEWORK = '6layer-2external';

/**
 * 层配置持久化桥接 — 将LayerSystem的层定义与Yjs CRDT双向同步。
 *
 * 同步方向:
 *   - Yjs → LayerSystem: loadFromYjs() 从持久化恢复层定义
 *   - LayerSystem → Yjs: saveToYjs()/saveLayer() 持久化当前层定义
 *   - 自动同步: startObserving() 监听Yjs变更（跳过本组件origin，避免回环）
 *
 * Schema (实现方案.md §1.3):
 *   spaceConfig: Y.Map<{
 *     framework: string,
 *     layers: Y.Array<LayerDef>,
 *     ...
 *   }>
 *
 * LayerDef 持久化字段（运行时字段 markInstanceId 不持久化，由LayerSystem重建）:
 *   { id, type, name, verticalRange:[lo,hi], isExternal, canRecord, description }
 */
export class LayerBridge {
  /**
   * @param {Object} options
   * @param {Y.Doc} [options.yjsDoc] - Y.Doc实例（S0骨架阶段可为null，方法返回false不报错）
   * @param {LayerSystem} [options.layerSystem] - LayerSystem实例（不传则内部创建）
   */
  constructor({ yjsDoc = null, layerSystem = null } = {}) {
    /** @type {Y.Doc|null} Y.Doc实例 */
    this.yjsDoc = yjsDoc;
    /** @type {LayerSystem} 层系统实例 */
    this.layerSystem = layerSystem || new LayerSystem();
    /** @type {Y.Map|null} spaceConfig 顶层Map */
    this.spaceConfig = null;
    /** @type {Y.Array|null} spaceConfig.layers 数组 */
    this.yjsLayers = null;
    /** @type {Function|null} Y.Array观察回调引用（用于unobserve） */
    this._observer = null;
    /** @type {boolean} 是否正在监听Yjs变更 */
    this._observing = false;
  }

  // ===== 初始化 =====

  /**
   * 初始化Yjs结构，加载现有层定义到LayerSystem。
   *
   * 步骤:
   *   1. 获取或创建 `yjsDoc.getMap('spaceConfig')`
   *   2. 在spaceConfig中获取或创建 `Y.Array('layers')`
   *   3. 获取或创建 `framework` 字段（字符串）
   *   4. 调用 loadFromYjs() 恢复层定义
   *
   * @returns {boolean} 是否初始化成功（yjsDoc为null时返回false）
   */
  init() {
    if (!this.yjsDoc) return false;

    this.spaceConfig = this.yjsDoc.getMap('spaceConfig');

    // 获取或创建 layers Y.Array（嵌套在 spaceConfig 内）
    let layersArr = this.spaceConfig.get('layers');
    if (!layersArr) {
      layersArr = new Y.Array();
      this.spaceConfig.set('layers', layersArr);
    }
    this.yjsLayers = layersArr;

    // framework 字段不需要预创建，loadFramework() 会回退到默认值

    this.loadFromYjs();
    return true;
  }

  // ===== Yjs → LayerSystem =====

  /**
   * 从Yjs读取层定义，重建LayerSystem。
   *
   * - Yjs非空: 清空LayerSystem现有层，逐个添加Yjs中的层定义
   * - Yjs为空: 使用LayerSystem当前层（应为DEFAULT_LAYERS）并保存到Yjs
   *
   * 清洗: 移除层定义中的运行时字段 `markInstanceId`（由LayerSystem._addLayer重建）。
   *
   * @returns {boolean} 是否加载成功（yjsDoc为null时返回false）
   */
  loadFromYjs() {
    if (!this.yjsDoc || !this.yjsLayers) return false;

    const yjsDefs = this.yjsLayers.toArray();

    if (yjsDefs.length === 0) {
      // Yjs为空 — 使用DEFAULT_LAYERS，清空LayerSystem并加载默认层，再持久化到Yjs
      this._clearLayerSystem();
      for (const def of DEFAULT_LAYERS) {
        this.layerSystem.addLayer(def);
      }
      this.saveToYjs();
      return true;
    }

    // 清空LayerSystem现有层
    this._clearLayerSystem();

    // 逐个添加Yjs中的层定义（清洗运行时字段）
    for (const def of yjsDefs) {
      this.layerSystem.addLayer(this._cleanLayerDef(def));
    }
    return true;
  }

  // ===== LayerSystem → Yjs =====

  /**
   * 将LayerSystem当前层定义保存到Yjs。
   *
   * - 清空Yjs的layers数组
   * - 将 LayerSystem.getLayers() 逐个push到Y.Array
   * - 用Yjs事务包装，origin='layer-bridge'便于UndoManager追踪
   *
   * @returns {boolean} 是否保存成功（yjsDoc为null时返回false）
   */
  saveToYjs() {
    if (!this.yjsDoc || !this.yjsLayers) return false;

    const layers = this.layerSystem.getLayers();
    const defs = layers.map((l) => this._cleanLayerDef(l));

    this.yjsDoc.transact(() => {
      // 清空现有数组
      if (this.yjsLayers.length > 0) {
        this.yjsLayers.delete(0, this.yjsLayers.length);
      }
      // push所有层定义（清洗后）
      if (defs.length > 0) {
        this.yjsLayers.push(defs);
      }
    }, BRIDGE_ORIGIN);

    return true;
  }

  /**
   * 保存单个层到Yjs（追加到Y.Array末尾）。
   * @param {LayerDef} layerDef - 层定义（运行时字段会被清洗）
   * @returns {boolean} 是否保存成功（yjsDoc为null或layerDef无效时返回false）
   */
  saveLayer(layerDef) {
    if (!this.yjsDoc || !this.yjsLayers) return false;
    if (!layerDef || !layerDef.id) return false;

    const def = this._cleanLayerDef(layerDef);
    this.yjsDoc.transact(() => {
      this.yjsLayers.push([def]);
    }, BRIDGE_ORIGIN);

    return true;
  }

  /**
   * 从Yjs移除指定层（按id匹配）。
   * @param {string} layerId - 层ID
   * @returns {boolean} 是否移除成功（未找到或yjsDoc为null时返回false）
   */
  removeLayer(layerId) {
    if (!this.yjsDoc || !this.yjsLayers) return false;
    if (!layerId) return false;

    let targetIdx = -1;
    for (let i = 0; i < this.yjsLayers.length; i++) {
      const item = this.yjsLayers.get(i);
      if (item && item.id === layerId) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === -1) return false;

    this.yjsDoc.transact(() => {
      this.yjsLayers.delete(targetIdx, 1);
    }, BRIDGE_ORIGIN);

    return true;
  }

  // ===== 监听 =====

  /**
   * 开始监听Yjs变更，自动同步到LayerSystem。
   *
   * 回环保护: 跳过 origin === 'layer-bridge' 的事务（本组件产生的变更，
   * LayerSystem已是最新，无需回灌）。
   *
   * @returns {boolean} 是否开始监听成功（yjsDoc为null时返回false）
   */
  startObserving() {
    if (!this.yjsDoc || !this.yjsLayers) return false;
    if (this._observing) return true;

    this._observer = (event) => {
      // 跳过本组件origin的变更，避免回环
      if (event.transaction && event.transaction.origin === BRIDGE_ORIGIN) {
        return;
      }
      this.loadFromYjs();
    };
    this.yjsLayers.observe(this._observer);
    this._observing = true;
    return true;
  }

  /**
   * 停止监听Yjs变更。
   * @returns {boolean} 是否停止成功（yjsDoc为null时返回false）
   */
  stopObserving() {
    if (!this.yjsDoc || !this.yjsLayers) return false;
    if (!this._observing) return true;

    if (this._observer) {
      this.yjsLayers.unobserve(this._observer);
      this._observer = null;
    }
    this._observing = false;
    return true;
  }

  // ===== 框架配置 =====

  /**
   * 保存当前框架ID到Yjs（spaceConfig.framework）。
   * @param {string} frameworkId - 框架ID（如 '6layer-2external' / '3network' / 'mandala'）
   * @returns {boolean} 是否保存成功（yjsDoc为null时返回false）
   */
  saveFramework(frameworkId) {
    if (!this.yjsDoc || !this.spaceConfig) return false;
    if (typeof frameworkId !== 'string') return false;

    this.yjsDoc.transact(() => {
      this.spaceConfig.set('framework', frameworkId);
    }, BRIDGE_ORIGIN);

    return true;
  }

  /**
   * 从Yjs读取框架ID。
   * @returns {string} 框架ID（未设置或yjsDoc为null时返回默认值 '6layer-2external'）
   */
  loadFramework() {
    if (!this.yjsDoc || !this.spaceConfig) return DEFAULT_FRAMEWORK;
    return this.spaceConfig.get('framework') || DEFAULT_FRAMEWORK;
  }

  // ===== 摘要 =====

  /**
   * 获取桥接状态摘要（供AI排查）。
   * @returns {{connected:boolean, layerCount:number, framework:string, observing:boolean}}
   */
  getSummary() {
    return {
      connected: !!this.yjsDoc,
      layerCount: this.layerSystem ? this.layerSystem.getLayers().length : 0,
      framework: this.loadFramework(),
      observing: this._observing,
    };
  }

  // ===== 内部辅助 =====

  /**
   * 清洗层定义 — 移除运行时字段 `markInstanceId`（由LayerSystem._addLayer重建）。
   * @param {LayerDef} def - 原始层定义
   * @returns {LayerDef} 清洗后的层定义（浅拷贝，不含markInstanceId）
   * @private
   */
  _cleanLayerDef(def) {
    if (!def) return def;
    const { markInstanceId, ...rest } = def;
    return rest;
  }

  /**
   * 清空LayerSystem所有层。
   * @private
   */
  _clearLayerSystem() {
    const layers = this.layerSystem.getLayers();
    for (const l of layers) {
      this.layerSystem.removeLayer(l.id);
    }
  }
}

export default LayerBridge;
