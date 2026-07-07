/**
 * [INPUT]: three.js, convex-hull 输出
 * [OUTPUT]: createHullMesh(hullResult) → THREE.Group(半透明多面体+线框边)
 * [POS]: src/render 下,被 src/main.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

export function createHullMesh(hullData) {
  if (!hullData.valid || hullData.vertices.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'hull-structure';

  const { vertices, faces } = hullData;

  // 重心位置
  const centroid = new THREE.Vector3();
  for (const v of vertices) {
    centroid.x += v[0]; centroid.y += v[1]; centroid.z += v[2];
  }
  centroid.divideScalar(vertices.length);

  // 构建面片几何体
  const positions = [];
  const indices = [];
  const v3s = vertices.map((v) => new THREE.Vector3(v[0], v[1], v[2]));

  // 给每个顶点加微小噪声偏移(不规则性)
  // P1-1 (TAS audit 2.6): 修 Perlin 负数 bug
  // 原: `(sin(...) * 43758.5453) % 1` 对负数返回负数(JS 行为),noise ∈ [-1, 1) 而非 [0, 1)
  // 导致 (noise - 0.5) * 8 偏移范围 [-12, 4] 而非 [-4, 4],多面体扭曲不对称
  // 修: Math.abs 取绝对值,noise ∈ [0, 1),偏移范围 [-4, 4] 对称
  const noisyVerts = v3s.map((v, i) => {
    const seed = i * 0.73;
    const noise = Math.abs((Math.sin(seed * 12.9898 + seed * 78.233) * 43758.5453) % 1);
    return v.clone().add(
      new THREE.Vector3(
        (noise - 0.5) * 8,
        (noise - 0.5) * 8,
        (noise - 0.5) * 8
      )
    );
  });

  for (const face of faces) {
    if (face.length < 3) continue;
    const base = positions.length / 3;
    for (let i = 0; i < 3; i++) {
      const vi = face[i];
      const v = noisyVerts[vi] || v3s[vi];
      positions.push(v.x, v.y, v.z);
    }
    indices.push(base, base + 1, base + 2);
  }

  // 半透明面片
  const faceGeo = new THREE.BufferGeometry();
  faceGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  faceGeo.setIndex(indices);
  faceGeo.computeVertexNormals();

  const faceMat = new THREE.MeshPhongMaterial({
    color: 0x7fe0c9,
    transparent: true,
    opacity: 0.15,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: 0x7fe0c9,
    emissiveIntensity: 0.08
  });
  const faceMesh = new THREE.Mesh(faceGeo, faceMat);
  group.add(faceMesh);

  // 线框边
  const edgeGeo = new THREE.BufferGeometry();
  edgeGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  edgeGeo.setIndex(indices);
  const edgeMat = new THREE.MeshBasicMaterial({
    color: 0x7fe0c9,
    wireframe: true,
    transparent: true,
    opacity: 0.2,
    depthWrite: false
  });
  const edgeMesh = new THREE.Mesh(edgeGeo, edgeMat);
  group.add(edgeMesh);

  // 顶点小球
  for (const v of noisyVerts) {
    const dotGeo = new THREE.SphereGeometry(2, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({
      color: 0x7fe0c9,
      transparent: true,
      opacity: 0.4,
      depthWrite: false
    });
    const dot = new THREE.Mesh(dotGeo, dotMat);
    dot.position.copy(v);
    group.add(dot);
  }

  return group;
}
