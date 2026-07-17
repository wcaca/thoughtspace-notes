/**
 * Spawn Phase Transition 测试 (S2.14)
 *
 * 验证:
 *   1. spawnSampleThought 后 progress=0, currentPhase=SEED, targetPhase=CRYSTAL
 *   2. tickPhaseTransitions 推进 (delta/0.8 比例)
 *   3. SEED phase + progress=0 → finalScale=0
 *   4. SEED phase + progress=0.5 → finalScale=displayScale*0.5
 *   5. CRYSTAL phase + progress=1 → finalScale=displayScale
 *   6. 重复 spawn 各自独立 progress
 *   7. startPhaseTransition 错 target 抛错
 *   8. _phaseProgressArr instanced attr 跟 transient 同步
 *   9. regression: 之前 tickPhaseTransition(CRYSTAL) 模式依然可工作 (老测试用)
 *
 * 配套: src/v2/main.js (spawnSampleThought) + src/v2/render/thought-mesh.js (_writeInstance + tickPhaseTransitions)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  ThoughtMeshRenderer,
} from '../../src/v2/render/thought-mesh.js';
import {
  Thought,
  ThoughtPhase,
} from '../../src/v2/core/thought.js';

function makeScene() {
  return new THREE.Scene();
}

describe('S2.14: spawn phase transition 行为', () => {
  describe('Thought.phase 起步与推进', () => {
    it('1. 新 Thought 默认 currentPhase=SEED, phaseTransitionProgress=0', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
      expect(t._transient.phaseTransitionProgress).toBe(0);
      expect(t._transient.targetPhase).toBeNull();
    });

    it('2. startPhaseTransition(CRYSTAL) 后 target=CRYSTAL, progress=0', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      expect(t._transient.targetPhase).toBe(ThoughtPhase.CRYSTAL);
      expect(t._transient.phaseTransitionProgress).toBe(0);
    });

    it('3. tickPhaseTransition(0.4) 后 progress=0.5 (400ms / 800ms)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);
      expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 5);
    });

    it('4. tickPhaseTransition(0.4)+tick(0.4) 后 progress=1, currentPhase=CRYSTAL', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);
      t.tickPhaseTransition(0.4);
      expect(t._transient.phaseTransitionProgress).toBe(1);
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
    });

    it('5. startPhaseTransition 错 target 抛错', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      expect(() => t.startPhaseTransition('NOT_A_PHASE')).toThrow();
    });

    it('6. 重复 startPhaseTransition(同 target) 不重置 progress', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);  // progress=0.5
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);  // 重复同 target
      expect(t._transient.phaseTransitionProgress).toBe(0.5);  // 不重置
    });
  });

  describe('ThoughtMeshRenderer 视觉: SEED 起步 scale=0', () => {
    let scene;
    let renderer;
    let mesh;

    beforeEach(() => {
      scene = makeScene();
      renderer = new ThoughtMeshRenderer({ scene, capacity: 10 });
    });

    it('7. SEED phase + progress=0 → finalScale=0 (隐)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      // currentPhase=SEED, progress=0 (默认)
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
      expect(t._transient.phaseTransitionProgress).toBe(0);
      // 读 _writeInstance 算出的 matrix 里的 scale
      const idx = renderer.upsert(t, { viewVertical: 0.5 });
      const matrix = new THREE.Matrix4();
      renderer.mesh.getMatrixAt(idx, matrix);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.x).toBeCloseTo(0, 5);
      expect(scale.y).toBeCloseTo(0, 5);
      expect(scale.z).toBeCloseTo(0, 5);
    });

    it('8. SEED phase + progress=0.5 → finalScale=displayScale*0.5 (半弹)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);  // progress=0.5
      // currentPhase 仍是 SEED (完成才切 CRYSTAL)
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
      expect(t._transient.phaseTransitionProgress).toBe(0.5);
      const displayScale = t.computeDisplayScale({ viewVertical: 0.5 });
      const idx = renderer.upsert(t, { viewVertical: 0.5 });
      const matrix = new THREE.Matrix4();
      renderer.mesh.getMatrixAt(idx, matrix);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      // SEED + 0.5 进度: phaseScaleMod = 0.5
      expect(scale.x).toBeCloseTo(displayScale * 0.5, 3);
    });

    it('9. CRYSTAL phase + progress=1 → finalScale=displayScale (完成)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.8);  // 完成
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
      expect(t._transient.phaseTransitionProgress).toBe(1);
      const displayScale = t.computeDisplayScale({ viewVertical: 0.5 });
      const idx = renderer.upsert(t, { viewVertical: 0.5 });
      const matrix = new THREE.Matrix4();
      renderer.mesh.getMatrixAt(idx, matrix);
      const scale = new THREE.Vector3();
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      expect(scale.x).toBeCloseTo(displayScale, 3);
    });

    it('10. _phaseProgressArr instanced attr 跟 transient 同步', () => {
      const t1 = new Thought({
        content: 'a',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t1.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t1.tickPhaseTransition(0.4);  // 0.5
      const idx1 = renderer.upsert(t1, { viewVertical: 0.5 });
      const arr = renderer._phaseProgressArr;
      expect(arr[idx1]).toBeCloseTo(0.5, 5);
    });

    it('11. tickPhaseTransitions(0.4) 推进多个 thought 各自 progress', () => {
      renderer.setThoughtRefs(new Map());
      const thoughts = [];
      for (let i = 0; i < 3; i++) {
        const t = new Thought({
          content: `t${i}`,
          layerId: 'L0',
          position: { vertical: 0.5, radial: 0.5, orbital: i * 0.5 },
        });
        t.startPhaseTransition(ThoughtPhase.CRYSTAL);
        renderer.upsert(t, { viewVertical: 0.5 });
        thoughts.push(t);
        renderer._thoughtRefs?.set(t.id, t);
      }
      // 重新注入 (upsert 后 _instanceByThoughtId 已有, setThoughtRefs 注入)
      const refs = new Map();
      thoughts.forEach((t) => refs.set(t.id, t));
      renderer.setThoughtRefs(refs);
      renderer.tickPhaseTransitions(0.4);
      thoughts.forEach((t) => {
        expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 5);
      });
    });
  });

  describe('regression: 老 tickPhaseTransition 模式依然工作', () => {
    it('12. tickPhaseTransition(CRYSTAL) 直接跳到 progress=1 (legacy)', () => {
      // 跟 S2.6 集成测试对齐: 老模式 (无 startPhaseTransition 直接 tick)
      //   期望 progress=1, currentPhase=CRYSTAL
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.tickPhaseTransition(ThoughtPhase.CRYSTAL);
      expect(t._transient.phaseTransitionProgress).toBe(1);
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
    });

    it('13. tickPhaseTransition(MEMORY) 跳到 progress=1 + currentPhase=MEMORY', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      t.tickPhaseTransition(ThoughtPhase.MEMORY);
      expect(t._transient.phaseTransitionProgress).toBe(1);
      expect(t._transient.currentPhase).toBe(ThoughtPhase.MEMORY);
    });
  });
});
