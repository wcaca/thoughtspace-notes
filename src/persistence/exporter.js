/**
 * [INPUT]: src/core/edge(getEdgeStyle, RelationType), thoughts Map + edgeStore
 * [OUTPUT]: buildExportPayload({thoughts, edges, meta}) → Object; toMarkdown(payload) → string; downloadJSON / downloadMarkdown 触发浏览器下载
 * [POS]: src/persistence 下 — 把内存/持久化形态转换成可保存 / 可分享的可移植格式
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../../CLAUDE.md
 */

const SCHEMA_VERSION = 1;

export function buildExportPayload({ thoughts, edges, zones, meta = {} }) {
  const tArr = Array.isArray(thoughts) ? thoughts : (thoughts && thoughts.values ? Array.from(thoughts.values()) : []);
  const eArr = Array.isArray(edges) ? edges : (edges && edges.values ? Array.from(edges.values()) : []);
  const zArr = Array.isArray(zones) ? zones : (zones && zones.list ? zones.list() : []);
  const cleanThoughts = tArr.map((t) => {
    if (!t || !t.id) return null;
    const out = { id: t.id };
    if (t.text != null) out.text = t.text;
    if (t.x != null) out.x = t.x;
    if (t.y != null) out.y = t.y;
    if (t.z != null) out.z = t.z;
    if (t.mass != null) out.mass = t.mass;
    if (t.temperature != null) out.temperature = t.temperature;
    if (t.colorTag) out.colorTag = t.colorTag;
    if (Array.isArray(t.labels) && t.labels.length) out.labels = t.labels.slice();
    if (t.createdAt) out.createdAt = t.createdAt;
    if (t.lastInteractionAt) out.lastInteractionAt = t.lastInteractionAt;
    return out;
  }).filter(Boolean);

  const cleanEdges = eArr.map((e) => {
    if (!e || !e.id || !e.fromId || !e.toId) return null;
    return {
      id: e.id,
      fromId: e.fromId,
      toId: e.toId,
      relationType: e.relationType,
      createdAt: e.createdAt || 0
    };
  }).filter(Boolean);

  const cleanZones = zArr.map((z) => {
    if (!z || !z.id) return null;
    return {
      id: z.id,
      name: z.name || '分区',
      color: z.color || '#7fe0c9',
      center: z.center || { x: 0, y: 0, z: 0 },
      radius: z.radius || 150,
      description: z.description || '',
      createdAt: z.createdAt || Date.now()
    };
  }).filter(Boolean);

  return {
    schema: SCHEMA_VERSION,
    exportedAt: Date.now(),
    meta: {
      app: 'thoughtspace-notes',
      thoughtCount: cleanThoughts.length,
      edgeCount: cleanEdges.length,
      zoneCount: cleanZones.length,
      ...meta
    },
    thoughts: cleanThoughts,
    edges: cleanEdges,
    zones: cleanZones
  };
}

export function payloadToJsonString(payload) {
  return JSON.stringify(payload, null, 2);
}

export function payloadToMarkdown(payload) {
  if (!payload) return '';
  const lines = [];
  lines.push('# 念头空间导出');
  lines.push('');
  lines.push(`> 应用: ${payload.meta?.app || 'thoughtspace-notes'}  ·  思路数: ${payload.thoughts.length}  ·  关系数: ${payload.edges.length}`);
  if (payload.exportedAt) {
    lines.push(`> 导出时间: ${new Date(payload.exportedAt).toLocaleString('zh-CN')}`);
  }
  lines.push('');
  lines.push('## 念头列表');
  lines.push('');
  const sorted = payload.thoughts.slice().sort((a, b) => {
    const ta = (a.temperature || 0);
    const tb = (b.temperature || 0);
    if (tb !== ta) return tb - ta;
    return (a.text || '').localeCompare(b.text || '');
  });
  for (const t of sorted) {
    const temp = Math.round((t.temperature || 0) * 100);
    const labels = (t.labels || []).map((l) => `#${l}`).join(' ');
    const colorTag = t.colorTag ? ` _(情绪:${t.colorTag})_` : '';
    const text = (t.text || '(空)').replace(/\n/g, ' ');
    lines.push(`- **${text}** \`热度 ${temp}%\`${colorTag}${labels ? ' ' + labels : ''}`);
  }
  lines.push('');
  lines.push('## 关系图(Mermaid)');
  lines.push('');
  lines.push('```mermaid');
  lines.push('graph LR');
  const idToShort = new Map();
  payload.thoughts.forEach((t, i) => {
    idToShort.set(t.id, `n${i}`);
  });
  for (const t of payload.thoughts.slice(0, 100)) {
    const s = idToShort.get(t.id);
    const text = (t.text || '').replace(/"/g, "'").slice(0, 24);
    lines.push(`  ${s}["${text}"]`);
  }
  for (const e of payload.edges) {
    const from = idToShort.get(e.fromId);
    const to = idToShort.get(e.toId);
    if (!from || !to) continue;
    const arrow = relToArrow(e.relationType);
    const label = relToLabel(e.relationType);
    lines.push(`  ${from} ${arrow}|${label}| ${to}`);
  }
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function relToArrow(type) {
  return '--';
}

function relToLabel(type) {
  const map = { cause: '因果', parallel: '并列', conflict: '矛盾', sequence: '时序', subordinate: '从属' };
  return map[type] || type;
}

export function downloadJSON(payload, filename = 'thoughtspace-export.json') {
  if (typeof document === 'undefined' || !document.body) return false;
  const blob = new Blob([payloadToJsonString(payload)], { type: 'application/json' });
  triggerDownload(blob, filename);
  return true;
}

export function downloadMarkdown(payload, filename = 'thoughtspace-export.md') {
  if (typeof document === 'undefined' || !document.body) return false;
  const blob = new Blob([payloadToMarkdown(payload)], { type: 'text/markdown' });
  triggerDownload(blob, filename);
  return true;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

export function suggestFilename(format, payload) {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
  const count = payload?.thoughts?.length ?? 0;
  const suffix = format === 'markdown' ? 'md' : 'json';
  return `thoughtspace-${count}items-${stamp}.${suffix}`;
}

export const __test__ = { SCHEMA_VERSION };
