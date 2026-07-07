/**
 * [INPUT]: src/render/global-search.js (searchThoughts / matchThought)
 * [OUTPUT]: 验证匹配器打分 + 排序 + 容错
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { __test__ } from '../../src/render/global-search.js';

const { matchThought, searchThoughts } = __test__;

function T(id, text, labels = []) {
  return { id, text: text || '', labels };
}

describe('matchThought', () => {
  it('matches direct text', () => {
    expect(matchThought(T('a', '显意识 投影'), '显')).toBeGreaterThan(0);
    expect(matchThought(T('a', '显意识 投影'), '显')).toBeGreaterThan(matchThought(T('b', 'subconscious'), '显') || 0);
  });

  it('matches across labels', () => {
    expect(matchThought(T('a', 'x', ['灵感', 'work']), '灵感')).toBeGreaterThan(0);
    expect(matchThought(T('a', 'x', ['灵感']), '灵')).toBeGreaterThan(0);
  });

  it('returns 0 when no match', () => {
    expect(matchThought(T('a', '显'), '不存在的')).toBe(0);
    expect(matchThought(T('a', ''), '')).toBe(0);
    expect(matchThought(null, '啥')).toBe(0);
  });

  it('text matches rank higher than label matches', () => {
    const textHit = matchThought(T('a', '显意识'), '显');
    const labelHit = matchThought(T('b', 'xxxx', ['显']), '显');
    expect(textHit).toBeGreaterThan(labelHit);
  });
});

describe('searchThoughts', () => {
  it('returns empty for empty query', () => {
    const out = searchThoughts([T('a', 'x')], '');
    expect(out).toEqual([]);
    const out2 = searchThoughts([T('a', 'x')], '   ');
    expect(out2).toEqual([]);
  });

  it('returns sorted matches (best first)', () => {
    const data = [
      T('1', '爱和自由'),
      T('2', '关于「爱」的次要观察'),
      T('3', '不相关的'),
      T('4', '爱爱爱爱爱')
    ];
    const out = searchThoughts(data, '爱');
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out[out.length - 1].id).not.toBe('3');
  });

  it('ranks earlier-text-match higher than later-text-match', () => {
    const data = [
      T('late', 'xxxxx爱'),
      T('early', '爱xxxx')
    ];
    const out = searchThoughts(data, '爱');
    expect(out[0].id).toBe('early');
    expect(out[1].id).toBe('late');
  });

  it('case insensitive (lowercase compare)', () => {
    const data = [
      T('1', 'Magnificent Idea'),
      T('2', 'something else')
    ];
    const out = searchThoughts(data, 'magnif');
    expect(out.map((t) => t.id)).toEqual(['1']);
  });

  it('falls back to label search', () => {
    const data = [
      T('1', 'no text match here', ['灵感']),
      T('2', 'no text either', ['work'])
    ];
    const out = searchThoughts(data, '灵感');
    expect(out.length).toBe(1);
    expect(out[0].id).toBe('1');
  });

  it('handles empty thoughts list', () => {
    expect(searchThoughts([], '啥')).toEqual([]);
    expect(searchThoughts(null, '啥')).toEqual([]);
    expect(searchThoughts(undefined, '啥')).toEqual([]);
  });

  it('handles Chinese two-character query', () => {
    const data = [
      T('1', '原型' + '验证'),
      T('2', 'need stuff for 原型验证'),
      T('3', 'no match')
    ];
    const out = searchThoughts(data, '原型');
    expect(out.length).toBe(2);
  });
});
