/**
 * 远景星尘 (Points)
 * [INPUT]: 无
 * [OUTPUT]: THREE.Points — "空间感"微光背景
 * [POS]: src/render/dust.js — Round 6
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as THREE from 'three';

export function createDust() {
  const count = 800;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 1500;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 800 + 100;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 1500;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fc8ff,
    size: 1.5,
    transparent: true,
    opacity: 0.6,
    sizeAttenuation: true,
  });
  return new THREE.Points(geom, mat);
}