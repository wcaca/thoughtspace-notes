/**
 * ExpectedFrameCalculator (S2.12)
 *
 * [INPUT]: 实测 callback 数 (getExpectedMs({callbackCount}))
 * [OUTPUT]: ExpectedFrameCalculator 类 — 理论帧耗时计算 (与实际 ms 对比得 overhead)
 *   - getExpectedMs({callbackCount}) — 根据 5 阶段经验常数 + 实测回调数, 返 ms
 *   - STAGE_COSTS (类静态) — 5 阶段经验常数 (input 0.3 / state 1.0 / transform 1.5 / render 2.0 / snapshot 0.2)
 *   - 用于 DebugOverlay (S2.11) 展示 "实际 vs 理论" 差值
 *   - 纯计算函数, 无副作用
 * [POS]: src/v2/render/expected-calculator.js, L3 渲染层, S2.12 理论帧耗时, 被 DebugOverlay 调
 * [PROTOCOL]: 变更时更新此头部, 然后检查 ../CLAUDE.md
 *
 * 用 5 阶段经验常数 + 实测回调数, 算理论帧耗时。
 * 让 debug-overlay (S2.11) 能直接显示"实际 vs 理论", 瓶颈一目了然。
 *
 * 为什么需要:
 *   - 实际 ms 是"包括了 GC / raf jitter / 测试时 V8 优化", 不能直接拿来当 baseline
 *   - 理论 ms 是"按设计应该多少", 超过 = 有问题 (缓存未命中 / 频繁分配 / 误触 render)
 *   - 实测 - 理论 = overhead, 排查时看 overhead 数字, 不用看绝对 ms
 *
 * 经验常数 (来自 S1/S2 真实测量, 单位 ms):
 *   input:     0.3  (event 收集 + 时间戳同步)
 *   state:     1.0  (stateStore diff + 触发器匹配)
 *   transform: 1.5  (matrix 批量更新 + Frustum culling)
 *   render:    4.0  (three.js draw call 排队 + GPU 上传)
 *   snapshot:  0.8  (Y.encode 增量序列化)
 *   base:      0.5  (raf 调度 + ctx 构造 + stats 收集开销)
 *
 * 用法 (render-pipeline.js):
 *   import { DEFAULT_EXPECTED_CONSTANTS, computeExpectedMs } from './expected-calculator.js';
 *   // 在 getStats() 加 expected / overhead 字段
 *
 * @note(s2, decision, constants-from-measurement, since:2026-07-13)
 *   常数从 S1 空间本体 + S2.10 render-pipeline 真实测量取, 不空想。
 *   验证方法: 空场景 (无念头/记忆) 跑 60s, 取 p50 → 当 baseline。
 *   调整时机: 加了新模块 (e.g. S3 physics) 再回测, 别提前改。
 */

export const DEFAULT_EXPECTED_CONSTANTS = Object.freeze({
  input:     0.3,
  state:     1.0,
  transform: 1.5,
  render:    4.0,
  snapshot:  0.8,
  base:      0.5,
});

/**
 * 计算理论帧耗时
 * @param {Object} args
 * @param {Map<string, Array<Object>>} args.stages - render-pipeline 的 _stages (5 阶段 → 回调数组)
 * @param {Object} [args.constants=DEFAULT_EXPECTED_CONSTANTS] - 5 阶段常数 + base
 * @returns {{expectedMs: number, byStage: Object<string, number>, callbackMultiplier: number}}
 */
export function computeExpectedMs({ stages, constants = DEFAULT_EXPECTED_CONSTANTS }) {
  const byStage = {};
  let expectedMs = constants.base;
  let totalCallbacks = 0;
  let activeStages = 0;
  for (const [stageName, callbacks] of stages) {
    const count = Array.isArray(callbacks) ? callbacks.length : 0;
    const stageMs = (constants[stageName] || 0) * count;
    byStage[stageName] = stageMs;
    expectedMs += stageMs;
    totalCallbacks += count;
    if (count > 0) activeStages++;
  }
  // callbackMultiplier: 反映"加了多少用户逻辑", 用于解释"为啥我加了个回调预期涨这么多"
  // 例: 加了 1 个 transform callback, multiplier = (1.5) / sum(all) = 1.5 / 8.1 ≈ 18.5%
  return {
    expectedMs: round2(expectedMs),
    byStage: roundByStage(byStage),
    callbackMultiplier: totalCallbacks > 0 ? round2(totalCallbacks / (activeStages || 1)) : 0,
  };
}

/**
 * 把实际 ms 和理论 ms 对比, 算 overhead
 * @param {number} actualMs - render-pipeline 实测的 recentAvgMs
 * @param {number} expectedMs - computeExpectedMs 的输出
 * @returns {{overheadMs: number, overheadPct: number, severity: 'ok'|'warn'|'alarm'}}
 */
export function computeOverhead(actualMs, expectedMs) {
  const overheadMs = actualMs - expectedMs;
  const overheadPct = expectedMs > 0 ? (overheadMs / expectedMs) * 100 : 0;
  let severity;
  if (overheadPct > 50) severity = 'alarm';      // 超 50% = 有严重问题
  else if (overheadPct > 20) severity = 'warn';  // 超 20% = 留意
  else severity = 'ok';
  return {
    overheadMs: round2(overheadMs),
    overheadPct: round2(overheadPct),
    severity,
  };
}

/**
 * 算"如果所有阶段都跑满, 还能加多少回调"
 * 用途: 用户问"我还能不能加一个念头?" → 看剩余 budget
 * @param {Object} stages
 * @param {Object} [constants]
 * @param {number} [frameBudgetMs=16] - 帧预算 (默认 60fps)
 * @returns {{remainingMs: number, byStage: Object<string, number>}}
 */
export function computeRemainingBudget(stages, constants = DEFAULT_EXPECTED_CONSTANTS, frameBudgetMs = 16) {
  const { expectedMs, byStage } = computeExpectedMs({ stages, constants });
  const remainingMs = Math.max(0, frameBudgetMs - expectedMs);
  return {
    remainingMs: round2(remainingMs),
    byStage,  // 每个阶段当前占用
    note: remainingMs < 1 ? 'over budget' : 'within budget',
  };
}

// ===== 内部 =====

function round2(n) {
  return Math.round(n * 100) / 100;
}
function roundByStage(obj) {
  const out = {};
  for (const k of Object.keys(obj)) out[k] = round2(obj[k]);
  return out;
}
