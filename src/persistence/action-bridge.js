/**
 * [INPUT]: src/core/action, src/persistence/yjs-store(getActions)
 * [OUTPUT]: createActionBridge(memoryMap, yMap, doc) → { syncToStore, syncToDoc, updateOne, removeOne, destroy }; 与 thought-bridge 同模式
 * [POS]: src/persistence 下 — memory action Map ↔ Y.Map('actions') 双向镜像桥
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const ORIGIN = 'action-bridge';
const META_FIELDS = ['id', 'title', 'sourceThoughtIds', 'status', 'dueDate', 'createdAt', 'completedAt'];

export function createActionBridge(memoryMap, yMap, doc) {
  if (!memoryMap) throw new Error('action-bridge requires a memoryMap (Map)');
  if (!yMap) throw new Error('action-bridge requires a Y.Map');

  let suppressFromDoc = false;

  function toPlain(action) {
    if (!action) return null;
    const out = {};
    for (const k of META_FIELDS) {
      if (k in action) out[k] = action[k];
    }
    return out;
  }

  function applyToMemory(a) {
    if (!a || !a.id) return;
    const existing = memoryMap.get(a.id);
    if (existing) {
      for (const k of META_FIELDS) {
        if (k in a) existing[k] = a[k];
      }
    } else {
      memoryMap.set(a.id, { ...a });
    }
  }

  function transactIfPossible(fn) {
    if (doc && typeof doc.transact === 'function') {
      doc.transact(fn, ORIGIN);
    } else {
      fn();
    }
  }

  function hasDiff(prev, next) {
    for (const k of META_FIELDS) {
      if (k === 'sourceThoughtIds') {
        const a = JSON.stringify(prev.sourceThoughtIds || []);
        const b = JSON.stringify(next.sourceThoughtIds || []);
        if (a !== b) return true;
        continue;
      }
      if (prev[k] !== next[k]) return true;
    }
    return false;
  }

  function syncToStore() {
    if (!yMap) return 0;
    let imported = 0;
    yMap.forEach((value, id) => {
      if (!value || !value.id) return;
      applyToMemory(value);
      imported++;
    });
    for (const id of Array.from(memoryMap.keys())) {
      if (!yMap.has(id)) memoryMap.delete(id);
    }
    return imported;
  }

  function syncToDoc() {
    if (!yMap) return 0;
    let written = 0;
    transactIfPossible(() => {
      memoryMap.forEach((action) => {
        if (!action || !action.id) return;
        const plain = toPlain(action);
        const cur = yMap.get(action.id);
        if (!cur || hasDiff(cur, plain)) {
          yMap.set(action.id, plain);
          written++;
        }
      });
      for (const id of Array.from(yMap.keys())) {
        if (!memoryMap.has(id)) yMap.delete(id);
      }
    });
    return written;
  }

  function updateOne(action) {
    if (!action || !action.id) return;
    const plain = toPlain(action);
    transactIfPossible(() => {
      const cur = yMap.get(action.id);
      if (!cur || hasDiff(cur, plain)) {
        yMap.set(action.id, plain);
      }
    });
  }

  function removeOne(id) {
    if (!id) return;
    transactIfPossible(() => { yMap.delete(id); });
  }

  function onYMapChange(yEvent, transaction) {
    if (suppressFromDoc) return;
    if (transaction && transaction.origin === ORIGIN) return;
    const changedKeys = (yEvent && yEvent.keysChanged) || null;
    if (!changedKeys) return;
    suppressFromDoc = true;
    try {
      for (const key of changedKeys) {
        const v = yMap.get(key);
        if (v && v.id) applyToMemory(v);
        else memoryMap.delete(key);
      }
    } finally {
      suppressFromDoc = false;
    }
  }

  const observer = (yEvent, transaction) => onYMapChange(yEvent, transaction);
  yMap.observe(observer);

  function destroy() {
    if (yMap && typeof yMap.unobserve === 'function') {
      yMap.unobserve(observer);
    }
  }

  return { syncToStore, syncToDoc, updateOne, removeOne, destroy };
}

export async function setupActionPersistenceBridge(memoryMap, doc, dbName) {
  const { initPersistence, getActions } = await import('./yjs-store.js');
  if (!doc) doc = await initPersistence(dbName);
  const yMap = getActions();
  const bridge = createActionBridge(memoryMap, yMap, doc);
  return { bridge, yMap, doc };
}
