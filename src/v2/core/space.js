/**
 * [INPUT]: 空间配置（边界形状/尺寸/三维度参数）
 * [OUTPUT]: Space类 — 有限3D念头晶体空间（边界计算/三维度定义/坐标系/子空间支持）
 * [POS]: src/v2/core/space.js,L1领域核心层,空间本体数学基础
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1空间本体
 *   - §1.1 有限3D"念头晶体": 有限边界、紧致堆积、可旋转、可进入子空间
 *   - §1.3 三维度: 上下(垂直)/内外(径向)/圆周(轨道)
 *   - §1.5 空间外部信息边界: 可感知不可操作
 *   - §7 嵌套子空间: 分形自相似
 *
 * 核心概念:
 *   空间不是无限宇宙，是有限3D体——像捧着一个东西。
 *   念头紧致堆积，互相有引力，填满空间。
 *   面是切片，基准面是3D体的切片。
 *
 * 三维度坐标系:
 *   vertical(垂直): 0.0=底层外置 → 1.0=顶层外置，6层主体在0.1~0.9
 *   radial(径向): 0.0=圆心(内层/自我信念) → 1.0=外层表面(表层念头)
 *   orbital(圆周): 0~2π，视角沿圆周表面转动的角度
 *
 * 边界形状:
 *   默认八面体(Octahedron)——象征"念头晶体"
 *   支持自定义边界点集（用户可改空间形状）
 *
 * @note(s1, decision, crystal-boundary, since:2026-07-08)
 *   S1-A.1: 空间本体数学基础，纯逻辑无渲染依赖。
 *   mark-system/view-orbit依赖此组件的坐标系和边界查询。
 */

// ===== 维度枚举 =====

export const Dimension = Object.freeze({
  VERTICAL: 'vertical',    // 上下(垂直): 层堆叠方向
  RADIAL: 'radial',        // 内外(径向): 圆心→外层表面
  ORBITAL: 'orbital',      // 圆周(轨道): 视角转动角度
});

// ===== 边界形状类型 =====

export const BoundaryShape = Object.freeze({
  OCTAHEDRON: 'octahedron',      // 默认: 八面体(念头晶体)
  CUSTOM: 'custom',              // 自定义: 用户定义边界点集
});

// ===== 默认空间配置 =====

const DEFAULT_SPACE_CONFIG = Object.freeze({
  // 边界形状
  shape: BoundaryShape.OCTAHEDRON,
  // 空间尺寸（用户可配置，有限非无限）
  size: { x: 10, y: 10, z: 10 },
  // 三维度参数
  dimensions: {
    [Dimension.VERTICAL]: {
      layerCount: 6,           // 6层主体
      hasTopExternal: true,    // 顶层外置"规则"
      hasBottomExternal: true, // 底层外置"结构"
      nearLargeFarSmall: true, // 近大远小
    },
    [Dimension.RADIAL]: {
      innerLayers: ['信念', '思维', '情绪', '念头'], // 内层层级(可重排)
      outerSurface: '表层念头',
    },
    [Dimension.ORBITAL]: {
      shape: 'irregular',      // 默认不规则轨道
      positions: 5,            // 5个轨道位置(初始/右划1/右划2/右划3/左划)
    },
  },
  // 空间外部信息边界配置(§1.5 C-F3)
  boundary: {
    visible: true,             // 可见
    interactive: false,        // 不可直接操作
  },
});

// ===== 八面体边界计算 =====

/**
 * 八面体边界判断
 * 八面体方程: |x|/a + |y|/b + |z|/c <= 1
 * @param {number} x, y, z - 点坐标
 * @param {Object} size - 半径 {x, y, z}
 * @returns {boolean} 是否在八面体内
 */
function isInsideOctahedron(x, y, z, size) {
  return Math.abs(x) / size.x + Math.abs(y) / size.y + Math.abs(z) / size.z <= 1;
}

/**
 * 八面体顶点
 * @param {Object} size - 半径 {x, y, z}
 * @returns {Array<{x,y,z}>} 6个顶点
 */
function getOctahedronVertices(size) {
  return [
    { x: size.x, y: 0, z: 0 },    // +X
    { x: -size.x, y: 0, z: 0 },   // -X
    { x: 0, y: size.y, z: 0 },    // +Y (顶层)
    { x: 0, y: -size.y, z: 0 },   // -Y (底层)
    { x: 0, y: 0, z: size.z },    // +Z
    { x: 0, y: 0, z: -size.z },   // -Z
  ];
}

// ===== Space类 =====

/**
 * 有限3D念头晶体空间
 *
 * 核心职责:
 *   1. 定义空间边界（有限3D体）
 *   2. 提供三维度坐标系
 *   3. 边界查询（点是否在空间内、层归属、径向深度）
 *   4. 子空间支持（分形嵌套）
 *
 * 不职责:
 *   - 不渲染（交给render/crystal-space.js）
 *   - 不管理层定义（交给layer.js，层是mark-system的预设实例）
 *   - 不管理视角轨道（交给view-orbit.js）
 */
export class Space {
  /**
   * @param {Object} options
   * @param {Object} [options.config] - 空间配置（覆盖默认值）
   * @param {string|null} [options.parentSpaceId] - 父空间ID（null=顶层空间）
   * @param {string|null} [options.id] - 空间ID（null=自动生成）
   */
  constructor({ config = {}, parentSpaceId = null, id = null } = {}) {
    /** @type {string} 空间ID */
    this.id = id || `space-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    /** @type {string|null} 父空间ID（null=顶层空间） */
    this.parentSpaceId = parentSpaceId;
    /** @type {Set<string>} 子空间ID集合 */
    this.subspaceIds = new Set();

    // 合并配置
    this.config = {
      ...DEFAULT_SPACE_CONFIG,
      ...config,
      dimensions: {
        ...DEFAULT_SPACE_CONFIG.dimensions,
        ...(config.dimensions || {}),
      },
      boundary: {
        ...DEFAULT_SPACE_CONFIG.boundary,
        ...(config.boundary || {}),
      },
    };

    // 自定义边界点集（shape=CUSTOM时使用）
    /** @type {Array<{x,y,z}>|null} */
    this._customBoundaryPoints = null;
  }

  // ===== 边界查询 =====

  /**
   * 判断点是否在空间边界内
   * @param {number} x, y, z - 3D坐标
   * @returns {boolean}
   */
  isInside(x, y, z) {
    if (this.config.shape === BoundaryShape.OCTAHEDRON) {
      return isInsideOctahedron(x, y, z, this.config.size);
    }
    if (this.config.shape === BoundaryShape.CUSTOM && this._customBoundaryPoints) {
      // 自定义边界: 凸包判断（简化版，后续S5用convex-hull库）
      return this._isInsideCustomBoundary(x, y, z);
    }
    return false;
  }

  /**
   * 获取边界顶点（供渲染层使用）
   * @returns {Array<{x,y,z}>}
   */
  getBoundaryVertices() {
    if (this.config.shape === BoundaryShape.OCTAHEDRON) {
      return getOctahedronVertices(this.config.size);
    }
    return this._customBoundaryPoints || [];
  }

  /**
   * 设置自定义边界点集
   * @param {Array<{x,y,z}>} points
   */
  setCustomBoundary(points) {
    this.config.shape = BoundaryShape.CUSTOM;
    this._customBoundaryPoints = points;
  }

  // ===== 三维度坐标转换 =====

  /**
   * 三维度坐标 → 3D笛卡尔坐标
   * @param {number} vertical - 垂直维度 0.0(底层外置)~1.0(顶层外置)
   * @param {number} radial - 径向维度 0.0(圆心)~1.0(外层表面)
   * @param {number} orbital - 圆周维度 0~2π
   * @returns {{x, y, z}}
   */
  fromDimensions(vertical, radial, orbital) {
    const size = this.config.size;
    // 垂直: 映射到Y轴，0.0=-size.y(底层), 1.0=+size.y(顶层)
    const y = (vertical - 0.5) * 2 * size.y;
    // 径向+圆周: 极坐标转笛卡尔
    const maxRadius = size.x; // XZ平面最大半径
    const r = radial * maxRadius;
    const x = r * Math.cos(orbital);
    const z = r * Math.sin(orbital);
    return { x, y, z };
  }

  /**
   * 3D笛卡尔坐标 → 三维度坐标
   * @param {number} x, y, z
   * @returns {{vertical, radial, orbital}}
   */
  toDimensions(x, y, z) {
    const size = this.config.size;
    // 垂直
    const vertical = y / (2 * size.y) + 0.5;
    // 径向
    const r = Math.sqrt(x * x + z * z);
    const radial = r / size.x;
    // 圆周
    const orbital = Math.atan2(z, x);
    return { vertical, radial, orbital };
  }

  // ===== 空间外部信息边界（§1.5 C-F3）=====

  /**
   * 获取空间外部信息边界配置
   * @returns {Object} { visible, interactive }
   */
  getBoundaryConfig() {
    return { ...this.config.boundary };
  }

  /**
   * 判断点是否在空间外部信息边界区域
   * 空间外部 = 空间边界外但可见的区域
   * @param {number} x, y, z
   * @returns {boolean}
   */
  isExternalBoundary(x, y, z) {
    // 外部边界区域: 空间边界外、一定范围内
    const size = this.config.size;
    const externalRange = 1.2; // 外部边界范围是空间的1.2倍
    const inExternal =
      Math.abs(x) / (size.x * externalRange) +
      Math.abs(y) / (size.y * externalRange) +
      Math.abs(z) / (size.z * externalRange) <= 1;
    return inExternal && !this.isInside(x, y, z);
  }

  // ===== 子空间管理（§7 分形嵌套）=====

  /**
   * 添加子空间
   * @param {string} subspaceId - 子空间ID
   */
  addSubspace(subspaceId) {
    this.subspaceIds.add(subspaceId);
  }

  /**
   * 移除子空间
   * @param {string} subspaceId
   */
  removeSubspace(subspaceId) {
    this.subspaceIds.delete(subspaceId);
  }

  /**
   * 获取所有子空间ID
   * @returns {Array<string>}
   */
  getSubspaces() {
    return Array.from(this.subspaceIds);
  }

  /**
   * 是否是顶层空间
   * @returns {boolean}
   */
  isTopLevel() {
    return this.parentSpaceId === null;
  }

  // ===== 空间配置查询 =====

  /**
   * 获取三维度配置
   * @param {string} dimension - Dimension枚举值
   * @returns {Object}
   */
  getDimensionConfig(dimension) {
    return this.config.dimensions[dimension] || {};
  }

  /**
   * 更新空间配置
   * @param {Object} partial - 部分配置（深度合并）
   */
  updateConfig(partial) {
    if (partial.dimensions) {
      this.config.dimensions = {
        ...this.config.dimensions,
        ...partial.dimensions,
      };
    }
    if (partial.boundary) {
      this.config.boundary = { ...this.config.boundary, ...partial.boundary };
    }
    if (partial.size) {
      this.config.size = { ...this.config.size, ...partial.size };
    }
    if (partial.shape) {
      this.config.shape = partial.shape;
    }
  }

  /**
   * 获取空间摘要（供AI排查）
   * @returns {Object}
   */
  getSummary() {
    return {
      id: this.id,
      parentSpaceId: this.parentSpaceId,
      isTopLevel: this.isTopLevel(),
      subspaceCount: this.subspaceIds.size,
      shape: this.config.shape,
      size: { ...this.config.size },
      dimensions: {
        vertical: this.config.dimensions[Dimension.VERTICAL],
        radial: this.config.dimensions[Dimension.RADIAL],
        orbital: this.config.dimensions[Dimension.ORBITAL],
      },
      boundary: { ...this.config.boundary },
    };
  }

  // ===== 私有方法 =====

  /**
   * 自定义边界内部判断（简化版，S5用convex-hull库替换）
   * @param {number} x, y, z
   * @returns {boolean}
   * @private
   */
  _isInsideCustomBoundary(x, y, z) {
    if (!this._customBoundaryPoints || this._customBoundaryPoints.length < 4) {
      return false;
    }
    // 简化: 检查是否在所有边界点的凸包内
    // S5阶段替换为convex-hull库的精确实现
    const size = this.config.size;
    return isInsideOctahedron(x, y, z, size); // 临时降级为八面体
  }
}

export default Space;
