#!/usr/bin/env node
/**
 * [INPUT]: node:fs/promises (copyFile, access, mkdir), node:os (homedir), node:path (join, dirname)
 * [OUTPUT]: 把 ~/.trae/mcp.json 复制到 ~/.trae-cn/mcp.json(创建目标目录如缺失)
 * [POS]: scripts/ 下的工具脚本,bootstrap spec 的"对齐 MCP 配置"动作
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { copyFile, access, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const SRC = join(homedir(), '.trae', 'mcp.json');
const DST = join(homedir(), '.trae-cn', 'mcp.json');

async function main() {
  try { await access(SRC); }
  catch { console.log('  源 mcp.json 不存在,跳过复制。'); console.log('  路径:', SRC); return; }

  await mkdir(dirname(DST), { recursive: true });
  await copyFile(SRC, DST);
  console.log('✓', `${SRC}`);
  console.log('  →', DST);
}

main().catch(err => { console.error(err); process.exit(1); });
