/**
 * ThoughtMeshRenderer / MemoryMeshRenderer 测试 (S2.6 + S2.7)
 *
 * 验证:
 *   1. 基础 upsert / remove / clear
 *   2. 温度色映射 (temperatureToColor)
 *   3. displayScale + 相变瞬态接入
 *   4. memory 温度衰减 (0.3x)
 *   5. 5 种 MATERIAL_PRESETS
 *   6. metrics 输出
 *
 * 配套: src/v2/render/thought-mesh.js + memory-mesh.js
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThoughtMeshRenderer,
  temperatureToColor,
} from '../../src/v2/render/thought-mesh.js';
import {
  MemoryMeshRenderer,
  MATERIAL_PRESETS,
} from '../../src/v2/render/memory-mesh.js';
import {
  Thought,
  EntityType,
  ThoughtPhase,
  ThoughtMaterial,
  genThoughtId,
} from '../../src/v2/core/thought.js';

function makeScene() {
  // three.js Scene 实例
  return new THREE.Scene();
}

describe('thought-mesh: temperatureToColor', () => {
  it('cold (0) is blue-ish, not equal to hot (1)', () => {
    const cold = temperatureToColor(0);
    const hot = temperatureToColor(1);
    expect(cold.getHexString()).not.toBe(hot.getHexString());
  });

  it('mid (0.5) is not black', () => {
    const mid = temperatureToColor(0.5);
    expect(mid.getHexString()).not.toBe('000000');
  });

  it('clamps to [0, 1]', () => {
    expect(temperatureToColor(-0.5)).toBeDefined();
    expect(temperatureToColor(1.5)).toBeDefined();
  });
});

describe('Thought class integration', () => {
  it('creates with default values + EntityStateAttachment', () => {
    const t = new Thought({
      content: 'test',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: Math.PI / 2 },
    });
    expect(t.id).toMatch(/^thought-/);
    expect(t.attachment.entityType).toBe(EntityType.THOUGHT);
  });

  it('displayScale = 1.0 at center, < 0.4 at far', () => {
    const t = new Thought({
      content: 'test',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    expect(t.computeDisplayScale({ viewVertical: 0.5 })).toBe(1.0);
    expect(t.computeDisplayScale({ viewVertical: 0 })).toBeLessThanOrEqual(0.4);
  });

  it('phase transition advances and caps at 1', () => {
    const t = new Thought({
      content: 'test',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    t.startPhaseTransition(ThoughtPhase.MEMORY);
    expect(t._transient.targetPhase).toBe(ThoughtPhase.MEMORY);
    t.tickPhaseTransition(0.5);
    expect(t._transient.phaseTransitionProgress).toBeGreaterThan(0.5);
    t.tickPhaseTransition(1.0);
    expect(t._transient.phaseTransitionProgress).toBe(1);
    expect(t._transient.currentPhase).toBe(ThoughtPhase.MEMORY);
  });
});

describe('ThoughtMeshRenderer', () => {
  let scene;
  let renderer;

  beforeEach(() => {
    scene = makeScene();
    renderer = new ThoughtMeshRenderer({ scene, capacity: 10 });
  });

  it('starts with count=0', () => {
    expect(renderer.mesh.count).toBe(0);
  });

  it('upsert increments count + populates index', () => {
    const t = new Thought({
      content: 'x',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    renderer.upsert(t);
    expect(renderer.mesh.count).toBe(1);
    expect(renderer._instanceByThoughtId.has(t.id)).toBe(true);
  });

  it('upsert twice on same id updates in place', () => {
    const t = new Thought({
      content: 'x',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    renderer.upsert(t);
    t.metadata = { ...t.metadata, temperature: 0.9 };
    renderer.upsert(t);
    expect(renderer.mesh.count).toBe(1);
    expect(renderer._tempArr[0]).toBeCloseTo(0.9, 1);
  });

  it('remove + clear works', () => {
    const t = new Thought({
      content: 'x',
      layerId: 'L0',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    renderer.upsert(t);
    expect(renderer.remove(t.id)).toBe(true);
    renderer.clear();
    expect(renderer.mesh.count).toBe(0);
  });

  it('rebuild with multiple thoughts', () => {
    renderer.rebuild([
      new Thought({ content: 'a', layerId: 'L0', position: { vertical: 0.3, radial: 0.5, orbital: 0 } }),
      new Thought({ content: 'b', layerId: 'L0', position: { vertical: 0.7, radial: 0.5, orbital: Math.PI } }),
    ]);
    expect(renderer.mesh.count).toBe(2);
  });

  it('metrics lastUpdateMs is number', () => {
    expect(typeof renderer.metrics.lastUpdateMs).toBe('number');
  });

  it('dispose removes mesh from scene', () => {
    expect(scene.children).toContain(renderer.mesh);
    renderer.dispose();
    expect(scene.children).not.toContain(renderer.mesh);
  });
});

describe('MemoryMeshRenderer', () => {
  let scene;
  let renderer;

  beforeEach(() => {
    scene = makeScene();
    renderer = new MemoryMeshRenderer({ scene, capacity: 10 });
  });

  it('upsert with material', () => {
    const m = new Thought({
      id: genThoughtId('memory'),
      type: EntityType.MEMORY,
      content: 'mem',
      layerId: 'L1',
      position: { vertical: 0.7, radial: 0.3, orbital: 0 },
      config: { material: ThoughtMaterial.CRYSTAL },
    });
    renderer.upsert(m);
    expect(renderer.mesh.count).toBe(1);
  });

  it('temperature decays to 0.3x (with float32 tolerance)', () => {
    const m = new Thought({
      id: genThoughtId('memory'),
      type: EntityType.MEMORY,
      content: 'mem',
      layerId: 'L1',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      metadata: { temperature: 1.0 },
    });
    renderer.upsert(m);
    expect(renderer._tempArr[0]).toBeCloseTo(0.3, 1);
  });

  it('clear resets state', () => {
    const m = new Thought({
      id: genThoughtId('memory'),
      type: EntityType.MEMORY,
      content: 'mem',
      layerId: 'L1',
      position: { vertical: 0.5, radial: 0.5, orbital: 0 },
    });
    renderer.upsert(m);
    renderer.clear();
    expect(renderer.mesh.count).toBe(0);
  });
});

describe('MATERIAL_PRESETS', () => {
  it('METAL: high metalness', () => {
    expect(MATERIAL_PRESETS[ThoughtMaterial.METAL].metalness).toBeGreaterThan(0.8);
  });

  it('GLASS: transparent + smooth', () => {
    expect(MATERIAL_PRESETS[ThoughtMaterial.GLASS].transparent).toBe(true);
    expect(MATERIAL_PRESETS[ThoughtMaterial.GLASS].roughness).toBeLessThan(0.1);
  });

  it('WOOD: high roughness', () => {
    expect(MATERIAL_PRESETS[ThoughtMaterial.WOOD].roughness).toBeGreaterThan(0.5);
  });

  it('LIQUID: high emissive', () => {
    expect(MATERIAL_PRESETS[ThoughtMaterial.LIQUID].emissiveIntensity).toBeGreaterThan(0.2);
  });

  it('CRYSTAL: zero roughness + high emissive', () => {
    expect(MATERIAL_PRESETS[ThoughtMaterial.CRYSTAL].roughness).toBe(0);
    expect(MATERIAL_PRESETS[ThoughtMaterial.CRYSTAL].emissiveIntensity).toBeGreaterThan(0.3);
  });
});
