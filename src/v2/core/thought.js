/**
 * [INPUT]: space.js 坐标系 + layer.js 层归属 (getLayer) + scene-state-store.js 状态中枢
 * [OUTPUT]: Thought类 — 念头/记忆实体（相变、内外结构、占据空间比例、displayScale）
 *   + EntityStateAttachment 契约 — 实体自动携带状态附件
 *   + ThoughtPhase 枚举 — 念头相态（点/晶/相变中/已相变）
 *   + ThoughtMaterial 枚举 — 念头材质（金属/玻璃/木质/液态/晶体）
 * [POS]: src/v2/core/thought.js,L1领域核心层,念头实体基础
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * v0.8.22-S2.8 fix: _validatePosition 调 layerSystem.getLayerById → getLayer (API 名修正)
 *                  + 错变量 layerId 改为 this.attachment.layerId
 *                  + S2.1-S2.7 都是独立实现未跨调, S2.8 集成 main.js 首次跨调暴露这 bug
 *
 * 设计依据: 空间交互设计.md §3念头实体、组件实施顺序 §3 S2
 *   - §3.1 念头 = 占据空间的可塑多面体（不是球）
 *   - §3.2 内外结构（外壳硬内芯软，对应不同意识层次）
 *   - §3.3 相变（相变过程连续插值，瞬态层不持久化）
 *   - §3.4 占据空间比例（displayScale 0.3~1.0，基于层位置）
 *   - §3.5 空间重组织（相变时其他念头缩小重组）
 *
 * 核心概念:
 *   念头不是数据点，是3D晶体——有形状、有材质、有相态、有温度。
 *   每个念头自动携带 EntityStateAttachment（被 D001 诊断规则强制要求）。
 *   念头的瞬态状态（相变/动画/视觉插值）不进 Yjs，存内存 Map。
 *
 * 三维坐标:
 *   vertical(垂直): 层归属，0.0~1.0（决定 displayScale）
 *   radial(径向): 内外层深度，0.0=内层/1.0=外层
 *   orbital(圆周): 圆周位置 0~2π
 *
 * 状态附件契约 (EntityStateAttachment):
 *   - entityId: 实体唯一 ID
 *   - entityType: 实体类型（thought/memory/relation/mark/subspace）
 *   - layerId: 归属层 ID（来自 LayerSystem）
 *   - createdAt: 创建时间戳
 *   - createdBy: 创建者（user/ai/system）
 *   - lastChangeId: 最近一次状态变更的 chain ID
 *   - debugFlags: 调试标签集合
 *   - diagnostics: 该实体触发的诊断 finding IDs
 *
 * @note(s2, decision, thought-as-crystal, since:2026-07-08)
 *   S2-A.1: 念头 = 3D 晶体，非数据点。
 *   念头自动携带 EntityStateAttachment（被 diagnostic-engine D001 强制）。
 *   瞬态状态（相变/动画）独立于 Yjs 持久化层，避免写入风暴。
 */

// ===== 实体类型枚举 =====

export const EntityType = Object.freeze({
  THOUGHT: 'thought',          // 念头
  MEMORY: 'memory',            // 记忆（念头相变后的稳定态）
  RELATION: 'relation',        // 关系
  MARK: 'mark',                // 标记（mark-system 实例）
  SUBSPACE: 'subspace',        // 子空间
});

// ===== 创建者枚举 =====

export const CreatedBy = Object.freeze({
  USER: 'user',
  AI: 'ai',
  SYSTEM: 'system',           // 系统自动（如 import / migration）
  MIGRATION: 'migration',     // 数据迁移
});

// ===== 调试标签 =====

export const DebugFlag = Object.freeze({
  WATCHED: 'watched',          // 调试观察
  PROFILED: 'profiled',        // 性能采样中
  HIGHLIGHTED: 'highlighted',  // 高亮显示
  LOCKED: 'locked',            // 锁定（不可编辑）
});

// ===== 念头相态 =====

export const ThoughtPhase = Object.freeze({
  SEED: 'seed',                  // 种子态：刚创建，体积小，透明度低
  CRYSTAL: 'crystal',            // 晶体态：稳定，可塑多面体
  PHASE_TRANSITIONING: 'phase-transitioning',  // 相变中：连续插值动画
  MEMORY: 'memory',              // 记忆态：圆润高面数体，温度衰减
  DECOMPOSING: 'decomposing',    // 分解中：渐隐 + 粒子化
});

// ===== 念头材质 =====

export const ThoughtMaterial = Object.freeze({
  METAL: 'metal',          // 金属：冷硬，反光
  GLASS: 'glass',          // 玻璃：透明，多面折射
  WOOD: 'wood',            // 木质：温润，纹理
  LIQUID: 'liquid',        // 液态：流动（仅 memory 态）
  CRYSTAL: 'crystal',      // 晶体：高折光，多棱面（默认）
  STONE: 'stone',          // 石质：粗糙，沉稳
});

// ===== 念头形状 =====

export const ThoughtShape = Object.freeze({
  TETRAHEDRON: 'tetrahedron',  // 四面体（最锐利）
  CUBE: 'cube',                // 立方体
  OCTAHEDRON: 'octahedron',    // 八面体（默认）
  DODECAHEDRON: 'dodecahedron', // 十二面体
  ICOSAHEDRON: 'icosahedron',  // 二十面体
  SPHERE: 'sphere',            // 球（仅 memory 态）
});

// ===== 默认念头配置 =====

const DEFAULT_THOUGHT_CONFIG = Object.freeze({
  phase: ThoughtPhase.CRYSTAL,
  material: ThoughtMaterial.CRYSTAL,
  shape: ThoughtShape.OCTAHEDRON,
  temperature: 0.5,           // 0.0=冷（蓝）/1.0=热（红）
  displayScale: 1.0,          // 0.3~1.0，根据 vertical 自动调整
  occupancy: 1.0,             // 占据空间比例 0.1~1.0（念头互不重叠）
  innerRadius: 0.4,           // 内芯半径比例（外壳 = 1.0 - innerRadius）
  opacity: 1.0,
  metadata: {},               // 自定义元数据
});

// ===== EntityStateAttachment 工厂 =====

/**
 * 构造实体状态附件契约。
 * 任何在 SceneStateStore 中注册的实体必须挂载此对象，否则触发 D001。
 *
 * @param {Object} params
 * @param {string} params.entityId
 * @param {string} params.entityType
 * @param {string} params.layerId
 * @param {string} [params.createdBy='user']
 * @param {Object} [params.initialDebugFlags]
 * @returns {EntityStateAttachment}
 */
export function createEntityStateAttachment({
  entityId,
  entityType,
  layerId,
  createdBy = CreatedBy.USER,
  initialDebugFlags = null,
}) {
  if (!entityId) throw new Error('[thought] createEntityStateAttachment: entityId 必填');
  if (!entityType) throw new Error('[thought] createEntityStateAttachment: entityType 必填');
  if (!layerId) throw new Error('[thought] createEntityStateAttachment: layerId 必填');

  return Object.freeze({
    entityId,
    entityType,
    layerId,
    createdAt: Date.now(),
    createdBy,
    lastChangeId: null,
    debugFlags: new Set(initialDebugFlags || []),
    diagnostics: new Set(),   // diagnostic finding IDs
    /** 实体可被自定义 metadata 扩展，但需通过 setter 走状态变更链 */
    extensions: new Map(),
  });
}

/**
 * 检查某对象是否符合 EntityStateAttachment 契约。
 * 用于 diagnostic-engine D001 规则批量检测。
 *
 * @param {Object} obj
 * @returns {boolean}
 */
export function isEntityStateAttachment(obj) {
  if (!obj || typeof obj !== 'object') return false;
  return (
    typeof obj.entityId === 'string' &&
    typeof obj.entityType === 'string' &&
    typeof obj.layerId === 'string' &&
    typeof obj.createdAt === 'number' &&
    typeof obj.createdBy === 'string' &&
    obj.debugFlags instanceof Set &&
    obj.diagnostics instanceof Set
  );
}

// ===== Thought 类 =====

let _thoughtIdCounter = 0;

/**
 * 生成念头 ID。
 * 格式: thought-<timestamp>-<seq>，保证 SceneStateStore 内唯一。
 */
export function genThoughtId(prefix = 'thought') {
  _thoughtIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${_thoughtIdCounter.toString(36)}`;
}

/**
 * Thought 类 — 念头/记忆实体。
 *
 * 每个念头包含：
 *   - 持久化状态（进 Yjs）：id, type, layerId, vertical/radial/orbital, content, config, attachment
 *   - 瞬态状态（不进 Yjs，存 transientState Map）：phaseTransitionProgress, currentPhase, animationState
 *
 * @example
 * const t = new Thought({
 *   content: '今天早上的咖啡香',
 *   layerId: 'layer-conscious-shallow',
 *   position: { vertical: 0.75, radial: 0.6, orbital: 1.2 },
 * });
 * sceneStateStore.registerEntity(t);
 */
export class Thought {
  /**
   * @param {Object} params
   * @param {string} [params.id] - 不传则自动生成
   * @param {string} [params.type=EntityType.THOUGHT]
   * @param {string} params.content - 念头文本内容
   * @param {string} params.layerId - 归属层 ID（必须存在于 LayerSystem）
   * @param {Object} params.position - { vertical, radial, orbital }
   * @param {Partial<typeof DEFAULT_THOUGHT_CONFIG>} [params.config]
   * @param {Object} [params.metadata]
   * @param {string} [params.createdBy=CreatedBy.USER]
   * @param {Object} [params.space] - Space 实例（用于边界校验）
   * @param {Object} [params.layerSystem] - LayerSystem 实例（用于层归属校验）
   */
  constructor({
    id = null,
    type = EntityType.THOUGHT,
    content,
    layerId,
    position,
    config = {},
    metadata = {},
    createdBy = CreatedBy.USER,
    space = null,
    layerSystem = null,
  }) {
    if (!content || typeof content !== 'string') {
      throw new Error('[Thought] content 必填且为 string');
    }
    if (!layerId || typeof layerId !== 'string') {
      throw new Error('[Thought] layerId 必填');
    }
    if (!position || typeof position !== 'object') {
      throw new Error('[Thought] position 必填 {vertical,radial,orbital}');
    }

    this.id = id || genThoughtId(type === EntityType.MEMORY ? 'memory' : 'thought');
    this.type = type;
    this.content = content;

    // 持久化几何
    this.position = Object.freeze({ ...position });

    // 持久化配置（合并默认）
    this.config = Object.freeze({
      ...DEFAULT_THOUGHT_CONFIG,
      ...config,
    });

    this.metadata = Object.freeze({ ...metadata });
    this.createdBy = createdBy;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;

    // 状态附件契约（D001 强制）
    this.attachment = createEntityStateAttachment({
      entityId: this.id,
      entityType: this.type,
      layerId,
      createdBy,
    });

    // 边界校验（可选，Space/LayerSystem 注入时启用）
    this._validatePosition(position, space, layerSystem);

    // 瞬态状态（不持久化）
    this._transient = {
      currentPhase: this.config.phase,
      phaseTransitionProgress: 0,  // 0=无相变, 1=相变完成
      targetPhase: this.config.phase,
      animationState: null,
      lastRenderFrame: 0,
    };
  }

  /**
   * 边界校验：position 是否落在 layer/space 允许范围内。
   * @private
   */
  _validatePosition(position, space, layerSystem) {
    const v = position.vertical;
    const r = position.radial;
    const o = position.orbital;

    if (typeof v !== 'number' || v < 0 || v > 1) {
      throw new Error(`[Thought] vertical 必须在 [0,1]，当前 ${v}`);
    }
    if (typeof r !== 'number' || r < 0 || r > 1) {
      throw new Error(`[Thought] radial 必须在 [0,1]，当前 ${r}`);
    }
    if (typeof o !== 'number' || o < 0 || o >= 2 * Math.PI) {
      throw new Error(`[Thought] orbital 必须在 [0, 2π)，当前 ${o}`);
    }

    if (layerSystem) {
      const layer = layerSystem.getLayer(this.attachment.layerId);
      if (!layer) {
        throw new Error(`[Thought] layerId "${this.attachment.layerId}" 在 LayerSystem 中不存在`);
      }
      const [vMin, vMax] = layer.verticalRange;
      if (v < vMin || v > vMax) {
        throw new Error(`[Thought] vertical=${v} 超出 layer ${this.attachment.layerId} 的 [${vMin}, ${vMax}]`);
      }
    }
  }

  /**
   * 计算 displayScale（基于 vertical 距离视角起点的远近）。
   * 近大远小：vertical=0.5 时最大 1.0，vertical=0 或 1 时最小 0.3。
   *
   * @param {Object} [params]
   * @param {number} [params.viewVertical=0.5] - 当前视角的 vertical 位置
   * @returns {number} 0.3 ~ 1.0
   */
  computeDisplayScale({ viewVertical = 0.5 } = {}) {
    const dist = Math.abs(this.position.vertical - viewVertical);
    const scale = 1.0 - Math.min(dist / 0.5, 1.0) * 0.7;
    return Math.max(0.3, Math.min(1.0, scale));
  }

  /**
   * 触发相变（异步动画）。
   * 设置瞬态 targetPhase + phaseTransitionProgress=0，由 render-pipeline 推进。
   *
   * @param {string} targetPhase - ThoughtPhase 枚举值
   */
  startPhaseTransition(targetPhase) {
    if (!Object.values(ThoughtPhase).includes(targetPhase)) {
      throw new Error(`[Thought] startPhaseTransition: targetPhase "${targetPhase}" 不在 ThoughtPhase 枚举中`);
    }
    if (this._transient.targetPhase === targetPhase && this._transient.phaseTransitionProgress === 0) {
      return;  // 已在目标态
    }
    this._transient.targetPhase = targetPhase;
    this._transient.phaseTransitionProgress = 0;
  }

  /**
   * 推进相变动画（每帧调用，由 render-pipeline 调用）。
   * @param {number} deltaTime - 距离上一帧的秒数
   */
  tickPhaseTransition(deltaTime) {
    const tt = this._transient;
    if (tt.phaseTransitionProgress >= 1) return;
    // 默认 800ms 完成相变
    tt.phaseTransitionProgress = Math.min(1, tt.phaseTransitionProgress + deltaTime / 0.8);
    if (tt.phaseTransitionProgress >= 1) {
      tt.currentPhase = tt.targetPhase;
    }
  }

  /**
   * 调试：开启/关闭调试标签。
   * @param {string} flag - DebugFlag 枚举值
   * @param {boolean} [enabled=true]
   */
  setDebugFlag(flag, enabled = true) {
    if (!Object.values(DebugFlag).includes(flag)) {
      throw new Error(`[Thought] setDebugFlag: "${flag}" 不在 DebugFlag 枚举中`);
    }
    if (enabled) this.attachment.debugFlags.add(flag);
    else this.attachment.debugFlags.delete(flag);
  }

  /**
   * 记录诊断 finding（被 diagnostic-engine 调用）。
   * @param {string} findingId
   */
  addDiagnostic(findingId) {
    this.attachment.diagnostics.add(findingId);
  }

  /**
   * 清除诊断 finding（finding 被解决时调用）。
   * @param {string} findingId
   */
  clearDiagnostic(findingId) {
    this.attachment.diagnostics.delete(findingId);
  }

  /**
   * 序列化为持久化 JSON（用于 Yjs 写入）。
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      position: { ...this.position },
      config: { ...this.config },
      metadata: { ...this.metadata },
      layerId: this.attachment.layerId,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      attachment: {
        entityId: this.attachment.entityId,
        entityType: this.attachment.entityType,
        layerId: this.attachment.layerId,
        createdAt: this.attachment.createdAt,
        createdBy: this.attachment.createdBy,
        lastChangeId: this.attachment.lastChangeId,
        debugFlags: Array.from(this.attachment.debugFlags),
        diagnostics: Array.from(this.attachment.diagnostics),
      },
    };
  }

  /**
   * 从 JSON 反序列化（用于 Yjs 读取）。
   * @param {Object} json
   * @returns {Thought}
   */
  static fromJSON(json) {
    if (!json || !json.id || !json.content) {
      throw new Error('[Thought.fromJSON] id 与 content 必填');
    }
    const t = new Thought({
      id: json.id,
      type: json.type || EntityType.THOUGHT,
      content: json.content,
      layerId: json.layerId || json.attachment?.layerId,
      position: json.position,
      config: json.config,
      metadata: json.metadata,
      createdBy: json.createdBy || CreatedBy.MIGRATION,
    });
    if (json.attachment) {
      if (json.attachment.lastChangeId) t.attachment.lastChangeId = json.attachment.lastChangeId;
      for (const f of json.attachment.debugFlags || []) t.attachment.debugFlags.add(f);
      for (const f of json.attachment.diagnostics || []) t.attachment.diagnostics.add(f);
    }
    if (json.updatedAt) t.updatedAt = json.updatedAt;
    return t;
  }
}

// ===== 导出 =====

export default {
  EntityType,
  CreatedBy,
  DebugFlag,
  ThoughtPhase,
  ThoughtMaterial,
  ThoughtShape,
  Thought,
  createEntityStateAttachment,
  isEntityStateAttachment,
  genThoughtId,
};