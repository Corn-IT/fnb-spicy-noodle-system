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

  test('creates a TAKEAWAY order with tableId null from the All tab tile', async ({ page }) => {
    await setupMockApi(page);
    let draftBody: Record<string, unknown> | null = null;
    let submitBody: Record<string, unknown> | null = null;
    await page.route('**/api/v1/pos/drafts**', async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === 'POST' && url.pathname === '/api/v1/pos/drafts') {
        draftBody = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ...draftBody,
            id: 'draft-909',
            revision: 1,
            tableName: null,
            createdAt: '2026-11-23T06:00:00.000Z',
            updatedAt: '2026-11-23T06:00:00.000Z',
          }),
        });
        return;
      }
      if (route.request().method() === 'POST' && url.pathname === '/api/v1/pos/drafts/draft-909/submit') {
        submitBody = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            draftId: 'draft-909',
            idempotentReplay: false,
            order: {
              orderId: 909,
              orderCode: 'HD-20261123-0909',
              orderType: 'TAKEAWAY',
              tableId: null,
              takeawayNumber: 1,
              tableLabel: 'Mang về #01',
              status: 'SERVING',
              subtotalAmount: 45000,
              discountAmount: 0,
              totalAmount: 45000,
            },
          }),
        });
        return;
      }
      return route.fallback();
    });

    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-new-takeaway').tap();
    await expect(page.getByTestId('touch-order-title')).toContainText('Mang về');

    const plainProduct = page
      .locator('[data-testid^="touch-product-"]')
      .filter({ hasNotText: 'Có tuỳ chọn' })
      .first();
    await plainProduct.tap();
    await plainProduct.tap();
    await expect(page.locator('[data-testid^="touch-draft-item-"]')).toHaveCount(1);

    await page.getByTestId('touch-submit-draft').tap();
    await expect.poll(() => draftBody).not.toBeNull();
    expect(draftBody).toMatchObject({
      orderType: 'TAKEAWAY',
      tableId: null,
      items: [expect.objectContaining({ quantity: 2 })],
    });
    await expect.poll(() => submitBody).toMatchObject({
      expectedRevision: 1,
      idempotencyKey: expect.any(String),
    });
  });

  test('creates a TAKEAWAY order by tapping the new-order tile in the Takeaway tab', async ({
    page,
  }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('touch-tab-takeaway').tap();
    await page.getByTestId('touch-new-takeaway').tap();

    await expect(page.getByTestId('touch-order-title')).toContainText('Mang về');
  });
});

test.describe('POS cảm ứng — các tab của sơ đồ bàn', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });

  test('shows new takeaway and numbered orders before tables in the All grid', async ({ page }) => {
    await setupMockApi(page);
    await page.route('**/api/v1/pos/tables', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tables: [
            {
              id: 1,
              name: 'Bàn 01',
              qrToken: `01${'a'.repeat(62)}`,
              status: 'AVAILABLE',
              activeOrderId: null,
              activeOrder: null,
            },
            {
              id: 7,
              name: 'Bàn 07',
              qrToken: `07${'a'.repeat(62)}`,
              status: 'AVAILABLE',
              activeOrderId: null,
              activeOrder: null,
            },
          ],
          takeaways: [
            {
              orderId: 802,
              orderCode: 'HD-20261124-0802',
              orderType: 'TAKEAWAY',
              tableId: null,
              tableLabel: null,
              takeawayNumber: 2,
              status: 'SERVING',
              totalAmount: 30000,
              createdAt: '2026-11-24T08:20:00.000Z',
            },
            {
              orderId: 801,
              orderCode: 'HD-20261124-0801',
              orderType: 'TAKEAWAY',
              tableId: null,
              tableLabel: null,
              takeawayNumber: 1,
              status: 'SERVING',
              totalAmount: 45000,
              createdAt: '2026-11-24T08:10:00.000Z',
            },
          ],
          takeawayQrToken: 'b'.repeat(64),
        }),
      });
    });
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('touch-tab-all')).toHaveAttribute('aria-selected', 'true');
    const tableBoard = page.getByTestId('touch-table-board');
    const grid = page.getByTestId('touch-table-grid');
    await expect(tableBoard).toHaveAttribute('data-tab', 'all');
    await expect(grid.locator(':scope > *').first()).toHaveAttribute(
      'data-testid',
      'touch-new-takeaway',
    );
    await expect(page.getByTestId('touch-new-takeaway')).toBeAttached();
    await expect(page.getByTestId('touch-takeaway-card-801')).toContainText('#01');
    await expect(page.getByTestId('touch-takeaway-card-802')).toContainText('#02');

    const takeawayBox = (await page.getByTestId('touch-takeaway-card-801').boundingBox())!;
    const tableBox = (await page.getByTestId('touch-table-card-1').boundingBox())!;
    expect(
      takeawayBox.y < tableBox.y ||
        (Math.abs(takeawayBox.y - tableBox.y) < 1 && takeawayBox.x < tableBox.x),
    ).toBe(true);

    const card = await page.getByTestId('touch-table-card-7').boundingBox();
    expect(card!.height).toBeGreaterThanOrEqual(140);
    expect(card!.width).toBeGreaterThanOrEqual(180);
  });

  test('switches between the Tables and Takeaway tabs', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('touch-tab-tables').tap();
    await expect(page.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'tables');
    await expect(page.getByTestId('touch-new-takeaway')).toHaveCount(0);

    await page.getByTestId('touch-tab-takeaway').tap();
    await expect(page.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'takeaway');
    await expect(page.getByTestId('touch-table-card-1')).toHaveCount(0);
    await expect(page.getByTestId('touch-only-occupied')).toHaveCount(0);
  });

  test('does not overflow the header or viewport at supported touch widths', async ({ page }) => {
    await setupMockApi(page);
    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 820, height: 1180 },
      { width: 960, height: 540 },
      { width: 1024, height: 600 },
      { width: 1280, height: 720 },
      { width: 1920, height: 1080 },
    ]) {
      await page.evaluate(async () => {
        if (document.fullscreenElement) await document.exitFullscreen();
      });
      await page.setViewportSize(viewport);
      const measurements = await page.evaluate(() => {
        const header = document.querySelector('header');
        return {
          headerScrollWidth: header?.scrollWidth ?? 0,
          headerClientWidth: header?.clientWidth ?? 0,
          pageScrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });
      expect(measurements.headerScrollWidth).toBeLessThanOrEqual(measurements.headerClientWidth + 1);
      expect(measurements.pageScrollWidth).toBeLessThanOrEqual(measurements.viewportWidth + 1);
      await expect(page.getByTestId('touch-kiosk-menu-btn')).toBeInViewport();
    }

    await page.setViewportSize({ width: 960, height: 540 });
    await page.getByTestId('touch-tab-all').tap();
    await expect(page.getByTestId('touch-tab-tables')).toContainText('Bàn');
    await expect(page.getByTestId('touch-only-occupied')).toHaveAttribute(
      'aria-label',
      'Bàn có hoá đơn',
    );
  });

  test('opens the saved-drafts tab at the minimum supported width', async ({ page }) => {
    await setupMockApi(page);
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });

    await page.getByTestId('touch-tab-drafts').tap();
    await expect(page.getByTestId('touch-tab-drafts')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'drafts');
    await expect(page.getByTestId('touch-kiosk-menu-btn')).toBeInViewport();
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

test.describe('POS cảm ứng — thông báo không chặn thao tác', () => {
  test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });

  test('a tile under a toast still receives the tap (toasts pass taps through)', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-table-card-3').tap();
    const tiles = page.locator('[data-testid^="touch-product-"]').filter({ hasNotText: 'Có tuỳ chọn' });
    await tiles.first().tap();
    const toast = page.getByTestId('toast-viewport-top-right');
    await page.evaluate(() =>
      import('/src/components/ui/toast.tsx').then((m) =>
        m.toast({ title: 'Thông báo kiểm tra', description: 'Che phía dưới bên trái', duration: 10_000 }),
      ),
    );
    await expect(toast).toBeVisible();
    const box = (await toast.locator('[role="alert"]').first().boundingBox())!;
    // Chạm vào giữa toast (không phải nút X): phần tử nhận chạm phải là thứ nằm bên dưới, không phải toast.
    const hit = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest('[role="alert"]') !== null,
      [box.x + 40, box.y + box.height / 2],
    );
    expect(hit).toBe(false);
  });
});
