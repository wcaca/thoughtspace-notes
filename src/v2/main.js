/**
 * [INPUT]: three.js, SceneStateStore, ActionRouter
 * [OUTPUT]: v2最小可运行入口 —— 空3D场景 + 排查基础骨架集成
 * [POS]: src/v2/main.js,v2应用入口,被index.html的bootstrap脚本动态加载
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * S0验收目标:
 *   - ?v2=true 显示v2空场景（黑色背景+晶体轮廓标识）
 *   - SceneStateStore/ActionRouter骨架可实例化
 *   - console输出骨架状态摘要（验证AI自排查基础可访问）
 *
 * 后续阶段填充:
 *   - S1: 空间本体（晶体+层+基准面）
 *   - S2: 念头实体 + RenderPipeline
 *   - S3: 操作体系（手势+菜单+视角切换）
 *
 * @note(s0, entry, v2-main, since:2026-07-08)
 *   S0最小入口: 只验证v2入口可运行+排查骨架可集成,不实现任何业务功能
 */
import * as THREE from 'three';
import { SceneStateStore } from './core/scene-state-store.js';
import { ActionRouter } from './core/action-router.js';

// ===== 排查基础骨架初始化 =====
const stateStore = new SceneStateStore({ yjsDoc: null });
const actionRouter = new ActionRouter();

console.log('[v2] S0 骨架已初始化', {
  stateStore: stateStore.getSummary(),
  actionRouter: actionRouter.getSummary(),
});

// ===== Three.js 最小场景 =====
const stage = document.getElementById('stage');
const canvas = document.createElement('canvas');
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.display = 'block';
stage.appendChild(canvas);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050811);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 0, 8);
camera.lookAt(0, 0, 0);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// v2标识: 线框晶体轮廓（暗示"念头晶体"概念,非业务功能）
const crystalGeometry = new THREE.OctahedronGeometry(2, 0);
const crystalEdges = new THREE.EdgesGeometry(crystalGeometry);
const crystalLine = new THREE.LineSegments(
  crystalEdges,
  new THREE.LineBasicMaterial({ color: 0x7fe0c9, transparent: true, opacity: 0.4 })
);
scene.add(crystalLine);

// v2文字标识（Sprite）
const v2Canvas = document.createElement('canvas');
v2Canvas.width = 256;
v2Canvas.height = 64;
const v2Ctx = v2Canvas.getContext('2d');
v2Ctx.fillStyle = '#7fe0c9';
v2Ctx.font = '24px "PingFang SC", "Microsoft YaHei", sans-serif';
v2Ctx.textAlign = 'center';
v2Ctx.fillText('念头空间 v2 · S0', 128, 38);
const v2Texture = new THREE.CanvasTexture(v2Canvas);
const v2Sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: v2Texture, transparent: true }));
v2Sprite.position.set(0, -3, 0);
v2Sprite.scale.set(4, 1, 1);
scene.add(v2Sprite);

// ===== 渲染循环 =====
let frameCount = 0;
function animate() {
  requestAnimationFrame(animate);
  frameCount++;

  // 缓慢旋转晶体轮廓（暗示空间可旋转,非业务功能）
  crystalLine.rotation.y += 0.003;
  crystalLine.rotation.x += 0.001;

  renderer.render(scene, camera);
}
animate();

// ===== 窗口适配 =====
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== 全局调试入口（AI自排查支持）=====
// @note(s0, ai-debug, global-entry, since:2026-07-08)
//   暴露到window对象,供AI/开发者通过console排查状态
globalThis.__v2 = {
  stateStore,
  actionRouter,
  scene,
  camera,
  renderer,
  getFrameCount: () => frameCount,
};
console.log('[v2] 全局调试入口已就绪: globalThis.__v2');
