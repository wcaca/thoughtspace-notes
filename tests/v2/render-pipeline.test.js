/**
 * RenderPipeline 测试 (S2.10)
 *
 * 验证:
 *   1. 5 阶段定义 + STAGES 常量冻结
 *   2. 构造函数必填参数校验
 *   3. registerStage 校验 stage 合法 + priority 排序
 *   4. start/stop 切换 _running + 取消 RAF
 *   5. _tick 5 阶段顺序执行 + 阶段内 priority 升序
 *   6. 阶段超 budget → warns 收集
 *   7. 帧总超时 → 额外 warn
 *   8. 回调 throw → errors 收集 (不影响其他 stage)
 *   9. snapshot 阶段调 snapshotStore.captureIfNecessary
 *  10. getStats 输出 totalFrames / recentAvgMs / stages / lastFrame
 *  11. recordCacheAccess 累计 cacheHitRate
 *  12. 帧历史保留 maxFramesHistory
 *
 * 配套: src/v2/render/render-pipeline.js
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RenderPipeline, STAGES } from '../../src/v2/render/render-pipeline.js';

// ===== Mock 工具 =====

function makeMockRenderer() {
  return { render: vi.fn() };
}
function makeMockCamera(pos = { x: 0, y: 0, z: 8 }) {
  return { position: { ...pos } };
}
function makeMockScene() {
  return { children: [] };
}
function makeMockSnapshotStore() {
  return { captureIfNecessary: vi.fn() };
}

// ===== 测试 =====

describe('RenderPipeline · S2.10 帧调度', () => {
  let renderer, camera, scene, snapshotStore;

  beforeEach(() => {
    renderer = makeMockRenderer();
    camera = makeMockCamera();
    scene = makeMockScene();
    snapshotStore = makeMockSnapshotStore();
  });

  describe('STAGES 常量', () => {
    it('5 阶段固定顺序 + budget 总和 = 16', () => {
      expect(STAGES).toHaveLength(5);
      expect(STAGES.map(s => s.name)).toEqual(['input', 'state', 'transform', 'render', 'snapshot']);
      const total = STAGES.reduce((s, st) => s + st.budgetMs, 0);
      expect(total).toBe(16);
    });

    it('STAGES 冻结 (Object.freeze)', () => {
      expect(() => {
        STAGES.push({ name: 'extra', budgetMs: 0 });
      }).toThrow();
    });
  });

  describe('构造函数', () => {
    it('必填 renderer/camera/scene', () => {
      expect(() => new RenderPipeline({})).toThrow();
      expect(() => new RenderPipeline({ renderer })).toThrow();
      expect(() => new RenderPipeline({ renderer, camera })).toThrow();
    });

    it('snapshotStore 可选 + 默认 maxFramesHistory=120', () => {
      const p = new RenderPipeline({ renderer, camera, scene });
      expect(p.snapshotStore).toBeNull();
      expect(p._maxFramesHistory).toBe(120);
    });

    it('接受 snapshotStore + 自定义 maxFramesHistory', () => {
      const p = new RenderPipeline({ renderer, camera, scene, snapshotStore, maxFramesHistory: 10 });
      expect(p.snapshotStore).toBe(snapshotStore);
      expect(p._maxFramesHistory).toBe(10);
    });
  });

  describe('registerStage', () => {
    let p;
    beforeEach(() => {
      p = new RenderPipeline({ renderer, camera, scene });
    });

    it('未知 stage 抛错', () => {
      expect(() => p.registerStage('unknown', 0, () => {})).toThrow(/未知 stage/);
    });

    it('非函数 fn 抛错', () => {
      expect(() => p.registerStage('state', 0, null)).toThrow(/必须是函数/);
    });

    it('同 stage 多回调按 priority 升序', () => {
      const calls = [];
      p.registerStage('state', 20, () => calls.push('B'));
      p.registerStage('state', 10, () => calls.push('A'));
      p.registerStage('state', 30, () => calls.push('C'));
      // 手动触发一次 _tick
      p._tick(performance.now());
      expect(calls).toEqual(['A', 'B', 'C']);
    });
  });

  describe('start / stop', () => {
    it('start 后 _running=true', () => {
      const p = new RenderPipeline({ renderer, camera, scene });
      p.start();
      expect(p._running).toBe(true);
      p.stop();
    });

    it('stop 后 _running=false + 取消 RAF', () => {
      const p = new RenderPipeline({ renderer, camera, scene });
      p.start();
      p.stop();
      expect(p._running).toBe(false);
      expect(p._frameHandle).toBeNull();
    });

    it('重复 start 不重启', () => {
      const p = new RenderPipeline({ renderer, camera, scene });
      p.start();
      const handle = p._frameHandle;
      p.start();
      expect(p._frameHandle).toBe(handle);
      p.stop();
    });
  });

  describe('_tick 行为', () => {
    let p;
    beforeEach(() => {
      p = new RenderPipeline({ renderer, camera, scene, snapshotStore });
    });

    it('5 阶段顺序执行 (input→state→transform→render→snapshot)', () => {
      const order = [];
      p.registerStage('input', 0, () => order.push('input'));
      p.registerStage('state', 0, () => order.push('state'));
      p.registerStage('transform', 0, () => order.push('transform'));
      p.registerStage('render', 0, () => order.push('render-cb'));
      p.registerStage('snapshot', 0, () => order.push('snapshot-cb'));
      p._tick(performance.now());
      expect(order).toEqual(['input', 'state', 'transform', 'render-cb', 'snapshot-cb']);
    });

    it('末阶段 render 调 renderer.render(scene, camera)', () => {
      p._tick(performance.now());
      expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    });

    it('snapshot 阶段调 snapshotStore.captureIfNecessary', () => {
      p._tick(performance.now());
      expect(snapshotStore.captureIfNecessary).toHaveBeenCalled();
      const args = snapshotStore.captureIfNecessary.mock.calls[0];
      // [deltaMs, 'timer', payload]
      expect(args[1]).toBe('timer');
      expect(args[2].frame).toBe(1);
    });

    it('回调 throw 不影响其他 stage', () => {
      const stateFired = vi.fn();
      p.registerStage('input', 0, () => { throw new Error('input fail'); });
      p.registerStage('state', 0, stateFired);
      p._tick(performance.now());
      expect(stateFired).toHaveBeenCalled();
      expect(p.getStats().totalErrors).toBe(1);
    });

    it('renderer.render throw 也收集到 errors', () => {
      renderer.render.mockImplementationOnce(() => { throw new Error('gl fail'); });
      p._tick(performance.now());
      expect(p.getStats().totalErrors).toBeGreaterThanOrEqual(1);
    });

    it('deltaMs 上限 64ms (慢 tab 保护)', () => {
      const pNoSnap = new RenderPipeline({ renderer, camera, scene });
      pNoSnap._lastTime = 0;
      // 模拟 1000ms 间隔
      pNoSnap._tick(1000);
      // 帧 1, deltaMs 被 cap 到 64
      const lastFrame = pNoSnap.getStats().lastFrame;
      expect(lastFrame.deltaMs).toBeLessThanOrEqual(64);
    });
  });

  describe('预算超限告警', () => {
    let p;
    beforeEach(() => {
      p = new RenderPipeline({ renderer, camera, scene });
    });

    it('单阶段超 budget → 累计 totalOverruns', () => {
      // 模拟一个超 budget 的 transform stage
      p.registerStage('transform', 0, () => {
        const start = performance.now();
        while (performance.now() - start < 10) {} // busy 10ms (budget 6)
      });
      p._tick(performance.now());
      expect(p.getStats().totalOverruns).toBeGreaterThanOrEqual(1);
    });

    it('帧总超时 → 额外 overrun', () => {
      // 5 个 stage 全超
      for (const stage of STAGES) {
        p.registerStage(stage.name, 0, () => {
          const start = performance.now();
          while (performance.now() - start < 5) {}
        });
      }
      p._tick(performance.now());
      const stats = p.getStats();
      expect(stats.totalOverruns).toBeGreaterThanOrEqual(5); // 5 stage 各自 + 1 frame total
    });
  });

  describe('getStats', () => {
    let p;
    beforeEach(() => {
      p = new RenderPipeline({ renderer, camera, scene });
    });

    it('初始 stats 都是 0', () => {
      const stats = p.getStats();
      expect(stats.totalFrames).toBe(0);
      expect(stats.totalOverruns).toBe(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.cacheHitRate).toBe(0);
      expect(stats.lastFrame).toBeNull();
    });

    it('跑 N 帧后 totalFrames=N', () => {
      for (let i = 0; i < 5; i++) p._tick(performance.now() + i);
      expect(p.getStats().totalFrames).toBe(5);
    });

    it('stages 包含 5 阶段 + budgetMs + avgMs', () => {
      p._tick(performance.now());
      const stats = p.getStats();
      for (const stage of STAGES) {
        expect(stats.stages[stage.name]).toBeDefined();
        expect(stats.stages[stage.name].budgetMs).toBe(stage.budgetMs);
      }
    });

    it('recentAvgFps 帧率合理 (0~120)', () => {
      for (let i = 0; i < 5; i++) p._tick(performance.now() + i * 16);
      const stats = p.getStats();
      expect(stats.recentAvgFps).toBeGreaterThanOrEqual(0);
      expect(stats.recentAvgFps).toBeLessThanOrEqual(120);
    });

    it('lastFrame 含 frame/deltaMs/totalMs/stages/warnCount/errorCount', () => {
      p._tick(performance.now());
      const lf = p.getStats().lastFrame;
      expect(lf.frame).toBe(1);
      expect(typeof lf.deltaMs).toBe('number');
      expect(typeof lf.totalMs).toBe('number');
      expect(typeof lf.stages).toBe('object');
      expect(lf.warnCount).toBe(0);
      expect(lf.errorCount).toBe(0);
    });
  });

  describe('recordCacheAccess', () => {
    it('累计 hits/misses + cacheHitRate', () => {
      const p = new RenderPipeline({ renderer, camera, scene });
      p.recordCacheAccess(true);
      p.recordCacheAccess(true);
      p.recordCacheAccess(false);
      const stats = p.getStats();
      expect(stats.cacheHitRate).toBeCloseTo(2 / 3);
    });
  });

  describe('帧历史保留', () => {
    it('超过 maxFramesHistory 自动丢弃最旧', () => {
      const p = new RenderPipeline({ renderer, camera, scene, maxFramesHistory: 3 });
      for (let i = 0; i < 5; i++) p._tick(performance.now() + i);
      expect(p._frameHistory).toHaveLength(3);
      // 最新 3 帧 frame 编号 3, 4, 5
      expect(p._frameHistory.map(f => f.frame)).toEqual([3, 4, 5]);
    });
  });
});
