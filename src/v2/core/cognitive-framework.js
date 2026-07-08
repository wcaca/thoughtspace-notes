/**
 * [INPUT]: layer.js (LayerSystem, DEFAULT_LAYERS, LayerType)
 * [OUTPUT]: CognitiveFrameworkSystem类 — 可切换认知框架（8种预设+自定义）
 * [POS]: src/v2/core/cognitive-framework.js,L1领域核心层,认知框架
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.6 可切换认知框架、§2.1 可定制性边界
 *   - §1.6 不绑死任何理论，提供可切换框架系统（8种预设+自定义）
 *   - §2.1 认知框架可自定义（默认6层+2外置，可切换）
 *   - §2.2 各维度独立，不破坏界面统一性
 *
 * 核心设计:
 *   框架 = 层的预设组合。每个框架定义一组层（verticalRange划分0-1）。
 *   切换框架 = 用框架的层定义重建LayerSystem。
 *   不硬编码任何框架，8种预设只是预注册的FrameworkDefinition。
 *   用户可注册自定义框架。
 *
 * 8种预设框架（对应§1.6）:
 *   1. 6层+2外置（默认，8分区）— 通用，显意识/潜意识分层
 *   2. 三网络（3分区）— DMN/CEN/SN，脑科学实证
 *   3. 曼陀罗（5分区）— 方向+中心，自我探索
 *   4. 原型（4分区）— 阴影/人格面具/自性/阿尼玛，深度心理
 *   5. 脑区（5分区）— 前额叶/海马/杏仁核/小脑/脑干，功能定位
 *   6. 八维（8分区）— Ne/Ni/Se/Si/Te/Ti/Fe/Fi，认知功能
 *   7. 生命之树（10分区）— 10原质，复杂思考
 *   8. 自定义（用户定义）
 *
 * @note(s1, decision, preset-swap, since:2026-07-08)
 *   S1-A.4: 框架是层的预设组合，切换=重建LayerSystem层。
 *   默认框架引用layer.js的DEFAULT_LAYERS，避免重复定义。
 *   framework-switcher.js(interaction层)调用此类实现UI切换。
 */

import { DEFAULT_LAYERS, LayerType } from './layer.js';

// ===== 框架ID枚举 =====

export const FrameworkId = Object.freeze({
  SIX_LAYER_TWO_EXTERNAL: '6layer-2external',       // 默认
  THREE_NETWORK: '3network',                          // 三网络 DMN/CEN/SN
  MANDALA: 'mandala',                                 // 曼陀罗 方向+中心
  ARCHETYPE: 'archetype',                             // 原型 阴影/人格面具/自性/阿尼玛
  BRAIN_REGION: 'brain-region',                       // 脑区 前额叶/海马/杏仁核/小脑/脑干
  EIGHT_DIMENSION: '8dimension',                      // 八维 Ne/Ni/Se/Si/Te/Ti/Fe/Fi
  TREE_OF_LIFE: 'tree-of-life',                       // 生命之树 10原质
  CUSTOM: 'custom',                                   // 自定义
});

// ===== 预设框架定义 =====

/**
 * 构建均匀分布的层定义（辅助函数）
 * @param {Array<{id, type, name, description}>} layerSpecs - 层规格
 * @param {Object} [options] - 选项
 * @param {boolean} [options.allCanRecord=true] - 是否都可记录
 * @param {Array<string>} [options.externalIds=[]] - 外置层ID列表
 * @returns {Array} DEFAULT_LAYERS格式
 */
function buildEvenLayers(layerSpecs, options = {}) {
  const { allCanRecord = true, externalIds = [] } = options;
  const n = layerSpecs.length;
  const slice = 1 / n;
  return layerSpecs.map((spec, i) => ({
    id: spec.id,
    type: spec.type || `custom-${spec.id}`,
    name: spec.name,
    verticalRange: [i * slice, (i + 1) * slice],
    isExternal: externalIds.includes(spec.id),
    canRecord: allCanRecord,
    description: spec.description || '',
  }));
}

// ----- 框架1: 6层+2外置（默认，直接引用DEFAULT_LAYERS）-----
const FRAMEWORK_SIX_LAYER_TWO_EXTERNAL = Object.freeze({
  id: FrameworkId.SIX_LAYER_TWO_EXTERNAL,
  name: '6层+2外置',
  partitionCount: 8,
  description: '通用，显意识/潜意识分层（默认）',
  applicableScene: '通用，显意识/潜意识分层',
  layerDefs: DEFAULT_LAYERS,
});

// ----- 框架2: 三网络 DMN/CEN/SN -----
const FRAMEWORK_THREE_NETWORK = Object.freeze({
  id: FrameworkId.THREE_NETWORK,
  name: '三网络',
  partitionCount: 3,
  description: 'DMN/CEN/SN，脑科学实证，简洁',
  applicableScene: '简洁，脑科学实证',
  layerDefs: buildEvenLayers([
    { id: 'net-dmn', name: 'DMN', type: LayerType.SUBCONSCIOUS_DEEP, description: '默认模式网络：内省、自传体记忆、心智游移' },
    { id: 'net-sn', name: 'SN', type: LayerType.SUBCONSCIOUS_SHALLOW, description: '凸显网络：显著性检测、网络切换' },
    { id: 'net-cen', name: 'CEN', type: LayerType.CONSCIOUS_SHALLOW, description: '中央执行网络：执行控制、工作记忆' },
  ]),
});

// ----- 框架3: 曼陀罗 方向+中心（5分区）-----
const FRAMEWORK_MANDALA = Object.freeze({
  id: FrameworkId.MANDALA,
  name: '曼陀罗',
  partitionCount: 5,
  description: '方向+中心，方向感强，自我探索',
  applicableScene: '方向感强，自我探索',
  layerDefs: buildEvenLayers([
    { id: 'mandala-east', name: '东', description: '方向·东 — 起点、新生、行动' },
    { id: 'mandala-south', name: '南', description: '方向·南 — 情感、热情、直觉' },
    { id: 'mandala-center', name: '中心', description: '中心 — 自我、整合、觉察' },
    { id: 'mandala-west', name: '西', description: '方向·西 — 内省、反思、放下' },
    { id: 'mandala-north', name: '北', description: '方向·北 — 智慧、超越、静观' },
  ]),
});

// ----- 框架4: 原型 阴影/人格面具/自性/阿尼玛（4分区）-----
const FRAMEWORK_ARCHETYPE = Object.freeze({
  id: FrameworkId.ARCHETYPE,
  name: '原型',
  partitionCount: 4,
  description: '阴影/人格面具/自性/阿尼玛，深度心理探索',
  applicableScene: '深度心理探索',
  layerDefs: buildEvenLayers([
    { id: 'arch-persona', name: '人格面具', type: LayerType.CONSCIOUS_SHALLOW, description: 'Persona — 对外呈现的自我' },
    { id: 'arch-ego', name: '自我', type: LayerType.CONSCIOUS_DEEP, description: 'Ego — 意识中心' },
    { id: 'arch-shadow', name: '阴影', type: LayerType.SUBCONSCIOUS_SHALLOW, description: 'Shadow — 被压抑或否认的部分' },
    { id: 'arch-anima', name: '自性/阿尼玛', type: LayerType.SUBCONSCIOUS_DEEP, description: 'Self/Anima — 深层整合与内在' },
  ]),
});

// ----- 框架5: 脑区 前额叶/海马/杏仁核/小脑/脑干（5分区）-----
const FRAMEWORK_BRAIN_REGION = Object.freeze({
  id: FrameworkId.BRAIN_REGION,
  name: '脑区',
  partitionCount: 5,
  description: '前额叶/海马/杏仁核/小脑/脑干，功能定位',
  applicableScene: '功能定位',
  layerDefs: buildEvenLayers([
    { id: 'brain-pfc', name: '前额叶', type: LayerType.CONSCIOUS_SHALLOW, description: 'PFC — 执行功能、决策、规划' },
    { id: 'brain-hippocampus', name: '海马', type: LayerType.CONSCIOUS_MIDDLE, description: 'Hippocampus — 记忆编码、空间导航' },
    { id: 'brain-amygdala', name: '杏仁核', type: LayerType.SUBCONSCIOUS_SHALLOW, description: 'Amygdala — 情绪反应、恐惧' },
    { id: 'brain-cerebellum', name: '小脑', type: LayerType.SUBCONSCIOUS_MIDDLE, description: 'Cerebellum — 运动协调、自动化' },
    { id: 'brain-brainstem', name: '脑干', type: LayerType.SUBCONSCIOUS_DEEP, description: 'Brainstem — 本能、生理调节' },
  ]),
});

// ----- 框架6: 八维 Ne/Ni/Se/Si/Te/Ti/Fe/Fi（8分区）-----
const FRAMEWORK_EIGHT_DIMENSION = Object.freeze({
  id: FrameworkId.EIGHT_DIMENSION,
  name: '八维',
  partitionCount: 8,
  description: 'Ne/Ni/Se/Si/Te/Ti/Fe/Fi，认知功能细分',
  applicableScene: '认知功能细分',
  layerDefs: buildEvenLayers([
    { id: 'mbti-ne', name: 'Ne', description: '外倾直觉 — 可能性发散、头脑风暴' },
    { id: 'mbti-ni', name: 'Ni', description: '内倾直觉 — 模式洞察、预感' },
    { id: 'mbti-se', name: 'Se', description: '外倾感觉 — 当下体验、感官敏锐' },
    { id: 'mbti-si', name: 'Si', description: '内倾感觉 — 经验回忆、细节记忆' },
    { id: 'mbti-te', name: 'Te', description: '外倾思考 — 目标导向、系统组织' },
    { id: 'mbti-ti', name: 'Ti', description: '内倾思考 — 逻辑分析、原理构建' },
    { id: 'mbti-fe', name: 'Fe', description: '外倾情感 — 群体和谐、情感共鸣' },
    { id: 'mbti-fi', name: 'Fi', description: '内倾情感 — 价值判断、内在信念' },
  ]),
});

// ----- 框架7: 生命之树 10原质（10分区）-----
const FRAMEWORK_TREE_OF_LIFE = Object.freeze({
  id: FrameworkId.TREE_OF_LIFE,
  name: '生命之树',
  partitionCount: 10,
  description: '10原质，复杂思考',
  applicableScene: '复杂思考',
  layerDefs: buildEvenLayers([
    { id: 'tol-kether', name: 'Kether', description: '王冠 — 纯粹存在、源头' },
    { id: 'tol-chokmah', name: 'Chokmah', description: '智慧 — 原动、阳' },
    { id: 'tol-binah', name: 'Binah', description: '理解 — 形式、阴' },
    { id: 'tol-chesed', name: 'Chesed', description: '慈悲 — 扩展、丰盛' },
    { id: 'tol-geburah', name: 'Geburah', description: '严厉 — 收束、审判' },
    { id: 'tol-tiphareth', name: 'Tiphareth', description: '美 — 平衡、中心' },
    { id: 'tol-netzach', name: 'Netzach', description: '胜利 — 情感、欲望' },
    { id: 'tol-hod', name: 'Hod', description: '荣耀 — 理智、语言' },
    { id: 'tol-yesod', name: 'Yesod', description: '根基 — 潜意识、影像' },
    { id: 'tol-malkuth', name: 'Malkuth', description: '王国 — 物质、显现' },
  ]),
});

// ===== 预设框架表 =====

export const PRESET_FRAMEWORKS = Object.freeze([
  FRAMEWORK_SIX_LAYER_TWO_EXTERNAL,
  FRAMEWORK_THREE_NETWORK,
  FRAMEWORK_MANDALA,
  FRAMEWORK_ARCHETYPE,
  FRAMEWORK_BRAIN_REGION,
  FRAMEWORK_EIGHT_DIMENSION,
  FRAMEWORK_TREE_OF_LIFE,
]);

// ===== CognitiveFrameworkSystem类 =====

/**
 * 认知框架系统 — 管理8种预设+自定义框架，支持切换
 *
 * 核心职责:
 *   1. 注册/查询框架（预设+自定义）
 *   2. 切换框架：将框架的层定义应用到LayerSystem（重建层）
 *   3. 自定义框架管理
 *   4. 查询当前激活框架
 *
 * 不职责:
 *   - 不渲染框架切换UI（交给interaction/framework-switcher.js）
 *   - 不持久化框架配置（交给persistence/layer-bridge.js）
 *   - 不管理层内部逻辑（由LayerSystem负责）
 */
export class CognitiveFrameworkSystem {
  /**
   * @param {Object} options
   * @param {import('./layer.js').LayerSystem} [options.layerSystem] - 被管理的层系统
   */
  constructor({ layerSystem } = {}) {
    /** @type {Map<string, FrameworkDefinition>} 已注册框架（id → 定义） */
    this._frameworks = new Map();
    /** @type {string|null} 当前激活的框架ID */
    this._activeFrameworkId = null;
    /** @type {import('./layer.js').LayerSystem|null} 关联的层系统 */
    this.layerSystem = layerSystem || null;

    // 注册预设框架
    for (const fw of PRESET_FRAMEWORKS) {
      this._frameworks.set(fw.id, fw);
    }
  }

  // ===== 框架注册 =====

  /**
   * 注册自定义框架
   * @param {FrameworkDefinition} framework
   * @returns {boolean} 是否注册成功
   */
  registerFramework(framework) {
    if (!framework || !framework.id || !Array.isArray(framework.layerDefs)) return false;
    if (this._frameworks.has(framework.id)) return false;
    this._frameworks.set(framework.id, Object.freeze({ ...framework }));
    return true;
  }

  /**
   * 注销框架（预设框架不可注销）
   * @param {string} frameworkId
   * @returns {boolean}
   */
  unregisterFramework(frameworkId) {
    if (PRESET_FRAMEWORKS.some((f) => f.id === frameworkId)) return false;
    return this._frameworks.delete(frameworkId);
  }

  // ===== 框架查询 =====

  /**
   * 获取所有已注册框架
   * @returns {Array<FrameworkDefinition>}
   */
  getFrameworks() {
    return Array.from(this._frameworks.values());
  }

  /**
   * 按ID获取框架
   * @param {string} frameworkId
   * @returns {FrameworkDefinition|null}
   */
  getFramework(frameworkId) {
    return this._frameworks.get(frameworkId) || null;
  }

  /**
   * 获取当前激活框架
   * @returns {FrameworkDefinition|null}
   */
  getActiveFramework() {
    return this._activeFrameworkId ? this._frameworks.get(this._activeFrameworkId) || null : null;
  }

  /**
   * 是否为预设框架
   * @param {string} frameworkId
   * @returns {boolean}
   */
  isPreset(frameworkId) {
    return PRESET_FRAMEWORKS.some((f) => f.id === frameworkId);
  }

  // ===== 框架切换 =====

  /**
   * 切换到指定框架（将层定义应用到LayerSystem）
   * @param {string} frameworkId
   * @returns {boolean} 是否切换成功
   */
  switchTo(frameworkId) {
    const fw = this._frameworks.get(frameworkId);
    if (!fw) return false;
    if (!this.layerSystem) {
      this._activeFrameworkId = frameworkId;
      return true;
    }
    // 重建LayerSystem的层
    // 先移除所有现有层
    const existingLayers = this.layerSystem.getLayers();
    for (const layer of existingLayers) {
      this.layerSystem.removeLayer(layer.id);
    }
    // 添加新框架的层
    for (const def of fw.layerDefs) {
      this.layerSystem.addLayer(def);
    }
    this._activeFrameworkId = frameworkId;
    return true;
  }

  /**
   * 绑定LayerSystem（如未在构造时传入）
   * @param {import('./layer.js').LayerSystem} layerSystem
   */
  bindLayerSystem(layerSystem) {
    this.layerSystem = layerSystem;
    // 如已有激活框架，应用到新绑定的层系统
    if (this._activeFrameworkId) {
      const fw = this._frameworks.get(this._activeFrameworkId);
      if (fw) {
        const existing = layerSystem.getLayers();
        for (const l of existing) layerSystem.removeLayer(l.id);
        for (const def of fw.layerDefs) layerSystem.addLayer(def);
      }
    }
  }

  // ===== 自定义框架创建 =====

  /**
   * 创建自定义框架
   * @param {Object} options
   * @param {string} options.id - 框架ID（不可与预设冲突）
   * @param {string} options.name - 框架名称
   * @param {string} [options.description] - 描述
   * @param {Array} options.layerDefs - 层定义数组
   * @returns {FrameworkDefinition|null} 创建的框架（注册失败返回null）
   */
  createCustomFramework({ id, name, description = '', layerDefs }) {
    if (!id || !name || !Array.isArray(layerDefs) || layerDefs.length === 0) return null;
    if (id === FrameworkId.CUSTOM) {
      // CUSTOM是个特殊槽位，允许覆盖
    } else if (this._frameworks.has(id)) {
      return null;
    }
    const fw = Object.freeze({
      id,
      name,
      partitionCount: layerDefs.length,
      description: description || '用户自定义框架',
      applicableScene: '用户定义',
      layerDefs,
    });
    this._frameworks.set(id, fw);
    return fw;
  }

  // ===== 摘要（供AI排查）=====

  /**
   * 获取框架系统摘要
   * @returns {Object}
   */
  getSummary() {
    return {
      registeredCount: this._frameworks.size,
      presetCount: PRESET_FRAMEWORKS.length,
      activeFrameworkId: this._activeFrameworkId,
      activeFrameworkName: this.getActiveFramework()?.name || null,
      frameworks: this.getFrameworks().map((f) => ({
        id: f.id,
        name: f.name,
        partitionCount: f.partitionCount,
        isPreset: this.isPreset(f.id),
      })),
    };
  }
}

// ===== 默认导出 =====

export default CognitiveFrameworkSystem;

/**
 * @typedef {Object} FrameworkDefinition
 * @property {string} id - 框架ID（FrameworkId枚举值或自定义ID）
 * @property {string} name - 框架名称
 * @property {number} partitionCount - 分区数
 * @property {string} description - 描述
 * @property {string} applicableScene - 适用场景
 * @property {Array} layerDefs - 层定义数组（格式同DEFAULT_LAYERS项）
 */
