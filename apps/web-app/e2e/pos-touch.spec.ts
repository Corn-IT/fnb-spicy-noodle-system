import { expect, test } from '@playwright/test';

import { setupMockApi } from './fixtures/api-mock';

// Máy POS Android cảm ứng ở quầy: màn ngang 1366×768, thao tác bằng chạm.
test.use({ viewport: { width: 1366, height: 768 }, hasTouch: true });

test.describe('POS cảm ứng toàn màn hình (/pos/touch)', () => {
  test('hides the admin shell and runs table → order → send to kitchen by tapping', async ({
    page,
  }) => {
    await setupMockApi(page);
    const splitKitchenCalls: string[] = [];
    await page.route('**/api/v1/pos/orders/*/split-kitchen', async (route) => {
      splitKitchenCalls.push(new URL(route.request().url()).pathname);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ tickets: [], batchNo: 1, message: 'Không có món mới cần tách' }),
      });
    });

    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-touch-screen')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-pos-touch', 'true');
    await expect(page.getByTestId('navbar-right-controls')).toHaveCount(0);
    await expect(page.getByTestId('touch-table-summary')).toContainText('Trống');

    // Thẻ bàn phải đủ lớn để chạm (>= 96px chiều cao).
    const cardBox = await page.getByTestId('touch-table-card-3').boundingBox();
    expect(cardBox?.height ?? 0).toBeGreaterThanOrEqual(96);

    await page.getByTestId('touch-table-card-1').tap();
    await expect(page.getByTestId('touch-order-screen')).toBeVisible();
    await expect(page.getByTestId('touch-order-title')).toContainText('Bàn 01');

    await page.getByTestId('touch-split-kitchen').tap();
    await expect.poll(() => splitKitchenCalls.length).toBe(1);

    await page.getByTestId('touch-back-to-tables').tap();
    await expect(page.getByTestId('touch-table-board')).toBeVisible();

    await page.getByTestId('touch-table-card-3').tap();
    await expect(page.getByTestId('touch-order-title')).toContainText('Bàn 03');
    const firstProduct = page.locator('[data-testid^="touch-product-"]').first();
    await expect(firstProduct).toBeVisible();
  });

  test('kiosk menu returns to the full /pos screen with the shell', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('touch-kiosk-menu-btn').tap();
    await page.getByTestId('touch-sheet-action-exit').tap();

    await expect(page).toHaveURL(/\/pos$/);
    await expect(page.getByTestId('pos-unified-screen')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-pos-touch', 'true');
  });
});

test.describe('POS cảm ứng — bố cục và kích thước chạm', () => {
  test('ignores the store /pos zoom (150%) so the touch layout is not double-scaled', async ({
    page,
  }) => {
    await setupMockApi(page, {
      storeSettingsOverride: {
        displayScale: { globalPercent: 100, perPath: { '/pos': 150 }, qrOrderPercent: 100 },
      },
    });
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-touch-screen')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom')))
      .toBe('1');

    await page.getByTestId('touch-kiosk-menu-btn').tap();
    await page.getByTestId('touch-sheet-action-exit').tap();
    await expect(page.getByTestId('pos-unified-screen')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--page-zoom')))
      .toBe('1.5');
  });

  test('checkout dialog buttons get touch-sized hit areas (>= 44px)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-table-card-1').tap();
    await page.getByTestId('touch-checkout').tap();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const heights = await dialog
      .locator('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getBoundingClientRect().height));
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(44);
  });
});

test.describe('POS cảm ứng — màn thấp 960×540 (Android DPR 2)', () => {
  test.use({ viewport: { width: 960, height: 540 }, hasTouch: true });

  test('uses the compact cart footer so the item list keeps enough room', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-table-card-1').tap();

    await expect(page.getByTestId('touch-checkout')).toBeInViewport();
    await expect(page.getByTestId('touch-table-action')).toHaveCount(0);
    const listHeight = await page
      .getByTestId('touch-cart-panel')
      .locator('.overflow-y-auto')
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(listHeight).toBeGreaterThan(200);

    // Đổi/Gộp bàn và Giảm giá chuyển vào "Thêm…".
    await page.getByTestId('touch-more-actions').tap();
    await expect(page.getByTestId('touch-sheet-action-table-action')).toBeVisible();
    await expect(page.getByTestId('touch-sheet-action-discount')).toBeVisible();
  });
});

test.describe('POS cảm ứng — điện thoại', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('shows a notice with a way back to the regular POS instead of a broken layout', async ({
    page,
  }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-too-narrow')).toBeVisible();
    await page.getByRole('button', { name: 'Mở POS thường' }).tap();
    await expect(page).toHaveURL(/\/pos$/);
  });
});

test.describe('POS cảm ứng — đơn mang về', () => {
  test.use({ viewport: { width: 1366, height: 768 }, hasTouch: true });

  test('creates a TAKEAWAY order with tableId null from the takeaway tab', async ({ page }) => {
    await setupMockApi(page);
    let createdBody: unknown = null;
    await page.route('**/api/v1/pos/orders', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      createdBody = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 909,
          orderCode: 'HD-20261123-0909',
          orderType: 'TAKEAWAY',
          tableId: null,
          takeawayNumber: 1,
          tableLabel: 'Mang về #01',
          status: 'SERVING',
          totalAmount: 45000,
        }),
      });
    });

    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    // Không còn tab riêng: nút "Mang về mới" luôn có trên thanh trên cùng.
    await page.getByTestId('touch-header-new-takeaway').tap();
    await expect(page.getByTestId('touch-order-title')).toContainText('Mang về');

    const plainProduct = page
      .locator('[data-testid^="touch-product-"]')
      .filter({ hasNotText: 'Có tuỳ chọn' })
      .first();
    await plainProduct.tap();
    await plainProduct.tap();
    await expect(page.locator('[data-testid^="touch-draft-item-"]')).toHaveCount(1);

    await page.getByTestId('touch-submit-draft').tap();
    await expect.poll(() => createdBody).not.toBeNull();
    expect(createdBody).toMatchObject({
      orderType: 'TAKEAWAY',
      tableId: null,
      items: [expect.objectContaining({ quantity: 2 })],
    });
  });
});

test.describe('POS cảm ứng — sơ đồ bàn và mang về trên cùng một màn', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });

  test('shows big table cards, then the takeaway section below with a jump button', async ({
    page,
  }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    const tableBoard = page.getByTestId('touch-table-board');
    const takeawayBoard = page.getByTestId('touch-takeaway-board');
    await expect(tableBoard).toBeVisible();
    await expect(page.getByTestId('touch-new-takeaway')).toBeAttached();

    const tableBox = await tableBoard.boundingBox();
    const takeawayBox = await takeawayBoard.boundingBox();
    expect(takeawayBox!.y).toBeGreaterThan(tableBox!.y + tableBox!.height - 1);

    const card = await page.getByTestId('touch-table-card-3').boundingBox();
    expect(card!.height).toBeGreaterThanOrEqual(140);
    expect(card!.width).toBeGreaterThanOrEqual(180);

    await page.getByTestId('touch-jump-takeaway').tap();
    await expect(page.getByTestId('touch-new-takeaway')).toBeInViewport();
  });
});

test.describe('POS cảm ứng — bố cục số cột theo máy', () => {
  const columnsOf = (page: import('@playwright/test').Page, testId: string, cardPrefix: string) =>
    page.getByTestId(testId).evaluate(
      (grid, prefix) =>
        new Set(
          [...grid.querySelectorAll(`[data-testid^="${prefix}"]`)].map((el) =>
            Math.round(el.getBoundingClientRect().left),
          ),
        ).size,
      cardPrefix,
    );

  test('auto: 6 tables and 4 dishes per row at 1280×720', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-table-card-3')).toBeVisible();
    expect(await columnsOf(page, 'touch-table-grid', 'touch-table-card-')).toBe(6);

    await page.getByTestId('touch-table-card-3').tap();
    await expect(page.getByTestId('touch-menu-grid')).toHaveAttribute('data-columns', '4');
  });

  test('picking 4 tables / 3 dishes applies instantly and survives a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-kiosk-menu-btn').tap();
    await page.getByTestId('touch-sheet-action-layout').tap();
    await page.getByTestId('layout-tables-4').tap();
    await page.getByTestId('layout-menu-3').tap();
    await page.keyboard.press('Escape');
    expect(await columnsOf(page, 'touch-table-grid', 'touch-table-card-')).toBe(4);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-table-card-3')).toBeVisible();
    expect(await columnsOf(page, 'touch-table-grid', 'touch-table-card-')).toBe(4);
    await page.getByTestId('touch-table-card-3').tap();
    await expect(page.getByTestId('touch-menu-grid')).toHaveAttribute('data-columns', '3');
  });

  test('a choice too wide for the screen is reduced with a notice (5 dishes at 960×540)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 540 });
    await setupMockApi(page);
    await page.addInitScript(() =>
      localStorage.setItem('fnb-pos-touch-layout', JSON.stringify({ tableColumns: 'auto', menuColumns: 5 })),
    );
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-table-card-3').tap();
    await expect(page.getByTestId('touch-menu-columns-clamped')).toBeVisible();
    const tileWidth = await page
      .locator('[data-testid^="touch-product-"]')
      .first()
      .evaluate((el) => el.getBoundingClientRect().width);
    expect(tileWidth).toBeGreaterThanOrEqual(130);
  });
});
