/**
 * [INPUT]: yjs (Y.Doc), core/thought.js (Thought + createEntityStateAttachment)
 * [OUTPUT]: ThoughtBridge类 — 念头实体持久化桥接（Y.Map<thoughtId, ThoughtJSON> + 观察者分发）
 * [POS]: src/v2/persistence/thought-bridge.js,L0持久化层,念头桥接
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 组件实施顺序 §3 S2.2
 *   - 念头持久化到 Y.Map<thoughtId, JSON>，支持多端 CRDT 同步
 *   - 观察者分发：Yjs observeDeep 触发本地订阅者（render-pipeline / spatial-query）
 *   - UndoManager 追踪念头增删改（origin='thought-bridge'，与 layer-bridge 同源策略）
 *   - 过滤瞬态状态：phaseTransitionProgress/animationState/currentPhase 不进 Yjs
 *
 * @note(s2, decision, thought-bridge, since:2026-07-08)
 *   S2-A.2: 念头持久化与观察者分发。
 *   与 layer-bridge 共享 Yjs 事务 origin 策略（'thought-bridge' 隔离本组件变更）。
 *   瞬态状态由 caller 自行管理（不进 Yjs，避免 60fps 写入风暴）。
 */

import * as Y from 'yjs';
import { Thought, EntityType, isEntityStateAttachment, genThoughtId } from '../core/thought.js';

/**
 * 事务 origin 标识。
 * @type {string}
 */
const BRIDGE_ORIGIN = 'thought-bridge';

/**
 * Yjs schema key。
 * @type {string}
 */
const THOUGHTS_MAP_KEY = 'thoughts';

/**
 * 念头持久化桥接 — 将 Thought 实例与 Yjs CRDT 双向同步。
 *
 * Schema (实现方案.md §1.3 扩展):
 *   thoughts: Y.Map<thoughtId, ThoughtJSON>  // 念头实体 JSON
 *
 * 操作模式:
 *   - save(thought): Y.Map.set(thought.id, thought.toJSON())
 *   - delete(thoughtId): Y.Map.delete(thoughtId)
 *   - loadAll(): 返回 Thought[]（从 Y.Map.values()）
 *   - observe(callback): 订阅增删改事件
 *
 * 过滤策略:
 *   - 写入前剥离 _transient 字段（toJSON 已做）
 *   - 读取后 reconstruct Thought.fromJSON(json)
 */
export class ThoughtBridge {
  /**
   * @param {Object} options
   * @param {Y.Doc|null} [options.yjsDoc=null] - Y.Doc实例（null 时所有方法 no-op 返回 false）
   * @param {Object|null} [options.sceneStateStore=null] - SceneStateStore 实例（用于注册实体到内存中枢）
   */
  constructor({ yjsDoc = null, sceneStateStore = null } = {}) {
    /** @type {Y.Doc|null} */
    this.yjsDoc = yjsDoc;
    /** @type {Object|null} */
    this.sceneStateStore = sceneStateStore;

    /** @type {Set<Function>} 观察者集合 */
    this._observers = new Set();

    /** @type {Y.Map|null} */
    this._thoughtsMap = null;
    this._observerHandle = null;

    if (this.yjsDoc) {
      this._init();
    }
  }

  /**
   * 初始化：从 Y.Doc 获取或创建 thoughts Y.Map，挂载 deep observer。
   * @private
   */
  _init() {
    if (!this.yjsDoc) return;
    this._thoughtsMap = this.yjsDoc.getMap(THOUGHTS_MAP_KEY);
    this._observerHandle = this._thoughtsMap.observeDeep((events, transaction) => {
      // 跳过本组件自身触发的变更，避免回环
      if (transaction.origin === BRIDGE_ORIGIN) return;
      this._dispatchChange(events, transaction);
    });
  }

  /**
   * 分发变更事件给所有观察者。
   * @private
   */
  _dispatchChange(events, transaction) {
    const event = {
      type: 'thoughts-changed',
      source: transaction.origin || 'remote',
      timestamp: Date.now(),
      changes: events.map((e) => ({
        thoughtId: e.target?.parent?.toJSON ? null : null,  // Y.Map 子事件简化
        action: e.path?.[0] === THOUGHTS_MAP_KEY ? e.path[1] : null,
        // 完整 events 数组透传给观察者，让 caller 决定如何解析
        raw: e,
      })),
    };
    for (const cb of this._observers) {
      try {
        cb(event, events, transaction);
      } catch (err) {
        // 观察者抛错不阻断其他观察者
        console.error('[ThoughtBridge] observer 抛错:', err);
      }
    }
  }

  /**
   * 订阅念头变更。
   * @param {Function} callback (event, events, transaction) => void
   * @returns {Function} unsubscribe
   */
  observe(callback) {
    if (typeof callback !== 'function') {
      throw new Error('[ThoughtBridge.observe] callback 必填');
    }
    this._observers.add(callback);
    return () => this._observers.delete(callback);
  }

  /**
   * 保存念头到 Yjs。
   * @param {Thought} thought
   * @returns {boolean} 是否成功
   */
  save(thought) {
    if (!this._thoughtsMap) return false;
    if (!(thought instanceof Thought)) {
      throw new Error('[ThoughtBridge.save] 参数必须是 Thought 实例');
    }
    const json = thought.toJSON();
    this.yjsDoc.transact(() => {
      this._thoughtsMap.set(thought.id, json);
    }, BRIDGE_ORIGIN);
    return true;
  }

  /**
   * 批量保存念头（同一事务）。
   * @param {Thought[]} thoughts
   * @returns {boolean}
   */
  saveBatch(thoughts) {
    if (!this._thoughtsMap) return false;
    if (!Array.isArray(thoughts)) {
      throw new Error('[ThoughtBridge.saveBatch] 参数必须是 Thought[]');
    }
    this.yjsDoc.transact(() => {
      for (const t of thoughts) {
        if (!(t instanceof Thought)) {
          throw new Error('[ThoughtBridge.saveBatch] 数组中包含非 Thought 实例');
        }
        this._thoughtsMap.set(t.id, t.toJSON());
      }
    }, BRIDGE_ORIGIN);
    return true;
  }

  /**
   * 删除念头。
   * @param {string} thoughtId
   * @returns {boolean}
   */
  delete(thoughtId) {
    if (!this._thoughtsMap) return false;
    if (!this._thoughtsMap.has(thoughtId)) return false;
    this.yjsDoc.transact(() => {
      this._thoughtsMap.delete(thoughtId);
    }, BRIDGE_ORIGIN);
    return true;
  }

  /**
   * 加载所有念头为 Thought[]。
   * @returns {Thought[]}
   */
  loadAll() {
    if (!this._thoughtsMap) return [];
    const result = [];
    for (const json of this._thoughtsMap.values()) {
      try {
        result.push(Thought.fromJSON(json));
      } catch (err) {
        console.error('[ThoughtBridge.loadAll] 反序列化失败，跳过:', json?.id, err);
      }
    }
    return result;
  }

  /**
   * 按 ID 加载单个念头。
   * @param {string} thoughtId
   * @returns {Thought|null}
   */
  loadById(thoughtId) {
    if (!this._thoughtsMap) return null;
    const json = this._thoughtsMap.get(thoughtId);
    if (!json) return null;
    try {
      return Thought.fromJSON(json);
    } catch (err) {
      console.error('[ThoughtBridge.loadById] 反序列化失败:', err);
      return null;
    }
  }

  /**
   * 按层 ID 查询念头列表。
   * @param {string} layerId
   * @returns {Thought[]}
   */
  loadByLayer(layerId) {
    return this.loadAll().filter((t) => t.attachment.layerId === layerId);
  }

  /**
   * 统计念头总数。
   * @returns {number}
   */
  count() {
    if (!this._thoughtsMap) return 0;
    return this._thoughtsMap.size;
  }

  /**
   * 销毁：取消观察者，清理引用。
   */
  dispose() {
    if (this._observerHandle) {
      this._observerHandle();
      this._observerHandle = null;
    }
    this._observers.clear();
    this._thoughtsMap = null;
    this.yjsDoc = null;
    this.sceneStateStore = null;
  }
}

/**
 * 便捷工厂：从 yjsDoc 创建并初始化 ThoughtBridge。
 * @param {Y.Doc} yjsDoc
 * @param {Object} [options]
 * @returns {ThoughtBridge}
 */
export function createThoughtBridge(yjsDoc, options = {}) {
  return new ThoughtBridge({ yjsDoc, ...options });
}

// 导出供外部使用
export { EntityType, isEntityStateAttachment, genThoughtId };

export default {
  ThoughtBridge,
  createThoughtBridge,
  EntityType,
  isEntityStateAttachment,
  genThoughtId,
};