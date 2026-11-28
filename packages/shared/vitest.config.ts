import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 95,
        branches: 92,
        functions: 95,
        lines: 95,
      },
    },
  },
});
