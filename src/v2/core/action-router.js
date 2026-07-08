/**
 * [INPUT]: 手势事件（来自interaction/gesture-recognizer，S3填充）
 * [OUTPUT]: ActionRouter类 — 用户操作统一路由(手势冲突解决,@note type规范化为decision)
 * [POS]: src/v2/core/action-router.js,L1领域核心,排查基础组件
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 排查方法论: 所有用户操作经统一路由,可追溯因果。
 *   手势 → route() → UserAction → SceneStateStore.applyUserAction()
 *
 * 手势类型（空间交互设计§8）:
 *   - tap: 点击 → 选中+菜单按钮
 *   - long-press: 长按 → 相变（念头↔记忆）
 *   - drag: 拖拽 → 移动位置/层
 *   - swipe-1/4zone: 1/4区滑动 → 视角轨道移动
 *   - pinch: 双指捏合 → 缩放
 *   - pinch-expand: 双指展开 → 进入子空间
 *   - three-finger: 三指 → 撤销/重做
 *
 * 冲突解决策略（S3填充）:
 *   - 单指vs双指: 按触点数量区分
 *   - 点击vs长按: 按持续时间区分（阈值500ms）
 *   - 拖拽vs滑动: 按区域区分（基准面vs1/4操作区）
 *
 * @note(s0, decision, action-router, since:2026-07-08)
 *   S0只建骨架+枚举定义,S3填充手势识别和冲突解决。
 *   当前route()返回占位action或抛NotImplementedError。
 */

/**
 * 未实现错误 —— S0骨架阶段占位方法抛出此错误
 */
export class NotImplementedError extends Error {
  constructor(methodName) {
    super(`ActionRouter.${methodName} 尚未实现（S0骨架，S3填充）`);
    this.name = 'NotImplementedError';
    this.methodName = methodName;
  }
}

/**
 * 手势类型枚举
 */
export const GestureType = Object.freeze({
  TAP: 'tap',                        // 点击
  LONG_PRESS: 'long-press',          // 长按（≥500ms）
  DRAG: 'drag',                      // 拖拽
  SWIPE_1_4_ZONE: 'swipe-1/4zone',   // 1/4操作区滑动
  PINCH: 'pinch',                    // 双指捏合（缩放）
  PINCH_EXPAND: 'pinch-expand',      // 双指展开（进入子空间）
  THREE_FINGER: 'three-finger',      // 三指（撤销/重做）
});

/**
 * 用户动作类型枚举（路由结果）
 */
export const ActionType = Object.freeze({
  SELECT_THOUGHT: 'select-thought',        // 选中念头+显示菜单
  PHASE_TRANSITION: 'phase-transition',    // 相变（念头↔记忆）
  MOVE_THOUGHT: 'move-thought',            // 移动念头位置/层
  ORBIT_MOVE: 'orbit-move',                // 视角轨道移动
  ZOOM: 'zoom',                            // 全局缩放
  ENTER_SUBSPACE: 'enter-subspace',        // 进入子空间
  UNDO: 'undo',                            // 撤销
  REDO: 'redo',                            // 重做
  EDIT_MARK: 'edit-mark',                  // 编辑标记/轨道
  OPEN_MENU: 'open-menu',                  // 打开菜单
  MULTI_SELECT: 'multi-select',            // 多选模式
});

/**
 * 用户操作统一路由 —— 排查基础组件
 *
 * 职责:
 *   1. 接收手势事件
 *   2. 解决手势冲突
 *   3. 路由为UserAction（交给SceneStateStore）
 *
 * 不职责:
 *   - 不直接修改状态（交给SceneStateStore）
 *   - 不直接渲染（交给RenderPipeline）
 */
export class ActionRouter {
  /**
   * @param {Object} options
   * @param {number} [options.longPressThreshold=500] - 长按阈值（ms）
   */
  constructor({ longPressThreshold = 500 } = {}) {
    /** @type {number} 长按阈值 */
    this.longPressThreshold = longPressThreshold;
    /** @type {Map<string, Function>} 手势处理器注册表（S3填充） */
    this._handlers = new Map();
    /** @type {Array<Object>} 操作历史（供排查追溯） */
    this._actionHistory = [];
  }

  /**
   * 路由手势为用户动作
   * @param {Object} gesture - 手势事件（来自gesture-recognizer）
   * @param {string} gesture.type - GestureType
   * @param {Object} [gesture.target] - 目标实体
   * @param {Object} [gesture.delta] - 位移增量
   * @param {number} [gesture.duration] - 持续时间
   * @returns {Object} UserAction
   * @throws {NotImplementedError} S0骨架未实现
   * @note(s0, decision, route, since:2026-07-08)
   *   S3实现: 按gesture.type分发到对应处理器,解决冲突,返回UserAction
   */
  route(gesture) {
    throw new NotImplementedError('route');
  }

  /**
   * 注册手势处理器（S3填充）
   * @param {string} gestureType - GestureType
   * @param {Function} handler - 处理函数 gesture → UserAction
   */
  registerHandler(gestureType, handler) {
    this._handlers.set(gestureType, handler);
  }

  /**
   * 获取操作历史（供AI排查）
   * @param {number} [limit=100] - 返回最近N条
   * @returns {Array<Object>} 操作历史
   * @note(s0, decision, ai-history, since:2026-07-08)
   *   AI自排查能力: 让AI能查看用户操作历史,辅助定位问题
   */
  getActionHistory(limit = 100) {
    return this._actionHistory.slice(-limit);
  }

  /**
   * 获取路由器摘要（用于console调试）
   * @returns {Object} 摘要
   */
  getSummary() {
    return {
      mode: 's0-skeleton',
      handlersCount: this._handlers.size,
      actionHistoryCount: this._actionHistory.length,
      longPressThreshold: this.longPressThreshold,
    };
  }
}

export default ActionRouter;
