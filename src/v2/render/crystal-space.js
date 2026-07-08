/**
 * [INPUT]: three.js, core/space.js (Space边界)
 * [OUTPUT]: CrystalSpaceRenderer类 — 有限3D晶体空间渲染（边界线框+星尘背景）
 * [POS]: src/v2/render/crystal-space.js,L2渲染层,空间渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.1 有限3D念头晶体
 *   - 空间有明确边界（八面体），不是无限宇宙
 *   - 晶体内部星尘粒子暗示"念头田野"氛围
 *   - 整体可旋转（由view-orbit-camera控制）
 *
 * @note(s1, decision, crystal-space, since:2026-07-08)
 *   S1-C.1.6: 关键路径起点，layer-renderer(1.7)/base-plane(1.9)/space-boundary(1.11)依赖此组件。
 *   基于space.js的八面体边界计算。
 */

import * as THREE from 'three';
import { BoundaryShape } from '../core/space.js';

// ===== 默认视觉参数 =====

const DEFAULT_COLOR = 0x7fe0c9;         // 青绿色（晶体轮廓）
const DEFAULT_OPACITY = 0.3;            // 晶体轮廓透明度
const STARDUST_COLOR = 0xaaccff;        // 微弱白蓝（星尘）
const STARDUST_SIZE = 0.05;             // 星尘粒子大小
const STARDUST_OPACITY = 0.6;           // 星尘透明度
const DEFAULT_STARDUST_DENSITY = 0.5;   // 默认密度（对应500个点）
const MAX_STARDUST_COUNT = 1000;        // density=1时的星尘数量
const DEFAULT_SIZE = { x: 5, y: 5, z: 5 }; // 无space时的默认尺寸（半径）

// ===== CrystalSpaceRenderer =====

/**
 * 有限3D念头晶体空间渲染器
 * 基于Space的八面体边界，渲染晶体轮廓线框 + 内部星尘粒子背景。
 *
 * 职责:
 *   1. 构建晶体边界线框（八面体/自定义）
 *   2. 构建晶体内部星尘粒子（念头田野氛围）
 *   3. 提供可见性/透明度/颜色/密度等视觉参数控制
 *   4. 提供边界mesh与星尘points引用（供其他渲染组件使用）
 *
 * 不职责:
 *   - 不控制相机轨道（由view-orbit-camera.js负责）
 *   - 不渲染空间外部信息边界（由space-boundary.js负责）
 *   - 不管理层/念头体渲染
 */
export class CrystalSpaceRenderer {
  /**
   * @param {Object} options
   * @param {Object} options.scene - THREE.Scene实例
   * @param {Object} [options.space] - Space实例（core/space.js）
   * @param {Object} [options.three] - THREE命名空间（测试mock用，默认import * as THREE）
   */
  constructor({ scene, space = null, three = null } = {}) {
    /** @type {Object} THREE命名空间 */
    this._three = three || THREE;
    /** @type {Object|null} THREE.Scene */
    this._scene = scene;
    /** @type {Object|null} Space实例 */
    this._space = space;
    /** @type {string} 边界形状（BoundaryShape枚举值） */
    this._boundaryShape = (space && space.config && space.config.shape) || BoundaryShape.OCTAHEDRON;

    // 视觉参数
    /** @type {number} 轮廓颜色（十六进制） */
    this._color = DEFAULT_COLOR;
    /** @type {number} 轮廓透明度 0-1 */
    this._opacity = DEFAULT_OPACITY;
    /** @type {number} 星尘密度 0-1 */
    this._stardustDensity = DEFAULT_STARDUST_DENSITY;
    /** @type {number} 星尘数量 */
    this._stardustCount = this._densityToCount(DEFAULT_STARDUST_DENSITY);

    // 3D对象引用
    /** @type {Object|null} 边界线框 THREE.LineSegments */
    this._boundaryMesh = null;
    /** @type {Object|null} 星尘粒子 THREE.Points */
    this._stardustPoints = null;

    /** @type {boolean} 可见性 */
    this._visible = true;
  }

  // ===== 构建/重建 =====

  /**
   * 根据space配置构建3D对象（边界线框 + 星尘）。
   * 重复调用会先释放旧对象再重建。
   */
  build() {
    // 先释放旧对象
    this._disposeObjects();

    const size = this._getSize();
    this._buildBoundary(size);
    this._buildStardust(size);

    // 同步可见性
    this.setVisible(this._visible);
  }

  /**
   * 构建边界线框
   * @param {{x,y,z}} size - 空间尺寸（半径）
   * @private
   */
  _buildBoundary(size) {
    const T = this._three;
    const material = new T.LineBasicMaterial({
      color: this._color,
      transparent: true,
      opacity: this._opacity,
    });

    let geometry;
    if (this._boundaryShape === BoundaryShape.OCTAHEDRON) {
      // 八面体: OctahedronGeometry(单位) + 缩放 + EdgesGeometry
      const octGeo = new T.OctahedronGeometry(1);
      if (typeof octGeo.scale === 'function') {
        octGeo.scale(size.x, size.y, size.z);
      }
      if (typeof T.EdgesGeometry === 'function') {
        geometry = new T.EdgesGeometry(octGeo);
        // 源几何体已无用，立即释放
        if (typeof octGeo.dispose === 'function') octGeo.dispose();
      } else {
        geometry = octGeo;
      }
    } else {
      // 自定义: 用顶点构建线段几何（连接所有顶点对）
      geometry = this._buildCustomEdgeGeometry();
    }

    if (!geometry) {
      geometry = new T.BufferGeometry();
    }

    this._boundaryMesh = new T.LineSegments(geometry, material);
    if (this._scene && typeof this._scene.add === 'function') {
      this._scene.add(this._boundaryMesh);
    }
  }

  /**
   * 构建自定义边界的线段几何（连接所有顶点对形成线框）
   * @returns {Object} BufferGeometry
   * @private
   */
  _buildCustomEdgeGeometry() {
    const T = this._three;
    const geometry = new T.BufferGeometry();
    const vertices = this._getBoundaryVertices();
    if (vertices.length < 2) return geometry;

    // 简化: 连接所有顶点对（后续S5用convex-hull优化为凸包边）
    const positions = [];
    for (let i = 0; i < vertices.length; i++) {
      for (let j = i + 1; j < vertices.length; j++) {
        positions.push(vertices[i].x, vertices[i].y, vertices[i].z);
        positions.push(vertices[j].x, vertices[j].y, vertices[j].z);
      }
    }
    this._applyPositionAttribute(geometry, positions);
    return geometry;
  }

  /**
   * 构建星尘粒子
   * @param {{x,y,z}} size - 空间尺寸（半径）
   * @private
   */
  _buildStardust(size) {
    const T = this._three;
    const count = this._stardustCount;
    const positions = this._generateStardustPositions(count, size);

    const geometry = new T.BufferGeometry();
    this._applyPositionAttribute(geometry, positions);

    const material = new T.PointsMaterial({
      color: STARDUST_COLOR,
      size: STARDUST_SIZE,
      transparent: true,
      opacity: STARDUST_OPACITY,
    });

    this._stardustPoints = new T.Points(geometry, material);
    if (this._scene && typeof this._scene.add === 'function') {
      this._scene.add(this._stardustPoints);
    }
  }

  /**
   * 为几何体设置position属性（兼容mock环境）
   * @param {Object} geometry - BufferGeometry
   * @param {number[]} positions - 扁平顶点坐标数组 [x,y,z, ...]
   * @private
   */
  _applyPositionAttribute(geometry, positions) {
    const T = this._three;
    if (typeof T.Float32BufferAttribute === 'function') {
      geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    } else if (typeof T.BufferAttribute === 'function') {
      geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(positions), 3));
    }
    // mock环境: setAttribute为no-op，安全跳过
  }

  /**
   * 在晶体内部生成随机星尘位置（八面体拒绝采样）
   * @param {number} count - 目标点数
   * @param {{x,y,z}} size - 空间尺寸（半径）
   * @returns {number[]} 扁平坐标数组 [x,y,z, ...]
   * @private
   */
  _generateStardustPositions(count, size) {
    if (count <= 0) return [];
    const positions = [];
    const maxAttempts = count * 20;
    let attempts = 0;
    while (positions.length / 3 < count && attempts < maxAttempts) {
      const x = (Math.random() * 2 - 1) * size.x;
      const y = (Math.random() * 2 - 1) * size.y;
      const z = (Math.random() * 2 - 1) * size.z;
      // 八面体内部判断: |x|/a + |y|/b + |z|/c <= 1
      if (Math.abs(x) / size.x + Math.abs(y) / size.y + Math.abs(z) / size.z <= 1) {
        positions.push(x, y, z);
      }
      attempts++;
    }
    return positions;
  }

  // ===== 释放 =====

  /**
   * 清理所有3D资源（Geometry/Material），从场景移除对象。
   * 调用后实例不再可用，如需继续使用需重新build()。
   */
  dispose() {
    this._disposeObjects();
    this._scene = null;
    this._space = null;
  }

  /**
   * 释放3D对象（内部用，不清理scene/space引用）
   * @private
   */
  _disposeObjects() {
    if (this._boundaryMesh) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._boundaryMesh);
      }
      this._disposeObject(this._boundaryMesh);
      this._boundaryMesh = null;
    }
    if (this._stardustPoints) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._stardustPoints);
      }
      this._disposeObject(this._stardustPoints);
      this._stardustPoints = null;
    }
  }

  /**
   * 释放单个3D对象的geometry与material
   * @param {Object} obj - Three.js对象
   * @private
   */
  _disposeObject(obj) {
    if (obj.geometry) this._disposeGeometry(obj.geometry);
    if (obj.material) this._disposeMaterial(obj.material);
  }

  /**
   * 释放几何体
   * @param {Object} geo - Geometry
   * @private
   */
  _disposeGeometry(geo) {
    if (geo && typeof geo.dispose === 'function') geo.dispose();
  }

  /**
   * 释放材质（支持数组形式的材质）
   * @param {Object|Object[]} mat - Material或Material数组
   * @private
   */
  _disposeMaterial(mat) {
    if (!mat) return;
    if (Array.isArray(mat)) {
      mat.forEach((m) => this._disposeMaterial(m));
      return;
    }
    if (typeof mat.dispose === 'function') mat.dispose();
  }

  // ===== 可见性 =====

  /**
   * 设置晶体空间可见性
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this._visible = !!visible;
    if (this._boundaryMesh) this._boundaryMesh.visible = this._visible;
    if (this._stardustPoints) this._stardustPoints.visible = this._visible;
  }

  /**
   * 查询可见性
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  // ===== 配置更新 =====

  /**
   * 更新Space实例并重建边界
   * @param {Object} space - 新的Space实例
   */
  setSpace(space) {
    this._space = space;
    if (space && space.config && space.config.shape) {
      this._boundaryShape = space.config.shape;
    }
    this.build();
  }

  /**
   * 更改边界形状并重建
   * @param {string} shape - BoundaryShape.OCTAHEDRON | BoundaryShape.CUSTOM
   */
  setBoundaryShape(shape) {
    this._boundaryShape = shape;
    if (this._space && typeof this._space.updateConfig === 'function') {
      this._space.updateConfig({ shape });
    }
    this.build();
  }

  // ===== 视觉参数 =====

  /**
   * 设置晶体轮廓透明度
   * @param {number} opacity - 0-1
   */
  setOpacity(opacity) {
    this._opacity = Math.max(0, Math.min(1, opacity));
    const mat = this._boundaryMesh ? this._boundaryMesh.material : null;
    if (mat) {
      mat.opacity = this._opacity;
      mat.transparent = this._opacity < 1;
    }
  }

  /**
   * 设置晶体轮廓颜色
   * @param {number} color - 十六进制颜色，如 0x7fe0c9
   */
  setColor(color) {
    this._color = color;
    const mat = this._boundaryMesh ? this._boundaryMesh.material : null;
    if (!mat) return;
    if (mat.color && typeof mat.color.set === 'function') {
      mat.color.set(color);
    } else {
      mat.color = color;
    }
  }

  /**
   * 设置星尘密度并重建星尘
   * @param {number} density - 0-1（0=0个点，1=1000个点，0.5=500个点）
   */
  setStardustDensity(density) {
    this._stardustDensity = Math.max(0, Math.min(1, density));
    this._stardustCount = this._densityToCount(this._stardustDensity);

    // 仅重建星尘（不动边界）
    const size = this._getSize();
    if (this._stardustPoints) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._stardustPoints);
      }
      this._disposeObject(this._stardustPoints);
      this._stardustPoints = null;
    }
    this._buildStardust(size);
    if (this._stardustPoints) this._stardustPoints.visible = this._visible;
  }

  // ===== 引用获取 =====

  /**
   * 获取边界线框对象
   * @returns {Object|null} THREE.LineSegments
   */
  getBoundaryMesh() {
    return this._boundaryMesh;
  }

  /**
   * 获取星尘粒子对象
   * @returns {Object|null} THREE.Points
   */
  getStardustPoints() {
    return this._stardustPoints;
  }

  /**
   * 获取晶体中心坐标（边界顶点质心）
   * @returns {{x:number,y:number,z:number}}
   */
  getCenter() {
    const vertices = this._getBoundaryVertices();
    if (vertices.length === 0) return { x: 0, y: 0, z: 0 };
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < vertices.length; i++) {
      sx += vertices[i].x;
      sy += vertices[i].y;
      sz += vertices[i].z;
    }
    const n = vertices.length;
    return { x: sx / n, y: sy / n, z: sz / n };
  }

  // ===== 摘要 =====

  /**
   * 获取渲染器摘要
   * @returns {{visible:boolean, boundaryShape:string, stardustCount:number, opacity:number, color:number}}
   */
  getSummary() {
    return {
      visible: this._visible,
      boundaryShape: this._boundaryShape,
      stardustCount: this._stardustCount,
      opacity: this._opacity,
      color: this._color,
    };
  }

  // ===== 私有辅助 =====

  /**
   * 获取空间尺寸（半径）
   * 优先: space.config.size；其次: 从边界顶点计算半范围；最后: 默认值
   * @returns {{x,y,z}}
   * @private
   */
  _getSize() {
    if (this._space && this._space.config && this._space.config.size) {
      return { ...this._space.config.size };
    }
    const vertices = this._getBoundaryVertices();
    if (vertices.length > 0) {
      return {
        x: vertices.reduce((m, v) => Math.max(m, Math.abs(v.x)), 0),
        y: vertices.reduce((m, v) => Math.max(m, Math.abs(v.y)), 0),
        z: vertices.reduce((m, v) => Math.max(m, Math.abs(v.z)), 0),
      };
    }
    return { ...DEFAULT_SIZE };
  }

  /**
   * 获取边界顶点
   * @returns {Array<{x,y,z}>}
   * @private
   */
  _getBoundaryVertices() {
    if (this._space && typeof this._space.getBoundaryVertices === 'function') {
      return this._space.getBoundaryVertices();
    }
    return [];
  }

  /**
   * 密度(0-1)转星尘数量
   * @param {number} density - 0-1
   * @returns {number}
   * @private
   */
  _densityToCount(density) {
    return Math.round(density * MAX_STARDUST_COUNT);
  }
}

export default CrystalSpaceRenderer;
