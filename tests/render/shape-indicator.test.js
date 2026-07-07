/**
 * [INPUT]: src/render/shape-indicator.js
 * [OUTPUT]: 验证 5 态阈值 / 标签 / 颜色 / apply 函数 (T10 语义反转版)
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect } from 'vitest';
import {
  describeShape,
  applyShapeToBar,
  applyShapeToLabel
} from '../../src/render/shape-indicator.js';

describe('shape-indicator (T10 语义反转版)', () => {
  describe('empty 档(Bug 1 修复)', () => {
    it('isEmpty=true 时返回 "空 · 等待第一个念头"', () => {
      const r = describeShape({ isEmpty: true });
      expect(r.shape).toBe('empty');
      expect(r.label).toBe('空 · 等待第一个念头');
      expect(r.color).toBe('#5a6080');
    });
    it('shape="empty" 也触发 empty 档', () => {
      const r = describeShape({ shape: 'empty' });
      expect(r.shape).toBe('empty');
    });
  });

  describe('4 档阈值 (low individuality→圆, high→方)', () => {
    it('wholesomeness=0 → continuous "圆 · 全貌"', () => {
      const r = describeShape({ wholesomeness: 0, selectionRatio: 0 });
      expect(r.shape).toBe('continuous');
      expect(r.label).toBe('圆 · 全貌');
    });
    it('wholesomeness=0.249 → continuous', () => {
      const r = describeShape({ wholesomeness: 0.249 });
      expect(r.shape).toBe('continuous');
    });
    it('wholesomeness=0.25 → metric_with_anchors "圆方 · 选 30%"', () => {
      const r = describeShape({ wholesomeness: 0.25, selectionRatio: 0.3 });
      expect(r.shape).toBe('metric_with_anchors');
      expect(r.label).toBe('圆方 · 选 30%');
    });
    it('wholesomeness=0.5 → discrete_with_metric "方圆 · 选 50%"', () => {
      const r = describeShape({ wholesomeness: 0.5, selectionRatio: 0.5 });
      expect(r.shape).toBe('discrete_with_metric');
      expect(r.label).toBe('方圆 · 选 50%');
    });
    it('wholesomeness=0.75 → discrete "方 · 选 80%"', () => {
      const r = describeShape({ wholesomeness: 0.75, selectionRatio: 0.8 });
      expect(r.shape).toBe('discrete');
      expect(r.label).toBe('方 · 选 80%');
    });
    it('wholesomeness=1 → discrete', () => {
      const r = describeShape({ wholesomeness: 1, selectionRatio: 1 });
      expect(r.shape).toBe('discrete');
      expect(r.fillPct).toBe(100);
    });
  });

  describe('5 个独特中文标签', () => {
    it('5 个 shape 各有独特中文标识', () => {
      const labels = [
        describeShape({ isEmpty: true }).label,
        describeShape({ wholesomeness: 0.1, selectionRatio: 0 }).label,
        describeShape({ wholesomeness: 0.3, selectionRatio: 0.3 }).label,
        describeShape({ wholesomeness: 0.6, selectionRatio: 0.5 }).label,
        describeShape({ wholesomeness: 0.9, selectionRatio: 0.8 }).label
      ];
      const unique = new Set(labels);
      expect(unique.size).toBe(5);
    });
  });

  describe('颜色渐变 (圆→方)', () => {
    it('empty 是灰色', () => {
      expect(describeShape({ isEmpty: true }).color).toBe('#5a6080');
    });
    it('continuous 是冷蓝', () => {
      expect(describeShape({ wholesomeness: 0.1 }).color).toBe('#7fb6e8');
    });
    it('discrete 是暖琥珀', () => {
      expect(describeShape({ wholesomeness: 0.9 }).color).toBe('#e8a865');
    });
  });

  describe('边界 case', () => {
    it('snapshot 为空对象时不报错,默认 empty 之前的 fallback', () => {
      const r = describeShape({});
      expect(typeof r.shape).toBe('string');
    });
    it('负数被 clamp 到 0', () => {
      const r = describeShape({ wholesomeness: -0.5 });
      expect(r.fillPct).toBe(0);
    });
    it('超过 1 被 clamp 到 1', () => {
      const r = describeShape({ wholesomeness: 1.5, selectionRatio: 2 });
      expect(r.fillPct).toBe(100);
    });
    it('NaN 走安全路径', () => {
      const r = describeShape({ wholesomeness: NaN });
      expect(typeof r.shape).toBe('string');
    });
  });

  describe('applyShapeToBar', () => {
    it('设置 barFill.style.width 与 background', () => {
      const barFill = { style: {} };
      applyShapeToBar(barFill, { fillPct: 65, color: '#abc' });
      expect(barFill.style.width).toBe('65%');
      expect(barFill.style.background).toBe('#abc');
    });
    it('null barFill 不抛错', () => {
      expect(() => applyShapeToBar(null, { fillPct: 50 })).not.toThrow();
    });
  });

  describe('applyShapeToLabel', () => {
    it('设置 labelEl.textContent', () => {
      const labelEl = { textContent: '' };
      applyShapeToLabel(labelEl, { label: 'hello' });
      expect(labelEl.textContent).toBe('hello');
    });
  });

  describe('与 shape-resolver 联动', () => {
    it('接收 shape 字段时直接用', () => {
      const r = describeShape({ shape: 'continuous', wholesomeness: 0.1, selectionRatio: 0 });
      expect(r.shape).toBe('continuous');
    });
    it('接收 derivedShape 字段时也用', () => {
      const r = describeShape({ derivedShape: 'discrete', wholesomeness: 0.9, selectionRatio: 0.8 });
      expect(r.shape).toBe('discrete');
    });
  });
});