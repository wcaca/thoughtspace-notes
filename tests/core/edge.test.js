/**
 * [INPUT]: src/core/edge.js
 * [OUTPUT]: 验证 createEdge / getEdgeStyle / 5 种 EDGE_STYLES
 * [POS]: tests/core 下,被 vitest 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */
import { createEdge, getEdgeStyle, RelationType } from '../../src/core/edge.js';

describe('edge', () => {
  it('creates cause edge by default', () => {
    const e = createEdge('e1', 'a', 'b');
    expect(e.relationType).toBe('cause');
    expect(e.fromId).toBe('a');
    expect(e.toId).toBe('b');
  });

  it('creates with specified relation type', () => {
    const e = createEdge('e2', 'a', 'b', 'parallel');
    expect(e.relationType).toBe('parallel');
  });

  it('throws on invalid type', () => {
    expect(() => createEdge('e3', 'a', 'b', 'invalid')).toThrow('invalid relation type');
  });

  it('getEdgeStyle returns correct style for each type', () => {
    const types = Object.values(RelationType);
    for (const t of types) {
      const s = getEdgeStyle(t);
      expect(s).toBeDefined();
      expect(s.line).toBeDefined();
      expect(s.color).toBeDefined();
    }
  });

  it('getEdgeStyle fallback to cause', () => {
    const s = getEdgeStyle('unknown');
    expect(s.color).toBe('#7fe0c9');
  });
});
