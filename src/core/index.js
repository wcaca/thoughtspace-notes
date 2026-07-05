/**
 * [INPUT]: src/core/thought, edge, structure, geometry-cluster
 * [OUTPUT]: barrel export,一口出全 core 模块
 * [POS]: src/core 的桶导出入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
export {
  createThought,
  decayTemperature,
  refreshTemperature,
  updateMass,
  getName
} from './thought.js';

export {
  RelationType,
  createEdge,
  getEdgeStyle,
  EDGE_STYLES
} from './edge.js';

export { cohesionScore, isCrystallized } from './structure.js';

export { GeometryType, clusterEngine } from './geometry-cluster.js';
