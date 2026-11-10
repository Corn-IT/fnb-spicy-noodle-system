import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    execArgv: ['--require', path.resolve(import.meta.dirname, './src/vitest-zlib-polyfill.cjs')],
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['dist/**', 'node_modules/**'],
  },
});
