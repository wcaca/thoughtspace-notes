/**
 * [INPUT]: three.js, core/space.js (Space边界)
 * [OUTPUT]: SpaceBoundary类 — 空间外部信息边界渲染（可见不可操作）
 * [POS]: src/v2/render/space-boundary.js,L2渲染层,边界渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.5 空间外部信息边界
 *   - 3D空间外部存在用户能感知但无法直接操作的信息边界
 *   - 这些外部信息是用户尚未纳入念头田野的内容
 *   - 作为空间的背景存在，暗示"还有更多内容存在"
 *
 * @note(s1, decision, space-boundary, since:2026-07-08)
 *   S1-C.1.11: 空间外部边界，依赖crystal-space(1.6)的边界参考。
 *   可见但不可操作，视觉上比晶体边界更外层、更淡。
 */

import * as THREE from 'three';
import { BoundaryShape } from '../core/space.js';

// ===== 默认视觉参数 =====

const DEFAULT_COLOR = 0x1a2a4e;            // 深暗蓝（边界轮廓）
const DEFAULT_OPACITY = 0.05;              // 边界透明度（非常淡）
const DEFAULT_BLUR_LEVEL = 0;              // 默认模糊程度（0=集中）
const DEFAULT_OUTER_RADIUS = 1.5;          // 外边界相对晶体边界的比例
const PARTICLE_COUNT = 200;                // 暗示性粒子数量
const PARTICLE_COLOR = 0x4a6a9e;           // 粒子颜色（暗蓝）
const PARTICLE_SIZE = 0.03;                // 粒子大小
const PARTICLE_OPACITY = 0.2;              // 粒子透明度
const DEFAULT_SIZE = { x: 5, y: 5, z: 5 }; // 无space时的默认尺寸（半径）

// ===== SpaceBoundary =====

/**
 * 空间外部信息边界渲染器
 *
 * 3D空间外部的信息边界，可见但不可直接操作。
 * 暗示"还有更多内容存在，但尚未进入用户的念头田野"。
 *
 * 视觉表现:
 *   - 半透明、模糊、距离感（比晶体边界更外层）
 *   - 外层八面体线框（比晶体边界大1.5倍）
 *   - 边界附近散布粒子，暗示更多内容
 *
 * 职责:
 *   1. 构建外层八面体边界线框
 *   2. 构建边界暗示性粒子
 *   3. 提供可见性/透明度/颜色/模糊度/外径等视觉参数控制
 *   4. 提供边界mesh与粒子points引用
 *
 * 不职责:
 *   - 不渲染晶体内部（由crystal-space.js负责）
 *   - 不处理用户交互（可见不可操作）
 *   - 不管理层/念头体渲染
 */
export class SpaceBoundary {
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
    /** @type {number} 边界颜色（十六进制） */
    this._color = DEFAULT_COLOR;
    /** @type {number} 边界透明度 0-1 */
    this._opacity = DEFAULT_OPACITY;
    /** @type {number} 模糊程度 0-1（0=集中，1=分散） */
    this._blurLevel = DEFAULT_BLUR_LEVEL;
    /** @type {number} 外边界半径相对晶体边界的比例 */
    this._outerRadius = DEFAULT_OUTER_RADIUS;
    /** @type {number} 粒子数量 */
    this._particleCount = PARTICLE_COUNT;

    // 3D对象引用
    /** @type {Object|null} 边界线框 THREE.LineSegments */
    this._boundaryMesh = null;
    /** @type {Object|null} 边界粒子 THREE.Points */
    this._boundaryParticles = null;

    /** @type {boolean} 可见性 */
    this._visible = true;
  }

  // ===== 构建/重建 =====

  /**
   * 构建空间外部信息边界的3D对象（外层八面体线框 + 暗示性粒子）。
   * 重复调用会先释放旧对象再重建。
   */
  build() {
    // 先释放旧对象
    this._disposeObjects();

    const size = this._getSize();
    const outerSize = this._scaleSize(size, this._outerRadius);
    this._buildBoundary(outerSize);
    this._buildParticles(outerSize);

    // 同步可见性
    this.setVisible(this._visible);
  }

  /**
   * 构建外层八面体边界线框
   * @param {{x,y,z}} outerSize - 外边界尺寸（半径）
   * @private
   */
  _buildBoundary(outerSize) {
    const T = this._three;
    const material = new T.LineBasicMaterial({
      color: this._color,
      transparent: true,
      opacity: this._opacity,
    });

    // 八面体: OctahedronGeometry(单位) + 缩放 + EdgesGeometry
    const octGeo = new T.OctahedronGeometry(1);
    if (typeof octGeo.scale === 'function') {
      octGeo.scale(outerSize.x, outerSize.y, outerSize.z);
    }
    let geometry;
    if (typeof T.EdgesGeometry === 'function') {
      geometry = new T.EdgesGeometry(octGeo);
      // 源几何体已无用，立即释放
      if (typeof octGeo.dispose === 'function') octGeo.dispose();
    } else {
      geometry = octGeo;
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
   * 构建边界暗示性粒子
   * @param {{x,y,z}} outerSize - 外边界尺寸（半径）
   * @private
   */
  _buildParticles(outerSize) {
    const T = this._three;
    const positions = this._generateParticlePositions(this._particleCount, outerSize, this._blurLevel);

    const geometry = new T.BufferGeometry();
    this._applyPositionAttribute(geometry, positions);

    const material = new T.PointsMaterial({
      color: PARTICLE_COLOR,
      size: PARTICLE_SIZE,
      transparent: true,
      opacity: PARTICLE_OPACITY,
    });

    this._boundaryParticles = new T.Points(geometry, material);
    if (this._scene && typeof this._scene.add === 'function') {
      this._scene.add(this._boundaryParticles);
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
   * 在外层边界附近生成随机粒子位置（壳层分布）
   * 模糊程度控制壳层厚度: blur=0 → 薄壳（集中），blur=1 → 厚壳（分散）
   * @param {number} count - 粒子数量
   * @param {{x,y,z}} outerSize - 外边界尺寸（半径）
   * @param {number} blurLevel - 模糊程度 0-1
   * @returns {number[]} 扁平坐标数组 [x,y,z, ...]
   * @private
   */
  _generateParticlePositions(count, outerSize, blurLevel) {
    if (count <= 0) return [];
    const positions = [];
    // 壳层厚度: blur=0 → 0.05（薄），blur=1 → 0.5（厚）
    const shellThickness = 0.05 + blurLevel * 0.45;
    for (let i = 0; i < count; i++) {
      // 随机方向（单位八面体表面法向）
      let x, y, z, r;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        r = Math.abs(x) + Math.abs(y) + Math.abs(z);
      } while (r === 0);
      // 归一化到八面体表面(r=1)，再缩放到壳层 [1-thickness, 1]
      const t = (1 - shellThickness) + Math.random() * shellThickness;
      const scale = t / r;
      positions.push(x * scale * outerSize.x, y * scale * outerSize.y, z * scale * outerSize.z);
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
    if (this._boundaryParticles) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._boundaryParticles);
      }
      this._disposeObject(this._boundaryParticles);
      this._boundaryParticles = null;
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
   * 设置边界可见性
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this._visible = !!visible;
    if (this._boundaryMesh) this._boundaryMesh.visible = this._visible;
    if (this._boundaryParticles) this._boundaryParticles.visible = this._visible;
  }

  /**
   * 查询可见性
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  // ===== 视觉参数 =====

  /**
   * 设置边界透明度
   * @param {number} opacity - 0-1（很低，如0.05）
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
   * 设置边界颜色
   * @param {number} color - 十六进制颜色，如 0x1a2a4e
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
   * 设置模糊程度（控制粒子分散度）
   * @param {number} level - 0=粒子集中，1=粒子分散
   */
  setBlurLevel(level) {
    this._blurLevel = Math.max(0, Math.min(1, level));
    // 已构建则重建粒子
    if (this._boundaryParticles) {
      const size = this._getSize();
      const outerSize = this._scaleSize(size, this._outerRadius);
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._boundaryParticles);
      }
      this._disposeObject(this._boundaryParticles);
      this._boundaryParticles = null;
      this._buildParticles(outerSize);
      if (this._boundaryParticles) this._boundaryParticles.visible = this._visible;
    }
  }

  /**
   * 设置外边界半径相对晶体边界的比例
   * @param {number} ratio - 比例（默认1.5倍）
   */
  setOuterRadius(ratio) {
    this._outerRadius = Math.max(0.1, ratio);
    // 已构建则重建全部
    if (this._boundaryMesh) {
      this.build();
    }
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
   * 获取边界粒子对象
   * @returns {Object|null} THREE.Points
   */
  getBoundaryParticles() {
    return this._boundaryParticles;
  }

  // ===== 摘要 =====

  /**
   * 获取边界渲染器摘要
   * @returns {{visible:boolean, opacity:number, color:number, blurLevel:number, outerRadius:number, particleCount:number}}
   */
  getSummary() {
    return {
      visible: this._visible,
      opacity: this._opacity,
      color: this._color,
      blurLevel: this._blurLevel,
      outerRadius: this._outerRadius,
      particleCount: this._particleCount,
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
   * 按比例缩放尺寸
   * @param {{x,y,z}} size - 原始尺寸
   * @param {number} ratio - 缩放比例
   * @returns {{x,y,z}}
   * @private
   */
  _scaleSize(size, ratio) {
    return { x: size.x * ratio, y: size.y * ratio, z: size.z * ratio };
  }
}

export default SpaceBoundary;
