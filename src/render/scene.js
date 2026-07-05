/**
 * [INPUT]: three.js, domElement
 * [OUTPUT]: Three.js 场景初始化(深色背景+星尘+光照+Y轴分层标记)
 * [POS]: src/render 下,被 src/main.js 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

export function createScene(domElement) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x080a14);
  scene.fog = new THREE.FogExp2(0x080a14, 0.00003);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(domElement.clientWidth, domElement.clientHeight);
  domElement.appendChild(renderer.domElement);

  const camera = new THREE.PerspectiveCamera(
    55,
    domElement.clientWidth / domElement.clientHeight,
    10,
    5000
  );

  const ambientLight = new THREE.AmbientLight(0x1a2240, 0.6);
  scene.add(ambientLight);

  const pointLight = new THREE.PointLight(0x7fe0c9, 1.2, 3000);
  pointLight.position.set(0, 400, 200);
  scene.add(pointLight);

  const pointLight2 = new THREE.PointLight(0xe8a865, 0.6, 2000);
  pointLight2.position.set(0, -200, -300);
  scene.add(pointLight2);

  createStarDust(scene);
  createLayerMarkers(scene);

  window.addEventListener('resize', () => {
    camera.aspect = domElement.clientWidth / domElement.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(domElement.clientWidth, domElement.clientHeight);
  });

  return { scene, camera, renderer };
}

function createStarDust(scene) {
  const geo = new THREE.BufferGeometry();
  const count = 600;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 2000;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1.5,
    transparent: true,
    opacity: 0.25,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const dust = new THREE.Points(geo, mat);
  scene.add(dust);
}

function createLayerMarkers(scene) {
  const layers = [
    { y: 200, color: 0x7fe0c9, alpha: 0.06, label: 'L0 显意识' },
    { y: 0, color: 0xe8a865, alpha: 0.04, label: 'L1 近潜意识' },
    { y: -200, color: 0xe87aa8, alpha: 0.03, label: 'L2 潜意识' }
  ];

  for (const layer of layers) {
    const geo = new THREE.PlaneGeometry(2000, 2000);
    const mat = new THREE.MeshBasicMaterial({
      color: layer.color,
      transparent: true,
      opacity: layer.alpha,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = layer.y;
    plane.renderOrder = 1;
    scene.add(plane);
  }
}
