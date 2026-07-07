/**
 * [INPUT]: src/persistence/thought-bridge.js
 * [OUTPUT]: 验证 thoughtMap ↔ Y.Map('thoughts') 双向镜像
 * [POS]: tests/persistence 下,被 vitest 消费(用 Yjs 内存 doc)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import {
  createThoughtBridge
} from '../../src/persistence/thought-bridge.js';

function makeContext() {
  const doc = new Y.Doc();
  const yMap = doc.getMap('thoughts');
  const memMap = new Map();
  return { doc, yMap, memMap };
}

describe('thought-bridge', () => {
  it('imports thoughts from Y → memory', () => {
    const { doc, yMap, memMap } = makeContext();
    doc.transact(() => {
      yMap.set('t1', { id: 't1', text: 'hello', x: 1, y: 2, z: 3, mass: 1, temperature: 0.8 });
      yMap.set('t2', { id: 't2', text: 'world', x: 4, y: 5, z: 6, mass: 1, temperature: 0.5 });
    }, 'setup');
    const bridge = createThoughtBridge(memMap, yMap, doc);
    const imported = bridge.syncToStore();
    expect(imported).toBe(2);
    expect(memMap.has('t1')).toBe(true);
    expect(memMap.get('t1').text).toBe('hello');
    expect(memMap.get('t2').y).toBe(5);
    bridge.destroy();
  });

  it('removes memory entries no longer in Y', () => {
    const { doc, yMap, memMap } = makeContext();
    memMap.set('stale', { id: 'stale', text: 'old', x: 0, y: 0, z: 0, temperature: 1 });
    doc.transact(() => {
      yMap.set('fresh', { id: 'fresh', text: 'new', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'setup');
    const bridge = createThoughtBridge(memMap, yMap, doc);
    bridge.syncToStore();
    expect(memMap.has('stale')).toBe(false);
    expect(memMap.has('fresh')).toBe(true);
    bridge.destroy();
  });

  it('syncToDoc pushes memory changes into Y', () => {
    const { doc, yMap, memMap } = makeContext();
    memMap.set('a', { id: 'a', text: 'first', x: 10, y: 20, z: 30, temperature: 0.7, mass: 1 });
    const bridge = createThoughtBridge(memMap, yMap, doc);
    const written = bridge.syncToDoc();
    expect(written).toBe(1);
    expect(yMap.has('a')).toBe(true);
    const back = yMap.get('a');
    expect(back.text).toBe('first');
    expect(back.x).toBe(10);
    bridge.destroy();
  });

  it('syncToDoc is idempotent for unchanged data (no spurious writes)', () => {
    const { doc, yMap, memMap } = makeContext();
    memMap.set('a', { id: 'a', text: 'first', x: 1, y: 2, z: 3, temperature: 0.5, mass: 1 });
    const bridge = createThoughtBridge(memMap, yMap, doc);
    const w1 = bridge.syncToDoc();
    const w2 = bridge.syncToDoc();
    expect(w1).toBe(1);
    expect(w2).toBe(0);
    bridge.destroy();
  });

  it('updateOne detects changes and writes only when needed', () => {
    const { doc, yMap, memMap } = makeContext();
    const t = { id: 'a', text: 'first', x: 1, y: 2, z: 3, temperature: 0.5, mass: 1 };
    memMap.set('a', t);
    const bridge = createThoughtBridge(memMap, yMap, doc);
    bridge.updateOne(t);
    bridge.updateOne(t);
    expect(yMap.get('a').x).toBe(1);
    t.x = 99;
    bridge.updateOne(t);
    expect(yMap.get('a').x).toBe(99);
    bridge.destroy();
  });

  it('removes Y entry when memory entry is removed', () => {
    const { doc, yMap, memMap } = makeContext();
    doc.transact(() => {
      yMap.set('gone', { id: 'gone', text: 'remove me', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'setup');
    memMap.set('gone', { id: 'gone', text: 'remove me', x: 0, y: 0, z: 0, temperature: 1 });
    const bridge = createThoughtBridge(memMap, yMap, doc);
    memMap.delete('gone');
    const removed = bridge.syncToDoc();
    expect(removed).toBe(0);
    expect(yMap.has('gone')).toBe(false);
    bridge.destroy();
  });

  it('does not loop when one-way binding triggers', () => {
    const { doc, yMap, memMap } = makeContext();
    const t = { id: 'a', text: 'a1', x: 1, y: 2, z: 3, temperature: 0.5, mass: 1 };
    memMap.set('a', t);
    const bridge = createThoughtBridge(memMap, yMap, doc);
    const w = bridge.syncToDoc();
    expect(w).toBe(1);
    let observerFired = 0;
    const obs = () => { observerFired++; };
    yMap.observe(obs);
    bridge.syncToDoc();
    bridge.syncToDoc();
    expect(observerFired).toBe(0);
    yMap.unobserve(obs);
    bridge.destroy();
  });

  it('updates memory when Y is mutated externally (different origin)', () => {
    const { doc, yMap, memMap } = makeContext();
    const bridge = createThoughtBridge(memMap, yMap, doc);
    doc.transact(() => {
      yMap.set('b', { id: 'b', text: 'remote', x: 0, y: 0, z: 0, temperature: 0.5 });
    }, 'remote');
    expect(memMap.has('b')).toBe(true);
    expect(memMap.get('b').text).toBe('remote');
    bridge.destroy();
  });

  it('persists order field across sync', () => {
    const { doc, yMap, memMap } = makeContext();
    const t = { id: 'a', text: 'a', x: 0, y: 0, z: 0, temperature: 0.5, order: 42 };
    memMap.set('a', t);
    const bridge = createThoughtBridge(memMap, yMap, doc);
    bridge.syncToDoc();
    expect(yMap.get('a').order).toBe(42);
    bridge.destroy();
  });

  it('syncToStore imports order field from Y', () => {
    const { doc, yMap, memMap } = makeContext();
    doc.transact(() => {
      yMap.set('a', { id: 'a', text: 'a', x: 0, y: 0, z: 0, temperature: 0.5, order: 99 });
    }, 'setup');
    const bridge = createThoughtBridge(memMap, yMap, doc);
    bridge.syncToStore();
    expect(memMap.get('a').order).toBe(99);
    bridge.destroy();
  });
});
