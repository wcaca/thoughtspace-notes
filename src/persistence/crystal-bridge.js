/**
 * [INPUT]: 晶体数据(thoughtIds/form/position/rotSpeed), src/persistence/yjs-store(getCrystals)
 * [OUTPUT]: createCrystalBridge(memoryArr, yMap, doc) → { syncToStore, syncToDoc, addOne, removeOne, destroy }; 与 thought/action-bridge 同模式
 * [POS]: src/persistence 下 — memory crystals Array ↔ Y.Map('crystals') 双向镜像桥
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const ORIGIN = 'crystal-bridge';
const META_FIELDS = ['id', 'form', 'thoughtIds', 'position', 'rotSpeed', 'createdAt'];

function arrToMap(crystalsArr) {
  const m = new Map();
  for (const c of crystalsArr) {
    if (c && c.id) m.set(c.id, c);
  }
  return m;
}

export function createCrystalBridge(crystalsArr, yMap, doc) {
  if (!Array.isArray(crystalsArr)) throw new Error('crystal-bridge requires a crystals array');
  if (!yMap) throw new Error('crystal-bridge requires a Y.Map');

  let suppressFromDoc = false;

  function toPlain(crystal) {
    if (!crystal) return null;
    const out = {};
    for (const k of META_FIELDS) {
      if (k in crystal) out[k] = crystal[k];
    }
    return out;
  }

  function findIndex(id) {
    for (let i = 0; i < crystalsArr.length; i++) {
      if (crystalsArr[i] && crystalsArr[i].id === id) return i;
    }
    return -1;
  }

  function applyToMemory(c) {
    if (!c || !c.id) return;
    const idx = findIndex(c.id);
    if (idx >= 0) {
      const existing = crystalsArr[idx];
      for (const k of META_FIELDS) {
        if (k in c) existing[k] = c[k];
      }
    } else {
      crystalsArr.push({ ...c });
    }
  }

  function removeFromMemory(id) {
    const idx = findIndex(id);
    if (idx >= 0) crystalsArr.splice(idx, 1);
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
      if (k === 'thoughtIds' || k === 'position' || k === 'rotSpeed') {
        const a = JSON.stringify(prev[k] || (k === 'thoughtIds' ? [] : {}));
        const b = JSON.stringify(next[k] || (k === 'thoughtIds' ? [] : {}));
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
    const memIds = new Set(crystalsArr.map(c => c.id));
    for (const id of memIds) {
      if (!yMap.has(id)) removeFromMemory(id);
    }
    return imported;
  }

  function syncToDoc() {
    if (!yMap) return 0;
    let written = 0;
    const memMap = arrToMap(crystalsArr);
    transactIfPossible(() => {
      for (const crystal of crystalsArr) {
        if (!crystal || !crystal.id) continue;
        const plain = toPlain(crystal);
        const cur = yMap.get(crystal.id);
        if (!cur || hasDiff(cur, plain)) {
          yMap.set(crystal.id, plain);
          written++;
        }
      }
      for (const id of Array.from(yMap.keys())) {
        if (!memMap.has(id)) yMap.delete(id);
      }
    });
    return written;
  }

  function addOne(crystal) {
    if (!crystal || !crystal.id) return;
    const plain = toPlain(crystal);
    transactIfPossible(() => {
      const cur = yMap.get(crystal.id);
      if (!cur || hasDiff(cur, plain)) {
        yMap.set(crystal.id, plain);
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
        else removeFromMemory(key);
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

  return { syncToStore, syncToDoc, addOne, removeOne, destroy };
}

export async function setupCrystalPersistenceBridge(crystalsArr, doc, dbName) {
  const { initPersistence, getCrystals } = await import('./yjs-store.js');
  if (!doc) doc = await initPersistence(dbName);
  const yMap = getCrystals();
  const bridge = createCrystalBridge(crystalsArr, yMap, doc);
  return { bridge, yMap, doc };
}
