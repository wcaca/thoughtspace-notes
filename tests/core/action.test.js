/**
 * [INPUT]: src/core/action.js
 * [OUTPUT]: 验证 Action 数据模型 — createAction / setStatus / cycleStatus / suggestTitle
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { createAction, setStatus, cycleStatus, suggestTitle } from '../../src/core/action.js';

describe('createAction', () => {
  it('creates an action with default todo status', () => {
    const a = createAction(['t1'], '写文档');
    expect(a.id).toMatch(/^a_\d+_\d+$/);
    expect(a.title).toBe('写文档');
    expect(a.sourceThoughtIds).toEqual(['t1']);
    expect(a.status).toBe('todo');
    expect(a.dueDate).toBeNull();
    expect(a.completedAt).toBeNull();
    expect(typeof a.createdAt).toBe('number');
  });

  it('copies sourceThoughtIds (does not share reference)', () => {
    const sources = ['t1', 't2'];
    const a = createAction(sources, 'test');
    expect(a.sourceThoughtIds).toEqual(['t1', 't2']);
    sources.push('t3');
    expect(a.sourceThoughtIds).toEqual(['t1', 't2']);
  });

  it('handles empty / non-array sourceThoughtIds', () => {
    const a1 = createAction([], 'x');
    expect(a1.sourceThoughtIds).toEqual([]);
    const a2 = createAction(null, 'x');
    expect(a2.sourceThoughtIds).toEqual([]);
  });

  it('accepts opts.status override', () => {
    const a = createAction(['t1'], 'x', { status: 'doing' });
    expect(a.status).toBe('doing');
    expect(a.completedAt).toBeNull();
  });

  it('accepts opts.dueDate', () => {
    const due = Date.now();
    const a = createAction(['t1'], 'x', { dueDate: due });
    expect(a.dueDate).toBe(due);
  });

  it('generates unique ids across calls', () => {
    const a1 = createAction([], 'a');
    const a2 = createAction([], 'b');
    expect(a1.id).not.toBe(a2.id);
  });
});

describe('setStatus', () => {
  it('updates status to todo/doing/done', () => {
    const a = createAction([], 'x');
    const doing = setStatus(a, 'doing');
    expect(doing.status).toBe('doing');
    expect(doing.completedAt).toBeNull();
    const done = setStatus(a, 'done');
    expect(done.status).toBe('done');
    expect(typeof done.completedAt).toBe('number');
  });

  it('clears completedAt when moving from done back to todo', () => {
    const a = createAction([], 'x');
    const done = setStatus(a, 'done');
    expect(done.completedAt).not.toBeNull();
    const back = setStatus(done, 'todo');
    expect(back.status).toBe('todo');
    expect(back.completedAt).toBeNull();
  });

  it('ignores invalid status', () => {
    const a = createAction([], 'x');
    const result = setStatus(a, 'invalid-status');
    expect(result.status).toBe('todo');
  });

  it('returns null/undefined input as-is', () => {
    expect(setStatus(null, 'done')).toBeNull();
    expect(setStatus(undefined, 'done')).toBeUndefined();
  });

  it('does not mutate original object', () => {
    const a = createAction([], 'x');
    const origStatus = a.status;
    const updated = setStatus(a, 'done');
    expect(a.status).toBe(origStatus);
    expect(updated).not.toBe(a);
  });
});

describe('cycleStatus', () => {
  it('cycles todo → doing → done → todo', () => {
    let a = createAction([], 'x');
    expect(a.status).toBe('todo');
    a = cycleStatus(a);
    expect(a.status).toBe('doing');
    a = cycleStatus(a);
    expect(a.status).toBe('done');
    expect(a.completedAt).not.toBeNull();
    a = cycleStatus(a);
    expect(a.status).toBe('todo');
    expect(a.completedAt).toBeNull();
  });

  it('handles null/undefined', () => {
    expect(cycleStatus(null)).toBeNull();
    expect(cycleStatus(undefined)).toBeUndefined();
  });
});

describe('suggestTitle', () => {
  it('returns default for empty thoughts', () => {
    expect(suggestTitle([])).toBe('新行动');
    expect(suggestTitle(null)).toBe('新行动');
  });

  it('uses single thought text', () => {
    const t = { text: '写一个爬虫' };
    expect(suggestTitle([t])).toBe('写一个爬虫');
  });

  it('joins two thoughts with +', () => {
    const t1 = { text: '设计数据库' };
    const t2 = { text: '写后端接口' };
    expect(suggestTitle([t1, t2])).toBe('设计数据库 + 写后端接口');
  });

  it('truncates long text and adds ellipsis', () => {
    const t = { text: '这是一个非常长的念头标题用于测试截断功能' };
    const title = suggestTitle([t]);
    expect(title.length).toBeLessThanOrEqual(13);
    expect(title.endsWith('…')).toBe(true);
  });

  it('shows "等 N 个" for more than 2 thoughts', () => {
    const thoughts = [
      { text: 'a' },
      { text: 'b' },
      { text: 'c' },
      { text: 'd' }
    ];
    const title = suggestTitle(thoughts);
    expect(title).toContain('等 4 个');
    expect(title).toContain('a + b');
  });

  it('handles thoughts with empty / whitespace text', () => {
    const t = { text: '   ' };
    expect(suggestTitle([t])).toBe('');
  });
});
