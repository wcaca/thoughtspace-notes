/**
 * [INPUT]: src/persistence/edge-bridge.js
 * [OUTPUT]: 验证 edgeStore ↔ Y.Map('edges') 双向镜像
 * [POS]: tests/persistence 下,被 vitest 消费(用 Yjs 内存 doc)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createEdgeStore, createEdge } from '../../src/core/edge.js';
import { createEdgeBridge } from '../../src/persistence/edge-bridge.js';

function makeContext() {
  const doc = new Y.Doc();
  const yMap = doc.getMap('edges');
  const store = createEdgeStore();
  return { doc, yMap, store };
}

describe('edge-bridge', () => {
  it('syncToStore imports edges from Y into store', () => {
    const { doc, yMap, store } = makeContext();
    doc.transact(() => {
      yMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 });
      yMap.set('e2', { id: 'e2', fromId: 'b', toId: 'c', relationType: 'parallel', createdAt: 2 });
    }, 'setup');
    const bridge = createEdgeBridge(store, yMap, doc);
    const imported = bridge.syncToStore();
    expect(imported).toBe(2);
    expect(store.size()).toBe(2);
    bridge.destroy();
  });

  it('syncToStore removes store edges no longer in Y', () => {
    const { doc, yMap, store } = makeContext();
    const e = createEdge('stale', 'x', 'y');
    store.edges.set(e.id, e);
    doc.transact(() => {
      yMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause' });
    }, 'setup');
    const bridge = createEdgeBridge(store, yMap, doc);
    bridge.syncToStore();
    expect(store.size()).toBe(1);
    expect(store.edges.has('e1')).toBe(true);
    bridge.destroy();
  });

  it('syncToDoc pushes store edges into Y', () => {
    const { doc, yMap, store } = makeContext();
    const e = createEdge('e1', 'a', 'b', 'cause');
    store.edges.set(e.id, e);
    const bridge = createEdgeBridge(store, yMap, doc);
    const written = bridge.syncToDoc();
    expect(written).toBe(1);
    expect(yMap.has('e1')).toBe(true);
    bridge.destroy();
  });

  it('onYMapChange updates store when Y mutates from another origin', () => {
    const { doc, yMap, store } = makeContext();
    const bridge = createEdgeBridge(store, yMap, doc);
    doc.transact(() => {
      yMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause' });
    }, 'remote');
    expect(store.edges.has('e1')).toBe(true);
    bridge.destroy();
  });

  it('syncToDoc from bridge is tagged with bridge origin so observers can suppress', () => {
    const { doc, yMap, store } = makeContext();
    const e = createEdge('e1', 'a', 'b', 'cause');
    store.edges.set(e.id, e);
    const bridge = createEdgeBridge(store, yMap, doc);
    let capturedOrigin = 'untouched';
    yMap.observe((_ev, tx) => { capturedOrigin = tx ? tx.origin : null; });
    bridge.syncToDoc();
    expect(capturedOrigin).toBe('edge-bridge');
    bridge.destroy();
  });

  it('identity-equal writes do not trigger Y transactions at all', () => {
    const { doc, yMap, store } = makeContext();
    const e = createEdge('e1', 'a', 'b', 'cause');
    store.edges.set(e.id, e);
    const bridge = createEdgeBridge(store, yMap, doc);
    bridge.syncToDoc();
    let observerCalls = 0;
    yMap.observe(() => observerCalls++);
    bridge.syncToDoc();
    expect(observerCalls).toBe(0);
    bridge.destroy();
  });
});
