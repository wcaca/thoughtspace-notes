/**
 * [INPUT]: payload schema v1 (from exporter.js), Y.Map('thoughts'/'edges'), doc
 * [OUTPUT]: applyImport(payload, ctx, opts) → {thoughtsImported, edgesImported, skipped}; mode: 'replace' | 'merge'; 解析校验防御
 * [POS]: src/persistence 下 — 把 JSON payload 推回 Yjs;保护原数据不被 schema 错误污染
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { hasEdge } from '../core/edge.js';

export function parseImportString(raw) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, error: 'empty' };
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: 'invalid-json' };
  }
  const validation = validatePayload(payload);
  if (!validation.ok) return validation;
  return { ok: true, payload };
}

export function validatePayload(p) {
  if (!p || typeof p !== 'object') return { ok: false, error: 'not-object' };
  if (!Array.isArray(p.thoughts)) return { ok: false, error: 'missing-thoughts-array' };
  if (!Array.isArray(p.edges)) return { ok: false, error: 'missing-edges-array' };
  if (typeof p.thoughts !== typeof []) return { ok: false, error: 'thoughts-not-array' };
  if (typeof p.edges !== typeof []) return { ok: false, error: 'edges-not-array' };
  // zones 字段可选,缺失则视为空数组
  if (p.zones !== undefined && !Array.isArray(p.zones)) return { ok: false, error: 'zones-not-array' };
  for (let i = 0; i < p.thoughts.length; i++) {
    const t = p.thoughts[i];
    if (!t || typeof t !== 'object') return { ok: false, error: `thought[${i}]-not-object` };
    if (typeof t.id !== 'string' || !t.id) return { ok: false, error: `thought[${i}]-bad-id` };
  }
  for (let i = 0; i < p.edges.length; i++) {
    const e = p.edges[i];
    if (!e || typeof e !== 'object') return { ok: false, error: `edge[${i}]-not-object` };
    if (typeof e.id !== 'string' || !e.id) return { ok: false, error: `edge[${i}]-bad-id` };
    if (typeof e.fromId !== 'string' || !e.fromId) return { ok: false, error: `edge[${i}]-bad-fromId` };
    if (typeof e.toId !== 'string' || !e.toId) return { ok: false, error: `edge[${i}]-bad-toId` };
  }
  return { ok: true };
}

export function applyImport(payload, ctx, opts = {}) {
  if (!payload || !ctx) return { thoughtsImported: 0, edgesImported: 0, zonesImported: 0, skipped: 0 };
  const { thoughtsMap, edgesMap, zonesMap, doc } = ctx;
  const mode = opts.mode === 'replace' ? 'replace' : 'merge';

  let thoughtsImported = 0;
  let edgesImported = 0;
  let zonesImported = 0;
  let skipped = 0;

  function transactIfPossible(fn) {
    if (doc && typeof doc.transact === 'function') doc.transact(fn, 'importer');
    else fn();
  }

  transactIfPossible(() => {
    if (mode === 'replace') {
      Array.from(thoughtsMap.keys()).forEach((k) => thoughtsMap.delete(k));
      Array.from(edgesMap.keys()).forEach((k) => edgesMap.delete(k));
      if (zonesMap && typeof zonesMap.clear === 'function') zonesMap.clear();
    }

    const existingThoughtIds = new Set();
    thoughtsMap.forEach((_, k) => existingThoughtIds.add(k));

    const newThoughtIds = new Set();
    for (const t of payload.thoughts) {
      if (!t || !t.id) { skipped++; continue; }
      if (mode === 'merge' && existingThoughtIds.has(t.id)) { skipped++; continue; }
      newThoughtIds.add(t.id);
      const cleaned = {
        id: t.id,
        text: t.text || '',
        x: Number.isFinite(t.x) ? t.x : 0,
        y: Number.isFinite(t.y) ? t.y : 0,
        z: Number.isFinite(t.z) ? t.z : 0,
        mass: Number.isFinite(t.mass) ? t.mass : 1,
        temperature: Number.isFinite(t.temperature) ? t.temperature : 0.5,
        colorTag: typeof t.colorTag === 'string' ? t.colorTag : null,
        labels: Array.isArray(t.labels) ? t.labels.slice() : [],
        createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
        lastInteractionAt: Number.isFinite(t.lastInteractionAt) ? t.lastInteractionAt : Date.now()
      };
      thoughtsMap.set(cleaned.id, cleaned);
      thoughtsImported++;
    }

    for (const e of payload.edges) {
      if (!e || !e.id || !e.fromId || !e.toId) { skipped++; continue; }
      if (mode === 'replace' || !edgesMap.has(e.id)) {
        if (!newThoughtIds.has(e.fromId) && !existingThoughtIds.has(e.fromId)) { skipped++; continue; }
        if (!newThoughtIds.has(e.toId) && !existingThoughtIds.has(e.toId)) { skipped++; continue; }
        edgesMap.set(e.id, {
          id: e.id,
          fromId: e.fromId,
          toId: e.toId,
          relationType: e.relationType || 'cause',
          createdAt: Number.isFinite(e.createdAt) ? e.createdAt : Date.now()
        });
        edgesImported++;
      } else {
        skipped++;
      }
    }

    // zones(可选,需要 ctx 提供 zonesMap)
    if (zonesMap && Array.isArray(payload.zones)) {
      for (const z of payload.zones) {
        if (!z || typeof z.id !== 'string' || !z.id) { skipped++; continue; }
        if (mode === 'merge' && zonesMap.has(z.id)) continue;
        const cleaned = {
          id: z.id,
          name: z.name || '分区',
          color: z.color || '#7fe0c9',
          center: z.center && Number.isFinite(z.center.x) ? z.center : { x: 0, y: 0, z: 0 },
          radius: Number.isFinite(z.radius) ? z.radius : 150,
          description: z.description || '',
          createdAt: Number.isFinite(z.createdAt) ? z.createdAt : Date.now()
        };
        zonesMap.set(cleaned.id, cleaned);
        zonesImported++;
      }
    }
  });

  return { thoughtsImported, edgesImported, zonesImported, skipped };
}

export async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read-error'));
    reader.readAsText(file);
  });
}

export const __test__ = { parseImportString, validatePayload, applyImport };
