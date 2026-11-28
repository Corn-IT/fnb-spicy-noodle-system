import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const apiProxyConfig = {
  '/api': {
    target: 'http://localhost:3000',
    changeOrigin: true,
  },
  '/socket.io': {
    target: 'http://localhost:3000',
    ws: true,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    allowedHosts: true,
    proxy: apiProxyConfig,
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
    proxy: apiProxyConfig,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'shared-catalog',
              test: /[\\/]packages[\\/]shared[\\/].*message-catalog/,
            },
            {
              name: 'vendor-react',
              test: /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/,
            },
            {
              name: 'vendor-radix',
              test: /[\\/]node_modules[\\/]@radix-ui[\\/]/,
            },
            {
              name: 'vendor-tanstack',
              test: /[\\/]node_modules[\\/]@tanstack[\\/]/,
            },
            {
              name: 'vendor-icons',
              test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            },
            {
              name: 'vendor-zod',
              test: /[\\/]node_modules[\\/]zod[\\/]/,
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    execArgv: ['--require', path.resolve(import.meta.dirname, './src/vitest-zlib-polyfill.cjs')],
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['dist/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'dist/**',
        'node_modules/**',
        'src/**/*.test.{ts,tsx}',
        'src/**/*.spec.{ts,tsx}',
        'src/**/__tests__/**',
        'src/test-setup.ts',
        'src/vitest-zlib-polyfill.cjs',
        'src/main.tsx',
        'src/index.ts',
        'src/vite-env.d.ts',
        'src/**/index.ts',
        'src/**/*.css',
      ],
      reporter: ['text', 'lcov', 'html'],
      thresholds: {
        statements: 85,
        branches: 76,
        functions: 80,
        lines: 85,
      },
    },
  },
});
