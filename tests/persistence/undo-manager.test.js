/**
 * [INPUT]: src/persistence/undo-manager.js + yjs
 * [OUTPUT]: 验证 undo / redo / 可达性 / 多笔合并 / origin 过滤
 * [POS]: tests/persistence 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createUndoManager } from '../../src/persistence/undo-manager.js';

function tmpDoc() {
  const doc = new Y.Doc();
  return {
    doc,
    thoughts: doc.getMap('thoughts'),
    edges: doc.getMap('edges')
  };
}

describe('createUndoManager', () => {
  it('throws when no doc is given', () => {
    expect(() => createUndoManager(null)).toThrow();
    expect(() => createUndoManager(undefined)).toThrow();
  });

  it('returns wrapper with undo / redo / canUndo / canRedo', () => {
    const { doc } = tmpDoc();
    const um = createUndoManager(doc);
    expect(typeof um.undo).toBe('function');
    expect(typeof um.redo).toBe('function');
    expect(typeof um.canUndo).toBe('function');
    expect(typeof um.canRedo).toBe('function');
    expect(typeof um.destroy).toBe('function');
    um.destroy();
  });

  it('starts with no undoable history', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc);
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'hi', x: 0, y: 0, z: 0, temperature: 1 }); }, 'noop-origin');
    expect(um.canUndo()).toBe(false);

    doc.transact(() => { thoughts.set('b', { id: 'b', text: 'bye', x: 0, y: 0, z: 0, temperature: 1 }); }, 'thought-bridge');
    expect(um.canUndo()).toBe(true);
    um.destroy();
  });

  it('captures and undoes a single thought-bridge op', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc);
    doc.transact(() => {
      thoughts.set('a', { id: 'a', text: 'first', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'thought-bridge');
    expect(thoughts.has('a')).toBe(true);
    expect(um.canUndo()).toBe(true);

    const ok = um.undo();
    expect(ok).toBe(true);
    expect(thoughts.has('a')).toBe(false);
    expect(um.canRedo()).toBe(true);
    um.destroy();
  });

  it('redo restores the undone op', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc);
    doc.transact(() => {
      thoughts.set('a', { id: 'a', text: 'first', x: 1, y: 2, z: 3, temperature: 1 });
    }, 'thought-bridge');
    um.undo();
    expect(thoughts.has('a')).toBe(false);
    um.redo();
    expect(thoughts.has('a')).toBe(true);
    expect(thoughts.get('a').x).toBe(1);
    um.destroy();
  });

  it('tracks both thoughts and edges together (captureTimeout may merge)', () => {
    const { doc, thoughts, edges } = tmpDoc();
    const um = createUndoManager(doc);
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 }); }, 'thought-bridge');
    doc.transact(() => { edges.set('e1', { id: 'e1', fromId: 'a', toId: 'b', relationType: 'cause', createdAt: 1 }); }, 'edge-bridge');
    expect(um.canUndo()).toBe(true);
    um.undo();
    expect(edges.has('e1')).toBe(false);
    expect(thoughts.has('a')).toBe(false);
    um.destroy();
  });

  it('merge window coalesces rapid ops into one stack item', async () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc, { mergeWindowMs: 2000 });
    doc.transact(() => {
      thoughts.set('a', { id: 'a', text: '1', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'thought-bridge');
    await new Promise((r) => setTimeout(r, 50));
    doc.transact(() => {
      const t = thoughts.get('a');
      thoughts.set('a', { ...t, x: 10 });
    }, 'thought-bridge');
    await new Promise((r) => setTimeout(r, 50));
    doc.transact(() => {
      const t = thoughts.get('a');
      thoughts.set('a', { ...t, x: 20 });
    }, 'thought-bridge');
    await new Promise((r) => setTimeout(r, 50));
    const sizeBefore = um.getManager().undoStack.length;
    expect(sizeBefore).toBe(1);
    um.undo();
    expect(thoughts.has('a')).toBe(false);
    um.destroy();
  });

  it('separate ops with gap beyond merge window become multiple stack items', async () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc, { mergeWindowMs: 50 });
    doc.transact(() => {
      thoughts.set('a', { id: 'a', text: '1', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'thought-bridge');
    await new Promise((r) => setTimeout(r, 200));
    doc.transact(() => {
      thoughts.set('b', { id: 'b', text: '2', x: 0, y: 0, z: 0, temperature: 1 });
    }, 'thought-bridge');
    expect(um.getManager().undoStack.length).toBe(2);
    um.destroy();
  });

  it('clear empties undo and redo stacks', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc);
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 }); }, 'thought-bridge');
    expect(um.canUndo()).toBe(true);
    um.undo();
    expect(um.canRedo()).toBe(true);
    um.clear();
    expect(um.canUndo()).toBe(false);
    expect(um.canRedo()).toBe(false);
    um.destroy();
  });

  it('onChange callback fires after stack updates', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc);
    let lastCanUndo = null;
    let lastCanRedo = null;
    const off = um.onChange((s) => {
      lastCanUndo = s.canUndo;
      lastCanRedo = s.canRedo;
    });
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 }); }, 'thought-bridge');
    return new Promise((resolve) => setTimeout(() => {
      expect(lastCanUndo).toBe(true);
      um.undo();
      setTimeout(() => {
        expect(lastCanRedo).toBe(true);
        off();
        um.destroy();
        resolve();
      }, 60);
    }, 30));
  });

  it('undo returns false when no stack', () => {
    const { doc } = tmpDoc();
    const um = createUndoManager(doc);
    expect(um.undo()).toBe(false);
    expect(um.redo()).toBe(false);
    um.destroy();
  });

  it('stack grows unbounded by default (no implicit cap)', async () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc, { mergeWindowMs: 50 });
    for (let i = 0; i < 10; i++) {
      doc.transact(() => {
        thoughts.set(`t${i}`, { id: `t${i}`, text: `${i}`, x: 0, y: 0, z: 0, temperature: 1 });
      }, 'thought-bridge');
      if (i < 9) await new Promise((r) => setTimeout(r, 70));
    }
    const m = um.getManager();
    expect(m.undoStack.length).toBeGreaterThanOrEqual(8);
    um.destroy();
  });

  it('tracks custom origins', () => {
    const { doc, thoughts } = tmpDoc();
    const um = createUndoManager(doc, { trackedOrigins: ['my-origin'] });
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'x', x: 0, y: 0, z: 0, temperature: 1 }); }, 'thought-bridge');
    expect(um.canUndo()).toBe(false);
    doc.transact(() => { thoughts.set('a', { id: 'a', text: 'y', x: 1, y: 0, z: 0, temperature: 1 }); }, 'my-origin');
    expect(um.canUndo()).toBe(true);
    um.destroy();
  });
});
