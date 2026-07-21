/**
 * [INPUT]: 无
 * [OUTPUT]: easeOutCubic / easeInCubic / easeInOutCubic / applyEasing
 * [POS]: src/v2/animation/ease.js, 通用缓动工具, 跨 render/interaction 共享
 * [PROTOCOL]: 变更时更新此头部
 *
 * 设计依据:
 *   S2.16: phase-transition ease-out 缓动 — 把 linear tick 重新映射成 "前段快, 收尾慢".
 *   S2.18: 补齐 ease-in (前段慢, 收尾快) + ease-in-out (前后慢, 中间快) 两条曲线,
 *          并用 applyEasing 统一分发, 让 phase-transition / spawn / pulse 等场景可选缓动类型.
 *
 * 简化版 (10 行): 用三次多项式近似 CSS cubic-bezier.
 *   - 严格 bezier 需 Newton-Raphson 解 t, 视觉差异 < 5%, 暂用简化版
 *   - easeOut 公式: y = 1 - (1 - x)^2.5 (近似 cubic-bezier(0.25, 0.1, 0.25, 1))
 *   - easeIn 公式: y = x^2.5 (跟 easeOut 对称)
 *   - easeInOut: 前半段 easeIn, 后半段 easeOut, 折点在 x=0.5
 *
 * @note(s2, decision, animation, since:2026-07-20, updated:2026-07-21)
 * @see docs/notes/s2/S2.16-phase-easing-plan.md
 * @see docs/notes/s2/S2.18-easing-config-plan.md
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
 * S2.18: ease-in 缓动 (前段慢, 收尾快) — 跟 easeOutCubic 对称
 *   公式: y = x^2.5 (跟 CSS `ease-in` cubic-bezier(0.42, 0, 1, 1) 视觉相近)
 *   用途: 退场动画 (fadeOut/scaleOut) — 先慢后快, 视觉上"加速离开"
 * @param {number} x - 0~1 linear tick
 * @returns {number} 0~1 eased output
 */
export function easeInCubic(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return Math.pow(x, 2.5);
}

/**
 * S2.18: ease-in-out 缓动 (前后慢, 中间快) — 视觉上"自然加速再减速"
 *   前半段 (x < 0.5): 走 easeIn, 后半段 (x >= 0.5): 走 easeOut
 *   折点 0.5 处值: 0.5 (数学上保证连续)
 *   用途: 循环动画 (pulse / breathe) — 进出都柔和, 中间有"加速感"
 * @param {number} x - 0~1 linear tick
 * @returns {number} 0~1 eased output
 */
export function easeInOutCubic(x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x < 0.5) {
    // 前半: easeIn (加速) — x=0.25 时 y=0.25^2.5 = 0.03125
    return 0.5 * Math.pow(x * 2, 2.5);
  } else {
    // 后半: easeOut (减速) — x=0.75 时 y=0.5 + 0.5*(1-0.5^2.5) = 0.5 + 0.5*0.823 = 0.9115
    return 1 - 0.5 * Math.pow(2 - x * 2, 2.5);
  }
}

/**
 * 缓动方向枚举 (S2.18 补齐 4 种)
 *   - LINEAR: 无缓动, 匀速 (调试/对比用, 生产一般不用)
 *   - EASE_OUT: 前快后慢, 出场 (默认, S2.16 phase-transition 沿用)
 *   - EASE_IN: 前慢后快, 入场
 *   - EASE_IN_OUT: 前后慢中间快, 循环动画
 */
export const EasingType = Object.freeze({
  LINEAR: 'linear',
  EASE_OUT: 'ease-out',
  EASE_IN: 'ease-in',
  EASE_IN_OUT: 'ease-in-out',
});

/**
 * 通用缓动入口, 真正按 type 分发 (S2.18 补齐 4 种类型)
 *   未识别 type 走 ease-out (跟原 S2.16 行为一致, 防止 typo 崩溃)
 * @param {number} x - 0~1
 * @param {string} [type='ease-out'] - EasingType 之一
 * @returns {number} 0~1
 */
export function applyEasing(x, type = EasingType.EASE_OUT) {
  if (type === EasingType.LINEAR) return x;
  if (type === EasingType.EASE_IN) return easeInCubic(x);
  if (type === EasingType.EASE_IN_OUT) return easeInOutCubic(x);
  return easeOutCubic(x);  // 默认 ease-out, 跟 S2.16 兼容
}
