/**
 * [INPUT]: src/topology/convex-hull.js
 * [OUTPUT]: 验证凸包计算边界 case (TAS audit P0-1.5 补全)
 * [POS]: tests/topology 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { computeHull } from '../../src/topology/convex-hull.js';

describe('convex-hull (TAS audit P0-1.5 最小覆盖)', () => {
  it('0 点: 返回 valid=false', () => {
    const r = computeHull([]);
    expect(r.valid).toBe(false);
    expect(r.vertices).toEqual([]);
    expect(r.faces).toEqual([]);
  });

  it('3 点: 不足 4 点,返回 valid=false', () => {
    const r = computeHull([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }
    ]);
    expect(r.valid).toBe(false);
  });

  it('4 点正四面体: 返回 valid=true + 4 个三角面', () => {
    const r = computeHull([
      { x: 1, y: 1, z: 1 },
      { x: -1, y: -1, z: 1 },
      { x: -1, y: 1, z: -1 },
      { x: 1, y: -1, z: -1 }
    ]);
    expect(r.valid).toBe(true);
    expect(r.vertices.length).toBe(4);
    expect(r.faces.length).toBe(4); // 正四面体 4 个面
    // 每个面是 3 顶点索引
    for (const f of r.faces) {
      expect(f.length).toBe(3);
    }
  });

  it('8 点立方体: 返回 valid=true + 6 个面', () => {
    const r = computeHull([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 1 },
      { x: 1, y: 1, z: 1 },
      { x: 0, y: 1, z: 1 }
    ]);
    expect(r.valid).toBe(true);
    expect(r.vertices.length).toBe(8);
    // 立方体凸包有 12 个三角面 (6 面 × 2 三角形)
    expect(r.faces.length).toBeGreaterThanOrEqual(6);
  });

  it('共面退化: 4 点共面,返回 valid=false (兜底)', () => {
    const r = computeHull([
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 0, y: 1, z: 0 }
    ]);
    // 共面 4 点无法形成 3D 凸包,convex-hull npm 返回空数组,我们的兜底返回 valid=false
    expect(r.valid).toBe(false);
  });
});
