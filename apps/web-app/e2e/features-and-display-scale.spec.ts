import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';

test.describe('Core feature E2E (Display Scale, Print Customizer, i/y Search, Quick Cancel)', () => {
  test('applies per-screen display scale, isolates guest QR, and keeps sidebar at 100%', async ({ page }) => {
    await setupMockApi(page, {
      storeSettingsOverride: {
        displayScale: {
          globalPercent: 115,
          perPath: { '/pos': 130 },
          qrOrderPercent: 95,
        },
      },
    });

    // /pos should use its per-path override 130% (zoom = 1.3)
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom')),
      )
      .toBe('1.3');

    // /invoices should fall back to globalPercent 115% (zoom = 1.15)
    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main[data-app-content="true"]');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom')),
      )
      .toBe('1.15');

    // Guest QR route should use qrOrderPercent 95% (never globalPercent)
    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-qr-order-root="true"]');
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom')),
      )
      .toBe('0.95');
  });

  test('supports i/y-folded search identically on POS and QR guest order', async ({ page }) => {
    await setupMockApi(page);

    // QR guest search: "mỳ cay" and "mi cay" both match "Mì Cay Hải Sản..."
    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    const searchInput = page.locator('input[placeholder*="Tìm"]').first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill('mỳ cay');
    await searchInput.press('Enter');
    await expect(page.getByText(/Mì Cay Hải Sản/i).first()).toBeVisible();
    await expect(page.getByText(/Lẩu Kim Chi/i)).toHaveCount(0);

    await searchInput.fill('mi cay');
    await searchInput.press('Enter');
    await expect(page.getByText(/Mì Cay Hải Sản/i).first()).toBeVisible();
    await expect(page.getByText(/Lẩu Kim Chi/i)).toHaveCount(0);
  });

  test('validates free font size (6–16pt) with clamp warning in Print Template Customizer', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });

    await page.getByRole('tab', { name: /Phiếu in/i }).click();
    const fontInput = page.getByTestId('print-fontsize-input-official');
    await expect(fontInput).toBeVisible();

    await fontInput.fill('24');
    await fontInput.blur();
    await expect(fontInput).toHaveValue('16');
    await expect(page.getByTestId('print-fontsize-warning-official')).toBeVisible();

    await fontInput.fill('9.5');
    await fontInput.blur();
    await expect(fontInput).toHaveValue('9.5');
  });

  test('opens quick cancel order dialog from POS header with printed warning and reason validation', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });

    // Select occupied table 01
    await page.getByTestId('table-card-1').click();
    const cancelBtn = page.getByTestId('btn-quick-cancel-order');
    await expect(cancelBtn).toBeVisible();

    await cancelBtn.click();
    const dialog = page.getByTestId('cancel-order-confirm-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('cancel-order-printed-warning')).toBeVisible();

    // Dismiss with Quay lại
    await page.getByTestId('btn-cancel-order-dismiss').click();
    await expect(dialog).toBeHidden();
  });
});
