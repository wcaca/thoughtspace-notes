/**
 * 三件套交互: wheel 缩放 + 空白平移 + 拖 Thought
 * [INPUT]: { canvas, camera, scene, onThoughtDrag, onZoomChange }
 * [OUTPUT]: attachInteraction() 挂载事件
 * [POS]: src/render/interaction.js — Round 6
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as THREE from 'three';
import { zoomCamera, panCamera } from './scene.js';

export function attachInteraction({ canvas, camera, scene, onThoughtDrag, onZoomChange }) {
  let downPos = null;
  let draggedThought = null;
  let dragging = false;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function getThoughtAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = [];
    scene.traverse((o) => {
      if (o.userData && o.userData.thoughtId) meshes.push(o);
    });
    const hits = raycaster.intersectObjects(meshes, true);
    return hits.length > 0 ? hits[0] : null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY };
    draggedThought = getThoughtAt(e.clientX, e.clientY);
    dragging = false;
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!downPos) return;
    const dx = e.clientX - downPos.x;
    const dy = e.clientY - downPos.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragging = true;

    if (draggedThought && dragging) {
      const target = draggedThought.object;
      const rect = canvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const point = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(plane, point)) {
        let group = target;
        while (group.parent && !(group.userData && group.userData.thoughtId)) {
          group = group.parent;
        }
        if (group.userData && group.userData.thoughtId) {
          group.position.x = point.x;
          group.position.y = point.y;
          if (onThoughtDrag) onThoughtDrag(group.userData.thoughtId, point);
        }
      }
    } else if (!draggedThought && dragging) {
      panCamera(camera, e.clientX - downPos.x, e.clientY - downPos.y);
      downPos.x = e.clientX;
      downPos.y = e.clientY;
    }
  });

  canvas.addEventListener('pointerup', () => {
    downPos = null;
    draggedThought = null;
    dragging = false;
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      // deltaY < 0 (wheel up) → zoom in (factor > 1); deltaY > 0 (wheel down) → zoom out (factor < 1)
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      zoomCamera(camera, factor);
      const dist = camera.position.length();
      if (onZoomChange) onZoomChange(dist);
    },
    { passive: false }
  );
}