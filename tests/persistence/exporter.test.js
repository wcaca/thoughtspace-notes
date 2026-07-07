/**
 * [INPUT]: src/persistence/exporter.js
 * [OUTPUT]: 验证 payload + JSON + Markdown 三态正确
 * [POS]: tests/persistence 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import {
  buildExportPayload, payloadToJsonString, payloadToMarkdown, suggestFilename
} from '../../src/persistence/exporter.js';

function TT(id, text, extras = {}) {
  return {
    id,
    text: text || '',
    x: extras.x ?? 0,
    y: extras.y ?? 0,
    z: extras.z ?? 0,
    mass: extras.mass ?? 1,
    temperature: extras.temperature ?? 0.5,
    colorTag: extras.colorTag ?? null,
    labels: extras.labels ?? [],
    createdAt: extras.createdAt ?? Date.now(),
    lastInteractionAt: extras.lastInteractionAt ?? Date.now()
  };
}

function EE(id, from, to, type, createdAt) {
  return { id, fromId: from, toId: to, relationType: type, createdAt: createdAt || Date.now() };
}

describe('buildExportPayload', () => {
  it('shapes thoughts and edges with schema/version', () => {
    const thoughts = [TT('a', 'hello', { temperature: 0.7, labels: ['work'] }), TT('b', 'world', { colorTag: 'warmth' })];
    const edges = [EE('e1', 'a', 'b', 'cause')];
    const p = buildExportPayload({ thoughts, edges });
    expect(p.schema).toBe(1);
    expect(p.thoughts.length).toBe(2);
    expect(p.edges.length).toBe(1);
    expect(p.meta.thoughtCount).toBe(2);
    expect(p.meta.edgeCount).toBe(1);
  });

  it('accepts Map-like and array inputs', () => {
    const tmap = new Map();
    tmap.set('a', TT('a', 'hi'));
    const p = buildExportPayload({ thoughts: tmap, edges: [] });
    expect(p.thoughts.length).toBe(1);
    expect(p.thoughts[0].id).toBe('a');
  });

  it('drops thoughts without id and edges missing fields', () => {
    const thoughts = [{ id: '', text: 'no id' }, TT('a', 'good')];
    const edges = [{ id: 'e1', fromId: '', toId: 'a' }, EE('e2', 'a', 'good', 'cause')];
    const p = buildExportPayload({ thoughts, edges });
    expect(p.thoughts.find((t) => t.id === 'a')).toBeDefined();
    expect(p.thoughts.find((t) => t.id === '')).toBeUndefined();
    expect(p.edges.length).toBe(1);
  });

  it('preserves empty label/colorTag arrays vs missing', () => {
    const t = TT('a', 'x', { colorTag: null, labels: [] });
    const p = buildExportPayload({ thoughts: [t], edges: [] });
    expect(p.thoughts[0]).not.toHaveProperty('labels');
    expect(p.thoughts[0]).not.toHaveProperty('colorTag');
  });

  it('attaches custom meta fields', () => {
    const p = buildExportPayload({ thoughts: [], edges: [], meta: { source: 'manual' } });
    expect(p.meta.source).toBe('manual');
  });
});

describe('payloadToJsonString', () => {
  it('round-trips through JSON', () => {
    const p = buildExportPayload({ thoughts: [TT('a', 'hello')], edges: [EE('e1', 'a', 'a', 'cause')] });
    const s = payloadToJsonString(p);
    const back = JSON.parse(s);
    expect(back.thoughts[0].text).toBe('hello');
  });
});

describe('payloadToMarkdown', () => {
  it('includes thought list sorted by temperature desc', () => {
    const thoughts = [
      TT('cold', 'cold one', { temperature: 0.2 }),
      TT('hot', 'hot one', { temperature: 0.9 }),
      TT('warm', 'warm one', { temperature: 0.5 })
    ];
    const p = buildExportPayload({ thoughts, edges: [] });
    const md = payloadToMarkdown(p);
    expect(md).toContain('念头列表');
    expect(md).toContain('hot one');
    expect(md).toContain('cold one');
    const hotIdx = md.indexOf('hot one');
    const coldIdx = md.indexOf('cold one');
    expect(hotIdx).toBeLessThan(coldIdx);
  });

  it('includes labels as #hash', () => {
    const t = TT('a', 'idea', { labels: ['灵感', '工作'] });
    const p = buildExportPayload({ thoughts: [t], edges: [] });
    const md = payloadToMarkdown(p);
    expect(md).toContain('#灵感');
    expect(md).toContain('#工作');
  });

  it('emits a mermaid graph with edges', () => {
    const p = buildExportPayload({
      thoughts: [TT('a', 'origin'), TT('b', 'next')],
      edges: [EE('e1', 'a', 'b', 'sequence')]
    });
    const md = payloadToMarkdown(p);
    expect(md).toContain('```mermaid');
    expect(md).toContain('graph LR');
    expect(md).toContain('|时序|');
  });

  it('skips orphan edges in mermaid section', () => {
    const p = buildExportPayload({
      thoughts: [TT('a', 'first')],
      edges: [EE('e1', 'a', 'orphan', 'cause')]
    });
    const md = payloadToMarkdown(p);
    expect(md).toContain('graph LR');
    expect(md).not.toContain('orphan');
  });

  it('renders colorTag inline', () => {
    const t = TT('a', 'f', { colorTag: 'clarity' });
    const p = buildExportPayload({ thoughts: [t], edges: [] });
    const md = payloadToMarkdown(p);
    expect(md).toMatch(/情绪:clarity/);
  });

  it('handles null and empty input gracefully', () => {
    expect(payloadToMarkdown(null)).toBe('');
    const md = payloadToMarkdown({ thoughts: [], edges: [], meta: { app: 'x' }, exportedAt: 1 });
    expect(typeof md).toBe('string');
    expect(md.length).toBeGreaterThan(50);
  });
});

describe('suggestFilename', () => {
  it('produces markdown filename', () => {
    const f = suggestFilename('markdown', { thoughts: [{}, {}, {}] });
    expect(f.endsWith('.md')).toBe(true);
    expect(f).toContain('3items');
  });

  it('produces json filename with timestamp', () => {
    const f = suggestFilename('json', { thoughts: [{ id: 'a' }, { id: 'b' }] });
    expect(f.endsWith('.json')).toBe(true);
    expect(f).toContain('2items');
  });

  it('produces sensible default even with empty payload', () => {
    const f = suggestFilename('json', null);
    expect(f.endsWith('.json')).toBe(true);
  });
});
