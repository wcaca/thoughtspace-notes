/**
 * [INPUT]: src/core/edge(createEdgeStore, linkEdge, unlinkEdge), src/persistence/yjs-store(getEdges)
 * [OUTPUT]: createEdgeBridge(store, yMap) → { syncToDoc, syncToStore, destroy };main 入口装配,刷新后从 Y 恢复边
 * [POS]: src/persistence 下 — edgeStore (内存态) 与 Y.Map('edges') (权威源) 之间的双向镜像桥
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { createEdgeStore } from '../core/edge.js';

const ORIGIN = 'edge-bridge';

function _hasEdge(store, fromId, toId) {
  if (!store || typeof store.hasEdge !== 'function') return false;
  return store.hasEdge(fromId, toId);
}

function _linkEdge(store, edge) {
  if (!store || typeof store.linkEdge !== 'function') return null;
  return store.linkEdge(edge);
}

function _unlinkEdge(store, idOrEdge) {
  if (!store || typeof store.unlinkEdge !== 'function') return false;
  if (typeof idOrEdge === 'string') return store.unlinkEdge(idOrEdge);
  if (idOrEdge && typeof idOrEdge === 'object' && idOrEdge.id) return store.unlinkEdge(idOrEdge.id);
  return false;
}

export function createEdgeBridge(store, yMap, doc) {
  if (!store) throw new Error('edge-bridge requires an edgeStore');
  if (!yMap) throw new Error('edge-bridge requires a Y.Map');

  let suppressFromDoc = false;

  function applyEdgeToStore(edge) {
    if (!edge) return;
    _linkEdge(store, edge);
  }

  function applyEdgeRemoveFromStore(edge) {
    if (!edge || !edge.id) return;
    _unlinkEdge(store, edge.id);
  }

  function syncToStore() {
    if (!yMap) return 0;
    let imported = 0;
    const seen = new Set();
    yMap.forEach((value, id) => {
      const t = typeof value;
      if (t !== 'object') return;
      if (!value || !value.id || !value.fromId || !value.toId) return;
      seen.add(value.id);
      if (!_hasEdge(store, value.fromId, value.toId)) {
        applyEdgeToStore({
          id: value.id,
          fromId: value.fromId,
          toId: value.toId,
          relationType: value.relationType,
          createdAt: value.createdAt || Date.now()
        });
        imported++;
      }
    });
    for (const e of Array.from(store.edges.values())) {
      if (!seen.has(e.id)) _unlinkEdge(store, e.id);
    }
    return imported;
  }

  function transactIfPossible(fn) {
    if (doc && typeof doc.transact === 'function') {
      doc.transact(fn, ORIGIN);
    } else {
      fn();
    }
  }

  function syncToDoc() {
    if (!yMap) return 0;
    let written = 0;
    transactIfPossible(() => {
      const seen = new Set();
      for (const e of store.edges.values()) {
        seen.add(e.id);
        const cur = yMap.get(e.id);
        if (!cur) {
          yMap.set(e.id, {
            id: e.id,
            fromId: e.fromId,
            toId: e.toId,
            relationType: e.relationType,
            createdAt: e.createdAt
          });
          written++;
        }
      }
      for (const id of Array.from(yMap.keys())) {
        if (!seen.has(id)) yMap.delete(id);
      }
    });
    return written;
  }

  function onYMapChange(yEvent, transaction) {
    if (suppressFromDoc) return;
    if (transaction && transaction.origin === ORIGIN) return;
    const changedKeys = (yEvent && yEvent.keysChanged) || null;
    if (!changedKeys) return;
    suppressFromDoc = true;
    try {
      for (const key of changedKeys) {
        const v = yMap.get(key);
        if (v && v.id && v.fromId && v.toId) {
          applyEdgeToStore({
            id: v.id,
            fromId: v.fromId,
            toId: v.toId,
            relationType: v.relationType,
            createdAt: v.createdAt || Date.now()
          });
        } else {
          _unlinkEdge(store, key);
        }
      }
    } finally {
      suppressFromDoc = false;
    }
  }

  const observer = (yEvent, transaction) => onYMapChange(yEvent, transaction);
  yMap.observe(observer);

  function destroy() {
    if (yMap && typeof yMap.unobserve === 'function') {
      yMap.unobserve(observer);
    }
  }

  function swapEdgeDirection(edgeId) {
    if (!yMap || !edgeId) return null;
    const cur = yMap.get(edgeId);
    if (!cur || !cur.id || !cur.fromId || !cur.toId) return null;
    if (cur.fromId === cur.toId) return null;
    let swapped = null;
    transactIfPossible(() => {
      const next = {
        id: cur.id,
        fromId: cur.toId,
        toId: cur.fromId,
        relationType: cur.relationType,
        createdAt: cur.createdAt
      };
      yMap.set(cur.id, next);
      swapped = next;
    });
    return swapped;
  }

  return { syncToStore, syncToDoc, swapEdgeDirection, destroy, yMapGet: () => yMap, docGet: () => doc };
}

export async function setupPersistenceBridge(store, doc, dbName) {
  const { initPersistence, getEdges } = await import('./yjs-store.js');
  if (!doc) doc = await initPersistence(dbName);
  const yMap = getEdges();
  const bridge = createEdgeBridge(store, yMap, doc);
  const imported = bridge.syncToStore();
  return { bridge, yMap, doc, imported };
}
