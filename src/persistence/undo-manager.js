/**
 * [INPUT]: src/persistence/yjs-store(全局 doc 提供) + yjs(Y.UndoManager)
 * [OUTPUT]: createUndoManager(doc, opts) → { undo(), redo(), canUndo(), canRedo(), destroy(), getManager(), onChange(cb) }
 * [POS]: src/persistence 下 — 应用层 UndoManager 包装;trackOrigins 只放 bridge / importer,不递归纳入 undo/redo 自身
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as Y from 'yjs';

const DEFAULT_TRACKED_ORIGINS = new Set([
  'thought-bridge',
  'edge-bridge',
  'importer',
  'bulk-action'
]);

const DEFAULT_MERGE_WINDOW_MS = 100;

export function createUndoManager(doc, opts = {}) {
  if (!doc || typeof doc.transact !== 'function') {
    throw new Error('createUndoManager requires a Y.Doc instance');
  }
  const trackedOrigins = new Set((opts.trackedOrigins || Array.from(DEFAULT_TRACKED_ORIGINS)));
  const mergeWindowMs = opts.mergeWindowMs != null ? opts.mergeWindowMs : DEFAULT_MERGE_WINDOW_MS;

  const undoManager = new Y.UndoManager(
    Array.isArray(opts.types) ? opts.types : [doc.getMap('thoughts'), doc.getMap('edges')],
    {
      trackedOrigins,
      captureTimeout: mergeWindowMs,
      captureTransaction: opts.captureTransaction
    }
  );

  const subs = new Set();

  function notifyChange() {
    for (const cb of subs) {
      try {
        cb({
          canUndo: undoManager.undoStack.length > 0,
          canRedo: undoManager.redoStack.length > 0
        });
      } catch (e) {}
    }
  }

  const onStackItemAdd = () => notifyChange();
  const onStackItemPop = () => notifyChange();
  undoManager.on('stack-item-added', onStackItemAdd);
  undoManager.on('stack-item-popped', onStackItemPop);
  undoManager.on('stack-cleared', notifyChange);

  function undo() {
    if (undoManager.undoStack.length === 0) return false;
    undoManager.undo();
    return true;
  }

  function redo() {
    if (undoManager.redoStack.length === 0) return false;
    undoManager.redo();
    return true;
  }

  function canUndo() {
    return undoManager.undoStack.length > 0;
  }

  function canRedo() {
    return undoManager.redoStack.length > 0;
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    subs.add(cb);
    setTimeout(notifyChange, 0);
    return () => subs.delete(cb);
  }

  function clear() {
    undoManager.clear();
  }

  function getManager() {
    return undoManager;
  }

  function destroy() {
    undoManager.off('stack-item-added', onStackItemAdd);
    undoManager.off('stack-item-popped', onStackItemPop);
    undoManager.off('stack-cleared', notifyChange);
    undoManager.destroy();
    subs.clear();
  }

  return {
    undo,
    redo,
    canUndo,
    canRedo,
    onChange,
    clear,
    destroy,
    getManager,
    constants: {
      trackedOrigins: Array.from(trackedOrigins),
      mergeWindowMs
    }
  };
}

export const __test__ = {
  DEFAULT_TRACKED_ORIGINS,
  DEFAULT_MERGE_WINDOW_MS
};
