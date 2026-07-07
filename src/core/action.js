/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: Action 数据创建 / 状态流转 / 标题生成
 * [POS]: src/core 下 — Action(Todo) 数据的"源工厂",被 persistence 和 render 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

let actionCounter = 0;

export function createAction(sourceThoughtIds, title, opts = {}) {
  const now = Date.now();
  return {
    id: `a_${now}_${++actionCounter}`,
    title: title || '',
    sourceThoughtIds: Array.isArray(sourceThoughtIds) ? [...sourceThoughtIds] : [],
    status: opts.status || 'todo', // todo | doing | done
    dueDate: opts.dueDate || null,
    createdAt: now,
    completedAt: null
  };
}

export function setStatus(action, status) {
  if (!action) return action;
  const valid = ['todo', 'doing', 'done'];
  if (!valid.includes(status)) return action;
  return {
    ...action,
    status,
    completedAt: status === 'done' ? Date.now() : null
  };
}

export function cycleStatus(action) {
  if (!action) return action;
  const order = ['todo', 'doing', 'done'];
  const i = order.indexOf(action.status || 'todo');
  const next = order[(i + 1) % order.length];
  return setStatus(action, next);
}

/**
 * 从一组念头中生成默认标题(用前 2 个念头的 text 截断拼接)。
 */
export function suggestTitle(thoughts) {
  if (!thoughts || thoughts.length === 0) return '新行动';
  const top = thoughts.slice(0, 2).map(t => {
    const text = (t.text || '').trim();
    return text.length > 12 ? text.slice(0, 12) + '…' : text;
  });
  if (thoughts.length > 2) return `${top.join(' + ')} 等 ${thoughts.length} 个`;
  return top.join(' + ');
}
