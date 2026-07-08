/**
 * 框架拖拽 + 吸附
 * [INPUT]: { canvas, camera, frames, snapMarkers, scene }
 * [OUTPUT]: attachFrameDrag() 挂载 pointer 事件
 * [POS]: src/render/frame-drag.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 流程:
 *  1. pointerdown: raycast 命中 framework mesh → 记录为 draggingFrame
 *  2. pointermove: 把鼠标投影到 z=0 平面, 跟随移动; 显示 snap marker
 *  3. pointerup: 检查 getNearestSnap, 如果在重力井内 (30px) → snap
 */
import * as THREE from 'three';
import { getNearestSnap, updateSnapMarkers } from './snap-points.js';

const SNAP_THRESHOLD = 30;

export function attachFrameDrag({ canvas, camera, frames, snapMarkers, scene }) {
  let draggingFrame = null;
  let dragOffset = new THREE.Vector3();
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0); // z=0 平面

  // [通过 raycast 找到指针下的 frame mesh]
  function getFrameAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const meshes = [];
    scene.traverse((o) => {
      if (o.userData && o.userData.isFrame) meshes.push(o);
    });
    const hits = raycaster.intersectObjects(meshes, true);
    if (hits.length === 0) return null;
    let obj = hits[0].object;
    // 向上找 userData.isFrame 的祖先
    while (obj && (!obj.userData || !obj.userData.isFrame)) {
      obj = obj.parent;
    }
    return obj || null;
  }

  // [把客户端坐标投影到 z=0 平面]
  function projectToDragPlane(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, point)) {
      return point;
    }
    return null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const frameMesh = getFrameAt(e.clientX, e.clientY);
    if (!frameMesh) return;
    draggingFrame = frameMesh;
    canvas.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    const worldPos = projectToDragPlane(e.clientX, e.clientY);
    if (worldPos) {
      dragOffset.copy(frameMesh.position).sub(worldPos);
    } else {
      dragOffset.set(0, 0, 0);
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!draggingFrame) {
      // hover 时光标变 grab
      const frameMesh = getFrameAt(e.clientX, e.clientY);
      canvas.style.cursor = frameMesh ? 'grab' : 'default';
      return;
    }
    const worldPos = projectToDragPlane(e.clientX, e.clientY);
    if (!worldPos) return;
    draggingFrame.position.copy(worldPos).add(dragOffset);
    updateSnapMarkers(snapMarkers, draggingFrame, draggingFrame.position);
  });

  function endDrag() {
    if (draggingFrame) {
      // 检查是否需要 snap
      const { snap, withinGravity, distance } = getNearestSnap(draggingFrame.position);
      if (snap && withinGravity) {
        draggingFrame.position.set(snap.x, snap.y, snap.z);
        // 找到对应 Frame 实例,更新 attachedPosition + 旋转
        const frameInstance = frames.find((f) => f.mesh === draggingFrame);
        if (frameInstance) {
          frameInstance.attachTo(snap);
        }
      }
      updateSnapMarkers(snapMarkers, null, draggingFrame.position);
    }
    draggingFrame = null;
    canvas.style.cursor = 'default';
    document.body.style.cursor = 'default';
  }

  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointerleave', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  return {
    isDragging: () => draggingFrame !== null,
  };
}