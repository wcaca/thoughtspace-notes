/**
 * [INPUT]: three.js (renderer/camera/scene), 任何想接管的 v2/render 组件 (registerStage 注入回调)
 * [OUTPUT]: RenderPipeline 类 — 帧调度器(5 阶段+16ms 预算+每阶段计时)
 *   + stage 注册: registerStage(name, priority, fn) — 回调签名 fn(deltaMs, frameCtx)
 *   + 阶段: input → state → transform → render → snapshot
 *   + 预算: 总帧 16ms,单阶段超过 4ms warn (1ms warn for snapshot)
 *   + 暴露: getStats() → 每阶段耗时 + 帧率 + cache 命中率
 *   + frame 上下文: { frame, deltaMs, time, stageResults }
 *
 * [POS]: src/v2/render/render-pipeline.js, L2 渲染层,S2.10 排查基础组件,被 main.js 装配
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 排查方法论 §6.2 阶段集成 + 实现方案 §3.10 排查基础 render-pipeline
 *   - 5 阶段顺序固定 (input 先, snapshot 最后)
 *   - 阶段内回调顺序由 priority 升序决定
 *   - 单阶段耗时超 4ms 触发告警 (在 frameCtx.warns 数组里, 不 throw)
 *   - 帧总耗时超 16ms 同样 warn (不 throw, 让 render 走完)
 *   - cache 命中率: state 阶段计算 stateChangeChain 与上次是否相同
 *
 * 接入模式 (S2.10 验收):
 *   const pipeline = new RenderPipeline({ renderer, camera, scene });
 *   pipeline.registerStage('state', 10, (deltaMs, ctx) => orbitCamera.update(deltaMs));
 *   pipeline.registerStage('transform', 20, (deltaMs, ctx) => thoughtMesh.updateInstances(deltaMs, ctx));
 *   pipeline.start();  // 开始 requestAnimationFrame
 *
 * 与 S1 现有 animate() 关系:
 *   - 当前 main.js 6 段是单文件硬编码, S2.10 升级为注册式管线
 *   - 旧 animate() 中的 orbitCamera.update() / snapshotStore.captureIfNecessary() 全部转为 stage 回调
 *   - 旧 entities: new Map() 占位 → S2.11+ 接入真实实体
 *
 * @note(s2, decision, render-pipeline-5-stages, since:2026-07-11)
 *   S2.10 决策: 5 阶段 = input(0~1ms) / state(1~4ms) / transform(4~10ms) / render(10~14ms) / snapshot(14~16ms)。
 *   阶段固定顺序保证确定性,priority 在阶段内升序,允许同阶段多回调。
 *   不追求绝对 16ms,而是暴露每阶段耗时,让 AI 通过 __v2.renderPipeline.getStats() 自排查性能瓶颈。
 *
 * @note(s2, pitfall, dont-throw-on-overrun, since:2026-07-11)
 *   易错: 帧超预算时 throw 会让 render 半截崩溃。
 *   正确: 收集到 ctx.warns 数组,正常 render, 后续 __v2.renderPipeline.getStats() 暴露给 AI 排查。
 */

// ===== 5 阶段定义 =====

/** @type {ReadonlyArray<{name: string, budgetMs: number}>} */
export const STAGES = Object.freeze([
  { name: 'input',     budgetMs: 1  },
  { name: 'state',     budgetMs: 3  },
  { name: 'transform', budgetMs: 6  },
  { name: 'render',    budgetMs: 4  },
  { name: 'snapshot',  budgetMs: 2  },
]);

const FRAME_BUDGET_MS = 16;

// ===== RenderPipeline =====

/**
 * 帧调度管线
 *
 * 单向数据流:
 *   requestAnimationFrame → 5 阶段顺序执行 → renderer.render → stats 收集 → 下一帧
 *
 * 错误策略:
 *   - 单 stage 回调 throw → 捕获到 ctx.errors, 不影响其他 stage
 *   - 单 stage 超 budget → ctx.warns 收集, 不 throw
 *   - 帧总超时 → 仍 render, 记 warn
 */
export class RenderPipeline {
  /**
   * @param {Object} options
   * @param {Object} options.renderer - three.js WebGLRenderer (用于末阶段 render)
   * @param {Object} options.camera - three.js Camera
   * @param {Object} options.scene - three.js Scene
   * @param {Object} [options.snapshotStore] - SnapshotStore (snapshot 阶段调用,可选)
   * @param {number} [options.maxFramesHistory=120] - 保留多少帧 stats 历史
   */
  constructor({ renderer, camera, scene, snapshotStore = null, maxFramesHistory = 120 } = {}) {
    if (!renderer || !camera || !scene) {
      throw new Error('RenderPipeline: renderer/camera/scene 必填');
    }
    /** @type {Object} */
    this.renderer = renderer;
    /** @type {Object} */
    this.camera = camera;
    /** @type {Object} */
    this.scene = scene;
    /** @type {Object|null} */
    this.snapshotStore = snapshotStore;

    /** @type {Map<string, Array<{priority: number, fn: Function}>>} */
    this._stages = new Map();
    for (const stage of STAGES) {
      this._stages.set(stage.name, []);
    }

    this._running = false;
    this._frameHandle = null;
    this._frameCount = 0;
    this._lastTime = 0;
    this._startTime = 0;

    /** @type {Array<Object>} 保留最近 N 帧的 stats */
    this._frameHistory = [];
    this._maxFramesHistory = maxFramesHistory;

    /** @type {{totalFrames: number, totalOverruns: number, totalErrors: number, cacheHits: number, cacheMisses: number}} */
    this._aggregate = {
      totalFrames: 0,
      totalOverruns: 0,
      totalErrors: 0,
      cacheHits: 0,
      cacheMisses: 0,
    };
  }

  /**
   * 注册一个 stage 回调
   * @param {string} stage - 'input' | 'state' | 'transform' | 'render' | 'snapshot'
   * @param {number} priority - 同阶段内 priority 升序执行
   * @param {Function} fn - (deltaMs, frameCtx) => any
   */
  registerStage(stage, priority, fn) {
    if (!this._stages.has(stage)) {
      throw new Error(`RenderPipeline: 未知 stage "${stage}",合法值: ${STAGES.map(s => s.name).join(', ')}`);
    }
    if (typeof fn !== 'function') {
      throw new Error('RenderPipeline: fn 必须是函数');
    }
    const list = this._stages.get(stage);
    list.push({ priority, fn });
    list.sort((a, b) => a.priority - b.priority);
  }

  /**
   * 开始帧循环
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._startTime = performance.now();
    this._lastTime = this._startTime;
    if (typeof requestAnimationFrame === 'function') {
      this._frameHandle = requestAnimationFrame((t) => this._tick(t));
    } else {
      // 非浏览器环境 (node/SSR) 不实际循环, 仅设置标志供手动驱动
      this._frameHandle = null;
    }
  }

  /**
   * 停止帧循环
   */
  stop() {
    if (!this._running) return;
    this._running = false;
    if (this._frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this._frameHandle);
      this._frameHandle = null;
    }
  }

  /**
   * 单帧 tick (内部用)
   * @private
   */
  _tick(now) {
    // _tick 可被 start() (then _running=true) 或直接调用 (测试 / 手动驱动)
    // 不强制 _running, 允许 dry-run 测试
    const deltaMs = Math.min(64, now - this._lastTime); // cap at 64ms (slow tab 保护)
    this._lastTime = now;
    this._frameCount++;

    const frameCtx = {
      frame: this._frameCount,
      deltaMs,
      time: now,
      stageResults: Object.create(null),
      warns: [],
      errors: [],
    };

    // 5 阶段顺序执行
    let totalElapsed = 0;
    for (const stage of STAGES) {
      const stageStart = performance.now();
      const callbacks = this._stages.get(stage.name) ?? [];
      for (const { fn } of callbacks) {
        try {
          fn(deltaMs, frameCtx);
        } catch (err) {
          frameCtx.errors.push({ stage: stage.name, err });
          this._aggregate.totalErrors++;
        }
      }
      // 末阶段 (render) 真正调 three.js renderer
      if (stage.name === 'render') {
        try {
          this.renderer.render(this.scene, this.camera);
        } catch (err) {
          frameCtx.errors.push({ stage: 'render-render', err });
          this._aggregate.totalErrors++;
        }
      }
      // snapshot 阶段末: 调 snapshotStore (兼容旧 API)
      if (stage.name === 'snapshot' && this.snapshotStore) {
        try {
          this.snapshotStore.captureIfNecessary(deltaMs, 'timer', {
            frame: this._frameCount,
            timestamp: now,
            view: {
              cameraPos: { x: this.camera.position.x, y: this.camera.position.y, z: this.camera.position.z },
              cameraTarget: { x: 0, y: 0, z: 0 },
              orbitParam: null,
            },
            entities: new Map(),
            performance: { frameTime: totalElapsed + (performance.now() - stageStart) },
            userAction: null,
            yjsChanges: null,
            changeChainHead: null,
          });
        } catch (err) {
          frameCtx.errors.push({ stage: 'snapshot-capture', err });
          this._aggregate.totalErrors++;
        }
      }
      const stageElapsed = performance.now() - stageStart;
      frameCtx.stageResults[stage.name] = stageElapsed;
      totalElapsed += stageElapsed;
      if (stageElapsed > stage.budgetMs) {
        frameCtx.warns.push({ stage: stage.name, elapsed: stageElapsed, budget: stage.budgetMs });
        this._aggregate.totalOverruns++;
      }
    }

    if (totalElapsed > FRAME_BUDGET_MS) {
      frameCtx.warns.push({ stage: 'frame-total', elapsed: totalElapsed, budget: FRAME_BUDGET_MS });
      this._aggregate.totalOverruns++;
    }

    // 历史保留 N 帧
    this._frameHistory.push({
      frame: this._frameCount,
      deltaMs,
      totalMs: totalElapsed,
      stages: { ...frameCtx.stageResults },
      warnCount: frameCtx.warns.length,
      errorCount: frameCtx.errors.length,
    });
    if (this._frameHistory.length > this._maxFramesHistory) {
      this._frameHistory.shift();
    }
    this._aggregate.totalFrames++;

    // 只在 start() 调用后才续接下一帧 (手动 _tick 测试时停在这里)
    if (this._running && typeof requestAnimationFrame === 'function') {
      this._frameHandle = requestAnimationFrame((t) => this._tick(t));
    }
  }

  /**
   * 获取当前 stats
   * @returns {{totalFrames: number, totalOverruns: number, totalErrors: number, cacheHitRate: number, recentAvgMs: number, recentAvgFps: number, stages: Object, lastFrame: Object|null}}
   */
  getStats() {
    const recent = this._frameHistory.slice(-30);
    const totalCacheAttempts = this._aggregate.cacheHits + this._aggregate.cacheMisses;
    const cacheHitRate = totalCacheAttempts > 0
      ? this._aggregate.cacheHits / totalCacheAttempts
      : 0;
    const recentAvgMs = recent.length
      ? recent.reduce((s, f) => s + f.totalMs, 0) / recent.length
      : 0;
    // cap FPS 到 [0, 120], 防止极快帧测出大数
    const recentAvgFps = recentAvgMs > 0
      ? Math.min(120, Math.max(0, 1000 / recentAvgMs))
      : 0;
    const stages = {};
    for (const stage of STAGES) {
      const samples = recent.map(f => f.stages[stage.name] ?? 0).filter(v => v > 0);
      stages[stage.name] = {
        budgetMs: stage.budgetMs,
        avgMs: samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : 0,
        maxMs: samples.length ? Math.max(...samples) : 0,
      };
    }
    return {
      totalFrames: this._aggregate.totalFrames,
      totalOverruns: this._aggregate.totalOverruns,
      totalErrors: this._aggregate.totalErrors,
      cacheHitRate,
      recentAvgMs,
      recentAvgFps,
      stages,
      lastFrame: this._frameHistory.length ? this._frameHistory[this._frameHistory.length - 1] : null,
    };
  }

  /**
   * 缓存命中/未命中 (state 阶段回调可调用, 累计到 aggregate)
   * @param {boolean} hit
   */
  recordCacheAccess(hit) {
    if (hit) this._aggregate.cacheHits++;
    else this._aggregate.cacheMisses++;
  }

  /**
   * 获取 stage 列表
   * @returns {ReadonlyArray<{name: string, budgetMs: number}>}
   */
  static getStages() {
    return STAGES;
  }
}
