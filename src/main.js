/**
 * [INPUT]: three.js, 全体模块, yjs-store, core/thought/edge/structure, convex-hull, cube-camera
 * [OUTPUT]: 全站 bootstrap — 初始化场景/相机/交互/力导向/念头/UI
 * [POS]: 顶层入口,被 index.html 引用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as THREE from 'three';
import { createScene } from './render/scene.js';
import { createCubeCamera, createFaceIndicator } from './topology/cube-camera.js';
import { createThoughtMesh, updateThoughtMesh, highlightThought, unhighlightThought } from './render/thought-sphere.js';
import { createHullMesh } from './render/hull-mesh.js';
import { createSedimentLayer } from './render/sediment-layer.js';
import { computeHull } from './topology/convex-hull.js';
import { createSim3D, restartSim } from './sim/force-3d.js';
import { initPersistence, getThoughts, getEdges, getUndoManager, transact, getZones, getDoc } from './persistence/yjs-store.js';
import { createThought, decayTemperature, refreshTemperature } from './core/thought.js';
import { createEdge, RelationType } from './core/edge.js';
import { createLayerStore } from './core/layer-store.js';
import { createZoneStore } from './core/zone.js';
import { createZoneBridge } from './persistence/zone-bridge.js';
import { createZoneMesh } from './render/zone-mesh.js';
import { createSortHistory } from './core/sort-axis.js';
import { createCanvasMode } from './render/canvas-mode.js';

const container = document.getElementById('stage');

await initPersistence('topology-space-phase0');

// SP-1: 看板分层与双模式空间实例
// ⚠️ 易错: bootstrapDefaults 必须在 initPersistence 之后调
//   详见 [docs/notes/sp1/pitfalls.md#T1.4-no-bootstrap]
// @note(sp1, pitfall, T1.4-no-bootstrap, since:2026-07-07)
// 📋 决策: 为什么用 window.__sp1State 而非 ESM import?
//   详见 [docs/notes/sp1/decisions.md#why-window-globals]
// @note(sp1, decision, why-window-globals, since:2026-07-07)
const currentLayerStore = createLayerStore();
const currentSortHistory = createSortHistory();
const currentCanvasMode = createCanvasMode();
currentLayerStore.bootstrapDefaults();

const currentZoneStore = createZoneStore();
const yZones = getZones();
const currentZoneBridge = createZoneBridge(currentZoneStore, yZones, getDoc());
currentZoneBridge.syncToStore();

const yThoughts = getThoughts();
const yEdges = getEdges();
const undoManager = getUndoManager();

const { scene, camera, renderer } = createScene(container);
const cubeCam = createCubeCamera(camera, container);
const faceIndicator = createFaceIndicator(document.body);
const sediment = createSedimentLayer(scene);
const zoneMesh = createZoneMesh(currentZoneStore, scene);
zoneMesh.rebuild();

cubeCam.onFaceChange((face) => faceIndicator.update(face));

const meshesById = new Map();
let simState = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ---- 力导向 ----
function rebuildSim() {
  const thoughts = Array.from(yThoughts.values());
  const edges = Array.from(yEdges.values());
  simState = createSim3D(thoughts, edges);
  simState.sim.on('tick', () => {
    if (simState?.sim?.alpha() < 0.02) return;
    transact(() => {
      for (const n of simState.nodes) {
        const t = yThoughts.get(n.id);
        if (t) yThoughts.set(n.id, { ...t, x: n.x, y: n.y, z: n.z });
      }
    }, 'sim');
  });
  restartSim(simState.sim, 0.5);
}

// ---- 场景重建 ----
function rebuildScene() {
  for (const mesh of meshesById.values()) {
    scene.remove(mesh);
  }
  meshesById.clear();

  for (const t of yThoughts.values()) {
    const group = createThoughtMesh(t);
    scene.add(group);
    meshesById.set(t.id, group);
  }

  // 凸包渲染
  const hullData = computeHull(Array.from(yThoughts.values()));
  const hullGroup = scene.getObjectByName('hull-structure');
  if (hullGroup) scene.remove(hullGroup);
  if (hullData.valid) {
    const hg = createHullMesh(hullData);
    if (hg) { hg.name = 'hull-structure'; scene.add(hg); }
  }

  rebuildSim();
}

yThoughts.observeDeep(() => requestAnimationFrame(rebuildScene));
yEdges.observeDeep(() => requestAnimationFrame(rebuildScene));
yZones.observeDeep(() => {
  currentZoneBridge.syncToStore();
  requestAnimationFrame(() => zoneMesh.rebuild());
});

// ---- 交互: 点击空白投念头 ----
renderer.domElement.addEventListener('click', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  if (intersects.length === 0) {
    // 点击空白
    const front = cubeCam.getCameraFront();
    const spawnDist = 400;
    const pos = camera.position.clone().add(front.multiplyScalar(spawnDist));
    const id = `t_${Date.now()}`;
    transact(() => {
      yThoughts.set(id, createThought(id, '', pos.x, pos.y, pos.z));
    }, 'user');
    return;
  }

  // 点击了某个念头
  let clickedGroup = intersects[0].object;
  while (clickedGroup && !clickedGroup.userData?.thoughtId) {
    clickedGroup = clickedGroup.parent;
  }
  if (clickedGroup?.userData?.thoughtId) {
    highlightThought(clickedGroup);
    setTimeout(() => unhighlightThought(clickedGroup), 2000);
  }
});

// ---- 双击念头: 捞起+激活 ----
renderer.domElement.addEventListener('dblclick', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let clickedGroup = intersects[0]?.object;
  while (clickedGroup && !clickedGroup.userData?.thoughtId) {
    clickedGroup = clickedGroup.parent;
  }
  if (!clickedGroup?.userData?.thoughtId) return;

  const tId = clickedGroup.userData.thoughtId;
  transact(() => {
    const t = yThoughts.get(tId);
    if (!t) return;
    const now = Date.now();
    const refreshed = refreshTemperature(t, now);
    refreshed.y = Math.max(refreshed.y ?? 0, 300);
    yThoughts.set(tId, refreshed);
  }, 'user');
});

// ---- Ctrl+Z / Ctrl+Y ----
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    if (undoManager) undoManager.undo();
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    if (undoManager) undoManager.redo();
  }
});

// ---- 渲染循环 ----
function animate() {
  requestAnimationFrame(animate);
  cubeCam.update();

  // 更新念头位置
  for (const t of yThoughts.values()) {
    const group = meshesById.get(t.id);
    if (group) updateThoughtMesh(group, t);
  }

  // 沉积层
  sediment.update(Array.from(yThoughts.values()), meshesById);

  renderer.render(scene, camera);
}

animate();

// ---- 首次加载种子数据 ----
if (yThoughts.size === 0) {
  const seed = [
    { id: 's0', text: '想开始一个新项目', x: -180, y: 280, z: -50 },
    { id: 's1', text: '但不知道从哪开始', x: 80, y: 220, z: -80 },
    { id: 's2', text: '也许先做个原型', x: -40, y: 150, z: 60 },
    { id: 's3', text: '验证手感', x: 200, y: 100, z: 20 },
    { id: 's4', text: '克制的游戏化', x: -260, y: 50, z: 120 },
    { id: 's5', text: '照料念头田野', x: 120, y: -40, z: 80 },
    { id: 's6', text: '被遗忘的旧笔记', x: 300, y: -180, z: -100 },
    { id: 's7', text: '深埋的恐惧', x: -100, y: -280, z: -60 }
  ];
  transact(() => {
    for (const s of seed) yThoughts.set(s.id, createThought(s.id, s.text, s.x, s.y, s.z));
    yEdges.set('e01', createEdge('e01', 's0', 's1', RelationType.SEQUENCE));
    yEdges.set('e12', createEdge('e12', 's1', 's2', RelationType.CAUSE));
    yEdges.set('e23', createEdge('e23', 's2', 's3', RelationType.PARALLEL));
    yEdges.set('e45', createEdge('e45', 's4', 's5', RelationType.CAUSE));
  });
}

// SP-1: 暴露给 observe-views / 调试用
window.__sp1State = {
  getLayers: () => currentLayerStore.list(),
  getCurrentAxis: () => currentSortHistory.getCurrentAxis(),
  getManualOrder: () => currentSortHistory.getManualOrder(),
  getCurrentOrder: (thoughts) => currentSortHistory.getCurrentOrder(thoughts),
  getCanvasMode: () => currentCanvasMode.getMode(),
  setCanvasMode: (m) => currentCanvasMode.setMode(m),
  setCurrentAxis: (a) => currentSortHistory.setCurrentAxis(a),
  recordManualOrder: (ids) => currentSortHistory.recordOrder(ids),
  bootstrapLayerDefaults: () => currentLayerStore.bootstrapDefaults(),
  getZones: () => currentZoneStore.list(),
  getZoneStore: () => currentZoneStore,
  getZoneMesh: () => zoneMesh,
  addZone: (spec) => {
    const z = currentZoneStore.add(spec);
    currentZoneBridge.syncToDoc();
    return z;
  },
  updateZone: (id, patch) => {
    const z = currentZoneStore.update(id, patch);
    currentZoneBridge.syncToDoc();
    return z;
  },
  removeZone: (id) => {
    const ok = currentZoneStore.remove(id);
    currentZoneBridge.syncToDoc();
    return ok;
  },
  classifyThoughtToZone: (thought) => currentZoneStore.classify(thought)
};
