/**
 * [INPUT]: 读取本仓库 src/ 模块图,通过 dependency-cruiser 校验不变量
 * [OUTPUT]: 违反 FATAL-005 时 exit 1,无违规 exit 0
 * [POS]: 项目根,被 scripts/check-arch.mjs 调用,也支持直接 `depcruise src --config .`
 * [PROTOCOL]: 变更时更新此头部,然后检查 ./CLAUDE.md
 */
export default {
  forbidden: [
    {
      name: 'core-no-render-lib',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 1: core 禁止依赖 pixi.js 等渲染库',
      from: { path: '^src/core' },
      to: { path: 'node_modules/(pixi\\.js|@pixi|d3-.*)' }
    },
    {
      name: 'core-no-upper-layer',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 2: core 禁止依赖 render/ui/persistence/sim 上层',
      from: { path: '^src/core' },
      to: { path: '^src/(render|ui|persistence|sim)' }
    },
    {
      name: 'sim-no-render',
      severity: 'error',
      comment: 'FATAL-005 / L1 架构约束 3: sim 禁止依赖 render/ui',
      from: { path: '^src/sim' },
      to: { path: '^src/(render|ui)' }
    }
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'default']
    }
  }
};
