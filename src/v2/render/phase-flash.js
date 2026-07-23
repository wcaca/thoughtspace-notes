// S2.20: phase 变化时温度色短暂闪烁
// 纯函数模块, 不依赖 THREE, 便于测试
//
// 设计: phase 0~1 期间, 颜色叠加 0~0.3~0 白光 (sin 曲线峰值 0.3)
// 边界 0/1: 无闪烁 (避免 phase 切换前/后误触发)
// 中点 0.5: 闪烁峰值 0.3 (颜色 30% 偏白)

/** S2.20: 闪烁峰值强度 (白光最大叠加比例) */
export const PHASE_FLASH_AMPLITUDE = 0.3;

/** S2.20: 闪烁阈值 (低于此值跳过 lerp, 避免无意义操作) */
export const PHASE_FLASH_THRESHOLD = 0.001;

/**
 * S2.20: 计算 phase 闪烁强度 (0~0.3 范围, sin 曲线)
 * @param {number} linearProg - phase transition 进度 0~1
 * @returns {number} 闪烁强度 0~0.3
 *  - prog=0 或 1: 0 (无闪烁, phase 边界)
 *  - prog=0.5: 0.3 (峰值)
 *  - prog=0.25 / 0.75: 0.2121 (对称点)
 */
export function phaseFlashAmount(linearProg) {
  if (typeof linearProg !== 'number' || isNaN(linearProg)) {
    return 0;
  }
  if (linearProg <= 0 || linearProg >= 1) {
    return 0;  // phase 边界: 无闪烁
  }
  return PHASE_FLASH_AMPLITUDE * Math.sin(Math.PI * linearProg);
}

/**
 * S2.20: 判断是否需要应用闪烁 (阈值过滤, 避免无意义 lerp)
 * @param {number} flashAmount
 * @returns {boolean}
 */
export function shouldApplyPhaseFlash(flashAmount) {
  return flashAmount > PHASE_FLASH_THRESHOLD;
}
