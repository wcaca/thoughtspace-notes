/**
 * Phase Alpha Fade 测试 (S2.15)
 *
 * 验证:
 *   1. ThoughtMeshRenderer._computePhaseAlphaMod: SEED+0 → 0 (隐)
 *   2. _computePhaseAlphaMod: SEED+0.5 → 0.5
 *   3. _computePhaseAlphaMod: SEED+1 → 1.0 (完全可见)
 *   4. _computePhaseAlphaMod: CRYSTAL+0.5 → 0.4+0.6*0.5 = 0.7 (变实)
 *   5. _computePhaseAlphaMod: CRYSTAL+1 → 1.0
 *   6. _computePhaseAlphaMod: MEMORY+0 → 0.4 (相变起步)
 *   7. _computePhaseAlphaMod: MEMORY+1 → 1.0
 *   8. onBeforeCompile: material 有 onBeforeCompile hook 设置
 *   9. shader patch 包含 vAlphaMod varying + gl_FragColor.a *= vAlphaMod
 *   10. _phaseProgressArr instanced attr 已 setAttribute (跟 S2.14 同步)
 *
 * 配套: src/v2/render/thought-mesh.js (S2.15 _computePhaseAlphaMod + onBeforeCompile)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThoughtMeshRenderer,
  DEFAULT_OPACITY,
} from '../../src/v2/render/thought-mesh.js';
import {
  Thought,
  ThoughtPhase,
} from '../../src/v2/core/thought.js';

function makeScene() {
  // mock minimal THREE.Scene
  return {
    add: () => {},
    remove: () => {},
  };
}

function makeThought({ phase = ThoughtPhase.SEED, progress = 0, content = 'test' } = {}) {
  // 跳过完整 Space 集成, 只测纯函数
  const t = new Thought({
    id: `test-${Math.random().toString(36).slice(2, 8)}`,
    content,
    layerId: 'L0',
    config: { phase, radiusBase: 0.4 },
  });
  t._transient.currentPhase = phase;
  t._transient.phaseTransitionProgress = progress;
  return t;
}

describe('ThoughtMeshRenderer _computePhaseAlphaMod (S2.15)', () => {
  let renderer;
  beforeEach(() => {
    renderer = new ThoughtMeshRenderer({ scene: makeScene() });
  });

  it('SEED + 0 → 0 (隐)', () => {
    const t = makeThought({ phase: ThoughtPhase.SEED, progress: 0 });
    expect(renderer._computePhaseAlphaMod(t)).toBe(0);
  });

  it('SEED + 0.5 → 0.5 (淡入中)', () => {
    const t = makeThought({ phase: ThoughtPhase.SEED, progress: 0.5 });
    expect(renderer._computePhaseAlphaMod(t)).toBeCloseTo(0.5, 5);
  });

  it('SEED + 1 → 1.0 (完全可见)', () => {
    const t = makeThought({ phase: ThoughtPhase.SEED, progress: 1 });
    expect(renderer._computePhaseAlphaMod(t)).toBe(1);
  });

  it('CRYSTAL + 0.5 → 0.7 (变实中)', () => {
    const t = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 0.5 });
    expect(renderer._computePhaseAlphaMod(t)).toBeCloseTo(0.7, 5);
  });

  it('CRYSTAL + 1 → 1.0 (稳定)', () => {
    const t = makeThought({ phase: ThoughtPhase.CRYSTAL, progress: 1 });
    expect(renderer._computePhaseAlphaMod(t)).toBe(1);
  });

  it('MEMORY + 0 → 0.4 (相变起步)', () => {
    const t = makeThought({ phase: ThoughtPhase.MEMORY, progress: 0 });
    expect(renderer._computePhaseAlphaMod(t)).toBeCloseTo(0.4, 5);
  });

  it('MEMORY + 1 → 1.0 (变实完成)', () => {
    const t = makeThought({ phase: ThoughtPhase.MEMORY, progress: 1 });
    expect(renderer._computePhaseAlphaMod(t)).toBe(1);
  });
});

describe('ThoughtMeshRenderer shader patch (S2.15 onBeforeCompile)', () => {
  it('material 有 onBeforeCompile hook (function type)', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    expect(typeof renderer.material.onBeforeCompile).toBe('function');
  });

  it('onBeforeCompile 注入 vertex varying + fragment alpha 调整', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    // mock shader
    const shader = {
      vertexShader: '#include <common>\n#include <begin_vertex>\n',
      fragmentShader: '#include <common>\n#include <output_fragment>\n',
    };
    renderer.material.onBeforeCompile(shader);
    expect(shader.vertexShader).toContain('attribute float aPhaseProgress');
    expect(shader.vertexShader).toContain('varying float vAlphaMod');
    expect(shader.vertexShader).toContain('vAlphaMod = 0.4 + 0.6 * aPhaseProgress');
    expect(shader.fragmentShader).toContain('varying float vAlphaMod');
    expect(shader.fragmentShader).toContain('gl_FragColor.a *= vAlphaMod');
  });

  it('material 是 transparent (允许 alpha 修改)', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    expect(renderer.material.transparent).toBe(true);
  });

  it('default opacity 正常设置', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    expect(renderer.material.opacity).toBe(DEFAULT_OPACITY);
  });
});

describe('ThoughtMeshRenderer _phaseProgressArr 同步 (S2.15 跟 S2.14 一致)', () => {
  it('aPhaseProgress instanced attribute 已 setAttribute', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    expect(renderer.geometry.attributes.aPhaseProgress).toBeDefined();
    expect(renderer.geometry.attributes.aPhaseProgress.array.length).toBe(renderer.capacity);
  });

  it('upsert + 写 instance: _phaseProgressArr 跟 thought._transient 同步', () => {
    const renderer = new ThoughtMeshRenderer({ scene: makeScene() });
    const t = makeThought({ phase: ThoughtPhase.SEED, progress: 0.3, content: 'alpha-test' });
    renderer.upsert(t);
    expect(renderer._phaseProgressArr[0]).toBe(0.3);
    t._transient.phaseTransitionProgress = 0.7;
    renderer.upsert(t);
    expect(renderer._phaseProgressArr[0]).toBe(0.7);
  });
});
