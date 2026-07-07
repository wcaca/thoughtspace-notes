import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..', '..');
const CHECK_GEB = join(ROOT, 'scripts', 'check-geb.mjs');

// 临时 fixture 路径(放在 src/ 下让 check-geb.mjs 的 walk 能扫到)
const TMP_L3_FIXTURE = join(ROOT, 'src', 'tmp-bad-l3-fixture.js');
const TMP_L2_DIR = join(ROOT, 'src', 'tmp-l2-fixture');
const TMP_L2_FILE = join(TMP_L2_DIR, 'foo.js');

// 合法的 L3 头部(四个锚点齐全)
const GOOD_L3_HEADER = `/**
 * [INPUT]: none
 * [OUTPUT]: test fixture for L2 detection
 * [POS]: src/tmp-l2-fixture/
 * [PROTOCOL]: test fixture, delete after test
 */
`;

const execAsync = promisify(exec);

// check-geb.mjs 含 git diff + dynamic import depcruise,Windows 上较慢
// 并行测试负载下更慢(资源竞争 + git 锁 + 大量 fixture I/O),给 120s 确保不超时
const CHECK_GEB_TIMEOUT = 120000;

async function runCheckGeb() {
  try {
    const { stdout, stderr } = await execAsync('node scripts/check-geb.mjs', {
      cwd: ROOT,
      maxBuffer: 10 * 1024 * 1024,
      encoding: 'utf8',
      timeout: CHECK_GEB_TIMEOUT
    });
    return { stdout: stdout || '', stderr: stderr || '', exitCode: 0 };
  } catch (err) {
    return {
      stdout: typeof err.stdout === 'string' ? err.stdout : (err.stdout?.toString('utf8') || ''),
      stderr: typeof err.stderr === 'string' ? err.stderr : (err.stderr?.toString('utf8') || ''),
      exitCode: typeof err.code === 'number' ? err.code : 1
    };
  }
}

function cleanup() {
  if (existsSync(TMP_L3_FIXTURE)) rmSync(TMP_L3_FIXTURE, { force: true });
  if (existsSync(TMP_L2_FILE)) rmSync(TMP_L2_FILE, { force: true });
  if (existsSync(TMP_L2_DIR)) rmSync(TMP_L2_DIR, { recursive: true, force: true });
}

describe('check-geb.mjs', () => {
  beforeAll(async () => {
    cleanup();
  });

  // afterEach 加固:即使测试超时被取消,也能确保 fixture 清理干净
  afterEach(() => {
    cleanup();
  });

  afterAll(async () => {
    cleanup();
  });

  describe('smoke test', () => {
    it('脚本存在且可执行,产生输出', async () => {
      expect(existsSync(CHECK_GEB)).toBe(true);
      const result = await runCheckGeb();
      const output = result.stdout + result.stderr;
      expect(output.length).toBeGreaterThan(0);
    }, CHECK_GEB_TIMEOUT);
  });

  describe('L3 头部缺失检测 (FATAL-002)', () => {
    it('缺少 [INPUT]/[OUTPUT]/[POS]/[PROTOCOL] 头部时触发 FATAL-002', async () => {
      // 在 src/ 根目录创建一个无 L3 头部的 .js 文件
      // (放 src/ 根目录而非子目录,避免同时触发 FATAL-004,精准测试 FATAL-002)
      writeFileSync(
        TMP_L3_FIXTURE,
        '// bad fixture: no L3 headers\nexport default {};\n',
        'utf8'
      );
      expect(existsSync(TMP_L3_FIXTURE)).toBe(true);

      const result = await runCheckGeb();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('FATAL-002');
      // 确认违规路径指向我们的 fixture
      expect(result.stderr).toContain('tmp-bad-l3-fixture.js');
    }, CHECK_GEB_TIMEOUT);

    it('清理后 L3 fixture 不再存在', async () => {
      expect(existsSync(TMP_L3_FIXTURE)).toBe(false);
    });
  });

  describe('L2 成员清单缺失检测 (FATAL-004)', () => {
    it('子目录无 CLAUDE.md 时触发 FATAL-004', async () => {
      // 创建临时子目录,放一个带合法 L3 头部的 .js 文件(避免触发 FATAL-002)
      // 但不放 CLAUDE.md,精准触发 FATAL-004
      mkdirSync(TMP_L2_DIR, { recursive: true });
      writeFileSync(
        TMP_L2_FILE,
        GOOD_L3_HEADER + '\nexport default {};\n',
        'utf8'
      );
      expect(existsSync(TMP_L2_FILE)).toBe(true);
      expect(existsSync(join(TMP_L2_DIR, 'CLAUDE.md'))).toBe(false);

      const result = await runCheckGeb();
      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain('FATAL-004');
      // 确认违规路径指向我们的临时子目录
      expect(result.stderr).toContain('tmp-l2-fixture');
    }, CHECK_GEB_TIMEOUT);

    it('清理后 L2 fixture 目录不再存在', async () => {
      expect(existsSync(TMP_L2_DIR)).toBe(false);
    });
  });
});
