import { expect, test } from '@playwright/test';

import { setupMockApi } from './fixtures/api-mock';

test.use({ viewport: { width: 1280, height: 720 }, hasTouch: true });

test.describe('POS Touch Shell & Trung tâm Quản lý kiểu iPOS (/pos/touch/*)', () => {
  test('switches seamlessly between Bán hàng, Hoá đơn, Kết ca, and Quản lý Hub while staying in touch mode', async ({
    page,
  }) => {
    await setupMockApi(page);

    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-touch-screen')).toBeVisible();
    await expect(page.getByTestId('touch-bottom-nav')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-pos-touch', 'true');

    // Nút "Mở két" nằm ngay bên trái icon loa thông báo trên header tab Bán hàng, bấm 1 chạm mở thẳng (không mở confirm dialog).
    const drawerBtn = page.getByTestId('touch-open-cash-drawer');
    const voiceBtn = page.getByTestId('touch-voice-toggle');
    await expect(drawerBtn).toBeVisible();
    const drawerBox = await drawerBtn.boundingBox();
    const voiceBox = await voiceBtn.boundingBox();
    expect(drawerBox).not.toBeNull();
    expect(voiceBox).not.toBeNull();
    expect((drawerBox?.x ?? 0) + (drawerBox?.width ?? 0)).toBeLessThanOrEqual((voiceBox?.x ?? 0) + 1);
    await drawerBtn.tap();
    await expect(page.getByTestId('touch-confirm-dialog')).toHaveCount(0);

    // Chạm mở bàn → thanh đáy tự ẩn để nhường toàn bộ diện tích cho thực đơn & giỏ hàng.
    await page.getByTestId('touch-table-card-1').tap();
    await expect(page.getByTestId('touch-order-screen')).toBeVisible();
    await expect(page.getByTestId('touch-bottom-nav')).toHaveCount(0);

    // Quay về sơ đồ bàn → thanh đáy hiện lại.
    await page.getByTestId('touch-back-to-tables').tap();
    await expect(page.getByTestId('touch-bottom-nav')).toBeVisible();

    // Chuyển sang Hoá đơn ngay trong Touch Shell.
    await page.getByTestId('touch-bottom-nav-invoices').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/invoices$/);
    await expect(page.getByTestId('touch-subpage-header')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-pos-touch', 'true');
    await expect(page.getByTestId('navbar-right-controls')).toHaveCount(0);

    // Chuyển sang Kết ca ngay trong Touch Shell.
    await page.getByTestId('touch-bottom-nav-cashflow').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/cashflow$/);
    await expect(page.getByTestId('touch-subpage-header')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-pos-touch', 'true');

    // Mở Trung tâm Quản lý (Hub kiểu iPOS).
    await page.getByTestId('touch-bottom-nav-hub').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/hub$/);
    await expect(page.getByTestId('touch-hub-page')).toBeVisible();
    await expect(page.getByTestId('touch-hub-tile-stock-status')).toBeVisible();
    await expect(page.getByTestId('touch-hub-tile-printer')).toBeVisible();

    // Quay lại Bán hàng 1 chạm.
    await page.getByTestId('touch-bottom-nav-pos').tap();
    await expect(page).toHaveURL(/\/pos\/touch$/);
    await expect(page.getByTestId('touch-table-board')).toBeVisible();
  });

  test('runs 1-tap out-of-stock toggle and 2-step cash drawer confirmation from Touch Hub', async ({
    page,
  }) => {
    await setupMockApi(page);
    const updatedPayloads: Array<{ url: string; body: unknown }> = [];
    await page.route('**/api/v1/menu/products/*', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        updatedPayloads.push({ url: route.request().url(), body });
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ id: 101, name: 'Mì Cay Hải Sản', isAvailable: false }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto('/pos/touch/hub', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-hub-page')).toBeVisible();

    // 1. Vào Báo hết món nhanh từ Hub.
    await page.getByTestId('touch-hub-tile-stock-status').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/stock-status$/);
    await expect(page.getByTestId('touch-stock-status-page')).toBeVisible();

    const firstCard = page.locator('[data-testid^="touch-stock-card-"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.tap();
    await expect.poll(() => updatedPayloads.length).toBe(1);

    // Quay lại Hub.
    await page.getByTestId('touch-subpage-back').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/hub$/);

    // 2. Vào Máy in & Két tiền → bấm Mở két tiền phải hiện hộp thoại xác nhận 2 bước.
    await page.getByTestId('touch-hub-tile-printer').tap();
    await expect(page).toHaveURL(/\/pos\/touch\/printer$/);
    await expect(page.getByTestId('touch-printer-page')).toBeVisible();

    await page.getByTestId('btn-test-cash-drawer-kick').tap();
    await expect(page.getByTestId('touch-confirm-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Quay lại' }).tap();
    await expect(page.getByTestId('touch-confirm-dialog')).toHaveCount(0);
  });

  test('hides the header Mở két button when account lacks pos.openCashDrawer permission', async ({
    page,
  }) => {
    await setupMockApi(page);
    const cashierNoDrawer = {
      id: 2,
      employeeId: 2,
      username: 'thungan',
      fullName: 'Thu ngân',
      avatarUrl: null,
      isSuperAdmin: false,
      permissions: {
        pos: { view: true, create: true, update: true, checkout: true, openCashDrawer: false },
      },
    };
    await page.addInitScript((user) => {
      window.localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 }));
    }, cashierNoDrawer);
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'cashier-tok', user: cashierNoDrawer }),
      });
    });

    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-touch-screen')).toBeVisible();
    await expect(page.getByTestId('touch-voice-toggle')).toBeVisible();
    await expect(page.getByTestId('touch-open-cash-drawer')).toHaveCount(0);
  });

  test('exits to the matching desktop screen from a touch subpage', async ({ page }) => {
    await setupMockApi(page);
    await page.goto('/pos/touch/invoices', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-subpage-header')).toBeVisible();

    await page.getByTestId('touch-subpage-exit-desktop').tap();
    await expect(page).toHaveURL(/\/invoices$/);
    await expect(page.getByTestId('navbar-right-controls')).toBeVisible();
    await expect(page.locator('html')).not.toHaveAttribute('data-pos-touch', 'true');
  });

  for (const vp of [
    { width: 960, height: 540 },
    { width: 1024, height: 600 },
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    test(`keeps zero horizontal overflow on Touch Hub & Bottom Nav at ${vp.width}×${vp.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(vp);
      await setupMockApi(page);
      await page.goto('/pos/touch/hub', { waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('touch-hub-page')).toBeVisible();
      await expect(page.getByTestId('touch-bottom-nav')).toBeVisible();

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      );
      expect(overflow).toBe(true);
    });
  }
});
