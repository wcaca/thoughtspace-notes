/**
 * [INPUT]: src/core/thought(Thought 类型)
 * [OUTPUT]: findReunions(thoughts, opts) → 相似念头对;tokenize(text) → 词元集合
 * [POS]: src/core 下 — 念头"意外重逢"的纯逻辑(相似度检测);由 main 在低频节拍下调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */

/**
 * @typedef {import('./thought.js').Thought} Thought
 */

const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个',
  '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己',
  '这', '那', '它', '他', '她', '们', '与', '及', '或', '但', '而', '因为', '所以', '如果',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'to', 'of', 'in', 'on', 'at', 'and', 'or',
  'but', 'if', 'so', 'for', 'with', 'as', 'by', 'it', 'this', 'that', 'i', 'you', 'we'
]);

/**
 * 简易分词:中文按字、英文按词;过滤停用词与过短 token。
 */
export function tokenize(text) {
  if (!text) return [];
  const lower = String(text).toLowerCase();
  const out = [];
  // 英文/数字词
  const en = lower.match(/[a-z0-9]{2,}/g) || [];
  for (const w of en) {
    if (STOP_WORDS.has(w) || w.length < 2) continue;
    out.push(w);
  }
  // 中文字(单字,过滤停用词)
  const cn = lower.match(/[\u4e00-\u9fa5]/g) || [];
  for (const c of cn) {
    if (STOP_WORDS.has(c)) continue;
    out.push(c);
  }
  return out;
}

function termFreq(tokens) {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) || 0) + 1);
  return m;
}

/**
 * 余弦相似度(基于词频向量)。返回 0..1。
 */
export function similarity(textA, textB) {
  const ta = tokenize(textA);
  const tb = tokenize(textB);
  if (ta.length === 0 || tb.length === 0) return 0;
  const va = termFreq(ta);
  const vb = termFreq(tb);
  let dot = 0;
  for (const [k, v] of va) {
    if (vb.has(k)) dot += v * vb.get(k);
  }
  let na = 0, nb = 0;
  for (const v of va.values()) na += v * v;
  for (const v of vb.values()) nb += v * v;
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 在念头集合中寻找"意外重逢"候选对。
 * - 只看 text 字段(标题);body 太长会污染"语义闪现"的惊喜感。
 * - 默认阈值 0.45(可调);阈值越高越严格。
 * - skipFn(pair) 返回 true 则跳过该对(例如已经被用户 dismiss 过的)。
 *
 * @returns {Array<{a:Thought, b:Thought, score:number}>}
 *   按 score 降序;每个 thought 只出现一次(贪心匹配)。
 */
export function findReunions(thoughts, opts = {}) {
  const threshold = opts.threshold ?? 0.45;
  const minAgeDays = opts.minAgeDays ?? 7;
  const now = Date.now();
  const minAgeMs = minAgeDays * 86400000;
  const list = Array.from(thoughts).filter(t => t && t.text);
  // 预计算 token,避免重复
  const tokenMap = new Map();
  for (const t of list) tokenMap.set(t.id, tokenize(t.text));
  const pairs = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const ta = tokenMap.get(a.id);
    if (ta.length === 0) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      // 至少一个念头足够"老"(>= minAgeDays),才有"重逢"的语义
      const ageA = now - (a.createdAt || now);
      const ageB = now - (b.createdAt || now);
      if (Math.max(ageA, ageB) < minAgeMs) continue;
      const tb = tokenMap.get(b.id);
      if (tb.length === 0) continue;
      // 快速过滤:无交集直接跳过
      let hasCommon = false;
      for (const k of ta) { if (tb.includes(k)) { hasCommon = true; break; } }
      if (!hasCommon) continue;
      const score = similarity(a.text, b.text);
      if (score < threshold) continue;
      pairs.push({ a, b, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  // 贪心去重:每个 thought 只保留最高分对
  const used = new Set();
  const out = [];
  for (const p of pairs) {
    if (used.has(p.a.id) || used.has(p.b.id)) continue;
    used.add(p.a.id);
    used.add(p.b.id);
    out.push(p);
    if (out.length >= (opts.maxResults ?? 3)) break;
  }
  return out;
}
