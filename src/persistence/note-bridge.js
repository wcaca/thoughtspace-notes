/**
 * Note Yjs 桥接
 * [INPUT]: Yjs doc
 * [OUTPUT]: notes Map + loadSeedIfEmpty()
 * [POS]: src/persistence/note-bridge.js — Note 的持久化层
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { SEED_NOTES } from '../core/note.js';

export function getNotesMap(ydoc) {
  return ydoc.getMap('notes');
}

export function loadSeedIfEmpty(ydoc) {
  const notes = getNotesMap(ydoc);
  if (notes.size > 0) return;
  for (const note of SEED_NOTES) {
    notes.set(note.id, note);
  }
}

export function addNote(ydoc, note) {
  const notes = getNotesMap(ydoc);
  notes.set(note.id, note);
}