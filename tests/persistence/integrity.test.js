/**
 * [INPUT]: src/persistence/integrity.js + src/persistence/edge-bridge.js
 * [OUTPUT]: 验证 audit / repair 行为 + swap 行为
 * [POS]: tests/persistence 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { audit, repair } from '../../src/persistence/integrity.js';
import { createEdgeBridge } from '../../src/persistence/edge-bridge.js';
import { createEdgeStore } from '../../src/core/edge.js';

function tmpCtx() {
  const doc = new Y.Doc();
  return {
    doc,
    ctx: {
      doc,
      thoughtsMap: doc.getMap('thoughts'),
      edgesMap: doc.getMap('edges')
    }
  };
}

describe('integrity.audit', () => {
  it('clean data reports no issues', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.thoughtsMap.set('b', { id: 'b', text: 'y', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 });
    const r = await audit(ctx);
    expect(r.orphanEdges.length).toBe(0);
    expect(r.selfLoops.length).toBe(0);
    expect(r.duplicateIds.length).toBe(0);
  });

  it('detects edges pointing to missing thoughts', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'gone', relationType: 'cause', createdAt: 1 });
    const r = await audit(ctx);
    expect(r.orphanEdges.length).toBe(1);
    expect(r.orphanEdges[0].id).toBe('e1');
  });

  it('detects self-loops', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'a', relationType: 'cause', createdAt: 1 });
    const r = await audit(ctx);
    expect(r.selfLoops.length).toBe(1);
  });

  it('detects malformed edges', async () => {
    const { ctx } = tmpCtx();
    ctx.edgesMap.set('e1', { id: 'e1' });
    const r = await audit(ctx);
    expect(r.orphanEdges.length).toBe(1);
    expect(r.orphanEdges[0].reason).toBe('malformed');
  });

  it('always reports duplicateIds empty (Y.Map enforces unique keys)', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'first' });
    ctx.thoughtsMap.set('a', { id: 'a', text: 'second' });
    const r = await audit(ctx);
    expect(r.duplicateIds).toEqual([]);
    expect(r.thoughtCount).toBe(1);
  });
});

describe('integrity.repair', () => {
  it('removes orphan edges', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'gone', relationType: 'cause', createdAt: 1 });
    const r = await repair(ctx);
    expect(r.repaired.removedOrphans).toBe(1);
    expect(ctx.edgesMap.has('e1')).toBe(false);
  });

  it('removes self-loops', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'a', relationType: 'cause', createdAt: 1 });
    const r = await repair(ctx);
    expect(r.repaired.removedLoops).toBe(1);
  });

  it('preserves healthy edges', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.thoughtsMap.set('b', { id: 'b', text: 'y', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 });
    const r = await repair(ctx);
    expect(r.repaired.total).toBe(0);
    expect(ctx.edgesMap.has('e1')).toBe(true);
  });

  it('respects removeOrphanEdges=false option', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'gone', relationType: 'cause', createdAt: 1 });
    const r = await repair(ctx, { removeOrphanEdges: false });
    expect(r.repaired.removedOrphans).toBe(0);
    expect(ctx.edgesMap.has('e1')).toBe(true);
  });

  it('dedupes no-op when Y.Map is already de-duped (it always is)', async () => {
    const { ctx } = tmpCtx();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'first' });
    ctx.thoughtsMap.set('a', { id: 'a', text: 'second' });
    const r = await repair(ctx);
    expect(r.repaired.renamedDuplicates).toBe(0);
    expect(ctx.thoughtsMap.size).toBe(1);
  });
});

describe('edge-bridge.swapEdgeDirection', () => {
  it('flips fromId and toId', () => {
    const { ctx } = tmpCtx();
    const store = createEdgeStore();
    const bridge = createEdgeBridge(store, ctx.edgesMap, ctx.doc);
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.thoughtsMap.set('b', { id: 'b', text: 'y', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 });
    const out = bridge.swapEdgeDirection('e1');
    expect(out).not.toBeNull();
    expect(out.fromId).toBe('b');
    expect(out.toId).toBe('a');
    bridge.destroy();
  });

  it('returns null for non-existent edge', () => {
    const { ctx } = tmpCtx();
    const store = createEdgeStore();
    const bridge = createEdgeBridge(store, ctx.edgesMap, ctx.doc);
    const out = bridge.swapEdgeDirection('notreal');
    expect(out).toBeNull();
    bridge.destroy();
  });

  it('returns null for self-loop', () => {
    const { ctx } = tmpCtx();
    const store = createEdgeStore();
    const bridge = createEdgeBridge(store, ctx.edgesMap, ctx.doc);
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e1', { id: 'e1', fromId: 'a', toId: 'a', relationType: 'cause', createdAt: 1 });
    expect(bridge.swapEdgeDirection('e1')).toBeNull();
    bridge.destroy();
  });

  it('preserves id, relationType, createdAt', () => {
    const { ctx } = tmpCtx();
    const store = createEdgeStore();
    const bridge = createEdgeBridge(store, ctx.edgesMap, ctx.doc);
    ctx.thoughtsMap.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.thoughtsMap.set('b', { id: 'b', text: 'y', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesMap.set('e99', { id: 'e99', fromId: 'a', toId: 'b', relationType: 'sequence', createdAt: 12345 });
    const out = bridge.swapEdgeDirection('e99');
    expect(out.id).toBe('e99');
    expect(out.relationType).toBe('sequence');
    expect(out.createdAt).toBe(12345);
    bridge.destroy();
  });
});
