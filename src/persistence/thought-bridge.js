/**
 * [INPUT]: src/core/thought(createThought), src/persistence/yjs-store(getThoughts)
 * [OUTPUT]: createThoughtBridge(memoryMap, yMap, doc) → { syncToStore, syncToDoc, observe, destroy }; main 入口装配,F5 后从 Y 恢复念头位置/温度/文本 + S2.26 振幅覆盖 (顶层 + config 双源)
 * [POS]: src/persistence 下 — memory thought Map ↔ Y.Map('thoughts') 双向镜像桥
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * S2.26 增量: META_FIELDS 加 flashAmplitudeOverride (S2.25 per-thought 振幅覆盖) +
 *   config (v2 Thought class 完整配置). 顶层 + config 双源兼容: toPlainThought 时
 *   如果 thought.config.flashAmplitudeOverride 存在, 提升到顶层 (phase-flash 双源
 *   读法优先顶层). 否则反序列化后 v1 优先读 null 走查表, 振幅覆盖失效. v1 backward
 *   compat: 没 config 字段时 'in' 检查自然跳过, noop.
 */

const ORIGIN = 'thought-bridge';
const IGNORE_FIELDS = new Set(['contentHint']);
// S2.26: 加 flashAmplitudeOverride (S2.25 per-thought 振幅覆盖, 之前漏持久化刷新丢)
//        加 config (v2 Thought class 完整配置: material/shape/displayScale/occupancy/
//        innerRadius/opacity/flashAmplitudeOverride/metadata; v1 createThought 没 config
//        所以 'config' in thought 是 false, 跳过自动 noop, 兼容 v1)
const META_FIELDS = ['id', 'text', 'body', 'x', 'y', 'z', 'mass', 'temperature', 'colorTag', 'labels', 'lastInteractionAt', 'createdAt', 'order', 'flashAmplitudeOverride', 'config'];

export function createThoughtBridge(memoryMap, yMap, doc) {
  if (!memoryMap) throw new Error('thought-bridge requires a memoryMap (Map)');
  if (!yMap) throw new Error('thought-bridge requires a Y.Map');
  if (!memoryMap.forEach || memoryMap instanceof Map === false && typeof memoryMap.forEach !== 'function') {
    throw new Error('memoryMap must be Map-like (with forEach / set / get)');
  }

  let suppressFromDoc = false;

  function toPlainThought(thought) {
    if (!thought) return null;
    const out = {};
    for (const k of META_FIELDS) {
      if (k in thought) out[k] = thought[k];
    }
    // S2.26: v2 Thought class 把 flashAmplitudeOverride 放在 config 里,
    //   但 phase-flash.getPhaseFlashAmplitude 优先读顶层字段 (v1 兼容)
    //   持久化时: 顶层 + config.flashAmplitudeOverride 都写, 避免反序列化后 v1 优先读
    //   不到 (config 序列化后顶层没字段) 导致 S2.25 振幅覆盖丢失
    if (out.config && typeof out.config === 'object' && 'flashAmplitudeOverride' in out.config) {
      // 顶层没设, 从 config 复制 (避免 null 覆盖非 null)
      if (out.flashAmplitudeOverride == null) {
        out.flashAmplitudeOverride = out.config.flashAmplitudeOverride;
      }
    }
    if (typeof out.temperature !== 'number') out.temperature = 1;
    return out;
  }

  function applyThoughtToMemory(t) {
    if (!t || !t.id) return;
    const existing = memoryMap.get(t.id);
    if (existing) {
      for (const k of META_FIELDS) {
        if (k in t && !IGNORE_FIELDS.has(k)) existing[k] = t[k];
      }
    } else {
      memoryMap.set(t.id, { ...t });
    }
  }

  function applyRemoveFromMemory(id) {
    if (!id) return;
    memoryMap.delete(id);
  }

  function syncToStore() {
    if (!yMap) return 0;
    let imported = 0;
    yMap.forEach((value, id) => {
      if (!value || !value.id) return;
      applyThoughtToMemory(value);
      imported++;
    });
    for (const id of Array.from(memoryMap.keys())) {
      if (!yMap.has(id)) memoryMap.delete(id);
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

  function syncToDoc() {
    if (!yMap) return 0;
    let written = 0;
    transactIfPossible(() => {
      memoryMap.forEach((thought) => {
        if (!thought || !thought.id) return;
        const plain = toPlainThought(thought);
        const cur = yMap.get(thought.id);
        if (!cur || hasDiff(cur, plain)) {
          yMap.set(thought.id, plain);
          written++;
        }
      });
      for (const id of Array.from(yMap.keys())) {
        if (!memoryMap.has(id)) yMap.delete(id);
      }
    });
    return written;
  }

  function hasDiff(prev, next) {
    for (const k of META_FIELDS) {
      if (k === 'labels') {
        const a = JSON.stringify(prev.labels || []);
        const b = JSON.stringify(next.labels || []);
        if (a !== b) return true;
        continue;
      }
      if (prev[k] !== next[k]) return true;
    }
    return false;
  }

  function updateOne(thought) {
    if (!thought || !thought.id) return;
    const plain = toPlainThought(thought);
    transactIfPossible(() => {
      const cur = yMap.get(thought.id);
      if (!cur || hasDiff(cur, plain)) {
        yMap.set(thought.id, plain);
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
        if (v && v.id) applyThoughtToMemory(v);
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

  return { syncToStore, syncToDoc, updateOne, removeOne, destroy, docGet: () => doc, docGetMap: () => yMap };
}

export async function setupThoughtPersistenceBridge(memoryMap, doc, dbName) {
  const { initPersistence, getThoughts } = await import('./yjs-store.js');
  if (!doc) doc = await initPersistence(dbName);
  const yMap = getThoughts();
  const bridge = createThoughtBridge(memoryMap, yMap, doc);
  return { bridge, yMap, doc };
}
