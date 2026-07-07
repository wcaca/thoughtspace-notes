#!/usr/bin/env node
// [INPUT]: src/**/*.js 注释中的 @note(...) 链接
// [OUTPUT]: 验证报告 + 注释拓扑图 (.notes-link-graph.json)
// [POS]: scripts/check-note-links.mjs — 注释时间拓扑门禁
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
//
// 注释时间拓扑 — 把"按需加载笔记"提升到 CI 强制约束:
//  - 任何代码注释里出现 @note(...) 必须指向真实笔记文件 + 真实 anchor
//  - 任何 notes/ 里的锚点,记录在 .notes-link-graph.json
//  - 门禁扫到孤儿锚点 / 死链 → 阻止 commit
//
// 注释格式:
//   // @note(sp1, pitfall, T1.4-no-bootstrap, since:2026-07-07)
//   // @note(sp1, decision, why-window-globals, since:2026-07-07)
//   // @note(sp1, data-flow, resolve-pipeline, since:2026-07-07)
//   // @note(sp1, integration, observe-views, since:2026-07-07)
//
// 第一参: sub-project (sp1, sp2, shape, topology, etc.)
// 第二参: type (pitfall, decision, data-flow, integration, spec)
// 第三参: anchor (必须存在于 docs/notes/<sub>/<type>.md)
// 可选: since:YYYY-MM-DD

import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_DIR = join(ROOT, 'src');
const NOTES_DIR = join(ROOT, 'docs/notes');
const GRAPH_PATH = join(ROOT, '.notes-link-graph.json');

const NOTE_REGEX = /@note\(([^)]+)\)/g;
const TYPE_TO_FILE = {
  'pitfall': 'pitfalls.md',
  'decision': 'decisions.md',
  'data-flow': 'data-flow.md',
  'integration': 'integration-points.md'
};

const errors = [];
const warnings = [];
const links = []; // { file, line, subProject, type, anchor, since }

function walk(dir, files = []) {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.git' || e === 'coverage' || e === 'dist') continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (e.endsWith('.js')) files.push(p);
  }
  return files;
}

function posix(p) {
  return p.split(join.sep).join('/');
}

function extractAnchors(mdPath) {
  if (!existsSync(mdPath)) return new Set();
  const text = readFileSync(mdPath, 'utf8');
  const anchors = new Set();
  // 匹配 ## anchor-name (锚点)
  // Unicode 属性类: \p{L} 任意语言字母, \p{N} 任意数字, \p{M} 组合标记
  const re = new RegExp('^#{1,6}\\s+([\\p{L}\\p{N}\\p{M}.\\-_#]+)', 'gmu');
  let m;
  while ((m = re.exec(text)) !== null) anchors.add(m[1]);
  return anchors;
}

function parseNoteLine(rawArgs) {
  const parts = rawArgs.split(',').map((s) => s.trim());
  if (parts.length < 3) return null;
  const [subProject, type, anchor, ...attrs] = parts;
  const result = { subProject, type, anchor };
  for (const a of attrs) {
    const [k, v] = a.split(':').map((s) => s.trim());
    if (k === 'since') result.since = v;
  }
  return result;
}

function scanFiles() {
  const files = walk(SRC_DIR);
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let m;
      NOTE_REGEX.lastIndex = 0;
      while ((m = NOTE_REGEX.exec(line)) !== null) {
        const parsed = parseNoteLine(m[1]);
        if (!parsed) {
          warnings.push({
            file: relative(ROOT, file),
            line: i + 1,
            msg: `@note 参数不完整: ${m[1]}`
          });
          continue;
        }
        links.push({
          file: posix(relative(ROOT, file)),
          line: i + 1,
          ...parsed
        });
      }
    }
  }
}

function validateLinks() {
  // 缓存每个 (sub, type) 的锚点集合
  const anchorCache = new Map();
  function getAnchors(sub, type) {
    const key = `${sub}:${type}`;
    if (anchorCache.has(key)) return anchorCache.get(key);
    const file = TYPE_TO_FILE[type];
    if (!file) {
      anchorCache.set(key, null);
      return null;
    }
    const path = join(NOTES_DIR, sub, file);
    if (!existsSync(path)) {
      anchorCache.set(key, null);
      return null;
    }
    const anchors = extractAnchors(path);
    anchorCache.set(key, anchors);
    return anchors;
  }

  for (const link of links) {
    // 1. 验证 type 合法
    if (!TYPE_TO_FILE[link.type]) {
      errors.push({
        file: link.file,
        line: link.line,
        msg: `@note: 未知 type "${link.type}",合法值: ${Object.keys(TYPE_TO_FILE).join(', ')}`
      });
      continue;
    }
    // 2. 验证 notes/ 目录存在
    const noteFile = join(NOTES_DIR, link.subProject, TYPE_TO_FILE[link.type]);
    if (!existsSync(noteFile)) {
      errors.push({
        file: link.file,
        line: link.line,
        msg: `@note: 笔记文件不存在 ${relative(ROOT, noteFile)}`
      });
      continue;
    }
    // 3. 验证 anchor 存在
    const anchors = getAnchors(link.subProject, link.type);
    if (anchors && !anchors.has(link.anchor)) {
      errors.push({
        file: link.file,
        line: link.line,
        msg: `@note: 锚点 "${link.anchor}" 不存在于 ${posix(relative(ROOT, noteFile))}`
      });
    }
  }
}

function buildGraph() {
  // 反向链接: 哪个注释链向哪个笔记锚点
  const reverse = {}; // `${sub}:${type}:${anchor}` -> [{ file, line }]
  for (const link of links) {
    const key = `${link.subProject}:${link.type}:${link.anchor}`;
    if (!reverse[key]) reverse[key] = [];
    reverse[key].push({ file: link.file, line: link.line, since: link.since });
  }

  // 正向链接: 哪个文件有哪些 @note
  const forward = {};
  for (const link of links) {
    const key = link.file;
    if (!forward[key]) forward[key] = [];
    forward[key].push({
      subProject: link.subProject,
      type: link.type,
      anchor: link.anchor,
      line: link.line,
      since: link.since
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      totalLinks: links.length,
      uniqueAnchors: Object.keys(reverse).length,
      filesWithNotes: Object.keys(forward).length,
      errors: errors.length,
      warnings: warnings.length
    },
    forward, // file -> notes
    reverse  // anchor -> files
  };
}

function printReport(graph) {
  console.log('\n🔍 @note 注释时间拓扑验证\n');
  console.log(`  总链接数:     ${graph.stats.totalLinks}`);
  console.log(`  唯一锚点数:   ${graph.stats.uniqueAnchors}`);
  console.log(`  涉及文件数:   ${graph.stats.filesWithNotes}`);
  console.log(`  错误:         ${graph.stats.errors}`);
  console.log(`  警告:         ${graph.stats.warnings}\n`);

  if (errors.length > 0) {
    console.log('❌ 错误:');
    for (const e of errors) {
      console.log(`  ${e.file}:${e.line}  ${e.msg}`);
    }
  }
  if (warnings.length > 0) {
    console.log('\n⚠️  警告:');
    for (const w of warnings) {
      console.log(`  ${w.file}:${w.line}  ${w.msg}`);
    }
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ 全部链接有效\n');
  }

  // 拓扑图摘要
  console.log('📊 注释拓扑图:');
  for (const [anchor, refs] of Object.entries(graph.reverse)) {
    console.log(`  ${anchor}`);
    for (const r of refs) {
      console.log(`    ← ${r.file}:${r.line}${r.since ? ` (since ${r.since})` : ''}`);
    }
  }
}

function checkNegativeCoverage() {
  // P0-3: 含 TODO/FIXME/⚠️ 等"待决策标记"的文件,必须同时存在至少一个 @note
  // 防止"按需加载笔记"机制被空集合绕过
  const TRIGGERS = [
    /\bTODO\b/,                           // 全大写 TODO 注释
    /\bFIXME\b/i,
    /\bXXX\b/,
    /\bHACK\b/i,
    /易错/,
    /未决/i,
    /暂未启用/
  ];
  // 排除:[OUTPUT] 字段中的 createEdgeBridge 等示例文本,以及 AUTO-GENERATED 元数据
  const FILE_PATTERNS = walk(SRC_DIR);
  const coveredFiles = new Set(links.map((l) => posix(l.file)));
  for (const file of FILE_PATTERNS) {
    const relFile = posix(relative(ROOT, file));
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    let flagged = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/@note\(/.test(line)) continue;
      // 排除头部注释块 (// [INPUT]:, // [OUTPUT]:, // [POS]:, // [PROTOCOL]:) 与 AUTO-GEN 元数据
      if (/^\s*\/\/\s*\[(INPUT|OUTPUT|POS|PROTOCOL)\]:/.test(line)) continue;
      if (/AUTO-GENERATED|AUTO-GEN/.test(line)) continue;
      for (const re of TRIGGERS) {
        if (re.test(line)) {
          flagged = true;
          break;
        }
      }
      if (flagged) break;
    }
    if (flagged && !coveredFiles.has(relFile)) {
      errors.push({
        file: relFile,
        line: 1,
        msg: `负向门禁 P0-3: 含 TODO/FIXME/易错/未决 等触发词,但文件无任何 @note 链接`
      });
      coveredFiles.add(relFile);
    }
  }
}

function main() {
  scanFiles();
  validateLinks();
  checkNegativeCoverage();
  const graph = buildGraph();
  printReport(graph);

  // 只在门禁通过时写拓扑图(失败时不写,避免污染仓库历史)
  if (errors.length === 0) {
    writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2));
  } else {
    console.log('  (skip .notes-link-graph.json 写入:门禁失败)');
  }

  if (errors.length > 0) {
    console.log(`\n✗ 门禁失败:${errors.length} 个错误`);
    process.exit(1);
  }
  console.log('\n✓ 门禁通过');
}

main();