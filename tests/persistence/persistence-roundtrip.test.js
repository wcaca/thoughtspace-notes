/**
 * [INPUT]: src/persistence/thought-bridge.js, edge-bridge.js, src/core/thought, src/core/edge
 * [OUTPUT]: 模拟"F5 重启"流程 — 第一个 bridge 写 → 第二个 bridge 拉 验证数据完整恢复
 * [POS]: tests/persistence 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createThought } from '../../src/core/thought.js';
import { createEdgeStore, createEdge, linkEdge, RelationType } from '../../src/core/edge.js';
import { createThoughtBridge } from '../../src/persistence/thought-bridge.js';
import { createEdgeBridge } from '../../src/persistence/edge-bridge.js';

describe('persistence round-trip (simulating F5 reload)', () => {
  it('first session: writes thoughts + edges; second session: reads back identical state', async () => {
    const doc = new Y.Doc();
    const thoughtsYMap = doc.getMap('thoughts');
    const edgesYMap = doc.getMap('edges');

    const memThoughtsA = new Map();
    const memEdgesA = createEdgeStore();
    const bridgeT1 = createThoughtBridge(memThoughtsA, thoughtsYMap, doc);
    const bridgeE1 = createEdgeBridge(memEdgesA, edgesYMap, doc);

    const t0 = createThought('t0', 'hello world', 10, 20);
    t0.z = 30; t0.mass = 1.5; t0.temperature = 0.85;
    memThoughtsA.set(t0.id, t0);

    const t1 = createThought('t1', 'second idea', -5, 50);
    t1.z = -10; t1.temperature = 0.5;
    memThoughtsA.set(t1.id, t1);

    linkEdge(memEdgesA, createEdge('e01', 't0', 't1', RelationType.CAUSE));
    bridgeT1.updateOne(t0);
    bridgeT1.updateOne(t1);
    bridgeE1.syncToDoc();

    expect(thoughtsYMap.size).toBe(2);
    expect(edgesYMap.size).toBe(1);

    const persistedState = Y.encodeStateAsUpdate(doc);

    const doc2 = new Y.Doc();
    Y.applyUpdate(doc2, persistedState);

    const thoughtsYMap2 = doc2.getMap('thoughts');
    const edgesYMap2 = doc2.getMap('edges');
    const memThoughtsB = new Map();
    const memEdgesB = createEdgeStore();
    const bridgeT2 = createThoughtBridge(memThoughtsB, thoughtsYMap2, doc2);
    const bridgeE2 = createEdgeBridge(memEdgesB, edgesYMap2, doc2);

    const i1 = bridgeT2.syncToStore();
    const i2 = bridgeE2.syncToStore();
    expect(i1).toBe(2);
    expect(i2).toBe(1);

    const t0b = memThoughtsB.get('t0');
    expect(t0b).toBeDefined();
    expect(t0b.text).toBe('hello world');
    expect(t0b.x).toBe(10);
    expect(t0b.y).toBe(20);
    expect(t0b.z).toBe(30);
    expect(t0b.temperature).toBe(0.85);

    const t1b = memThoughtsB.get('t1');
    expect(t1b.text).toBe('second idea');

    const edges = Array.from(memEdgesB.edges.values());
    expect(edges.length).toBe(1);
    expect(edges[0].relationType).toBe('cause');
    expect(edges[0].fromId).toBe('t0');
    expect(edges[0].toId).toBe('t1');
  });

  it('second session: deleting a thought in Y removes it from memory', () => {
    const doc = new Y.Doc();
    const thoughtsYMap = doc.getMap('thoughts');
    const memThoughts = new Map();
    const bridge = createThoughtBridge(memThoughts, thoughtsYMap, doc);

    doc.transact(() => {
      thoughtsYMap.set('a', { id: 'a', text: 'a', x: 0, y: 0, z: 0, temperature: 1 });
      thoughtsYMap.set('b', { id: 'b', text: 'b', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'remote');

    expect(memThoughts.size).toBe(2);
    doc.transact(() => { thoughtsYMap.delete('a'); }, 'remote');
    expect(memThoughts.size).toBe(1);
    expect(memThoughts.has('a')).toBe(false);
    bridge.destroy();
  });

  it('does not create duplicate thoughts across hot-reload (idempotent seed)', () => {
    const doc = new Y.Doc();
    const yMap = doc.getMap('thoughts');
    const memMap = new Map();

    const bridge = createThoughtBridge(memMap, yMap, doc);

    doc.transact(() => {
      yMap.set('t0', { id: 't0', text: 'thought', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'remote');
    expect(memMap.size).toBe(1);

    bridge.updateOne({ id: 't0', text: 'thought', x: 0, y: 0, z: 0, temperature: 1 });
    expect(yMap.size).toBe(1);

    bridge.updateOne({ id: 't0', text: 'thought', x: 0, y: 0, z: 0, temperature: 1 });
    expect(yMap.size).toBe(1);

    bridge.destroy();
  });
});
