/**
 * [INPUT]: state-change-chain.js (因果链), state-snapshot.js (历史快照), spatial-state-field.js (空间状态场)
 * [OUTPUT]: DiagnosticEngine类 — 诊断规则引擎（15条内置规则D001-D015）
 * [POS]: src/v2/core/diagnostic-engine.js,L1领域核心层,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论.md 排查三问（是什么/为什么/综合看）
 *   - 是什么: 15条规则自动检测状态/性能/因果问题
 *   - 为什么: 基于StateChangeChain根因分析
 *   - 综合看: 综合关联分析（同实体/同链/时间簇）
 *
 * 15条规则分类:
 *   - D001-D005 状态一致性（consistency）
 *   - D006-D010 性能（performance）
 *   - D011-D015 因果链（causal）
 *
 * @note(s1, decision, 15rules, since:2026-07-08)
 *   S1-B.1.17: 排查基础引擎，依赖1.16 state-change-chain。
 *   spatial-query.js(1.18)可调用此组件的诊断报告。
 *   SceneStateStore.generateDiagnosticReport()委托给此组件。
 */

// ===== 枚举 =====

/**
 * 诊断规则类别枚举
 * @enum {string}
 * @property {string} CONSISTENCY - 状态一致性（D001-D005）
 * @property {string} PERFORMANCE - 性能（D006-D010）
 * @property {string} CAUSAL - 因果链（D011-D015）
 */
export const DiagnosticCategory = Object.freeze({
  CONSISTENCY: 'consistency',
  PERFORMANCE: 'performance',
  CAUSAL: 'causal',
});

/**
 * 诊断严重程度枚举
 * @enum {string}
 * @property {string} ERROR - 错误（必须修复）
 * @property {string} WARN - 警告（建议修复）
 * @property {string} INFO - 提示（供参考）
 */
export const DiagnosticSeverity = Object.freeze({
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
});

// ===== 阈值常量 =====

/**
 * 各规则的检测阈值（可被构造选项覆盖）
 * @type {Readonly<Object>}
 */
const THRESHOLDS = Object.freeze({
  // 性能阈值
  FRAME_TIME_MS: 33,             // D006: 帧时间 > 33ms（低于30fps）
  PROJECTION_TIME_MS: 5,         // D007: 投影计算 > 5ms
  CACHE_HIT_RATE: 0.5,           // D008: 缓存命中率 < 0.5
  THOUGHT_DENSITY: 10,           // D009: 单cell念头密度 > 10
  RENDER_QUEUE_LENGTH: 100,      // D010: 渲染请求队列 > 100
  // 一致性阈值
  PENDING_SYNC_MS: 5000,         // D004: 同步pending > 5秒
  // 因果链阈值
  CHAIN_DEPTH: 10,               // D013: 因果链深度 > 10
  HOTSPOT_COUNT: 50,             // D014: 1秒内变更 > 50（热点）
  HOTSPOT_WINDOW_MS: 1000,       // D014: 热点窗口大小
  ROOT_CHANGES_PER_WINDOW: 1,    // D012: 每窗口根变更数 > 1（并发冲突风险）
  // 关联分析阈值
  TIME_CLUSTER_MS: 500,          // 时间簇：500ms内的发现视为关联
});

// ===== 辅助函数 =====

/**
 * 将实体集合（Map/Object/Array）规范化为数组
 * @param {Map<string, Object>|Object|Array<Object>|null|undefined} entities
 * @returns {Array<Object>}
 * @private
 */
function entitiesToList(entities) {
  if (!entities) return [];
  if (Array.isArray(entities)) return entities.filter(Boolean);
  if (entities instanceof Map) return Array.from(entities.values()).filter(Boolean);
  if (typeof entities === 'object') return Object.values(entities).filter(Boolean);
  return [];
}

/**
 * 安全读取对象的嵌套字段
 * @param {Object} obj
 * @param {string} path - 点分路径，如 'config.size'
 * @returns {*} 找不到返回 undefined
 * @private
 */
function getPath(obj, path) {
  if (!obj || typeof obj !== 'object') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

/**
 * 推导空间尺寸（用于层Y范围计算）
 * @param {Object} [space]
 * @returns {{x:number,y:number,z:number}}
 * @private
 */
function deriveSpaceSize(space) {
  const size = getPath(space, 'config.size') || (space && space.size) || { x: 10, y: 10, z: 10 };
  return { x: size.x || 10, y: size.y || 10, z: size.z || 10 };
}

// ===== 15条内置诊断规则 D001-D015 =====

/**
 * 内置诊断规则数组（15条）
 * @type {Array<DiagnosticRule>}
 */
export const BUILTIN_RULES = [
  // ===== 第一类：状态一致性规则（D001-D005）=====

  {
    id: 'D001',
    name: '实体状态附件缺失',
    category: DiagnosticCategory.CONSISTENCY,
    severity: DiagnosticSeverity.ERROR,
    description: '检查3D实体是否都拥有EntityStateAttachment（状态附件），缺失会导致状态无法正确追踪',
    /**
     * @param {Object} context - { entities, space, layerSystem, yjsState, transientState }
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const entities = entitiesToList(context && context.entities);
      for (const entity of entities) {
        const hasAttachment = entity.stateAttachment != null
          || entity.attachment != null
          || entity.attachments != null;
        if (!hasAttachment) {
          findings.push({
            ruleId: 'D001',
            severity: DiagnosticSeverity.ERROR,
            message: `实体 ${entity.id || '(无id)'} 缺少 EntityStateAttachment`,
            entityId: entity.id || null,
            changeId: null,
            details: { entitySummary: { id: entity.id, type: entity.type, layerId: entity.layerId } },
            suggestedFix: '为该实体创建并挂载 EntityStateAttachment',
            timestamp: Date.now(),
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'D002',
    name: '空间坐标越界',
    category: DiagnosticCategory.CONSISTENCY,
    severity: DiagnosticSeverity.ERROR,
    description: '检查念头位置是否超出Space空间边界（八面体/自定义边界）',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      if (!context || !context.space) return findings;
      const { space } = context;
      const entities = entitiesToList(context.entities);
      for (const entity of entities) {
        if (!entity.position) continue;
        const { x, y, z } = entity.position;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') continue;
        let inside = true;
        if (typeof space.isInside === 'function') {
          inside = space.isInside(x, y, z);
        } else if (space.bounds) {
          const b = space.bounds;
          inside = x >= b.min.x && x <= b.max.x && y >= b.min.y && y <= b.max.y && z >= b.min.z && z <= b.max.z;
        }
        if (!inside) {
          findings.push({
            ruleId: 'D002',
            severity: DiagnosticSeverity.ERROR,
            message: `实体 ${entity.id || '(无id)'} 坐标 (${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}) 超出空间边界`,
            entityId: entity.id || null,
            changeId: null,
            details: { position: { x, y, z } },
            suggestedFix: '将实体坐标移回空间边界内，或扩展空间尺寸',
            timestamp: Date.now(),
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'D003',
    name: '层归属错误',
    category: DiagnosticCategory.CONSISTENCY,
    severity: DiagnosticSeverity.WARN,
    description: '检查念头的 layerId 与其 vertical（Y）坐标是否一致，层归属错误会导致渲染与查询异常',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      if (!context || !context.layerSystem) return findings;
      const { layerSystem } = context;
      const spaceSize = deriveSpaceSize(context.space);
      const entities = entitiesToList(context.entities);
      for (const entity of entities) {
        if (!entity.layerId || !entity.position) continue;
        if (typeof entity.position.y !== 'number') continue;
        const yRange = layerSystem.getLayerYRange(entity.layerId, spaceSize);
        if (!yRange) continue; // 层不存在则跳过（其他规则覆盖）
        const { yMin, yMax } = yRange;
        if (entity.position.y < yMin || entity.position.y > yMax) {
          findings.push({
            ruleId: 'D003',
            severity: DiagnosticSeverity.WARN,
            message: `实体 ${entity.id || '(无id)'} layerId=${entity.layerId} 但 Y=${entity.position.y.toFixed(2)} 不在层范围 [${yMin.toFixed(2)}, ${yMax.toFixed(2)}] 内`,
            entityId: entity.id || null,
            changeId: null,
            details: { layerId: entity.layerId, positionY: entity.position.y, yRange: { yMin, yMax } },
            suggestedFix: '修正实体 layerId 或调整其 Y 坐标至正确层范围',
            timestamp: Date.now(),
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'D004',
    name: 'Yjs同步状态异常',
    category: DiagnosticCategory.CONSISTENCY,
    severity: DiagnosticSeverity.WARN,
    description: '检查 Yjs syncStatus 是否长时间停留在 pending（可能同步卡死）',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      if (!context || !context.yjsState) return findings;
      const { yjsState } = context;
      if (yjsState.syncStatus !== 'pending') return findings;
      const now = Date.now();
      const pendingSince = yjsState.pendingSince || yjsState.lastChangeTime || 0;
      const pendingDuration = pendingSince > 0 ? now - pendingSince : 0;
      if (pendingDuration > THRESHOLDS.PENDING_SYNC_MS) {
        findings.push({
          ruleId: 'D004',
          severity: DiagnosticSeverity.WARN,
          message: `Yjs 同步状态为 pending 已持续 ${pendingDuration}ms（阈值 ${THRESHOLDS.PENDING_SYNC_MS}ms）`,
          entityId: null,
          changeId: null,
          details: { syncStatus: yjsState.syncStatus, pendingSince, pendingDuration },
          suggestedFix: '检查网络连接与 Yjs provider 状态，必要时重连',
          timestamp: now,
        });
      }
      return findings;
    },
  },

  {
    id: 'D005',
    name: '瞬态状态与Yjs状态冲突',
    category: DiagnosticCategory.CONSISTENCY,
    severity: DiagnosticSeverity.WARN,
    description: '检查瞬态层（动画状态）与 Yjs 权威层（type字段）是否矛盾',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      if (!context || !context.transientState || !context.yjsState) return findings;
      const { transientState, yjsState } = context;
      const now = Date.now();
      // 冲突1: 瞬态标记为动画中，但 Yjs 类型为 static
      if (transientState.animating === true && yjsState.type === 'static') {
        findings.push({
          ruleId: 'D005',
          severity: DiagnosticSeverity.WARN,
          message: '瞬态层标记 animating=true 与 Yjs type=static 冲突',
          entityId: transientState.entityId || null,
          changeId: null,
          details: { transientAnimating: true, yjsType: 'static' },
          suggestedFix: '动画结束后将瞬态 animating 复位为 false，或同步更新 Yjs type',
          timestamp: now,
        });
      }
      // 冲突2: 双方都有 type 字段但不一致
      if (transientState.type && yjsState.type && transientState.type !== yjsState.type) {
        findings.push({
          ruleId: 'D005',
          severity: DiagnosticSeverity.WARN,
          message: `瞬态 type=${transientState.type} 与 Yjs type=${yjsState.type} 不一致`,
          entityId: transientState.entityId || null,
          changeId: null,
          details: { transientType: transientState.type, yjsType: yjsState.type },
          suggestedFix: '以 Yjs 为准，将瞬态 type 同步为 Yjs 的 type 值',
          timestamp: now,
        });
      }
      return findings;
    },
  },

  // ===== 第二类：性能规则（D006-D010）=====

  {
    id: 'D006',
    name: '帧率下降',
    category: DiagnosticCategory.PERFORMANCE,
    severity: DiagnosticSeverity.WARN,
    description: `帧时间超过 ${THRESHOLDS.FRAME_TIME_MS}ms（低于 ${Math.round(1000 / THRESHOLDS.FRAME_TIME_MS)}fps），用户可感知卡顿`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const metrics = context && context.performanceMetrics;
      if (!metrics || typeof metrics.frameTime !== 'number') return findings;
      if (metrics.frameTime > THRESHOLDS.FRAME_TIME_MS) {
        findings.push({
          ruleId: 'D006',
          severity: DiagnosticSeverity.WARN,
          message: `帧时间 ${metrics.frameTime.toFixed(1)}ms 超过阈值 ${THRESHOLDS.FRAME_TIME_MS}ms（约 ${Math.round(1000 / metrics.frameTime)}fps）`,
          entityId: null,
          changeId: null,
          details: { frameTime: metrics.frameTime, threshold: THRESHOLDS.FRAME_TIME_MS, fps: Math.round(1000 / metrics.frameTime) },
          suggestedFix: '检查渲染负载、念头数量与投影计算耗时',
          timestamp: Date.now(),
        });
      }
      return findings;
    },
  },

  {
    id: 'D007',
    name: '投影计算耗时过高',
    category: DiagnosticCategory.PERFORMANCE,
    severity: DiagnosticSeverity.WARN,
    description: `投影计算耗时超过 ${THRESHOLDS.PROJECTION_TIME_MS}ms，可能拖累帧率`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const metrics = context && context.performanceMetrics;
      if (!metrics || typeof metrics.projectionTime !== 'number') return findings;
      if (metrics.projectionTime > THRESHOLDS.PROJECTION_TIME_MS) {
        findings.push({
          ruleId: 'D007',
          severity: DiagnosticSeverity.WARN,
          message: `投影计算耗时 ${metrics.projectionTime.toFixed(2)}ms 超过阈值 ${THRESHOLDS.PROJECTION_TIME_MS}ms`,
          entityId: null,
          changeId: null,
          details: { projectionTime: metrics.projectionTime, threshold: THRESHOLDS.PROJECTION_TIME_MS },
          suggestedFix: '检查投影缓存命中率与念头数量，考虑增加缓存或降采样',
          timestamp: Date.now(),
        });
      }
      return findings;
    },
  },

  {
    id: 'D008',
    name: '缓存命中率低',
    category: DiagnosticCategory.PERFORMANCE,
    severity: DiagnosticSeverity.WARN,
    description: `缓存命中率低于 ${THRESHOLDS.CACHE_HIT_RATE}，频繁缓存失效导致重复计算`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const metrics = context && context.performanceMetrics;
      if (!metrics || typeof metrics.cacheHitRate !== 'number') return findings;
      if (metrics.cacheHitRate < THRESHOLDS.CACHE_HIT_RATE) {
        findings.push({
          ruleId: 'D008',
          severity: DiagnosticSeverity.WARN,
          message: `缓存命中率 ${(metrics.cacheHitRate * 100).toFixed(1)}% 低于阈值 ${(THRESHOLDS.CACHE_HIT_RATE * 100)}%`,
          entityId: null,
          changeId: null,
          details: { cacheHitRate: metrics.cacheHitRate, threshold: THRESHOLDS.CACHE_HIT_RATE },
          suggestedFix: '检查缓存失效策略，减少不必要的失效触发',
          timestamp: Date.now(),
        });
      }
      return findings;
    },
  },

  {
    id: 'D009',
    name: '念头密度过高',
    category: DiagnosticCategory.PERFORMANCE,
    severity: DiagnosticSeverity.INFO,
    description: `空间状态场中某 cell 的念头密度超过 ${THRESHOLDS.THOUGHT_DENSITY}，可能导致局部渲染卡顿`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const now = Date.now();
      // 优先：从 stateField 遍历非空 cell
      if (context && context.stateField && context.stateField.grid) {
        for (const [cellId, cell] of context.stateField.grid) {
          if (cell && typeof cell.thoughtDensity === 'number' && cell.thoughtDensity > THRESHOLDS.THOUGHT_DENSITY) {
            findings.push({
              ruleId: 'D009',
              severity: DiagnosticSeverity.INFO,
              message: `cell ${cellId} 念头密度 ${cell.thoughtDensity} 超过阈值 ${THRESHOLDS.THOUGHT_DENSITY}`,
              entityId: cell.nearestThought || null,
              changeId: null,
              details: { cellId, thoughtDensity: cell.thoughtDensity, threshold: THRESHOLDS.THOUGHT_DENSITY },
              suggestedFix: '考虑疏散该区域念头或提升该区域渲染优先级',
              timestamp: now,
            });
          }
        }
        return findings;
      }
      // 回退：从 performanceMetrics 读取平均密度
      const metrics = context && context.performanceMetrics;
      if (metrics && typeof metrics.thoughtDensity === 'number' && metrics.thoughtDensity > THRESHOLDS.THOUGHT_DENSITY) {
        findings.push({
          ruleId: 'D009',
          severity: DiagnosticSeverity.INFO,
          message: `平均念头密度 ${metrics.thoughtDensity} 超过阈值 ${THRESHOLDS.THOUGHT_DENSITY}`,
          entityId: null,
          changeId: null,
          details: { thoughtDensity: metrics.thoughtDensity, threshold: THRESHOLDS.THOUGHT_DENSITY },
          suggestedFix: '考虑疏散念头分布或提升空间利用率',
          timestamp: now,
        });
      }
      return findings;
    },
  },

  {
    id: 'D010',
    name: '渲染请求堆积',
    category: DiagnosticCategory.PERFORMANCE,
    severity: DiagnosticSeverity.WARN,
    description: `渲染请求队列长度超过 ${THRESHOLDS.RENDER_QUEUE_LENGTH}，可能导致渲染延迟`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const now = Date.now();
      // 优先：从 performanceMetrics 读取队列长度
      const metrics = context && context.performanceMetrics;
      if (metrics && typeof metrics.renderQueueLength === 'number') {
        if (metrics.renderQueueLength > THRESHOLDS.RENDER_QUEUE_LENGTH) {
          findings.push({
            ruleId: 'D010',
            severity: DiagnosticSeverity.WARN,
            message: `渲染请求队列长度 ${metrics.renderQueueLength} 超过阈值 ${THRESHOLDS.RENDER_QUEUE_LENGTH}`,
            entityId: null,
            changeId: null,
            details: { renderQueueLength: metrics.renderQueueLength, threshold: THRESHOLDS.RENDER_QUEUE_LENGTH },
            suggestedFix: '合并渲染请求、节流变更触发或降低渲染频率',
            timestamp: now,
          });
        }
        return findings;
      }
      // 回退：从 performanceMetrics 读取 pendingRenderRequests
      if (metrics && typeof metrics.pendingRenderRequests === 'number') {
        if (metrics.pendingRenderRequests > THRESHOLDS.RENDER_QUEUE_LENGTH) {
          findings.push({
            ruleId: 'D010',
            severity: DiagnosticSeverity.WARN,
            message: `待处理渲染请求数 ${metrics.pendingRenderRequests} 超过阈值 ${THRESHOLDS.RENDER_QUEUE_LENGTH}`,
            entityId: null,
            changeId: null,
            details: { pendingRenderRequests: metrics.pendingRenderRequests, threshold: THRESHOLDS.RENDER_QUEUE_LENGTH },
            suggestedFix: '合并渲染请求、节流变更触发或降低渲染频率',
            timestamp: now,
          });
        }
      }
      return findings;
    },
  },

  // ===== 第三类：因果链规则（D011-D015）=====

  {
    id: 'D011',
    name: '变更链循环',
    category: DiagnosticCategory.CAUSAL,
    severity: DiagnosticSeverity.ERROR,
    description: '检测 StateChangeChain 中的环（正常应为 DAG，出现环说明记录逻辑有误）',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const chain = context && context.changeChain;
      if (!chain || typeof chain.detectCycles !== 'function') return findings;
      const hasCycle = chain.detectCycles();
      if (hasCycle) {
        findings.push({
          ruleId: 'D011',
          severity: DiagnosticSeverity.ERROR,
          message: 'StateChangeChain 检测到循环引用（正常应为 DAG）',
          entityId: null,
          changeId: null,
          details: { hasCycle: true },
          suggestedFix: '检查 record/recordChild 的 causedBy 赋值逻辑，避免形成环',
          timestamp: Date.now(),
        });
      }
      return findings;
    },
  },

  {
    id: 'D012',
    name: '根变更过多',
    category: DiagnosticCategory.CAUSAL,
    severity: DiagnosticSeverity.WARN,
    description: `同一时间窗口（${THRESHOLDS.HOTSPOT_WINDOW_MS}ms）内出现多个根变更，可能存在并发冲突`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const chain = context && context.changeChain;
      if (!chain || !chain._records) return findings;
      // 收集所有根变更（causedBy === null）
      const roots = [];
      for (const change of chain._records.values()) {
        if (!change.causedBy) roots.push(change);
      }
      if (roots.length === 0) return findings;
      roots.sort((a, b) => a.timestamp - b.timestamp);
      // 滑动窗口检测：同一窗口内根变更数 > ROOT_CHANGES_PER_WINDOW
      const windowMs = THRESHOLDS.HOTSPOT_WINDOW_MS;
      let i = 0;
      while (i < roots.length) {
        let j = i;
        while (j < roots.length && roots[j].timestamp - roots[i].timestamp <= windowMs) j++;
        const count = j - i;
        if (count > THRESHOLDS.ROOT_CHANGES_PER_WINDOW) {
          findings.push({
            ruleId: 'D012',
            severity: DiagnosticSeverity.WARN,
            message: `时间窗口 ${windowMs}ms 内有 ${count} 个根变更（阈值 ${THRESHOLDS.ROOT_CHANGES_PER_WINDOW}），可能存在并发冲突`,
            entityId: null,
            changeId: roots[i].id,
            details: {
              rootCount: count,
              windowStart: roots[i].timestamp,
              windowEnd: roots[j - 1].timestamp,
              rootIds: roots.slice(i, j).map(r => r.id),
            },
            suggestedFix: '检查并发触发源，考虑加锁或串行化根变更',
            timestamp: Date.now(),
          });
        }
        i = j;
      }
      return findings;
    },
  },

  {
    id: 'D013',
    name: '因果链过深',
    category: DiagnosticCategory.CAUSAL,
    severity: DiagnosticSeverity.WARN,
    description: `traceUp 深度超过 ${THRESHOLDS.CHAIN_DEPTH} 层，可能存在连锁反应`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const chain = context && context.changeChain;
      if (!chain || typeof chain.traceUp !== 'function') return findings;
      const now = Date.now();
      for (const change of (chain._records ? chain._records.values() : [])) {
        const upChain = chain.traceUp(change.id);
        if (upChain.length > THRESHOLDS.CHAIN_DEPTH) {
          findings.push({
            ruleId: 'D013',
            severity: DiagnosticSeverity.WARN,
            message: `变更 ${change.id} 的因果链深度 ${upChain.length} 超过阈值 ${THRESHOLDS.CHAIN_DEPTH}`,
            entityId: null,
            changeId: change.id,
            details: { chainDepth: upChain.length, threshold: THRESHOLDS.CHAIN_DEPTH, chainIds: upChain.map(c => c.id) },
            suggestedFix: '检查是否存在连锁触发逻辑，考虑打断因果链或合并变更',
            timestamp: now,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'D014',
    name: '变更密集',
    category: DiagnosticCategory.CAUSAL,
    severity: DiagnosticSeverity.WARN,
    description: `短时间内大量变更（${THRESHOLDS.HOTSPOT_COUNT}个/${THRESHOLDS.HOTSPOT_WINDOW_MS}ms），可能存在性能热点`,
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const chain = context && context.changeChain;
      if (!chain || typeof chain.getHotspots !== 'function') return findings;
      const hotspots = chain.getHotspots(THRESHOLDS.HOTSPOT_WINDOW_MS);
      const now = Date.now();
      for (const spot of hotspots) {
        if (spot.count > THRESHOLDS.HOTSPOT_COUNT) {
          findings.push({
            ruleId: 'D014',
            severity: DiagnosticSeverity.WARN,
            message: `时间窗口 ${THRESHOLDS.HOTSPOT_WINDOW_MS}ms 内有 ${spot.count} 个变更（阈值 ${THRESHOLDS.HOTSPOT_COUNT}），变更密集`,
            entityId: null,
            changeId: null,
            details: { windowStart: spot.windowStart, count: spot.count, threshold: THRESHOLDS.HOTSPOT_COUNT },
            suggestedFix: '检查变更触发频率，考虑节流/防抖或批量合并变更',
            timestamp: now,
          });
        }
      }
      return findings;
    },
  },

  {
    id: 'D015',
    name: '孤立变更',
    category: DiagnosticCategory.CAUSAL,
    severity: DiagnosticSeverity.INFO,
    description: 'causedBy=null 且 causedChanges=[] 的变更，无法追溯因果（可能遗漏记录）',
    /**
     * @param {Object} context
     * @returns {DiagnosticFinding[]}
     */
    check(context) {
      const findings = [];
      const chain = context && context.changeChain;
      if (!chain || !chain._records) return findings;
      const now = Date.now();
      for (const change of chain._records.values()) {
        const isOrphan = change.causedBy === null
          && (!change.causedChanges || change.causedChanges.length === 0);
        if (isOrphan) {
          findings.push({
            ruleId: 'D015',
            severity: DiagnosticSeverity.INFO,
            message: `变更 ${change.id} 为孤立变更（无父无子），无法追溯因果`,
            entityId: null,
            changeId: change.id,
            details: { changeId: change.id, source: change.source, timestamp: change.timestamp },
            suggestedFix: '检查该变更的记录上下文，补充 causedBy 或 causedChanges 关联',
            timestamp: now,
          });
        }
      }
      return findings;
    },
  },
];

// ===== DiagnosticEngine 类 =====

/**
 * 诊断规则引擎 —— 排查基础组件（排查方法论.md 排查三问）
 *
 * 核心职责:
 *   1. 注册/管理诊断规则（内置15条 D001-D015 + 自定义规则）
 *   2. 运行规则检测问题（runAll/runRule/runCategory）
 *   3. 综合关联分析（同实体/同因果链/时间簇）
 *   4. 根因分析（基于 StateChangeChain.traceUp）
 *   5. 导出诊断报告（供 AI 分析）
 *
 * 设计:
 *   - 三个依赖（stateField/snapshotStore/changeChain）通过 DI 注入，均可选
 *   - 无依赖时 runAll 仍可运行（各规则返回空发现）
 *   - 不依赖 Three.js，纯逻辑可独立测试
 *
 * @example
 * const engine = new DiagnosticEngine({ changeChain });
 * engine.registerRule(customRule);
 * const report = engine.runAll({ entities, space, layerSystem });
 * const rootCause = engine.findRootCause('D011-0');
 */
export class DiagnosticEngine {
  /**
   * @param {Object} [deps] - 依赖注入（均可选）
   * @param {import('./spatial-state-field.js').SpatialStateField} [deps.stateField] - 3D空间状态场
   * @param {import('./state-snapshot.js').SnapshotStore} [deps.snapshotStore] - 时间线快照存储
   * @param {import('./state-change-chain.js').StateChangeChain} [deps.changeChain] - 状态变更链
   */
  constructor({ stateField = null, snapshotStore = null, changeChain = null } = {}) {
    /** @type {Map<string, DiagnosticRule>} 规则存储（ruleId → rule） */
    this._rules = new Map();
    /** @type {import('./spatial-state-field.js').SpatialStateField|null} */
    this._stateField = stateField;
    /** @type {import('./state-snapshot.js').SnapshotStore|null} */
    this._snapshotStore = snapshotStore;
    /** @type {import('./state-change-chain.js').StateChangeChain|null} */
    this._changeChain = changeChain;

    // 运行统计
    /** @type {number} 累计运行次数 */
    this._totalRuns = 0;
    /** @type {number} 累计发现总数 */
    this._totalFindings = 0;
    /** @type {number|null} 最近运行时间戳 */
    this._lastRunTimestamp = null;
    /** @type {DiagnosticReport|null} 最近诊断报告 */
    this._lastReport = null;

    // 注册15条内置规则
    for (const rule of BUILTIN_RULES) {
      this._rules.set(rule.id, rule);
    }
  }

  // ===== 规则管理 =====

  /**
   * 注册一条诊断规则
   * @param {DiagnosticRule} rule - 规则对象（需含 id/name/category/severity/description/check）
   * @returns {boolean} 是否注册成功（id重复返回false）
   */
  registerRule(rule) {
    if (!rule || !rule.id || this._rules.has(rule.id)) return false;
    if (typeof rule.check !== 'function') return false;
    this._rules.set(rule.id, rule);
    return true;
  }

  /**
   * 注销一条诊断规则
   * @param {string} ruleId - 规则ID
   * @returns {boolean} 是否注销成功（不存在返回false）
   */
  unregisterRule(ruleId) {
    return this._rules.delete(ruleId);
  }

  /**
   * 获取所有已注册规则
   * @returns {DiagnosticRule[]}
   */
  getRules() {
    return Array.from(this._rules.values());
  }

  /**
   * 获取单条规则
   * @param {string} id - 规则ID
   * @returns {DiagnosticRule|undefined}
   */
  getRule(id) {
    return this._rules.get(id);
  }

  // ===== 上下文构建 =====

  /**
   * 合并用户上下文与内部依赖，构建规则运行所需的完整上下文
   * @param {Object} [userContext={}]
   * @returns {Object} 合并后的上下文
   * @private
   */
  _buildContext(userContext = {}) {
    const ctx = { ...userContext };
    // 注入构造时依赖（用户未提供时）
    if (!ctx.changeChain && this._changeChain) ctx.changeChain = this._changeChain;
    if (!ctx.stateField && this._stateField) ctx.stateField = this._stateField;
    if (!ctx.snapshotStore && this._snapshotStore) ctx.snapshotStore = this._snapshotStore;
    // 从最新快照提取 entities 与 performanceMetrics（用户未提供时）
    if (this._snapshotStore) {
      const latest = this._snapshotStore.getLatest();
      if (latest) {
        if (!ctx.entities && latest.entities) ctx.entities = latest.entities;
        if (!ctx.performanceMetrics && latest.performance) ctx.performanceMetrics = latest.performance;
      }
    }
    return ctx;
  }

  // ===== 运行诊断 =====

  /**
   * 运行所有已注册规则，返回完整诊断报告
   * @param {Object} [context={}] - 运行上下文（entities/space/layerSystem/yjsState/transientState/performanceMetrics等）
   * @returns {DiagnosticReport}
   */
  runAll(context = {}) {
    const ctx = this._buildContext(context);
    const allFindings = [];
    let rulesRun = 0;

    for (const [ruleId, rule] of this._rules) {
      rulesRun++;
      let ruleFindings = [];
      try {
        ruleFindings = rule.check(ctx) || [];
      } catch (e) {
        // 规则执行异常：记录为 error 级发现，不中断整体诊断
        ruleFindings = [{
          ruleId,
          severity: DiagnosticSeverity.ERROR,
          message: `规则 ${ruleId} 执行异常: ${e.message}`,
          entityId: null,
          changeId: null,
          details: { error: e.message, stack: e.stack },
          suggestedFix: `检查规则 ${ruleId} 的 check 函数实现`,
          timestamp: Date.now(),
        }];
      }
      // 为每个发现分配唯一 id（供关联分析引用）
      for (const f of ruleFindings) {
        f.id = `${ruleId}-${allFindings.length}`;
        allFindings.push(f);
      }
    }

    // 按严重程度统计
    const findingsBySeverity = { error: 0, warn: 0, info: 0 };
    for (const f of allFindings) {
      const sev = f.severity || 'info';
      findingsBySeverity[sev] = (findingsBySeverity[sev] || 0) + 1;
    }

    // 按类别统计
    const stats = {
      consistencyFindings: 0,
      performanceFindings: 0,
      causalFindings: 0,
    };
    for (const f of allFindings) {
      const rule = this._rules.get(f.ruleId);
      if (rule) {
        if (rule.category === DiagnosticCategory.CONSISTENCY) stats.consistencyFindings++;
        else if (rule.category === DiagnosticCategory.PERFORMANCE) stats.performanceFindings++;
        else if (rule.category === DiagnosticCategory.CAUSAL) stats.causalFindings++;
      }
    }

    // 综合关联分析
    const correlations = this.analyzeCorrelations(allFindings);

    /** @type {DiagnosticReport} */
    const report = {
      timestamp: Date.now(),
      totalRulesRun: rulesRun,
      totalFindings: allFindings.length,
      findingsBySeverity,
      findings: allFindings,
      stats,
      correlations,
    };

    // 更新运行统计
    this._lastReport = report;
    this._totalRuns++;
    this._totalFindings += allFindings.length;
    this._lastRunTimestamp = report.timestamp;

    return report;
  }

  /**
   * 运行单条规则
   * @param {string} ruleId - 规则ID
   * @param {Object} [context={}] - 运行上下文
   * @returns {DiagnosticFinding[]} 该规则的发现列表（无则空数组；规则不存在返回空数组）
   */
  runRule(ruleId, context = {}) {
    const rule = this._rules.get(ruleId);
    if (!rule) return [];
    const ctx = this._buildContext(context);
    let findings = [];
    try {
      findings = rule.check(ctx) || [];
    } catch (e) {
      findings = [{
        ruleId,
        severity: DiagnosticSeverity.ERROR,
        message: `规则 ${ruleId} 执行异常: ${e.message}`,
        entityId: null,
        changeId: null,
        details: { error: e.message, stack: e.stack },
        suggestedFix: `检查规则 ${ruleId} 的 check 函数实现`,
        timestamp: Date.now(),
      }];
    }
    // 分配 id
    for (const f of findings) {
      f.id = `${ruleId}-0`;
    }
    return findings;
  }

  /**
   * 运行某类别的所有规则
   * @param {string} category - DiagnosticCategory 枚举值
   * @param {Object} [context={}] - 运行上下文
   * @returns {DiagnosticFinding[]} 该类别所有规则的发现列表
   */
  runCategory(category, context = {}) {
    const ctx = this._buildContext(context);
    const allFindings = [];
    for (const [ruleId, rule] of this._rules) {
      if (rule.category !== category) continue;
      let findings = [];
      try {
        findings = rule.check(ctx) || [];
      } catch (e) {
        findings = [{
          ruleId,
          severity: DiagnosticSeverity.ERROR,
          message: `规则 ${ruleId} 执行异常: ${e.message}`,
          entityId: null,
          changeId: null,
          details: { error: e.message },
          suggestedFix: `检查规则 ${ruleId} 的 check 函数实现`,
          timestamp: Date.now(),
        }];
      }
      for (const f of findings) {
        f.id = `${ruleId}-${allFindings.length}`;
        allFindings.push(f);
      }
    }
    return allFindings;
  }

  // ===== 综合关联分析 =====

  /**
   * 分析多个发现之间的关联（同实体/同因果链/时间簇）
   * @param {DiagnosticFinding[]} findings
   * @returns {Correlation[]}
   */
  analyzeCorrelations(findings) {
    const correlations = [];
    let corrIdx = 0;
    if (!findings || findings.length === 0) return correlations;

    // 1. same-entity: 同 entityId 的发现
    const byEntity = new Map();
    for (const f of findings) {
      if (f.entityId) {
        if (!byEntity.has(f.entityId)) byEntity.set(f.entityId, []);
        byEntity.get(f.entityId).push(f.id);
      }
    }
    for (const [entityId, ids] of byEntity) {
      if (ids.length > 1) {
        correlations.push({
          id: `corr-${corrIdx++}`,
          type: 'same-entity',
          findingIds: ids,
          description: `${ids.length} 个发现关联同一实体 ${entityId}`,
        });
      }
    }

    // 2. same-chain: 同一因果链根的发现
    if (this._changeChain && typeof this._changeChain.traceUp === 'function') {
      const byRoot = new Map();
      for (const f of findings) {
        if (!f.changeId) continue;
        const chain = this._changeChain.traceUp(f.changeId);
        if (chain.length === 0) continue;
        const rootId = chain[chain.length - 1].id;
        if (!byRoot.has(rootId)) byRoot.set(rootId, []);
        byRoot.get(rootId).push(f.id);
      }
      for (const [rootId, ids] of byRoot) {
        if (ids.length > 1) {
          correlations.push({
            id: `corr-${corrIdx++}`,
            type: 'same-chain',
            findingIds: ids,
            description: `${ids.length} 个发现属于同一因果链（根变更 ${rootId}）`,
          });
        }
      }
    }

    // 3. time-cluster: TIME_CLUSTER_MS 内密集出现的发现
    const sorted = [...findings].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    let cluster = [];
    let clusterStart = null;
    const windowMs = THRESHOLDS.TIME_CLUSTER_MS;
    const flushCluster = () => {
      if (cluster.length > 1) {
        correlations.push({
          id: `corr-${corrIdx++}`,
          type: 'time-cluster',
          findingIds: cluster.map(f => f.id),
          description: `${cluster.length} 个发现在 ${windowMs}ms 内密集出现`,
        });
      }
    };
    for (const f of sorted) {
      const ts = f.timestamp || 0;
      if (clusterStart === null) {
        cluster = [f];
        clusterStart = ts;
      } else if (ts - clusterStart <= windowMs) {
        cluster.push(f);
      } else {
        flushCluster();
        cluster = [f];
        clusterStart = ts;
      }
    }
    flushCluster();

    return correlations;
  }

  // ===== 根因分析 =====

  /**
   * 基于 StateChangeChain 追溯指定发现的根因
   * @param {string} findingId - 发现ID（runAll 报告中 finding.id）
   * @returns {{finding: DiagnosticFinding|null, rootChange: Object|null, chain: Object[]}}
   */
  findRootCause(findingId) {
    const empty = { finding: null, rootChange: null, chain: [] };
    if (!this._lastReport) return empty;
    const finding = this._lastReport.findings.find(f => f.id === findingId);
    if (!finding) return empty;
    if (!finding.changeId || !this._changeChain || typeof this._changeChain.traceUp !== 'function') {
      return { finding, rootChange: null, chain: [] };
    }
    const chain = this._changeChain.traceUp(finding.changeId);
    const rootChange = chain.length > 0 ? chain[chain.length - 1] : null;
    return { finding, rootChange, chain };
  }

  // ===== 导出 =====

  /**
   * 导出最新诊断报告（JSON可序列化，供AI分析）
   * @returns {Object|null} 报告对象（无最近报告返回null）
   */
  exportReport() {
    if (!this._lastReport) return null;
    // 深拷贝确保可JSON化（findings中的details可能含循环引用，序列化时会被JSON.stringify处理）
    try {
      return JSON.parse(JSON.stringify(this._lastReport));
    } catch (e) {
      // 序列化失败时返回浅拷贝
      return {
        timestamp: this._lastReport.timestamp,
        totalRulesRun: this._lastReport.totalRulesRun,
        totalFindings: this._lastReport.totalFindings,
        findingsBySeverity: { ...this._lastReport.findingsBySeverity },
        stats: { ...this._lastReport.stats },
        correlations: this._lastReport.correlations.map(c => ({ ...c, findingIds: [...c.findingIds] })),
        findings: this._lastReport.findings.map(f => ({
          id: f.id,
          ruleId: f.ruleId,
          severity: f.severity,
          message: f.message,
          entityId: f.entityId,
          changeId: f.changeId,
          suggestedFix: f.suggestedFix,
          timestamp: f.timestamp,
        })),
      };
    }
  }

  // ===== 统计与摘要 =====

  /**
   * 获取引擎运行统计
   * @returns {{registeredRules: number, lastRunTimestamp: number|null, totalRuns: number, averageFindingsPerRun: number}}
   */
  getStats() {
    return {
      registeredRules: this._rules.size,
      lastRunTimestamp: this._lastRunTimestamp,
      totalRuns: this._totalRuns,
      averageFindingsPerRun: this._totalRuns > 0 ? Math.round((this._totalFindings / this._totalRuns) * 100) / 100 : 0,
    };
  }

  /**
   * 获取引擎摘要（供AI排查参考）
   * @returns {Object} 摘要信息
   */
  getSummary() {
    const stats = this.getStats();
    return {
      component: 'DiagnosticEngine',
      registeredRules: stats.registeredRules,
      totalRuns: stats.totalRuns,
      lastRunTimestamp: stats.lastRunTimestamp,
      averageFindingsPerRun: stats.averageFindingsPerRun,
      hasChangeChain: this._changeChain !== null,
      hasStateField: this._stateField !== null,
      hasSnapshotStore: this._snapshotStore !== null,
      lastReport: this._lastReport ? {
        timestamp: this._lastReport.timestamp,
        totalFindings: this._lastReport.totalFindings,
        findingsBySeverity: { ...this._lastReport.findingsBySeverity },
        correlationsCount: this._lastReport.correlations.length,
        stats: { ...this._lastReport.stats },
      } : null,
      rules: Array.from(this._rules.values()).map(r => ({
        id: r.id,
        name: r.name,
        category: r.category,
        severity: r.severity,
      })),
    };
  }
}

export default DiagnosticEngine;
