#!/usr/bin/env node
/**
 * [INPUT]: docs/topology-priority.md, docs/superpowers/specs/*.md, src/**\/*.js, scripts/**\/*.mjs
 * [OUTPUT]: 生成 .holo-index.json 全息索引,包含代码↔spec↔原文的三层环形映射
 * [POS]: scripts/ 下,被 npm run holo:index 调用
 * [PROTOCOL]: 变更时更新此头部,然后检查 ../CLAUDE.md
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, dirname, basename, relative } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

async function walk(dir, extensions = ['.js', '.mjs']) {
  let entries = [];
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  let files = [];
  for (const e of entries) {
    const path = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git' || e.name === 'coverage' || e.name === 'tests') continue;
      files = files.concat(await walk(path, extensions));
    } else {
      if (extensions.some(ext => e.name.endsWith(ext)) && !e.name.includes('.test.')) {
        files.push(path);
      }
    }
  }
  return files;
}

function extractSpecTable(content) {
  const specs = [];
  const sectionRegex = /### 2\.1[\s\S]*?(?=\n### |\n---|$)/;
  const match = content.match(sectionRegex);
  if (!match) return specs;
  const section = match[0];
  const rowRegex = /\| `([^`]+)` \| ([^|]+) \| ([^|]+) \| ([^|]+) \| ([^|]+) \|/g;
  let m;
  while ((m = rowRegex.exec(section)) !== null) {
    specs.push({
      file: m[1].trim(),
      status: m[2].trim(),
      created: m[3].trim(),
      relatedCode: m[4].trim(),
      note: m[5].trim()
    });
  }
  return specs;
}

function extractSourceQuotes(specContent) {
  const quotes = [];
  const quoteRegex = />\s*\*\*用户原话\*\*：?\s*"?(.+?)"?\s*$/gm;
  let m;
  while ((m = quoteRegex.exec(specContent)) !== null) {
    quotes.push(m[1].trim());
  }
  const simpleQuoteRegex = />\s*"([^"]+)"\s*$/gm;
  while ((m = simpleQuoteRegex.exec(specContent)) !== null) {
    const quote = m[1].trim();
    if (!quotes.includes(quote) && quote.length > 10) {
      quotes.push(quote);
    }
  }
  return quotes;
}

function extractSpecTitle(specContent) {
  const titleMatch = specContent.match(/^#\s+(.+)$/m);
  return titleMatch ? titleMatch[1].trim() : '';
}

function extractSpecId(filename) {
  const match = filename.match(/^\d{4}-\d{2}-\d{2}-(.+)-design\.md$/);
  return match ? match[1] : filename.replace(/\.md$/, '');
}

async function extractCodeRefs(specEntry, scriptFiles, allCodeFiles) {
  const related = specEntry.relatedCode;
  const refs = [];
  if (!related || related.includes('已被') || related.includes('(已')) return refs;

  // P1-5: 每条关联带 kind 标签 (explicit | wildcard | inheritance)
  // explicit: 文本中明确列出的 .js 文件
  // wildcard: 由"全集/通配/*"触发推论
  // inheritance: 由 inherits-from 继承 (此处未实现,留作扩展)
  const fileMatches = related.match(/[a-zA-Z0-9_-]+\.(?:js|mjs|cjs)/g) || [];
  for (const f of fileMatches) {
    refs.push({ file: f, kind: 'explicit' });
  }

  const isWildcard = related.includes('全集') || related.includes('/*') || related.includes('files)');
  if (isWildcard) {
    for (const af of allCodeFiles) {
      const base = basename(af);
      if (!refs.some(r => r.file === base)) {
        refs.push({ file: base, kind: 'wildcard' });
      }
    }
  }

  const dirPatterns = [
    'src/persistence',
    'src/render',
    'src/core',
    'src/topology',
    'src/sim',
    'src/ui',
    'scripts'
  ];
  for (const dir of dirPatterns) {
    if (related.includes(dir) && (related.includes('*') || related.includes('全集') || related.includes('all') || related.includes('files)'))) {
      const fullDir = join(ROOT, dir);
      if (existsSync(fullDir)) {
        const dirFiles = (await readdir(fullDir)).filter(f => /\.(js|mjs|cjs)$/.test(f) && !f.includes('.test.'));
        for (const df of dirFiles) {
          if (!refs.some(r => r.file === df)) {
            refs.push({ file: df, kind: 'wildcard' });
          }
        }
      }
    }
  }

  return refs;
}

function extractCodeFileHeader(content) {
  const headerMatch = content.match(/\/\*\*[\s\S]*?\*\//);
  if (!headerMatch) return null;
  const header = headerMatch[0];
  const fields = {};
  const fieldRegex = /\*\s*\[([A-Z]+)\]:\s*(.+)/g;
  let m;
  while ((m = fieldRegex.exec(header)) !== null) {
    fields[m[1]] = m[2].trim();
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

async function main() {
  console.log('🔮 生成全息索引...');

  const topologyContent = await readFile(join(ROOT, 'docs', 'topology-priority.md'), 'utf8');
  const specTable = extractSpecTable(topologyContent);

  const specsDir = join(ROOT, 'docs', 'superpowers', 'specs');
  const specFiles = (await readdir(specsDir))
    .filter(f => f.endsWith('.md') && f !== 'CLAUDE.md');

  const srcFiles = await walk(join(ROOT, 'src'));
  const scriptFiles = await walk(join(ROOT, 'scripts'), ['.mjs']);
  const allCodeFiles = [...srcFiles, ...scriptFiles];

  const holoIndex = {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    layers: {
      code: {},
      spec: {},
      source: {}
    },
    topology: {
      specs: [],
      codeFiles: []
    },
    rings: {
      codeToSpec: {},
      specToCode: {},
      specToSource: {},
      sourceToSpec: {},
      codeToSource: {},
      sourceToCode: {}
    },
    stats: {}
  };

  for (const specEntry of specTable) {
    const specId = extractSpecId(specEntry.file);
    const specPath = join(specsDir, specEntry.file);
    let specContent = '';
    if (existsSync(specPath)) {
      specContent = await readFile(specPath, 'utf8');
    }

    const title = extractSpecTitle(specContent);
    const sourceQuotes = extractSourceQuotes(specContent);
    const codeRefs = await extractCodeRefs(specEntry, scriptFiles, [...srcFiles, ...scriptFiles]);

    holoIndex.layers.spec[specId] = {
      id: specId,
      file: specEntry.file,
      title,
      status: specEntry.status,
      created: specEntry.created,
      note: specEntry.note,
      relatedCodeText: specEntry.relatedCode,
      codeRefs,
      sourceQuotes,
      path: `docs/superpowers/specs/${specEntry.file}`
    };

    holoIndex.topology.specs.push(specId);

    for (const codeRef of codeRefs) {
      const codeFile = typeof codeRef === 'string' ? codeRef : codeRef.file;
      const kind = typeof codeRef === 'string' ? 'explicit' : codeRef.kind;
      if (!holoIndex.rings.specToCode[specId]) {
        holoIndex.rings.specToCode[specId] = [];
      }
      if (!holoIndex.rings.specToCode[specId].some(r => r.file === codeFile)) {
        holoIndex.rings.specToCode[specId].push({ file: codeFile, kind });
      }
      if (!holoIndex.rings.codeToSpec[codeFile]) {
        holoIndex.rings.codeToSpec[codeFile] = [];
      }
      if (!holoIndex.rings.codeToSpec[codeFile].some(r => r.specId === specId)) {
        holoIndex.rings.codeToSpec[codeFile].push({ specId, kind });
      }
    }

    for (const quote of sourceQuotes) {
      const quoteId = `src_${specId}_${sourceQuotes.indexOf(quote)}`;
      holoIndex.layers.source[quoteId] = {
        id: quoteId,
        text: quote,
        specId,
        type: 'user-quote'
      };
      if (!holoIndex.rings.specToSource[specId]) {
        holoIndex.rings.specToSource[specId] = [];
      }
      holoIndex.rings.specToSource[specId].push(quoteId);
      if (!holoIndex.rings.sourceToSpec[quoteId]) {
        holoIndex.rings.sourceToSpec[quoteId] = [];
      }
      holoIndex.rings.sourceToSpec[quoteId].push(specId);
    }
  }

  for (const codePath of allCodeFiles) {
    const baseName = basename(codePath);
    const relPath = relative(ROOT, codePath).replace(/\\/g, '/');
    let content = '';
    try {
      content = await readFile(codePath, 'utf8');
    } catch {}
    const header = extractCodeFileHeader(content);

    holoIndex.layers.code[baseName] = {
      name: baseName,
      path: relPath,
      header,
      specRefs: holoIndex.rings.codeToSpec[baseName] || [],
      directory: dirname(relPath)
    };

    holoIndex.topology.codeFiles.push(baseName);

    const specRefs = holoIndex.rings.codeToSpec[baseName] || [];
    for (const specId of specRefs) {
      const sourceIds = holoIndex.rings.specToSource[specId] || [];
      for (const srcId of sourceIds) {
        if (!holoIndex.rings.codeToSource[baseName]) {
          holoIndex.rings.codeToSource[baseName] = [];
        }
        if (!holoIndex.rings.codeToSource[baseName].includes(srcId)) {
          holoIndex.rings.codeToSource[baseName].push(srcId);
        }
        if (!holoIndex.rings.sourceToCode[srcId]) {
          holoIndex.rings.sourceToCode[srcId] = [];
        }
        if (!holoIndex.rings.sourceToCode[srcId].includes(baseName)) {
          holoIndex.rings.sourceToCode[srcId].push(baseName);
        }
      }
    }
  }

  holoIndex.stats = {
    totalSpecs: Object.keys(holoIndex.layers.spec).length,
    activeSpecs: Object.values(holoIndex.layers.spec).filter(s => !s.status.includes('废弃') && !s.status.includes('孤儿')).length,
    totalCodeFiles: Object.keys(holoIndex.layers.code).length,
    codeWithSpecRef: Object.values(holoIndex.layers.code).filter(c => c.specRefs.length > 0).length,
    totalSourceQuotes: Object.keys(holoIndex.layers.source).length,
    codeSpecCoverage: ((Object.values(holoIndex.layers.code).filter(c => c.specRefs.length > 0).length / Object.keys(holoIndex.layers.code).length) * 100).toFixed(1) + '%',
    specSourceCoverage: ((Object.values(holoIndex.layers.spec).filter(s => s.sourceQuotes.length > 0).length / Object.keys(holoIndex.layers.spec).length) * 100).toFixed(1) + '%'
  };

  const outputPath = join(ROOT, '.holo-index.json');
  await writeFile(outputPath, JSON.stringify(holoIndex, null, 2), 'utf8');

  console.log('');
  console.log('📊 全息索引统计');
  console.log('────────────────');
  console.log(`  Spec 数:          ${holoIndex.stats.totalSpecs}`);
  console.log(`  活跃 Spec:        ${holoIndex.stats.activeSpecs}`);
  console.log(`  代码文件数:       ${holoIndex.stats.totalCodeFiles}`);
  console.log(`  有 spec 关联:     ${holoIndex.stats.codeWithSpecRef}`);
  console.log(`  原文引用数:       ${holoIndex.stats.totalSourceQuotes}`);
  console.log(`  代码覆盖率:       ${holoIndex.stats.codeSpecCoverage}`);
  console.log(`  Spec 原文覆盖率:  ${holoIndex.stats.specSourceCoverage}`);
  console.log('');
  console.log(`✓ 全息索引已生成: .holo-index.json`);
  console.log('');
  console.log('🔄 环形映射已构建:');
  console.log('   代码 ↔ Spec ↔ 原文');
  console.log('   每层都可向上溯源、向下拓展');
}

main().catch((e) => {
  console.error('FATAL: holo-index 生成失败', e);
  process.exit(1);
});
