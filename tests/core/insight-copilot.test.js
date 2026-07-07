/**
 * [POS]: tests/core/insight-copilot.test.js — 验证 AI 灵感助手核心算法
 */
import { describe, it, expect } from 'vitest';
import { createInsightCopilot } from '../../src/core/insight-copilot.js';

describe('insight-copilot', () => {
  const map = () => {
    const m = new Map();
    return m;
  };

  it('suggestClusters returns empty when thoughts < 2', () => {
    const thoughtById = new Map();
    thoughtById.set('a', { id: 'a', text: 'hello' });
    const copilot = createInsightCopilot({ thoughtById, edgeStore: { edges: new Map(), size: () => 0 } });
    expect(copilot.suggestClusters()).toEqual([]);
  });

  it('suggestClusters detects similar thoughts', () => {
    const thoughtById = new Map();
    thoughtById.set('a', { id: 'a', text: '工作压力太大需要缓解' });
    thoughtById.set('b', { id: 'b', text: '工作压力很大影响睡眠' });
    thoughtById.set('c', { id: 'c', text: '今天吃了苹果' });
    const copilot = createInsightCopilot({ thoughtById, edgeStore: { edges: new Map(), size: () => 0 } });
    const clusters = copilot.suggestClusters(5);
    expect(clusters.length).toBeGreaterThan(0);
    const abPair = clusters.find((c) => c.a.id === 'a' && c.b.id === 'b');
    expect(abPair).toBeDefined();
    expect(abPair.similarity).toBeGreaterThan(0.18);
  });

  it('suggestClusters skips already connected thoughts', () => {
    const thoughtById = new Map();
    thoughtById.set('a', { id: 'a', text: '工作压力' });
    thoughtById.set('b', { id: 'b', text: '工作焦虑' });
    const edgeStore = {
      edges: new Map([['e1', { fromThoughtId: 'a', toThoughtId: 'b' }]]),
      size: () => 1
    };
    const copilot = createInsightCopilot({ thoughtById, edgeStore });
    const clusters = copilot.suggestClusters();
    expect(clusters.length).toBe(0);
  });

  it('suggestTags returns tag candidates', () => {
    const thoughtById = new Map();
    thoughtById.set('a', { id: 'a', text: '今天工作压力大,想运动' });
    const copilot = createInsightCopilot({ thoughtById, edgeStore: { edges: new Map(), size: () => 0 } });
    const tags = copilot.suggestTags('a', 3);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags[0]).toHaveProperty('tag');
    expect(tags[0]).toHaveProperty('score');
  });

  it('dailyInsight returns null for empty store', () => {
    const thoughtById = new Map();
    const copilot = createInsightCopilot({ thoughtById, edgeStore: { edges: new Map(), size: () => 0 } });
    expect(copilot.dailyInsight()).toBeNull();
  });

  it('dailyInsight returns summary when there are thoughts today', () => {
    const thoughtById = new Map();
    const now = Date.now();
    thoughtById.set('a', { id: 'a', text: '测试念头', touchedAt: now, temperature: 0.7 });
    thoughtById.set('b', { id: 'b', text: '第二个念头', touchedAt: now, temperature: 0.8 });
    const copilot = createInsightCopilot({ thoughtById, edgeStore: { edges: new Map(), size: () => 0 } });
    const insight = copilot.dailyInsight();
    expect(insight).toBeTruthy();
    expect(insight.summary).toContain('今日新增');
    expect(insight.highlight).toBeTruthy();
  });
});