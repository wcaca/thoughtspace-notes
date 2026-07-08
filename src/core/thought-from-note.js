/**
 * 从 Note 自动提取 Thought
 * [INPUT]: SEED_NOTES
 * [OUTPUT]: 4 个种子 Thought(初版第一句提取)
 * [POS]: src/core/thought-from-note.js — Round 6 第一轮主入口
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { SEED_NOTES } from './note.js';

function extractFirstSentence(text, maxLen = 6) {
  const cleaned = String(text || '').trim();
  const m = cleaned.split(/[。!?\.]/)[0];
  return (m || cleaned).slice(0, maxLen);
}

// Round 6 R1 UX 修复: y 按温度层散布(温度 0.4 → -20, 0.7 → 20, 0.8 → 40, 0.9 → 60)
// 让 4 个节点有"高低"差异感,而不是几乎一条水平线
function yFromTemperature(temperature) {
  const t = temperature == null ? 0.5 : temperature;
  // 线性映射: t∈[0,1] → y∈[-30, 60]
  return -30 + t * 90;
}

export function thoughtsFromSeeds() {
  return SEED_NOTES.map((note, i) => {
    // Round 6 R1 UX 修复: 优先用 note.thoughtText(关键词),fallback 到前 6 字
    const thoughtText = (note.thoughtText && note.thoughtText.trim())
      || extractFirstSentence(note.content, 6);
    const angle = (i / 4) * Math.PI * 2;
    const radius = 80;
    return {
      id: `thought_${note.id}`,
      text: thoughtText,
      mass: note.mass,
      temperature: note.temperature,
      noteAnchorId: { noteId: note.id, range: [0, thoughtText.length] },
      x: Math.cos(angle) * radius,
      y: yFromTemperature(note.temperature),
      z: Math.sin(angle) * radius,
      createdAt: note.createdAt,
    };
  });
}