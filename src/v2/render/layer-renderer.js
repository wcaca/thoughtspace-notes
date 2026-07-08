/**
 * [INPUT]: three.js, core/layer.js (LayerSystem), core/space.js (Space坐标系)
 * [OUTPUT]: LayerRenderer类 — 6层+2外置层渲染（层平面+标签+近大远小+分界线）
 * [POS]: src/v2/render/layer-renderer.js,L2渲染层,层渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.2 默认结构、§6 层操作
 *   - 6层3D主体(3显意识+3潜意识) + 2外置层垂直堆叠
 *   - 近大远小: 越接近视角起点(显意识·表层)越大，scale 0.3~1.0
 *   - 分界线: 显/潜意识之间(vertical=0.5)
 *
 * @note(s1, decision, layer-renderer, since:2026-07-08)
 *   S1-C.1.7: 关键路径，base-plane(1.9)依赖此组件的层缩放。
 *   基于layer.js的层定义和space.js的坐标系。
 */

import * as THREE from 'three';

// ===== 常量 =====

/** 主体层颜色（蓝） */
const MAIN_LAYER_COLOR = 0x4a9eff;
/** 外置层颜色（橙） */
const EXTERNAL_LAYER_COLOR = 0xff9e4a;
/** 默认层平面透明度 */
const DEFAULT_OPACITY = 0.08;
/** 层平面尺寸因子（相对空间边界） */
const PLANE_SIZE_FACTOR = 0.9;
/** 显/潜意识分界线垂直位置 */
const DIVIDER_VERTICAL = 0.5;
/** 默认视角垂直位置（显意识表层附近） */
const DEFAULT_VIEW_VERTICAL = 0.8;
/** 分界线颜色 */
const DIVIDER_COLOR = 0xffffff;
/** 分界线透明度 */
const DIVIDER_OPACITY = 0.4;
/** 层标签宽度（3D空间单位） */
const LABEL_WIDTH = 4;
/** 层标签高度（3D空间单位） */
const LABEL_HEIGHT = 1;

// ===== LayerRenderer类 =====

/**
 * 层渲染器 — 6层+2外置层3D渲染
 *
 * 核心职责:
 *   1. 渲染层平面（半透明面，主体层蓝色/外置层橙色）
 *   2. 渲染层标签（Canvas纹理Sprite）
 *   3. 渲染显/潜意识分界线（vertical=0.5水平线）
 *   4. 实现近大远小缩放（基于layerSystem.getLayerScale）
 *   5. 管理层可见性、颜色、透明度
 *
 * 不职责:
 *   - 不管理层定义（由core/layer.js管理）
 *   - 不管理念头实体（由thought-mesh.js管理）
 *   - 不管理视角（由view-orbit-camera.js管理）
 */
export class LayerRenderer {
  /**
   * @param {Object} options
   * @param {Object} options.scene - Three.js场景
   * @param {import('../core/layer.js').LayerSystem} options.layerSystem - 层系统实例
   * @param {import('../core/space.js').Space} options.space - 空间坐标系
   * @param {Object} [options.three] - Three.js命名空间（默认导入的three）
   */
  constructor({ scene, layerSystem, space, three }) {
    /** @type {Object} Three.js场景 */
    this.scene = scene;
    /** @type {Object|null} 层系统 */
    this.layerSystem = layerSystem;
    /** @type {Object|null} 空间坐标系 */
    this.space = space;
    /** @type {Object} Three.js命名空间 */
    this.three = three || THREE;

    // 可见性状态
    /** @type {boolean} 整体可见 */
    this._visible = true;
    /** @type {boolean} 层平面可见 */
    this._planesVisible = true;
    /** @type {boolean} 层标签可见 */
    this._labelsVisible = true;
    /** @type {boolean} 分界线可见 */
    this._dividerVisible = true;

    // 3D对象映射
    /** @type {Map<string, Object>} layerId → mesh */
    this._layerMeshes = new Map();
    /** @type {Map<string, Object>} layerId → sprite */
    this._layerLabels = new Map();
    /** @type {Object|null} 分界线 */
    this._dividerLine = null;

    // 资源跟踪（用于dispose）
    /** @type {Array<Object>} 待释放的geometry/material/texture */
    this._disposables = [];
    /** @type {Array<Object>} 待从场景移除的3D对象 */
    this._sceneObjects = [];
  }

  // ===== 构建与销毁 =====

  /**
   * 根据layerSystem构建层3D对象
   *
   * 步骤:
   *   1. 清除已有对象
   *   2. 遍历layerSystem.getLayers()
   *   3. 每层创建半透明平面（PlaneGeometry + MeshBasicMaterial）
   *   4. 每层创建文字标签（Canvas纹理Sprite）
   *   5. 创建显/潜意识分界线（vertical=0.5）
   *   6. 应用可见性
   */
  build() {
    this._clearObjects();

    if (!this.layerSystem || !this.space) return;

    const THREE_NS = this.three;
    const spaceSize = this.space.config.size;
    const planeWidth = spaceSize.x * PLANE_SIZE_FACTOR;
    const planeHeight = spaceSize.z * PLANE_SIZE_FACTOR;

    const layers = this.layerSystem.getLayers();

    for (const layer of layers) {
      const yRange = this.layerSystem.getLayerYRange(layer.id, spaceSize);
      if (!yRange) continue;

      const centerY = (yRange.yMin + yRange.yMax) / 2;
      const isExternal = !!layer.isExternal;
      const color = isExternal ? EXTERNAL_LAYER_COLOR : MAIN_LAYER_COLOR;

      // ===== 层平面 =====
      const geometry = new THREE_NS.PlaneGeometry(planeWidth, planeHeight);
      const materialOptions = {
        color: color,
        transparent: true,
        opacity: DEFAULT_OPACITY,
      };
      if (THREE_NS.DoubleSide !== undefined) {
        materialOptions.side = THREE_NS.DoubleSide;
      }
      const material = new THREE_NS.MeshBasicMaterial(materialOptions);
      const mesh = new THREE_NS.Mesh(geometry, material);
      mesh.position.set(0, centerY, 0);
      mesh.visible = this._planesVisible;

      this.scene.add(mesh);
      this._layerMeshes.set(layer.id, mesh);
      this._disposables.push(geometry, material);
      this._sceneObjects.push(mesh);

      // ===== 层标签 =====
      const label = this._createLabel(layer.name, isExternal);
      if (label) {
        label.position.set(0, centerY, planeHeight / 2);
        label.visible = this._labelsVisible;
        this.scene.add(label);
        this._layerLabels.set(layer.id, label);
        this._sceneObjects.push(label);
      }
    }

    // ===== 分界线 =====
    this._createDivider(spaceSize);

    // 应用整体可见性
    this._applyVisibility();
  }

  /**
   * 释放所有geometry/material/texture（包括标签Canvas纹理）
   * 并从场景移除所有3D对象
   */
  dispose() {
    this._clearObjects();
    this.layerSystem = null;
    this.space = null;
  }

  // ===== 可见性 =====

  /**
   * 设置整体可见性（与子可见性逻辑与）
   * @param {boolean} visible
   */
  setVisible(visible) {
    this._visible = !!visible;
    this._applyVisibility();
  }

  /**
   * 获取整体可见性
   * @returns {boolean}
   */
  isVisible() {
    return this._visible;
  }

  /**
   * 设置层平面可见性（半透明面）
   * @param {boolean} visible
   */
  setLayerPlanesVisible(visible) {
    this._planesVisible = !!visible;
    this._applyVisibility();
  }

  /**
   * 设置层标签可见性
   * @param {boolean} visible
   */
  setLayerLabelsVisible(visible) {
    this._labelsVisible = !!visible;
    this._applyVisibility();
  }

  /**
   * 设置显/潜意识分界线可见性
   * @param {boolean} visible
   */
  setShowDivider(visible) {
    this._dividerVisible = !!visible;
    this._applyVisibility();
  }

  // ===== 更新 =====

  /**
   * 更新LayerSystem（重建所有层对象）
   * @param {import('../core/layer.js').LayerSystem} layerSystem
   */
  setLayerSystem(layerSystem) {
    this.layerSystem = layerSystem;
    this.build();
  }

  /**
   * 根据视角垂直位置更新近大远小缩放
   * 调用layerSystem.getLayerScale(layerId, viewVertical)获取每层缩放系数
   * @param {number} viewVertical - 视角垂直位置 0.0~1.0
   */
  updateLayerScales(viewVertical) {
    if (!this.layerSystem) return;
    const vv =
      typeof viewVertical === 'number' ? viewVertical : DEFAULT_VIEW_VERTICAL;
    for (const [layerId, mesh] of this._layerMeshes.entries()) {
      if (!mesh) continue;
      const scale = this.layerSystem.getLayerScale(layerId, vv);
      if (mesh.scale && typeof mesh.scale.set === 'function') {
        // Y轴保持1（层平面本身高度不变），XZ轴按近大远小缩放
        mesh.scale.set(scale, 1, scale);
      }
    }
  }

  // ===== 获取层3D对象 =====

  /**
   * 获取某层的mesh
   * @param {string} layerId
   * @returns {Object|null}
   */
  getLayerMesh(layerId) {
    return this._layerMeshes.get(layerId) || null;
  }

  /**
   * 获取某层标签
   * @param {string} layerId
   * @returns {Object|null}
   */
  getLayerLabel(layerId) {
    return this._layerLabels.get(layerId) || null;
  }

  /**
   * 获取分界线
   * @returns {Object|null}
   */
  getDividerLine() {
    return this._dividerLine;
  }

  // ===== 配置 =====

  /**
   * 设置层透明度
   * @param {string} layerId
   * @param {number} opacity - 0.0~1.0
   */
  setLayerOpacity(layerId, opacity) {
    const mesh = this._layerMeshes.get(layerId);
    if (mesh && mesh.material) {
      mesh.material.opacity = opacity;
    }
  }

  /**
   * 设置层颜色
   * @param {string} layerId
   * @param {number|string} color - 颜色值（如0x4a9eff或'#4a9eff'）
   */
  setLayerColor(layerId, color) {
    const mesh = this._layerMeshes.get(layerId);
    if (mesh && mesh.material) {
      if (
        mesh.material.color &&
        typeof mesh.material.color.set === 'function'
      ) {
        mesh.material.color.set(color);
      } else {
        mesh.material.color = color;
      }
    }
  }

  // ===== 摘要 =====

  /**
   * 获取渲染器摘要（供AI排查）
   * @returns {{visible: boolean, layerCount: number, planesVisible: boolean, labelsVisible: boolean, dividerVisible: boolean, layers: Array<Object>}}
   */
  getSummary() {
    const layers = [];
    if (this.layerSystem) {
      for (const layer of this.layerSystem.getLayers()) {
        const mesh = this._layerMeshes.get(layer.id);
        const scale = this.layerSystem.getLayerScale(
          layer.id,
          DEFAULT_VIEW_VERTICAL
        );
        layers.push({
          id: layer.id,
          name: layer.name,
          scale: scale,
          opacity:
            mesh && mesh.material ? mesh.material.opacity : DEFAULT_OPACITY,
        });
      }
    }
    return {
      visible: this._visible,
      layerCount: this._layerMeshes.size,
      planesVisible: this._planesVisible,
      labelsVisible: this._labelsVisible,
      dividerVisible: this._dividerVisible,
      layers: layers,
    };
  }

  // ===== 私有方法 =====

  /**
   * 创建层标签Sprite（Canvas纹理，浏览器环境）
   * @param {string} text - 标签文本
   * @param {boolean} isExternal - 是否外置层（影响背景色）
   * @returns {Object|null} Sprite对象
   * @private
   */
  _createLabel(text, isExternal) {
    const THREE_NS = this.three;
    let texture = null;

    // Canvas纹理（浏览器环境；Node.js无document时跳过）
    if (typeof document !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // 背景（外置层橙色，主体层蓝色）
          ctx.fillStyle = isExternal
            ? 'rgba(255, 158, 74, 0.9)'
            : 'rgba(74, 158, 255, 0.9)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          // 文字
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 28px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);
        }
        texture = new THREE_NS.CanvasTexture(canvas);
        this._disposables.push(texture);
      } catch (_e) {
        texture = null;
      }
    }

    const materialOptions = {};
    if (texture) materialOptions.map = texture;
    const material = new THREE_NS.SpriteMaterial(materialOptions);
    this._disposables.push(material);

    const sprite = new THREE_NS.Sprite(material);
    sprite.scale.set(LABEL_WIDTH, LABEL_HEIGHT, 1);
    return sprite;
  }

  /**
   * 创建显/潜意识分界线（vertical=0.5处的水平矩形边框）
   * @param {Object} spaceSize - 空间尺寸 {x, y, z}
   * @private
   */
  _createDivider(spaceSize) {
    const THREE_NS = this.three;
    // 分界线在 vertical=0.5 → y=0
    const y = (DIVIDER_VERTICAL - 0.5) * 2 * spaceSize.y;
    const halfWidth = spaceSize.x * PLANE_SIZE_FACTOR;
    const halfDepth = spaceSize.z * PLANE_SIZE_FACTOR;

    // 矩形边框（4个顶点 + 闭合点）
    const points = [
      { x: -halfWidth, y: y, z: -halfDepth },
      { x: halfWidth, y: y, z: -halfDepth },
      { x: halfWidth, y: y, z: halfDepth },
      { x: -halfWidth, y: y, z: halfDepth },
      { x: -halfWidth, y: y, z: -halfDepth },
    ];

    const geometry = new THREE_NS.BufferGeometry();
    if (typeof geometry.setFromPoints === 'function') {
      geometry.setFromPoints(points);
    }
    const material = new THREE_NS.LineBasicMaterial({
      color: DIVIDER_COLOR,
      transparent: true,
      opacity: DIVIDER_OPACITY,
    });
    const line = new THREE_NS.Line(geometry, material);
    line.visible = this._dividerVisible;

    this.scene.add(line);
    this._dividerLine = line;
    this._disposables.push(geometry, material);
    this._sceneObjects.push(line);
  }

  /**
   * 应用整体可见性（与子可见性的逻辑与）
   * - mesh.visible = _visible && _planesVisible
   * - label.visible = _visible && _labelsVisible
   * - divider.visible = _visible && _dividerVisible
   * @private
   */
  _applyVisibility() {
    const overall = this._visible;
    for (const mesh of this._layerMeshes.values()) {
      if (mesh) mesh.visible = overall && this._planesVisible;
    }
    for (const label of this._layerLabels.values()) {
      if (label) label.visible = overall && this._labelsVisible;
    }
    if (this._dividerLine) {
      this._dividerLine.visible = overall && this._dividerVisible;
    }
  }

  /**
   * 清除所有3D对象并释放资源
   * @private
   */
  _clearObjects() {
    // 从场景移除
    if (this.scene && typeof this.scene.remove === 'function') {
      for (const obj of this._sceneObjects) {
        try {
          this.scene.remove(obj);
        } catch (_e) {
          // ignore
        }
      }
    }

    // 释放资源（geometry/material/texture）
    for (const resource of this._disposables) {
      try {
        if (resource && typeof resource.dispose === 'function') {
          resource.dispose();
        }
      } catch (_e) {
        // ignore
      }
    }

    // 清空映射
    this._layerMeshes.clear();
    this._layerLabels.clear();
    this._dividerLine = null;
    this._disposables = [];
    this._sceneObjects = [];
  }
}

export default LayerRenderer;
