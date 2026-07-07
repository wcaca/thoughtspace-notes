/**
 * [INPUT]: src/render/viewport-bridge.js
 * [OUTPUT]: 验证桥接模块正确同步 getter 到 viewport-state 总线,带 throttle
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createViewportBridge
} from '../../src/render/viewport-bridge.js';
import { resetViewportState, getViewportState } from '../../src/render/viewport-state.js';

function makeFakeCubeCam(face = 'front', distance = 700) {
  return { getFace: () => face, getDistance: () => distance };
}

describe('viewport-bridge', () => {
  beforeEach(() => {
    resetViewportState();
  });

  describe('基本同步', () => {
    it('写入 selectedCount / totalCount', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam(),
        getThoughtMap: () => ({ size: () => 42 }),
        getSelectedSet: () => new Set(['a', 'b']),
        getObserveMode: () => 'cards'
      });
      bridge.tick(0);
      const s = getViewportState().read();
      expect(s.totalCount).toBe(42);
      expect(s.selectionCount).toBe(2);
      expect(s.selectionRatio).toBeCloseTo(2 / 42, 2);
    });

    it('写入 cameraFace 与 cameraDistance', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam('top', 1000),
        getThoughtMap: () => ({ size: () => 0 }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => null
      });
      bridge.tick(0);
      const s = getViewportState().read();
      expect(s.cameraFace).toBe('top');
      expect(s.cameraDistance).toBeCloseTo(1000 / 1400, 2);
    });

    it('写入 observeMode 与 deviceMode', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam(),
        getThoughtMap: () => ({ size: () => 0 }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => 'kanban',
        isMobile: () => true
      });
      bridge.tick(0);
      const s = getViewportState().read();
      expect(s.observeMode).toBe('kanban');
      expect(s.deviceMode).toBe('mobile');
    });
  });

  describe('throttle', () => {
    it('200ms 内多次 tick 只写一次', () => {
      const counts = { n: 0 };
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam(),
        getThoughtMap: () => ({ size: () => { counts.n++; return 10; } }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => null
      });
      bridge.tick(0);
      bridge.tick(50);
      bridge.tick(100);
      expect(counts.n).toBe(1);
      bridge.tick(250);
      expect(counts.n).toBe(2);
    });

    it('throttleMs=0 时每次都写', () => {
      const counts = { n: 0 };
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam(),
        getThoughtMap: () => ({ size: () => { counts.n++; return 10; } }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => null,
        throttleMs: 0
      });
      bridge.tick(0);
      bridge.tick(1);
      bridge.tick(2);
      expect(counts.n).toBe(3);
    });
  });

  describe('容错', () => {
    it('getter 返回 undefined 时该字段不写', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => null,
        getThoughtMap: () => null,
        getSelectedSet: () => null,
        getObserveMode: () => null
      });
      bridge.tick(0);
      const s = getViewportState().read();
      expect(s.cameraFace).toBe('front');
      expect(s.totalCount).toBe(0);
    });

    it('cameraStable 远离 face 默认 band 时为 false', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam('front', 1300),
        getThoughtMap: () => ({ size: () => 0 }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => null
      });
      bridge.tick(0);
      const s = getViewportState().read();
      expect(s.cameraStable).toBe(false);
    });

    it('dispose 后 tick 不抛错也不写', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam(),
        getThoughtMap: () => ({ size: () => 99 }),
        getSelectedSet: () => new Set(),
        getObserveMode: () => null
      });
      bridge.dispose();
      bridge.tick(0);
      expect(getViewportState().read().totalCount).toBe(0);
    });
  });

  describe('getDerived', () => {
    it('返回 wholesomeness/derivedShape/cameraMood', () => {
      const bridge = createViewportBridge({
        getCubeCamera: () => makeFakeCubeCam('front', 700),
        getThoughtMap: () => ({ size: () => 100 }),
        getSelectedSet: () => new Set(['a', 'b', 'c']),
        getObserveMode: () => 'cards'
      });
      bridge.tick(0);
      const d = bridge.getDerived();
      expect(typeof d.wholesomeness).toBe('number');
      expect(typeof d.derivedShape).toBe('string');
      expect(typeof d.cameraMood).toBe('string');
    });
  });
});