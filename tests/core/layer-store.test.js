/**
 * [INPUT]: src/core/layer-store.js
 * [OUTPUT]: 验证 LayerStore CRUD / reorder / 持久化 / 默认引导
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { createLayerStore } from '../../src/core/layer-store.js';

describe('LayerStore (SP-1)', () => {
  describe('CRUD', () => {
    it('add 创建带默认字段的层', () => {
      const store = createLayerStore();
      const l = store.add({ name: '测试层' });
      expect(l.id).toBeTruthy();
      expect(l.name).toBe('测试层');
      expect(l.kind).toBe('conscious');
      expect(l.order).toBe(0);
      expect(l.visibility).toBe('visible');
    });

    it('add 默认 kind 是 conscious', () => {
      const store = createLayerStore();
      const l = store.add({});
      expect(l.kind).toBe('conscious');
    });

    it('add 可显式指定 kind=subconscious', () => {
      const store = createLayerStore();
      const l = store.add({ name: '深层', kind: 'subconscious' });
      expect(l.kind).toBe('subconscious');
    });

    it('add 顺序递增 order', () => {
      const store = createLayerStore();
      const a = store.add({ name: 'A' });
      const b = store.add({ name: 'B' });
      const c = store.add({ name: 'C' });
      expect(a.order).toBe(0);
      expect(b.order).toBe(1);
      expect(c.order).toBe(2);
    });

    it('update 修改 name/color/order/kind/visibility', () => {
      const store = createLayerStore();
      const l = store.add({ name: 'A' });
      const updated = store.update(l.id, {
        name: 'B',
        color: '#ff0000',
        order: 5,
        kind: 'subconscious',
        visibility: 'collapsed'
      });
      expect(updated.name).toBe('B');
      expect(updated.color).toBe('#ff0000');
      expect(updated.order).toBe(5);
      expect(updated.kind).toBe('subconscious');
      expect(updated.visibility).toBe('collapsed');
    });

    it('update 不存在的 id 返回 null', () => {
      const store = createLayerStore();
      expect(store.update('not_exist', { name: 'X' })).toBeNull();
    });

    it('update 不接受非法 kind', () => {
      const store = createLayerStore();
      const l = store.add({});
      store.update(l.id, { kind: 'invalid_kind' });
      expect(store.get(l.id).kind).toBe('conscious');
    });

    it('update 不接受非法 visibility', () => {
      const store = createLayerStore();
      const l = store.add({});
      store.update(l.id, { visibility: 'wrong' });
      expect(store.get(l.id).visibility).toBe('visible');
    });

    it('remove 删除层', () => {
      const store = createLayerStore();
      const l = store.add({});
      expect(store.remove(l.id)).toBe(true);
      expect(store.get(l.id)).toBeNull();
    });

    it('remove 不存在的 id 返回 false', () => {
      const store = createLayerStore();
      expect(store.remove('not_exist')).toBe(false);
    });
  });

  describe('list 与排序', () => {
    it('list 按 order 升序返回', () => {
      const store = createLayerStore();
      store.add({ name: 'A', order: 5 });
      store.add({ name: 'B', order: 1 });
      store.add({ name: 'C', order: 3 });
      const list = store.list();
      expect(list.map((l) => l.name)).toEqual(['B', 'C', 'A']);
    });

    it('list 返回的是副本,修改不影响 store', () => {
      const store = createLayerStore();
      const l = store.add({ name: 'A' });
      const list = store.list();
      list[0].name = 'B';
      expect(store.get(l.id).name).toBe('A');
    });

    it('size 返回当前层数', () => {
      const store = createLayerStore();
      expect(store.size()).toBe(0);
      store.add({});
      store.add({});
      expect(store.size()).toBe(2);
    });
  });

  describe('reorder', () => {
    it('按给定顺序重新设置 order', () => {
      const store = createLayerStore();
      const a = store.add({ name: 'A' });
      const b = store.add({ name: 'B' });
      const c = store.add({ name: 'C' });
      expect(store.reorder([c.id, a.id, b.id])).toBe(true);
      expect(store.list().map((l) => l.name)).toEqual(['C', 'A', 'B']);
    });

    it('reorder 不接受重复 id', () => {
      const store = createLayerStore();
      const a = store.add({ name: 'A' });
      store.add({ name: 'B' });
      expect(store.reorder([a.id, a.id])).toBe(false);
    });

    it('reorder 不接受不存在的 id', () => {
      const store = createLayerStore();
      const a = store.add({ name: 'A' });
      expect(store.reorder([a.id, 'not_exist'])).toBe(false);
    });

    it('reorder 非数组返回 false', () => {
      const store = createLayerStore();
      expect(store.reorder('not array')).toBe(false);
    });
  });

  describe('insertAt', () => {
    it('在指定 order 处插入并把后续 order+1', () => {
      const store = createLayerStore();
      const a = store.add({ name: 'A', order: 0 });
      const b = store.add({ name: 'B', order: 1 });
      const c = store.add({ name: 'C', order: 2 });
      store.insertAt(1, { name: 'X' });
      expect(store.list().map((l) => l.name)).toEqual(['A', 'X', 'B', 'C']);
    });
  });

  describe('bootstrapDefaults', () => {
    it('默认创建 6 层 (3 conscious + 3 subconscious)', () => {
      const store = createLayerStore();
      const layers = store.bootstrapDefaults();
      expect(layers.length).toBe(6);
      expect(layers.slice(0, 3).every((l) => l.kind === 'conscious')).toBe(true);
      expect(layers.slice(3).every((l) => l.kind === 'subconscious')).toBe(true);
    });

    it('已有层时不重复创建', () => {
      const store = createLayerStore();
      store.add({});
      const layers = store.bootstrapDefaults();
      expect(layers.length).toBe(0);
      expect(store.size()).toBe(1);
    });

    it('bootstrapDefaults 顺序 0..5', () => {
      const store = createLayerStore();
      const layers = store.bootstrapDefaults();
      expect(layers.map((l) => l.order)).toEqual([0, 1, 2, 3, 4, 5]);
    });
  });

  describe('持久化 (toJSON / fromJSON)', () => {
    it('toJSON 返回 list 副本', () => {
      const store = createLayerStore();
      store.add({ name: 'A' });
      store.add({ name: 'B' });
      const json = store.toJSON();
      expect(json.length).toBe(2);
    });

    it('fromJSON 还原数据', () => {
      const a = createLayerStore();
      const l = a.add({ name: 'X', color: '#abc', order: 5 });
      const json = a.toJSON();
      const b = createLayerStore();
      b.fromJSON(json);
      expect(b.get(l.id)).toEqual(l);
    });

    it('fromJSON 非数组静默忽略', () => {
      const store = createLayerStore();
      store.add({ name: 'A' });
      store.fromJSON(null);
      expect(store.size()).toBe(1);
    });

    it('fromJSON 跳过没有 id 的层', () => {
      const store = createLayerStore();
      store.fromJSON([{ name: 'no_id' }]);
      expect(store.size()).toBe(0);
    });

    it('完整 round-trip 不丢失信息', () => {
      const a = createLayerStore();
      a.bootstrapDefaults();
      const x = a.add({ name: 'X', kind: 'subconscious' });
      a.update(x.id, { visibility: 'collapsed' });
      const json = a.toJSON();
      const b = createLayerStore();
      b.fromJSON(json);
      expect(b.size()).toBe(a.size());
      const x2 = b.get(x.id);
      expect(x2.name).toBe('X');
      expect(x2.kind).toBe('subconscious');
      expect(x2.visibility).toBe('collapsed');
    });
  });

  describe('get 安全性', () => {
    it('get 返回的副本不能修改原数据', () => {
      const store = createLayerStore();
      const l = store.add({ name: 'A' });
      const copy = store.get(l.id);
      copy.name = 'B';
      expect(store.get(l.id).name).toBe('A');
    });

    it('get 不存在的 id 返回 null', () => {
      const store = createLayerStore();
      expect(store.get('not_exist')).toBeNull();
    });
  });

  describe('dispose', () => {
    it('dispose 清空所有数据', () => {
      const store = createLayerStore();
      store.add({});
      store.dispose();
      expect(store.size()).toBe(0);
    });
  });
});