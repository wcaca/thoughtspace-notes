/**
 * [INPUT]: src/render/a11y.js
 * [OUTPUT]: 验证 prefersReducedMotion / ariaId / overscrollContain / FOCUSABLE_SELECTOR
 * [POS]: tests/render 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { describe, it, expect, vi } from 'vitest';
import {
  prefersReducedMotion, ariaId, FOCUSABLE_SELECTOR, announce, trapFocus
} from '../../src/render/a11y.js';

describe('a11y', () => {
  describe('prefersReducedMotion', () => {
    it('returns boolean based on matchMedia', () => {
      const result = prefersReducedMotion();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('ariaId', () => {
    it('generates unique ids', () => {
      const a = ariaId('btn');
      const b = ariaId('btn');
      expect(a).not.toBe(b);
    });
    it('uses provided prefix', () => {
      const id = ariaId('dialog');
      expect(id.startsWith('dialog-')).toBe(true);
    });
    it('default prefix is "a"', () => {
      const id = ariaId();
      expect(id.startsWith('a-')).toBe(true);
    });
  });

  describe('FOCUSABLE_SELECTOR', () => {
    it('includes a, button, input, textarea, select, tabindex', () => {
      expect(FOCUSABLE_SELECTOR).toContain('a[href]');
      expect(FOCUSABLE_SELECTOR).toContain('button:not([disabled])');
      expect(FOCUSABLE_SELECTOR).toContain('input:not([disabled])');
      expect(FOCUSABLE_SELECTOR).toContain('textarea:not([disabled])');
      expect(FOCUSABLE_SELECTOR).toContain('select:not([disabled])');
      expect(FOCUSABLE_SELECTOR).toContain('[tabindex]');
    });
  });

  describe('announce', () => {
    it('skips when no document (server-side)', () => {
      expect(() => announce('测试消息')).not.toThrow();
    });
  });

  describe('trapFocus', () => {
    it('handles null container gracefully', () => {
      const cleanup = trapFocus(null);
      expect(typeof cleanup).toBe('function');
    });
    it('handles container without focusable elements gracefully', () => {
      const cleanup = trapFocus({ addEventListener: () => {}, removeEventListener: () => {}, querySelectorAll: () => [] });
      expect(typeof cleanup).toBe('function');
    });
  });
});