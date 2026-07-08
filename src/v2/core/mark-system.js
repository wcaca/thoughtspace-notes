/**
 * [INPUT]: MarkType定义 + 3D空间坐标
 * [OUTPUT]: MarkSystem类 — 标记系统抽象（三系统统一: 参考系+标记+容器）
 * [POS]: src/v2/core/mark-system.js,L1领域核心层,空间组织器基础
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §4空间组织器
 *   - §4.1 三系统统一: 参考系+标记+容器是同一个系统的三种表现
 *   - §4.2 阻尼组件: 空间组织器的特殊实例
 *   - §4.3 标记功能: 线/面/体作为标记
 *
 * 核心概念:
 *   任何参考系同时也是容器和标记。
 *   任何容器同时也是参考系和标记。
 *   任何标记同时也是参考系和容器。
 *   这三者统一成"空间组织器"。
 *
 * 三系统能力声明:
 *   每种MarkType可声明三种能力:
 *   - asReference: 可作为参考系（定义坐标系）
 *   - asContainer: 可作为容器（分区/边界）
 *   - asMarker: 可作为标记（视觉标记）
 *
 * 预设MarkType:
 *   - layer: 层（6层+2外置的预设实例类型）
 *   - reference-line: 参考线
 *   - damper: 阻尼组件
 *   - container-boundary: 容器边界
 *   - orbit-path: 轨道路径（视角轨道）
 *   - anchor: 锚点
 *
 * @note(s1, decision, space-organizer, since:2026-07-08)
 *   S1-A.2: 空间组织器抽象基础，layer/view-orbit/damper都是其预设实例。
 *   三方联动: mark-system ↔ space ↔ view-orbit 可联动。
 */

// ===== 标记几何形状 =====

export const MarkGeometry = Object.freeze({
  LINE: 'line',           // 线（旋转轴/参考线）
  PLANE: 'plane',         // 面（切片/分区边界）
  VOLUME: 'volume',       // 体（封闭空间/容器）
  POINT: 'point',         // 点（锚点）
  PATH: 'path',           // 路径（轨道路径）
});

// ===== 预设MarkType名称 =====

export const PresetMarkType = Object.freeze({
  LAYER: 'layer',                    // 层
  REFERENCE_LINE: 'reference-line',  // 参考线
  DAMPER: 'damper',                  // 阻尼组件
  CONTAINER_BOUNDARY: 'container-boundary', // 容器边界
  ORBIT_PATH: 'orbit-path',          // 轨道路径
  ANCHOR: 'anchor',                  // 锚点
});

// ===== 预设MarkType定义 =====

const PRESET_MARK_TYPES = Object.freeze({
  [PresetMarkType.LAYER]: {
    name: PresetMarkType.LAYER,
    geometry: MarkGeometry.PLANE,
    asReference: true,    // 层定义垂直坐标参考
    asContainer: true,    // 层是容器（容纳念头）
    asMarker: true,       // 层边界是标记
    description: '层 — 6层+2外置的预设实例类型',
  },
  [PresetMarkType.REFERENCE_LINE]: {
    name: PresetMarkType.REFERENCE_LINE,
    geometry: MarkGeometry.LINE,
    asReference: true,    // 参考线定义坐标参考
    asContainer: false,
    asMarker: true,       // 参考线是视觉标记
    description: '参考线 — 作为旋转轴/参考线',
  },
  [PresetMarkType.DAMPER]: {
    name: PresetMarkType.DAMPER,
    geometry: MarkGeometry.VOLUME,
    asReference: true,    // 阻尼组件位置定义正面/背面
    asContainer: true,    // 阻尼组件是容器（承载盲点内容）
    asMarker: true,       // 阻尼组件边界是标记
    description: '阻尼组件 — 空间组织器特殊实例，承载盲点/阴暗面',
  },
  [PresetMarkType.CONTAINER_BOUNDARY]: {
    name: PresetMarkType.CONTAINER_BOUNDARY,
    geometry: MarkGeometry.PLANE,
    asReference: true,    // 容器边界定义分区参考
    asContainer: true,    // 容器边界本身就是容器边界
    asMarker: true,       // 容器边界是标记
    description: '容器边界 — 分区边界',
  },
  [PresetMarkType.ORBIT_PATH]: {
    name: PresetMarkType.ORBIT_PATH,
    geometry: MarkGeometry.PATH,
    asReference: true,    // 轨道路径定义视角参考
    asContainer: false,
    asMarker: true,       // 轨道路径是标记
    description: '轨道路径 — 视角沿圆周表面转动的路径',
  },
  [PresetMarkType.ANCHOR]: {
    name: PresetMarkType.ANCHOR,
    geometry: MarkGeometry.POINT,
    asReference: true,    // 锚点定义坐标参考
    asContainer: false,
    asMarker: true,       // 锚点是标记
    description: '锚点 — 空间中的参考点',
  },
});

// ===== MarkSystem类 =====

/**
 * 标记系统 — 空间组织器统一抽象
 *
 * 核心职责:
 *   1. MarkType注册管理（注册/查询/删除标记类型）
 *   2. Mark实例管理（创建/查询/删除标记实例）
 *   3. 三系统能力查询（判断标记是否可作为参考系/容器/标记）
 *   4. 空间查询（按位置/类型/区域查询标记）
 *
 * 不职责:
 *   - 不渲染标记（交给render层）
 *   - 不管理空间边界（交给space.js）
 *   - 不管理视角（交给view-orbit.js）
 */
export class MarkSystem {
  constructor() {
    /** @type {Map<string, MarkTypeDef>} MarkType注册表 */
    this._markTypes = new Map();
    /** @type {Map<string, MarkInstance>} Mark实例存储 */
    this._instances = new Map();

    // 注册预设MarkType
    for (const [name, def] of Object.entries(PRESET_MARK_TYPES)) {
      this._markTypes.set(name, { ...def });
    }
  }

  // ===== MarkType注册管理 =====

  /**
   * 注册新的MarkType
   * @param {Object} typeDef - MarkType定义
   * @param {string} typeDef.name - 类型名
   * @param {string} typeDef.geometry - MarkGeometry枚举值
   * @param {boolean} [typeDef.asReference] - 可作为参考系
   * @param {boolean} [typeDef.asContainer] - 可作为容器
   * @param {boolean} [typeDef.asMarker] - 可作为标记
   * @param {string} [typeDef.description] - 描述
   * @returns {boolean} 是否注册成功
   */
  registerType(typeDef) {
    if (!typeDef || !typeDef.name || !typeDef.geometry) {
      return false;
    }
    if (this._markTypes.has(typeDef.name)) {
      return false; // 已存在
    }
    this._markTypes.set(typeDef.name, {
      name: typeDef.name,
      geometry: typeDef.geometry,
      asReference: typeDef.asReference || false,
      asContainer: typeDef.asContainer || false,
      asMarker: typeDef.asMarker || false,
      description: typeDef.description || '',
    });
    return true;
  }

  /**
   * 获取MarkType定义
   * @param {string} typeName
   * @returns {MarkTypeDef|null}
   */
  getType(typeName) {
    return this._markTypes.get(typeName) || null;
  }

  /**
   * 获取所有MarkType
   * @returns {Array<MarkTypeDef>}
   */
  listTypes() {
    return Array.from(this._markTypes.values());
  }

  /**
   * 查询具有某种能力的MarkType
   * @param {'asReference'|'asContainer'|'asMarker'} capability
   * @returns {Array<MarkTypeDef>}
   */
  getTypesByCapability(capability) {
    return this.listTypes().filter((t) => t[capability] === true);
  }

  // ===== Mark实例管理 =====

  /**
   * 创建Mark实例
   * @param {Object} options
   * @param {string} options.typeName - MarkType名称
   * @param {string} [options.id] - 实例ID（自动生成如不传）
   * @param {Object} options.position - 3D空间位置/形状定义
   * @param {Object} [options.properties] - 自定义属性
   * @param {string} [options.parentSpaceId] - 所属空间ID
   * @returns {MarkInstance|null} 创建的实例（失败返回null）
   */
  createInstance({ typeName, id, position, properties = {}, parentSpaceId = null } = {}) {
    const typeDef = this._markTypes.get(typeName);
    if (!typeDef) {
      return null;
    }
    const instance = {
      id: id || `mark-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      typeName,
      position,
      properties: { ...properties },
      parentSpaceId,
      createdAt: Date.now(),
    };
    this._instances.set(instance.id, instance);
    return instance;
  }

  /**
   * 获取Mark实例
   * @param {string} instanceId
   * @returns {MarkInstance|null}
   */
  getInstance(instanceId) {
    return this._instances.get(instanceId) || null;
  }

  /**
   * 删除Mark实例
   * @param {string} instanceId
   * @returns {boolean}
   */
  removeInstance(instanceId) {
    return this._instances.delete(instanceId);
  }

  /**
   * 获取所有Mark实例
   * @returns {Array<MarkInstance>}
   */
  listInstances() {
    return Array.from(this._instances.values());
  }

  // ===== 空间查询 =====

  /**
   * 按类型查询实例
   * @param {string} typeName
   * @returns {Array<MarkInstance>}
   */
  getInstancesByType(typeName) {
    return this.listInstances().filter((i) => i.typeName === typeName);
  }

  /**
   * 按空间查询实例
   * @param {string} parentSpaceId
   * @returns {Array<MarkInstance>}
   */
  getInstancesBySpace(parentSpaceId) {
    return this.listInstances().filter((i) => i.parentSpaceId === parentSpaceId);
  }

  /**
   * 按能力查询实例
   * @param {'asReference'|'asContainer'|'asMarker'} capability
   * @returns {Array<MarkInstance>}
   */
  getInstancesByCapability(capability) {
    const capableTypes = new Set(
      this.getTypesByCapability(capability).map((t) => t.name)
    );
    return this.listInstances().filter((i) => capableTypes.has(i.typeName));
  }

  /**
   * 查询某位置的标记（简化版，精确空间查询由spatial-query.js负责）
   * @param {number} x, y, z - 3D坐标
   * @param {number} [tolerance=0.5] - 容差
   * @returns {Array<MarkInstance>}
   */
  getInstancesAtPosition(x, y, z, tolerance = 0.5) {
    return this.listInstances().filter((i) => {
      const p = i.position;
      if (p && typeof p.x === 'number' && typeof p.y === 'number' && typeof p.z === 'number') {
        const dx = p.x - x;
        const dy = p.y - y;
        const dz = p.z - z;
        return Math.sqrt(dx * dx + dy * dy + dz * dz) <= tolerance;
      }
      return false;
    });
  }

  // ===== 三方联动接口 =====

  /**
   * 获取可作为参考系的标记（供view-orbit联动）
   * @returns {Array<MarkInstance>}
   */
  getReferences() {
    return this.getInstancesByCapability('asReference');
  }

  /**
   * 获取可作为容器的标记（供layer联动）
   * @returns {Array<MarkInstance>}
   */
  getContainers() {
    return this.getInstancesByCapability('asContainer');
  }

  // ===== 摘要（供AI排查）=====

  /**
   * 获取标记系统摘要
   * @returns {Object}
   */
  getSummary() {
    return {
      typeCount: this._markTypes.size,
      instanceCount: this._instances.size,
      types: this.listTypes().map((t) => ({
        name: t.name,
        geometry: t.geometry,
        asReference: t.asReference,
        asContainer: t.asContainer,
        asMarker: t.asMarker,
      })),
      instancesByType: this._countByType(),
    };
  }

  _countByType() {
    const counts = {};
    for (const inst of this._instances.values()) {
      counts[inst.typeName] = (counts[inst.typeName] || 0) + 1;
    }
    return counts;
  }
}

export default MarkSystem;
