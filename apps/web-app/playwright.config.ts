import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const BASE_PORT = (() => {
  try {
    return new URL(BASE_URL).port || '5173';
  } catch {
    return '5173';
  }
})();
const IS_REAL = process.env.E2E_MODE === 'real';

export default defineConfig({
  testDir: './e2e',
  snapshotDir: './e2e/__screenshots__',
  timeout: 45_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: !IS_REAL,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: IS_REAL ? 1 : 2,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
  },
  webServer: {
    command: `pnpm dev --port ${BASE_PORT} --strictPort --host 127.0.0.1`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 768 } },
    },
    {
      name: 'webkit-mobile',
      testMatch: /.*(qr|responsive|display-scale|account-preferences).*\.spec\.ts/,
      testIgnore: /thermal-raster-qr\.spec\.ts/,
      use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'webkit-tablet',
      testMatch: /.*(display-scale|responsive|account-preferences).*\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1180, height: 820 } },
    },
    {
      name: 'webkit-desktop',
      testMatch: /.*(display-scale|responsive|account-preferences).*\.spec\.ts/,
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } },
    },
  ],
});
