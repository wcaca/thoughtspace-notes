/**
 * Spawn Phase Transition 测试 (S2.14)
 *
 * 验证:
 *   1. Thought 默认 currentPhase = config.phase (默认 CRYSTAL)
 *   2. 显式 config.phase=SEED 后 currentPhase=SEED
 *   3. startPhaseTransition(CRYSTAL) 后 target=CRYSTAL, progress=0
 *   4. tickPhaseTransition(0.4) 后 progress=0.5
 *   5. tickPhaseTransition(0.4)+tick(0.4) 后 progress=1, currentPhase=CRYSTAL
 *   6. startPhaseTransition 错 target 抛错
 *   7. startPhaseTransition 切换 target (SEED→MEMORY) 重置 progress=0
 *   8. ThoughtMeshRenderer._computePhaseScaleMod: SEED+0 → 0
 *   9. ThoughtMeshRenderer._computePhaseScaleMod: SEED+0.5 → 0.5
 *   10. ThoughtMeshRenderer._computePhaseScaleMod: CRYSTAL+1 → 1.0
 *   11. _phaseProgressArr instanced attr 跟 transient 同步
 *   12. tickPhaseTransitions 推进多个 thought 各自 progress
 *
 * 配套: src/v2/main.js (spawnSampleThought) + src/v2/render/thought-mesh.js (_computePhaseScaleMod + tickPhaseTransitions)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ThoughtMeshRenderer,
} from '../../src/v2/render/thought-mesh.js';
import {
  Thought,
  ThoughtPhase,
} from '../../src/v2/core/thought.js';

function makeScene() {
  // 实际用 stub scene (测试不需要 WebGL)
  return { add: () => {}, remove: () => {} };
}

describe('S2.14: spawn phase transition 行为', () => {
  describe('Thought.phase 起步与推进', () => {
    it('1. Thought 默认 currentPhase = config.phase (默认 CRYSTAL)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
      expect(t._transient.phaseTransitionProgress).toBe(0);
      expect(t._transient.targetPhase).toBe(ThoughtPhase.CRYSTAL);
    });

    it('2. 显式 config.phase=SEED 后 currentPhase=SEED, targetPhase=SEED', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
      expect(t._transient.phaseTransitionProgress).toBe(0);
      expect(t._transient.targetPhase).toBe(ThoughtPhase.SEED);
    });

    it('3. startPhaseTransition(CRYSTAL) 从 SEED 起步后 target=CRYSTAL, progress=0', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      expect(t._transient.targetPhase).toBe(ThoughtPhase.CRYSTAL);
      expect(t._transient.phaseTransitionProgress).toBe(0);
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
    });

    it('4. tickPhaseTransition(0.4) 后 progress=0.5 (400ms / 800ms)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);
      expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 5);
    });

    it('5. tickPhaseTransition(0.4)+tick(0.4) 后 progress=1, currentPhase=CRYSTAL', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);
      t.tickPhaseTransition(0.4);
      expect(t._transient.phaseTransitionProgress).toBe(1);
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
    });

    it('6. startPhaseTransition 错 target 抛错', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
      });
      expect(() => t.startPhaseTransition('NOT_A_PHASE')).toThrow();
    });

    it('7. startPhaseTransition 切换 target (SEED→MEMORY) 重置 progress=0', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);  // progress=0.5
      // 切换 target (中途换方向)
      t.startPhaseTransition(ThoughtPhase.MEMORY);
      expect(t._transient.targetPhase).toBe(ThoughtPhase.MEMORY);
      expect(t._transient.phaseTransitionProgress).toBe(0);  // 重置
    });
  });

  describe('ThoughtMeshRenderer._computePhaseScaleMod (S2.14 视觉核心)', () => {
    let scene;
    let renderer;

    beforeEach(() => {
      scene = makeScene();
      renderer = new ThoughtMeshRenderer({ scene, capacity: 10 });
    });

    it('8. SEED phase + progress=0 → scaleMod=0 (隐)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      // currentPhase=SEED, progress=0
      expect(renderer._computePhaseScaleMod(t)).toBe(0);
    });

    it('9. SEED phase + progress=0.5 → scaleMod=0.5 (半弹)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);  // progress=0.5
      // currentPhase 仍 SEED
      expect(t._transient.currentPhase).toBe(ThoughtPhase.SEED);
      expect(renderer._computePhaseScaleMod(t)).toBeCloseTo(0.5, 5);
    });

    it('10. CRYSTAL phase + progress=1 → scaleMod=1.0 (完成)', () => {
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.8);  // 完成
      expect(t._transient.currentPhase).toBe(ThoughtPhase.CRYSTAL);
      expect(renderer._computePhaseScaleMod(t)).toBe(1.0);
    });

    it('11. CRYSTAL phase + progress=0.5 (中途切) → scaleMod=0.85 (0.7+0.3*0.5)', () => {
      // 其他相变中的视觉: scale 0.7 → 1.0 收缩感
      const t = new Thought({
        content: 'test',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        // 默认 CRYSTAL, 然后 startPhaseTransition(MEMORY)
      });
      t.startPhaseTransition(ThoughtPhase.MEMORY);
      t.tickPhaseTransition(0.4);  // progress=0.5
      // currentPhase=CRYSTAL (未完成), progress=0.5
      expect(renderer._computePhaseScaleMod(t)).toBeCloseTo(0.85, 5);
    });

    it('12. _phaseProgressArr instanced attr 跟 transient 同步', () => {
      const t = new Thought({
        content: 'a',
        layerId: 'L0',
        position: { vertical: 0.5, radial: 0.5, orbital: 0 },
        config: { phase: ThoughtPhase.SEED },
      });
      t.startPhaseTransition(ThoughtPhase.CRYSTAL);
      t.tickPhaseTransition(0.4);  // 0.5
      const idx = renderer.upsert(t, { viewVertical: 0.5 });
      const arr = renderer._phaseProgressArr;
      expect(arr[idx]).toBeCloseTo(0.5, 5);
    });

    it('13. tickPhaseTransitions(0.4) 推进多个 thought 各自 progress', () => {
      const thoughts = [];
      for (let i = 0; i < 3; i++) {
        const t = new Thought({
          content: `t${i}`,
          layerId: 'L0',
          position: { vertical: 0.5, radial: 0.5, orbital: i * 0.5 },
          config: { phase: ThoughtPhase.SEED },
        });
        t.startPhaseTransition(ThoughtPhase.CRYSTAL);
        renderer.upsert(t, { viewVertical: 0.5 });
        thoughts.push(t);
      }
      const refs = new Map();
      thoughts.forEach((t) => refs.set(t.id, t));
      renderer.setThoughtRefs(refs);
      renderer.tickPhaseTransitions(0.4);
      thoughts.forEach((t) => {
        expect(t._transient.phaseTransitionProgress).toBeCloseTo(0.5, 5);
      });
    });
  });
});
