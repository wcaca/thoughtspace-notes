#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (readFile, access), node:path
 * [OUTPUT]: 校验 4 个 .trae 规则文件存在 + 含关键 snippet,exit 0 / exit 1
 * [POS]: scripts/ 下,session 启动时 sanity check 用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));  // scripts/ 的上一级
const HOME = process.env.USERPROFILE || process.env.HOME;

const checks = [
  { path: join(ROOT, '.trae', 'rules', 'project_rules.md'), must: ['架构', 'GEB', '[PROTOCOL]'], label: 'notes project_rules' },
  { path: 'E:\\魔方心厦\\thoughtspace-arcade\\.trae\\rules\\project_rules.md', must: ['占位', '[PROTOCOL]'], label: 'arcade project_rules' },
  { path: join(HOME, '.trae', 'mcp.json'), must: ['taptap-maker'], label: '.trae/mcp.json' },
  { path: join(HOME, '.trae-cn', 'mcp.json'), must: ['taptap-maker'], label: '.trae-cn/mcp.json' }
];

let allOk = true;
for (const c of checks) {
  try {
    await access(c.path);
    const content = await readFile(c.path, 'utf8');
    const missing = c.must.filter(s => !content.includes(s));
    if (missing.length === 0) {
      console.log('✓', c.label);
    } else {
      console.error('✗', c.label, '缺关键 snippet:', missing.join(', '));
      allOk = false;
    }
  } catch {
    console.error('✗', c.label, '文件不存在:', c.path);
    allOk = false;
  }
}
process.exit(allOk ? 0 : 1);
