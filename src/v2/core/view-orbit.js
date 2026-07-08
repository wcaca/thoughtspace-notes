/**
 * [INPUT]: space.js坐标系
 * [OUTPUT]: ViewOrbit类 — 圆周轨道视角数学
 * [POS]: src/v2/core/view-orbit.js,L1领域核心层
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 * @note(s1, decision, orbit-math, since:2026-07-08)
 *
 * 设计依据: 空间交互设计.md §1.4默认视角轨道、§8.3视角切换
 *   - §1.3 维度3 圆周轨道: 视角沿圆周表面转动，轨道形状不规则（默认），可自定义
 *   - §1.4 5个默认轨道位置: 初始/右划1/右划2/右划3/左划，不同位置看到不同左右内容组合
 *   - §8.3 左右划: 从1/4外层左右滑动，圆周视角轨道转动
 *
 * 核心概念:
 *   视角沿圆周表面转动，不同位置看到不同的左右内容组合。
 *   轨道形状默认不规则（Catmull-Rom样条），控制点可拖拽。
 *   轨道参数t(0-1)连续可调，支持任意中间位置。
 *
 * 与space.js联动:
 *   控制点以三维度坐标(vertical/radial/orbital)定义。
 *   使用space.fromDimensions转3D笛卡尔坐标进行样条插值。
 *   使用space.toDimensions将插值结果转回三维度坐标。
 *
 * 与mark-system联动:
 *   轨道可作为mark-system的orbit-path类型实例（三方联动接口）。
 *   通过toMarkInstanceData()导出为mark-system实例数据。
 *
 * @note(s1, decision, orbit-math, since:2026-07-08)
 *   S1-A.3: 圆周轨道视角数学，纯逻辑无渲染依赖。
 *   可选依赖space.js的坐标系（未注入space时使用内置默认坐标系，便于独立测试）。可作为mark-system的orbit-path实例。
 */

// ===== 轨道位置枚举 =====

/**
 * 5个默认轨道位置（§1.4表格）
 * @readonly
 * @enum {string}
 */
export const OrbitPosition = Object.freeze({
  INITIAL: 'initial',   // 初始位置（默认视角）
  RIGHT1: 'right1',     // 右划1（切到工作模式）
  RIGHT2: 'right2',     // 右划2（切到计划模式）
  RIGHT3: 'right3',     // 右划3（切到物质层）
  LEFT: 'left',         // 左划（切到回溯模式）
});

// ===== 默认轨道位置定义（§1.4表格）=====

/**
 * 5个默认轨道位置定义
 * 每个位置包含: 名称、轨道参数t、左右内容、模式、控制点(三维度坐标)
 *
 * 控制点使用三维度坐标(vertical/radial/orbital):
 *   - vertical: 0.0=底层外置 ~ 0.5=中间 ~ 1.0=顶层外置
 *   - radial: 0.0=圆心 ~ 1.0=外层表面
 *   - orbital: 0~2π，圆周角度
 *
 * 默认轨道形状不规则: 各位置vertical/radial略有差异，形成非完美圆形轨道。
 * 5个位置在圆周上均匀分布（间隔2π/5=72°）。
 *
 * @type {ReadonlyArray<Object>}
 */
export const DEFAULT_ORBIT_POSITIONS = Object.freeze([
  {
    name: OrbitPosition.INITIAL,
    t: 0.0,
    leftContent: '过去记忆（用户输入）',
    rightContent: '行为模式（信念→思维→情绪→念头，用户排序）',
    mode: '默认',
    controlPoint: { vertical: 0.50, radial: 1.00, orbital: 0.0 },
  },
  {
    name: OrbitPosition.RIGHT1,
    t: 0.25,
    leftContent: '念头区',
    rightContent: 'Todo',
    mode: '工作模式',
    controlPoint: { vertical: 0.48, radial: 1.05, orbital: 1.25663706 }, // 2π/5
  },
  {
    name: OrbitPosition.RIGHT2,
    t: 0.5,
    leftContent: 'Todo',
    rightContent: '计划+未做',
    mode: '计划模式',
    controlPoint: { vertical: 0.52, radial: 0.95, orbital: 2.51327412 }, // 4π/5
  },
  {
    name: OrbitPosition.RIGHT3,
    t: 0.75,
    leftContent: '计划+未做',
    rightContent: '外部物质/结构',
    mode: '物质层',
    controlPoint: { vertical: 0.49, radial: 1.02, orbital: 3.76991118 }, // 6π/5
  },
  {
    name: OrbitPosition.LEFT,
    t: 1.0,
    leftContent: '过去记忆',
    rightContent: '行为模式',
    mode: '回溯模式',
    controlPoint: { vertical: 0.51, radial: 0.98, orbital: 5.02654825 }, // 8π/5
  },
]);

// ===== 默认轨道配置 =====

const DEFAULT_ORBIT_CONFIG = Object.freeze({
  // 相机目标点（默认空间中心）
  cameraTarget: { x: 0, y: 0, z: 0 },
  // 相机上方向
  cameraUp: { x: 0, y: 1, z: 0 },
  // 样条曲线类型
  splineType: 'catmull-rom',
});

// ===== Catmull-Rom样条插值 =====

/**
 * Catmull-Rom样条插值（单分量）
 * 给定4个控制点的某一分量，计算段内参数t处的插值值
 * @param {number} p0 - 前一控制点分量
 * @param {number} p1 - 段起点分量
 * @param {number} p2 - 段终点分量
 * @param {number} p3 - 后一控制点分量
 * @param {number} t - 段内参数 [0, 1]
 * @returns {number}
 */
function catmullRom1D(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
}

/**
 * 3D Catmull-Rom样条插值
 * @param {{x:number,y:number,z:number}} p0 - 前一控制点
 * @param {{x:number,y:number,z:number}} p1 - 段起点
 * @param {{x:number,y:number,z:number}} p2 - 段终点
 * @param {{x:number,y:number,z:number}} p3 - 后一控制点
 * @param {number} t - 段内参数 [0, 1]
 * @returns {{x:number,y:number,z:number}}
 */
function catmullRom3D(p0, p1, p2, p3, t) {
  return {
    x: catmullRom1D(p0.x, p1.x, p2.x, p3.x, t),
    y: catmullRom1D(p0.y, p1.y, p2.y, p3.y, t),
    z: catmullRom1D(p0.z, p1.z, p2.z, p3.z, t),
  };
}

/**
 * 沿控制点序列进行Catmull-Rom样条插值
 * 开放样条：端点处通过钳位（重复端点）处理
 * @param {Array<{x:number,y:number,z:number}>} points - 控制点序列（3D坐标）
 * @param {number} t - 全局参数 [0, 1]
 * @returns {{x:number,y:number,z:number}} 插值点
 */
function interpolateCatmullRom(points, t) {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0, z: 0 };
  if (n === 1) return { x: points[0].x, y: points[0].y, z: points[0].z };

  // 钳位t到[0, 1]
  const tc = Math.max(0, Math.min(1, t));

  // 段数 = n - 1
  const segmentCount = n - 1;
  const scaledT = tc * segmentCount;
  const segIndex = Math.min(Math.floor(scaledT), segmentCount - 1);
  const localT = scaledT - segIndex;

  // 获取4个控制点（端点处钳位：不存在的邻居用端点本身）
  const p0 = points[Math.max(0, segIndex - 1)];
  const p1 = points[segIndex];
  const p2 = points[segIndex + 1];
  const p3 = points[Math.min(n - 1, segIndex + 2)];

  return catmullRom3D(p0, p1, p2, p3, localT);
}

// ===== ViewOrbit类 =====

/**
 * 圆周轨道视角数学组件
 *
 * 核心职责:
 *   1. 定义5个默认轨道位置（§1.4表格）
 *   2. 提供Catmull-Rom样条轨道插值
 *   3. 计算任意t值的轨道位置和相机状态
 *   4. 支持自定义轨道形状（控制点可拖拽）
 *   5. 与space.js联动（三维度↔3D坐标转换）
 *   6. 可作为mark-system的orbit-path实例
 *
 * 不职责:
 *   - 不渲染轨道（交给render层）
 *   - 不管理手势交互（交给interaction层）
 *   - 不管理空间边界（交给space.js）
 */
export class ViewOrbit {
  /**
   * @param {Object} options
   * @param {Object} options.space - Space实例（提供坐标系fromDimensions/toDimensions）
   * @param {Object} [options.config] - 轨道配置（覆盖默认值）
   * @param {{x:number,y:number,z:number}} [options.config.cameraTarget] - 相机目标点
   * @param {{x:number,y:number,z:number}} [options.config.cameraUp] - 相机上方向
   * @param {string} [options.config.splineType] - 样条类型
   */
  constructor({ space, config = {} } = {}) {
    if (!space) {
      // 未注入space时使用内置默认坐标系（与Space默认配置一致），便于独立测试与渲染层隔离
      space = ViewOrbit._createDefaultSpace();
    } else if (typeof space.fromDimensions !== 'function' || typeof space.toDimensions !== 'function') {
      throw new Error('ViewOrbit requires space with fromDimensions/toDimensions methods');
    }

    /** @type {Object} Space实例 */
    this.space = space;
    /** @type {Object} 轨道配置 */
    this.config = {
      ...DEFAULT_ORBIT_CONFIG,
      ...config,
      cameraTarget: { ...(config.cameraTarget || DEFAULT_ORBIT_CONFIG.cameraTarget) },
      cameraUp: { ...(config.cameraUp || DEFAULT_ORBIT_CONFIG.cameraUp) },
    };

    // 预设位置（深拷贝默认位置）
    /** @type {Array<Object>} 预设位置定义 */
    this._positions = DEFAULT_ORBIT_POSITIONS.map((p) => ({
      ...p,
      controlPoint: { ...p.controlPoint },
    }));

    // 控制点（三维度坐标，用于样条插值）
    /** @type {Array<{vertical:number,radial:number,orbital:number}>} */
    this._controlPoints = this._positions.map((p) => ({ ...p.controlPoint }));

    // 3D控制点缓存（转换后）
    /** @type {Array<{x,y,z}>|null} */
    this._controlPoints3DCache = null;

    // 自定义路径标记
    /** @type {boolean} */
    this._hasCustomPath = false;
  }

  /**
   * 创建内置默认坐标系（未注入space时使用）
   * 与Space默认配置一致: size {x:10, y:10, z:10}，提供fromDimensions/toDimensions。
   * 使ViewOrbit可独立实例化（便于单元测试与渲染层隔离），不影响注入space时的行为。
   * @returns {{id:string, config:{size:{x:number,y:number,z:number}}, fromDimensions:Function, toDimensions:Function}}
   * @private
   */
  static _createDefaultSpace() {
    const size = { x: 10, y: 10, z: 10 };
    return {
      id: 'default-space',
      config: { size },
      fromDimensions(vertical, radial, orbital) {
        const y = (vertical - 0.5) * 2 * size.y;
        const r = radial * size.x;
        return { x: r * Math.cos(orbital), y, z: r * Math.sin(orbital) };
      },
      toDimensions(x, y, z) {
        return {
          vertical: y / (2 * size.y) + 0.5,
          radial: Math.sqrt(x * x + z * z) / size.x,
          orbital: Math.atan2(z, x),
        };
      },
    };
  }

  // ===== 内部方法 =====

  /**
   * 获取3D控制点（带缓存）
   * 将三维度控制点转换为3D笛卡尔坐标
   * @returns {Array<{x:number,y:number,z:number}>}
   * @private
   */
  _getControlPoints3D() {
    if (this._controlPoints3DCache) {
      return this._controlPoints3DCache;
    }
    this._controlPoints3DCache = this._controlPoints.map((cp) => {
      const pos = this.space.fromDimensions(cp.vertical, cp.radial, cp.orbital);
      return { x: pos.x, y: pos.y, z: pos.z };
    });
    return this._controlPoints3DCache;
  }

  /**
   * 使3D缓存失效
   * @private
   */
  _invalidateCache() {
    this._controlPoints3DCache = null;
  }

  /**
   * 钳位t到[0, 1]
   * @param {number} t
   * @returns {number}
   * @private
   */
  _clampT(t) {
    if (typeof t !== 'number' || isNaN(t)) return 0;
    return Math.max(0, Math.min(1, t));
  }

  // ===== 公开方法 =====

  /**
   * 获取轨道位置
   * @param {number} t - 轨道参数 [0, 1]（0=初始位置，1=左划位置）
   * @returns {{t:number, position:{x,y,z}, dimensions:{vertical,radial,orbital}}}
   *   - t: 钳位后的轨道参数
   *   - position: 3D笛卡尔坐标
   *   - dimensions: 三维度坐标（vertical/radial/orbital）
   */
  getPosition(t) {
    const tc = this._clampT(t);
    const controlPoints3D = this._getControlPoints3D();
    const position = interpolateCatmullRom(controlPoints3D, tc);
    const dimensions = this.space.toDimensions(position.x, position.y, position.z);
    return {
      t: tc,
      position: { x: position.x, y: position.y, z: position.z },
      dimensions: {
        vertical: dimensions.vertical,
        radial: dimensions.radial,
        orbital: dimensions.orbital,
      },
    };
  }

  /**
   * 获取相机状态
   * @param {number} t - 轨道参数 [0, 1]
   * @returns {{position:{x,y,z}, target:{x,y,z}, up:{x,y,z}}}
   *   - position: 相机位置（轨道上的点）
   *   - target: 相机看向的目标点（默认空间中心）
   *   - up: 相机上方向（默认Y轴）
   */
  getCameraState(t) {
    const pos = this.getPosition(t);
    return {
      position: { x: pos.position.x, y: pos.position.y, z: pos.position.z },
      target: { x: this.config.cameraTarget.x, y: this.config.cameraTarget.y, z: this.config.cameraTarget.z },
      up: { x: this.config.cameraUp.x, y: this.config.cameraUp.y, z: this.config.cameraUp.z },
    };
  }

  /**
   * 获取最近的预设位置
   * @param {number} t - 轨道参数 [0, 1]
   * @returns {Object} 最近的预设位置定义
   *   - name: OrbitPosition枚举值
   *   - t: 预设位置的轨道参数
   *   - leftContent: 左边内容
   *   - rightContent: 右边内容
   *   - mode: 模式名称
   *   - controlPoint: 控制点（三维度坐标）
   */
  getNearestPosition(t) {
    const tc = this._clampT(t);
    let nearest = this._positions[0];
    let minDist = Math.abs(tc - nearest.t);

    for (let i = 1; i < this._positions.length; i++) {
      const dist = Math.abs(tc - this._positions[i].t);
      if (dist < minDist) {
        minDist = dist;
        nearest = this._positions[i];
      }
    }
    return {
      ...nearest,
      controlPoint: { ...nearest.controlPoint },
    };
  }

  /**
   * 列出所有预设位置
   * @returns {Array<Object>} 预设位置定义数组（按t排序）
   */
  getPositions() {
    return this._positions.map((p) => ({
      ...p,
      controlPoint: { ...p.controlPoint },
    }));
  }

  /**
   * 设置自定义轨道路径
   * 控制点可拖拽：用户拖拽后调用此方法更新轨道形状
   * @param {Array<{vertical:number, radial:number, orbital:number}>} points - 控制点数组（三维度坐标）
   * @returns {boolean} 是否设置成功
   */
  setCustomPath(points) {
    if (!Array.isArray(points) || points.length < 2) {
      return false;
    }
    // 验证控制点格式
    for (const p of points) {
      if (
        typeof p !== 'object' || p === null ||
        typeof p.vertical !== 'number' || typeof p.radial !== 'number' || typeof p.orbital !== 'number'
      ) {
        return false;
      }
    }
    this._controlPoints = points.map((p) => ({
      vertical: p.vertical,
      radial: p.radial,
      orbital: p.orbital,
    }));
    this._hasCustomPath = true;
    this._invalidateCache();
    return true;
  }

  /**
   * 重置为默认轨道路径
   */
  resetToDefaultPath() {
    this._controlPoints = DEFAULT_ORBIT_POSITIONS.map((p) => ({ ...p.controlPoint }));
    this._hasCustomPath = false;
    this._invalidateCache();
  }

  /**
   * 获取轨道摘要（供AI排查）
   * @returns {Object} 摘要信息
   */
  getSummary() {
    return {
      spaceId: this.space.id || null,
      positionCount: this._positions.length,
      hasCustomPath: this._hasCustomPath,
      controlPointCount: this._controlPoints.length,
      splineType: this.config.splineType,
      positions: this._positions.map((p) => ({
        name: p.name,
        t: p.t,
        mode: p.mode,
        leftContent: p.leftContent,
        rightContent: p.rightContent,
      })),
      config: {
        cameraTarget: { ...this.config.cameraTarget },
        cameraUp: { ...this.config.cameraUp },
        splineType: this.config.splineType,
      },
    };
  }

  // ===== mark-system联动接口 =====

  /**
   * 导出为mark-system的orbit-path实例数据
   * 用于将轨道注册为mark-system的orbit-path类型实例（三方联动）
   * @param {string|null} [parentSpaceId] - 所属空间ID（默认使用this.space.id）
   * @returns {Object} mark-system实例数据，可直接传入MarkSystem.createInstance()
   */
  toMarkInstanceData(parentSpaceId = null) {
    const controlPoints3D = this._getControlPoints3D();
    return {
      typeName: 'orbit-path',
      position: {
        controlPoints: controlPoints3D.map((p) => ({ x: p.x, y: p.y, z: p.z })),
        controlPointsDimensions: this._controlPoints.map((p) => ({
          vertical: p.vertical,
          radial: p.radial,
          orbital: p.orbital,
        })),
        splineType: this.config.splineType,
        path: 'catmull-rom',
      },
      properties: {
        positions: this._positions.map((p) => ({
          name: p.name,
          t: p.t,
          leftContent: p.leftContent,
          rightContent: p.rightContent,
          mode: p.mode,
        })),
        hasCustomPath: this._hasCustomPath,
        spaceId: this.space.id || null,
      },
      parentSpaceId: parentSpaceId || this.space.id || null,
    };
  }
}

export default ViewOrbit;
