/**
 * [INPUT]: space.js (Space坐标系), layer.js (LayerSystem层范围)
 * [OUTPUT]: SpatialStateField类 — 3D空间状态场（32³降采样网格+查询接口）
 * [POS]: src/v2/core/spatial-state-field.js,L1领域核心层,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论.md §1.2 第2层·3D空间状态场
 *   - 3D空间作为可查询的状态场，任意位置可查询
 *   - 32x32x32降采样网格（32768个cell）
 *   - 每个cell存储深入度/扭曲度/念头密度/最近念头/可见性/层归属/轨道参数
 *
 * @note(s1, decision, 32grid, since:2026-07-08)
 *   S1-B.1.14: 排查基础第2层，SceneStateStore的辅助组件。
 *   依赖space.js坐标系和layer.js层范围查询。
 *   diagnostic-engine.js(1.17)和spatial-query.js(1.18)依赖此组件。
 */

// ===== 网格常量 =====

/** 网格每维度cell数 */
export const GRID_SIZE = 32;

/** 总cell数 = 32³ = 32768 */
export const TOTAL_CELLS = 32768; // 32 * 32 * 32

// ===== 默认空间范围 =====

/**
 * 默认空间范围（与space.js默认size一致：-10~10立方体）
 * @type {{min:{x,y,z}, max:{x,y,z}}}
 */
export const DEFAULT_BOUNDS = Object.freeze({
  min: { x: -10, y: -10, z: -10 },
  max: { x: 10, y: 10, z: 10 },
});

// ===== cellId 编码/解码（数值编码: x*1024 + y*32 + z）=====

const GRID_Y_STRIDE = GRID_SIZE; // 32
const GRID_X_STRIDE = GRID_SIZE * GRID_SIZE; // 1024

/**
 * 三个cell索引 → cellId（数值编码: x*1024 + y*32 + z）
 * @param {number} ix - X轴cell索引 (0~31)
 * @param {number} iy - Y轴cell索引 (0~31)
 * @param {number} iz - Z轴cell索引 (0~31)
 * @returns {number} cellId
 */
export function encodeCellId(ix, iy, iz) {
  return ix * GRID_X_STRIDE + iy * GRID_Y_STRIDE + iz;
}

/**
 * cellId → 三个cell索引
 * @param {number} cellId
 * @returns {{ix:number, iy:number, iz:number}}
 */
export function decodeCellId(cellId) {
  const ix = Math.floor(cellId / GRID_X_STRIDE);
  const rem = cellId % GRID_X_STRIDE;
  const iy = Math.floor(rem / GRID_Y_STRIDE);
  const iz = rem % GRID_Y_STRIDE;
  return { ix, iy, iz };
}

// ===== 默认 CellState 工厂 =====

/**
 * 创建默认 CellState
 * @param {{x:number,y:number,z:number}} [position] - cell中心位置（不传则全0）
 * @returns {CellState}
 * @private
 */
function createDefaultCellState(position = { x: 0, y: 0, z: 0 }) {
  return {
    position: { x: position.x, y: position.y, z: position.z },
    depthValue: 0, // 深入度
    distortion: 0, // 扭曲度
    thoughtDensity: 0, // 念头密度
    nearestThought: null, // 最近的念头id
    visibleFromCamera: false,
    layerId: null,
    orbitParam: 0, // 轨道参数
  };
}

// ===== SpatialStateField 类 =====

/**
 * 3D空间状态场 — 排查基础第2层组件
 *
 * 核心职责:
 *   1. 将3D空间降采样为32³网格（32768个cell）
 *   2. 每个cell存储CellState（深入度/扭曲度/密度/最近念头/可见性/层/轨道）
 *   3. 提供查询接口：点查询/射线查询/区域查询/层查询
 *   4. 提供更新接口：单cell更新/批量更新/失效
 *
 * 设计:
 *   - 内部用 Map<cellId, CellState> 只存非空cell（节省内存）
 *   - cellId编码: x*1024 + y*32 + z (数值)
 *   - 空间范围默认 -10~10 立方体，可构造时覆盖
 *
 * 不职责:
 *   - 不渲染（交给render层）
 *   - 不管理念头实体（只存储密度和最近念头id引用）
 *   - 不依赖Three.js（纯逻辑）
 */
export class SpatialStateField {
  /**
   * @param {Object} [options]
   * @param {{min:{x,y,z}, max:{x,y,z}}} [options.bounds] - 空间范围（默认DEFAULT_BOUNDS）
   * @param {{x,y,z}} [options.spaceSize] - 空间尺寸（来自space.js，用于推导bounds: -size~+size）
   * @param {import('./layer.js').LayerSystem} [options.layerSystem] - 层系统（层查询用，可不传后续queryLayer时传入）
   */
  constructor({ bounds, spaceSize, layerSystem } = {}) {
    // 推导 bounds: 优先用 bounds 参数，其次 spaceSize 推导，最后 DEFAULT_BOUNDS
    if (bounds) {
      this.bounds = {
        min: { ...bounds.min },
        max: { ...bounds.max },
      };
    } else if (spaceSize) {
      this.bounds = {
        min: { x: -spaceSize.x, y: -spaceSize.y, z: -spaceSize.z },
        max: { x: spaceSize.x, y: spaceSize.y, z: spaceSize.z },
      };
    } else {
      this.bounds = {
        min: { ...DEFAULT_BOUNDS.min },
        max: { ...DEFAULT_BOUNDS.max },
      };
    }

    /** @type {import('./layer.js').LayerSystem|null} 层系统引用（层查询用） */
    this.layerSystem = layerSystem || null;

    // 计算每个cell的尺寸（每轴独立，支持非立方体空间）
    /** @type {{x:number,y:number,z:number}} */
    this.cellSize = {
      x: (this.bounds.max.x - this.bounds.min.x) / GRID_SIZE,
      y: (this.bounds.max.y - this.bounds.min.y) / GRID_SIZE,
      z: (this.bounds.max.z - this.bounds.min.z) / GRID_SIZE,
    };

    /** @type {Map<number, CellState>} 网格（只存非空cell，key=cellId数值） */
    this.grid = new Map();
  }

  // ===== 坐标 ↔ cellId 转换 =====

  /**
   * 3D坐标 → cellId
   * @param {{x:number,y:number,z:number}} point - 3D坐标
   * @returns {number} cellId（越界返回 -1）
   */
  getCellId(point) {
    const ix = Math.floor((point.x - this.bounds.min.x) / this.cellSize.x);
    const iy = Math.floor((point.y - this.bounds.min.y) / this.cellSize.y);
    const iz = Math.floor((point.z - this.bounds.min.z) / this.cellSize.z);
    if (ix < 0 || ix >= GRID_SIZE || iy < 0 || iy >= GRID_SIZE || iz < 0 || iz >= GRID_SIZE) {
      return -1; // 越界
    }
    return encodeCellId(ix, iy, iz);
  }

  /**
   * cellId → cell中心点3D坐标
   * @param {number} cellId
   * @returns {{x:number,y:number,z:number}|null} cell中心坐标（cellId无效返回null）
   */
  getCellPosition(cellId) {
    if (cellId < 0 || cellId >= TOTAL_CELLS) return null;
    const { ix, iy, iz } = decodeCellId(cellId);
    return {
      x: this.bounds.min.x + (ix + 0.5) * this.cellSize.x,
      y: this.bounds.min.y + (iy + 0.5) * this.cellSize.y,
      z: this.bounds.min.z + (iz + 0.5) * this.cellSize.z,
    };
  }

  // ===== 查询接口 =====

  /**
   * 点查询：返回3D坐标处的CellState
   * @param {{x:number,y:number,z:number}} point - 3D坐标
   * @returns {CellState|null} CellState（越界返回null，空cell返回默认值）
   */
  query(point) {
    const cellId = this.getCellId(point);
    if (cellId < 0) return null; // 越界
    const state = this.grid.get(cellId);
    if (state) return state;
    // 空cell返回默认CellState（position为cell中心）
    return createDefaultCellState(this.getCellPosition(cellId));
  }

  /**
   * 射线查询：返回射线穿过的所有cell
   * 使用步进法（步长=min(cellSize)），遍历射线穿过的cell
   * @param {{x:number,y:number,z:number}} origin - 射线起点
   * @param {{x:number,y:number,z:number}} dir - 射线方向（不需归一化，内部处理）
   * @param {number} [maxDist=20] - 最大遍历距离
   * @returns {RayState} {cells: Array<{cellId, position, distance, state}>, totalLength, hitEntities}
   */
  queryRay(origin, dir, maxDist = 20) {
    // 归一化方向
    const dirLen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    const ndir =
      dirLen > 0
        ? { x: dir.x / dirLen, y: dir.y / dirLen, z: dir.z / dirLen }
        : { x: 1, y: 0, z: 0 };

    // 步长 = min(cellSize)，保证不跳过cell
    const step = Math.min(this.cellSize.x, this.cellSize.y, this.cellSize.z);

    /** @type {Array<{cellId:number, position:{x,y,z}, distance:number, state:CellState}>} */
    const cells = [];
    /** @type {Set<number>} 已收集的cellId（去重） */
    const seen = new Set();
    /** @type {Array<{cellId:number, thoughtId:string, distance:number}>} */
    const hitEntities = [];
    let lastValidT = 0;

    for (let t = 0; t <= maxDist; t += step) {
      const px = origin.x + ndir.x * t;
      const py = origin.y + ndir.y * t;
      const pz = origin.z + ndir.z * t;
      const cellId = this.getCellId({ x: px, y: py, z: pz });

      if (cellId < 0) {
        // 越界：若已收集过cell（射线已离开凸空间），则结束；否则继续（射线尚未进入）
        if (cells.length > 0) break;
        continue;
      }

      lastValidT = t;
      if (!seen.has(cellId)) {
        seen.add(cellId);
        const state = this.grid.get(cellId) || createDefaultCellState(this.getCellPosition(cellId));
        cells.push({
          cellId,
          position: this.getCellPosition(cellId),
          distance: t,
          state,
        });
        // 收集命中实体（有 nearestThought 的cell）
        if (state.nearestThought) {
          hitEntities.push({ cellId, thoughtId: state.nearestThought, distance: t });
        }
      }
    }

    return {
      cells,
      totalLength: cells.length > 0 ? lastValidT : 0,
      hitEntities,
    };
  }

  /**
   * 区域查询：返回bounds内所有非空cell
   * @param {{min:{x,y,z}, max:{x,y,z}}} bounds - 区域范围
   * @returns {RegionState} {cells, bounds, avgDepth, avgDistortion, totalDensity}
   */
  queryRegion(bounds) {
    // 计算bounds覆盖的cell索引范围（clamp到[0, GRID_SIZE-1]）
    const ixMin = Math.max(0, Math.floor((bounds.min.x - this.bounds.min.x) / this.cellSize.x));
    const ixMax = Math.min(GRID_SIZE - 1, Math.floor((bounds.max.x - this.bounds.min.x) / this.cellSize.x));
    const iyMin = Math.max(0, Math.floor((bounds.min.y - this.bounds.min.y) / this.cellSize.y));
    const iyMax = Math.min(GRID_SIZE - 1, Math.floor((bounds.max.y - this.bounds.min.y) / this.cellSize.y));
    const izMin = Math.max(0, Math.floor((bounds.min.z - this.bounds.min.z) / this.cellSize.z));
    const izMax = Math.min(GRID_SIZE - 1, Math.floor((bounds.max.z - this.bounds.min.z) / this.cellSize.z));

    /** @type {Array<{cellId:number, position:{x,y,z}, state:CellState}>} */
    const cells = [];
    let sumDepth = 0;
    let sumDistortion = 0;
    let totalDensity = 0;

    for (let ix = ixMin; ix <= ixMax; ix++) {
      for (let iy = iyMin; iy <= iyMax; iy++) {
        for (let iz = izMin; iz <= izMax; iz++) {
          const cellId = encodeCellId(ix, iy, iz);
          const state = this.grid.get(cellId);
          if (state) {
            cells.push({ cellId, position: this.getCellPosition(cellId), state });
            sumDepth += state.depthValue;
            sumDistortion += state.distortion;
            totalDensity += state.thoughtDensity;
          }
        }
      }
    }

    const count = cells.length;
    return {
      cells,
      bounds: { min: { ...bounds.min }, max: { ...bounds.max } },
      avgDepth: count > 0 ? sumDepth / count : 0,
      avgDistortion: count > 0 ? sumDistortion / count : 0,
      totalDensity,
    };
  }

  /**
   * 层查询：返回某层Y范围内的所有非空cell
   * @param {string} layerId - 层ID
   * @param {import('./layer.js').LayerSystem} [layerSystem] - 层系统（不传则用构造时的layerSystem）
   * @returns {LayerState} {layerId, cells, avgDepth, avgDistortion, thoughtCount}
   */
  queryLayer(layerId, layerSystem) {
    const ls = layerSystem || this.layerSystem;
    if (!ls) {
      return {
        layerId,
        cells: [],
        avgDepth: 0,
        avgDistortion: 0,
        thoughtCount: 0,
        error: 'no layerSystem provided',
      };
    }
    // 获取层的Y范围（3D空间中）
    const yRange = ls.getLayerYRange(layerId, {
      x: this.bounds.max.x,
      y: this.bounds.max.y,
      z: this.bounds.max.z,
    });
    if (!yRange) {
      return {
        layerId,
        cells: [],
        avgDepth: 0,
        avgDistortion: 0,
        thoughtCount: 0,
        error: 'layer not found',
      };
    }

    // 用区域查询该层的Y范围（XZ全范围）
    const region = this.queryRegion({
      min: { x: this.bounds.min.x, y: yRange.yMin, z: this.bounds.min.z },
      max: { x: this.bounds.max.x, y: yRange.yMax, z: this.bounds.max.z },
    });

    // 优先过滤出显式标记属于该层的cell；若无标记则用区域结果
    const marked = region.cells.filter((c) => c.state.layerId === layerId);
    const useCells = marked.length > 0 ? marked : region.cells;

    let sumDepth = 0;
    let sumDistortion = 0;
    let thoughtCount = 0;
    for (const c of useCells) {
      sumDepth += c.state.depthValue;
      sumDistortion += c.state.distortion;
      if (c.state.nearestThought) thoughtCount++;
    }
    const count = useCells.length;
    return {
      layerId,
      cells: useCells,
      avgDepth: count > 0 ? sumDepth / count : 0,
      avgDistortion: count > 0 ? sumDistortion / count : 0,
      thoughtCount,
    };
  }

  // ===== 更新接口 =====

  /**
   * 更新单个cell（合并更新）
   * @param {number} cellId - cellId
   * @param {Partial<CellState>} partial - 部分字段更新
   * @returns {boolean} 是否更新成功（cellId无效返回false）
   */
  updateCell(cellId, partial) {
    if (cellId < 0 || cellId >= TOTAL_CELLS) return false;
    const existing = this.grid.get(cellId);
    if (existing) {
      // 合并更新（position 需克隆避免外部引用污染）
      if (partial.position) {
        existing.position = { ...partial.position };
      }
      for (const key in partial) {
        if (key !== 'position') existing[key] = partial[key];
      }
    } else {
      // 新建cell，基于默认值（position默认取cell中心）合并
      const pos = this.getCellPosition(cellId);
      const newState = createDefaultCellState(pos);
      if (partial.position) {
        newState.position = { ...partial.position };
      }
      for (const key in partial) {
        if (key !== 'position') newState[key] = partial[key];
      }
      this.grid.set(cellId, newState);
    }
    return true;
  }

  /**
   * 设置cell的某个字段
   * @param {number} cellId - cellId
   * @param {string} field - 字段名（如 'depthValue'/'distortion'/'thoughtDensity' 等）
   * @param {*} value - 字段值
   * @returns {boolean} 是否设置成功（cellId无效返回false）
   */
  setCellValue(cellId, field, value) {
    if (cellId < 0 || cellId >= TOTAL_CELLS) return false;
    let state = this.grid.get(cellId);
    if (!state) {
      const pos = this.getCellPosition(cellId);
      state = createDefaultCellState(pos);
      this.grid.set(cellId, state);
    }
    if (field === 'position' && value && typeof value === 'object') {
      state.position = { ...value };
    } else {
      state[field] = value;
    }
    return true;
  }

  /**
   * 批量更新多个cell
   * @param {Array<{cellId:number, partial:Partial<CellState>}>} updates - 更新列表
   * @returns {number} 成功更新的数量
   */
  batchUpdate(updates) {
    if (!Array.isArray(updates)) return 0;
    let count = 0;
    for (const item of updates) {
      if (!item || typeof item.cellId !== 'number') continue;
      if (this.updateCell(item.cellId, item.partial || {})) count++;
    }
    return count;
  }

  /**
   * 全部失效（清空网格，重新初始化为空）
   */
  invalidate() {
    this.grid.clear();
  }

  // ===== 辅助接口 =====

  /**
   * 直接按 cellId 获取 CellState（不创建默认值）
   * @param {number} cellId
   * @returns {CellState|null} 存在则返回，否则null
   */
  getCell(cellId) {
    if (cellId < 0 || cellId >= TOTAL_CELLS) return null;
    return this.grid.get(cellId) || null;
  }

  /**
   * 获取统计信息
   * @returns {{totalCells:number, nonEmptyCells:number, avgDensity:number, avgDepth:number, avgDistortion:number}}
   */
  getStats() {
    const nonEmpty = this.grid.size;
    let sumDensity = 0;
    let sumDepth = 0;
    let sumDistortion = 0;
    for (const state of this.grid.values()) {
      sumDensity += state.thoughtDensity;
      sumDepth += state.depthValue;
      sumDistortion += state.distortion;
    }
    return {
      totalCells: TOTAL_CELLS,
      nonEmptyCells: nonEmpty,
      avgDensity: nonEmpty > 0 ? sumDensity / nonEmpty : 0,
      avgDepth: nonEmpty > 0 ? sumDepth / nonEmpty : 0,
      avgDistortion: nonEmpty > 0 ? sumDistortion / nonEmpty : 0,
    };
  }

  /**
   * 获取摘要（供AI排查）
   * @returns {Object} 摘要信息
   */
  getSummary() {
    const stats = this.getStats();
    return {
      component: 'SpatialStateField',
      gridSize: GRID_SIZE,
      totalCells: TOTAL_CELLS,
      bounds: { min: { ...this.bounds.min }, max: { ...this.bounds.max } },
      cellSize: { ...this.cellSize },
      nonEmptyCells: stats.nonEmptyCells,
      fillRate: stats.nonEmptyCells / TOTAL_CELLS,
      avgDensity: stats.avgDensity,
      avgDepth: stats.avgDepth,
      avgDistortion: stats.avgDistortion,
      hasLayerSystem: this.layerSystem !== null,
    };
  }
}

export default SpatialStateField;
