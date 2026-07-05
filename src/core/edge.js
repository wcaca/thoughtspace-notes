/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: Edge 数据创建 / 5 种关系类型判定函数
 * [POS]: src/core 下,关系网络的"定义层",被 persistence 和 render/edge-line 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

export const RelationType = Object.freeze({
  CAUSE: 'cause',
  PARALLEL: 'parallel',
  CONFLICT: 'conflict',
  SEQUENCE: 'sequence',
  SUBORDINATE: 'subordinate'
});

const VALID_TYPES = Object.values(RelationType);

export function createEdge(id, fromId, toId, relationType) {
  const type = relationType || RelationType.CAUSE;
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`invalid relation type: ${type}. Valid: ${VALID_TYPES.join(', ')}`);
  }
  return {
    id,
    fromId,
    toId,
    relationType: type
  };
}

export const EDGE_STYLES = Object.freeze({
  [RelationType.CAUSE]: { line: 'solid', arrow: 'single', color: '#7fe0c9', label: '因果' },
  [RelationType.PARALLEL]: { line: 'dashed', arrow: 'double-dot', color: '#8b90ad', label: '并列' },
  [RelationType.CONFLICT]: { line: 'zigzag', arrow: 'none', color: '#e87aa8', label: '矛盾' },
  [RelationType.SEQUENCE]: { line: 'gradient', arrow: 'directional', color: '#e8a865', label: '时序' },
  [RelationType.SUBORDINATE]: { line: 'tree-right-angle', arrow: 'none', color: '#9b8cf2', label: '从属' }
});

export function getEdgeStyle(relationType) {
  return EDGE_STYLES[relationType] || EDGE_STYLES[RelationType.CAUSE];
}
