# 方法 05 · 系统性调试

> **TL;DR**:
> 1. **trace data flow** — 找症状的真正数据来源,不是错误出现的地方
> 2. **3+ 失败要重审架构** — 不是改测试,是改设计
> 3. **状态机时序** — module-level 变量在闭包调用中的身份错位是常见 bug
> 4. **每次修复必带回归测试** — 不是"看起来对了",是"测试永远守住"

## §1 反模式:在错误出现处改

```
症状: 测试失败,断言 expected 4 got 0
错误出现处: querySelectorAll('.ob-kanban-col') 返回 0
常见错误反应: 在 querySelectorAll 后加 setTimeout,或者改 selector
```

**正确反应**: trace 为什么 0 个元素被创建。

```
1. 元素被创建吗? → check renderKanban 是否被调
2. 调了但没 appendChild? → check showObserveView 流程
3. appendChild 了但被删除? → check panel-stack onClose
4. onClose 误清? → trace closure 闭包变量 + activeOverlay 时序
```

## §2 流程

### Step 1: 复现
- 写最小测试 case 复现 bug
- 把 case 加到 e2e 或单元测试

### Step 2: trace data flow
- 数据从哪来?(用户输入 / 配置 / 时间 / 闭包变量)
- 经过哪些函数?
- 在哪个环节出错?

### Step 3: 找到真正根因
- **不是错误出现处** — 错误出现处只是"症状"
- 真正根因是"为什么数据没到那里"

### Step 4: 验证根因
- 写一个 minimal test 验证根因
- 修复后,确认 minimal test 通过
- 跑全量测试,确认无回归

### Step 5: 写回归测试
- 不是只测"修复后能跑"
- 测"这个 bug 不会再出现"

## §3 关键技巧

### 3.1 模块级状态 vs 闭包变量

```javascript
// module-level
let activeOverlay = null;

// 闭包
function showObserveView() {
  activeOverlay = createRoot();  // 闭包 A
  registerPanel('observe', activeOverlay, () => {
    // 闭包 B
    // 此时 activeOverlay 已经被新一次调用改过了!
    if (activeOverlay && activeOverlay !== root) {
      // 删错对象!
    }
  });
}
```

**修正**:闭包只操作自己捕获的变量,不依赖 module-level。

### 3.2 时序约束

```javascript
// 错误:在 appendChild 之前就 querySelector
header.appendChild(tabsEl);
const content = root.querySelector('.ob-content');  // null!

// 正确:appendChild 之后
root.appendChild(content);
const c = root.querySelector('.ob-content');  // ok
```

**修正**:记录时序约束,在注释里链向 pitfalls.md。

### 3.3 rAF vs 同步

jsdom 不执行 requestAnimationFrame → 测试要**同步**调用,不能用 rAF 延后。

```javascript
// 错 (测试失败,生产环境 OK)
requestAnimationFrame(() => render(content, list));

// 对 (测试通过,生产环境也 OK)
render(content, list);
```

### 3.4 4 阶段失败要重审

> "3 阶段失败要重审架构"

如果连续 3 次"小改"失败 → 不要继续小改,**重审架构假设**。

**示例 (T11 修复)**:
- 阶段 1: 在按钮 click handler 移除 hideObserveView() → 失败
- 阶段 2: 加 source 标记区分新老 root → 失败
- 阶段 3: showObserveView 入口也移除 hideObserveView() → 失败
- 阶段 4: **重审** — 发现 activeOverlay 是 module-level,新 root 赋值后旧 onClose 闭包指向旧 root,但 activeOverlay 已经是新 root → **对象身份错位**

## §4 调试速查:DEBUG_NOTES.md

把调试经验沉淀为 [DEBUG_NOTES.md](../DEBUG_NOTES.md):

```markdown
## 症状 → 怀疑清单 → 关键代码行号

### 症状 A: 测试失败,expected X got 0
1. 怀疑: 数据未到 → check `xxx.js` L123
2. 怀疑: 时序错误 → check `yyy.js` L45
3. 怀疑: 闭包变量错位 → check `zzz.js` L78
```

## §5 与其他方法的关系

| 上游 | 下游 |
|---|---|
| 06 架构守卫 (测试失败) | **05** |
| 03 拓扑表 (查状态) | **05** |

## §6 我们的实践

- T11 修复:卡片→看板切换递归关闭 bug
- T1.5 修复:fromJSON(undefined) 破坏数据
- 详见 [DEBUG_NOTES.md](../DEBUG_NOTES.md)

---

[PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md