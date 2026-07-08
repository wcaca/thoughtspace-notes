/**
 * [INPUT]: 浏览器URL参数（?v2=true）
 * [OUTPUT]: isV2Enabled() / getV2Mode() / getV2EntryScript() — 入口级v2切换检测
 * [POS]: src/runtime/flags/v2-migration.js,被 index.html 的bootstrap脚本调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计说明:
 *   v2切换是入口级切换,发生在flag系统(registry.js/index.js)加载之前。
 *   因此本文件不依赖registry.js,是独立的URL参数检测器。
 *   实现方案§2.2 S0: index.html根据URL参数加载src/main-v1.js或src/v2/main.js。
 *
 * @note(s0, decision, entry-switch, since:2026-07-08)
 *   v2入口切换不走registry系统: registry要求spec frontmatter声明+自动生成,
 *   而v2切换需要在ESM加载链最前端完成,无法等待registry初始化。
 */

const V2_URL_PARAM = 'v2';
const V2_ENTRY = './src/v2/main.js';
const V1_ENTRY = './src/main.js';

/**
 * 检测URL参数是否启用v2
 * @returns {boolean} true=加载v2入口, false=加载v1入口
 */
export function isV2Enabled() {
  try {
    const params = new URLSearchParams(globalThis.location?.search || '');
    return params.get(V2_URL_PARAM) === 'true';
  } catch {
    // 非浏览器环境（如测试）默认返回false
    return false;
  }
}

/**
 * 获取当前模式
 * @returns {'v1'|'v2'}
 */
export function getV2Mode() {
  return isV2Enabled() ? 'v2' : 'v1';
}

/**
 * 获取对应的入口脚本路径
 * @returns {string} ESM模块路径
 */
export function getV2EntryScript() {
  return isV2Enabled() ? V2_ENTRY : V1_ENTRY;
}

export default Object.freeze({
  isV2Enabled,
  getV2Mode,
  getV2EntryScript,
});
