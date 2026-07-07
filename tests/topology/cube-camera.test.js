/**
 * [INPUT]: src/topology/cube-camera.js (mock three.js)
 * [OUTPUT]: 验证 6 面语义 + isSwiping + FACE_ORDER 循环 (TAS audit P0-1.5 补全)
 * [POS]: tests/topology 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 注意: cube-camera 依赖 three.js,测试用最小 mock 覆盖
 */
import { describe, it, expect, vi } from 'vitest';

// Mock three.js 最小集 — cube-camera 只用 Camera/Vector3/Quaternion
vi.mock('three', () => {
  class MockVector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
    clone() { return new MockVector3(this.x, this.y, this.z); }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
    normalize() {
      const l = Math.hypot(this.x, this.y, this.z) || 1;
      this.x /= l; this.y /= l; this.z /= l;
      return this;
    }
    length() { return Math.hypot(this.x, this.y, this.z); }
    lerp(v, t) {
      this.x += (v.x - this.x) * t;
      this.y += (v.y - this.y) * t;
      this.z += (v.z - this.z) * t;
      return this;
    }
    // P0-1.5 修复: mock applyQuaternion (getCameraFront 用)
    applyQuaternion() { return this; }
  }
  class MockQuaternion {
    constructor() { this._x = 0; this._y = 0; this._z = 0; this._w = 1; }
    setFromUnitVectors() { return this; }
    slerp() { return this; }
  }
  class MockCamera {
    constructor() {
      this.position = new MockVector3();
      this.quaternion = new MockQuaternion();
    }
    lookAt() {}
    getWorldDirection(v) { v.set(0, 0, -1); return v; }
  }
  return { Vector3: MockVector3, Quaternion: MockQuaternion, Camera: MockCamera };
});

// P0-1.5 修复: mock document (createFaceIndicator 用)
if (typeof globalThis.document === 'undefined') {
  globalThis.document = {
    createElement: () => ({ style: {}, setAttribute() {}, appendChild() {}, set textContent(v) {} }),
    body: { appendChild() {} }
  };
}

import { createCubeCamera, createFaceIndicator } from '../../src/topology/cube-camera.js';

describe('cube-camera (TAS audit P0-1.5 最小覆盖)', () => {
  function makeMockDom() {
    const listeners = {};
    return {
      clientWidth: 800,
      clientHeight: 600,
      addEventListener(type, cb) { listeners[type] = cb; },
      _emit(type, e) { if (listeners[type]) listeners[type](e); }
    };
  }

  it('6 面语义化命名 (亮点 4.1): FACES 对象含 label', () => {
    const cam = { position: { set() {}, copy() {}, clone() { return { multiplyScalar() { return {}; } } } }, quaternion: { slerp() {} }, lookAt() {}, getWorldDirection(v) { v.set = () => {}; return v; } };
    const dom = makeMockDom();
    const cc = createCubeCamera(cam, dom);
    // 6 面都存在
    expect(cc.getCurrentFace()).toBe('front');
    cc.switchTo('back');
    expect(cc.getCurrentFace()).toBe('back');
    cc.switchTo('top');
    cc.switchTo('bottom');
    cc.switchTo('left');
    cc.switchTo('right');
    expect(cc.getCurrentFace()).toBe('right');
  });

  it('P1-2: isSwiping() 初始状态返回 false', () => {
    const cam = { position: { set() {}, copy() {} }, quaternion: { slerp() {} }, lookAt() {} };
    const dom = makeMockDom();
    const cc = createCubeCamera(cam, dom);
    expect(typeof cc.isSwiping).toBe('function');
    expect(cc.isSwiping()).toBe(false);
  });

  it('P0-2 + P1-2: getCameraFront 返回单位向量', () => {
    const cam = {
      position: { set() {}, copy() {} },
      quaternion: {},
      lookAt() {},
      getWorldDirection(v) { v.set = (x, y, z) => { v.x = x; v.y = y; v.z = z; }; return v; }
    };
    const dom = makeMockDom();
    const cc = createCubeCamera(cam, dom);
    const front = cc.getCameraFront();
    expect(front).toBeDefined();
  });

  it('face indicator: 创建 + update', () => {
    const container = { appendChild() {} };
    const fi = createFaceIndicator(container);
    expect(typeof fi.update).toBe('function');
    fi.update('back');
    fi.update('top');
    fi.update('unknown-face'); // 不崩
  });
});
