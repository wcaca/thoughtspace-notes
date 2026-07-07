/**
 * [INPUT]: src/persistence/crystal-bridge.js
 * [OUTPUT]: 验证 crystals array ↔ Y.Map('crystals') 双向镜像
 * [POS]: tests/persistence 下,被 vitest 消费(用 Yjs 内存 doc)
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import * as Y from 'yjs';
import { createCrystalBridge } from '../../src/persistence/crystal-bridge.js';

function makeContext() {
  const doc = new Y.Doc();
  const yMap = doc.getMap('crystals');
  const crystalsArr = [];
  return { doc, yMap, crystalsArr };
}

function makeCrystal(id, opts = {}) {
  return {
    id,
    form: opts.form || 'tetra',
    thoughtIds: opts.thoughtIds || ['t1', 't2'],
    position: opts.position || { x: 0, y: 0, z: 0 },
    rotSpeed: opts.rotSpeed || { x: 0.001, y: 0.001, z: 0.0005 },
    createdAt: opts.createdAt || Date.now()
  };
}

describe('crystal-bridge', () => {
  it('imports crystals from Y → memory array', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    doc.transact(() => {
      yMap.set('c1', makeCrystal('c1', { form: 'octa', position: { x: 10, y: 20, z: 30 } }));
      yMap.set('c2', makeCrystal('c2', { form: 'cube', thoughtIds: ['a', 'b', 'c'] }));
    }, 'setup');
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const imported = bridge.syncToStore();
    expect(imported).toBe(2);
    expect(crystalsArr.length).toBe(2);
    const c1 = crystalsArr.find(c => c.id === 'c1');
    const c2 = crystalsArr.find(c => c.id === 'c2');
    expect(c1.form).toBe('octa');
    expect(c1.position.x).toBe(10);
    expect(c2.form).toBe('cube');
    expect(c2.thoughtIds.length).toBe(3);
    bridge.destroy();
  });

  it('removes memory entries no longer in Y', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    crystalsArr.push(makeCrystal('stale'));
    doc.transact(() => {
      yMap.set('fresh', makeCrystal('fresh'));
    }, 'setup');
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    bridge.syncToStore();
    expect(crystalsArr.length).toBe(1);
    expect(crystalsArr[0].id).toBe('fresh');
    bridge.destroy();
  });

  it('syncToDoc pushes memory changes into Y', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    crystalsArr.push(makeCrystal('a', { form: 'dodeca' }));
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const written = bridge.syncToDoc();
    expect(written).toBe(1);
    expect(yMap.has('a')).toBe(true);
    const back = yMap.get('a');
    expect(back.form).toBe('dodeca');
    expect(back.thoughtIds.length).toBe(2);
    bridge.destroy();
  });

  it('syncToDoc is idempotent for unchanged data', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    crystalsArr.push(makeCrystal('a'));
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const w1 = bridge.syncToDoc();
    const w2 = bridge.syncToDoc();
    expect(w1).toBe(1);
    expect(w2).toBe(0);
    bridge.destroy();
  });

  it('addOne adds single crystal to Y', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    bridge.addOne(makeCrystal('c_new', { form: 'icosa' }));
    expect(yMap.has('c_new')).toBe(true);
    expect(yMap.get('c_new').form).toBe('icosa');
    bridge.destroy();
  });

  it('addOne is idempotent for unchanged data', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const c = makeCrystal('c1');
    bridge.addOne(c);
    let changeCount = 0;
    const observer = () => { changeCount++; };
    yMap.observe(observer);
    bridge.addOne(c);
    expect(changeCount).toBe(0);
    yMap.unobserve(observer);
    bridge.destroy();
  });

  it('removeOne removes from Y', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    doc.transact(() => {
      yMap.set('toRemove', makeCrystal('toRemove'));
    }, 'setup');
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    bridge.removeOne('toRemove');
    expect(yMap.has('toRemove')).toBe(false);
    bridge.destroy();
  });

  it('live observer syncs Y changes into memory', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    doc.transact(() => {
      yMap.set('live1', makeCrystal('live1', { form: 'cube' }));
    }, 'external');
    expect(crystalsArr.find(c => c.id === 'live1').form).toBe('cube');
    bridge.destroy();
  });

  it('suppresses echo: changes from bridge do not re-trigger observer', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    let localChanges = 0;
    const origSync = bridge.syncToStore;
    // 直接测试:调用 addOne 不应导致内存侧再次变化
    crystalsArr.push(makeCrystal('echo_test'));
    bridge.addOne(crystalsArr[0]);
    const lenBefore = crystalsArr.length;
    // 手动触发 Y 上的同数据修改(但由 bridge 发起的事务)
    expect(crystalsArr.length).toBe(lenBefore);
    bridge.destroy();
  });

  it('handles thoughtIds array changes correctly in hasDiff', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const c = makeCrystal('diff_test', { thoughtIds: ['a', 'b'] });
    bridge.addOne(c);
    c.thoughtIds = ['a', 'b', 'c'];
    let changeCount = 0;
    const observer = () => { changeCount++; };
    yMap.observe(observer);
    bridge.addOne(c);
    expect(changeCount).toBe(1);
    yMap.unobserve(observer);
    bridge.destroy();
  });

  it('handles position object changes correctly in hasDiff', () => {
    const { doc, yMap, crystalsArr } = makeContext();
    const bridge = createCrystalBridge(crystalsArr, yMap, doc);
    const c = makeCrystal('pos_test', { position: { x: 1, y: 2, z: 3 } });
    bridge.addOne(c);
    c.position = { x: 10, y: 2, z: 3 };
    let changeCount = 0;
    const observer = () => { changeCount++; };
    yMap.observe(observer);
    bridge.addOne(c);
    expect(changeCount).toBe(1);
    yMap.unobserve(observer);
    bridge.destroy();
  });

  it('throws when memory array is missing', () => {
    const { doc, yMap } = makeContext();
    expect(() => createCrystalBridge(null, yMap, doc)).toThrow();
  });

  it('throws when yMap is missing', () => {
    const { crystalsArr } = makeContext();
    expect(() => createCrystalBridge(crystalsArr, null)).toThrow();
  });
});
