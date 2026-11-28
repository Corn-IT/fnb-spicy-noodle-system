import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '../../../apps/web-app/node_modules/@playwright/test/index.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));

export default defineConfig({
  testDir: path.dirname(fileURLToPath(import.meta.url)),
  testMatch: 'browser.audit.mts',
  timeout: 60_000,
  workers: 1,
  retries: 0,
  outputDir: path.join(root, 'apps/web-app/test-results/idle-audit'),
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1366, height: 768 },
    hasTouch: true,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --filter @fnb/web-app dev --port 5173 --strictPort --host 127.0.0.1',
    cwd: root,
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
