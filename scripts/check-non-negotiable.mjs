#!/usr/bin/env node
// [INPUT]: docs/superpowers/specs/*.md 的 non-negotiable: 字段 + src/**/*.js
// [OUTPUT]: 代码与 non-negotiable 不一致时 FATAL;一致时通过
// [POS]: scripts/ 下,被 npm run check:non-negotiable 调用
// [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseFrontmatter(content) {
  const m = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!m) return null;
  try { return yaml.load(m[1]) || {}; } catch { return null; }
}

async function walk(dir, exts = ['.js', '.mjs']) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage' || e.name === 'tests') continue;
      files = files.concat(await walk(p, exts));
    } else {
      if (exts.some(x => e.name.endsWith(x)) && !e.name.includes('.test.')) files.push(p);
    }
  }
  return files;
}

// 内置的 non-negotiable 检查规则
// 每条规则: { specId, statement (匹配关键词), guard (fn that reads code + returns violations) }
const GUARDS = [
  {
    specId: 'core-data-model',
    keywords: ['不可变', 'immutable', '不可变对象'],
    guard: (allCode) => {
      const violations = [];
      for (const [f, text] of allCode) {
        if (!/src[/\\]core[/\\](thought|edge|zone)\.js$/.test(f)) continue;
        const hasFreeze = /Object\.freeze\s*\(/.test(text) || /return\s*\{[^}]*\.\.\./.test(text);
        if (!hasFreeze) {
          violations.push({ file: relative(ROOT, f), msg: 'core-data-model 要求 model 返回不可变对象,但代码无 Object.freeze 或浅拷贝' });
        }
      }
      return violations;
    }
  },
  {
    specId: 'persistence-yjs-bridge',
    keywords: ['Yjs', '权威数据源'],
    guard: (allCode) => {
      const violations = [];
      // 禁止直接用 localStorage 持久化 thought/edge/zone 数据
      for (const [f, text] of allCode) {
        if (!/src[/\\](?!main\.js)/.test(f)) continue;
        // localStorage.setItem 含 thought|edge|zone 关键字段 → 违反
        if (/localStorage\.setItem\s*\(/.test(text)) {
          const keys = [...text.matchAll(/localStorage\.setItem\s*\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
          if (keys.some(k => /thought|edge|zone|crystal|action/.test(k))) {
            violations.push({ file: relative(ROOT, f), msg: `persistence-yjs-bridge 要求 Yjs 是唯一权威,localStorage.setItem(${keys.join(',')}) 违反` });
          }
        }
      }
      return violations;
    }
  },
  {
    specId: 'shape-adaptive-views',
    keywords: ['视图决策', '数据层'],
    guard: (allCode) => {
      const violations = [];
      // shape-resolver.js 禁止写入数据层
      let shapeResolverPath = null;
      for (const p of allCode.keys()) {
        if (/shape-resolver\.js$/.test(p)) { shapeResolverPath = p; break; }
      }
      const shapeResolver = shapeResolverPath ? allCode.get(shapeResolverPath) : null;
      if (shapeResolver) {
        const writePattern = /import.*from.*(bridge|write|save|persist)/i;
        if (writePattern.test(shapeResolver)) {
          violations.push({ file: 'src/core/shape-resolver.js', msg: 'shape-adaptive-views 要求形状是视图决策,shape-resolver 禁止 import 任何持久化模块' });
        }
      }
      return violations;
    }
  },
  {
    specId: 'kanban-layered-space',
    keywords: ['正交', '排序与嵌套'],
    guard: (allCode) => {
      const violations = [];
      let sortAxisPath = null;
      for (const p of allCode.keys()) {
        if (/sort-axis\.js$/.test(p)) { sortAxisPath = p; break; }
      }
      const sortAxis = sortAxisPath ? allCode.get(sortAxisPath) : null;
      if (sortAxis) {
        if (/auto[-_]?sort/i.test(sortAxis) && /forced/i.test(sortAxis)) {
          violations.push({ file: 'src/core/sort-axis.js', msg: 'kanban-layered-space 要求排序与嵌套不强制,sort-axis 似有强制排序逻辑' });
        }
      }
      return violations;
    }
  },
  // M1-4 (2026-07-07): L1-5 半透明预览守卫 — 对应 CLAUDE.md L1-MANIFEST L1-5
  // 原先只 copilot-panel.js 直写无机器守卫;现在加 grep 守卫:
  // 检测 ctx.onCreate* 调用是否经"预览"步骤 (cp-preview 标记)
  {
    specId: 'render-layer',
    keywords: ['半透明预览', 'AI/自动化建议'],
    guard: (allCode) => {
      const violations = [];
      for (const [f, text] of allCode) {
        if (!/src[/\\]render[/\\]copilot-panel\.js$/.test(f)) continue;
        // 必须存在 cp-preview 标记 + enterPreview 函数
        if (!/cp-preview/.test(text) || !/enterPreview/.test(text)) {
          violations.push({
            file: relative(ROOT, f),
            msg: 'L1-5: copilot-panel.js 必须实现半透明预览 (cp-preview class + enterPreview 函数),AI 建议不得直接修改用户数据'
          });
        }
        // ctx.onCreate* 调用必须出现在 enterPreview 闭包内 (粗略:相邻 50 行内有 enterPreview)
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/ctx\.onCreate(Edge|Sequence)\s*\(/);
          if (!m) continue;
          // 向上 50 行找 enterPreview
          let hasPreview = false;
          for (let j = Math.max(0, i - 50); j <= i; j++) {
            if (/enterPreview/.test(lines[j])) { hasPreview = true; break; }
          }
          if (!hasPreview) {
            violations.push({
              file: relative(ROOT, f),
              msg: `L1-5: 第 ${i + 1} 行 ctx.onCreate${m[1]} 调用未在 enterPreview 预览步骤内 — AI 建议直接修改用户数据`
            });
          }
        }
      }
      return violations;
    }
  },
  // M1-4 (2026-07-07): L1-6 cloud sync 守卫 — 对应 CLAUDE.md L1-MANIFEST L1-6
  // Phase 0 应是 0 cloud 调用 (笔记内容默认不上云)
  // 检测 fetch('http') / cloud upload / sync API 等
  {
    specId: 'trae-mcp-and-project-rules-bootstrap',
    keywords: ['不上云', '云同步', '隐私优先'],
    guard: (allCode) => {
      const violations = [];
      // 白名单: localhost / 127.0.0.1 / 注释行 / 字符串字面量 'cloud' 作为变量名
      const CLOUD_PATTERNS = [
        { re: /fetch\s*\(\s*['"`]https?:\/\/(?!localhost|127\.0\.0\.1)/, msg: '检测到外部 HTTP fetch — Phase 0 不允许云调用' },
        { re: /navigator\.serviceWorker\.register\s*\(/, msg: '检测到 Service Worker 注册 — Phase 0 不允许后台云同步' },
        { re: /\bWebSocket\s*\(\s*['"`]wss?:\/\//, msg: '检测到 WebSocket 连接 — Phase 0 不允许实时云同步' }
      ];
      for (const [f, text] of allCode) {
        if (/src[/\\]/.test(f) === false) continue;
        // 跳过 tests
        if (/\.test\.js$/.test(f)) continue;
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // 跳过注释行
          if (/^\s*(\/\/|\/\*|\*)/.test(line)) continue;
          for (const { re, msg } of CLOUD_PATTERNS) {
            if (re.test(line)) {
              violations.push({
                file: relative(ROOT, f),
                msg: `L1-6: 第 ${i + 1} 行 ${msg}`
              });
            }
          }
        }
      }
      return violations;
    }
  }
];

async function main() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const specFiles = (await readdir(specsDir)).filter(f => f.endsWith('-design.md'));

  // 加载所有代码到内存
  const codeFiles = await walk(join(ROOT, 'src'));
  const allCode = new Map();
  for (const f of codeFiles) {
    allCode.set(f, await readFile(f, 'utf8'));
  }

  const violations = [];
  for (const f of specFiles) {
    const meta = parseFrontmatter((await readFile(join(specsDir, f), 'utf8')));
    if (!meta || !Array.isArray(meta['non-negotiable'])) continue;
    const nnList = meta['non-negotiable'];

    // 找到匹配的 guard
    for (const guard of GUARDS) {
      if (meta.id !== guard.specId) continue;
      // 验证 keywords 与声明匹配
      const matched = guard.keywords.some(kw =>
        nnList.some(s => typeof s === 'string' && s.includes(kw))
      );
      if (!matched) continue;
      // 执行代码语义检查
      const result = guard.guard(allCode);
      for (const v of result) {
        violations.push({
          severity: 'FATAL-010',
          path: v.file,
          msg: `[${guard.specId}] non-negotiable 违反: ${v.msg}`
        });
      }
    }
  }

  let exitCode = 0;
  if (violations.length === 0) {
    console.log('✓ non-negotiable 代码语义校验通过');
    console.log(`  已检查 ${GUARDS.length} 条机器可识别的 non-negotiable 规则`);
  } else {
    for (const v of violations) {
      console.error(`✗ ${v.severity}  ${v.path}  ${v.msg}`);
      exitCode = 1;
    }
  }
  process.exit(exitCode);
}

main().catch((e) => {
  console.error('FATAL: check-non-negotiable 失败', e);
  process.exit(1);
});