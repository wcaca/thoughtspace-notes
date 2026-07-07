/**
 * [INPUT]: cubeCamera / thoughtMap 等系统组件(可选);以及 update(key, value) 写入
 * [OUTPUT]: getViewportState() singleton → { read(), subscribe(listener, options?), update(key, value), updateBatch(patch), lockUpdates(bool), dispose() }
 * [POS]: src/render/viewport-state.js — 统一视角总线;所有面板/相机/观察模式从此读,杜绝"三独立坐标系"
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 *
 * 哲学:
 *  - 上游零污染:已有组件继续按原来工作,本模块只做聚合观察点
 *  - 读永远纯:read() 不影响任何状态
 *  - 写入隔离:update() / updateBatch() 默认可被锁定;listeners 只收"我订阅的字段变了"
 *  - 派生 = 在总线里算一次:wholesomeness / cameraMood / derivedShape 在 read() 链路里算
 *
 * Signal reference:
 *   cameraFace      'front'|'right'|'back'|'left'|'top'|'bottom'
 *   cameraDistance  0..1 (0=近,1=远)
 *   cameraStable    bool
 *   selectionCount  int
 *   totalCount      int
 *   focusRecencyMs  int (ms since last focus operation)
 *   observeMode     'cards'|'kanban'|'timeline'|null
 *   deviceMode      'mobile'|'desktop'
 *   dwellMs         int (current viewport dwell time)
 *   ambientMood     'cold'|'neutral'|'warm'
 *   wholesomeness   derived 0..1 (shape-resolver)
 *   derivedShape    derived 'discrete'|'discrete_with_metric'|'metric_with_anchors'|'continuous'
 *   cameraMood      derived 'orbit'|'face'|'smooth'
 */

import { shapeResolve, setShapeFlagResolver } from '../core/shape-resolver.js';
import { getVariant as _getFlagVariant } from '../runtime/flags/index.js';

let _flagInjected = false;
const _injectFlagResolver = () => {
  if (_flagInjected) return;
  try {
    setShapeFlagResolver(_getFlagVariant);
    _flagInjected = true;
  } catch {}
};

const DEFAULT_STATE = Object.freeze({
  cameraFace: 'front',
  cameraDistance: 0.5,
  cameraStable: true,
  selectionCount: 0,
  totalCount: 0,
  focusRecencyMs: 0,
  observeMode: null,
  deviceMode: 'desktop',
  dwellMs: 0,
  ambientMood: 'neutral'
});

const VALID_KEYS = Object.freeze(new Set(Object.keys(DEFAULT_STATE)));

class ViewportStateImpl {
  constructor() {
    this._state = { ...DEFAULT_STATE };
    this._listeners = new Set();
    this._locked = false;
    this._isDisposed = false;
  }

  read() {
    if (this._isDisposed) throw new Error('viewport-state: disposed');
    try {
      if (!_flagInjected) {
        setShapeFlagResolver(_getFlagVariant);
        _flagInjected = true;
      }
    } catch {}
    const s = this._state;
    const wholesomenessData = shapeResolve({
      n: s.totalCount,
      k: s.selectionCount,
      hullHits: 0,
      dwellMs: s.dwellMs
    });
    const wholesomeness = wholesomenessData.score;
    const derivedShape = wholesomenessData.shape;
    const cameraMood = s.cameraStable
      ? (s.cameraDistance < 0.2 ? 'orbit' : 'face')
      : 'smooth';
    return Object.freeze({
      ...s,
      selectionRatio: s.totalCount > 0 ? s.selectionCount / s.totalCount : 0,
      wholesomeness,
      derivedShape,
      cameraMood
    });
  }

  _writePatch(patch) {
    if (this._isDisposed) throw new Error('viewport-state: disposed');
    if (this._locked) return [];
    if (!patch || typeof patch !== 'object') return [];
    const changedKeys = [];
    const next = { ...this._state };
    for (const k of Object.keys(patch)) {
      if (!VALID_KEYS.has(k)) continue;
      if (Object.is(next[k], patch[k])) continue;
      next[k] = patch[k];
      changedKeys.push(k);
    }
    if (changedKeys.length === 0) return [];
    this._state = next;
    this._emit(changedKeys);
    return changedKeys;
  }

  update(key, value) {
    if (!VALID_KEYS.has(key)) {
      console.warn(`[viewport-state] unknown key "${key}"`);
      return [];
    }
    return this._writePatch({ [key]: value });
  }

  updateBatch(patch) {
    return this._writePatch(patch);
  }

  subscribe(listener, options = {}) {
    if (this._isDisposed) throw new Error('viewport-state: disposed');
    if (typeof listener !== 'function') throw new Error('listener 必须为函数');
    const watchKeys = options.keys ? new Set(options.keys) : null;
    const wrapper = (snapshot, changedKeys) => {
      if (watchKeys && !changedKeys.some((k) => watchKeys.has(k))) return;
      try {
        listener(snapshot, changedKeys);
      } catch (e) {
        console.error('[viewport-state] listener 异常:', e);
      }
    };
    this._listeners.add(wrapper);
    return () => this._listeners.delete(wrapper);
  }

  _emit(changedKeys) {
    if (this._isDisposed) return;
    const snap = this.read();
    queueMicrotask(() => {
      if (this._isDisposed) return;
      this._listeners.forEach((cb) => cb(snap, changedKeys));
    });
  }

  lockUpdates(locked = true) {
    this._locked = !!locked;
  }

  isLocked() { return this._locked; }

  dispose() {
    this._listeners.clear();
    this._isDisposed = true;
  }
}

let _instance = null;

export function getViewportState() {
  if (!_instance) _instance = new ViewportStateImpl();
  return _instance;
}

export function resetViewportState() {
  if (_instance) _instance.dispose();
  _instance = null;
}
