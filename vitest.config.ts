import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
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
