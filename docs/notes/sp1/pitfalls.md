# SP-1 易错陷阱手册

> **本文件目标**: 在写 SP-1 相关代码时,**避免重蹈覆辙**。
> 每条陷阱都有: 症状 / 根因 / 修复 / 代码示例 / 关联 commit。

---

## T1.4-no-bootstrap

**症状**: `currentLayerStore.list()` 返回空,UI 找不到任何层  
**根因**: 实例化后没调 `bootstrapDefaults()`  
**修复**: 必须在装配最后调一次

```javascript
// src/main.js (T1.4 装配区)
const currentLayerStore = createLayerStore();
const currentSortHistory = createSortHistory();
const currentCanvasMode = createCanvasMode();
bootstrapPersistence();
currentLayerStore.bootstrapDefaults();  // ⚠️ 易错: 没这一行 layers=0
```

**验证**: `currentLayerStore.size() === 6`

---

## T1.4-recordOrder-side-effect

**症状**: 在 `applyObserveReorder` 末尾加 `currentSortHistory.recordOrder(orderedIds)` 后,**未保存的 order 也被写入**  
**根因**: recordOrder 每次都改 `currentAxis = MANUAL`,**会覆盖用户当前的轴选择**  
**修复**: 这是设计意图(用户拖动 = 主动表达信念),但要让 UI 同步刷新

```javascript
function applyObserveReorder(orderedIds, opts = {}) {
  // ... 写 thought order ...
  currentSortHistory.recordOrder(orderedIds);
  // 注意: 这会让 currentAxis 切到 manual
  // UI 需调 getCurrentAxis() 重新渲染,否则 bar 文本会过期
}
```

---

## T1.5-json-undefined-side-effect

**症状**: `fromJSON(undefined)` 后 store 被清空  
**根因**: 早期版本有 `clear() → return if !isArray`,反过来就会清空  
**修复**: 先检查再 clear

```javascript
// ✅ 正确顺序
function fromJSON(arr) {
  if (!Array.isArray(arr)) return;  // 先检查
  layerById.clear();                  // 再清空
  // ...
}
```

---

## T2.1-ob-content-not-yet-attached

**症状**: 在 `header.appendChild()` 阶段就调 `root.querySelector('.ob-content')` 返回 null  
**根因**: `.ob-content` 是在 `root.appendChild(content)` **之后**才存在  
**修复**: 默认模式渲染必须在 content appendChild **之后**

```javascript
// ❌ 错误位置
header.appendChild(canvasTabsHost.tabsEl);
if (initialMode === 'background') {
  renderBackgroundMode(root.querySelector('.ob-content'), ...);  // null
}

// ✅ 正确位置
header.appendChild(canvasTabsHost.tabsEl);
root.appendChild(content);
if (initialMode === 'background') {
  renderBackgroundMode(content, ...);  // 有值
}
```

---

## T2.4-makeCard-hoisting

**症状**: 在 `renderBlockMode` 里调 `makeCard()` 报 `not defined`  
**根因**: `makeCard` 在 `renderCards` 内部,看似在 `renderBlockMode` 之后  
**修复**: function declaration 自动 hoisting,实际上 OK;但 `const makeCard = ...` 形式就**不行**

```javascript
// ✅ OK (function declaration)
function makeCard(t, callbacks) { ... }

// ❌ 错 (const 形式)
const makeCard = (t, callbacks) => { ... };
// 此时在它之前调会 TDZ 报错
```

---

## T2.1-panel-stack-onclose-collision

**症状**: 切换 canvas-mode 时,旧 root 没被清掉,但新 root 已添加  
**根因**: panel-stack 检测到旧 'observe' 在栈里 → 调旧 onClose → **误清 activeOverlay**(已经是新 root)  
**修复**: 面板栈的 onClose 必须只清"闭包对应的旧 root",不碰 activeOverlay

```javascript
registerPanel('observe', root, () => {
  if (root && root.parentNode) {
    root.style.opacity = '0';
    setTimeout(() => { if (root.parentNode) root.remove(); }, 250);
  }
  // 不要: activeOverlay = null
  // 不要: getPanelStack().close('observe')
});
```

**这是 T11 修复的根因**——SP-1 UI 复用了此修复路径,**不能破坏**。

---

## T2.3-bucket-empty-card-grid

**症状**: 背景模式下,某个 bucket 列完全空白  
**根因**: filter 把卡片分错桶(温度边界值)  
**修复**: 边界值已仔细定义(>0.6 / 0.3-0.6 / 0.1-0.3 / ≤0.1)

```javascript
// ✅ 当前定义
{ key: 'burning', test: (t) => (t.temperature ?? 0) > 0.6 }
{ key: 'warm', test: (t) => (t.temperature ?? 0) > 0.3 && (t.temperature ?? 0) <= 0.6 }
{ key: 'cooling', test: (t) => (t.temperature ?? 0) > 0.1 && (t.temperature ?? 0) <= 0.3 }
{ key: 'sediment', test: (t) => (t.temperature ?? 0) <= 0.1 }
```

⚠️ **未来风险**: 如果改用 `layer.kind === 'subconscious'` 替代温度分桶,需要重新分配。

---

## T2.4-no-actual-long-press

**症状**: 用户期待"长按 600ms 召唤排序轴条",实际只看到单击立即展开  
**根因**: T2.2 只实现了 `summonBtn.click()`,**没实现真正长按手势**  
**修复**: 待补 — 需要在真实浏览器中调优长按阈值

```javascript
// 当前实现 (待扩展)
summonBtn.addEventListener('click', () => onSummon());
// 应该: 还要支持 touchstart/mousedown + setTimeout 600ms + touchend 取消
```

**位置**: src/render/observe-views.js buildSortSummon()

---

## 数据层与 main.js 装配的解耦

**症状**: 修改 main.js 装配代码时,反复担心破坏现有功能  
**根因**: main.js 是 2471 行的 Phase 0 大文件  
**缓解**: 仅在 `zoneBridge / zoneStore` 附近加,不动核心热路径

**已建立的保护网**:
- `try / catch` 包裹 `window.__sp1State` 调用
- 没有 `__sp1State` 时,SP-1 优雅降级(不渲染 tab)
- 每次 T1.4 / T1.5 / T2.* 完成都跑**全量测试**(477+15+14 = 506 测试)

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md