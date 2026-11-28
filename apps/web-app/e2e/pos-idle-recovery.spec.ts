// Post-fix regression checks; historical screenshots and observations remain in evidence/.
import { expect, test } from '@playwright/test';
import { setupMockApi } from './fixtures/api-mock';
import { writeFile } from 'node:fs/promises';

test.use({ viewport: { width: 1366, height: 768 }, hasTouch: true });

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

test('unsent cart quantities and notes survive polling failures and explicit submit sends once', async ({ page }) => {
  await setupMockApi(page);
  await page.clock.install();
  let writes = 0;
  let saved: Record<string, unknown> | null = null;
  let submitCount = 0;
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/v1\/pos\/(orders|drafts)/.test(request.url())) writes += 1;
  });
  await page.route('**/api/v1/pos/drafts**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/pos/drafts') {
      saved = request.postDataJSON();
      return route.fulfill({ json: { ...saved, id: 'idle-draft', revision: 1, tableName: null, createdAt: '2026-11-28T06:00:00.000Z', updatedAt: '2026-11-28T06:00:00.000Z' } });
    }
    if (request.method() === 'POST' && path.endsWith('/submit')) {
      submitCount += 1;
      return route.fulfill({ json: { draftId: 'idle-draft', idempotentReplay: false, order: { orderId: 909, orderCode: 'HD-20261128-0909', orderType: 'TAKEAWAY', tableId: null, takeawayNumber: 1, tableLabel: 'Mang về #01', status: 'SERVING', subtotalAmount: 90000, discountAmount: 0, totalAmount: 90000 } } });
    }
    return route.fallback();
  });
  await page.goto('/pos/touch');
  await page.getByTestId('touch-new-takeaway').tap();
  const product = page.locator('[data-testid^="touch-product-"]').filter({ hasNotText: 'Có tuỳ chọn' }).first();
  await product.tap(); await product.tap();
  await page.getByTestId('touch-edit-draft-item-0').tap();
  await page.getByTestId('pos-item-note-input').fill('Giữ ghi chú sau mất mạng');
  await page.getByTestId('pos-confirm-modifier-btn').tap();
  let failures = 0;
  await page.route('**/api/v1/pos/tables', (route) => { failures += 1; return route.fulfill({ status: 503, json: { message: 'Outage' } }); });
  for (const minutes of [15, 15, 90]) {
    await page.clock.fastForward(minutes * 60_000);
    await expect(page.getByTestId('touch-draft-item-0')).toContainText('Giữ ghi chú sau mất mạng');
    await expect(page.getByTestId('touch-draft-item-0').getByText('2', { exact: true })).toBeVisible();
  }
  await expect.poll(() => failures).toBeGreaterThan(0);
  expect(writes).toBe(0);
  await page.unroute('**/api/v1/pos/tables');
  await page.clock.runFor(26_000);
  await page.getByTestId('touch-submit-draft').tap();
  await expect.poll(() => submitCount).toBe(1);
  expect(saved).toMatchObject({ items: [expect.objectContaining({ quantity: 2, itemNote: 'Giữ ghi chú sau mất mạng' })] });
  expect(writes).toBe(2); // One draft save and one explicit submit.
});

test('open order survives failed polling and kitchen/checkout run only after explicit actions', async ({ page }) => {
  await setupMockApi(page);
  await page.clock.install();
  let kitchen = 0;
  let checkout = 0;
  await page.route('**/api/v1/pos/orders/*/split-kitchen', (route) => { kitchen += 1; return route.fulfill({ json: { tickets: [], batchNo: 1, message: 'Không có món mới cần tách' } }); });
  await page.route('**/api/v1/pos/orders/*/checkout', (route) => { checkout += 1; return route.fulfill({ json: { orderId: 101, status: 'PAID', paidAt: '2026-11-28T06:00:00.000Z' } }); });
  await page.goto('/pos/touch');
  await page.getByTestId('touch-table-card-1').tap();
  await expect(page.getByTestId('touch-cart-panel')).toContainText('Không hành');
  await page.route('**/api/v1/pos/tables', (route) => route.abort('internetdisconnected'));
  await page.clock.fastForward(30 * 60_000);
  await expect(page.getByTestId('touch-cart-panel')).toContainText('Không hành');
  expect(kitchen).toBe(0); expect(checkout).toBe(0);
  await page.unroute('**/api/v1/pos/tables');
  await page.clock.runFor(26_000);
  await page.getByTestId('touch-split-kitchen').tap();
  await expect.poll(() => kitchen).toBe(1);
  await page.getByTestId('touch-checkout').tap();
  expect(checkout).toBe(0);
  await page.getByTestId('checkout-confirm-noprint-btn').tap();
  await expect.poll(() => checkout).toBe(1);
  await page.clock.fastForward(120 * 60_000);
  expect(kitchen).toBe(1); expect(checkout).toBe(1);
});

test('initial table error shows retry and recovers without a false empty screen', async ({ page }) => {
  await setupMockApi(page);
  let fail = true;
  await page.route('**/api/v1/pos/tables', (route) => fail ? route.fulfill({ status: 503, json: { message: 'Outage' } }) : route.fallback());
  await page.goto('/pos/touch');
  await expect(page.getByTestId('system-error-view').first()).toBeVisible();
  await expect(page.getByText('Chưa cấu hình bàn nào', { exact: true })).toHaveCount(0);
  fail = false;
  await page.getByTestId('error-retry-btn').first().tap();
  await expect(page.getByTestId('touch-table-card-1')).toBeVisible();
});
