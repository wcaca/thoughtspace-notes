/**
 * [INPUT]: three, scene object, camera object
 * [OUTPUT]: createAmbientLife(scene, camera, bgColor) → { update(dt), setBreathing(bpm), breathingPhase }
 * [POS]: src/render/ambient-life.js — "存在感"引擎:呼吸节奏 + 微动漂移 + 深度场 + 粒子生命
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

const BREATHING_CYCLE = 4.2;
const DRIFT_SPEED = 0.4;
const DRIFT_RANGE = 1.8;
const MICRO_JITTER = 0.06;

export function createAmbientLife(scene, camera, bgBase = new THREE.Color(0x070912)) {
  let phase = 0;
  let bpm = 14;
  let breathingCycle = BREATHING_CYCLE;
  let breathingAmplitude = 0.06;
  let medLevel = 0;

  const bgTarget = new THREE.Color();
  const camBasePos = camera.position.clone();
  const driftOffset = new THREE.Vector3();
  const driftVelocity = new THREE.Vector3(
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2,
    (Math.random() - 0.5) * 0.2
  );

  function update(dt) {
    phase += dt;
    const cycleAttenuation = 1 - 0.4 * medLevel;
    const breath = Math.sin((phase / (breathingCycle * cycleAttenuation)) * Math.PI * 2);
    const breathVal = (breath + 1) / 2;
    const ampAttenuation = 1 - 0.5 * medLevel;

    if (scene.background && scene.background.isColor) {
      const hueShift = -0.08 * medLevel;
      bgTarget.copy(bgBase).offsetHSL(hueShift, -0.45 * medLevel, breathVal * breathingAmplitude * ampAttenuation);
      scene.background.copy(bgTarget);
    }

    if (scene.fog && scene.fog.isFogExp2) {
      scene.fog.density = (0.0006 + breathVal * 0.00035) * (1 + 0.3 * medLevel);
    }

    driftVelocity.x += (Math.random() - 0.5) * MICRO_JITTER * dt * 60;
    driftVelocity.y += (Math.random() - 0.5) * MICRO_JITTER * dt * 60;
    driftVelocity.z += (Math.random() - 0.5) * MICRO_JITTER * dt * 60;
    driftVelocity.clampLength(0, DRIFT_SPEED * (1 - 0.6 * medLevel));

    driftOffset.x += driftVelocity.x * dt;
    driftOffset.y += driftVelocity.y * dt;
    driftOffset.z += driftVelocity.z * dt;
    driftOffset.clampLength(0, DRIFT_RANGE * (1 - 0.5 * medLevel));

    if (Math.random() < 0.005) {
      driftVelocity.x *= -1;
      driftVelocity.y *= -1;
    }
    if (Math.random() < 0.008) {
      driftVelocity.z *= -0.7;
    }
  }

  function getBreathValue() {
    return (Math.sin((phase / breathingCycle) * Math.PI * 2) + 1) / 2;
  }

  function getBreathingPhase() {
    return phase % breathingCycle;
  }

  function setBreathing(b) {
    bpm = b;
    breathingCycle = 60 / Math.max(4, Math.min(40, b));
  }

  function setMeditation(level) {
    medLevel = Math.max(0, Math.min(1, level ?? 0));
  }

  function getMeditation() {
    return medLevel;
  }

  function getDriftOffset() {
    return driftOffset;
  }

  return { update, getBreathValue, getBreathingPhase, setBreathing, setMeditation, getMeditation, getDriftOffset, get breathingPhase() { return phase; } };
}
