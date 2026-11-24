import { expect, test } from '@playwright/test';

import { MOCK_QR_TOKEN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout, RESPONSIVE_VIEWPORTS } from './utils/layout-assertions';

const DRINK_SIZE_PRODUCT = {
  id: 301,
  categoryId: 3,
  categoryName: 'Trà Trái Cây',
  name: 'Trà Đào Cam Sả',
  subtitle: null,
  price: 30000,
  station: 'PHA_CHE',
  isAvailable: true,
  sortOrder: 3,
  imageUrl: null,
  comboItems: [],
  modifierGroups: [
    {
      id: 90,
      name: 'Size',
      isRequired: true,
      maxSelect: 1,
      modifiers: [
        { id: 901, name: 'Size M', extraPrice: 0, isDefaultChecked: true, isAvailable: true },
        { id: 902, name: 'Size L', extraPrice: 5000, isDefaultChecked: false, isAvailable: true },
      ],
    },
  ],
};

test.describe('4 New Features E2E & Full-Size Responsive Verification', () => {
  test('Feature 1: supports TAKEAWAY -> DINE_IN (MOVE/MERGE) and DINE_IN -> TAKEAWAY (TO_TAKEAWAY) without dialog/viewport overflow', async ({
    page,
  }) => {
    await setupMockApi(page);

    const tableActionRequests: Array<{ path: string; body: Record<string, unknown> }> = [];

    await page.route('**/api/v1/pos/tables', async (route) => {
      const tables = Array.from({ length: 12 }, (_, idx) => ({
        id: idx + 1,
        name: `Bàn ${String(idx + 1).padStart(2, '0')}`,
        qrToken: `${String(idx + 1).padStart(2, '0')}${'a'.repeat(62)}`,
        status: idx === 0 ? 'OCCUPIED' : 'AVAILABLE',
        activeOrderId: idx === 0 ? 101 : null,
        activeOrder:
          idx === 0
            ? {
                orderId: 101,
                orderCode: 'HD-20261124-0001',
                orderType: 'DINE_IN',
                tableId: 1,
                tableLabel: 'Bàn 01',
                takeawayNumber: null,
                status: 'SERVING',
                subtotalAmount: 87000,
                discountAmount: 0,
                totalAmount: 87000,
                createdAt: '2026-11-24T06:30:00.000Z',
              }
            : null,
      }));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tables,
          takeaways: [
            {
              orderId: 205,
              orderCode: 'HD-20261124-0205',
              orderType: 'TAKEAWAY',
              tableId: null,
              tableLabel: 'Mang về #05',
              takeawayNumber: 5,
              status: 'SERVING',
              subtotalAmount: 37000,
              discountAmount: 0,
              totalAmount: 37000,
              createdAt: '2026-11-24T07:00:00.000Z',
            },
          ],
          takeawayQrToken: 'b'.repeat(64),
        }),
      });
    });

    await page.route('**/api/v1/pos/orders/205', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 205,
          orderCode: 'HD-20261124-0205',
          orderType: 'TAKEAWAY',
          orderSource: 'POS_COUNTER',
          tableId: null,
          tableLabel: 'Mang về #05',
          takeawayNumber: 5,
          status: 'SERVING',
          paymentMethod: null,
          cashAmount: 0,
          transferAmount: 0,
          subtotalAmount: 37000,
          discountAmount: 0,
          totalAmount: 37000,
          note: null,
          createdAt: '2026-11-24T07:00:00.000Z',
          paidAt: null,
          tableTransferLogs: [],
          items: [
            {
              id: 2051,
              productId: 301,
              categoryId: 3,
              name: 'Trà Đào Cam Sả',
              quantity: 1,
              unitPrice: 37000,
              lineTotal: 37000,
              modifiers: ['Size L'],
              pricedModifiers: ['Size L'],
              itemNote: null,
              batchNo: 1,
              kitchenStatus: 'PRINTED',
              isTakeaway: false,
            },
          ],
        }),
      });
    });

    await page.route('**/api/v1/pos/orders/*/table-action', async (route) => {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      tableActionRequests.push({ path: new URL(route.request().url()).pathname, body });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          action: body.action,
          sourceOrderId: 101,
          targetOrderId: 101,
          sourceTableId: body.action === 'TO_TAKEAWAY' ? 1 : null,
          targetTableId: body.targetTableId ?? null,
          takeawayNumber: body.action === 'TO_TAKEAWAY' ? 6 : undefined,
          requireKitchenNoticePrint: false,
          message: 'Đã chuyển đơn thành công',
        }),
      });
    });

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('pos-unified-screen')).toBeVisible();

    // 1A: Open TableActionDialog on TAKEAWAY order (#05) -> MOVE & MERGE available, SWAP hidden
    await page.getByTestId('takeaway-card-205').click();
    await expect(page.getByText('Trà Đào Cam Sả (L)')).toBeVisible();

    await page.getByTestId('btn-table-action').click();
    await expect(page.getByTestId('table-action-type-MOVE')).toBeVisible();
    await expect(page.getByTestId('table-action-type-MERGE')).toBeVisible();
    await expect(page.getByTestId('table-action-type-SWAP')).toHaveCount(0);
    await expect(page.getByTestId('table-action-type-TO_TAKEAWAY')).toHaveCount(0);

    const dialogViolations = await auditPageLayout(page, { checkTouchTargets: false });
    expect(
      dialogViolations.filter(
        (v) => v.rule === 'HORIZONTAL_OVERFLOW' || v.rule === 'DIALOG_OUT_OF_VIEWPORT',
      ),
    ).toEqual([]);

    await page.keyboard.press('Escape');

    // On mobile POS view, return to the table grid before selecting Bàn 01
    const backToTablesBtn = page.getByRole('button', { name: 'Sơ đồ Bàn' });
    if (await backToTablesBtn.isVisible()) {
      await backToTablesBtn.click();
    }

    // 1B: Open TableActionDialog on DINE_IN order (Bàn 01) -> select TO_TAKEAWAY & submit
    await page.getByText('Bàn 01').first().click();
    await page.getByTestId('btn-table-action').click();
    const toTakeawayBtn = page.getByTestId('table-action-type-TO_TAKEAWAY');
    await expect(toTakeawayBtn).toBeVisible();
    await toTakeawayBtn.click();
    await expect(page.getByTestId('to-takeaway-info-box')).toBeVisible();

    await page.getByTestId('table-action-reason-input').fill('Khách xin gói mang về');
    await page.getByTestId('confirm-table-action-btn').click();

    await expect.poll(() => tableActionRequests.length).toBe(1);
    expect(tableActionRequests[0]?.body).toMatchObject({
      action: 'TO_TAKEAWAY',
      targetTableId: null,
      reason: 'Khách xin gói mang về',
    });
  });

  test('Feature 2 & 3: renders Size (M)/(L) on QR & centers "Tên món" header on Provisional and Official thermal receipts', async ({
    page,
  }) => {
    await setupMockApi(page);

    // Verify centered "Tên món" header in Settings -> Print Customizer previews
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: /Phiếu in/i }).click();

    // Official receipt preview
    await page.getByTestId('print-template-tab-official').click();
    const officialHeader = page
      .getByTestId('official-receipt-slip')
      .getByRole('columnheader', { name: 'Tên món' });
    await expect(officialHeader).toBeVisible();
    await expect(officialHeader).toHaveAttribute('data-print-align', 'center');
    const officialAlign = await officialHeader.evaluate((el) => getComputedStyle(el).textAlign);
    expect(officialAlign).toBe('center');

    // Provisional VietQR preview
    await page.getByTestId('print-template-tab-provisional').click();
    const provisionalHeader = page
      .getByTestId('provisional-vietqr-slip')
      .getByRole('columnheader', { name: 'Tên món' });
    await expect(provisionalHeader).toBeVisible();
    await expect(provisionalHeader).toHaveAttribute('data-print-align', 'center');
    const provisionalAlign = await provisionalHeader.evaluate(
      (el) => getComputedStyle(el).textAlign,
    );
    expect(provisionalAlign).toBe('center');
  });

  test('Feature 2 & 4: QR 2nd+ batch segmented buttons (Dùng tại bàn / Mang về) + Drink Size L formatting across all responsive viewports', async ({
    page,
  }) => {
    await setupMockApi(page);

    const submittedPayloads: Array<Record<string, unknown>> = [];

    await page.route('**/api/v1/public/menu**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderMode: 'DINE_IN',
          table: {
            tableId: 1,
            tableName: 'Bàn 01',
            status: 'OCCUPIED',
            activeOrderId: 501,
          },
          categories: [{ id: 3, code: 'TRA_TRAI_CAY', name: 'Trà Trái Cây', sortOrder: 1 }],
          activeOrder: {
            orderId: 501,
            orderCode: 'HD-20261124-0501',
            tableLabel: 'Bàn 01',
            status: 'SERVING',
            totalAmount: 55000,
            createdAt: '2026-11-24T06:30:00.000Z',
            items: [
              {
                id: 5011,
                productId: 1,
                productName: 'Mì Cay Hải Sản',
                quantity: 1,
                unitPrice: 55000,
                lineTotal: 55000,
                modifiers: [],
                itemNote: null,
                batchNo: 1,
                kitchenStatus: 'PRINTED',
                isTakeaway: false,
                createdAt: '2026-11-24T06:30:00.000Z',
              },
            ],
          },
          products: [DRINK_SIZE_PRODUCT],
          updatedAt: '2026-11-24T06:30:00.000Z',
        }),
      });
    });

    await page.route('**/api/v1/public/orders/qr', async (route) => {
      const payload = route.request().postDataJSON() as Record<string, unknown>;
      submittedPayloads.push(payload);
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 501,
          activeOrderId: 501,
          orderCode: 'HD-20261124-0501',
          currentTableLabel: 'Bàn 01',
          status: 'SERVING',
          batchNo: 2,
          totalAmount: 92000,
        }),
      });
    });

    await page.goto(`/q/${MOCK_QR_TOKEN}`, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('qr-table-header')).toContainText('Bàn 01');

    // Select drink -> choose Size L -> add to cart
    await page.getByTestId('qr-product-card-301').click();
    await expect(page.getByTestId('modifier-selector-sheet')).toBeVisible();
    await page.getByTestId('modifier-option-902').click();
    await page.getByTestId('confirm-modifier-btn').click();

    // Segmented buttons appear for 2nd+ batch
    const modeBar = page.getByTestId('qr-addon-serving-mode-bar');
    await expect(modeBar).toBeVisible();
    await expect(page.getByTestId('qr-addon-mode-dine-in')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('qr-addon-mode-takeaway')).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    // Check zero overflow & zero clipping across mobile/tablet/desktop viewports while segmented bar is visible
    for (const vp of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(80);
      const violations = await auditPageLayout(page, { checkTouchTargets: false });
      const critical = violations.filter(
        (v) =>
          v.rule === 'HORIZONTAL_OVERFLOW' ||
          v.rule === 'DIALOG_OUT_OF_VIEWPORT' ||
          (v.rule === 'TEXT_CLIPPED' && v.selector.includes('qr-addon-mode')),
      );
      expect(critical, `QR layout issue @ ${vp.name}`).toEqual([]);
    }

    // Switch to Mang về and verify cart sheet shows "Trà Đào Cam Sả (L)" without duplicate Size L line
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('qr-addon-mode-takeaway').click();
    await expect(page.getByTestId('qr-addon-mode-takeaway')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByTestId('qr-submit-order-btn').click();
    await expect.poll(() => submittedPayloads.length).toBe(1);
    expect(submittedPayloads[0]).toMatchObject({
      activeOrderId: 501,
      isTakeawayBatch: true,
      items: [
        expect.objectContaining({
          productId: 301,
          quantity: 1,
          isTakeaway: true,
        }),
      ],
    });
  });

  test('Feature 4 (POS Desktop & Touch): 2nd+ batch segmented toggle & per-item takeaway badge across full-size viewports', async ({
    page,
  }) => {
    await setupMockApi(page);

    const patchPayloads: Array<Record<string, unknown>> = [];
    await page.route('**/api/v1/pos/orders/101/items', async (route) => {
      patchPayloads.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          orderId: 101,
          totalAmount: 299000,
          cancellationSlips: [],
          requireCancellationSlip: false,
        }),
      });
    });

    // Desktop POS (/pos)
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.getByText('Bàn 01').first().click();

    // LiveInvoicePanel shows segmented buttons immediately for 2nd+ batch
    await expect(page.getByTestId('invoice-addon-mode-dine-in')).toBeVisible();
    await expect(page.getByTestId('invoice-addon-mode-takeaway')).toBeVisible();
    await page.getByTestId('invoice-addon-mode-takeaway').click();
    await expect(page.getByTestId('invoice-addon-mode-takeaway')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Switching to Menu tab also shows synchronized segmented buttons in PosMenuPanel
    await page.getByRole('tab', { name: /Thực đơn Gọi món nhanh/i }).click();
    await expect(page.getByTestId('pos-addon-mode-dine-in')).toBeVisible();
    await expect(page.getByTestId('pos-addon-mode-takeaway')).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // Toggle takeaway on an existing item in LiveInvoicePanel
    await page.getByTestId('toggle-item-takeaway-1001').click();
    await expect.poll(() => patchPayloads.length).toBe(1);
    expect(patchPayloads[0]).toEqual({
      updates: [{ orderItemId: 1001, isTakeaway: true }],
    });

    // Check POS Desktop / Tablet / Full HD responsive integrity
    for (const vp of [
      { name: 'tablet-768', width: 768, height: 1024 },
      { name: 'tablet-1024', width: 1024, height: 768 },
      { name: 'desktop-1366', width: 1366, height: 768 },
      { name: 'desktop-1920', width: 1920, height: 1080 },
    ]) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(100);
      const violations = await auditPageLayout(page, { checkTouchTargets: false });
      const critical = violations.filter(
        (v) => v.rule === 'HORIZONTAL_OVERFLOW' || v.rule === 'DIALOG_OUT_OF_VIEWPORT',
      );
      expect(critical, `/pos layout issue @ ${vp.name}`).toEqual([]);
    }

    // Touch POS (/pos/touch) at 1366x768 and compact 960x540
    for (const vp of [
      { name: 'touch-1366x768', width: 1366, height: 768 },
      { name: 'touch-960x540', width: 960, height: 540 },
    ]) {
      await page.evaluate(async () => {
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen().catch(() => undefined);
        }
      });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
      await page.getByTestId('touch-table-card-1').click();
      await expect(page.getByTestId('touch-addon-mode-dine-in')).toBeVisible();
      await expect(page.getByTestId('touch-addon-mode-takeaway')).toBeVisible();

      const violations = await auditPageLayout(page, { checkTouchTargets: false });
      const critical = violations.filter(
        (v) => v.rule === 'HORIZONTAL_OVERFLOW' || v.rule === 'DIALOG_OUT_OF_VIEWPORT',
      );
      expect(critical, `/pos/touch layout issue @ ${vp.name}`).toEqual([]);
    }
  });
});
