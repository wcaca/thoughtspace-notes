/**
 * [INPUT]: three.js, S1全部组件（core+render+persistence+interaction）+ S2 thought/memory 实体（core/thought.js + render/thought-mesh.js + render/memory-mesh.js + persistence/thought-bridge.js）
 * [OUTPUT]: v2 S1可运行入口 + S2.8 念头/记忆实体集成 + S2.10 渲染管线 + S2.11/12 Debug 可视化 + S2.13 Quick Add UI (3 个示例 Thought + thought-bridge + QuickAddPanel 启动 + N 键)
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
 * S2.8 验收目标（S2组件实施顺序 §3）:
 *   - 启动后全局有 3 个示例 Thought (光质/阴影/温度 文本) 可视化
 *   - __v2.thoughtMesh / __v2.memoryMesh / __v2.thoughtRefs 暴露
 *   - __v2.spawnSampleThought 可手动调加念头
 *   - thought-bridge 接入 (无 Yjs 时 no-op, 有 Yjs 时 sync)
 *   - ThoughtMeshRenderer (100 capacity) + MemoryMeshRenderer (100 capacity) 就绪
 *
 * S2.10 验收目标:
 *   - __v2.renderPipeline 暴露 (5阶段管线+16ms预算)
 *   - __v2.pipelineStats() 返回 totalFrames / totalOverruns / totalErrors / stages 耗时
 *   - 取代原硬编码 animate() (snapshotStore.captureIfNecessary 旧调度)
 *
 * S2.11/S2.12 验收目标:
 *   - __v2.debugOverlay 暴露 DebugOverlay 实例 (5Hz stats panel)
 *   - __v2.toggleDebug() 控制 panel 显隐 (默认隐藏, 启动后 attach)
 *   - pipelineStats 含 expectedMs / overheadMs / overheadPct / severity 字段
 *   - 按 `~` 键或 `__v2.toggleDebug()` 切换可见
 *
 * @note(s1, decision, v2-main, since:2026-07-08)
 *   S1集成入口：空间本体阶段全部组件接入。
 *   S0骨架升级为S1完整实现，保留全局调试入口。
 *
 * @note(s2, decision, s2-8-entity-integration, since:2026-07-10)
 *   S2.8 集成 Thought 类 + thought-mesh + memory-mesh + thought-bridge。
 *   3 个示例 Thought 验证实例化管线 (Thought→upsert→mesh 写入)。
 *   S2.9 (quick-add 交互) + S2.10 (render-pipeline) 推进 phase-transition 动画。
 *
 * @note(s2, decision, s2-10-pipeline-integration, since:2026-07-11)
 *   S2.10 集成：main.js 硬编码 animate() 升级为 RenderPipeline.registerStage()。
 *   阶段分配：state 阶段调 orbitCamera.update(), transform 阶段预留 phase-transition hook (当前 recordCacheAccess 占位)。
 *   暴露 renderPipeline + pipelineStats() 给 AI 排查。
 *
 * @note(s2, decision, s2-11-12-debug-integration, since:2026-07-14)
 *   S2.11 + S2.12 集成：DebugOverlay 默认隐藏 + 启动后 attach，让 5Hz stats 持续采样
 *   （隐藏时不渲染 DOM，attach 只采集数据；show 出来就是"最近一帧"的状态，不跳 0）。
 *   __v2.toggleDebug() 与键盘 `~` 互备，AI console 一行就能进排查模式。
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
import { ThoughtMeshRenderer } from './render/thought-mesh.js';
import { MemoryMeshRenderer } from './render/memory-mesh.js';
import { RenderPipeline } from './render/render-pipeline.js';
import { DebugOverlay } from './debug/debug-overlay.js';
import { ThoughtBridge, createThoughtBridge } from './persistence/thought-bridge.js';
import {
  Thought,
  ThoughtPhase,
  ThoughtMaterial,
  ThoughtShape,
  CreatedBy,
  genThoughtId,
  EntityType,
} from './core/thought.js';

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

// ===== 4.5. S2 念头/记忆实体 (S2.8 集成) =====
// @note(s2, decision, thought-entity-integration, since:2026-07-10)
//   S2.1-S2.7 完成后集成: Thought 类 + thought-mesh + memory-mesh + thought-bridge
//   S2.8 步骤:
//     1. 实例化 ThoughtMeshRenderer / MemoryMeshRenderer (capacity 100)
//     2. 创建 thoughtRefs Map<id, Thought> 作为内存中枢
//     3. 塞 3 个示例 Thought (S2.9 才会接 UI, 现在是可视化验证)
//     4. 接入 thought-bridge (无 Yjs 时 no-op, 有 Yjs 时同步)
const thoughtMesh = new ThoughtMeshRenderer({ scene, capacity: 100, space });
const memoryMesh = new MemoryMeshRenderer({ scene, capacity: 100, space });

// 内存中枢: thoughtId -> Thought 实例
const thoughtRefs = new Map();
thoughtMesh.setThoughtRefs(thoughtRefs);

// 示例数据 (S2.9 之前手动, S2.9+ 走 action-router)
const sampleLayers = layerSystem.getLayers();
// 选 con-middle (index 5, vertical 0.57-0.73) — 意识中位层, 与“跳念头/查词”场景近
const defaultLayer = sampleLayers[5]?.id || sampleLayers[Math.floor(sampleLayers.length / 2)]?.id;

function spawnSampleThought(opts = {}) {
  const t = new Thought({
    content: opts.content || '默认念头',
    layerId: opts.layerId || defaultLayer,
    position: opts.position || { vertical: 0.5, radial: 0.4, orbital: Math.random() * Math.PI * 2 },
    space,
    layerSystem,
  });
  // 设为晶体态 — 走 SEED → CRYSTAL 入场动画 (0.8s, 由 render-pipeline 的 animation 阶段推进)
  // S2.14 修复: 之前用 tickPhaseTransition(CRYSTAL) 直接 progress=1 (瞬移), 无动画
  //   改用 startPhaseTransition 让 thought 从 SEED 起步, render-pipeline 每帧推进
  t.startPhaseTransition(ThoughtPhase.CRYSTAL);
  thoughtRefs.set(t.id, t);
  thoughtMesh.upsert(t, { viewVertical: 0.5 });
  return t;
}

spawnSampleThought({ content: '光质・为什么这里会动' });
spawnSampleThought({ content: '阴影・边界在退' });
spawnSampleThought({ content: '温度・想法在沉' });

// thought-bridge: Yjs 未接入, 这里是 no-op 路径
const thoughtBridge = createThoughtBridge(null, { sceneStateStore: stateStore });

console.log('[v2] S2.8 念头/记忆实体已初始化', {
  thoughtMeshCapacity: thoughtMesh.capacity,
  memoryMeshCapacity: memoryMesh.capacity,
  sampleThoughts: thoughtRefs.size,
  bridgeActive: !!thoughtBridge,
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

// ===== 6. 渲染循环 (S2.10 render-pipeline 驱动) =====
const renderPipeline = new RenderPipeline({
  renderer,
  camera,
  scene,
  snapshotStore,
  maxFramesHistory: 120,
});

// state 阶段: 轨道相机更新
renderPipeline.registerStage('state', 10, (deltaMs) => {
  orbitCamera.update(deltaMs / 1000);
});

// transform 阶段: 念头 mesh 同步 (S2.8 实例化已写入, 这里只需帧间呼吸效果)
renderPipeline.registerStage('transform', 20, (deltaMs, ctx) => {
  // viewVertical 跟随 (placeholder, S2.11 接入真实计算)
  // S2.10 阶段不调真实 phase-transition, 只保持管线不崩
  if (thoughtRefs.size > 0) {
    // 随时间微调 (呼吸) - 让 mesh 有生金感
    for (const thought of thoughtRefs.values()) {
      // 预留 hook 给 S2.8 phase-transition 接入
      // 当前只计 cache 命中以填充 stats
      renderPipeline.recordCacheAccess(true);
    }
  }
});

renderPipeline.start();

console.log('[v2] S2.10 render-pipeline 已启动', {
  stages: RenderPipeline.getStages().map(s => `${s.name}(${s.budgetMs}ms)`).join(' + '),
  snapshot: !!snapshotStore,
});

// ===== 6.5 DebugOverlay (S2.11 可视化 + S2.12 期望值对比) =====
// @note(s2, decision, debug-overlay-integration, since:2026-07-14)
//   默认隐藏, 启动后 attach() 持续采样 stats 到 panel。
//   toggleDebug() 暴露给 __v2, AI/开发者用 console 切换或按 ~ 键 (DebugOverlay 内部已绑)。
const debugOverlay = new DebugOverlay(renderPipeline, { visible: false });
debugOverlay.attach();

// ===== 6.6 QuickAddPanel (S2.13 念头快速录入 UI) =====
// @note(s2, decision, quick-add-integration, since:2026-07-16)
//   用户可见的念头入口。 按 N 键开/关, 点击 [+ 念头] 按钮也能打开。
//   提交后委托给 spawnSampleThought (与示例念头同路径, S3 接入 action-router 后换).
import { QuickAddPanel } from './interaction/quick-add-panel.js';
const quickAddPanel = new QuickAddPanel({
  layers: layerSystem.getLayers().map(l => ({ id: l.id, name: l.name })),
  onAdd: async ({ text, layerId }) => {
    const t = spawnSampleThought({ content: text, layerId });
    return { ok: true, thought: t };
  },
});
quickAddPanel.attach();

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
  // S2.8 念头/记忆
  thoughtMesh,
  memoryMesh,
  thoughtRefs,
  thoughtBridge,
  spawnSampleThought,
  // S2.10 渲染管线
  renderPipeline,
  pipelineStats: () => renderPipeline.getStats(),
  // S2.11/S2.12 Debug 可视化
  debugOverlay,
  toggleDebug: () => debugOverlay.toggle(),
  // S2.13 Quick Add
  quickAdd: quickAddPanel,
  toggleQuickAdd: () => quickAddPanel.toggle(),
  // 工具
  getFrameCount: () => renderPipeline._frameCount,
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
console.log('[v2] S1 + S2.8 全局调试入口已就绪: globalThis.__v2');
console.log('[v2] S1 操作提示: 按1-5切换视角, 按F切换认知框架');
