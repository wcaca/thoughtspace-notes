/**
 * [INPUT]: three.js, thought数据
 * [OUTPUT]: 3D念头脑球 — createThoughtMesh(thought) → THREE.Mesh(发光球+文字精灵)
 * [POS]: src/render 下,被 src/main.js 场景循环消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

const TEMP_COLORS = {
  high: new THREE.Color('#e8a865'),   // 暖金 · 高温
  mid: new THREE.Color('#8b90ad'),    // 中灰 · 常温
  low: new THREE.Color('#2a4a6a')     // 深蓝 · 低温
};

const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
const glowGeo = new THREE.SphereGeometry(1, 16, 16);

export function createThoughtMesh(thought) {
  const group = new THREE.Group();

  const temp = thought.temperature ?? 1;
  const mass = thought.mass ?? 1;
  const radius = 12 + mass * 2;

  group.userData = { thoughtId: thought.id, radius, isDragging: false };

  // 主体光球
  const color = temp > 0.7 ? TEMP_COLORS.high.clone().lerp(TEMP_COLORS.mid, (1 - temp) / 0.3) :
               temp > 0.3 ? TEMP_COLORS.mid.clone().lerp(TEMP_COLORS.low, (0.7 - temp) / 0.4) :
               TEMP_COLORS.low.clone();

  const mat = new THREE.MeshPhongMaterial({
    color,
    transparent: true,
    opacity: 0.7 + temp * 0.3,
    emissive: color,
    emissiveIntensity: 0.3 + temp * 0.5,
    shininess: 60
  });
  const sphere = new THREE.Mesh(sphereGeo, mat);
  sphere.scale.setScalar(radius);
  sphere.castShadow = true;
  sphere.name = 'thought-core';
  group.add(sphere);

  // 光晕
  const glowMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.12 + temp * 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.scale.setScalar(radius * 1.6);
  glow.name = 'thought-glow';
  group.add(glow);

  group.position.set(thought.x ?? 0, thought.y ?? 0, thought.z ?? 0);

  return group;
}

export function updateThoughtMesh(group, thought) {
  const temp = thought.temperature ?? 1;
  const mass = thought.mass ?? 1;
  const radius = 12 + mass * 2;

  const color = temp > 0.7 ? TEMP_COLORS.high.clone().lerp(TEMP_COLORS.mid, (1 - temp) / 0.3) :
               temp > 0.3 ? TEMP_COLORS.mid.clone().lerp(TEMP_COLORS.low, (0.7 - temp) / 0.4) :
               TEMP_COLORS.low.clone();

  const sphere = group.getObjectByName('thought-core');
  if (sphere) {
    sphere.material.color.copy(color);
    sphere.material.emissive.copy(color);
    sphere.material.emissiveIntensity = 0.3 + temp * 0.5;
    sphere.material.opacity = 0.7 + temp * 0.3;
    sphere.scale.setScalar(radius);
  }

  const glow = group.getObjectByName('thought-glow');
  if (glow) {
    glow.material.color.copy(color);
    glow.material.opacity = 0.12 + temp * 0.18;
    glow.scale.setScalar(radius * 1.6);
  }

  group.position.lerp(new THREE.Vector3(thought.x ?? 0, thought.y ?? 0, thought.z ?? 0), 0.3);
}

export function highlightThought(group) {
  const glow = group.getObjectByName('thought-glow');
  if (glow) {
    glow.material.opacity = 0.5;
    glow.scale.setScalar((group.userData.radius || 12) * 2.5);
  }
}

export function unhighlightThought(group) {
  const glow = group.getObjectByName('thought-glow');
  if (glow) {
    glow.material.opacity = 0.18;
    glow.scale.setScalar((group.userData.radius || 12) * 1.6);
  }
}
