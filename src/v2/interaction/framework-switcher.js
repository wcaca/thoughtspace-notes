/**
 * [INPUT]: core/cognitive-framework.js (CognitiveFrameworkSystem), core/layer.js (LayerSystem), persistence/layer-bridge.js (可选)
 * [OUTPUT]: FrameworkSwitcher类 — 认知框架切换器（状态管理+预览+回调）
 * [POS]: src/v2/interaction/framework-switcher.js,L3交互层,框架切换
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计依据: 空间交互设计.md §1.6 可切换认知框架、§2.1 可定制性边界
 *   - 不绑死任何理论，提供可切换框架系统（8种预设+自定义）
 *   - L1-5约束: AI辅助建议以半透明预览形式，用户确认才生效
 *   - 界面统一性: 所有切换通过统一界面操作
 *
 * @note(s1, decision, framework-switcher, since:2026-07-08)
 *   S1-D.1.13: 框架切换UI接口，与CognitiveFrameworkSystem联动。
 *   WARN-9原话追溯: 实现框架切换UI（§1.6）。
 *   本组件只提供状态管理和回调，DOM渲染由上层负责。
 */

// ===== FrameworkSwitcher类 =====

/**
 * 认知框架切换器 — 框架切换的状态管理和回调
 *
 * 核心职责:
 *   1. 查询当前/可用框架
 *   2. 切换框架（委托CognitiveFrameworkSystem，会重建LayerSystem层）
 *   3. 预览框架（L1-5约束：不直接生效，用户确认后才切换）
 *   4. 自定义框架管理（委托CognitiveFrameworkSystem）
 *   5. 事件回调管理（onSwitch/onPreview/off）
 *   6. 持久化（可选，通过LayerBridge）
 *
 * 不职责:
 *   - 不渲染切换UI（DOM渲染由上层负责）
 *   - 不直接操作LayerSystem（通过CognitiveFrameworkSystem）
 *   - 不管理层定义（由CognitiveFrameworkSystem/LayerSystem负责）
 *
 * 设计约束:
 *   - §1.6 不绑死任何理论，提供可切换框架系统（8种预设+自定义）
 *   - §2.1 界面统一性，所有切换通过统一界面操作
 *   - L1-5约束: AI辅助建议以半透明预览形式，用户确认才生效
 */
export class FrameworkSwitcher {
  /**
   * @param {Object} options
   * @param {import('../core/cognitive-framework.js').CognitiveFrameworkSystem} [options.frameworkSystem] - 认知框架系统实例
   * @param {import('../core/layer.js').LayerSystem} [options.layerSystem] - 层系统实例（参考，实际操作经框架系统）
   * @param {Object} [options.layerBridge] - LayerBridge实例（可选，用于持久化）
   */
  constructor({ frameworkSystem = null, layerSystem = null, layerBridge = null } = {}) {
    /** @type {import('../core/cognitive-framework.js').CognitiveFrameworkSystem|null} 关联的框架系统 */
    this._frameworkSystem = frameworkSystem;
    /** @type {import('../core/layer.js').LayerSystem|null} 关联的层系统（参考用） */
    this._layerSystem = layerSystem;
    /** @type {Object|null} 持久化桥（可选） */
    this._layerBridge = layerBridge;
    /** @type {string|null} 预览中的框架ID（不生效，L1-5约束） */
    this._previewFrameworkId = null;
    /** @type {Array<(frameworkId: string) => void>} 切换回调列表 */
    this._switchCallbacks = [];
    /** @type {Array<(frameworkId: string) => void>} 预览回调列表 */
    this._previewCallbacks = [];
  }

  // ===== 状态查询 =====

  /**
   * 获取当前激活的框架ID
   * @returns {string|null} 当前框架ID（无激活或无frameworkSystem返回null）
   */
  getCurrentFramework() {
    return this._frameworkSystem?.getActiveFramework()?.id || null;
  }

  /**
   * 获取当前激活的框架名称
   * @returns {string|null} 当前框架名称（无激活返回null）
   */
  getCurrentFrameworkName() {
    return this._frameworkSystem?.getActiveFramework()?.name || null;
  }

  /**
   * 获取可用框架列表（摘要形式）
   * @returns {Array<{id: string, name: string, partitionCount: number, isPreset: boolean}>} 框架摘要列表
   */
  getAvailableFrameworks() {
    if (!this._frameworkSystem) return [];
    return this._frameworkSystem.getFrameworks().map((f) => ({
      id: f.id,
      name: f.name,
      partitionCount: f.partitionCount,
      isPreset: this._frameworkSystem.isPreset(f.id),
    }));
  }

  /**
   * 判断指定框架是否为预设框架
   * @param {string} frameworkId
   * @returns {boolean}
   */
  isPreset(frameworkId) {
    return this._frameworkSystem ? this._frameworkSystem.isPreset(frameworkId) : false;
  }

  // ===== 框架切换 =====

  /**
   * 切换到指定框架
   * - 调用frameworkSystem.switchTo（会重建LayerSystem层）
   * - 如有layerBridge，调用saveFramework + saveToYjs 持久化
   * - 触发onSwitch回调
   * @param {string} frameworkId
   * @returns {boolean} 是否切换成功
   */
  switchTo(frameworkId) {
    if (!this._frameworkSystem) return false;
    const ok = this._frameworkSystem.switchTo(frameworkId);
    if (!ok) return false;
    // 持久化（失败不影响切换）
    if (this._layerBridge) {
      try {
        if (typeof this._layerBridge.saveFramework === 'function') {
          this._layerBridge.saveFramework(frameworkId);
        }
        if (typeof this._layerBridge.saveToYjs === 'function') {
          this._layerBridge.saveToYjs();
        }
      } catch (_e) {
        // 持久化失败不阻断切换流程
      }
    }
    // 触发切换回调
    this._fireSwitchCallbacks(frameworkId);
    return true;
  }

  /**
   * 切换到预设框架（仅允许预设框架）
   * @param {string} frameworkId
   * @returns {boolean} 是否切换成功
   */
  switchToPreset(frameworkId) {
    if (!this.isPreset(frameworkId)) return false;
    return this.switchTo(frameworkId);
  }

  /**
   * 切换到自定义框架（仅允许非预设框架）
   * @param {string} frameworkId
   * @returns {boolean} 是否切换成功
   */
  switchToCustom(frameworkId) {
    if (!this._frameworkSystem) return false;
    if (this._frameworkSystem.isPreset(frameworkId)) return false;
    return this.switchTo(frameworkId);
  }

  // ===== 预览（L1-5约束：不直接生效，用户确认后才切换）=====

  /**
   * 预览框架效果（半透明，不生效）
   * - 仅记录预览状态，不实际切换frameworkSystem
   * - 触发onPreview回调，UI层据此显示半透明预览
   * @param {string} frameworkId
   * @returns {boolean} 是否开始预览（框架不存在或无frameworkSystem返回false）
   */
  preview(frameworkId) {
    if (!this._frameworkSystem) return false;
    const fw = this._frameworkSystem.getFramework(frameworkId);
    if (!fw) return false;
    this._previewFrameworkId = frameworkId;
    this._firePreviewCallbacks(frameworkId);
    return true;
  }

  /**
   * 确认预览（生效：切换到预览中的框架）
   * - 清除预览状态后调用switchTo（switchTo会触发onSwitch回调）
   * @returns {boolean} 是否切换成功（无预览返回false）
   */
  confirmPreview() {
    if (this._previewFrameworkId === null) return false;
    const id = this._previewFrameworkId;
    this._previewFrameworkId = null;
    return this.switchTo(id);
  }

  /**
   * 取消预览（清除预览状态，不切换）
   */
  cancelPreview() {
    this._previewFrameworkId = null;
  }

  /**
   * 是否在预览中
   * @returns {boolean}
   */
  isPreviewing() {
    return this._previewFrameworkId !== null;
  }

  /**
   * 获取预览中的框架ID
   * @returns {string|null}
   */
  getPreviewFramework() {
    return this._previewFrameworkId;
  }

  // ===== 自定义框架管理 =====

  /**
   * 创建自定义框架（委托给frameworkSystem.createCustomFramework）
   * @param {Object} options
   * @param {string} options.id - 框架ID（不可与预设冲突）
   * @param {string} options.name - 框架名称
   * @param {string} [options.description] - 描述
   * @param {Array} options.layerDefs - 层定义数组
   * @returns {Object|null} 创建的框架定义（失败返回null）
   */
  createCustomFramework({ id, name, description, layerDefs }) {
    if (!this._frameworkSystem) return null;
    return this._frameworkSystem.createCustomFramework({ id, name, description, layerDefs });
  }

  /**
   * 删除自定义框架（预设框架不可删除）
   * - 委托给frameworkSystem.unregisterFramework（已内置预设保护）
   * @param {string} frameworkId
   * @returns {boolean} 是否删除成功
   */
  deleteCustomFramework(frameworkId) {
    if (!this._frameworkSystem) return false;
    return this._frameworkSystem.unregisterFramework(frameworkId);
  }

  /**
   * 获取所有自定义框架（非预设）
   * @returns {Array<{id: string, name: string, partitionCount: number, isPreset: boolean}>}
   */
  getCustomFrameworks() {
    return this.getAvailableFrameworks().filter((f) => !f.isPreset);
  }

  // ===== 事件回调 =====

  /**
   * 注册切换回调（框架切换成功后触发）
   * @param {(frameworkId: string) => void} callback
   * @returns {this} 支持链式调用
   */
  onSwitch(callback) {
    if (typeof callback === 'function') this._switchCallbacks.push(callback);
    return this;
  }

  /**
   * 注册预览回调（进入预览时触发，UI层据此显示半透明预览）
   * @param {(frameworkId: string) => void} callback
   * @returns {this} 支持链式调用
   */
  onPreview(callback) {
    if (typeof callback === 'function') this._previewCallbacks.push(callback);
    return this;
  }

  /**
   * 注销回调（从switch和preview两个列表中移除）
   * @param {Function} callback
   * @returns {this} 支持链式调用
   */
  off(callback) {
    const idxS = this._switchCallbacks.indexOf(callback);
    if (idxS !== -1) this._switchCallbacks.splice(idxS, 1);
    const idxP = this._previewCallbacks.indexOf(callback);
    if (idxP !== -1) this._previewCallbacks.splice(idxP, 1);
    return this;
  }

  /**
   * 触发切换回调（内部方法）
   * @param {string} frameworkId
   * @private
   */
  _fireSwitchCallbacks(frameworkId) {
    for (const cb of [...this._switchCallbacks]) {
      try {
        cb(frameworkId);
      } catch (_e) {
        // 单个回调失败不影响其他回调
      }
    }
  }

  /**
   * 触发预览回调（内部方法）
   * @param {string} frameworkId
   * @private
   */
  _firePreviewCallbacks(frameworkId) {
    for (const cb of [...this._previewCallbacks]) {
      try {
        cb(frameworkId);
      } catch (_e) {
        // 单个回调失败不影响其他回调
      }
    }
  }

  // ===== 持久化 =====

  /**
   * 保存当前框架到layerBridge
   * - 保存框架ID和层定义（如bridge支持）
   * @returns {boolean} 是否保存成功（无bridge或无激活框架返回false）
   */
  save() {
    if (!this._layerBridge || !this._frameworkSystem) return false;
    const fwId = this.getCurrentFramework();
    if (fwId === null) return false;
    try {
      if (typeof this._layerBridge.saveFramework === 'function') {
        this._layerBridge.saveFramework(fwId);
      }
      // 保存层定义（如bridge支持）
      const fw = this._frameworkSystem.getFramework(fwId);
      if (fw && typeof this._layerBridge.saveLayerDefs === 'function') {
        this._layerBridge.saveLayerDefs(fw.layerDefs);
      }
      if (typeof this._layerBridge.saveToYjs === 'function') {
        this._layerBridge.saveToYjs();
      }
      return true;
    } catch (_e) {
      return false;
    }
  }

  /**
   * 从layerBridge加载框架
   * - 读取框架ID并switchTo（会触发onSwitch回调）
   * @returns {boolean} 是否加载成功（无bridge或无数据返回false）
   */
  load() {
    if (!this._layerBridge || !this._frameworkSystem) return false;
    try {
      let fwId = null;
      if (typeof this._layerBridge.loadFramework === 'function') {
        fwId = this._layerBridge.loadFramework();
      }
      if (!fwId) return false;
      return this.switchTo(fwId);
    } catch (_e) {
      return false;
    }
  }

  // ===== 摘要 =====

  /**
   * 获取切换器摘要（供AI排查）
   * @returns {{currentFramework: string|null, currentFrameworkName: string|null, availableCount: number, isPreviewing: boolean, previewFramework: string|null, customCount: number}}
   */
  getSummary() {
    return {
      currentFramework: this.getCurrentFramework(),
      currentFrameworkName: this.getCurrentFrameworkName(),
      availableCount: this.getAvailableFrameworks().length,
      isPreviewing: this.isPreviewing(),
      previewFramework: this.getPreviewFramework(),
      customCount: this.getCustomFrameworks().length,
    };
  }
}

// ===== 默认导出 =====

export default FrameworkSwitcher;
