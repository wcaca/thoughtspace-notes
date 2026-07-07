/**
 * [INPUT]: src/persistence/importer.js (parseImportString / validatePayload / applyImport)
 * [OUTPUT]: 验证 JSON 解析、schema 校验防御、applyImport 行为
 * [POS]: tests/persistence 下,被 vitest 消费(不依赖 DOM,纯逻辑)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  parseImportString, validatePayload, applyImport, __test__
} from '../../src/persistence/importer.js';
import { buildExportPayload } from '../../src/persistence/exporter.js';

function tmpContext() {
  const doc = new Y.Doc();
  return {
    doc,
    ctx: {
      thoughtsMap: doc.getMap('thoughts'),
      edgesMap: doc.getMap('edges'),
      doc
    }
  };
}

const sample = {
  schema: 1,
  exportedAt: 1700000000000,
  meta: { app: 'thoughtspace-notes' },
  thoughts: [
    { id: 'a', text: 'origin', x: 1, y: 2, z: 3, temperature: 0.5, labels: ['x'] },
    { id: 'b', text: 'next', x: 4, y: 5, z: 6, temperature: 0.7 }
  ],
  edges: [
    { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 }
  ]
};

describe('parseImportString', () => {
  it('parses valid JSON', () => {
    const out = parseImportString(JSON.stringify(sample));
    expect(out.ok).toBe(true);
    expect(out.payload.thoughts.length).toBe(2);
  });

  it('rejects empty', () => {
    expect(parseImportString('').ok).toBe(false);
    expect(parseImportString('   ').ok).toBe(false);
    expect(parseImportString(null).ok).toBe(false);
  });

  it('rejects invalid JSON', () => {
    const out = parseImportString('{not json');
    expect(out.ok).toBe(false);
    expect(out.error).toBe('invalid-json');
  });

  it('rejects missing-thoughts-array', () => {
    const bad = { ...sample, thoughts: 'not array' };
    const out = parseImportString(JSON.stringify(bad));
    expect(out.ok).toBe(false);
  });

  it('rejects thought without id', () => {
    const bad = JSON.parse(JSON.stringify(sample));
    bad.thoughts.push({ id: '', text: 'no id' });
    const out = parseImportString(JSON.stringify(bad));
    expect(out.ok).toBe(false);
  });

  it('rejects edge without fromId/toId', () => {
    const bad = JSON.parse(JSON.stringify(sample));
    bad.edges.push({ id: 'e2', fromId: 'a', toId: '', relationType: 'cause' });
    const out = parseImportString(JSON.stringify(bad));
    expect(out.ok).toBe(false);
  });
});

describe('validatePayload', () => {
  it('returns ok for valid payload', () => {
    expect(validatePayload(sample).ok).toBe(true);
  });

  it('returns error for non-object', () => {
    expect(validatePayload(null).ok).toBe(false);
    expect(validatePayload(undefined).ok).toBe(false);
    expect(validatePayload('string').ok).toBe(false);
  });
});

describe('applyImport', () => {
  it('merge mode: adds non-existing thoughts and edges', () => {
    const { ctx } = tmpContext();
    const out = applyImport(sample, ctx, { mode: 'merge' });
    expect(out.thoughtsImported).toBe(2);
    expect(out.edgesImported).toBe(1);
    expect(ctx.thoughtsMap.size).toBe(2);
    expect(ctx.edgesMap.size).toBe(1);
  });

  it('merge mode: skips existing ids (does not overwrite)', () => {
    const { ctx } = tmpContext();
    ctx.thoughtsMap.set('a', { id: 'a', text: 'ORIGINAL', x: 99, y: 99, z: 99, temperature: 0.1 });
    const out = applyImport(sample, ctx, { mode: 'merge' });
    expect(out.thoughtsImported).toBe(1);
    expect(out.skipped).toBe(1);
    expect(ctx.thoughtsMap.get('a').text).toBe('ORIGINAL');
  });

  it('replace mode: clears old thoughts and edges before importing', () => {
    const { ctx } = tmpContext();
    ctx.thoughtsMap.set('old', { id: 'old', text: 'old', x: 0, y: 0, z: 0, temperature: 0.5 });
    ctx.edgesMap.set('oldEdge', { id: 'oldEdge', fromId: 'old', toId: 'old', relationType: 'cause', createdAt: 1 });
    const out = applyImport(sample, ctx, { mode: 'replace' });
    expect(ctx.thoughtsMap.has('old')).toBe(false);
    expect(ctx.edgesMap.has('oldEdge')).toBe(false);
    expect(ctx.thoughtsMap.size).toBe(2);
  });

  it('skips edges referencing missing thoughts (merge case)', () => {
    const { ctx } = tmpContext();
    const bad = JSON.parse(JSON.stringify(sample));
    bad.edges.push({ id: 'orphanEdge', fromId: 'a', toId: 'never-existed', relationType: 'cause' });
    const out = applyImport(bad, ctx, { mode: 'merge' });
    expect(out.edgesImported).toBe(1);
    expect(out.skipped).toBeGreaterThanOrEqual(1);
    expect(ctx.edgesMap.has('orphanEdge')).toBe(false);
  });

  it('clamps non-numeric coordinates', () => {
    const { ctx } = tmpContext();
    const bad = JSON.parse(JSON.stringify(sample));
    bad.thoughts.push({ id: 'broken', text: 'broken', x: 'not-a-number', y: undefined, z: NaN, temperature: null });
    const out = applyImport(bad, ctx, { mode: 'merge' });
    const stored = ctx.thoughtsMap.get('broken');
    expect(stored).toBeDefined();
    expect(Number.isFinite(stored.x)).toBe(true);
    expect(Number.isFinite(stored.y)).toBe(true);
    expect(Number.isFinite(stored.z)).toBe(true);
    expect(Number.isFinite(stored.temperature)).toBe(true);
  });

  it('handles empty payload', () => {
    const { ctx } = tmpContext();
    const out = applyImport({ thoughts: [], edges: [] }, ctx, { mode: 'merge' });
    expect(out.thoughtsImported).toBe(0);
    expect(out.edgesImported).toBe(0);
  });

  it('null payload returns 0 stats safely', () => {
    const out = applyImport(null, null, { mode: 'merge' });
    expect(out.thoughtsImported).toBe(0);
    expect(out.edgesImported).toBe(0);
  });

  it('full roundtrip export → import preserves data fidelity', () => {
    const { ctx } = tmpContext();
    const thoughts = [
      { id: 'a', text: 'hello', x: 1, y: 2, z: 3, temperature: 0.5, labels: ['x'], createdAt: 1, lastInteractionAt: 1, colorTag: 'clarity' },
      { id: 'b', text: 'world', x: 4, y: 5, z: 6, temperature: 0.7 }
    ];
    const edges = [{ id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 }];
    const exported = buildExportPayload({ thoughts, edges });
    const json = JSON.stringify(exported);
    const parsed = parseImportString(json);
    expect(parsed.ok).toBe(true);
    const result = applyImport(parsed.payload, ctx, { mode: 'merge' });
    expect(result.thoughtsImported).toBe(2);
    expect(ctx.thoughtsMap.get('a').labels).toEqual(['x']);
    expect(ctx.thoughtsMap.get('b').temperature).toBe(0.7);
  });
});

describe('__test__ surface', () => {
  it('exports test-friendly helpers', () => {
    expect(__test__.parseImportString).toBe(parseImportString);
    expect(__test__.applyImport).toBe(applyImport);
  });
});
