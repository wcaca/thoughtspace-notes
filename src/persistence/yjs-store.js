/**
 * [INPUT]: yjs, y-indexeddb, src/core/thought, src/core/edge
 * [OUTPUT]: Yjs Doc + IndexedDB 持久化 + UndoManager
 * [POS]: src/persistence 下,被 render 和 sim 消费,作为唯一权威数据源
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';

let ydoc = null;
let persistence = null;
let undoManager = null;

export async function initPersistence(dbName) {
  ydoc = new Y.Doc();
  persistence = new IndexeddbPersistence(dbName || 'thoughtspace-notes-phase0', ydoc);
  undoManager = new Y.UndoManager(ydoc.getText('thoughts'));
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
