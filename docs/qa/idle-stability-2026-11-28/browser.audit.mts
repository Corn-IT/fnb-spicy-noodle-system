// Post-fix regression checks; historical screenshots and observations remain in evidence/.
import { expect, test } from '../../../apps/web-app/node_modules/@playwright/test/index.mjs';
import { setupMockApi } from '../../../apps/web-app/e2e/fixtures/api-mock';
import { writeFile } from 'node:fs/promises';

test('table request pending: POS shows loading before a response exists', async ({ page }, testInfo) => {
  await setupMockApi(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/v1/pos/tables', async (route) => {
    await gate;
    await route.fallback();
  });
  try {
    await page.goto('/pos/touch');
    await expect(page.getByTestId('page-skeleton-pos')).toBeVisible();
    await expect(page.getByText('Chưa cấu hình bàn nào', { exact: true })).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('pending-loading-fixed.png') });
  } finally {
    release();
  }
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
});

test('background API 503: AppShell polling preserves the last valid grid', async ({ page }, testInfo) => {
  await setupMockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/pos/touch');
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
  let failedCalls = 0;
  await page.route('**/api/v1/pos/tables', async (route) => {
    failedCalls += 1;
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ statusCode: 503, error: 'Service Unavailable', message: 'Simulated outage' }) });
  });
  await page.clock.runFor(26_000);
  await expect.poll(() => failedCalls).toBeGreaterThan(0);
  await expect(page.getByTestId('touch-table-summary')).toContainText('22/24');
  await expect(page.getByText('Chưa cấu hình bàn nào', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('background-503-preserved-fixed.png') });
  await page.unroute('**/api/v1/pos/tables');
  await page.clock.runFor(26_000);
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
});

test('settings schema error is classified separately from a React render exception', async ({ page }, testInfo) => {
  await setupMockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/v1/settings', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"storeName":null}' }));
  await page.goto('/settings');
  const fallback = page.locator('[data-error-key="DATA_VALIDATION_ERROR"]').first();
  await expect(fallback).toBeVisible();
  await expect(fallback).toContainText('Dữ liệu phản hồi chưa đúng cấu trúc');
  expect(errors).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('schema-error-validation-fixed.png') });
});

test('two virtual hours on POS: existing polling survives and loaded cards remain', async ({ page }, testInfo) => {
  await setupMockApi(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.install();
  await page.goto('/pos/touch');
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('HeapProfiler.collectGarbage');
  const before = await cdp.send('Memory.getDOMCounters');
  for (let minute = 1; minute <= 120; minute += 1) {
    await page.clock.fastForward(60_000);
    // Drain browser fetch callbacks between virtual minute boundaries.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    if ([15, 30, 60, 120].includes(minute)) {
      await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
    }
  }
  await cdp.send('HeapProfiler.collectGarbage');
  const after = await cdp.send('Memory.getDOMCounters');
  expect(errors).toEqual([]);
  const counters = JSON.stringify({ virtualMinutes: 120, before, after, pageErrors: errors }, null, 2);
  await writeFile(testInfo.outputPath('virtual-soak-counters.json'), counters);
  await testInfo.attach('virtual-soak-counters', { body: counters, contentType: 'application/json' });
});

test('foreground refetch using the POS query preserves stale cards on a network error', async ({ page }) => {
  await setupMockApi(page);
  await page.goto('/pos/touch');
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
  let failedCalls = 0;
  await page.route('**/api/v1/pos/tables', (route) => { failedCalls += 1; return route.abort('internetdisconnected'); });
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => failedCalls).toBeGreaterThan(1);
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
  await expect(page.getByTestId('touch-table-summary')).toContainText('22/24');
  await expect(page.getByText('Chưa cấu hình bàn nào', { exact: true })).toHaveCount(0);
});

test('a successful empty table response legitimately shows the empty state', async ({ page }) => {
  await setupMockApi(page);
  await page.route('**/api/v1/pos/tables', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"tables":[],"takeaways":[]}' }));
  await page.goto('/pos/touch');
  await expect(page.getByText('Chưa cấu hình bàn nào', { exact: true })).toBeVisible();
  await expect(page.locator('[data-error-key]')).toHaveCount(0);
});

test('settings draft survives thirty virtual minutes and foreground refetch without save requests', async ({ page }) => {
  await setupMockApi(page);
  let writes = 0;
  page.on('request', (request) => { if (/\/api\/v1\/settings$/.test(request.url()) && request.method() === 'PUT') writes += 1; });
  await page.clock.install();
  await page.goto('/settings');
  const name = page.getByTestId('input-store-name');
  await expect(name).not.toHaveValue('');
  await name.fill('Unsaved stability audit draft');
  await page.clock.fastForward(30 * 60_000);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(name).toHaveValue('Unsaved stability audit draft');
  expect(writes).toBe(0);
});
