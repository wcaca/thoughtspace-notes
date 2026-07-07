/**
 * [INPUT]: three.js, ./bootstrap.js, yjs-store(transact), core/thought/structure, render/thought-sphere/hull-mesh/crystallize-fx, topology/convex-hull, sim/force-3d
 * [OUTPUT]: 全站交互层 — 事件绑定(pointer/keyboard) + window.__sp1State 暴露 + crystallize 提炼 + 渲染循环
 * [POS]: 顶层入口,被 index.html 引用;依赖 ./bootstrap.js 完成 bootstrap 序列
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import * as THREE from 'three';
import { initBootstrap } from './bootstrap.js';
import { createThoughtMesh, updateThoughtMesh, highlightThought, unhighlightThought } from './render/thought-sphere.js';
import { createHullMesh, shouldRebuildHull } from './render/hull-mesh.js';
import { createInstancedThoughts } from './render/instanced-thoughts.js';
import { computeHull } from './topology/convex-hull.js';
import { createSim3D, restartSim } from './sim/force-3d.js';
import { transact } from './persistence/yjs-store.js';
import { createThought, decayTemperature, refreshTemperature } from './core/thought.js';
import { isCrystallized, cohesionScore } from './core/structure.js';
import { animateCrystallization } from './render/crystallize-fx.js';

const { currentLayerStore, currentSortHistory, currentCanvasMode, currentZoneStore,
  currentZoneBridge, yThoughts, yEdges, undoManager,
  scene, camera, renderer, cubeCam, sediment, zoneMesh } = await initBootstrap();

const meshesById = new Map();
let simState = null;
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// ---- 性能三件套 (Round 3): InstancedMesh 主渲染路径 ----
// 大批量 idle 念头共享 1 个 InstancedMesh;选中态/提炼动画/沉积层用单 group(meshesById) 覆盖
let instancedThoughts = createInstancedThoughts(scene, 2000);

// ---- 选中状态管理(Shift+click 多选 / click 单选替换 / 空白清空)----
const selectedIds = new Set();
function updateSelectionVisuals() {
  for (const [id, group] of meshesById) {
    group.userData.selected = selectedIds.has(id);
  }
}

// ---- 力导向 ----
// P1-4 (Round 3): sim 冻结 — alpha < 0.02 时 stop tick + final flush 写回 Yjs
// 不再每 tick 写回 Yjs(sim 推动期间 InstancedMesh 直接读 sim 节点位置,跳过 Yjs 中转)
// 这避免了 1000 个 thoughts * 60 tick/s = 60000 set/s 的 GC + Yjs delta 编码压力
let _dirtyInstanced = false;
function rebuildSim() {
  simState = createSim3D(Array.from(yThoughts.values()), Array.from(yEdges.values()));
  simState.sim.on('tick', () => {
    const a = simState?.sim?.alpha();
    if (a == null || a < 0.02) {
      simState?.sim?.stop();
      // final flush:把 sim 节点最终位置一次性写回 Yjs
      transact(() => {
        for (const n of simState.nodes) {
          const t = yThoughts.get(n.id);
          if (t) yThoughts.set(n.id, { ...t, x: n.x, y: n.y, z: n.z });
        }
      }, 'sim-final');
      return;
    }
    _dirtyInstanced = true; // 让 animate 在下一帧 RAF 一次性 flush(直接读 sim 节点)
  });
  restartSim(simState.sim, 0.5);
}

// 从 simState.nodes 直接刷新 InstancedMesh(跳过 Yjs 中转)
const _flushDummy = new THREE.Object3D();
function flushFromSim() {
  let i = 0;
  for (const [, t] of yThoughts) {
    if (i >= instancedThoughts.capacity) break;
    const n = simState?.idToNode?.get(t.id);
    const x = n?.x ?? t.x ?? 0;
    const y = n?.y ?? t.y ?? 0;
    const z = n?.z ?? t.z ?? 0;
    const mass = n?.mass ?? t.mass ?? 1;
    const temperature = n?.temperature ?? t.temperature ?? 0.5;
    const radius = 1.5 + mass * 0.18;
    _flushDummy.position.set(x, y, z);
    _flushDummy.scale.setScalar(radius);
    _flushDummy.rotation.set(0, 0, 0);
    _flushDummy.updateMatrix();
    instancedThoughts.mesh.setMatrixAt(i, _flushDummy.matrix);
    instancedThoughts.tempArr[i] = temperature;
    instancedThoughts.radiusArr[i] = radius * 8;
    i++;
  }
  instancedThoughts.mesh.count = i;
  instancedThoughts.mesh.instanceMatrix.needsUpdate = true;
  instancedThoughts.mesh.geometry.attributes.aTemp.needsUpdate = true;
  instancedThoughts.mesh.geometry.attributes.aRadius.needsUpdate = true;
}

// ---- 场景重建 ----
// P1-2 (Round 3): 改为 InstancedMesh 主路径 — 不再为每个 thought 创 group
// 选中态/提炼动画临时把该实例从 InstancedMesh 搬出来 → 用 group(meshesById)
// hull 用 shouldRebuildHull 缓存,stable 后跳过重算
function rebuildScene() {
  for (const mesh of meshesById.values()) scene.remove(mesh);
  meshesById.clear();

  // 全量写入 InstancedMesh
  instancedThoughts.update(yThoughts);
  _dirtyInstanced = false;

  // 选中态 → 单独建 group(用于提炼/高亮/单独选中控制)
  for (const t of yThoughts.values()) {
    if (selectedIds.has(t.id)) {
      const group = createThoughtMesh(t);
      scene.add(group);
      group.userData.selected = true;
      meshesById.set(t.id, group);
    }
  }

  // 凸包缓存 — 位置未变 / 数量未变 → 跳过
  // force=false 让 shouldRebuildHull 内部按 hash + count 自行决定
  if (shouldRebuildHull(yThoughts, false)) {
    const hullData = computeHull(Array.from(yThoughts.values()));
    const oldHull = scene.getObjectByName('hull-structure');
    if (oldHull) scene.remove(oldHull);
    if (hullData.valid) {
      const hg = createHullMesh(hullData);
      if (hg) { hg.name = 'hull-structure'; scene.add(hg); }
    }
  }

  rebuildSim();
}

// 当有新念头(用户投念头)/外部 observeDeep 触发时,若 sim 已冻结则 restart
function ensureSimRunning() {
  if (!simState?.sim) return;
  if (simState.sim.alpha() < 0.02) {
    restartSim(simState.sim, 0.3);
  }
}

const syncStats = () => {
  const sn = document.getElementById('stat-nodes'), se = document.getElementById('stat-edges');
  if (sn) sn.textContent = yThoughts.size;
  if (se) se.textContent = yEdges.size;
};
// observeDeep 检查 origin==='sim' 短路,避免无限循环
// P1-2 (Round 3): 重建设计 — 用 dirty flag,RAF 时若 dirty 才 rebuild,避免每帧重建
let _sceneDirty = false;
let _rebuildScheduled = false;
const onDeepChange = (events) => {
  if (events.length > 0 && events[0].transaction?.origin === 'sim') {
    // sim 写回 → 只需更新 InstancedMesh,不重 build scene
    _dirtyInstanced = true;
    return;
  }
  syncStats();
  _sceneDirty = true;
  if (!_rebuildScheduled) {
    _rebuildScheduled = true;
    requestAnimationFrame(() => {
      _rebuildScheduled = false;
      if (_sceneDirty) {
        _sceneDirty = false;
        rebuildScene();
      }
    });
  }
  ensureSimRunning();
};
yThoughts.observeDeep(onDeepChange);
yEdges.observeDeep(onDeepChange);
syncStats();
rebuildScene(); // 种子在 observeDeep 挂载前注入,显式触发初始场景构建

let draggingId = null;
let suppressNextClick = false; // 拖拽刚结束抑制下一次 click
// CRITICAL FIX (Round2 audit Critical Bug 1): 投念头判定不再依赖 cubeCam.isSwiping() (它会 300ms 吞 click)
// 改用本次 pointerdown 的 dx/dy/dt 本地判定,真用户 click 一定走得通
let downPos = null; // { x, y, time }
const dragPlane = new THREE.Plane();
const dragIntersect = new THREE.Vector3();

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  // 记录本次按下位置/时间,供 click handler 用 dx/dy/dt 判定是 click 还是 swipe
  downPos = { x: e.clientX, y: e.clientY, time: Date.now() };
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 - 1;
  raycaster.setFromCamera(mouse, camera);
  // P1-2 (Round 3): Raycast 同时打 InstancedMesh + 选中态 group
  const intersectTargets = [instancedThoughts.mesh, ...Array.from(meshesById.values())];
  const intersects = raycaster.intersectObjects(intersectTargets, true);
  if (intersects.length === 0) {
    if (selectedIds.size > 0) { selectedIds.clear(); updateSelectionVisuals(); }
    return;
  }
  // 沿父链找 thoughtId(优先 group userData,其次 InstancedMesh instanceId)
  let hitId = null;
  let obj = intersects[0].object;
  while (obj && !obj.userData?.thoughtId) obj = obj.parent;
  if (obj?.userData?.thoughtId) {
    hitId = obj.userData.thoughtId;
  } else if (intersects[0].instanceId !== undefined && intersects[0].instanceId !== null) {
    // 从 InstancedMesh 命中:按 instance 顺序索引回 thought id
    let i = 0;
    for (const [tid] of yThoughts) {
      if (i === intersects[0].instanceId) { hitId = tid; break; }
      i++;
    }
  }
  if (!hitId) return;
  suppressNextClick = true; // 命中念头后抑制后续 click

  // Shift+click: 多选 toggle,不启动拖拽
  if (e.shiftKey) {
    if (selectedIds.has(hitId)) selectedIds.delete(hitId);
    else selectedIds.add(hitId);
    updateSelectionVisuals();
    return;
  }

  // 无 Shift: 单选替换
  if (!selectedIds.has(hitId)) {
    selectedIds.clear();
    selectedIds.add(hitId);
    updateSelectionVisuals();
  }

  draggingId = hitId;
  // 钉住 sim 节点 + 设置拖拽平面(垂直于相机方向,过节点位置)
  if (simState?.idToNode?.has(draggingId)) {
    const n = simState.idToNode.get(draggingId);
    n.fx = n.x; n.fy = n.y; n.fz = n.z;
  }
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const nodePos = new THREE.Vector3(intersects[0].point.x, intersects[0].point.y, intersects[0].point.z);
  dragPlane.setFromNormalAndCoplanarPoint(camDir, nodePos);
});

renderer.domElement.addEventListener('pointermove', (e) => {
  if (!draggingId) return;
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  if (raycaster.ray.intersectPlane(dragPlane, dragIntersect)) {
    if (simState?.idToNode?.has(draggingId)) {
      const n = simState.idToNode.get(draggingId);
      n.fx = dragIntersect.x;
      n.fy = dragIntersect.y;
      n.fz = dragIntersect.z;
      // P1-2 (Round 3): 同步到 InstancedMesh — 拖拽期间每帧单实例更新
      const instIdx = instancedThoughts.idByInstance.indexOf(draggingId);
      if (instIdx >= 0) {
        instancedThoughts.updateOne(
          { x: dragIntersect.x, y: dragIntersect.y, z: dragIntersect.z, mass: n.mass, temperature: n.temperature },
          instIdx
        );
      }
    }
  }
});

renderer.domElement.addEventListener('pointerup', () => {
  if (draggingId && simState?.idToNode?.has(draggingId)) {
    const n = simState.idToNode.get(draggingId);
    n.fx = null; n.fy = null; n.fz = null; // 释放钉住
  }
  draggingId = null;
  // downPos 由 click handler (dispatched after pointerup) 处理或丢弃
});

function triggerCrystallize() {
  if (selectedIds.size < 2) { alert('请先选中至少 2 个念头'); return; }
  const ids = Array.from(selectedIds);
  const edges = Array.from(yEdges.values()).filter(
    (e) => selectedIds.has(e.fromId) && selectedIds.has(e.toId)
  );
  // 计算质心
  let cx = 0, cy = 0, cz = 0;
  for (const id of ids) {
    const t = yThoughts.get(id);
    if (t) { cx += t.x || 0; cy += t.y || 0; cz += t.z || 0; }
  }
  cx /= ids.length; cy /= ids.length; cz /= ids.length;

  const score = cohesionScore(ids, edges);
  if (!isCrystallized(ids, edges, true)) {
    console.log(`[crystallize] cohesion=${score.toFixed(3)} < 0.7, 无法结晶`);
    return;
  }

  const meshes = ids.map((id) => meshesById.get(id)).filter(Boolean);
  animateCrystallization(scene, meshes, { centroid: { x: cx, y: cy, z: cz } }, () => {
    transact(() => {
      const totemId = `totem_${Date.now()}`;
      yThoughts.set(totemId, createThought(totemId, '◆', cx, cy, cz));
      for (const id of ids) yThoughts.delete(id);
    }, 'user');
    selectedIds.clear();
    updateSelectionVisuals();
  });
}
window.__triggerCrystallize = triggerCrystallize;
window.__yThoughts = yThoughts;
window.__yEdges = yEdges;
window.__selectedIds = selectedIds;
window.__decayThoughtTemperature = (id, newTemp) => {
  if (!yThoughts.has(id)) return null;
  const t = yThoughts.get(id);
  const updated = { ...t, temperature: Math.max(0, Math.min(1, newTemp)), lastInteractionAt: 0 };
  yThoughts.set(id, updated);
  return updated;
};

renderer.domElement.addEventListener('click', (e) => {
  // CRITICAL FIX (Round2 audit Critical Bug 1): 不再依赖 cubeCam.isSwiping() (它 300ms 吞掉所有 click)
  // 改用本次 pointerdown 的 dx/dy/dt 本地判定: 真实用户 click 几乎不动 → 投念头
  if (suppressNextClick) { suppressNextClick = false; downPos = null; return; }
  if (downPos) {
    const dx = Math.abs(e.clientX - downPos.x);
    const dy = Math.abs(e.clientY - downPos.y);
    const dt = Date.now() - downPos.time;
    downPos = null;
    // 位移 < 5px 且时长 < 500ms 才算 click;否则交给 swipe 切面 (cubeCam 自己的 pointerup 自处理)
    if (dx >= 5 || dy >= 5 || dt >= 500) return;
  } else {
    // 没有 downPos 记录 (例如触发 pointerup 后): 视为非 click 投念头
    return;
  }
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  // P1-2 补完 (Round 3 重跑发现): click raycast 必须只打念头 mesh + InstancedMesh,
  // 不能再 intersectObjects(scene.children, true) — 会被 sediment-bed / layer plane / dust 全屏吸收
  const thoughtTargets = [instancedThoughts.mesh, ...Array.from(meshesById.values())];
  const intersects = raycaster.intersectObjects(thoughtTargets, true);

  if (intersects.length === 0) {
    const front = cubeCam.getCameraFront();
    const pos = camera.position.clone().add(front.multiplyScalar(400));
    const id = `t_${Date.now()}`;
    transact(() => {
      yThoughts.set(id, createThought(id, '', pos.x, pos.y, pos.z));
    }, 'user');
    ensureSimRunning();
    return;
  }

  let clickedGroup = intersects[0].object;
  while (clickedGroup && !clickedGroup.userData?.thoughtId) {
    clickedGroup = clickedGroup.parent;
  }
  if (clickedGroup?.userData?.thoughtId) {
    highlightThought(clickedGroup);
    setTimeout(() => unhighlightThought(clickedGroup), 2000);
  }
});

renderer.domElement.addEventListener('dblclick', (e) => {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);

  let hitId = null;
  let obj = intersects[0]?.object;
  while (obj && !obj.userData?.thoughtId) obj = obj.parent;
  if (obj?.userData?.thoughtId) {
    hitId = obj.userData.thoughtId;
  } else if (intersects[0]?.instanceId !== undefined && intersects[0]?.instanceId !== null) {
    let i = 0;
    for (const [tid] of yThoughts) {
      if (i === intersects[0].instanceId) { hitId = tid; break; }
      i++;
    }
  }
  if (!hitId) return;

  const tId = hitId;
  transact(() => {
    const t = yThoughts.get(tId);
    if (!t) return;
    const refreshed = refreshTemperature(t, Date.now());
    refreshed.y = Math.max(refreshed.y ?? 0, 300);
    yThoughts.set(tId, refreshed);
  }, 'user');
});

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

function animate() {
  requestAnimationFrame(animate);
  cubeCam.update();
  // P1-2 (Round 3): InstancedMesh 主路径
  // sim 推进时 — flushFromSim 直接读 sim 节点位置(无 Yjs 中转)
  // sim 静止时 — dirty=false,零开销
  if (_dirtyInstanced) {
    flushFromSim();
    _dirtyInstanced = false;
  }
  // 选中态 group 单独 update(覆盖 InstancedMesh 的位置/视觉态)
  for (const t of yThoughts.values()) {
    const group = meshesById.get(t.id);
    if (group) updateThoughtMesh(group, t);
  }
  sediment.update(Array.from(yThoughts.values()), meshesById);
  renderer.render(scene, camera);
}
animate();
const syncZoneDoc = () => currentZoneBridge.syncToDoc();
window.__sp1State = {
  getLayers: () => currentLayerStore.list(),
  getCurrentAxis: () => currentSortHistory.getCurrentAxis(),
  getManualOrder: () => currentSortHistory.getManualOrder(),
  getCurrentOrder: (t) => currentSortHistory.getCurrentOrder(t),
  getCanvasMode: () => currentCanvasMode.getMode(),
  setCanvasMode: (m) => currentCanvasMode.setMode(m),
  setCurrentAxis: (a) => currentSortHistory.setCurrentAxis(a),
  recordManualOrder: (ids) => currentSortHistory.recordOrder(ids),
  bootstrapLayerDefaults: () => currentLayerStore.bootstrapDefaults(),
  getZones: () => currentZoneStore.list(),
  getZoneStore: () => currentZoneStore,
  getZoneMesh: () => zoneMesh,
  addZone: (s) => { const z = currentZoneStore.add(s); syncZoneDoc(); return z; },
  updateZone: (id, p) => { const z = currentZoneStore.update(id, p); syncZoneDoc(); return z; },
  removeZone: (id) => { const ok = currentZoneStore.remove(id); syncZoneDoc(); return ok; },
  classifyThoughtToZone: (t) => currentZoneStore.classify(t)
};
