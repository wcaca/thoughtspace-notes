/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: Thought 数据创建 / 温度衰减 / 新建念头工厂
 * [POS]: src/core 下,念头数据的"源工厂",被 persistence 和 render 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

const DEFAULT_LAMBDA = 0.05;

export function createThought(id, text, x, y) {
  const now = Date.now();
  return {
    id,
    text: text || '',
    x: x ?? (Math.random() - 0.5) * 600,
    y: y ?? (Math.random() - 0.5) * 400,
    mass: 1,
    temperature: 1,
    colorTag: null,
    lastInteractionAt: now,
    createdAt: now
  };
}

export function decayTemperature(thought, nowMs) {
  const daysSince = (nowMs - (thought.lastInteractionAt || thought.createdAt)) / 86400000;
  const decayed = (thought.temperature ?? 1) * Math.exp(-DEFAULT_LAMBDA * daysSince);
  return Math.max(0, Math.min(1, decayed));
}

export function refreshTemperature(thought, nowMs) {
  return { ...thought, temperature: 1, lastInteractionAt: nowMs };
}

export function updateMass(thought, editions, references) {
  const newMass = 1 + editions * 0.1 + references * 0.2;
  return { ...thought, mass: newMass };
}

export function getName(thought) {
  return thought.text.slice(0, 6);
}
