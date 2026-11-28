import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/__tests__/**/*.spec.ts', 'prisma/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/__tests__/**',
        'src/main.ts',
        'src/**/*.module.ts',
        'src/modules/hr-schedule/short-name.util.ts',
      ],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 88,
        branches: 75,
        functions: 90,
        lines: 90,
      },
    },
  },
});
