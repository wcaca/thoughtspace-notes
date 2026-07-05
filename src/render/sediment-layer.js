/**
 * [INPUT]: three.js, scene, thoughts
 * [OUTPUT]: 沉积层渲染 — 把温度<0.3的念头标记,添加下沉粒子效果
 * [POS]: src/render 下,被 src/main.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

export function createSedimentLayer(scene) {
  const sedimentParticles = new THREE.Group();
  sedimentParticles.name = 'sediment-layer';
  scene.add(sedimentParticles);

  // 底部"沉积床" — 半透明暗平面
  const bedGeo = new THREE.PlaneGeometry(1000, 1000);
  const bedMat = new THREE.MeshBasicMaterial({
    color: 0x0a1020,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const bed = new THREE.Mesh(bedGeo, bedMat);
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -250;
  bed.name = 'sediment-bed';
  sedimentParticles.add(bed);

  return {
    update(thoughts, meshesById) {
      // 清理旧的沉积粒子
      while (sedimentParticles.children.length > 1) {
        const child = sedimentParticles.children[sedimentParticles.children.length - 1];
        if (child.name !== 'sediment-bed') {
          sedimentParticles.remove(child);
        } else {
          break;
        }
      }

      for (const t of thoughts) {
        if ((t.temperature ?? 1) >= 0.3) continue;
        const group = meshesById.get(t.id);
        if (!group) continue;

        // 在念头下方生成下降轨迹粒子
        const particle = new THREE.Mesh(
          new THREE.SphereGeometry(1.5, 4, 4),
          new THREE.MeshBasicMaterial({
            color: 0x2a4a6a,
            transparent: true,
            opacity: 0.15,
            depthWrite: false
          })
        );
        particle.position.copy(group.position);
        particle.position.y += 20;
        particle.name = 'sediment-drop';
        sedimentParticles.add(particle);
      }
    }
  };
}
