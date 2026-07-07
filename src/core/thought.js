/**
 * [INPUT]: 无外部依赖,纯逻辑
 * [OUTPUT]: Thought 数据创建(含 source 来源锚定: manual/voice/import/copilot-suggest) / 温度衰减 / 新建念头工厂
 * [POS]: src/core 下,念头数据的"源工厂",被 persistence 和 render 消费
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

/**
 * @typedef {Object} ThoughtSource
 * @property {'manual' | 'voice' | 'import' | 'copilot-suggest'} type
 * @property {string} [ref]
 */

/**
 * @typedef {Object} Thought
 * @property {string} id
 * @property {string} text
 * @property {string} [body]
 * @property {number} [x]
 * @property {number} [y]
 * @property {number} [z]
 * @property {number} [temperature]
 * @property {string[]} [tags]
 * @property {number} [createdAt]
 * @property {number} [updatedAt]
 * @property {ThoughtSource} [source]
 */

const DEFAULT_LAMBDA = 0.05;

/** source.type 的合法取值集合(来源锚定) */
export const VALID_SOURCE_TYPES = new Set(['manual', 'voice', 'import', 'copilot-suggest']);

/**
 * 规范化 source 字段:非法/缺失时回退为 { type: 'manual' }
 * @param {any} source
 * @returns {ThoughtSource}
 */
export function normalizeSource(source) {
  const fallback = { type: 'manual' };
  if (!source || typeof source !== 'object') return fallback;
  const type = VALID_SOURCE_TYPES.has(source.type) ? source.type : 'manual';
  const out = { type };
  if (typeof source.ref === 'string' && source.ref) out.ref = source.ref;
  return out;
}

export function createThought(id, text, x, y, z, opts = {}) {
  const now = Date.now();
  const source = normalizeSource(opts && opts.source);
  return {
    id,
    text: text || '',
    x: x ?? (Math.random() - 0.5) * 600,
    y: y ?? (Math.random() - 0.5) * 400,
    mass: 1,
    temperature: 1,
    colorTag: null,
    lastInteractionAt: now,
    createdAt: now,
    source
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

/**
 * 标准化标签: 去前后空白、压缩中间空格、转小写
 * 用于全文搜索的字符串归一化(中英文都兼容)
 * @param {string} s
 * @returns {string}
 */
export function normalizeLabel(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function warmThought(thought, nowMs, amount) {
  const currentTemp = thought.temperature ?? 1;
  const nextTemp = Math.max(0, Math.min(1, currentTemp + (amount ?? 0.5)));
  return { ...thought, temperature: nextTemp, lastInteractionAt: nowMs };
}

export function addLabel(thought, label) {
  const normalized = normalizeLabel(label);
  if (!normalized) return thought;
  const labels = Array.isArray(thought.labels) ? [...thought.labels] : [];
  if (!labels.includes(normalized)) {
    labels.push(normalized);
  }
  return { ...thought, labels };
}

export function removeLabel(thought, label) {
  const normalized = normalizeLabel(label);
  if (!normalized || !Array.isArray(thought.labels)) return thought;
  const labels = thought.labels.filter((l) => l !== normalized);
  return { ...thought, labels };
}

export function setColorTag(thought, colorTag) {
  return { ...thought, colorTag: colorTag ?? null };
}
