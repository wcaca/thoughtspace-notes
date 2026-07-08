/**
 * [INPUT]: three.js (PerspectiveCamera), core/view-orbit.js (轨道数学)
 * [OUTPUT]: ViewOrbitCamera类 — 圆周轨道视角相机（5预设位置+平滑过渡动画）
 * [POS]: src/v2/render/view-orbit-camera.js,L2渲染层,视角控制
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.4 默认视角轨道、§8 操作体系
 *   - 相机沿圆周表面转动，5个默认位置（初始/右划1/右划2/右划3/左划）
 *   - 平滑过渡（非瞬移），默认500ms
 *   - 不规则轨道形状，Catmull-Rom样条插值
 *
 * @note(s1, decision, orbit-camera, since:2026-07-08)
 *   S1-C.1.8: 视角控制，与view-orbit.js联动。
 *   手势触发在S3实现（view-orbit-swipe.js），本组件只提供API。
 *
 * 实现说明:
 *   - three.js通过构造参数注入（camera/three），不静态import，
 *     便于在无three.js安装环境下进行单元测试（与view-orbit.js默认坐标系配合）。
 *   - 过渡动画用 easeInOutCubic 缓动 + 轨道重采样：每帧对t插值后重新调用
 *     viewOrbit.getCameraState(t)，相机沿Catmull-Rom曲线运动（非直线弦）。
 */

import { ViewOrbit, OrbitPosition, DEFAULT_ORBIT_POSITIONS } from '../core/view-orbit.js';

// ===== 缓动函数 =====

/**
 * easeInOutCubic 缓动
 * @param {number} x - 线性进度 [0, 1]
 * @returns {number} 缓动后进度 [0, 1]
 */
function easeInOutCubic(x) {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * 线性插值
 * @param {number} a - 起点
 * @param {number} b - 终点
 * @param {number} t - 插值因子 [0, 1]
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

// ===== ViewOrbitCamera 类 =====

/**
 * 圆周轨道视角相机
 *
 * 核心职责:
 *   1. 沿 view-orbit 定义的圆周轨道移动 Three.js PerspectiveCamera
 *   2. 5个预设位置间平滑过渡（easeInOutCubic，默认500ms）
 *   3. 每帧 update 推进动画，重采样轨道曲线（相机沿曲线运动，非直线弦）
 *   4. 提供手势层（S3）调用的视角控制API
 *
 * 不职责:
 *   - 不定义轨道数学（交给 view-orbit.js）
 *   - 不识别手势（交给 S3 view-orbit-swipe.js）
 *   - 不管理渲染循环（交给 render-pipeline.js）
 */
export class ViewOrbitCamera {
  /**
   * @param {Object} options
   * @param {Object} options.camera - Three.js PerspectiveCamera（需有 position.set 与 lookAt）
   * @param {Object} options.viewOrbit - ViewOrbit 实例（轨道数学）
   * @param {Object} [options.three] - THREE 命名空间（可选注入，保留供扩展使用）
   */
  constructor({ camera, viewOrbit, three } = {}) {
    if (!camera) {
      throw new Error('ViewOrbitCamera requires a camera');
    }
    if (!viewOrbit) {
      throw new Error('ViewOrbitCamera requires a viewOrbit');
    }

    /** @type {Object|null} THREE命名空间（可选注入） */
    this._three = three || null;
    /** @type {Object} Three.js相机 */
    this._camera = camera;
    /** @type {Object} ViewOrbit实例 */
    this._viewOrbit = viewOrbit;

    // 轨道参数状态
    /** @type {number} 当前轨道参数t [0,1]（动画中为已插值的实时值） */
    this._currentT = 0;
    /** @type {number} 目标轨道参数t [0,1] */
    this._targetT = 0;

    // 动画状态
    /** @type {boolean} 是否在过渡动画中 */
    this._animating = false;
    /** @type {{t:number, time:number}|null} 动画起点（t值与起始时间戳ms） */
    this._animStart = null;
    /** @type {{t:number, time:number}|null} 动画终点（t值与结束时间戳ms） */
    this._animEnd = null;
    /** @type {number} 过渡时长（ms） */
    this._duration = 500;
    /** @type {number} 当前动画已耗时（ms） */
    this._elapsed = 0;

    // 配置
    /** @type {number} 插值速度 [0,1]，1=瞬移无动画 */
    this._lerpSpeed = 0;
    /** @type {{x:number,y:number,z:number}} 注视点（默认晶体中心） */
    this._target = { x: 0, y: 0, z: 0 };

    /** @type {{x:number,y:number,z:number}} 当前相机位置缓存 */
    this._currentPosition = { x: 0, y: 0, z: 0 };

    // 初始化定位到 t=0
    this._applyState(0);
  }

  // ===== 内部方法 =====

  /**
   * 钳位 t 到 [0, 1]
   * @param {number} t
   * @returns {number}
   * @private
   */
  _clampT(t) {
    if (typeof t !== 'number' || isNaN(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }

  /**
   * 获取当前时间戳（ms）
   * @returns {number}
   * @private
   */
  _now() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  /**
   * 将轨道参数 t 对应的相机状态应用到 Three.js 相机
   * @param {number} t - 轨道参数 [0, 1]
   * @private
   */
  _applyState(t) {
    const tc = this._clampT(t);
    const state = this._viewOrbit.getCameraState(tc);
    this._camera.position.set(state.position.x, state.position.y, state.position.z);
    this._camera.lookAt(this._target.x, this._target.y, this._target.z);
    this._currentPosition = { x: state.position.x, y: state.position.y, z: state.position.z };
  }

  // ===== 视角位置控制 =====

  /**
   * 设置轨道参数 t
   * @param {number} t - 轨道参数 [0,1]（0=初始位置，1=左划位置）
   * @param {boolean} [animate=true] - 是否平滑过渡
   */
  setPosition(t, animate = true) {
    const tc = this._clampT(t);
    this._targetT = tc;

    // lerpSpeed>=1 或 animate=false → 瞬移
    const instant = !animate || this._lerpSpeed >= 1;
    if (instant) {
      this._animating = false;
      this._animStart = null;
      this._animEnd = null;
      this._elapsed = 0;
      this._currentT = tc;
      this._applyState(tc);
      return;
    }

    // 启动过渡动画：记录起止 t 值与起止时间
    const now = this._now();
    this._animating = true;
    this._animStart = { t: this._currentT, time: now };
    this._animEnd = { t: tc, time: now + this._duration };
    this._elapsed = 0;
  }

  /**
   * 跳到预设位置
   * @param {string} presetName - 预设名称（initial/right1/right2/right3/left）
   * @param {boolean} [animate=true] - 是否平滑过渡
   */
  setToPreset(presetName, animate = true) {
    const name = String(presetName == null ? '' : presetName).toLowerCase();
    let t = null;

    // 优先查 DEFAULT_ORBIT_POSITIONS
    for (const p of DEFAULT_ORBIT_POSITIONS) {
      if (p.name === name) { t = p.t; break; }
    }
    // 回退: 查 viewOrbit.getPositions()
    if (t === null && typeof this._viewOrbit.getPositions === 'function') {
      for (const p of this._viewOrbit.getPositions()) {
        if (p.name === name) { t = p.t; break; }
      }
    }
    // 再回退: 用 OrbitPosition 枚举映射
    if (t === null) {
      const map = {
        [OrbitPosition.INITIAL]: 0.0,
        [OrbitPosition.RIGHT1]: 0.25,
        [OrbitPosition.RIGHT2]: 0.5,
        [OrbitPosition.RIGHT3]: 0.75,
        [OrbitPosition.LEFT]: 1.0,
      };
      if (Object.prototype.hasOwnProperty.call(map, name)) t = map[name];
    }
    // 最终回退: 保持当前 t
    if (t === null) t = this._currentT;

    this.setPosition(t, animate);
  }

  /**
   * 获取当前轨道参数 t
   * @returns {number}
   */
  getOrbitParam() {
    return this._currentT;
  }

  /**
   * 获取当前相机位置
   * @returns {{x:number,y:number,z:number}}
   */
  getCurrentPosition() {
    return { x: this._currentPosition.x, y: this._currentPosition.y, z: this._currentPosition.z };
  }

  /**
   * 获取最近预设位置名称
   * @returns {string} OrbitPosition 枚举值
   */
  getCurrentPreset() {
    const nearest = this._viewOrbit.getNearestPosition(this._currentT);
    return nearest ? nearest.name : OrbitPosition.INITIAL;
  }

  // ===== 动画 =====

  /**
   * 是否在过渡动画中
   * @returns {boolean}
   */
  isAnimating() {
    return this._animating;
  }

  /**
   * 停止动画（保持当前已插值的位置，不回弹到终点）
   */
  stopAnimation() {
    this._animating = false;
    this._animStart = null;
    this._animEnd = null;
    this._elapsed = 0;
  }

  /**
   * 设置过渡时长
   * @param {number} ms - 时长（ms），小于等于0时视为瞬移
   */
  setAnimationDuration(ms) {
    this._duration = (typeof ms === 'number' && !isNaN(ms) && ms > 0) ? ms : 0;
  }

  /**
   * 设置插值速度
   * @param {number} speed - [0,1]，1=瞬移无动画
   */
  setLerpSpeed(speed) {
    let s = 0;
    if (typeof speed === 'number' && !isNaN(speed)) {
      s = Math.max(0, Math.min(1, speed));
    }
    this._lerpSpeed = s;
  }

  // ===== 更新 =====

  /**
   * 推进动画并更新相机（每帧调用）
   * @param {number} deltaTime - 帧间隔（秒）
   */
  update(deltaTime) {
    if (!this._animating) return;

    const dtMs = (typeof deltaTime === 'number' && !isNaN(deltaTime)) ? deltaTime * 1000 : 0;
    this._elapsed += dtMs;

    const duration = this._duration <= 0 ? 1 : this._duration;
    let progress = this._elapsed / duration;
    let done = false;
    if (progress >= 1) {
      progress = 1;
      done = true;
    }

    const eased = easeInOutCubic(progress);
    const startT = this._animStart ? this._animStart.t : this._currentT;
    const endT = this._animEnd ? this._animEnd.t : this._targetT;
    const interpT = lerp(startT, endT, eased);

    // 重采样轨道曲线：相机沿 Catmull-Rom 曲线运动
    this._currentT = interpT;
    this._applyState(interpT);

    if (done) {
      this._currentT = endT;
      this._targetT = endT;
      this._animating = false;
      this._animStart = null;
      this._animEnd = null;
      this._elapsed = 0;
    }
  }

  // ===== 配置 =====

  /**
   * 更新 ViewOrbit 实例
   * @param {Object} viewOrbit
   */
  setViewOrbit(viewOrbit) {
    if (!viewOrbit) {
      throw new Error('ViewOrbitCamera.setViewOrbit requires a viewOrbit');
    }
    this._viewOrbit = viewOrbit;
    this._applyState(this._currentT);
  }

  /**
   * 更新 Three.js 相机
   * @param {Object} camera
   */
  setCamera(camera) {
    if (!camera) {
      throw new Error('ViewOrbitCamera.setCamera requires a camera');
    }
    this._camera = camera;
    this._applyState(this._currentT);
  }

  /**
   * 设置注视点
   * @param {{x:number,y:number,z:number}} target - 注视点坐标（默认 {0,0,0} 晶体中心）
   */
  setTarget(target) {
    if (target && typeof target === 'object') {
      this._target = {
        x: Number(target.x) || 0,
        y: Number(target.y) || 0,
        z: Number(target.z) || 0,
      };
    } else {
      this._target = { x: 0, y: 0, z: 0 };
    }
    this._applyState(this._currentT);
  }

  // ===== 摘要 =====

  /**
   * 获取相机摘要（供AI排查）
   * @returns {Object} {orbitParam, currentPreset, isAnimating, position, target, duration}
   */
  getSummary() {
    return {
      orbitParam: this._currentT,
      currentPreset: this.getCurrentPreset(),
      isAnimating: this._animating,
      position: this.getCurrentPosition(),
      target: { x: this._target.x, y: this._target.y, z: this._target.z },
      duration: this._duration,
    };
  }
}

export default ViewOrbitCamera;
