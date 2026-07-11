/**
 * [INPUT]: three.js, core/thought.js (Thought 类, type=MEMORY)
 * [OUTPUT]: MemoryMeshRenderer 类 — 记忆渲染器（圆润高面数体 + 材质映射）
 *   + 材质映射（金属/玻璃/木质/液态/晶体）→ MeshStandardMaterial 参数
 *   + 温度衰减（记忆比念头冷：默认 temperature 衰减 0.3）
 *   + displayScale 应用
 *   + 跟 thought-mesh 共享 InstancedMesh 池（避免重复 draw call）
 * [POS]: src/v2/render/memory-mesh.js,L2 渲染层,记忆实体渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §3.2 内外结构（外壳硬内芯软）+ §3.3 相变（念头→记忆）
 *   - 记忆 = 圆润高面数体（SphereGeometry 32~64 段），象征"沉淀"
 *   - 材质映射：金属/玻璃/木质/液态/晶体 → MeshStandardMaterial 参数
 *   - 温度比念头低：默认 temperature = 原念头 * 0.3
 *   - 跟 thought-mesh 区别：thought 是锐利（4-8 面），memory 是圆润（32+ 面）
 *
 * 跟 thought-mesh.js 关系:
 *   - 共享 InstancedMesh 容量规划（capacity）
 *   - 共享 _tempMatrix/_tempPos 优化模式
 *   - 独立材质实例（不同 material parameters）
 *
 * 性能:
 *   - InstancedMesh 单 draw call
 *   - 容量默认 1000
 *
 * @note(s2, decision, memory-mesh, since:2026-07-09)
 *   S2.7: 记忆渲染层。基于 Thought 类（type=MEMORY 时启用）。
 *   念头通过 startPhaseTransition(MEMORY) 触发相变，本渲染器读 _transient.targetPhase
 *   决定何时切换。render-pipeline 统一调度（避免 thought-mesh / memory-mesh 各自 tick）。
 */

import * as THREE from 'three';
import { EntityType, ThoughtMaterial } from '../core/thought.js';

// ===== 视觉参数默认值 =====

const DEFAULT_CAPACITY = 1000;
const DEFAULT_BASE_RADIUS = 0.5;
const MEMORY_TEMP_DECAY = 0.3;   // 记忆温度 = 念头温度 * 0.3
const MEMORY_COLOR_BASE = 0xd0e8ff;  // 淡蓝白（记忆的"凉"感）
const DEFAULT_OPACITY = 0.85;

// ===== 材质映射（ThoughtMaterial → MeshStandardMaterial 参数） =====

const MATERIAL_PRESETS = Object.freeze({
  [ThoughtMaterial.METAL]: { metalness: 0.9, roughness: 0.2, emissiveIntensity: 0.1 },
  [ThoughtMaterial.GLASS]: { metalness: 0.0, roughness: 0.05, emissiveIntensity: 0.0, transparent: true, opacity: 0.6 },
  [ThoughtMaterial.WOOD]:  { metalness: 0.0, roughness: 0.85, emissiveIntensity: 0.05 },
  [ThoughtMaterial.LIQUID]: { metalness: 0.2, roughness: 0.1, emissiveIntensity: 0.4 },
  [ThoughtMaterial.CRYSTAL]: { metalness: 0.3, roughness: 0.0, emissiveIntensity: 0.5 },
});

// ===== MemoryMeshRenderer =====

/**
 * 记忆渲染器（InstancedMesh 单 draw call，圆润高面数）。
 *
 * 职责:
 *   1. 为每个 MEMORY type 的 Thought 创建实例
 *   2. 材质映射（5 种 ThoughtMaterial → 3D 参数）
 *   3. 温度衰减
 *   4. 共享 displayScale 逻辑
 *
 * 不负责:
 *   - 念头渲染（thought-mesh.js 负责）
 *   - 相变推进（phase-transition.js 负责）
 *   - 空间重组织（space-reorganizer.js 负责）
 */
export class MemoryMeshRenderer {
  /**
   * @param {Object} params
   * @param {THREE.Scene} params.scene
   * @param {number} [params.capacity=1000]
   * @param {Object} [params.space]
   */
  constructor({ scene, capacity = DEFAULT_CAPACITY, space = null }) {
    if (!scene) throw new Error('[MemoryMeshRenderer] scene 必填');

    this.scene = scene;
    this.capacity = capacity;
    this.space = space;

    // 高面数球（32 段 = 32x32 = 1024 三角面）— 圆润感
    this.geometry = new THREE.SphereGeometry(DEFAULT_BASE_RADIUS, 32, 24);

    // instanced attributes
    this._tempArr = new Float32Array(capacity);
    this._radiusArr = new Float32Array(capacity);
    this._materialArr = new Float32Array(capacity);  // 0~4 对应 5 种材质
    this._phaseProgressArr = new Float32Array(capacity);

    this.geometry.setAttribute('aTemp', new THREE.InstancedBufferAttribute(this._tempArr, 1));
    this.geometry.setAttribute('aRadius', new THREE.InstancedBufferAttribute(this._radiusArr, 1));
    this.geometry.setAttribute('aMaterial', new THREE.InstancedBufferAttribute(this._materialArr, 1));
    this.geometry.setAttribute('aPhaseProgress', new THREE.InstancedBufferAttribute(this._phaseProgressArr, 1));

    this.material = new THREE.MeshStandardMaterial({
      color: MEMORY_COLOR_BASE,
      transparent: true,
      opacity: DEFAULT_OPACITY,
      emissive: 0x4a5870,
      emissiveIntensity: 0.2,
      metalness: 0.3,
      roughness: 0.4,
    });

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    // 索引
    this._memoryIdByInstance = new Array(capacity).fill(null);
    this._instanceByMemoryId = new Map();

    // 临时对象
    this._tempMatrix = new THREE.Matrix4();
    this._tempPos = new THREE.Vector3();
    this._tempQuat = new THREE.Quaternion();
    this._tempScale = new THREE.Vector3();
    this._tempColor = new THREE.Color();

    this.metrics = {
      lastUpdateMs: 0,
      instanceCount: 0,
    };
  }

  /**
   * 世界坐标转换（与 thought-mesh 一致）。
   * @private
   */
  _positionToWorld(position) {
    if (this.space && typeof this.space.toWorld === 'function') {
      return this.space.toWorld(position);
    }
    const r = position.radial * 4;
    const v = position.vertical * 4 - 2;
    const o = position.orbital;
    return {
      x: r * Math.cos(o),
      y: v,
      z: r * Math.sin(o),
    };
  }

  /**
   * ThoughtMaterial -> material code (0~4)。
   * @private
   */
  _materialCode(material) {
    if (material === ThoughtMaterial.METAL) return 0;
    if (material === ThoughtMaterial.GLASS) return 1;
    if (material === ThoughtMaterial.WOOD) return 2;
    if (material === ThoughtMaterial.LIQUID) return 3;
    if (material === ThoughtMaterial.CRYSTAL) return 4;
    return 0;
  }

  /**
   * 增量更新一个 Memory Thought。
   * @param {Thought} memory - type 必须是 EntityType.MEMORY
   * @param {Object} [params]
   * @param {number} [params.viewVertical=0.5]
   * @returns {number} instanceIndex
   */
  upsert(memory, { viewVertical = 0.5 } = {}) {
    if (!memory || !memory.id) {
      throw new Error('[MemoryMeshRenderer.upsert] memory.id 必填');
    }
    if (memory.type !== EntityType.MEMORY) {
      // 兼容：允许任何 Thought 接入，但 type=MEMORY 时获得完整材质映射
      // 念头接入会被忽略
    }
    const idx = this._instanceByMemoryId.get(memory.id);
    if (idx !== undefined) {
      this._writeInstance(idx, memory, { viewVertical });
      return idx;
    }
    if (this.mesh.count >= this.capacity) {
      throw new Error(`[MemoryMeshRenderer.upsert] 容量 ${this.capacity} 已满`);
    }
    const newIdx = this.mesh.count++;
    this._memoryIdByInstance[newIdx] = memory.id;
    this._instanceByMemoryId.set(memory.id, newIdx);
    this._writeInstance(newIdx, memory, { viewVertical });
    this.metrics.instanceCount = this.mesh.count;
    return newIdx;
  }

  /**
   * @private
   */
  _writeInstance(idx, memory, { viewVertical }) {
    const t0 = performance.now();

    // 1. 位置
    const world = this._positionToWorld(memory.position);
    this._tempPos.set(world.x, world.y, world.z);

    // 2. 缩放
    const displayScale = memory.computeDisplayScale({ viewVertical });
    // 记忆相变中时 scale 略大（膨胀感）
    const phaseProg = memory._transient?.phaseTransitionProgress ?? 0;
    const phaseScaleMod = phaseProg < 1 ? 0.85 + 0.15 * phaseProg : 1.0;
    const finalScale = displayScale * phaseScaleMod;
    this._tempScale.set(finalScale, finalScale, finalScale);

    // 3. matrix
    this._tempMatrix.compose(this._tempPos, this._tempQuat, this._tempScale);
    this.mesh.setMatrixAt(idx, this._tempMatrix);

    // 4. 温度衰减
    const origTemp = memory.metadata?.temperature ?? 0.5;
    const memTemp = origTemp * MEMORY_TEMP_DECAY;
    this._tempArr[idx] = memTemp;

    // 5. 半径
    const radius = memory.config?.radiusBase ?? DEFAULT_BASE_RADIUS;
    this._radiusArr[idx] = radius;

    // 6. 材质 code
    this._materialArr[idx] = this._materialCode(memory.config?.material);

    // 7. 相变进度
    this._phaseProgressArr[idx] = phaseProg;

    // 8. 颜色：记忆基色 + 微弱温度偏移
    this._tempColor.set(MEMORY_COLOR_BASE);
    const warmShift = memTemp * 0.3;
    this._tempColor.r = Math.min(1, this._tempColor.r + warmShift);
    this._tempColor.g = Math.min(1, this._tempColor.g + warmShift * 0.5);
    this.mesh.setColorAt(idx, this._tempColor);

    // upload
    this.geometry.attributes.aTemp.needsUpdate = true;
    this.geometry.attributes.aRadius.needsUpdate = true;
    this.geometry.attributes.aMaterial.needsUpdate = true;
    this.geometry.attributes.aPhaseProgress.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;

    this.metrics.lastUpdateMs = performance.now() - t0;
  }

  /**
   * 移除记忆。
   * @param {string} memoryId
   * @returns {boolean}
   */
  remove(memoryId) {
    const idx = this._instanceByMemoryId.get(memoryId);
    if (idx === undefined) return false;
    this._instanceByMemoryId.delete(memoryId);
    this._memoryIdByInstance[idx] = null;
    if (idx === this.mesh.count - 1) {
      this.mesh.count--;
      this.metrics.instanceCount = this.mesh.count;
    } else {
      this._memoryIdByInstance[idx] = '__HOLE__';
    }
    return true;
  }

  /**
   * 清空。
   */
  clear() {
    this.mesh.count = 0;
    this._memoryIdByInstance = new Array(this.capacity).fill(null);
    this._instanceByMemoryId.clear();
    this.metrics.instanceCount = 0;
  }

  /**
   * 全量重建。
   * @param {Thought[]} memories - type=MEMORY 的 Thought 列表
   * @param {Object} [params]
   */
  rebuild(memories, params = {}) {
    this.clear();
    for (const m of memories) {
      this.upsert(m, params);
    }
  }

  /**
   * 获取材质预设表（供调试/UI 暴露）。
   * @returns {Object}
   */
  static getMaterialPresets() {
    return MATERIAL_PRESETS;
  }

  /**
   * 销毁。
   */
  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

// named exports for tree-shaking + test access
export { MATERIAL_PRESETS };

export default {
  MemoryMeshRenderer,
  MATERIAL_PRESETS,
};
