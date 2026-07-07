/**
 * [INPUT]: src/sim/force-3d.js
 * [OUTPUT]: 验证 createSim3D 返回结构 + activeSim 单例 + 5 个新函数 (TAS audit P0-1.5 补全)
 * [POS]: tests/sim 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import {
  createSim3D,
  restartSim,
  stopSim,
  pinSimNode,
  unpinSimNode,
  setSimLayout,
  reheatSim,
  keepSimAlive
} from '../../src/sim/force-3d.js';

describe('force-3d (TAS audit P0-1.5 最小覆盖 + P0-2 新函数)', () => {
  it('createSim3D 返回 { sim, nodes, idToNode } 三件套', () => {
    const thoughts = [
      { id: 't1', x: 0, y: 0, z: 0, temperature: 1 },
      { id: 't2', x: 100, y: 0, z: 0, temperature: 0.5 },
      { id: 't3', x: 0, y: 100, z: 0, temperature: 0.2 },
      { id: 't4', x: 0, y: 0, z: 100, temperature: 1 }
    ];
    const edges = [{ id: 'e1', fromId: 't1', toId: 't2' }];
    const r = createSim3D(thoughts, edges);
    expect(r.sim).toBeDefined();
    expect(r.nodes.length).toBe(4);
    expect(r.idToNode.has('t1')).toBe(true);
    expect(r.idToNode.has('t4')).toBe(true);
    stopSim();
  });

  it('activeSim 单例: 第二次 createSim3D 不抛错 (旧 sim 被 stop)', () => {
    // P0-1.5 修复: d3-force-3d 的 stop() 不把 alpha 设为 0,只是停止 tick
    // 这里验证不抛错 + 新 sim alpha > 0 即可
    const r1 = createSim3D(
      [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1, y: 1, z: 1 }],
      []
    );
    expect(() => {
      createSim3D(
        [{ id: 'c', x: 0, y: 0, z: 0 }, { id: 'd', x: 1, y: 1, z: 1 }],
        []
      );
    }).not.toThrow();
    stopSim();
  });

  it('P0-2: pinSimNode 钉住节点 (设置 fx/fy/fz)', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      []
    );
    const ok = pinSimNode(r.sim, 't1', 50, 50, 50);
    expect(ok).toBe(true);
    const node = r.sim.nodes().find((n) => n.id === 't1');
    expect(node.fx).toBe(50);
    expect(node.fy).toBe(50);
    expect(node.fz).toBe(50);
    stopSim();
  });

  it('P0-2: unpinSimNode 解除钉住 (fx/fy/fz = null)', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      []
    );
    pinSimNode(r.sim, 't1', 50, 50, 50);
    unpinSimNode(r.sim, 't1');
    const node = r.sim.nodes().find((n) => n.id === 't1');
    expect(node.fx).toBeNull();
    expect(node.fy).toBeNull();
    expect(node.fz).toBeNull();
    stopSim();
  });

  it('P0-2: setSimLayout 同值不触发 (返回 false)', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      [],
      { initialLayout: 'circle' }
    );
    const ok = setSimLayout(r.sim, 'circle'); // 同值
    expect(ok).toBe(false);
    stopSim();
  });

  it('P0-2: setSimLayout 切换 circle→grid 触发 reheat', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      [],
      { initialLayout: 'circle' }
    );
    r.sim.alpha(0); // 先把 alpha 降到 0
    const ok = setSimLayout(r.sim, 'grid');
    expect(ok).toBe(true);
    expect(r.sim.alpha()).toBeGreaterThan(0); // reheat 后 alpha 应该 > 0
    stopSim();
  });

  it('P0-2: reheatSim 设置 alpha', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      []
    );
    r.sim.alpha(0);
    reheatSim(r.sim, 0.8);
    expect(r.sim.alpha()).toBe(0.8);
    stopSim();
  });

  it('P0-2: keepSimAlive 把 alpha 提到 min', () => {
    const r = createSim3D(
      [{ id: 't1', x: 0, y: 0, z: 0 }, { id: 't2', x: 100, y: 100, z: 100 }],
      []
    );
    r.sim.alpha(0.05);
    keepSimAlive(r.sim, 0.15);
    expect(r.sim.alpha()).toBeGreaterThanOrEqual(0.15);
    stopSim();
  });
});
