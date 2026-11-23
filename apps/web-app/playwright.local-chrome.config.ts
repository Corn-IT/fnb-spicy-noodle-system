import { defineConfig, devices } from '@playwright/test';

// Local runs with the Google Chrome already installed on this machine (no browser download).
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', locale: 'vi-VN', timezoneId: 'Asia/Ho_Chi_Minh', channel: 'chrome' },
  projects: [
    { name: 'chrome-desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1366, height: 768 } } },
    {
      name: 'chrome-phone',
      testMatch: /.*(account-preferences|display-scale).*\.spec\.ts/,
      use: { ...devices['Pixel 5'], channel: 'chrome', viewport: { width: 390, height: 844 } },
    },
  ],
});
