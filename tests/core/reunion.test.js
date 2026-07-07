/**
 * [INPUT]: src/core/reunion.js
 * [OUTPUT]: 验证意外重逢机制 — tokenize / similarity / findReunions
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import { tokenize, similarity, findReunions } from '../../src/core/reunion.js';

describe('tokenize', () => {
  it('returns empty array for null/empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize(null)).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
  });

  it('extracts english words (lowercased)', () => {
    const tokens = tokenize('Hello World project');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('project');
  });

  it('filters english stop words', () => {
    const tokens = tokenize('the is a project');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('is');
    expect(tokens).toContain('project');
  });

  it('extracts chinese characters (single chars)', () => {
    const tokens = tokenize('念头空间');
    expect(tokens).toEqual(expect.arrayContaining(['念', '头', '空', '间']));
  });

  it('filters chinese stop words', () => {
    const tokens = tokenize('我的念头');
    expect(tokens).not.toContain('我');
    expect(tokens).not.toContain('的');
    expect(tokens).toContain('念');
    expect(tokens).toContain('头');
  });

  it('filters short tokens (< 2 chars for english)', () => {
    const tokens = tokenize('a b hi');
    expect(tokens).not.toContain('a');
    expect(tokens).not.toContain('b');
    expect(tokens).toContain('hi');
  });

  it('handles mixed chinese and english', () => {
    const tokens = tokenize('念头 space');
    expect(tokens).toContain('念');
    expect(tokens).toContain('space');
  });
});

describe('similarity', () => {
  it('returns 0 for empty strings', () => {
    expect(similarity('', 'hello')).toBe(0);
    expect(similarity('hello', '')).toBe(0);
    expect(similarity('', '')).toBe(0);
  });

  it('returns 1 for identical texts', () => {
    const s = similarity('项目管理工具', '项目管理工具');
    expect(s).toBeCloseTo(1, 5);
  });

  it('returns higher for more similar texts', () => {
    const high = similarity('写一个爬虫抓取数据', '写爬虫抓取网页数据');
    const low = similarity('写一个爬虫', '今天天气真好');
    expect(high).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(0);
    expect(low).toBeGreaterThanOrEqual(0);
  });

  it('always returns between 0 and 1', () => {
    const pairs = [
      ['a', 'b'],
      ['hello world', 'hello world'],
      ['abc def', 'xyz'],
      ['念头空间', '笔记工具'],
      ['project management', 'project management tool']
    ];
    for (const [a, b] of pairs) {
      const s = similarity(a, b);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it('is symmetric', () => {
    const s1 = similarity('text A', 'text B');
    const s2 = similarity('text B', 'text A');
    expect(s1).toBeCloseTo(s2, 10);
  });
});

function makeThought(id, text, ageDays = 10) {
  return {
    id,
    text,
    createdAt: Date.now() - ageDays * 86400000
  };
}

describe('findReunions', () => {
  it('returns empty array for fewer than 2 thoughts', () => {
    expect(findReunions([])).toEqual([]);
    expect(findReunions([makeThought('t1', 'hello')])).toEqual([]);
  });

  it('finds similar pairs above threshold', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具开发计划'),
      makeThought('t2', '项目管理工具的设计方案'),
      makeThought('t3', '今天晚上吃什么')
    ];
    const results = findReunions(thoughts, { threshold: 0.3, minAgeDays: 0 });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].a).toBeDefined();
    expect(results[0].b).toBeDefined();
    expect(typeof results[0].score).toBe('number');
  });

  it('returns pairs sorted by score descending', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具开发'),
      makeThought('t2', '项目管理工具设计'),
      makeThought('t3', '项目管理工具测试'),
      makeThought('t4', '今晚吃火锅')
    ];
    const results = findReunions(thoughts, { threshold: 0.2, minAgeDays: 0, maxResults: 10 });
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('respects maxResults limit', () => {
    const thoughts = [];
    for (let i = 0; i < 10; i++) {
      thoughts.push(makeThought(`t${i}`, `项目管理相关的念头 ${i}`, 10));
    }
    const results = findReunions(thoughts, { threshold: 0.3, minAgeDays: 0, maxResults: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('skips pairs where both thoughts are too young', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具', 0),
      makeThought('t2', '项目管理设计', 0)
    ];
    const results = findReunions(thoughts, { threshold: 0.1, minAgeDays: 7 });
    expect(results.length).toBe(0);
  });

  it('allows pairs where at least one is old enough', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具', 0),
      makeThought('t2', '项目管理设计', 30)
    ];
    const results = findReunions(thoughts, { threshold: 0.3, minAgeDays: 7 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('greedily deduplicates: each thought appears at most once', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具开发设计'),
      makeThought('t2', '项目管理工具'),
      makeThought('t3', '项目管理设计'),
      makeThought('t4', '完全不相关的内容')
    ];
    const results = findReunions(thoughts, { threshold: 0.3, minAgeDays: 0, maxResults: 10 });
    const seen = new Set();
    for (const r of results) {
      expect(seen.has(r.a.id)).toBe(false);
      expect(seen.has(r.b.id)).toBe(false);
      seen.add(r.a.id);
      seen.add(r.b.id);
    }
  });

  it('filters pairs below threshold', () => {
    const thoughts = [
      makeThought('t1', '项目管理工具'),
      makeThought('t2', '今天天气真好适合散步')
    ];
    const results = findReunions(thoughts, { threshold: 0.9, minAgeDays: 0 });
    expect(results.length).toBe(0);
  });
});
