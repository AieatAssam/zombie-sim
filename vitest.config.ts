import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/*.ts'],
      exclude: ['src/__tests__/**'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        lines: 50,
        functions: 50,
        branches: 30,
        statements: 50,
      },
    },
  },
});
