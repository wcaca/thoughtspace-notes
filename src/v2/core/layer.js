/**
 * [INPUT]: mark-system.js + space.js坐标系
 * [OUTPUT]: LayerSystem类 — 6层+2外置层系统（基于mark-system预设实例化）
 * [POS]: src/v2/core/layer.js,L1领域核心层,层系统
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.2默认结构、§6层操作
 *   - §1.2 6层3D主体(3显意识+3潜意识) + 2外置层(顶层"规则"/底层"结构")
 *   - §1.2 近大远小: 越接近视角起点的层越大、可存在数量越多
 *   - §6.1 念头的层归属: 创建位置决定，拖动可改变，8层都可见
 *   - §6.2 层间移动: 自由移动，有阻尼
 *   - §6.3 顶层和底层的填充: 用户主动写+自动迁移规则
 *
 * 核心设计:
 *   层不是硬编码的6层，而是通过mark-system创建的layer类型实例。
 *   默认8层结构只是mark-system的一种预设组合（非固定物理结构）。
 *   用户可增减层、修改层定义、自定义层归属规则。
 *
 * 8层默认结构（垂直维度 0.0~1.0）:
 *   0.00-0.10: 底层外置"结构"（3D空间，可记录）
 *   0.10-0.27: 潜意识·深层（小）
 *   0.27-0.43: 潜意识·中层
 *   0.43-0.50: 潜意识·表层（分界线附近）
 *   0.50-0.57: 显意识·深层（分界线附近）
 *   0.57-0.73: 显意识·中层
 *   0.73-0.90: 显意识·表层（大）
 *   0.90-1.00: 顶层外置"规则"（3D空间，可记录）
 *
 * @note(s1, decision, preset-instance, since:2026-07-08)
 *   S1-A.3: 层系统基于mark-system预设实例化，非硬编码。
 *   cognitive-framework依赖此组件（框架=层的预设组合）。
 */

import { MarkSystem, PresetMarkType } from './mark-system.js';

// ===== 层类型枚举 =====

export const LayerType = Object.freeze({
  TOP_EXTERNAL: 'top-external',        // 顶层外置"规则"
  CONSCIOUS_SHALLOW: 'conscious-shallow',  // 显意识·表层（大）
  CONSCIOUS_MIDDLE: 'conscious-middle',    // 显意识·中层
  CONSCIOUS_DEEP: 'conscious-deep',        // 显意识·深层
  SUBCONSCIOUS_DEEP: 'subconscious-deep',  // 潜意识·深层
  SUBCONSCIOUS_MIDDLE: 'subconscious-middle', // 潜意识·中层
  SUBCONSCIOUS_SHALLOW: 'subconscious-shallow', // 潜意识·表层（小）
  BOTTOM_EXTERNAL: 'bottom-external',   // 底层外置"结构"
});

// ===== 默认8层定义 =====

export const DEFAULT_LAYERS = Object.freeze([
  {
    id: 'layer-bottom-external',
    type: LayerType.BOTTOM_EXTERNAL,
    name: '结构',
    verticalRange: [0.00, 0.10],
    isExternal: true,
    canRecord: true,
    description: '底层外置 — 记录外部物质/结构（信念难改变的部分）',
  },
  {
    id: 'layer-sub-deep',
    type: LayerType.SUBCONSCIOUS_DEEP,
    name: '潜意识·深层',
    verticalRange: [0.10, 0.27],
    isExternal: false,
    canRecord: true,
    description: '潜意识深层（小，近大远小的远端）',
  },
  {
    id: 'layer-sub-middle',
    type: LayerType.SUBCONSCIOUS_MIDDLE,
    name: '潜意识·中层',
    verticalRange: [0.27, 0.43],
    isExternal: false,
    canRecord: true,
    description: '潜意识中层',
  },
  {
    id: 'layer-sub-shallow',
    type: LayerType.SUBCONSCIOUS_SHALLOW,
    name: '潜意识·表层',
    verticalRange: [0.43, 0.50],
    isExternal: false,
    canRecord: true,
    description: '潜意识表层（分界线附近）',
  },
  {
    id: 'layer-con-deep',
    type: LayerType.CONSCIOUS_DEEP,
    name: '显意识·深层',
    verticalRange: [0.50, 0.57],
    isExternal: false,
    canRecord: true,
    description: '显意识深层（分界线附近）',
  },
  {
    id: 'layer-con-middle',
    type: LayerType.CONSCIOUS_MIDDLE,
    name: '显意识·中层',
    verticalRange: [0.57, 0.73],
    isExternal: false,
    canRecord: true,
    description: '显意识中层',
  },
  {
    id: 'layer-con-shallow',
    type: LayerType.CONSCIOUS_SHALLOW,
    name: '显意识·表层',
    verticalRange: [0.73, 0.90],
    isExternal: false,
    canRecord: true,
    description: '显意识表层（大，近大远小的近端）',
  },
  {
    id: 'layer-top-external',
    type: LayerType.TOP_EXTERNAL,
    name: '规则',
    verticalRange: [0.90, 1.00],
    isExternal: true,
    canRecord: true,
    description: '顶层外置 — 记录外部规则（信念难改变的部分）',
  },
]);

// ===== LayerSystem类 =====

/**
 * 层系统 — 6层+2外置层管理
 *
 * 核心职责:
 *   1. 基于 mark-system 创建 layer 类型的预设实例
 *   2. 管理默认8层结构（6层主体+2外置）
 *   3. 层查询（按ID/按垂直位置/按名称/按类型）
 *   4. 层归属判断（念头在哪个层）
 *   5. 近大远小计算
 *   6. 支持自定义层（增减层、修改层定义）
 *
 * 不职责:
 *   - 不渲染层（交给render/layer-renderer.js）
 *   - 不管理层间移动的阻尼（由空间组织器提供）
 *   - 不管理念头实体（交给thought.js）
 */
export class LayerSystem {
  /**
   * @param {Object} options
   * @param {MarkSystem} [options.markSystem] - 标记系统实例（如不传则内部创建）
   * @param {Array} [options.layers] - 层定义（默认使用DEFAULT_LAYERS）
   * @param {string} [options.parentSpaceId] - 所属空间ID
   */
  constructor({ markSystem, layers, parentSpaceId = null } = {}) {
    /** @type {MarkSystem} 标记系统实例 */
    this.markSystem = markSystem || new MarkSystem();
    /** @type {string|null} 所属空间ID */
    this.parentSpaceId = parentSpaceId;
    /** @type {Array<LayerDef>} 层定义列表（按verticalRange排序） */
    this._layers = [];

    // 初始化层定义
    const layerDefs = layers || DEFAULT_LAYERS;
    for (const def of layerDefs) {
      this._addLayer(def);
    }
  }

  // ===== 层管理 =====

  /**
   * 添加层（内部方法，创建mark-system实例）
   * @param {LayerDef} def - 层定义
   * @private
   */
  _addLayer(def) {
    // 基于 mark-system 创建 layer 类型的实例
    const instance = this.markSystem.createInstance({
      typeName: PresetMarkType.LAYER,
      id: def.id,
      position: {
        // 层的垂直中心位置
        y: (def.verticalRange[0] + def.verticalRange[1]) / 2,
      },
      properties: {
        type: def.type,
        name: def.name,
        verticalRange: [...def.verticalRange],
        isExternal: def.isExternal,
        canRecord: def.canRecord,
        description: def.description,
      },
      parentSpaceId: this.parentSpaceId,
    });

    this._layers.push({
      ...def,
      markInstanceId: instance ? instance.id : null,
    });

    // 保持按verticalRange排序
    this._layers.sort((a, b) => a.verticalRange[0] - b.verticalRange[0]);
  }

  /**
   * 添加自定义层
   * @param {LayerDef} def - 层定义
   * @returns {boolean} 是否添加成功
   */
  addLayer(def) {
    if (!def || !def.id || !def.verticalRange) return false;
    if (this._layers.some((l) => l.id === def.id)) return false;
    this._addLayer(def);
    return true;
  }

  /**
   * 移除层
   * @param {string} layerId
   * @returns {boolean}
   */
  removeLayer(layerId) {
    const idx = this._layers.findIndex((l) => l.id === layerId);
    if (idx === -1) return false;
    const layer = this._layers[idx];
    if (layer.markInstanceId) {
      this.markSystem.removeInstance(layer.markInstanceId);
    }
    this._layers.splice(idx, 1);
    return true;
  }

  /**
   * 更新层定义
   * @param {string} layerId
   * @param {Object} partial - 部分更新
   * @returns {boolean}
   */
  updateLayer(layerId, partial) {
    const layer = this._layers.find((l) => l.id === layerId);
    if (!layer) return false;
    Object.assign(layer, partial);
    // 同步到mark-system实例
    if (layer.markInstanceId) {
      const inst = this.markSystem.getInstance(layer.markInstanceId);
      if (inst) {
        Object.assign(inst.properties, partial);
      }
    }
    return true;
  }

  // ===== 层查询 =====

  /**
   * 获取所有层
   * @returns {Array<LayerDef>}
   */
  getLayers() {
    return [...this._layers];
  }

  /**
   * 按ID获取层
   * @param {string} layerId
   * @returns {LayerDef|null}
   */
  getLayer(layerId) {
    return this._layers.find((l) => l.id === layerId) || null;
  }

  /**
   * 按类型获取层
   * @param {string} layerType - LayerType枚举值
   * @returns {LayerDef|null}
   */
  getLayerByType(layerType) {
    return this._layers.find((l) => l.type === layerType) || null;
  }

  /**
   * 按名称获取层
   * @param {string} name
   * @returns {LayerDef|null}
   */
  getLayerByName(name) {
    return this._layers.find((l) => l.name === name) || null;
  }

  /**
   * 按垂直位置查询层归属（§6.1 创建位置决定层归属）
   * @param {number} vertical - 垂直维度坐标 0.0~1.0
   * @returns {LayerDef|null}
   */
  getLayerByVerticalPosition(vertical) {
    return (
      this._layers.find(
        (l) => vertical >= l.verticalRange[0] && vertical < l.verticalRange[1]
      ) || null
    );
  }

  /**
   * 获取外置层
   * @returns {Array<LayerDef>}
   */
  getExternalLayers() {
    return this._layers.filter((l) => l.isExternal);
  }

  /**
   * 获取主体层（6层）
   * @returns {Array<LayerDef>}
   */
  getMainLayers() {
    return this._layers.filter((l) => !l.isExternal);
  }

  // ===== 近大远小计算 =====

  /**
   * 计算层的显示缩放（近大远小）
   * 越接近视角起点（显意识·表层）的层越大
   * @param {string} layerId
   * @param {number} [viewVertical=0.8] - 当前视角的垂直位置（默认0.8=显意识表层附近）
   * @returns {number} 缩放系数 0.3~1.0
   */
  getLayerScale(layerId, viewVertical = 0.8) {
    const layer = this.getLayer(layerId);
    if (!layer) return 1.0;
    const layerCenter = (layer.verticalRange[0] + layer.verticalRange[1]) / 2;
    // 距离视角起点的垂直距离
    const distance = Math.abs(layerCenter - viewVertical);
    // 近大远小: 距离0=1.0, 距离0.5=0.3
    const scale = 1.0 - (distance / 0.5) * 0.7;
    return Math.max(0.3, Math.min(1.0, scale));
  }

  /**
   * 获取层的Y坐标范围（3D空间中）
   * @param {string} layerId
   * @param {Object} spaceSize - 空间尺寸 {x, y, z}
   * @returns {{yMin, yMax}|null}
   */
  getLayerYRange(layerId, spaceSize) {
    const layer = this.getLayer(layerId);
    if (!layer) return null;
    const yMax = (layer.verticalRange[1] - 0.5) * 2 * spaceSize.y;
    const yMin = (layer.verticalRange[0] - 0.5) * 2 * spaceSize.y;
    return { yMin, yMax };
  }

  // ===== 摘要（供AI排查）=====

  /**
   * 获取层系统摘要
   * @returns {Object}
   */
  getSummary() {
    return {
      layerCount: this._layers.length,
      externalCount: this.getExternalLayers().length,
      mainCount: this.getMainLayers().length,
      layers: this._layers.map((l) => ({
        id: l.id,
        type: l.type,
        name: l.name,
        verticalRange: l.verticalRange,
        isExternal: l.isExternal,
      })),
    };
  }
}

export default LayerSystem;
