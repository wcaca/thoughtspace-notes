/**
 * [INPUT]: src/render/edge-line.js (几何写入工具 + createEdgeGroup), src/core/edge
 * [OUTPUT]: 验证 5 种关系类型的几何写入与 group sync 一致性
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { __test__ } from '../../src/render/edge-line.js';

const { writeDirect, writeZigzag, writeRightAngle } = __test__;

function vec3Arr(n = 16) {
  return new Float32Array(n * 3);
}

describe('edge-line geometry writers', () => {
  it('writeDirect puts from at [0..3] and to at [3..6]', () => {
    const arr = vec3Arr();
    writeDirect(arr, { x: 1, y: 2, z: 3 }, { x: 4, y: 5, z: 6 });
    expect(arr[0]).toBe(1); expect(arr[1]).toBe(2); expect(arr[2]).toBe(3);
    expect(arr[3]).toBe(4); expect(arr[4]).toBe(5); expect(arr[5]).toBe(6);
  });

  it('writeZigzag starts at from and ends near to', () => {
    const arr = vec3Arr();
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 100, y: 0, z: 0 };
    writeZigzag(arr, from, to);
    expect(arr[0]).toBe(0); expect(arr[1]).toBe(0); expect(arr[2]).toBe(0);
    const lastIdx = (8 + 1) * 3;
    expect(Math.abs(arr[lastIdx] - 100)).toBeLessThan(0.001);
    expect(Math.abs(arr[lastIdx + 1])).toBeLessThan(0.001);
    expect(Math.abs(arr[lastIdx + 2])).toBeLessThan(0.001);
  });

  it('writeZigzag has alternating offsets perpendicular to direction', () => {
    const arr = vec3Arr();
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 100, y: 0, z: 0 };
    writeZigzag(arr, from, to);
    let lastSign = 0;
    let allPresent = true;
    for (let i = 1; i <= 8; i++) {
      const v = arr[i * 3 + 1];
      if (!Number.isFinite(v)) { allPresent = false; break; }
      const sign = v > 0 ? 1 : v < 0 ? -1 : 0;
      if (sign !== 0) {
        if (lastSign !== 0 && sign !== -lastSign) {
          allPresent = false;
          break;
        }
        lastSign = sign;
      }
    }
    expect(allPresent).toBe(true);
  });

  it('writeRightAngle produces 3-point L shape', () => {
    const arr = vec3Arr();
    writeRightAngle(arr, { x: 0, y: 0, z: 0 }, { x: 100, y: 100, z: 0 });
    expect(arr[0]).toBe(0); expect(arr[1]).toBe(0); expect(arr[2]).toBe(0);
    expect(arr[3]).toBe(0); expect(arr[4]).toBe(100); expect(arr[5]).toBe(0);
    expect(arr[6]).toBe(100); expect(arr[7]).toBe(100); expect(arr[8]).toBe(0);
  });

  it('writers do not exceed buffer bounds', () => {
    const arr = vec3Arr(2);
    expect(() => writeDirect(arr, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 })).not.toThrow();
  });

  it('writeZigzag handles vertical direction (y-aligned)', () => {
    const arr = vec3Arr();
    const from = { x: 0, y: 0, z: 0 };
    const to = { x: 0, y: 200, z: 0 };
    writeZigzag(arr, from, to);
    expect(arr[0]).toBe(0); expect(arr[1]).toBe(0); expect(arr[2]).toBe(0);
    const lastIdx = (8 + 1) * 3;
    expect(arr[lastIdx]).toBeCloseTo(0, 5);
    expect(arr[lastIdx + 1]).toBeCloseTo(200, 5);
    expect(arr[lastIdx + 2]).toBeCloseTo(0, 5);
  });

  it('writeZigzag does not crash when from === to (degenerate)', () => {
    const arr = vec3Arr();
    expect(() => writeZigzag(arr, { x: 5, y: 5, z: 5 }, { x: 5, y: 5, z: 5 })).not.toThrow();
    expect(arr[0]).toBe(5);
  });
});
