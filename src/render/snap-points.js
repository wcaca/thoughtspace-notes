/**
 * 4 个固定吸附位 + 重力井
 * [INPUT]: scene 尺寸
 * [OUTPUT]: SNAP_POSITIONS + getNearestSnap(currentPos) + createSnapMarkers + updateSnapMarkers
 * [POS]: src/render/snap-points.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 吸附位 4 个 (top/bottom/left/right):
 *  - top:    y=+110 (水平面朝下)
 *  - right:  x=+160 (垂直面朝内)
 *  - bottom: y=-110 (水平面朝上)
 *  - left:   x=-160 (垂直面朝内)
 *
 * 重力井: 吸附位周围 30px 内自动 snap。
 */
import * as THREE from 'three';

export const SNAP_POSITIONS = [
  { id: 'top',    name: '顶部', x: 0,    y: 110, z: 0, side: 'top' },
  { id: 'right',  name: '右侧', x: 160,  y: 0,   z: 0, side: 'right' },
  { id: 'bottom', name: '底部', x: 0,    y: -110, z: 0, side: 'bottom' },
  { id: 'left',   name: '左侧', x: -160, y: 0,   z: 0, side: 'left' },
];

const SNAP_RADIUS = 30; // 重力井半径(单位:世界坐标 px)

// [最近吸附位 + 距离 + 是否在重力井内]
export function getNearestSnap(currentPos) {
  let nearest = null;
  let minDist = Infinity;
  for (const sp of SNAP_POSITIONS) {
    const d = distance(currentPos, sp);
    if (d < minDist) {
      minDist = d;
      nearest = sp;
    }
  }
  return { snap: nearest, distance: minDist, withinGravity: minDist <= SNAP_RADIUS };
}

// [所有吸附位 + 当前距离 + 是否 active]
export function getSnapHighlights(currentPos) {
  return SNAP_POSITIONS.map((sp) => {
    const d = distance(currentPos, sp);
    return { ...sp, distance: d, active: d <= SNAP_RADIUS };
  });
}

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

// [创建 4 个吸附位可视化标记] - 只在拖拽时显示
export function createSnapMarkers(scene) {
  const markers = [];
  for (const sp of SNAP_POSITIONS) {
    const geom = new THREE.RingGeometry(8, 14, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x7fe0c9,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const ring = new THREE.Mesh(geom, mat);
    ring.position.set(sp.x, sp.y, sp.z);
    // 旋转: 水平吸附位(top/bottom) → 面朝相机(z 方向), 垂直吸附位 → 同样面朝相机
    ring.lookAt(0, 0, 200); // 默认朝相机方向
    ring.renderOrder = 90;
    scene.add(ring);
    markers.push({ snap: sp, ring });
  }
  return markers;
}

// [更新吸附位标记状态] - 拖拽时显示距离和 active 状态
export function updateSnapMarkers(markers, draggingFrame, currentPos) {
  for (const m of markers) {
    if (!draggingFrame) {
      m.ring.material.opacity = 0;
      continue;
    }
    const d = distance(currentPos, m.snap);
    const withinGravity = d <= SNAP_RADIUS;
    m.ring.material.opacity = withinGravity ? 0.7 : 0.2;
    m.ring.material.color.setHex(withinGravity ? 0xe8a865 : 0x7fe0c9);
    // active 时放大
    const scale = withinGravity ? 1.4 : 1.0;
    m.ring.scale.set(scale, scale, 1);
  }
}