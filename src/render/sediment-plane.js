/**
 * 沉积层 (y < -50 半透明平面 + fog)
 * [INPUT]: 无
 * [OUTPUT]: 3D plane mesh
 * [POS]: src/render/sediment-plane.js - Round 7
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 沉积层代表"沉淀下去的想法",半透明水平面 + 微弱 fog 效果,
 * 让远处的网格自然消失在前,近处的网格清晰可见。
 */
import * as THREE from 'three';

export function createSedimentPlane() {
  const geom = new THREE.PlaneGeometry(800, 800, 20, 20);

  // 顶点着色: 中心稍亮 + 边缘渐变到 fog 色
  const colors = [];
  const positions = geom.attributes.position;
  const fogColor = new THREE.Color(0x050811);
  const planeColor = new THREE.Color(0x2a3a4a);
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const distFromCenter = Math.sqrt(x * x + y * y);
    const t = Math.min(1, distFromCenter / 400);
    const c = planeColor.clone().lerp(fogColor, t * 0.8);
    colors.push(c.r, c.g, c.b);
  }
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(geom, mat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -50;
  plane.name = 'sediment-plane';
  plane.renderOrder = -2; // 在网格下,念头下,但在 fog 下
  return plane;
}