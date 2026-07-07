/**
 * [INPUT]: shape-resolver + viewport-state + viewport-bridge + shape-indicator 四个模块
 * [OUTPUT]: 端到端信号流测试 (T10 语义反转版: 选得少→圆, 选得多→方, n=0→empty)
 * [POS]: tests/integration 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { shapeResolve, SHAPES } from '../../src/core/shape-resolver.js';
import {
  getViewportState,
  resetViewportState
} from '../../src/render/viewport-state.js';
import { createViewportBridge } from '../../src/render/viewport-bridge.js';
import { describeShape } from '../../src/render/shape-indicator.js';

function makeScene(totalThoughts, selectedIds = []) {
  return {
    cubeCam: { getFace: () => 'front', getDistance: () => 700 },
    thoughtMap: {
      size: () => totalThoughts,
      forEach: (cb) => {
        for (let i = 0; i < totalThoughts; i++) cb(`t${i}`, { id: `t${i}` });
      }
    },
    selectedSet: new Set(selectedIds),
    observeMode: 'cards',
    isMobile: false
  };
}

describe('形状自适应 端到端 (T10)', () => {
  beforeEach(() => {
    resetViewportState();
  });

  describe('Bug 1 验证: n=0 → empty', () => {
    it('空背景 → empty → "空 · 等待第一个念头"', () => {
      const scene = makeScene(0, []);
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      const desc = describeShape(state);
      expect(state.derivedShape).toBe(SHAPES.EMPTY);
      expect(desc.shape).toBe('empty');
      expect(desc.label).toBe('空 · 等待第一个念头');
    });
  });

  describe('Bug 2 验证: selection 反转语义', () => {
    it('n=20, k=0 → continuous "圆 · 全貌"', () => {
      const scene = makeScene(20, []);
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      const desc = describeShape(state);
      expect(state.derivedShape).toBe(SHAPES.CONTINUOUS);
      expect(desc.label).toBe('圆 · 全貌');
    });
    it('n=20, k=10 (50%) → metric_with_anchors "圆方 · 选 50%"', () => {
      const scene = makeScene(20, Array.from({ length: 10 }, (_, i) => `t${i}`));
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      const desc = describeShape(state);
      expect(state.derivedShape).toBe(SHAPES.METRIC_WITH_ANCHORS);
      expect(desc.label).toBe('圆方 · 选 50%');
    });
    it('n=20, k=20 (全选) → discrete_with_metric "方圆 · 选 100%"', () => {
      const scene = makeScene(20, Array.from({ length: 20 }, (_, i) => `t${i}`));
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      const desc = describeShape(state);
      expect(state.derivedShape).toBe(SHAPES.DISCRETE_WITH_METRIC);
      expect(desc.label).toBe('方圆 · 选 100%');
    });
  });

  describe('Bug 4 验证: dwell=0 自然偏圆', () => {
    it('n=10, k=0, dwell=0 → continuous', () => {
      const scene = makeScene(10, []);
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      expect(state.derivedShape).toBe(SHAPES.CONTINUOUS);
    });
  });

  describe('信号推进: 选 0 → 1 → 10 → 20 走完整 4 档 + empty 边界', () => {
    it('从 k=0 到 k=20 跨 4 个 shape (round → discrete)', () => {
      const total = 20;
      const selectedSet = new Set();
      const thoughtMap = {
        size: () => total,
        forEach: (cb) => { for (let i = 0; i < total; i++) cb(`t${i}`, { id: `t${i}` }); }
      };
      const bridge = createViewportBridge({
        getCubeCamera: () => ({ getFace: () => 'front', getDistance: () => 700 }),
        getThoughtMap: () => thoughtMap,
        getSelectedSet: () => selectedSet,
        getObserveMode: () => 'cards',
        isMobile: () => false,
        throttleMs: 0
      });
      const trace = [];
      bridge.tick(0);
      trace.push(getViewportState().read().derivedShape);
      for (let i = 0; i < 3; i++) selectedSet.add(`t${i}`);
      bridge.tick(10);
      trace.push(getViewportState().read().derivedShape);
      for (let i = 3; i < 10; i++) selectedSet.add(`t${i}`);
      bridge.tick(20);
      trace.push(getViewportState().read().derivedShape);
      for (let i = 10; i < total; i++) selectedSet.add(`t${i}`);
      bridge.tick(30);
      trace.push(getViewportState().read().derivedShape);

      expect(trace[0]).toBe(SHAPES.CONTINUOUS);
      expect(trace[1]).toBe(SHAPES.CONTINUOUS);
      expect(trace[2]).toBe(SHAPES.METRIC_WITH_ANCHORS);
      expect(trace[3]).toBe(SHAPES.DISCRETE_WITH_METRIC);
    });
  });

  describe('subscribe 推送 (T10 验证)', () => {
    it('viewport-state.subscribe 在 selectionCount 变化时被通知', async () => {
      const total = 20;
      const selectedSet = new Set();
      const thoughtMap = { size: () => total };
      const bridge = createViewportBridge({
        getCubeCamera: () => ({ getFace: () => 'front', getDistance: () => 700 }),
        getThoughtMap: () => thoughtMap,
        getSelectedSet: () => selectedSet,
        getObserveMode: () => 'cards',
        isMobile: () => false,
        throttleMs: 0
      });
      const shapes = [];
      const off = getViewportState().subscribe((snap) => {
        shapes.push(snap.derivedShape);
      });
      bridge.tick(0);
      for (let i = 0; i < 20; i++) selectedSet.add(`t${i}`);
      bridge.tick(10);
      await Promise.resolve();
      await Promise.resolve();
      off();
      expect(shapes.length).toBeGreaterThan(0);
      expect(shapes[shapes.length - 1]).not.toBe(SHAPES.CONTINUOUS);
    });
  });

  describe('算法与视觉一致', () => {
    it('wholesomeness 与 shape-resolver 完全一致', () => {
      const total = 30;
      const k = 9;
      const scene = makeScene(total, Array.from({ length: k }, (_, i) => `t${i}`));
      const bridge = createViewportBridge({
        getCubeCamera: () => scene.cubeCam,
        getThoughtMap: () => scene.thoughtMap,
        getSelectedSet: () => scene.selectedSet,
        getObserveMode: () => scene.observeMode,
        isMobile: () => scene.isMobile,
        throttleMs: 0
      });
      bridge.tick(0);
      const state = getViewportState().read();
      const direct = shapeResolve({ n: total, k, hullHits: 0, dwellMs: 0 });
      expect(state.wholesomeness).toBeCloseTo(direct.score, 3);
      expect(state.derivedShape).toBe(direct.shape);
    });

    it('describeShape 与 viewport-state.derivedShape 永远同源', () => {
      const scenes = [
        makeScene(0, []),
        makeScene(10, []),
        makeScene(10, ['t0','t1','t2','t3','t4','t5']),
        makeScene(5, ['t0','t1','t2','t3','t4']),
        makeScene(100, Array.from({ length: 100 }, (_, i) => `t${i}`))
      ];
      for (const scene of scenes) {
        const bridge = createViewportBridge({
          getCubeCamera: () => scene.cubeCam,
          getThoughtMap: () => scene.thoughtMap,
          getSelectedSet: () => scene.selectedSet,
          getObserveMode: () => scene.observeMode,
          isMobile: () => scene.isMobile,
          throttleMs: 0
        });
        bridge.tick(0);
        const state = getViewportState().read();
        const desc = describeShape(state);
        const map = {
          [SHAPES.EMPTY]: 'empty',
          [SHAPES.CONTINUOUS]: 'continuous',
          [SHAPES.METRIC_WITH_ANCHORS]: 'metric_with_anchors',
          [SHAPES.DISCRETE_WITH_METRIC]: 'discrete_with_metric',
          [SHAPES.DISCRETE]: 'discrete'
        };
        expect(desc.shape).toBe(map[state.derivedShape]);
      }
    });
  });

  describe('5 档视觉标签', () => {
    it('每档对应 1 个独特中文标签', () => {
      const labels = [
        describeShape({ isEmpty: true }).label,
        describeShape({ shape: 'continuous' }).label,
        describeShape({ shape: 'metric_with_anchors', selectionRatio: 0.3 }).label,
        describeShape({ shape: 'discrete_with_metric', selectionRatio: 0.5 }).label,
        describeShape({ shape: 'discrete', selectionRatio: 0.8 }).label
      ];
      const unique = new Set(labels);
      expect(unique.size).toBe(5);
    });
  });
});