import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    include: ['src/__tests__/*.test.ts'],
    exclude: [],
    coverage: {
      provider: 'v8',
      include: ['src/*.ts'],
      exclude: ['src/__tests__/**', 'src/renderer.ts', 'src/main.ts'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 73,
        functions: 70,
        branches: 65,
        statements: 73,
      },
    },
  },
});
