/**
 * [INPUT]: src/core/zone(createZoneStore), src/persistence/yjs-store(getZones)
 * [OUTPUT]: createZoneBridge(memoryZoneStore, yMap, doc) → { syncToStore, syncToDoc, addOne, updateOne, removeOne, destroy }
 * [POS]: src/persistence 下 — memory zone store ↔ Y.Map('zones') 双向镜像桥
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const ORIGIN = 'zone-bridge';
const ZONE_FIELDS = ['id', 'name', 'color', 'center', 'radius', 'description', 'createdAt'];

export function createZoneBridge(memoryZoneStore, yMap, doc) {
  if (!memoryZoneStore) throw new Error('zone-bridge requires memoryZoneStore');
  if (!yMap) throw new Error('zone-bridge requires a Y.Map');

  let suppressFromDoc = false;

  function toPlainZone(z) {
    if (!z) return null;
    const out = {};
    for (const k of ZONE_FIELDS) {
      if (k in z) out[k] = z[k];
    }
    out.name = out.name || '分区';
    out.color = out.color || '#7fe0c9';
    out.center = out.center || { x: 0, y: 0, z: 0 };
    out.radius = Number.isFinite(out.radius) ? out.radius : 150;
    out.createdAt = out.createdAt || Date.now();
    return out;
  }

  function applyZoneToMemory(z) {
    if (!z || !z.id) return;
    memoryZoneStore.update(z.id, z);
  }

  function applyRemoveFromMemory(id) {
    if (!id) return;
    memoryZoneStore.remove(id);
  }

  function syncToStore() {
    if (!yMap) return 0;
    let imported = 0;
    yMap.forEach((value, id) => {
      if (!value || !value.id) return;
      applyZoneToMemory(value);
      imported++;
    });
    const yIds = new Set();
    yMap.forEach((_, id) => yIds.add(id));
    for (const zid of memoryZoneStore.ids()) {
      if (!yIds.has(zid)) memoryZoneStore.remove(zid);
    }
    return imported;
  }

  function transactIfPossible(fn) {
    if (doc && typeof doc.transact === 'function') {
      doc.transact(fn, ORIGIN);
    } else {
      fn();
    }
  }

  function hasDiff(prev, next) {
    for (const k of ZONE_FIELDS) {
      if (k === 'center') {
        const a = prev.center || {};
        const b = next.center || {};
        if (a.x !== b.x || a.y !== b.y || a.z !== b.z) return true;
        continue;
      }
      if (prev[k] !== next[k]) return true;
    }
    return false;
  }

  function syncToDoc() {
    if (!yMap) return 0;
    let written = 0;
    transactIfPossible(() => {
      for (const z of memoryZoneStore.list()) {
        if (!z || !z.id) continue;
        const plain = toPlainZone(z);
        const cur = yMap.get(z.id);
        if (!cur || hasDiff(cur, plain)) {
          yMap.set(z.id, plain);
          written++;
        }
      }
      const memIds = new Set(memoryZoneStore.ids());
      for (const id of Array.from(yMap.keys())) {
        if (!memIds.has(id)) yMap.delete(id);
      }
    });
    return written;
  }

  function addOne(zone) {
    if (!zone || !zone.id) return null;
    const plain = toPlainZone(zone);
    transactIfPossible(() => {
      yMap.set(zone.id, plain);
    });
    return { ...plain };
  }

  function updateOne(zone) {
    if (!zone || !zone.id) return;
    const plain = toPlainZone(zone);
    transactIfPossible(() => {
      const cur = yMap.get(zone.id);
      if (!cur || hasDiff(cur, plain)) {
        yMap.set(zone.id, plain);
      }
    });
  }

  function removeOne(id) {
    if (!id) return;
    transactIfPossible(() => {
      yMap.delete(id);
    });
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
        if (v && v.id) applyZoneToMemory(v);
        else applyRemoveFromMemory(key);
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

  return { syncToStore, syncToDoc, addOne, updateOne, removeOne, destroy, docGetMap: () => yMap };
}

export async function setupZonePersistenceBridge(memoryZoneStore, doc, dbName) {
  const { initPersistence, getZones } = await import('./yjs-store.js');
  if (!doc) doc = await initPersistence(dbName);
  const yMap = getZones();
  const bridge = createZoneBridge(memoryZoneStore, yMap, doc);
  return { bridge, yMap, doc };
}
