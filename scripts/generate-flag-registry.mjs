#!/usr/bin/env node
/**
 * [INPUT]: docs/superpowers/specs/*.md 的 flags: frontmatter
 * [OUTPUT]: 生成 src/runtime/flags/registry.js
 * [POS]: scripts/ 下,被 npm run generate:flag-registry 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function parseFrontmatter(content) {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return null;
  try {
    return yaml.load(match[1]) || {};
  } catch (e) {
    return null;
  }
}

async function main() {
  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const specFiles = (await readdir(specsDir)).filter(f => f.endsWith('-design.md'));

  const allFlags = [];
  for (const f of specFiles) {
    const content = await readFile(join(specsDir, f), 'utf8');
    const meta = parseFrontmatter(content);
    if (!meta || !Array.isArray(meta.flags)) continue;
    for (const flag of meta.flags) {
      if (!flag.name) {
        console.error(`✗ spec ${f} 的 flags[] 中存在未命名 flag`);
        continue;
      }
      allFlags.push(flag);
    }
  }

  const sorted = allFlags.sort((a, b) => a.name.localeCompare(b.name));

  let code = `/**
 * [INPUT]: docs/superpowers/specs/*.md 的 flags: frontmatter
 * [OUTPUT]: 静态 registry map: name → { default, status, scope, regression_subset, ... }
 * [POS]: src/runtime/flags/registry.js,被 npm run generate:flag-registry 自动生成
 * [PROTOCOL]: 变更 spec flags 后必须重新生成,然后检查 ../CLAUDE.md
 *
 * ⚠️ AUTO-GENERATED FROM SPEC FRONTMATTER
 * ⚠️ 手动修改会被覆盖;请编辑 spec 后跑: npm run generate:flag-registry
 */

export const FLAG_REGISTRY = Object.freeze({\n`;

  for (const f of sorted) {
    code += `  '${f.name}': Object.freeze(${JSON.stringify(f, null, 4)
      .replace(/\n/g, '\n  ')}),\n\n`;
  }

  code += `});

export function getFlagDef(name) {
  return FLAG_REGISTRY[name];
}

export function listFlags() {
  return Object.keys(FLAG_REGISTRY);
}
`;

  const outPath = join(ROOT, 'src', 'runtime', 'flags', 'registry.js');
  await writeFile(outPath, code, 'utf8');

  console.log(`✓ Flag registry 已生成: ${outPath}`);
  console.log(`  Flag 总数: ${sorted.length}`);
  for (const f of sorted) {
    console.log(`    - ${f.name} (${f.type}, ${f.status}, owner: ${f.owner_spec})`);
  }
}

main().catch((e) => {
  console.error('FATAL: generate-flag-registry 失败', e);
  process.exit(1);
});