/**
 * [INPUT]: thoughtById / edgeStore / bridge 引用
 * [OUTPUT]: createInsightCopilot() → { observe, suggestClusters, suggestTags, suggestEdges, dailyInsight, dispose }
 * [POS]: src/core/insight-copilot.js — AI 灵感助手(本地启发式);从念头/关系中主动发现模式、推荐标签、建议关联、提炼今日觉察
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 *
 * 设计哲学:不依赖外部 AI API,使用本地启发式算法 + 模式识别,让用户即使离线也能体验"被理解的智能感"
 *  - suggestClusters: 找未建关系但内容/标签相近的念头对(高召回率)
 *  - suggestTags: 基于现有标签分布 + 内容关键词给出推荐
 *  - suggestEdges: 检测 A→B 序列关系(因果推断)
 *  - dailyInsight: 从念头中提炼一句值得回看的话
 */

// 中文停用词(只用于提取关键词,不需要非常完整)
const STOP_WORDS = new Set([
  '的', '了', '和', '是', '在', '也', '都', '与', '及', '或', '把', '被', '从', '向',
  '一', '一个', '一些', '什么', '怎么', '如何', '为什么', '可以', '应该', '想要',
  '我觉得', '我', '你', '他', '她', '它', '我们', '你们', '他们', '这个', '那个',
  '这样', '那样', '因为', '所以', '但是', '不过', '虽然', '然后', '于是', '因为',
  '今天', '明天', '昨天', '现在', '以后', '之前', '过去', '未来', '总是', '一直'
]);

const KEYWORD_BONUS = {
  '想做': 1.5, '想': 1.2, '需要': 1.4, '应该': 1.3, '必须': 1.5, '马上': 1.5,
  '焦虑': 1.6, '压力': 1.5, '愤怒': 1.6, '喜悦': 1.5, '悲伤': 1.6, '恐惧': 1.6,
  '灵感': 1.4, '念头': 1.2, '发现': 1.3, '理解': 1.4, '解决': 1.4, '决定': 1.4
};

// 标签库(根据内容/关键词推荐)
const TAG_LIBRARY = {
  work: ['工作', '项目', '同事', '老板', '客户', 'KPI', '任务', '会议', '汇报', '进度', 'deadline', 'deadlines', '加班'],
  life: ['生活', '日常', '家庭', '家人', '父母', '孩子', '朋友', '休息', '睡眠', '饮食'],
  emotion: ['情绪', '心情', '感受', '焦虑', '抑郁', '开心', '孤独', '压力', '愤怒', '平静'],
  growth: ['成长', '学习', '读书', '课程', '反思', '复盘', '目标', '计划', '习惯', '改变'],
  relation: ['关系', '友情', '爱情', '伴侣', '社交', '沟通', '边界', '信任', '亲密'],
  idea: ['想法', '灵感', '创意', '假设', '视角', '问题', '解决', '可能性', '思路'],
  body: ['身体', '健康', '运动', '跑步', '瑜伽', '饮食', '睡眠', '疲劳', '精力']
};

export function createInsightCopilot({ thoughtById, edgeStore, bridge }) {
  function getText(t) {
    return String(t.text || '').trim();
  }

  function tokenize(text) {
    if (!text) return [];
    // 简单分词:中文按字 + 英文按词
    const tokens = [];
    const cnPart = text.match(/[\u4e00-\u9fa5]+/g) || [];
    const enPart = text.match(/[a-zA-Z]+/g) || [];
    for (const seg of cnPart) {
      // 中文 2-gram
      for (let i = 0; i < seg.length - 1; i++) {
        const t = seg.slice(i, i + 2);
        if (!STOP_WORDS.has(t)) tokens.push(t);
      }
      // 单字也保留(常用词)
      for (const c of seg) {
        if (!STOP_WORDS.has(c)) tokens.push(c);
      }
    }
    for (const w of enPart) {
      const lw = w.toLowerCase();
      if (!STOP_WORDS.has(lw) && lw.length > 1) tokens.push(lw);
    }
    return tokens;
  }

  function tokenScore(tokens) {
    const map = new Map();
    for (const t of tokens) {
      map.set(t, (map.get(t) || 0) + 1);
    }
    // 加权
    for (const [t, s] of map) {
      const bonus = KEYWORD_BONUS[t];
      if (bonus) map.set(t, s * bonus);
    }
    return map;
  }

  function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a.keys()) if (b.has(x)) inter++;
    const uni = a.size + b.size - inter;
    return uni > 0 ? inter / uni : 0;
  }

  // === 1. 建议未建关系但内容相近的念头对 ===
  function suggestClusters(limit = 3) {
    if (!thoughtById || thoughtById.size < 2) return [];
    const thoughts = Array.from(thoughtById.values());
    const cache = new Map();
    for (const t of thoughts) {
      const tokens = tokenize(getText(t));
      cache.set(t.id, tokenScore(tokens));
    }
    // 已有关系集合
    const existingEdges = new Set();
    if (edgeStore && edgeStore.edges) {
      for (const e of edgeStore.edges.values()) {
        const a = e.fromThoughtId || e.fromId;
        const b = e.toThoughtId || e.toId;
        if (a && b) existingEdges.add(`${a}__${b}`);
      }
    }
    const suggestions = [];
    for (let i = 0; i < thoughts.length; i++) {
      for (let j = i + 1; j < thoughts.length; j++) {
        const a = thoughts[i];
        const b = thoughts[j];
        if (existingEdges.has(`${a.id}__${b.id}`) || existingEdges.has(`${b.id}__${a.id}`)) continue;
        const aT = cache.get(a.id);
        const bT = cache.get(b.id);
        const sim = jaccard(aT, bT);
        if (sim > 0.18) {
          suggestions.push({ a, b, similarity: sim });
        }
      }
    }
    suggestions.sort((x, y) => y.similarity - x.similarity);
    return suggestions.slice(0, limit);
  }

  // === 2. 推荐标签(基于内容 + 已有标签分布) ===
  function suggestTags(thoughtId, limit = 3) {
    const t = thoughtById.get(thoughtId);
    if (!t) return [];
    const tokens = tokenize(getText(t));
    const score = new Map();
    for (const [tag, kws] of Object.entries(TAG_LIBRARY)) {
      for (const kw of kws) {
        if (getText(t).includes(kw)) {
          score.set(tag, (score.get(tag) || 0) + 2);
        }
        for (const tk of tokens) {
          if (kw.includes(tk) || tk.includes(kw.toLowerCase())) {
            score.set(tag, (score.get(tag) || 0) + 1);
          }
        }
      }
    }
    // 已有标签分布加权
    const existingTags = new Map();
    for (const other of thoughtById.values()) {
      if (other.id === thoughtId) continue;
      for (const lab of (other.labels || [])) {
        existingTags.set(lab, (existingTags.get(lab) || 0) + 1);
      }
    }
    for (const [tag, s] of score) {
      score.set(tag, s + (existingTags.get(tag) || 0) * 0.2);
    }
    return Array.from(score.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, s]) => ({ tag, score: s }));
  }

  // === 3. 检测序列关系(A→B) ===
  // 启发式:时间相近 + 内容关键词重叠 + 不同温度
  function suggestEdges(limit = 3) {
    if (!thoughtById) return [];
    const thoughts = Array.from(thoughtById.values())
      .filter((t) => t.createdAt || t.touchedAt)
      .sort((a, b) => (a.touchedAt || a.createdAt || 0) - (b.touchedAt || b.createdAt || 0));
    const existing = new Set();
    if (edgeStore && edgeStore.edges) {
      for (const e of edgeStore.edges.values()) {
        const a = e.fromThoughtId || e.fromId;
        const b = e.toThoughtId || e.toId;
        if (a && b) existing.add(`${a}__${b}`);
      }
    }
    const suggestions = [];
    for (let i = 0; i < thoughts.length - 1; i++) {
      const a = thoughts[i];
      const b = thoughts[i + 1];
      if (existing.has(`${a.id}__${b.id}`)) continue;
      // 时间间隔 1 分钟 - 2 小时
      const dt = (b.touchedAt || b.createdAt || 0) - (a.touchedAt || a.createdAt || 0);
      if (dt < 60000 || dt > 7200000) continue;
      const sim = jaccard(tokenScore(tokenize(getText(a))), tokenScore(tokenize(getText(b))));
      if (sim > 0.12) {
        suggestions.push({ from: a, to: b, similarity: sim, dt });
      }
    }
    suggestions.sort((x, y) => y.similarity - x.similarity);
    return suggestions.slice(0, limit);
  }

  // === 4. 今日觉察 ===
  function dailyInsight() {
    if (!thoughtById || thoughtById.size === 0) return null;
    // 取过去 24h 内的念头,按温度 × 新近度排序
    const now = Date.now();
    const allThoughts = Array.from(thoughtById.values());
    const day = allThoughts.filter((t) => now - (t.touchedAt || t.createdAt || 0) < 86400000);
    if (day.length === 0) return null;
    day.sort((a, b) => (b.temperature || 0) - (a.temperature || 0));
    const top = day[0];
    const stats = {
      count: day.length,
      total: thoughtById.size,
      avgTemp: day.reduce((s, t) => s + (t.temperature || 0.5), 0) / day.length,
      labelFreq: new Map()
    };
    for (const t of day) {
      for (const lab of (t.labels || [])) {
        stats.labelFreq.set(lab, (stats.labelFreq.get(lab) || 0) + 1);
      }
    }
    const topLabel = Array.from(stats.labelFreq.entries()).sort((a, b) => b[1] - a[1])[0];
    return {
      top,
      stats,
      summary: stats.count === 0
        ? null
        : `今日新增 ${stats.count} 个念头,平均温度 ${(stats.avgTemp * 100).toFixed(0)}%${
            topLabel ? `,关注最多「${topLabel[0]}」` : ''
          }`,
      highlight: top && top.text ? top.text : null
    };
  }

  // === 5. 静默观察(每次念头变化后调用)===
  let lastObserveAt = 0;
  let lastThoughtCount = 0;
  function observe(now = Date.now()) {
    if (!thoughtById) return null;
    const count = thoughtById.size;
    // 每隔 10s 或念头数变化时跑一次
    if (now - lastObserveAt < 10000 && count === lastThoughtCount) return null;
    lastObserveAt = now;
    lastThoughtCount = count;

    const cluster = suggestClusters(1);
    const tag = Array.from(thoughtById.keys())
      .filter((id) => thoughtById.get(id))
      .map((id) => ({ id, tags: suggestTags(id, 1)[0] }))
      .filter((x) => x.tags)
      .slice(0, 1);

    return {
      cluster: cluster[0] || null,
      tagSuggestion: tag[0] || null,
      insight: dailyInsight()
    };
  }

  return {
    suggestClusters,
    suggestTags,
    suggestEdges,
    dailyInsight,
    observe
  };
}