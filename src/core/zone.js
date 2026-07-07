/**
 * [INPUT]: zoneById Map / thoughtById Map / 3D 坐标
 * [OUTPUT]: createZoneStore() → { add, update, remove, contains, classify, list, ids, size, valueOf, dispose }
 * [POS]: src/core/zone.js — 用户自定义分区(3D 球体领地);让用户能自主划分念头空间
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计:
 *  - 一个 zone 是 { id, name, color, center: {x,y,z}, radius, description?, createdAt }
 *  - contains(t|point):判断念头或点是否在球内
 *  - classify(thought):返回念头所在 zone id(若有);一个念头只属于一个 zone(最近的)
 *  - classifyAll(thoughtById):批量分类,返回 Map<thoughtId, zoneId>
 *  - 持久化由调用方负责(zoneStore.toJSON / fromJSON)
 */

export function createZoneStore() {
  const zoneById = new Map();

  function nextId() {
    return 'z_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function add({ name, color, center, radius, description }) {
    const id = nextId();
    const zone = Object.freeze({
      id,
      name: name || '新分区',
      color: color || '#7fe0c9',
      center: center || { x: 0, y: 0, z: 0 },
      radius: radius || 150,
      description: description || '',
      createdAt: Date.now()
    });
    zoneById.set(id, zone);
    return zone;
  }

  function update(id, patch) {
    const z = zoneById.get(id);
    if (!z) return null;
    const merged = Object.freeze({ ...z, ...patch });
    zoneById.set(id, merged);
    return merged;
  }

  function remove(id) {
    return zoneById.delete(id);
  }

  function get(id) {
    return zoneById.get(id) || null;
  }

  function list() {
    return Array.from(zoneById.values());
  }

  function ids() {
    return Array.from(zoneById.keys());
  }

  function size() {
    return zoneById.size;
  }

  function distanceTo(zone, point) {
    const dx = (point.x ?? 0) - zone.center.x;
    const dy = (point.y ?? 0) - zone.center.y;
    const dz = (point.z ?? 0) - zone.center.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function contains(zone, point) {
    return distanceTo(zone, point) <= zone.radius;
  }

  // 念头 → zone(最近包含它的 zone;无则 null)
  function classify(thought) {
    const point = { x: thought.x || 0, y: thought.y || 0, z: thought.z || 0 };
    let best = null;
    let bestDist = Infinity;
    for (const z of zoneById.values()) {
      const d = distanceTo(z, point);
      if (d <= z.radius && d < bestDist) {
        bestDist = d;
        best = z;
      }
    }
    return best ? best.id : null;
  }

  // 批量:Map<thoughtId, zoneId>
  function classifyAll(thoughtById) {
    const result = new Map();
    for (const t of thoughtById.values()) {
      result.set(t.id, classify(t));
    }
    return result;
  }

  // 念头所属 zone
  function zoneOf(thought) {
    const id = classify(thought);
    return id ? zoneById.get(id) : null;
  }

  function toJSON() {
    return Array.from(zoneById.values());
  }

  function fromJSON(list) {
    zoneById.clear();
    if (!Array.isArray(list)) return;
    for (const z of list) {
      if (z && z.id) {
        zoneById.set(z.id, {
          id: z.id,
          name: z.name || '新分区',
          color: z.color || '#7fe0c9',
          center: z.center || { x: 0, y: 0, z: 0 },
          radius: z.radius || 150,
          description: z.description || '',
          createdAt: z.createdAt || Date.now()
        });
      }
    }
  }

  function dispose() {
    zoneById.clear();
  }

  return {
    add,
    update,
    remove,
    get,
    list,
    ids,
    size,
    contains,
    classify,
    classifyAll,
    zoneOf,
    distanceTo,
    toJSON,
    fromJSON,
    dispose,
    _map: zoneById
  };
}