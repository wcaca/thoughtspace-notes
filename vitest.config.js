import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js', 'src/**/*.test.js'],
    exclude: ['node_modules', 'dist'],
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['src/**/*.js'],
      exclude: ['src/**/*.test.js', 'src/**/__tests__/**'],
      // P1-6: 渐进式覆盖率门槛
      // - core/ 核心模块保持高门槛(数据契约/逻辑层)
      // - 其他模块软提醒(per-file thresholds 可独立设置)
      thresholds: {
        lines: 35,
        functions: 65,
        branches: 65,
        statements: 35
      }
    }
  }
});