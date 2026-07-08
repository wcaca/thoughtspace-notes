/**
 * [INPUT]: three.js, core/space.js (Space坐标系)
 * [OUTPUT]: OperationZone类 — 1/4操作区（外层环绕+3D缩略图+视角旋转入口）
 * [POS]: src/v2/render/operation-zone.js,L2渲染层,操作区
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §3.2 操作区、§3.3 布局示意
 *   - 位置: 在3/4基准面的外层（环绕，四周都要用）
 *   - 3D缩略图: 带倾斜和大小表示空间位置关系
 *   - 可显示性: 可选择是否显示
 *   - 旋转入口: 从1/4外层滑动可旋转/切换视角
 *   - 操作区环绕基准面，四周都要用
 *
 * @note(s1, decision, operation-zone, since:2026-07-08)
 *   S1-C.1.10: 关键路径终点，依赖base-plane(1.9)。
 *   滑动手势在S3实现（view-orbit-swipe.js），本组件只提供getSwipeZones()接口。
 */

import * as THREE from 'three';

// ===== 默认视觉参数 =====

/** 操作区面板颜色（深蓝灰，与基准面区分） */
const DEFAULT_COLOR = 0x1a2a3e;
/** 操作区面板透明度 */
const DEFAULT_OPACITY = 0.1;
/** 操作区宽度比例（默认0.25=1/4） */
const DEFAULT_ZONE_WIDTH = 0.25;
/** 基准面尺寸因子（与base-plane一致，0.9） */
const PLANE_SIZE_FACTOR = 0.9;
/** 3D缩略图基础半径 */
const THUMBNAIL_RADIUS = 0.3;
/** 无space时的默认尺寸（半径） */
const DEFAULT_SIZE = { x: 5, y: 5, z: 5 };

/** 四个方向（环绕基准面） */
const SIDES = ['left', 'right', 'top', 'bottom'];

// ===== OperationZone类 =====

/**
 * 1/4操作区 — 3/4基准面外层环绕
 *
 * 核心职责:
 *   1. 在基准面四周构建4个操作区面板（left/right/top/bottom）
 *   2. 为每个面板提供3D缩略图（晶体轮廓，带倾斜与大小表示空间位置）
 *   3. 提供视角旋转入口的滑动区域（getSwipeZones）
 *   4. 管理可见性与视觉参数
 *
 * 不职责:
 *   - 不渲染基准面（由base-plane.js负责）
 *   - 不处理滑动手势（由interaction/view-orbit-swipe.js负责，S3）
 *   - 不控制相机（由view-orbit-camera.js负责）
 */
export class OperationZone {
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
    /** @type {number} 面板颜色（十六进制） */
    this._color = DEFAULT_COLOR;
    /** @type {number} 面板透明度 0-1 */
    this._opacity = DEFAULT_OPACITY;
    /** @type {number} 操作区宽度比例 0-1（默认0.25=1/4） */
    this._zoneWidth = DEFAULT_ZONE_WIDTH;

    // 可见性
    /** @type {boolean} 操作区整体可见 */
    this._visible = true;
    /** @type {boolean} 3D缩略图可见 */
    this._thumbnailsVisible = true;

    // 3D对象引用
    /** @type {Object<string, Object>} 4个面板mesh，键为side */
    this._panels = {};
    /** @type {Object<string, Object|null>} 4个缩略图LineSegments，键为side */
    this._thumbnails = {};
    /** @type {Object<string, {position:{x,y,z},rotation:{x,y,z},scale:number}>} 缩略图参数 */
    this._thumbnailData = {};
  }

  // ===== 构建/重建 =====

  /**
   * 构建1/4操作区3D对象（4个面板 + 4个3D缩略图）。
   * 重复调用会先释放旧对象再重建。
   *
   * 布局:
   *   - left/right: 在基准面左右两侧（±X方向），沿Z方向延伸
   *   - top/bottom: 在基准面前后两侧（±Z方向），沿X方向延伸
   *   - 面板水平放置（XZ平面），与基准面同高
   */
  build() {
    this._disposeObjects();

    const T = this._three;
    const size = this._getSize();

    // 基准面半宽（XZ平面，与base-plane一致）
    const halfX = size.x * PLANE_SIZE_FACTOR;
    const halfZ = size.z * PLANE_SIZE_FACTOR;
    // 操作区条带宽度（外延厚度）
    const zoneW = this._zoneWidth * size.x * 2;
    const zoneD = this._zoneWidth * size.z * 2;
    // 操作区与基准面同高（Y=0，基准面默认切片位置0.5对应Y=0）
    const sliceY = 0;

    // 四个面板配置: {id, 几何宽, 几何高, 中心x, 中心z}
    const configs = [
      { id: 'left', w: zoneW, h: halfZ * 2, x: -(halfX + zoneW / 2), z: 0 },
      { id: 'right', w: zoneW, h: halfZ * 2, x: halfX + zoneW / 2, z: 0 },
      { id: 'top', w: halfX * 2, h: zoneD, x: 0, z: -(halfZ + zoneD / 2) },
      { id: 'bottom', w: halfX * 2, h: zoneD, x: 0, z: halfZ + zoneD / 2 },
    ];

    for (const cfg of configs) {
      // ===== 面板 =====
      const geometry = new T.PlaneGeometry(cfg.w, cfg.h);
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
      if (mesh.rotation && typeof mesh.rotation.set === 'function') {
        mesh.rotation.set(-Math.PI / 2, 0, 0);
      } else if (mesh.rotation) {
        mesh.rotation.x = -Math.PI / 2;
      }
      if (mesh.position && typeof mesh.position.set === 'function') {
        mesh.position.set(cfg.x, sliceY, cfg.z);
      }
      mesh.visible = this._visible;

      if (this._scene && typeof this._scene.add === 'function') {
        this._scene.add(mesh);
      }
      this._panels[cfg.id] = mesh;

      // ===== 3D缩略图（晶体轮廓）=====
      this._thumbnails[cfg.id] = this._buildThumbnail(cfg.id, cfg.x, sliceY, cfg.z);
    }

    // 同步视觉参数到材质（mock环境material构造参数可能被忽略）
    this._applyOpacityToMaterials();
    this._applyColorToMaterials();
    // 同步缩略图可见性
    this._applyThumbnailsVisible();
  }

  // ===== 3D缩略图构建 =====

  /**
   * 构建单个3D缩略图（八面体边线轮廓）。
   * 缩略图带倾斜（rotation）和大小（scale）表示空间位置关系。
   * @param {string} id - 方向标识 left/right/top/bottom
   * @param {number} cx - 面板中心X
   * @param {number} cy - 面板中心Y
   * @param {number} cz - 面板中心Z
   * @returns {Object|null} THREE.LineSegments 或 null（缺少必要几何体时）
   * @private
   */
  _buildThumbnail(id, cx, cy, cz) {
    const T = this._three;
    const data = this._defaultThumbnailData(id, cx, cy, cz);
    this._thumbnailData[id] = data;

    if (
      typeof T.OctahedronGeometry !== 'function' ||
      typeof T.EdgesGeometry !== 'function' ||
      typeof T.LineSegments !== 'function'
    ) {
      return null;
    }

    const geo = new T.OctahedronGeometry(THUMBNAIL_RADIUS);
    const edges = new T.EdgesGeometry(geo);
    const lineMat = new T.LineBasicMaterial({
      color: this._color,
      transparent: true,
      opacity: Math.min(1, this._opacity * 3),
    });
    const line = new T.LineSegments(edges, lineMat);

    // 应用位置/旋转/缩放（带倾斜与大小表示空间位置）
    if (line.position && typeof line.position.set === 'function') {
      line.position.set(data.position.x, data.position.y, data.position.z);
    }
    if (line.rotation && typeof line.rotation.set === 'function') {
      line.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    }
    if (line.scale && typeof line.scale.set === 'function') {
      line.scale.set(data.scale, data.scale, data.scale);
    }
    line.visible = this._visible && this._thumbnailsVisible;

    if (this._scene && typeof this._scene.add === 'function') {
      this._scene.add(line);
    }

    // 原始八面体几何已由EdgesGeometry提取边线，可释放
    if (geo && typeof geo.dispose === 'function') geo.dispose();

    return line;
  }

  /**
   * 缩略图默认参数（每个方向不同的倾斜与大小，表示空间位置关系）。
   * @param {string} id - 方向标识
   * @param {number} cx - 面板中心X
   * @param {number} cy - 面板中心Y
   * @param {number} cz - 面板中心Z
   * @returns {{position:{x,y,z}, rotation:{x,y,z}, scale:number}}
   * @private
   */
  _defaultThumbnailData(id, cx, cy, cz) {
    const tiltMap = {
      left: { x: 0.3, y: 0.5, z: 0.1 },
      right: { x: -0.3, y: -0.5, z: -0.1 },
      top: { x: 0.5, y: 0.2, z: 0.3 },
      bottom: { x: -0.5, y: -0.2, z: -0.3 },
    };
    const scaleMap = {
      left: 1.0,
      right: 1.0,
      top: 0.85,
      bottom: 1.15,
    };
    return {
      position: { x: cx, y: cy + THUMBNAIL_RADIUS * 2, z: cz },
      rotation: { ...tiltMap[id] },
      scale: scaleMap[id],
    };
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
    for (const id of SIDES) {
      const panel = this._panels[id];
      if (panel) {
        if (this._scene && typeof this._scene.remove === 'function') {
          this._scene.remove(panel);
        }
        this._disposeObject(panel);
        this._panels[id] = null;
      }
      const thumb = this._thumbnails[id];
      if (thumb) {
        if (this._scene && typeof this._scene.remove === 'function') {
          this._scene.remove(thumb);
        }
        this._disposeObject(thumb);
        this._thumbnails[id] = null;
      }
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
   * 设置操作区整体可见性
   * @param {boolean} visible - 是否可见
   */
  setVisible(visible) {
    this._visible = !!visible;
    for (const id of SIDES) {
      const panel = this._panels[id];
      if (panel) panel.visible = this._visible;
      const thumb = this._thumbnails[id];
      if (thumb) thumb.visible = this._visible && this._thumbnailsVisible;
    }
  }

  /**
   * 查询操作区整体可见性
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  /**
   * 设置3D缩略图可见性（不影响面板可见性）
   * @param {boolean} visible - 是否显示3D缩略图
   */
  setThumbnailsVisible(visible) {
    this._thumbnailsVisible = !!visible;
    this._applyThumbnailsVisible();
  }

  /**
   * 应用缩略图可见性到所有缩略图对象
   * @private
   */
  _applyThumbnailsVisible() {
    for (const id of SIDES) {
      const thumb = this._thumbnails[id];
      if (thumb) {
        thumb.visible = this._visible && this._thumbnailsVisible;
      }
    }
  }

  // ===== 3D缩略图 =====

  /**
   * 获取所有缩略图位置/旋转/缩放信息
   * @returns {Array<{id:string, position:{x,y,z}, rotation:{x,y,z}, scale:number}>} 4个缩略图信息
   */
  getThumbnailPositions() {
    return SIDES.map((id) => {
      const d = this._thumbnailData[id];
      if (!d) {
        return { id, position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: 1 };
      }
      return {
        id,
        position: { ...d.position },
        rotation: { ...d.rotation },
        scale: d.scale,
      };
    });
  }

  /**
   * 更新某个缩略图的位置/旋转/缩放
   * @param {string} id - 方向标识 left/right/top/bottom
   * @param {Object} data - {position?, rotation?, scale?}
   */
  updateThumbnail(id, data) {
    const cur = this._thumbnailData[id];
    if (!cur) return;
    if (data && data.position) {
      Object.assign(cur.position, data.position);
    }
    if (data && data.rotation) {
      Object.assign(cur.rotation, data.rotation);
    }
    if (data && data.scale !== undefined) {
      cur.scale = data.scale;
    }

    const line = this._thumbnails[id];
    if (!line) return;
    if (line.position && typeof line.position.set === 'function') {
      line.position.set(cur.position.x, cur.position.y, cur.position.z);
    }
    if (line.rotation && typeof line.rotation.set === 'function') {
      line.rotation.set(cur.rotation.x, cur.rotation.y, cur.rotation.z);
    }
    if (line.scale && typeof line.scale.set === 'function') {
      line.scale.set(cur.scale, cur.scale, cur.scale);
    }
  }

  // ===== 视角旋转入口 =====

  /**
   * 获取4个滑动区域（四周），供view-orbit-swipe.js判断滑动手势落点。
   * bounds为3D范围 {min, max}，每个分量含x/y/z。
   * @returns {Array<{side:string, bounds:{min:{x,y,z}, max:{x,y,z}}}>} 4个滑动区域
   */
  getSwipeZones() {
    const size = this._getSize();
    const halfX = size.x * PLANE_SIZE_FACTOR;
    const halfZ = size.z * PLANE_SIZE_FACTOR;
    const zoneW = this._zoneWidth * size.x * 2;
    const zoneD = this._zoneWidth * size.z * 2;
    const y = 0;
    const yThick = size.y * 0.5; // Y方向厚度，便于3D交互命中

    return [
      {
        side: 'left',
        bounds: {
          min: { x: -(halfX + zoneW), y: y - yThick, z: -halfZ },
          max: { x: -halfX, y: y + yThick, z: halfZ },
        },
      },
      {
        side: 'right',
        bounds: {
          min: { x: halfX, y: y - yThick, z: -halfZ },
          max: { x: halfX + zoneW, y: y + yThick, z: halfZ },
        },
      },
      {
        side: 'top',
        bounds: {
          min: { x: -halfX, y: y - yThick, z: -(halfZ + zoneD) },
          max: { x: halfX, y: y + yThick, z: -halfZ },
        },
      },
      {
        side: 'bottom',
        bounds: {
          min: { x: -halfX, y: y - yThick, z: halfZ },
          max: { x: halfX, y: y + yThick, z: halfZ + zoneD },
        },
      },
    ];
  }

  // ===== 视觉参数 =====

  /**
   * 设置操作区面板透明度
   * @param {number} opacity - 0-1
   */
  setOpacity(opacity) {
    this._opacity = Math.max(0, Math.min(1, opacity));
    this._applyOpacityToMaterials();
  }

  /**
   * 设置操作区面板颜色
   * @param {number} color - 十六进制颜色，如 0x1a2a3e
   */
  setColor(color) {
    this._color = color;
    this._applyColorToMaterials();
  }

  /**
   * 设置操作区宽度比例，并重建面板。
   * @param {number} ratio - 0-1，默认0.25=1/4
   */
  setZoneWidth(ratio) {
    this._zoneWidth = Math.max(0, Math.min(1, ratio));
    // 若已构建则重建以应用新宽度
    const built = SIDES.some((id) => this._panels[id]);
    if (built) {
      this.build();
    }
  }

  // ===== 摘要 =====

  /**
   * 获取操作区摘要（供AI排查）
   * @returns {{visible:boolean, thumbnailsVisible:boolean, zoneWidth:number, opacity:number, color:number, thumbnailCount:number}}
   */
  getSummary() {
    return {
      visible: this._visible,
      thumbnailsVisible: this._thumbnailsVisible,
      zoneWidth: this._zoneWidth,
      opacity: this._opacity,
      color: this._color,
      thumbnailCount: SIDES.filter((id) => this._thumbnails[id]).length,
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
   * 应用透明度到所有面板与缩略图材质
   * 缩略图透明度略高（*3），保持轮廓可见
   * @private
   */
  _applyOpacityToMaterials() {
    for (const id of SIDES) {
      const panel = this._panels[id];
      if (panel && panel.material) {
        panel.material.opacity = this._opacity;
        panel.material.transparent = true;
      }
      const thumb = this._thumbnails[id];
      if (thumb && thumb.material) {
        thumb.material.opacity = Math.min(1, this._opacity * 3);
        thumb.material.transparent = true;
      }
    }
  }

  /**
   * 应用颜色到所有面板与缩略图材质
   * @private
   */
  _applyColorToMaterials() {
    const apply = (mat) => {
      if (!mat) return;
      if (mat.color && typeof mat.color.set === 'function') {
        mat.color.set(this._color);
      } else {
        mat.color = this._color;
      }
    };
    for (const id of SIDES) {
      const panel = this._panels[id];
      if (panel) apply(panel.material);
      const thumb = this._thumbnails[id];
      if (thumb) apply(thumb.material);
    }
  }
}

export default OperationZone;
