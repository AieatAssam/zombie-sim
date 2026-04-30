import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    include: ['src/__tests__/**/*.test.ts'],
    env: {
      PLAYWRIGHT_BROWSERS_PATH: '/home/openclaw/.cache/ms-playwright',
    },
    coverage: {
      provider: 'v8',
      include: ['src/*.ts'],
      exclude: ['src/__tests__/**', 'src/renderer.ts', 'src/main.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 75,
        functions: 75,
        branches: 70,
        statements: 75,
      },
    },
  },
});
