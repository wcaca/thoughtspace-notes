/**
 * 节律粒子 (背景呼吸)
 * [INPUT]: 无
 * [OUTPUT]: THREE.Points + updateBreathParticles(points, time)
 * [POS]: src/render/breath-particles.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 200 颗粒子,环形分布在远处 (r=400-1000),
 * 每颗有独立 speed, 位置以 sin/cos 微微波动,
 * 表现"空间的呼吸"。
 */
import * as THREE from 'three';

export function createBreathParticles() {
  const count = 200;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const speeds = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const r = 400 + Math.random() * 600;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3 + 0] = Math.cos(angle) * r;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 600;
    positions[i * 3 + 2] = Math.sin(angle) * r;
    speeds[i] = 0.5 + Math.random() * 1.5;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.userData.speeds = speeds;
  geom.userData.phases = phases;
  geom.userData.basePositions = positions.slice();

  const mat = new THREE.PointsMaterial({
    color: 0x9fc8ff,
    size: 1.8,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
    depthWrite: false,
  });
  const points = new THREE.Points(geom, mat);
  points.name = 'breath-particles';
  points.renderOrder = -1; // 在雾色背景上,不挡念头
  return points;
}

// [每帧调用] - 位置以 sin/cos 微微波动
export function updateBreathParticles(points, time) {
  if (!points || !points.geometry) return;
  const positions = points.geometry.attributes.position.array;
  const base = points.geometry.userData.basePositions;
  const speeds = points.geometry.userData.speeds;
  const phases = points.geometry.userData.phases;
  if (!base || !speeds || !phases) return;
  for (let i = 0; i < speeds.length; i++) {
    const phase = phases[i] + (time * 0.0005 * speeds[i]);
    positions[i * 3 + 0] = base[i * 3 + 0] + Math.sin(phase) * 8;
    positions[i * 3 + 1] = base[i * 3 + 1] + Math.cos(phase * 0.7) * 4;
    positions[i * 3 + 2] = base[i * 3 + 2] + Math.sin(phase * 0.5) * 8;
  }
  points.geometry.attributes.position.needsUpdate = true;
}