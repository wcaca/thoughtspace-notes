/**
 * [INPUT]: three.js (Camera, Vector3, Quaternion, Euler, MathUtils)
 * [OUTPUT]: 魔方式相机控制 — 6个预设面,滑动手势切换,吸附动画,面指示器
 * [POS]: src/topology 下,被 src/main.js 消费,替换 OrbitControls
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import * as THREE from 'three';

const FACES = {
  front:  { pos: [0, 0, 800],   lookAt: [0, 0, 0],    label: '正面·意识剖面' },
  back:   { pos: [0, 0, -800],  lookAt: [0, 0, 0],    label: '背面·低频区' },
  top:    { pos: [0, 800, 50],  lookAt: [0, 0, 0],    label: '顶面·鸟瞰' },
  bottom: { pos: [0, -800, 50], lookAt: [0, 0, 0],    label: '底面·潜意识深渊' },
  left:   { pos: [-800, 0, 0],  lookAt: [0, 0, 0],    label: '左面·概念扩散' },
  right:  { pos: [800, 0, 0],   lookAt: [0, 0, 0],    label: '右面·概念扩散' }
};

const FACE_ORDER_Y = ['front', 'right', 'back', 'left'];
const FACE_ORDER_X = ['front', 'top', 'back', 'bottom'];

export function createCubeCamera(camera, domElement) {
  let currentFace = 'front';
  let targetPos = new THREE.Vector3(...FACES.front.pos);
  let targetLookAt = new THREE.Vector3(...FACES.front.lookAt);
  let swiping = false;
  let swipeStart = { x: 0, y: 0, time: 0 };
  let pinchDist0 = 0;

  camera.position.set(...FACES.front.pos);
  camera.lookAt(...FACES.front.lookAt);

  // P1-3 (TAS audit 2.8): desktop 用户可切面 — 接受 mouse + touch
  // 原: 仅 touch 触发 swipe,desktop 无法切面
  let lastSwipeTime = 0; // P1-2: 记录最近 swipe 结束时间,供 isSwiping() 判断

  domElement.addEventListener('pointerdown', (e) => {
    swipeStart = { x: e.clientX, y: e.clientY, time: Date.now() };

    // P1-3: 接受 mouse + touch,desktop 也能切面
    if ((e.pointerType === 'touch' || e.pointerType === 'mouse') && e.isPrimary) {
      swiping = true;
    }
  });

  domElement.addEventListener('pointermove', (e) => {
    if (!swiping) return;
  });

  domElement.addEventListener('pointerup', (e) => {
    if (!swiping) return;
    swiping = false;
    lastSwipeTime = Date.now(); // P1-2: 记录 swipe 结束时间

    const dx = e.clientX - swipeStart.x;
    const dy = e.clientY - swipeStart.y;
    const dt = Date.now() - swipeStart.time;

    if (dt > 800) return; // 太慢,不算滑动

    const w = domElement.clientWidth;
    const h = domElement.clientHeight;
    const threshold = 0.3;

    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > w * threshold) {
      // 水平滑动: 绕Y轴旋转
      const idx = FACE_ORDER_Y.indexOf(currentFace);
      const next = dx > 0 ? (idx + 1) % 4 : (idx + 3) % 4;
      switchToFace(FACE_ORDER_Y[next]);
    } else if (Math.abs(dy) > h * threshold) {
      // 垂直滑动: 绕X轴旋转
      const idx = FACE_ORDER_X.indexOf(currentFace);
      const next = dy > 0 ? (idx + 1) % 4 : (idx + 3) % 4;
      switchToFace(FACE_ORDER_X[next]);
    }
  });

  domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoom = e.deltaY > 0 ? 1.1 : 0.9;
    // P0-2 (TAS audit 1.4): 同步 targetPos,避免被 update() lerp 抵消
    // 原: 仅改 camera.position,下一帧 lerp 拉回 targetPos,缩放在 0.4s 内被抵消
    camera.position.multiplyScalar(zoom);
    targetPos.copy(camera.position); // 锁定 targetPos 为当前缩放后位置

    const dist = camera.position.length();
    if (dist < 200) {
      camera.position.normalize().multiplyScalar(200);
      targetPos.copy(camera.position);
    }
    if (dist > 2000) {
      camera.position.normalize().multiplyScalar(2000);
      targetPos.copy(camera.position);
    }
  }, { passive: false });

  domElement.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      pinchDist0 = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  }, { passive: true });

  domElement.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = pinchDist0 / d;
      camera.position.multiplyScalar(scale);
      pinchDist0 = d;
      const dist = camera.position.length();
      if (dist < 200) camera.position.normalize().multiplyScalar(200);
      if (dist > 2000) camera.position.normalize().multiplyScalar(2000);
    }
  }, { passive: true });

  function switchToFace(faceName) {
    currentFace = faceName;
    const face = FACES[faceName];
    targetPos.set(...face.pos);
    targetLookAt.set(...face.lookAt);
    onFaceChanged?.(faceName);
  }

  let onFaceChanged = null;

  return {
    update() {
      camera.position.lerp(targetPos, 0.12);
      const dir = targetLookAt.clone().sub(camera.position).normalize();
      const targetQuat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 0, -1), dir
      );
      camera.quaternion.slerp(targetQuat, 0.12);
    },

    getCurrentFace() { return currentFace; },

    switchTo(faceName) { switchToFace(faceName); },

    onFaceChange(cb) { onFaceChanged = cb; },

    getCameraFront() {
      const dir = new THREE.Vector3(0, 0, -1);
      dir.applyQuaternion(camera.quaternion);
      return dir.normalize();
    },

    // P1-2 (TAS audit 2.7): 暴露 swipe 状态供 main.js click 短路
    // swipe 进行中 或 swipe 结束后 300ms 内返回 true (避免 click 误投)
    isSwiping() {
      if (swiping) return true;
      if (Date.now() - lastSwipeTime < 300) return true;
      return false;
    }
  };
}

export function createFaceIndicator(container) {
  const el = document.createElement('div');
  el.id = 'face-indicator';
  Object.assign(el.style, {
    position: 'fixed', bottom: '100px', right: '24px', zIndex: '20',
    width: '60px', height: '60px',
    background: 'rgba(20,26,51,0.7)', border: '1px solid #2a3358',
    borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'PingFang SC, Microsoft YaHei, sans-serif',
    fontSize: '10px', color: '#7fe0c9', letterSpacing: '2px',
    transition: 'all 0.4s'
  });
  el.textContent = '正面';
  container.appendChild(el);

  return {
    update(faceName) {
      const map = { front: '正面', back: '背面', top: '顶面', bottom: '底面', left: '左面', right: '右面' };
      el.textContent = map[faceName] || faceName;
      el.style.color = '#7fe0c9';
      setTimeout(() => { el.style.color = '#8b90ad'; }, 200);
    }
  };
}
