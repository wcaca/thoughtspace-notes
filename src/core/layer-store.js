/**
 * [INPUT]: 无外部依赖
 * [OUTPUT]: createLayerStore() → { add, update, remove, list, get, reorder, toJSON, fromJSON, dispose }
 * [POS]: src/core/layer-store.js — SP-1 看板分层的核心数据模型
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计原则 (SP-1.P0 不压制信念排序):
 *  - 用户完全自定义分层层数(默认给6个初始层)
 *  - 每个层独立可命名/可重排/可删除
 *  - kind 是软分类(conscious/subconscious),不强制
 *  - 持久化由调用方负责(LayerStore.toJSON/fromJSON)
 *
 * Layer 结构:
 *  { id, name, color, order, kind, visibility, createdAt }
 */

const DEFAULT_LAYER_NAMES = [
  { name: '显意识层 1', kind: 'conscious' },
  { name: '显意识层 2', kind: 'conscious' },
  { name: '显意识层 3', kind: 'conscious' },
  { name: '潜意识层 1', kind: 'subconscious' },
  { name: '潜意识层 2', kind: 'subconscious' },
  { name: '潜意识层 3', kind: 'subconscious' }
];

const DEFAULT_COLORS = [
  '#7fe0c9', '#a8e89a', '#e8c265', '#e8a865', '#e88a9a', '#9b8ae8'
];

function nextId() {
  return 'L_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
}

function clampOrder(o) {
  if (!Number.isFinite(o)) return 0;
  return Math.max(0, Math.floor(o));
}

export function createLayerStore() {
  const layerById = new Map();

  function makeLayer(spec, index) {
    const id = spec.id || nextId();
    return {
      id,
      name: spec.name || `层 ${index + 1}`,
      color: spec.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
      order: clampOrder(spec.order ?? index),
      kind: spec.kind === 'subconscious' ? 'subconscious' : 'conscious',
      visibility: spec.visibility === 'collapsed' ? 'collapsed' : 'visible',
      createdAt: spec.createdAt || Date.now()
    };
  }

  function add(spec = {}) {
    const layer = makeLayer(spec, layerById.size);
    layerById.set(layer.id, layer);
    return { ...layer };
  }

  function update(id, patch = {}) {
    const layer = layerById.get(id);
    if (!layer) return null;
    if (typeof patch.name === 'string') layer.name = patch.name;
    if (typeof patch.color === 'string') layer.color = patch.color;
    if (Number.isFinite(patch.order)) layer.order = clampOrder(patch.order);
    if (patch.kind === 'conscious' || patch.kind === 'subconscious') layer.kind = patch.kind;
    if (patch.visibility === 'visible' || patch.visibility === 'collapsed') layer.visibility = patch.visibility;
    return { ...layer };
  }

  function remove(id) {
    return layerById.delete(id);
  }

  function get(id) {
    const l = layerById.get(id);
    return l ? { ...l } : null;
  }

  function list() {
    return Array.from(layerById.values())
      .sort((a, b) => a.order - b.order)
      .map((l) => ({ ...l }));
  }

  function size() {
    return layerById.size;
  }

  function reorder(newOrder) {
    if (!Array.isArray(newOrder)) return false;
    const seen = new Set();
    for (let i = 0; i < newOrder.length; i++) {
      const id = newOrder[i];
      const layer = layerById.get(id);
      if (!layer || seen.has(id)) return false;
      seen.add(id);
      layer.order = i;
    }
    return true;
  }

  function insertAt(order, spec = {}) {
    const layer = makeLayer(spec, order);
    layer.order = clampOrder(order);
    layerById.set(layer.id, layer);
    for (const l of layerById.values()) {
      if (l.id !== layer.id && l.order >= layer.order) l.order += 1;
    }
    return { ...layer };
  }

  function bootstrapDefaults() {
    if (layerById.size > 0) return [];
    const created = [];
    for (let i = 0; i < DEFAULT_LAYER_NAMES.length; i++) {
      const def = DEFAULT_LAYER_NAMES[i];
      const layer = add({ name: def.name, kind: def.kind, order: i });
      created.push(layer);
    }
    return created;
  }

  function toJSON() {
    return list();
  }

  function fromJSON(arr) {
  // ⚠️ 易错: 必须先检查再 clear,否则 fromJSON(undefined) 会破坏现有数据
  //   详见 [docs/notes/sp1/pitfalls.md#T1.5-json-undefined-side-effect]
  // @note(sp1, pitfall, T1.5-json-undefined-side-effect, since:2026-07-07)
  if (!Array.isArray(arr)) return;
  layerById.clear();
  for (let i = 0; i < arr.length; i++) {
    const spec = arr[i];
    if (!spec || !spec.id) continue;
    const layer = makeLayer(spec, i);
    layerById.set(layer.id, layer);
  }
}

  function dispose() {
    layerById.clear();
  }

  return {
    add, update, remove, get, list, size, reorder, insertAt,
    bootstrapDefaults, toJSON, fromJSON, dispose,
    _map: layerById
  };
}