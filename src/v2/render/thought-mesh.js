/**
 * [INPUT]: three.js, core/thought.js (Thought 类) + core/space.js (空间坐标系)
 * [OUTPUT]: ThoughtMeshRenderer 类 — 念头渲染器（锐利低面数体：四面体/立方体/八面体）
 *   + 内置温度色映射（蓝=冷/红=热）
 *   + displayScale 应用（基于 position.vertical）
 *   + 瞬态层接入（phaseTransitionProgress 影响形变）
 * [POS]: src/v2/render/thought-mesh.js,L2 渲染层,念头实体渲染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §3.1 念头=占据空间的可塑多面体 + §3.4 占据空间比例
 *   - 念头 = 锐利低面数多面体（四面体/立方体/八面体），不是球
 *   - 温度 = 概念活跃度（蓝=冷/红=热），影响材质 emissive
 *   - displayScale 来自 Thought.computeDisplayScale（近大远小）
 *   - 相变瞬态：phaseTransitionProgress 0→1 期间 mesh 形变（scale lerp + 颜色渐变）
 *
 * 跟 memory-mesh.js 区别:
 *   - thought-mesh: 锐利低面数（4-8 面），强几何感，象征"思考中"
 *   - memory-mesh: 圆润高面数（32-64 面），柔和感，象征"已沉淀"
 *
 * 性能:
 *   - InstancedMesh 单 draw call 渲染所有念头
 *   - 容量默认 1000，可配置
 *   - 温度/形变 用 instanced attributes
 *
 * @note(s2, decision, thought-mesh, since:2026-07-09)
 *   S2.6: 念头渲染层。基于 Thought 类（已自动带 EntityStateAttachment）。
 *   接入 phase-transition.js（S2.8）的瞬态层：每帧读 _transient.phaseTransitionProgress
 *   决定形变插值。render-pipeline（S2.10）会统一调度。
 */

import * as THREE from 'three';
import { ThoughtPhase, ThoughtShape, ThoughtMaterial } from '../core/thought.js';
import { easeOutCubic } from '../animation/ease.js';

// ===== 视觉参数默认值 =====

const DEFAULT_CAPACITY = 1000;
const DEFAULT_BASE_RADIUS = 0.4;
const TEMP_COLD_COLOR = new THREE.Color(0x4a90e2);   // 冷蓝
const TEMP_WARM_COLOR = new THREE.Color(0xe94560);   // 热红
const TEMP_NEUTRAL_COLOR = new THREE.Color(0xc9d6ea); // 中性
const PHASE_GRAY_COLOR = new THREE.Color(0x808080);  // S2.17 相变起点 (中灰)
const DEFAULT_OPACITY = 0.92;

// ===== 形状 -> 几何工厂 =====

/**
 * 根据 ThoughtShape 枚举创建对应的 BufferGeometry。
 * 锐利低面数：四面体(4) / 立方体(6) / 八面体(8)。
 * @param {string} shape
 * @returns {THREE.BufferGeometry}
 */
export function createShapeGeometry(shape = ThoughtShape.TETRAHEDRON) {
  switch (shape) {
    case ThoughtShape.TETRAHEDRON:
      return new THREE.TetrahedronGeometry(DEFAULT_BASE_RADIUS, 0);
    case ThoughtShape.CUBE:
      return new THREE.BoxGeometry(DEFAULT_BASE_RADIUS * 1.2, DEFAULT_BASE_RADIUS * 1.2, DEFAULT_BASE_RADIUS * 1.2);
    case ThoughtShape.OCTAHEDRON:
      return new THREE.OctahedronGeometry(DEFAULT_BASE_RADIUS, 0);
    default:
      return new THREE.TetrahedronGeometry(DEFAULT_BASE_RADIUS, 0);
  }
}

/**
 * 温度色映射（0=冷, 0.5=中性, 1=热）。
 * @param {number} temperature - 0~1
 * @returns {THREE.Color}
 */
export function temperatureToColor(temperature) {
  const t = Math.max(0, Math.min(1, temperature));
  if (t < 0.5) {
    // 冷蓝 → 中性
    const k = t * 2;
    return TEMP_NEUTRAL_COLOR.clone().lerp(TEMP_COLD_COLOR, 1 - k);
  } else {
    // 中性 → 热红
    const k = (t - 0.5) * 2;
    return TEMP_NEUTRAL_COLOR.clone().lerp(TEMP_WARM_COLOR, k);
  }
}

// ===== ThoughtMeshRenderer =====

/**
 * 念头渲染器（InstancedMesh 单 draw call）
 *
 * 职责:
 *   1. 为每个 Thought 创建实例（位置/缩放/颜色/形状）
 *   2. 应用 displayScale（基于 vertical）
 *   3. 应用瞬态相变形变
 *   4. 提供 update/remove/clear API
 *
 * 不负责:
 *   - 选择（selection）— interaction/ 层负责
 *   - 动画（animation）— phase-transition.js 负责推进
 *   - 物理（physics）— space-reorganizer.js 负责
 */
export class ThoughtMeshRenderer {
  /**
   * @param {Object} params
   * @param {THREE.Scene} params.scene
   * @param {number} [params.capacity=1000]
   * @param {Object} [params.space] - Space 实例（用于三维坐标→世界坐标转换）
   */
  constructor({ scene, capacity = DEFAULT_CAPACITY, space = null }) {
    if (!scene) throw new Error('[ThoughtMeshRenderer] scene 必填');

    this.scene = scene;
    this.capacity = capacity;
    this.space = space;

    // 主几何/材质：使用基础 cube 几何作为 placeholder
    // 实际每个 Thought 的形状由 _shapeArr 决定（通过 scale 区分）
    this.geometry = new THREE.BoxGeometry(1, 1, 1);

    // instanced attributes
    this._tempArr = new Float32Array(capacity);
    this._radiusArr = new Float32Array(capacity);
    this._shapeArr = new Float32Array(capacity);   // 0=四面体, 1=立方体, 2=八面体（用 scale 区分）
    this._phaseProgressArr = new Float32Array(capacity);  // 0~1，相变瞬态进度

    this.geometry.setAttribute('aTemp', new THREE.InstancedBufferAttribute(this._tempArr, 1));
    this.geometry.setAttribute('aRadius', new THREE.InstancedBufferAttribute(this._radiusArr, 1));
    this.geometry.setAttribute('aShape', new THREE.InstancedBufferAttribute(this._shapeArr, 1));
    this.geometry.setAttribute('aPhaseProgress', new THREE.InstancedBufferAttribute(this._phaseProgressArr, 1));

    this.material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: DEFAULT_OPACITY,
      emissive: 0x222233,
      emissiveIntensity: 0.3,
      metalness: 0.4,
      roughness: 0.5,
    });

    // S2.15: onBeforeCompile patch — fragment shader 读 aPhaseProgress 计算 alpha 渐入
    //   shader 流程: vertex 读 attribute aPhaseProgress → varying 传到 fragment → output_fragment
    //   gl_FragColor.a *= (0.4 + 0.6 * aPhaseProgress)
    //   SEED phase progress=0 时 alpha=0.4, progress=1 时 alpha=1.0
    this.material.onBeforeCompile = (shader) => {
      // 1. vertex shader 注入: attribute aPhaseProgress + varying vAlphaMod
      shader.vertexShader = 'attribute float aPhaseProgress;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
varying float vAlphaMod;`
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vAlphaMod = 0.4 + 0.6 * aPhaseProgress;`
      );
      // 2. fragment shader 注入: varying vAlphaMod + 改 alpha
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
varying float vAlphaMod;`
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <output_fragment>',
        `#include <output_fragment>
gl_FragColor.a *= vAlphaMod;`
      );
    };
    this.material.needsUpdate = true;

    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, capacity);
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.mesh);

    // 实体索引
    this._thoughtIdByInstance = new Array(capacity).fill(null);
    this._instanceByThoughtId = new Map();

    // 临时对象（避免每帧 new）
    this._tempMatrix = new THREE.Matrix4();
    this._tempPos = new THREE.Vector3();
    this._tempQuat = new THREE.Quaternion();
    this._tempScale = new THREE.Vector3();
    this._tempColor = new THREE.Color();

    // 性能指标（render-pipeline 读取）
    this.metrics = {
      lastUpdateMs: 0,
      instanceCount: 0,
    };
  }

  /**
   * 世界坐标 = space.toWorld(position) 或 fallback。
   * @private
   */
  _positionToWorld(position) {
    if (this.space && typeof this.space.toWorld === 'function') {
      return this.space.toWorld(position);
    }
    // fallback: 直接用 position 的 (radial, vertical, orbital) 做球面坐标
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
   * ThoughtShape -> shape code (0/1/2)。
   * @private
   */
  _shapeCode(shape) {
    if (shape === ThoughtShape.CUBE) return 1;
    if (shape === ThoughtShape.OCTAHEDRON) return 2;
    return 0;  // default TETRAHEDRON
  }

  /**
   * 增量更新一个 Thought。
   * @param {Thought} thought
   * @param {Object} [params]
   * @param {number} [params.viewVertical=0.5]
   * @returns {number} instanceIndex
   */
  upsert(thought, { viewVertical = 0.5 } = {}) {
    if (!thought || !thought.id) {
      throw new Error('[ThoughtMeshRenderer.upsert] thought.id 必填');
    }
    const idx = this._instanceByThoughtId.get(thought.id);
    if (idx !== undefined) {
      this._writeInstance(idx, thought, { viewVertical });
      return idx;
    }
    // 新增
    if (this.mesh.count >= this.capacity) {
      throw new Error(`[ThoughtMeshRenderer.upsert] 容量 ${this.capacity} 已满`);
    }
    const newIdx = this.mesh.count++;
    this._thoughtIdByInstance[newIdx] = thought.id;
    this._instanceByThoughtId.set(thought.id, newIdx);
    this._writeInstance(newIdx, thought, { viewVertical });
    this.metrics.instanceCount = this.mesh.count;
    return newIdx;
  }

  /**
   * @private
   */
  _writeInstance(idx, thought, { viewVertical }) {
    const t0 = performance.now();

    // 1. 位置
    const world = this._positionToWorld(thought.position);
    this._tempPos.set(world.x, world.y, world.z);

    // 2. 缩放 = displayScale（近大远小）
    const displayScale = thought.computeDisplayScale({ viewVertical });
    // 相变瞬态视觉:
    //   - SEED 起步 (progress=0): scale=0 (隐) → 进度 → 1 时 scale → 1.0 (爆裂出现)
    //   - 其他相变中 (0<progress<1): scale 0.7 → 1.0 (收缩感)
    //   - 已完成 (progress=1): scale=1.0
    // S2.14 入场动画核心: spawn 改用 startPhaseTransition 后, SEED→CRYSTAL 0.8s 推进时
    //   scale 从 0 弹到 1, 给用户"念头从无到有"的视觉反馈.
    const phaseScaleMod = this._computePhaseScaleMod(thought);
    const finalScale = displayScale * phaseScaleMod;
    this._tempScale.set(finalScale, finalScale, finalScale);

    // 3. 应用 matrix
    this._tempMatrix.compose(this._tempPos, this._tempQuat, this._tempScale);
    this.mesh.setMatrixAt(idx, this._tempMatrix);

    // 4. 温度（来自 metadata.temperature，默认 0.5）
    const temperature = thought.metadata?.temperature ?? 0.5;
    this._tempArr[idx] = temperature;

    // 5. 半径（来自 config.radiusBase，default 0.4）
    const radius = thought.config?.radiusBase ?? DEFAULT_BASE_RADIUS;
    this._radiusArr[idx] = radius;

    // 6. 形状 code
    this._shapeArr[idx] = this._shapeCode(thought.config?.shape);

    // 7. 相变进度 (SEED 起步 0, 完成后 1)
    const phaseProg = thought._transient?.phaseTransitionProgress ?? 0;
    this._phaseProgressArr[idx] = phaseProg;

    // 8. 颜色（温度色 + S2.17 相变颜色 lerp: SEED 灰 → 真温度色）
    const trueColor = temperatureToColor(temperature);
    const phaseColor = this._computePhaseColorMod(thought, trueColor);
    this._tempColor.copy(phaseColor);
    this.mesh.setColorAt(idx, this._tempColor);

    // 标记 attribute 需上传
    this.geometry.attributes.aTemp.needsUpdate = true;
    this.geometry.attributes.aRadius.needsUpdate = true;
    this.geometry.attributes.aShape.needsUpdate = true;
    this.geometry.attributes.aPhaseProgress.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;

    this.metrics.lastUpdateMs = performance.now() - t0;
  }

  /**
   * 移除一个 Thought。
   * @param {string} thoughtId
   * @returns {boolean} 是否成功移除
   */
  remove(thoughtId) {
    const idx = this._instanceByThoughtId.get(thoughtId);
    if (idx === undefined) return false;
    this._instanceByThoughtId.delete(thoughtId);
    this._thoughtIdByInstance[idx] = null;
    // 简化为：递减 count（让最后一个被复用）
    // 完整实现需做 swap-pop，这里先保守处理
    if (idx === this.mesh.count - 1) {
      this.mesh.count--;
      this.metrics.instanceCount = this.mesh.count;
    } else {
      // 中间空洞：留待 S2.10 render-pipeline 做压缩
      this._thoughtIdByInstance[idx] = '__HOLE__';
    }
    return true;
  }

  /**
   * 全量清空。
   */
  clear() {
    this.mesh.count = 0;
    this._thoughtIdByInstance = new Array(this.capacity).fill(null);
    this._instanceByThoughtId.clear();
    this.metrics.instanceCount = 0;
  }

  /**
   * 全量重建（性能开销大，仅在 thought[] 大量变化时调用）。
   * @param {Thought[]} thoughts
   * @param {Object} [params]
   */
  rebuild(thoughts, params = {}) {
    this.clear();
    for (const t of thoughts) {
      this.upsert(t, params);
    }
  }

  /**
   * S2.16: linear phaseProgress 经过 ease-out 缓动后再返回
   * 给 _computePhaseScaleMod / _computePhaseAlphaMod 共享
   * @private
   * @param {number} linearProg - 0~1 linear tick
   * @returns {number} 0~1 eased
   */
  _applyPhaseEasing(linearProg) {
    return easeOutCubic(linearProg);
  }

  /**
   * 计算相变时使用的 scale 乘子 (SEED 弹入 / 相变中收缩 / 完成 1.0).
   * S2.14: 抽成独立方法以便测试, 避开 Three.js InstancedMesh 矩阵分解怪行为.
   * S2.16: linearProg 走 ease-out 缓动, 让"念头弹出"前快后慢.
   * @private
   * @param {Thought} thought
   * @returns {number} 0.0 ~ 1.0
   */
  _computePhaseScaleMod(thought) {
    const currentPhase = thought._transient?.currentPhase ?? ThoughtPhase.SEED;
    const linearProg = thought._transient?.phaseTransitionProgress ?? 0;
    const phaseProg = this._applyPhaseEasing(linearProg);  // S2.16
    if (currentPhase === ThoughtPhase.SEED) {
      // SEED 起步: scale=0, 进度→1 时 scale→1.0 (爆裂)
      return phaseProg;
    }
    if (linearProg < 1) {
      // 其他相变中: 0.7 → 1.0 收缩感 (缓动后)
      return 0.7 + 0.3 * phaseProg;
    }
    return 1.0;
  }

  /**
   * S2.15: 相变 alpha 修饰 (0~1) — 跟 scale 互补, 让入场动画有"从透明到实体"感觉
   *   - SEED 起步 (progress=0): alpha=0 (不可见) → progress=1: alpha=1 (完全可见)
   *   - 其他相变中 (0<progress<1): alpha 0.4 → 1.0 (变实感)
   *   - 已完成 (progress=1): alpha=1.0
   * S2.16: 跟 scale 走同一个 ease-out 缓动, scale/alpha 同步.
   * @private
   * @param {Thought} thought
   * @returns {number} 0.0 ~ 1.0
   */
  _computePhaseAlphaMod(thought) {
    const currentPhase = thought._transient?.currentPhase ?? ThoughtPhase.SEED;
    const linearProg = thought._transient?.phaseTransitionProgress ?? 0;
    const phaseProg = this._applyPhaseEasing(linearProg);  // S2.16
    if (currentPhase === ThoughtPhase.SEED) {
      // SEED 起步: alpha=0, 进度→1 时 alpha→1.0 (淡入, 缓动后)
      return phaseProg;
    }
    if (linearProg < 1) {
      // 其他相变中: 0.4 → 1.0 变实感 (缓动后)
      return 0.4 + 0.6 * phaseProg;
    }
    return 1.0;
  }

  /**
   * S2.17: 相变颜色 lerp (从灰 → 真温度色) — 让 SEED 起步念头是灰色, 进度→1 时过渡到真温度色
   *   - SEED 起步 (progress=0): color = GRAY (灰)
   *   - SEED 中 (0<progress<1): color = lerp(trueColor, GRAY, 1 - easedProg)
   *   - 其他相变中 (其他 phase, 0<progress<1): color = trueColor (不 lerp, 已经是真色)
   *   - 已完成 (progress=1): color = trueColor
   * S2.16: lerp 系数走 ease-out 缓动, 跟 scale/alpha 同步.
   * @private
   * @param {Thought} thought
   * @param {THREE.Color} trueColor - 真温度色
   * @returns {THREE.Color} 新 Color 实例 (caller copy)
   */
  _computePhaseColorMod(thought, trueColor) {
    const currentPhase = thought._transient?.currentPhase ?? ThoughtPhase.SEED;
    const linearProg = thought._transient?.phaseTransitionProgress ?? 0;
    const phaseProg = this._applyPhaseEasing(linearProg);  // S2.16 缓动共享
    if (currentPhase === ThoughtPhase.SEED && linearProg < 1) {
      // phaseProg=0 → gray, phaseProg=1 → trueColor
      // Color.lerp(other, alpha) = this * (1-alpha) + other * alpha
      // 所以 lerp(trueColor, gray, 1-phaseProg) = trueColor*phaseProg + gray*(1-phaseProg) ✓
      return trueColor.clone().lerp(PHASE_GRAY_COLOR, 1 - phaseProg);
    }
    return trueColor.clone();
  }

  /**
   * 推进所有 thought 的相变动画（每帧调用）。
   * @param {number} deltaTime
   */
  tickPhaseTransitions(deltaTime) {
    for (const [thoughtId, idx] of this._instanceByThoughtId) {
      const thought = this._thoughtRefs?.get(thoughtId);
      if (!thought) continue;
      thought.tickPhaseTransition(deltaTime);
      this._phaseProgressArr[idx] = thought._transient.phaseTransitionProgress;
    }
    this.geometry.attributes.aPhaseProgress.needsUpdate = true;
  }

  /**
   * 注入 thought 引用（让 tickPhaseTransitions 能调 _transient）。
   * 由 main.js / render-pipeline 注入。
   * @param {Map<string, Thought>} thoughtRefs
   */
  setThoughtRefs(thoughtRefs) {
    this._thoughtRefs = thoughtRefs;
  }

  /**
   * 销毁（释放 GPU 资源）。
   */
  dispose() {
    this.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}

export default {
  ThoughtMeshRenderer,
  createShapeGeometry,
  temperatureToColor,
};
