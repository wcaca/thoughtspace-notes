/**
 * [INPUT]: three.js, core/space.js (Space坐标系)
 * [OUTPUT]: BasePlane类 — 3/4基准面（3D空间切片）
 * [POS]: src/v2/render/base-plane.js,L2渲染层,基准面
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §3.1 基准面
 *   - 占比3/4屏
 *   - 本质是3D空间的切片，不是2D平面
 *   - 厚度自适应（密集区厚，稀疏区薄）
 *   - 基准面是默认显示的切片，其他面需通过旋转到达
 *   - 内容是当前切片附近的念头
 *
 * @note(s1, decision, base-plane, since:2026-07-08)
 *   S1-C.1.9: 关键路径，operation-zone(1.10)依赖此组件。
 *   基于space.js坐标系。S2阶段念头显示由thought-mesh负责。
 */

import * as THREE from 'three';

// ===== 默认视觉参数 =====

/** 基准面颜色（深蓝灰） */
const DEFAULT_COLOR = 0x2a3a5e;
/** 基准面透明度 */
const DEFAULT_OPACITY = 0.15;
/** 平面尺寸因子（相对空间边界，略小于晶体边界） */
const PLANE_SIZE_FACTOR = 0.9;
/** 默认切片垂直位置 (0-1) */
const DEFAULT_SLICE_POSITION = 0.5;
/** 默认切片厚度（3D空间Y厚度） */
const DEFAULT_SLICE_THICKNESS = 1.0;
/** 默认屏幕占比（3/4） */
const DEFAULT_SCREEN_RATIO = 0.75;
/** 无space时的默认尺寸（半径） */
const DEFAULT_SIZE = { x: 5, y: 5, z: 5 };

// ===== BasePlane类 =====

/**
 * 3/4基准面 — 3D空间切片
 *
 * 核心职责:
 *   1. 渲染半透明水平切片平面（XZ平面）
 *   2. 管理切片垂直位置（0-1）与厚度
 *   3. 管理屏幕占比（默认3/4）
 *   4. 提供切片3D范围（供thought-mesh筛选附近念头）
 *
 * 不职责:
 *   - 不渲染念头实体（由thought-mesh.js负责）
 *   - 不控制相机（由view-orbit-camera.js负责）
 *   - 不管理操作区（由operation-zone.js负责）
 */
export class BasePlane {
  /**
   * @param {Object} options
   * @param {Object} options.scene - THREE.Scene实例
   * @param {Object} [options.space] - Space实例（core/space.js）
   * @param {Object} [options.three] - THREE命名空间（测试mock用，默认import * as THREE）
   */
  constructor({ scene, space, three } = {}) {
    /** @type {Object} THREE命名空间 */
    this._three = three || THREE;
    /** @type {Object|null} THREE.Scene */
    this._scene = scene;
    /** @type {Object|null} Space实例 */
    this._space = space;

    // 视觉参数
    /** @type {number} 基准面颜色（十六进制） */
    this._color = DEFAULT_COLOR;
    /** @type {number} 基准面透明度 0-1 */
    this._opacity = DEFAULT_OPACITY;

    // 切片参数
    /** @type {number} 切片垂直位置 0-1 */
    this._slicePosition = DEFAULT_SLICE_POSITION;
    /** @type {number} 切片厚度（3D空间Y厚度） */
    this._sliceThickness = DEFAULT_SLICE_THICKNESS;
    /** @type {number} 屏幕占比 0-1（默认0.75=3/4） */
    this._screenRatio = DEFAULT_SCREEN_RATIO;

    // 3D对象引用
    /** @type {Object|null} 基准面mesh THREE.Mesh */
    this._planeMesh = null;
    /** @type {Object|null} 边框线 THREE.LineSegments */
    this._edgesLine = null;

    /** @type {boolean} 可见性 */
    this._visible = true;
  }

  // ===== 构建/重建 =====

  /**
   * 构建基准面3D对象（半透明平面 + 边框线）。
   * 重复调用会先释放旧对象再重建。
   *
   * 步骤:
   *   1. 释放旧对象
   *   2. 创建半透明平面（PlaneGeometry + MeshBasicMaterial）
   *   3. 水平放置（XZ平面），Y坐标由slicePosition决定
   *   4. 创建边框线（EdgesGeometry + LineSegments）
   *   5. 同步可见性与视觉参数
   */
  build() {
    this._disposeObjects();

    const T = this._three;
    const size = this._getSize();

    // 平面尺寸: 空间尺寸 * 0.9（略小于晶体边界）
    // space.config.size 是半径（半范围），平面全宽 = 2 * 半径 * 0.9
    const planeWidth = size.x * 2 * PLANE_SIZE_FACTOR;
    const planeDepth = size.z * 2 * PLANE_SIZE_FACTOR;

    // ===== 半透明平面 =====
    const geometry = new T.PlaneGeometry(planeWidth, planeDepth);
    const materialOptions = {
      color: this._color,
      transparent: true,
      opacity: this._opacity,
    };
    if (T.DoubleSide !== undefined) {
      materialOptions.side = T.DoubleSide;
    }
    const material = new T.MeshBasicMaterial(materialOptions);
    const mesh = new T.Mesh(geometry, material);

    // 水平放置（XZ平面）: PlaneGeometry默认在XY平面，绕X轴旋转-90°
    if (mesh.rotation) {
      mesh.rotation.x = -Math.PI / 2;
    }

    // Y坐标由slicePosition决定
    const sliceY = this._verticalToY(this._slicePosition);
    if (mesh.position && typeof mesh.position.set === 'function') {
      mesh.position.set(0, sliceY, 0);
    }

    mesh.visible = this._visible;

    if (this._scene && typeof this._scene.add === 'function') {
      this._scene.add(mesh);
    }
    this._planeMesh = mesh;

    // ===== 边框线 =====
    if (
      typeof T.EdgesGeometry === 'function' &&
      typeof T.LineSegments === 'function'
    ) {
      const edgesGeo = new T.EdgesGeometry(geometry);
      const lineMat = new T.LineBasicMaterial({
        color: this._color,
        transparent: true,
        opacity: Math.min(1, this._opacity * 2),
      });
      const line = new T.LineSegments(edgesGeo, lineMat);
      // 同步旋转与位置
      if (line.rotation) {
        line.rotation.x = -Math.PI / 2;
      }
      if (line.position && typeof line.position.set === 'function') {
        line.position.set(0, sliceY, 0);
      }
      line.visible = this._visible;
      if (this._scene && typeof this._scene.add === 'function') {
        this._scene.add(line);
      }
      this._edgesLine = line;
    }

    // 同步视觉参数到材质（mock环境material构造参数可能被忽略）
    this._applyOpacityToMaterial();
    this._applyColorToMaterial();
  }

  // ===== 释放 =====

  /**
   * 释放所有3D资源（Geometry/Material），从场景移除对象。
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
    if (this._planeMesh) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._planeMesh);
      }
      this._disposeObject(this._planeMesh);
      this._planeMesh = null;
    }
    if (this._edgesLine) {
      if (this._scene && typeof this._scene.remove === 'function') {
        this._scene.remove(this._edgesLine);
      }
      this._disposeObject(this._edgesLine);
      this._edgesLine = null;
    }
  }

  /**
   * 释放单个3D对象的geometry与material
   * @param {Object} obj - Three.js对象
   * @private
   */
  _disposeObject(obj) {
    if (!obj) return;
    if (obj.geometry && typeof obj.geometry.dispose === 'function') {
      obj.geometry.dispose();
    }
    if (obj.material) {
      this._disposeMaterial(obj.material);
    }
  }

  /**
   * 释放材质（支持数组形式）
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
   * 设置基准面可见性
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this._visible = !!visible;
    if (this._planeMesh) this._planeMesh.visible = this._visible;
    if (this._edgesLine) this._edgesLine.visible = this._visible;
  }

  /**
   * 查询可见性
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  // ===== 切片控制 =====

  /**
   * 设置切片垂直位置
   * @param {number} vertical - 0.0(底层)~1.0(顶层)
   */
  setSlicePosition(vertical) {
    const v = Math.max(0, Math.min(1, vertical));
    this._slicePosition = v;
    const y = this._verticalToY(v);
    if (
      this._planeMesh &&
      this._planeMesh.position &&
      typeof this._planeMesh.position.set === 'function'
    ) {
      this._planeMesh.position.set(0, y, 0);
    }
    if (
      this._edgesLine &&
      this._edgesLine.position &&
      typeof this._edgesLine.position.set === 'function'
    ) {
      this._edgesLine.position.set(0, y, 0);
    }
  }

  /**
   * 获取当前切片垂直位置
   * @returns {number} 0.0~1.0
   */
  getSlicePosition() {
    return this._slicePosition;
  }

  /**
   * 设置切片厚度（密集区厚，稀疏区薄）
   * @param {number} thickness - 3D空间Y厚度，默认1.0
   */
  setSliceThickness(thickness) {
    this._sliceThickness = Math.max(0, Number(thickness) || 0);
  }

  /**
   * 获取切片厚度
   * @returns {number}
   */
  getSliceThickness() {
    return this._sliceThickness;
  }

  // ===== 视觉参数 =====

  /**
   * 设置基准面透明度
   * @param {number} opacity - 0-1
   */
  setOpacity(opacity) {
    this._opacity = Math.max(0, Math.min(1, opacity));
    this._applyOpacityToMaterial();
  }

  /**
   * 设置基准面颜色
   * @param {number} color - 十六进制颜色，如 0x2a3a5e
   */
  setColor(color) {
    this._color = color;
    this._applyColorToMaterial();
  }

  /**
   * 设置屏幕占比
   * @param {number} ratio - 0-1，默认0.75=3/4
   * @note 简化实现: 仅记录比例，实际调整由camera控制
   */
  setScreenRatio(ratio) {
    this._screenRatio = Math.max(0, Math.min(1, ratio));
  }

  // ===== 引用获取 =====

  /**
   * 获取基准面mesh
   * @returns {Object|null} THREE.Mesh
   */
  getPlaneMesh() {
    return this._planeMesh;
  }

  /**
   * 获取切片3D范围
   * Y范围基于slicePosition±thickness/2
   * @returns {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}}
   */
  getSliceBounds() {
    const size = this._getSize();
    const halfX = size.x * PLANE_SIZE_FACTOR;
    const halfZ = size.z * PLANE_SIZE_FACTOR;
    const sliceY = this._verticalToY(this._slicePosition);
    const halfThickness = this._sliceThickness / 2;
    return {
      min: { x: -halfX, y: sliceY - halfThickness, z: -halfZ },
      max: { x: halfX, y: sliceY + halfThickness, z: halfZ },
    };
  }

  // ===== 更新 =====

  /**
   * 每帧更新（根据相机位置调整切片）
   * 简化实现: 保持当前slicePosition，此方法为后续动态切片预留。
   * @param {{x:number,y:number,z:number}} cameraPosition - 相机位置
   * @param {{x:number,y:number,z:number}} cameraTarget - 相机注视目标
   */
  update(cameraPosition, cameraTarget) {
    // 预留: S2阶段根据cameraPosition动态调整切片位置
    // 当前保持当前slicePosition不变
    void cameraPosition;
    void cameraTarget;
  }

  // ===== 摘要 =====

  /**
   * 获取基准面摘要（供AI排查）
   * @returns {{visible:boolean, slicePosition:number, sliceThickness:number, screenRatio:number, opacity:number, color:number}}
   */
  getSummary() {
    return {
      visible: this._visible,
      slicePosition: this._slicePosition,
      sliceThickness: this._sliceThickness,
      screenRatio: this._screenRatio,
      opacity: this._opacity,
      color: this._color,
    };
  }

  // ===== 私有辅助 =====

  /**
   * 获取空间尺寸（半径）
   * 优先: space.config.size；最后: 默认值
   * @returns {{x:number,y:number,z:number}}
   * @private
   */
  _getSize() {
    if (this._space && this._space.config && this._space.config.size) {
      return { ...this._space.config.size };
    }
    return { ...DEFAULT_SIZE };
  }

  /**
   * 垂直坐标(0-1)转Y坐标
   * yMin = -size.y, yMax = +size.y
   * Y = yMin + vertical * (yMax - yMin) = -size.y + vertical * 2 * size.y
   * @param {number} vertical - 0-1
   * @returns {number}
   * @private
   */
  _verticalToY(vertical) {
    const size = this._getSize();
    return -size.y + vertical * 2 * size.y;
  }

  /**
   * 应用透明度到材质（平面+边框线）
   * 边框线透明度略高（*2），保持线条可见
   * @private
   */
  _applyOpacityToMaterial() {
    if (this._planeMesh && this._planeMesh.material) {
      this._planeMesh.material.opacity = this._opacity;
      this._planeMesh.material.transparent = this._opacity < 1;
    }
    if (this._edgesLine && this._edgesLine.material) {
      this._edgesLine.material.opacity = Math.min(1, this._opacity * 2);
      this._edgesLine.material.transparent = true;
    }
  }

  /**
   * 应用颜色到材质（平面+边框线）
   * @private
   */
  _applyColorToMaterial() {
    const apply = (mat) => {
      if (!mat) return;
      if (mat.color && typeof mat.color.set === 'function') {
        mat.color.set(this._color);
      } else {
        mat.color = this._color;
      }
    };
    if (this._planeMesh) apply(this._planeMesh.material);
    if (this._edgesLine) apply(this._edgesLine.material);
  }
}

export default BasePlane;
