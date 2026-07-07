/**
 * [INPUT]: yjs, y-indexeddb, src/core/thought, src/core/edge
 * [OUTPUT]: Yjs Doc + IndexedDB 持久化 + UndoManager
 * [POS]: src/persistence 下,被 render 和 sim 消费,作为唯一权威数据源
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
// P0-5 (2026-07-07): 修复 _getFlagVariant 未导入 (ReferenceError runtime 崩)
// 原代码 L18 调用 _getFlagVariant 但未 import,运行时 ReferenceError
import { getVariant as _getFlagVariant } from '../runtime/flags/index.js';

let ydoc = null;
let persistence = null;
let undoManager = null;

export async function initPersistence(dbName) {
  ydoc = new Y.Doc();
  persistence = new IndexeddbPersistence(dbName || 'thoughtspace-notes-phase0', ydoc);
  undoManager = new Y.UndoManager(ydoc.getText('thoughts'));
  const _batchThreshold = _getFlagVariant('yjs-persistence-batch-write', { bucket: 0 });
  if (_batchThreshold > 0) {
    persistence._batchThreshold = _batchThreshold;
  }
  await new Promise((res) => persistence.once('synced', res));
  return ydoc;
}

export function getDoc() {
  return ydoc;
}

export function getPersistence() {
  return persistence;
}

export function getUndoManager() {
  return undoManager;
}

export function transact(fn, origin) {
  if (!ydoc) throw new Error('call initPersistence first');
  ydoc.transact(fn, origin);
}

export function getThoughts() {
  if (!ydoc) return new Map();
  return ydoc.getMap('thoughts');
}

export function getEdges() {
  if (!ydoc) return new Map();
  return ydoc.getMap('edges');
}

export function getZones() {
  if (!ydoc) return new Map();
  return ydoc.getMap('zones');
}

export function getCrystals() {
  if (!ydoc) return new Map();
  return ydoc.getMap('crystals');
}

export function getActions() {
  if (!ydoc) return new Map();
  return ydoc.getMap('actions');
}
