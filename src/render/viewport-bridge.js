/**
 * [INPUT]: cubeCam / thoughtMap / observeMode getter / mobileViewport getter / selectedGetter
 * [OUTPUT]: createViewportBridge(inputs) → { tick(), dispose(), getState(), getDerived() }
 * [POS]: src/render/viewport-bridge.js — 同步现有 main.js 状态到 viewport-state 总线;非侵入,纯读取
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 设计:
 *  - 不依赖 main.js 内部变量;接受 getter 函数作为参数(松耦合)
 *  - tick() 在主循环里调用;内部节流 200ms(避免每帧微任务风暴)
 *  - 如果某个 getter 返回 undefined,该字段不写入(保持总线原值)
 *  - throttleMs 接受 0(禁用节流)与 undefined(用默认)
 */

import { getViewportState } from './viewport-state.js';

const DEFAULT_THROTTLE_MS = 200;

const FACE_TO_DISTANCE_BAND = {
  front: 0.5, right: 0.5, back: 0.5, left: 0.5,
  top: 0.7, bottom: 0.9
};

export function createViewportBridge(inputs = {}) {
  const getCubeCamera = inputs.getCubeCamera;
  const getThoughtMap = inputs.getThoughtMap;
  const getSelectedSet = inputs.getSelectedSet;
  const getObserveMode = inputs.getObserveMode;
  const isMobile = inputs.isMobile;
  const throttleMs = inputs.throttleMs == null ? DEFAULT_THROTTLE_MS : inputs.throttleMs;

  const state = getViewportState();
  let lastTickAt = -Infinity;
  let lastFocusAt = 0;
  let disposed = false;

  function tick(now) {
    if (disposed) return;
    const t = now == null
      ? (typeof performance !== 'undefined' ? performance.now() : Date.now())
      : now;
    if (t - lastTickAt < throttleMs) return;
    lastTickAt = t;

    const cubeCam = typeof getCubeCamera === 'function' ? getCubeCamera() : null;
    const thoughtMap = typeof getThoughtMap === 'function' ? getThoughtMap() : null;
    const selectedSet = typeof getSelectedSet === 'function' ? getSelectedSet() : null;
    const observeMode = typeof getObserveMode === 'function' ? getObserveMode() : null;
    const mobile = typeof isMobile === 'function' ? isMobile() : null;

    if (cubeCam && typeof cubeCam.getFace === 'function') {
      const face = cubeCam.getFace();
      if (face) state.update('cameraFace', face);
    }
    if (cubeCam && typeof cubeCam.getDistance === 'function') {
      const d = cubeCam.getDistance();
      if (typeof d === 'number' && Number.isFinite(d)) {
        const norm = Math.max(0, Math.min(1, d / 1400));
        state.update('cameraDistance', norm);
      }
    }
    if (cubeCam) {
      const faceBand = FACE_TO_DISTANCE_BAND[cubeCam.getFace?.()] ?? null;
      const dist = cubeCam.getDistance?.();
      const isStable = typeof dist === 'number' && (
        faceBand != null ? Math.abs(dist / 1400 - faceBand) < 0.05 : true
      );
      state.update('cameraStable', !!isStable);
    }
    if (selectedSet) {
      const size = selectedSet.size;
      state.update('selectionCount', size);
    }
    if (thoughtMap) {
      let total = null;
      if (typeof thoughtMap.size === 'function') {
        total = thoughtMap.size();
      } else if (Array.isArray(thoughtMap)) {
        total = thoughtMap.length;
      } else if (typeof thoughtMap.size === 'number') {
        total = thoughtMap.size;
      }
      if (total != null) state.update('totalCount', total);
    }
    if (observeMode !== null && observeMode !== undefined) {
      state.update('observeMode', observeMode);
    }
    if (mobile != null) {
      state.update('deviceMode', mobile ? 'mobile' : 'desktop');
    }
    const recent = lastTickAt - lastFocusAt;
    state.update('focusRecencyMs', recent > 0 ? recent : 0);
    state.update('dwellMs', recent > 0 ? Math.min(recent, 60_000) : 0);
  }

  function bumpFocus() {
    lastFocusAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  function dispose() {
    disposed = true;
  }

  return {
    tick,
    bumpFocus,
    dispose,
    getState: () => state.read(),
    getDerived: () => {
      const s = state.read();
      return { wholesomeness: s.wholesomeness, derivedShape: s.derivedShape, cameraMood: s.cameraMood };
    }
  };
}