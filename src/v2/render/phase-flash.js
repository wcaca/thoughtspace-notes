/**
 * [INPUT]: 无外部依赖（纯函数, 不引入 THREE, 便于单测）
 * [OUTPUT]: phaseFlashAmount(progress, amplitude) — 闪烁强度 0~amplitude (sin 曲线)
 *   + shouldApplyPhaseFlash(progress) — 阈值判断 (避免无意义 lerp)
 *   + getPhaseFlashAmplitude(fromPhase, toPhase, thought) — per-transition 振幅查表 (S2.23)
 *     + S2.25: per-thought 覆盖 (thought.flashAmplitudeOverride 非 null 时优先)
 *   + PHASE_FLASH_AMPLITUDE=0.3 默认常量
 *   + PHASE_FLASH_THRESHOLD=0.001 常量
 *   + PHASE_FLASH_AMPLITUDE_BY_TRANSITION — per-transition 振幅表
 * [POS]: src/v2/render/phase-flash.js,L2 渲染层,phase 闪烁计算 (纯函数)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
// S2.20: phase 变化时温度色短暂闪烁
// S2.22: 接收 linear OR eased progress (0~1 边界归零是 不变量, sin 峰值对 eased 也准)
// S2.23: per-transition 振幅 — 不同 phase 转换用不同振幅
//   (e.g. SEED→CRYSTAL 诞生强闪 0.4, CRYSTAL→MEMORY 默认 0.3, DECOMPOSING→SEED 弱闪 0.2)
//   振幅查表 + 默认值, 纯函数零依赖
// S2.25: per-thought 振幅覆盖 — thought.flashAmplitudeOverride 字段 (number|null, 0~1)
//   优先级: thought.flashAmplitudeOverride > per-transition 查表 > PHASE_FLASH_AMPLITUDE 默认
//   用途: 用户在 UI 上"这个念头闪光太刺眼/太弱" 想个性化时, 直接改这个 thought 字段
//   不修改全局查表, 不影响其他 thought. 设置 null 恢复查表行为.
//
// 设计: progress 0~1 期间, 颜色叠加 0~amplitude~0 白光 (sin 曲线峰值 = amplitude)
// 边界 0/1: 无闪烁 (避免 phase 切换前/后误触发)
// 中点 0.5: 闪烁峰值 (颜色 amplitude 比例偏白)
// S2.22 补充: 接受 eased progress (ease-in-out / ease-in / ease-out 都边界 0/1, sin 仍准)

/** S2.20: 闪烁峰值强度 (白光最大叠加比例, 默认值) */
export const PHASE_FLASH_AMPLITUDE = 0.3;

/** S2.20: 闪烁阈值 (低于此值跳过 lerp, 避免无意义操作) */
export const PHASE_FLASH_THRESHOLD = 0.001;

/**
 * S2.23: per-transition 振幅表
 * key: "from→to" 字符串, value: 振幅 (0~1)
 * 设计思路:
 *   - 诞生 (SEED → CRYSTAL): 强闪 0.4 (新想法诞生, 视觉冲击)
 *   - 凝固 (CRYSTAL → MEMORY): 默认 0.3 (跟 S2.20 一致, 不变)
 *   - 消散 (MEMORY → DECOMPOSING): 中闪 0.35 (记忆消散仍有视觉)
 *   - 重生 (DECOMPOSING → SEED): 弱闪 0.2 (低沉淡入, 不要喧宾夺主)
 *   - 同 phase (CRYSTAL → CRYSTAL 等): 0 (无意义闪烁)
 *   - 其他 fallback: 0.3 (跟默认一致)
 */
export const PHASE_FLASH_AMPLITUDE_BY_TRANSITION = Object.freeze({
  'seed→crystal': 0.4,
  'crystal→memory': 0.3,
  'memory→decomposing': 0.35,
  'decomposing→seed': 0.2,
  // 同 phase no-op 显式 0
  'crystal→crystal': 0,
  'memory→memory': 0,
  'seed→seed': 0,
  'decomposing→decomposing': 0,
  'phase-transitioning→phase-transitioning': 0,
});

/**
 * S2.23: 获取指定 phase 转换的 flash 振幅
 * S2.25: 接受可选 thought 参数 — thought.flashAmplitudeOverride 优先级最高
 *   优先级: thought.flashAmplitudeOverride > per-transition 查表 > PHASE_FLASH_AMPLITUDE 默认
 *   override 防御性: 必须是 0~1 范围 number, 否则忽略 (视为 null, 走查表)
 *   用途: per-thought 个性化 (UI 调强度), 不影响其他 thought
 * @param {string} fromPhase - 起始 phase (ThoughtPhase 枚举值, 小写)
 * @param {string} toPhase - 目标 phase
 * @param {object} [thought] - S2.25: 可选 thought 对象, 含 flashAmplitudeOverride 字段
 * @returns {number} 振幅 0~1, 查表 miss 时回退到 PHASE_FLASH_AMPLITUDE
 */
export function getPhaseFlashAmplitude(fromPhase, toPhase, thought) {
  // S2.25: thought 级覆盖优先 (per-thought 个性化, UI 调强度)
  if (thought && typeof thought === 'object') {
    const override = thought.flashAmplitudeOverride;
    if (typeof override === 'number' && !isNaN(override) && override >= 0 && override <= 1) {
      return override;
    }
    // override 是 null/undefined/非法值 → 走查表
  }
  if (typeof fromPhase !== 'string' || typeof toPhase !== 'string') {
    return PHASE_FLASH_AMPLITUDE;
  }
  const key = `${fromPhase}→${toPhase}`;
  if (key in PHASE_FLASH_AMPLITUDE_BY_TRANSITION) {
    return PHASE_FLASH_AMPLITUDE_BY_TRANSITION[key];
  }
  return PHASE_FLASH_AMPLITUDE;
}

/**
 * S2.20: 计算 phase 闪烁强度 (0~amplitude 范围, sin 曲线)
 * S2.22: 参数可接 linear 或 eased progress (0~1 边界, sin 在 0/1 边界都为 0)
 * S2.23: amplitude 参数可选, 不传时用 PHASE_FLASH_AMPLITUDE 默认值 (向后兼容)
 * @param {number} progress - phase transition 进度 0~1 (linear OR eased)
 * @param {number} [amplitude=PHASE_FLASH_AMPLITUDE] - S2.23: 振幅上限, 默认 0.3
 * @returns {number} 闪烁强度 0~amplitude
 *  - prog=0 或 1: 0 (无闪烁, phase 边界)
 *  - prog=0.5: amplitude (峰值)
 *  - prog=0.25 / 0.75: amplitude * sin(π/4) ≈ amplitude * 0.7071 (对称点)
 */
export function phaseFlashAmount(progress, amplitude = PHASE_FLASH_AMPLITUDE) {
  if (typeof progress !== 'number' || isNaN(progress)) {
    return 0;
  }
  if (progress <= 0 || progress >= 1) {
    return 0;  // phase 边界: 无闪烁
  }
  // S2.23: amplitude 防御性 (负数 / NaN 视为默认)
  const amp = (typeof amplitude === 'number' && !isNaN(amplitude) && amplitude >= 0)
    ? amplitude
    : PHASE_FLASH_AMPLITUDE;
  return amp * Math.sin(Math.PI * progress);
}

/**
 * S2.20: 判断是否需要应用闪烁 (阈值过滤, 避免无意义 lerp)
 * @param {number} flashAmount
 * @returns {boolean}
 */
export function shouldApplyPhaseFlash(flashAmount) {
  return flashAmount > PHASE_FLASH_THRESHOLD;
}
