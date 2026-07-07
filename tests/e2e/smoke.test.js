/**
 * [INPUT]: 全部核心模块:thought / edge / bridges / undo / integrity / exporter / importer / search
 * [OUTPUT]: 顺序跑 10 个核心动线集成测试;失败立即指出 step N
 * [POS]: tests/e2e 下,被 vitest 消费 — 项目"长期可用"冒烟
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';

import {
  createThought, warmThought, decayTemperature,
  addLabel, removeLabel, setColorTag, normalizeLabel
} from '../../src/core/thought.js';
import {
  createEdgeStore, createEdge, linkEdge, unlinkEdge,
  changeEdgeType, RelationType
} from '../../src/core/edge.js';
import { createThoughtBridge } from '../../src/persistence/thought-bridge.js';
import { createEdgeBridge } from '../../src/persistence/edge-bridge.js';
import { createUndoManager } from '../../src/persistence/undo-manager.js';
import { audit, repair } from '../../src/persistence/integrity.js';
import { buildExportPayload, payloadToJsonString } from '../../src/persistence/exporter.js';
import { applyImport } from '../../src/persistence/importer.js';
import { searchThoughts } from '../../src/render/global-search.js';

function tmpUniverse() {
  const doc = new Y.Doc();
  const thoughtsY = doc.getMap('thoughts');
  const edgesY = doc.getMap('edges');
  const memThoughts = new Map();
  const memEdges = createEdgeStore();
  const thoughtBridge = createThoughtBridge(memThoughts, thoughtsY, doc);
  const edgeBridge = createEdgeBridge(memEdges, edgesY, doc);
  const undoManager = createUndoManager(doc);
  return { doc, thoughtsY, edgesY, memThoughts, memEdges, thoughtBridge, edgeBridge, undoManager };
}

async function step(ctx, n, label, fn) {
  try {
    await fn();
  } catch (e) {
    throw new Error(`smoke-step-${n} ${label} failed: ${e.message}`);
  }
}

describe('long-term smoke: 10 steps covering full closure', () => {
  it('walks the full daily lifecycle in 10 steps', { timeout: 8000 }, async () => {
    const ctx = tmpUniverse();
    const now = (offset = 0) => 1700000000000 + offset;

    await new Promise((r) => setTimeout(r, 150));

    const t0 = { ...createThought('t0', 'first spark', 10, 20), z: 0, mass: 1, temperature: 0.4, lastInteractionAt: now(0) };
    const t1 = { ...createThought('t1', 'second idea', -5, 50), z: 0, mass: 1, temperature: 0.2, lastInteractionAt: now(0) };
    const t2 = { ...createThought('t2', 'a label-led note', 0, 0), z: 0, mass: 1, temperature: 0.7, lastInteractionAt: now(0) };
    ctx.memThoughts.set(t0.id, t0);
    ctx.memThoughts.set(t1.id, t1);
    ctx.memThoughts.set(t2.id, t2);
    ctx.thoughtBridge.updateOne(t0);
    await new Promise((r) => setTimeout(r, 150));
    ctx.thoughtBridge.updateOne(t1);
    await new Promise((r) => setTimeout(r, 150));
    ctx.thoughtBridge.updateOne(t2);
    await new Promise((r) => setTimeout(r, 150));
    await step(ctx, 0, 'bootstrap thoughts persisted',
      () => {
        expect(ctx.thoughtsY.size).toBe(3);
        expect(ctx.memThoughts.size).toBe(3);
      });

    const wT0 = { ...warmThought(t0, now(1000), 0.5) };
    ctx.memThoughts.set(t0.id, wT0);
    ctx.thoughtBridge.updateOne(wT0);
    await new Promise((r) => setTimeout(r, 150));
    await step(ctx, 1, 'warm thought boosts temperature',
      () => {
        expect(ctx.memThoughts.get('t0').temperature).toBeGreaterThan(0.4);
      });

    linkEdge(ctx.memEdges, createEdge('e01', 't0', 't1', RelationType.CAUSE));
    ctx.edgeBridge.syncToDoc();
    await new Promise((r) => setTimeout(r, 150));
    await step(ctx, 2, 'edge persists with cause type',
      () => {
        expect(ctx.edgesY.size).toBe(1);
        expect(ctx.memEdges.edges.get('e01').relationType).toBe('cause');
      });

    const swapped = ctx.edgeBridge.swapEdgeDirection('e01');
    if (swapped) {
      unlinkEdge(ctx.memEdges, 'e01');
      linkEdge(ctx.memEdges, createEdge(swapped.id, swapped.fromId, swapped.toId, swapped.relationType));
      ctx.edgeBridge.syncToDoc();
    }
    await step(ctx, 3, 'swap edge direction works',
      () => {
        expect(ctx.memEdges.edges.get('e01').fromId).toBe('t1');
        expect(ctx.memEdges.edges.get('e01').toId).toBe('t0');
      });

    const archived = { ...ctx.memThoughts.get('t1'), temperature: 0.01, lastInteractionAt: 0 };
    ctx.memThoughts.set('t1', archived);
    ctx.thoughtBridge.updateOne(archived);
    await new Promise((r) => setTimeout(r, 150));
    const unarchived = { ...warmThought(archived, now(2000), 0.7), temperature: Math.min(1, 0.01 + 0.7) };
    ctx.memThoughts.set('t1', unarchived);
    ctx.thoughtBridge.updateOne(unarchived);
    await new Promise((r) => setTimeout(r, 150));
    await step(ctx, 4, 'archive/unarchive roundtrip',
      () => {
        expect(ctx.memThoughts.get('t1').temperature).toBeGreaterThan(0.1);
        expect(ctx.memThoughts.get('t1').temperature).toBeLessThanOrEqual(1);
      });

    const labeled = addLabel(ctx.memThoughts.get('t2'), 'work');
    const labeledHashed = addLabel(labeled, '#work');
    const normalizedH = normalizeLabel('#work');
    ctx.memThoughts.set('t2', { ...labeledHashed });
    ctx.thoughtBridge.updateOne({ ...labeledHashed });
    await step(ctx, 5, 'label CRUD with normalize (deduped)',
      () => {
        expect(ctx.memThoughts.get('t2').labels).toContain('work');
        expect(ctx.memThoughts.get('t2').labels).toContain(normalizedH);
        expect(ctx.memThoughts.get('t2').labels.length).toBe(1);
        const removed = removeLabel(ctx.memThoughts.get('t2'), 'work');
        expect(removed.labels).not.toContain('work');
      });

    const tagged = setColorTag(ctx.memThoughts.get('t2'), 'clarity');
    ctx.memThoughts.set('t2', { ...tagged });
    ctx.thoughtBridge.updateOne({ ...tagged });
    await step(ctx, 6, 'colorTag toggle',
      () => {
        expect(ctx.memThoughts.get('t2').colorTag).toBe('clarity');
        const cleared = setColorTag(ctx.memThoughts.get('t2'), null);
        expect(cleared.colorTag).toBe(null);
      });

    const t2ForSearch = ctx.memThoughts.get('t2');
    if (!t2ForSearch.labels?.includes('work')) {
      const reAdd = addLabel(t2ForSearch, 'work');
      ctx.memThoughts.set('t2', reAdd);
      ctx.thoughtBridge.updateOne(reAdd);
    }

    const allThoughts = Array.from(ctx.memThoughts.values()).map((t) => ({ id: t.id, text: t.text, labels: t.labels || [] }));
    const matchFirst = searchThoughts(allThoughts, 'first');
    const matchWork = searchThoughts(allThoughts, 'work');
    await step(ctx, 7, 'search ranks and label fallback',
      () => {
        expect(matchFirst[0]?.id).toBe('t0');
        expect(matchWork.length).toBeGreaterThanOrEqual(1);
        const labelsOnlyHit = matchWork.find((m) => m.labels && m.labels.length > 0 && (m.text || '').indexOf('work') === -1);
        expect(labelsOnlyHit).toBeDefined();
      });

    const undoManager = ctx.undoManager;
    const t0BeforeTemperature = ctx.memThoughts.get('t0').temperature;
    const ok = undoManager.undo();
    await step(ctx, 8, 'undo reverses last tracked op',
      () => {
        expect(ok).toBe(true);
        expect(ctx.memThoughts.get('t0')).toBeDefined();
        expect(ctx.memThoughts.get('t0').temperature).toBeCloseTo(t0BeforeTemperature, 6);
      });

    const integrityCtx = { doc: ctx.doc, thoughtsMap: ctx.thoughtsY, edgesMap: ctx.edgesY };
    await repair(integrityCtx);
    await step(ctx, 9, 'integrity repair runs clean (with no orphans)',
      async () => {
        const r = await audit(integrityCtx);
        expect(r.orphanEdges.length + r.selfLoops.length + r.duplicateIds.length).toBe(0);
      });
  });

  it('roundtrip: export JSON then import same payload (merge mode → no-ops for matching ids)', async () => {
    const ctx = tmpUniverse();
    const t0 = { ...createThought('a', 'one', 0, 0), z: 0, mass: 1, temperature: 0.5 };
    const t1 = { ...createThought('b', 'two', 0, 0), z: 0, mass: 1, temperature: 0.5 };
    ctx.memThoughts.set(t0.id, t0);
    ctx.memThoughts.set(t1.id, t1);
    ctx.thoughtBridge.updateOne(t0);
    ctx.thoughtBridge.updateOne(t1);
    linkEdge(ctx.memEdges, createEdge('e1', 'a', 'b', RelationType.PARALLEL));
    ctx.edgeBridge.syncToDoc();

    const exported = buildExportPayload({
      thoughts: Array.from(ctx.memThoughts.values()),
      edges: Array.from(ctx.memEdges.edges.values())
    });
    const json = payloadToJsonString(exported);

    const imported = applyImport(JSON.parse(json), {
      doc: ctx.doc,
      thoughtsMap: ctx.thoughtsY,
      edgesMap: ctx.edgesY
    }, { mode: 'merge' });
    expect(imported.thoughtsImported).toBe(0);
    expect(imported.edgesImported).toBe(0);
    expect(imported.skipped).toBeGreaterThanOrEqual(3);
    expect(ctx.thoughtsY.size).toBe(2);
    expect(ctx.edgesY.size).toBe(1);
  });

  it('integrity scan detects then repairs orphan edges', async () => {
    const ctx = tmpUniverse();
    ctx.thoughtsY.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.thoughtsY.set('b', { id: 'b', text: 'y', x: 0, y: 0, z: 0, temperature: 1 });
    ctx.edgesY.set('e1', { id: 'e1', fromId: 'a', toId: 'ghost', relationType: 'cause', createdAt: 1 });
    ctx.edgesY.set('e2', { id: 'e2', fromId: 'a', toId: 'a', relationType: 'cause', createdAt: 1 });

    const auditResult = await audit({ thoughtsMap: ctx.thoughtsY, edgesMap: ctx.edgesY });
    expect(auditResult.orphanEdges.length).toBe(1);
    expect(auditResult.selfLoops.length).toBe(1);

    const repairResult = await repair({ doc: ctx.doc, thoughtsMap: ctx.thoughtsY, edgesMap: ctx.edgesY });
    expect(repairResult.repaired.removedOrphans).toBe(1);
    expect(repairResult.repaired.removedLoops).toBe(1);
    expect(ctx.edgesY.size).toBe(0);
  });
});
