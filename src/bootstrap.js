/**
 * [INPUT]: yjs-store(persistence), core/layer-store/sort-axis/zone/thought/edge, render/scene/sediment-layer/zone-mesh/canvas-mode/toolbar, topology/cube-camera, persistence/zone-bridge
 * [OUTPUT]: async initBootstrap() — 装配场景/相机/store/zone 等对象并注入首次种子数据,返回主入口消费所需句柄
 * [POS]: src/ 顶层,被 src/main.js 消费 — 抽离自 main.js 的 bootstrap 序列
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { createScene } from './render/scene.js';
import { createCubeCamera, createFaceIndicator } from './topology/cube-camera.js';
import { createSedimentLayer } from './render/sediment-layer.js';
import { createLayerStore } from './core/layer-store.js';
import { createZoneStore } from './core/zone.js';
import { createZoneBridge } from './persistence/zone-bridge.js';
import { createZoneMesh } from './render/zone-mesh.js';
import { createSortHistory } from './core/sort-axis.js';
import { createCanvasMode } from './render/canvas-mode.js';
import { createToolbar } from './ui/toolbar.js';
import { initPersistence, getThoughts, getEdges, getUndoManager, getZones, getDoc, transact } from './persistence/yjs-store.js';
import { createThought } from './core/thought.js';
import { createEdge, RelationType } from './core/edge.js';

export async function initBootstrap() {
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

  // yZones 观察:zone 数据变化 → 同步 store + 重建 mesh(依赖均在 bootstrap 作用域内)
  yZones.observeDeep(() => {
    currentZoneBridge.syncToStore();
    requestAnimationFrame(() => zoneMesh.rebuild());
  });

  // ---- 工具栏 ----
  // ✦ 提炼按钮通过 window.__triggerCrystallize 触发(main.js 赋值),其余按钮暂为 no-op(后续 task 接入)
  createToolbar(document.body, {
    onAdd: () => {},
    onReset: () => {},
    onSample: () => {},
    onClear: () => {}
  });

  // ---- 首次加载种子数据 ----
  // 注意: 此时 main.js 的 observeDeep 尚未挂载,seed 写入不会触发 rebuildScene;
  // main.js 在挂载 observeDeep 后会显式调一次 rebuildScene() 兜底初始视图。
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
    }, 'user');
  }

  return {
    currentLayerStore,
    currentSortHistory,
    currentCanvasMode,
    currentZoneStore,
    currentZoneBridge,
    yZones,
    yThoughts,
    yEdges,
    undoManager,
    scene,
    camera,
    renderer,
    cubeCam,
    sediment,
    zoneMesh
  };
}
