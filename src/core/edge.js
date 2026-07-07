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

/**
 * EdgeStore — 内存态边集合(被 edge-bridge 与 Yjs 双向镜像)
 * 与 layer-store 类似: 闭包返回 API,不暴露内部 Map
 */
export function createEdgeStore() {
  const edges = new Map(); // id -> edge
  const byPair = new Map(); // `${fromId}::${toId}` -> edgeId

  function pairKey(fromId, toId) {
    return `${fromId || ''}::${toId || ''}`;
  }

  function list() {
    return Array.from(edges.values());
  }

  function get(id) {
    return edges.get(id) || null;
  }

  function has(id) {
    return edges.has(id);
  }

  function hasEdge(fromId, toId) {
    if (!fromId || !toId) return false;
    return byPair.has(pairKey(fromId, toId));
  }

  function linkEdge(edge) {
    if (!edge || !edge.id || !edge.fromId || !edge.toId) return null;
    if (!Object.values(RelationType).includes(edge.relationType)) return null;
    const prev = edges.get(edge.id);
    if (prev && (prev.fromId !== edge.fromId || prev.toId !== edge.toId)) {
      byPair.delete(pairKey(prev.fromId, prev.toId));
    }
    const next = { ...prev, ...edge };
    edges.set(edge.id, next);
    byPair.set(pairKey(edge.fromId, edge.toId), edge.id);
    return { ...next };
  }

  function unlinkEdge(id) {
    const e = edges.get(id);
    if (!e) return false;
    edges.delete(id);
    byPair.delete(pairKey(e.fromId, e.toId));
    return true;
  }

  function size() {
    return edges.size;
  }

  function clear() {
    edges.clear();
    byPair.clear();
  }

  // ⚠️ 'edges' Map 引用暴露 — 让 edge-bridge.js 的 store.edges.values() 工作
  // 公开为只读约定: 调用方不应修改此 Map, 否则绕过 linkEdge/unlinkEdge 验证
  return { list, get, has, hasEdge, linkEdge, unlinkEdge, size, clear, edges };
}

export function linkEdge(store, edge) {
  if (!store || typeof store.linkEdge !== 'function') return null;
  return store.linkEdge(edge);
}

export function unlinkEdge(store, idOrEdge) {
  if (!store || typeof store.unlinkEdge !== 'function') return false;
  if (typeof idOrEdge === 'string') return store.unlinkEdge(idOrEdge);
  if (idOrEdge && typeof idOrEdge === 'object' && idOrEdge.id) return store.unlinkEdge(idOrEdge.id);
  return false;
}

export function changeEdgeType(edge, newType) {
  if (!edge || !Object.values(RelationType).includes(newType)) return edge;
  return { ...edge, relationType: newType };
}
