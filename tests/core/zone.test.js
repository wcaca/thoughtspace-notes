/**
 * [POS]: tests/core/zone.test.js — 验证自定义分区核心逻辑
 */
import { describe, it, expect } from 'vitest';
import { createZoneStore } from '../../src/core/zone.js';

describe('zone store', () => {
  it('starts empty', () => {
    const s = createZoneStore();
    expect(s.size()).toBe(0);
    expect(s.list()).toEqual([]);
  });

  it('add creates with defaults', () => {
    const s = createZoneStore();
    const z = s.add({ name: '工作' });
    expect(z.id).toBeTruthy();
    expect(z.name).toBe('工作');
    expect(z.color).toBeTruthy();
    expect(z.center).toEqual({ x: 0, y: 0, z: 0 });
    expect(z.radius).toBe(150);
    expect(s.size()).toBe(1);
  });

  it('update patches fields', () => {
    const s = createZoneStore();
    const z = s.add({ name: 'A', radius: 100 });
    const updated = s.update(z.id, { name: 'B', color: '#fff' });
    expect(updated.name).toBe('B');
    expect(updated.color).toBe('#fff');
    expect(updated.radius).toBe(100);
  });

  it('update returns null for missing id', () => {
    const s = createZoneStore();
    expect(s.update('nope', { name: 'X' })).toBeNull();
  });

  it('remove deletes', () => {
    const s = createZoneStore();
    const z = s.add({ name: 'A' });
    expect(s.remove(z.id)).toBe(true);
    expect(s.size()).toBe(0);
  });

  it('contains detects point in sphere', () => {
    const s = createZoneStore();
    const z = s.add({ name: 'A', center: { x: 0, y: 0, z: 0 }, radius: 100 });
    expect(s.contains(z, { x: 50, y: 0, z: 0 })).toBe(true);
    expect(s.contains(z, { x: 150, y: 0, z: 0 })).toBe(false);
    expect(s.contains(z, { x: 0, y: 0, z: 99.9 })).toBe(true);
  });

  it('classify returns nearest zone', () => {
    const s = createZoneStore();
    const z1 = s.add({ name: 'A', center: { x: 0, y: 0, z: 0 }, radius: 50 });
    const z2 = s.add({ name: 'B', center: { x: 100, y: 0, z: 0 }, radius: 80 });
    expect(s.classify({ x: 10, y: 0, z: 0 })).toBe(z1.id);
    expect(s.classify({ x: 120, y: 0, z: 0 })).toBe(z2.id);
    expect(s.classify({ x: 500, y: 0, z: 0 })).toBe(null);
  });

  it('classifyAll returns map for all thoughts', () => {
    const s = createZoneStore();
    const z = s.add({ name: 'A', center: { x: 0, y: 0, z: 0 }, radius: 200 });
    const thoughts = new Map([
      ['t1', { id: 't1', x: 10, y: 0, z: 0 }],
      ['t2', { id: 't2', x: 500, y: 0, z: 0 }]
    ]);
    const map = s.classifyAll(thoughts);
    expect(map.get('t1')).toBe(z.id);
    expect(map.get('t2')).toBe(null);
  });

  it('toJSON / fromJSON roundtrip', () => {
    const s = createZoneStore();
    s.add({ name: 'A', color: '#fff', center: { x: 1, y: 2, z: 3 }, radius: 80 });
    const json = s.toJSON();
    expect(json.length).toBe(1);

    const s2 = createZoneStore();
    s2.fromJSON(json);
    expect(s2.size()).toBe(1);
    expect(s2.list()[0].name).toBe('A');
    expect(s2.list()[0].color).toBe('#fff');
    expect(s2.list()[0].radius).toBe(80);
  });

  it('fromJSON handles bad input gracefully', () => {
    const s = createZoneStore();
    expect(() => s.fromJSON(null)).not.toThrow();
    expect(() => s.fromJSON('not array')).not.toThrow();
    expect(s.size()).toBe(0);
  });
});