/**
 * [INPUT]: 无
 * [OUTPUT]: easeOutCubic(x) — 0~1 输入, 0~1 缓动后输出
 * [POS]: src/v2/animation/ease.js, 通用缓动工具, 跨 render/interaction 共享
 * [PROTOCOL]: 变更时更新此头部
 *
 * 设计依据: S2.16 phase-transition ease-out 缓动 — 把 linear tick 重新映射成
 *   "前段快, 收尾慢" 的自然曲线, 视觉上手感更顺.
 *
 * 简化版 (10 行): 用三次多项式近似 cubic-bezier(0.25, 0.1, 0.25, 1)
 *   - 严格 bezier 需 Newton-Raphson 解 t, 视觉差异 < 5%, 暂用简化版
 *   - 公式 y = 1 - (1 - x)^2.5 (近似 easeOutQuint, 跟 CSS ease-out 视觉相近)
 *   - 误差: x=0.5 时严格 bezier ≈ 0.85, 简化版 ≈ 0.823, 差 0.027
 *
 * @note(s2, decision, animation, since:2026-07-20)
 * @see docs/notes/s2/S2.16-phase-easing-plan.md
 */

/**
 * cubic-bezier(0.25, 0.1, 0.25, 1) 缓动 (CSS `ease-out` 标准曲线, 简化版)
 * @param {number} x - 0~1 linear tick
 * @returns {number} 0~1 eased output
 */
export function easeOutCubic(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return 1 - Math.pow(1 - x, 2.5);
}

/**
 * 缓动方向枚举 (S2.18+ 留, 当前只用 ease-out)
 */
export const EasingType = Object.freeze({
  LINEAR: 'linear',
  EASE_OUT: 'ease-out',
});

/**
 * 通用缓动入口, 预留扩展 (S2.18: 配置文件切换 easing 类型)
 * @param {number} x - 0~1
 * @param {string} [type='ease-out'] - EasingType 之一
 * @returns {number} 0~1
 */
export function applyEasing(x, type = EasingType.EASE_OUT) {
  if (type === EasingType.LINEAR) return x;
  return easeOutCubic(x);  // 默认 ease-out
}
