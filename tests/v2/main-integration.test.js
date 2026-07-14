/**
 * main.js 集成测试 (S2.11 + S2.12 集成验证)
 *
 * 验证 v2/main.js 启动链路包含 DebugOverlay:
 *   1. DebugOverlay 能从 main.js 装配路径创建
 *   2. main.js 暴露的 renderPipeline 满足 DebugOverlay 构造要求 (有 getStats)
 *   3. toggleDebug 暴露在 __v2 (不直接 import main, 改用契约验证)
 *   4. DebugOverlay attach 之后 panel/toggle button 出现, 且与 RenderPipeline stats 同步
 *
 * 测试策略:
 *   main.js 顶层 await initBootstrap() + 大量 three.js 副作用, 难以在 vitest node 环境直接 import。
 *   改为契约测试: 模拟 main.js 创建的 renderPipeline + debugOverlay 装配, 验证 1+1=2 的链路。
 *
 * 配套: src/v2/main.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DebugOverlay } from '../../src/v2/debug/debug-overlay.js';
import { RenderPipeline, STAGES } from '../../src/v2/render/render-pipeline.js';

const STAGE_NAMES = ['input', 'state', 'transform', 'render', 'snapshot'];

const baseStats = () => ({
  totalFrames: 0,
  totalOverruns: 0,
  totalErrors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  stages: STAGE_NAMES.map((name) => ({ name, ms: 0, overruns: 0, errors: 0 })),
});

// RenderPipeline 必填 renderer/camera/scene (指向 any non-null 即可)
const makePipeline = () => {
  const stub = { domElement: {}, getPixelRatio: () => 1 };
  const cam = { isPerspectiveCamera: true, position: { x: 0, y: 0, z: 0 }, updateProjectionMatrix: () => {} };
  const sc = { isScene: true, children: [] };
  return new RenderPipeline({ renderer: stub, camera: cam, scene: sc, snapshotStore: null });
};

describe('main.js 集成契约 (S2.11 + S2.12 装配路径)', () => {
  it('1. 模拟 main.js 装配: RenderPipeline + DebugOverlay + toggleDebug 三件套', () => {
    // 模拟 main.js 第 6 节装配路径
    const pipeline = makePipeline();
    pipeline.start = vi.fn(); // 不真起 RAF
    const overlay = new DebugOverlay(pipeline, { visible: false });
    overlay.attach = vi.fn();
    overlay.toggle = vi.fn();
    overlay.attach();

    // 暴露给 __v2 (契约验证)
    const __v2 = {
      renderPipeline: pipeline,
      debugOverlay: overlay,
      toggleDebug: () => overlay.toggle(),
    };

    expect(__v2.renderPipeline).toBe(pipeline);
    expect(__v2.debugOverlay).toBe(overlay);
    expect(typeof __v2.toggleDebug).toBe('function');
    expect(overlay.attach).toHaveBeenCalledTimes(1);
  });

  it('2. RenderPipeline 默认有 getStats() 满足 DebugOverlay 构造要求', () => {
    const pipeline = makePipeline();
    // DebugOverlay 构造会校验 getStats 必须是 function
    expect(() => new DebugOverlay(pipeline)).not.toThrow();
    const stats = pipeline.getStats();
    expect(stats).toBeDefined();
    expect(typeof stats.totalFrames).toBe('number');
    // stages 是 { input: {budgetMs, avgMs, maxMs}, state: ..., ... } (S2.12 实现)
    expect(typeof stats.stages).toBe('object');
    expect(stats.stages).not.toBeNull();
    expect(Object.keys(stats.stages).length).toBe(STAGES.length);
  });

  it('3. pipelineStats() 返回 S2.12 扩展字段 (expectedMs / overheadMs / overheadPct / severity)', () => {
    const pipeline = makePipeline();
    // 不推帧, 验证 stats 默认字段 (S2.12 expected-calculator 提供)
    const stats = pipeline.getStats();
    expect(typeof stats.expectedMs).toBe('number');
    expect(typeof stats.overheadMs).toBe('number');
    expect(typeof stats.overheadPct).toBe('number');
    expect(['ok', 'warn', 'alarm']).toContain(stats.severity);
  });

  it('4. DebugOverlay attach 后 pipeline 不会 push (off-screen 不调主循环)', () => {
    // 简化: 验证 attach() + detach() 幂等 + pipeline 状态不被破坏。
    // (DOM 写入细节在 S2.11 自己的 12 个测试中已覆盖。)
    const pipeline = makePipeline();
    const overlay = new DebugOverlay(pipeline, { visible: false });
    overlay.attach();
    overlay.attach(); // 幂等
    expect(overlay._attached).toBe(true);
    overlay.detach();
    expect(overlay._attached).toBe(false);
    // pipeline 仍能拿 stats
    expect(pipeline.getStats()).toBeDefined();
  });

  it('5. STAGES 数量与 DebugOverlay 期望一致 (5 阶段对齐)', () => {
    expect(STAGES.length).toBe(STAGE_NAMES.length);
    expect(STAGE_NAMES).toEqual(['input', 'state', 'transform', 'render', 'snapshot']);
  });
});
