/**
 * [INPUT]: three.js, S1全部组件（core+render+persistence+interaction）
 * [OUTPUT]: v2 S1可运行入口 —— 有限3D晶体+6层+2外置+基准面+操作区+视角轨道
 * [POS]: src/v2/main.js,v2应用入口,被index.html的bootstrap脚本动态加载
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * S1验收目标（实现方案.md §2.3）:
 *   - 打开v2看到有限3D晶体（有边界，不是无限宇宙）
 *   - 看到6层3D主体+2外置层（顶层"规则"、底层"结构"）
 *   - 近大远小可见（越接近视角起点层越大）
 *   - 3/4基准面+1/4操作区布局正确
 *   - 1/4操作区有3D缩略图
 *   - 空间外部信息边界可见但不可操作
 *   - 排查基础组件初始化（SceneStateStore + 5个排查core）
 *
 * @note(s1, decision, v2-main, since:2026-07-08)
 *   S1集成入口：空间本体阶段全部组件接入。
 *   S0骨架升级为S1完整实现，保留全局调试入口。
 */
import * as THREE from 'three';
import { SceneStateStore } from './core/scene-state-store.js';
import { ActionRouter } from './core/action-router.js';
import { Space } from './core/space.js';
import { MarkSystem } from './core/mark-system.js';
import { LayerSystem } from './core/layer.js';
import { CognitiveFrameworkSystem, FrameworkId } from './core/cognitive-framework.js';
import { ViewOrbit } from './core/view-orbit.js';
import { SpatialStateField } from './core/spatial-state-field.js';
import { SnapshotStore } from './core/state-snapshot.js';
import { StateChangeChain } from './core/state-change-chain.js';
import { DiagnosticEngine } from './core/diagnostic-engine.js';
import { SpatialQuery } from './core/spatial-query.js';
import { CrystalSpaceRenderer } from './render/crystal-space.js';
import { LayerRenderer } from './render/layer-renderer.js';
import { ViewOrbitCamera } from './render/view-orbit-camera.js';
import { BasePlane } from './render/base-plane.js';
import { OperationZone } from './render/operation-zone.js';
import { SpaceBoundary } from './render/space-boundary.js';

// ===== 1. 排查基础骨架初始化 =====
const stateStore = new SceneStateStore({ yjsDoc: null });
const actionRouter = new ActionRouter();
const changeChain = new StateChangeChain();
const snapshotStore = new SnapshotStore({ maxSize: 1000, intervalMs: 100 });
const stateField = new SpatialStateField();
const diagnosticEngine = new DiagnosticEngine({
  stateField,
  snapshotStore,
  changeChain,
});
const spatialQuery = new SpatialQuery({
  stateField,
  snapshotStore,
  changeChain,
});

console.log('[v2] S1 排查基础已初始化', {
  stateStore: stateStore.getSummary(),
  changeChain: changeChain.getStats(),
  diagnostic: diagnosticEngine.getStats(),
  spatialQuery: spatialQuery.getSummary(),
});

// ===== 2. 空间本体初始化 =====
const space = new Space();
const markSystem = new MarkSystem();
const layerSystem = new LayerSystem({ markSystem });
const frameworkSystem = new CognitiveFrameworkSystem({ layerSystem });
frameworkSystem.switchTo(FrameworkId.SIX_LAYER_TWO_EXTERNAL); // 默认框架
const viewOrbit = new ViewOrbit(space);

console.log('[v2] S1 空间本体已初始化', {
  space: space.getSummary(),
  layers: layerSystem.getSummary(),
  framework: frameworkSystem.getActiveFramework()?.name,
  orbit: viewOrbit.getSummary(),
});

// ===== 3. Three.js 场景搭建 =====
const stage = document.getElementById('stage');
const canvas = document.createElement('canvas');
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.display = 'block';
stage.appendChild(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);
scene.fog = new THREE.Fog(0x050811, 15, 40);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// 环境光
const ambient = new THREE.AmbientLight(0x4a6a9e, 0.5);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.3);
dir.position.set(5, 10, 5);
scene.add(dir);

// ===== 4. 渲染组件初始化 =====
const crystalRenderer = new CrystalSpaceRenderer({ scene, space, three: THREE });
crystalRenderer.build();
crystalRenderer.setStardustDensity(0.5);

const layerRenderer = new LayerRenderer({ scene, layerSystem, space, three: THREE });
layerRenderer.build();
layerRenderer.setLayerPlanesVisible(true);
layerRenderer.setLayerLabelsVisible(true);
layerRenderer.setShowDivider(true);
layerRenderer.updateLayerScales(0.8); // 视角起点：显意识·表层

const basePlane = new BasePlane({ scene, space, three: THREE });
basePlane.build();
basePlane.setSlicePosition(0.8); // 基准面在显意识·表层

const operationZone = new OperationZone({ scene, space, three: THREE });
operationZone.build();
operationZone.setThumbnailsVisible(true);

const spaceBoundary = new SpaceBoundary({ scene, space, three: THREE });
spaceBoundary.build();

const orbitCamera = new ViewOrbitCamera({ camera, viewOrbit, three: THREE });
orbitCamera.setAnimationDuration(500);
orbitCamera.setPosition(0, false); // 初始位置

console.log('[v2] S1 渲染组件已初始化', {
  crystal: crystalRenderer.getSummary(),
  layers: layerRenderer.getSummary(),
  basePlane: basePlane.getSummary(),
  operationZone: operationZone.getSummary(),
  boundary: spaceBoundary.getSummary(),
  camera: orbitCamera.getSummary(),
});

// ===== 5. 视角切换测试（S3手势接入前的临时交互）=====
// 键盘 1-5 切换到5个预设位置
window.addEventListener('keydown', (e) => {
  const presets = ['initial', 'right1', 'right2', 'right3', 'left'];
  const idx = parseInt(e.key, 10) - 1;
  if (idx >= 0 && idx < presets.length) {
    orbitCamera.setToPreset(presets[idx]);
    console.log('[v2] 视角切换到:', presets[idx], orbitCamera.getSummary());
  }
  // F 键切换框架
  if (e.key === 'f' || e.key === 'F') {
    const fws = [
      FrameworkId.SIX_LAYER_TWO_EXTERNAL,
      FrameworkId.THREE_NETWORK,
      FrameworkId.MANDALA,
      FrameworkId.ARCHETYPE,
      FrameworkId.BRAIN_REGION,
      FrameworkId.EIGHT_DIMENSION,
      FrameworkId.TREE_OF_LIFE,
    ];
    const current = frameworkSystem.getActiveFramework()?.id;
    const idx = fws.indexOf(current);
    const next = fws[(idx + 1) % fws.length];
    frameworkSystem.switchTo(next);
    layerRenderer.setLayerSystem(layerSystem);
    layerRenderer.updateLayerScales(0.8);
    console.log('[v2] 框架切换到:', frameworkSystem.getActiveFramework().name);
  }
});

// ===== 6. 渲染循环 =====
let frameCount = 0;
let lastSnapshotTime = 0;
function animate() {
  requestAnimationFrame(animate);
  frameCount++;

  const deltaTime = 1 / 60; // 假设60fps
  orbitCamera.update(deltaTime);

  // 缓慢旋转晶体轮廓（视觉提示空间可旋转）
  // 注意：实际旋转由orbitCamera控制，这里只做微弱呼吸效果

  // 每100ms拍摄快照（排查基础）
  const now = performance.now();
  if (now - lastSnapshotTime > 100) {
    snapshotStore.captureIfNecessary(now - lastSnapshotTime, 'timer', {
      frame: frameCount,
      timestamp: now,
      view: {
        cameraPos: { ...camera.position },
        cameraTarget: { x: 0, y: 0, z: 0 },
        orbitParam: orbitCamera.getOrbitParam(),
      },
      entities: new Map(),
      performance: { frameTime: deltaTime * 1000 },
      userAction: null,
      yjsChanges: null,
      changeChainHead: null,
    });
    lastSnapshotTime = now;
  }

  renderer.render(scene, camera);
}
animate();

// ===== 7. 窗口适配 =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== 8. 全局调试入口（AI自排查支持）=====
// @note(s1, decision, global-entry, since:2026-07-08)
//   暴露到window对象,供AI/开发者通过console排查状态
globalThis.__v2 = {
  // 排查基础
  stateStore,
  actionRouter,
  changeChain,
  snapshotStore,
  stateField,
  diagnosticEngine,
  spatialQuery,
  // 空间本体
  space,
  markSystem,
  layerSystem,
  frameworkSystem,
  viewOrbit,
  // 渲染
  scene,
  camera,
  renderer,
  crystalRenderer,
  layerRenderer,
  basePlane,
  operationZone,
  spaceBoundary,
  orbitCamera,
  // 工具
  getFrameCount: () => frameCount,
  switchFramework: (id) => {
    frameworkSystem.switchTo(id);
    layerRenderer.setLayerSystem(layerSystem);
    layerRenderer.updateLayerScales(0.8);
    return frameworkSystem.getActiveFramework()?.name;
  },
  switchView: (preset) => orbitCamera.setToPreset(preset),
  runDiagnostics: () => diagnosticEngine.runAll(),
  query: (type, ...args) => {
    const q = spatialQuery;
    if (type === 'at') return q.at(args[0]);
    if (type === 'timeline') return q.timeline(args[0], args[1]);
    if (type === 'causedBy') return q.causedBy(args[0]);
    return q.getSummary();
  },
};
console.log('[v2] S1 全局调试入口已就绪: globalThis.__v2');
console.log('[v2] S1 操作提示: 按1-5切换视角, 按F切换认知框架');
