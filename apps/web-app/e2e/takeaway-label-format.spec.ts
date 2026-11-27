import { DEFAULT_STORE_SETTINGS } from '@fnb/shared';
import { expect, test } from '@playwright/test';

import { MOCK_SUPER_ADMIN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

test.describe('Takeaway Label Format (NUMBER vs LETTER custom cycle)', () => {
  test('configures LETTER format in /settings, prints #D/#AA/#E/#EA sequentially, preserves historical snapshot on mid-day switch, and supports table transfer', async ({
    page,
  }) => {
    await setupMockApi(page);

    let activeFormat: 'NUMBER' | 'LETTER' = 'NUMBER';
    const sequenceNumbersQueue = [4, 5, 21, 22, 23];
    const takeaways: Array<{
      orderId: number;
      orderCode: string;
      orderType: 'TAKEAWAY';
      tableId: null;
      tableLabel: string;
      takeawayNumber: number;
      takeawayLabelFormat: 'NUMBER' | 'LETTER';
      status: 'SERVING';
      subtotalAmount: number;
      discountAmount: number;
      totalAmount: number;
      createdAt: string;
    }> = [];
    const ordersById = new Map<number, Record<string, unknown>>();
    const invoicesList: Array<Record<string, unknown>> = [];

    const letterSuffix = (n: number): string => {
      if (n <= 4) return String.fromCharCode(64 + n);
      if (n <= 20) {
        const z = n - 5;
        return String.fromCharCode(65 + Math.floor(z / 4), 65 + (z % 4));
      }
      if (n <= 130) {
        const z = n - 21;
        const block = Math.floor(z / 5);
        const pos = z % 5;
        const prefix = String.fromCharCode(69 + block);
        return pos === 0 ? prefix : `${prefix}${String.fromCharCode(64 + pos)}`;
      }
      return String(n);
    };

    const formatLabel = (num: number, fmt: 'NUMBER' | 'LETTER') =>
      fmt === 'LETTER'
        ? `Mang về #${letterSuffix(num)}`
        : `Mang về #${String(num).padStart(2, '0')}`;

    const putSettingsBodies: Array<Record<string, unknown>> = [];

    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();
      const json = (data: unknown, status = 200) =>
        route.fulfill({
          status,
          contentType: 'application/json',
          body: JSON.stringify(data),
        });

      if (pathname.endsWith('/settings') || pathname.endsWith('/settings/public') || pathname.endsWith('/public/store-settings')) {
        if (method === 'PUT') {
          const body = route.request().postDataJSON() as Record<string, unknown>;
          putSettingsBodies.push(body);
          activeFormat = body.takeawayLabelFormat === 'LETTER' ? 'LETTER' : 'NUMBER';
        }
        return json({
          ...DEFAULT_STORE_SETTINGS,
          takeawayLabelFormat: activeFormat,
          updatedAt: '2026-11-27T08:00:00.000Z',
          assets: { logo: null, favicon: null, qrLogo: null },
          qrMessages: {},
        });
      }

      if (pathname.endsWith('/pos/tables')) {
        const tables = Array.from({ length: 6 }, (_, idx) => ({
          id: idx + 1,
          name: `Bàn ${String(idx + 1).padStart(2, '0')}`,
          qrToken: `ban0${idx + 1}-abcd`,
          status: 'AVAILABLE',
          activeOrderId: null,
          activeOrder: null,
        }));
        return json({ tables, takeaways, takeawayQrToken: 'mangve-abcd' });
      }

      if (pathname.endsWith('/pos/drafts') && method === 'GET') {
        return json({ drafts: [] });
      }
      if (pathname.endsWith('/pos/drafts') && method === 'POST') {
        const body = route.request().postDataJSON() as Record<string, unknown>;
        return json({
          id: 'draft-tk-1',
          revision: 1,
          orderType: body.orderType ?? 'TAKEAWAY',
          tableId: null,
          tableName: null,
          items: body.items ?? [],
          note: null,
          createdAt: '2026-11-27T08:00:00.000Z',
          updatedAt: '2026-11-27T08:00:00.000Z',
        });
      }
      if (/\/pos\/drafts\/[^/]+\/submit$/.test(pathname) && method === 'POST') {
        const num = sequenceNumbersQueue.shift() ?? 100;
        const fmt = activeFormat;
        const label = formatLabel(num, fmt);
        const orderId = 800 + num;
        const orderCode = `HD-20261127-${String(num).padStart(4, '0')}`;
        const createdSummary = {
          orderId,
          orderCode,
          orderType: 'TAKEAWAY' as const,
          tableId: null,
          tableLabel: label,
          takeawayNumber: num,
          takeawayLabelFormat: fmt,
          status: 'SERVING' as const,
          subtotalAmount: 45000,
          discountAmount: 0,
          totalAmount: 45000,
          createdAt: '2026-11-27T08:01:00.000Z',
        };
        takeaways.push(createdSummary);
        const detail = {
          orderId,
          orderCode,
          orderType: 'TAKEAWAY',
          orderSource: 'POS_COUNTER',
          tableId: null,
          tableLabel: label,
          takeawayNumber: num,
          takeawayLabelFormat: fmt,
          status: 'SERVING',
          paymentMethod: null,
          cashAmount: 0,
          transferAmount: 0,
          subtotalAmount: 45000,
          discountAmount: 0,
          totalAmount: 45000,
          note: null,
          createdAt: '2026-11-27T08:01:00.000Z',
          paidAt: null,
          tableTransferLogs: [],
          items: [
            {
              id: 9000 + num,
              productId: 1,
              categoryId: 1,
              name: 'Mì Cay Hải Sản Thập Cẩm Đặc Biệt Phô Mai Kéo Sợi',
              quantity: 1,
              unitPrice: 45000,
              lineTotal: 45000,
              modifiers: [],
              modifierSelections: [],
              itemNote: null,
              batchNo: 1,
              kitchenStatus: 'NEW',
              isTakeaway: false,
            },
          ],
        };
        ordersById.set(orderId, detail);
        invoicesList.push({
          ...createdSummary,
          status: 'PAID',
          orderSource: 'POS_COUNTER',
          paymentMethod: 'CASH',
          cashAmount: 45000,
          transferAmount: 0,
          paidAt: '2026-11-27T08:15:00.000Z',
          pendingPaymentEdit: null,
          note: null,
        });
        return json({
          draftId: 'draft-tk-1',
          idempotentReplay: false,
          order: {
            orderId,
            orderCode,
            orderType: 'TAKEAWAY',
            tableId: null,
            takeawayNumber: num,
            takeawayLabelFormat: fmt,
            tableLabel: label,
            status: 'SERVING',
            subtotalAmount: 45000,
            discountAmount: 0,
            totalAmount: 45000,
          },
        });
      }

      if (/\/pos\/orders\/\d+$/.test(pathname)) {
        const id = Number(pathname.split('/').pop());
        if (ordersById.has(id)) return json(ordersById.get(id));
      }

      if (/\/pos\/orders\/\d+\/split-kitchen$/.test(pathname) && method === 'POST') {
        const id = Number(pathname.match(/\/pos\/orders\/(\d+)\//)?.[1]);
        const detail = ordersById.get(id) as { items: Array<Record<string, unknown>> } | undefined;
        if (detail) {
          detail.items = detail.items.map((it) => ({ ...it, kitchenStatus: 'PRINTED' }));
        }
        return json({
          batchNo: 1,
          tickets: [
            {
              station: 'BEP_NAU',
              stationTitle: 'BẾP NẤU',
              logoType: 'CHEF_HAT_NOODLE',
              batchNo: 1,
              batchLabel: '[LƯỢT 1]',
              items: [{ name: 'Mì Cay Hải Sản', qty: 1, modifiers: [], note: '' }],
            },
          ],
        });
      }

      if (/\/pos\/orders\/\d+\/provisional-bill$/.test(pathname) && method === 'POST') {
        const id = Number(pathname.match(/\/pos\/orders\/(\d+)\//)?.[1]);
        const detail = ordersById.get(id) as Record<string, unknown>;
        return json({
          orderId: id,
          orderCode: detail.orderCode,
          orderType: 'TAKEAWAY',
          tableId: null,
          takeawayNumber: detail.takeawayNumber,
          takeawayLabelFormat: detail.takeawayLabelFormat,
          totalAmount: 45000,
          status: 'SERVING',
          vietQrPayload: 'data:image/png;base64,ZmFrZQ==',
          paymentAccount: {
            id: 1,
            label: 'VPBank',
            bankName: 'VPBank',
            bankCode: 'VPB',
            accountNo: '186877721',
            accountName: 'CHU QUAN',
          },
          qrOverLimit: false,
          qrRotated: false,
          items: [
            {
              name: 'Mì Cay Hải Sản',
              quantity: 1,
              unitPrice: 45000,
              lineTotal: 45000,
              modifiers: [],
              pricedModifiers: [],
              note: null,
            },
          ],
        });
      }

      if (pathname.endsWith('/invoices') && method === 'GET') {
        return json({
          items: invoicesList,
          total: invoicesList.length,
          page: 1,
          limit: 20,
          summary: {
            totalPaidAmount: invoicesList.length * 45000,
            totalCashAmount: invoicesList.length * 45000,
            totalTransferAmount: 0,
            totalDiscountAmount: 0,
            paidCount: invoicesList.length,
          },
        });
      }

      return route.fallback();
    });

    // 1. Switch Store Settings to LETTER
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('takeaway-format-number')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('takeaway-format-letter').click();
    await expect(page.getByTestId('takeaway-format-letter')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('store-settings-save-btn').click();
    await expect.poll(() => putSettingsBodies.length).toBe(1);
    expect(putSettingsBodies[0]).toMatchObject({ takeawayLabelFormat: 'LETTER' });

    const settingsViolations = await auditPageLayout(page);
    expect(settingsViolations).toEqual([]);

    // 2. Create sequential takeaway orders on /pos -> #D (4), #AA (5), #E (21), #EA (22)
    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    for (const expectedLabel of ['Mang về #D', 'Mang về #AA', 'Mang về #E', 'Mang về #EA']) {
      await page.getByTestId('create-takeaway-btn').click();
      await page.getByTestId('pos-quick-add-product-1').click();
      await page.getByTestId('pos-submit-new-order-btn').click();
      await expect(page.getByTestId('invoice-header-label')).toHaveText(expectedLabel);
    }

    // Print kitchen split + provisional VietQR on #EA and verify slips contain MANG VỀ #EA & TT MVEA
    await page.getByTestId('btn-split-kitchen').click();
    await expect.poll(async () => await page.locator('#thermal-print-container').innerText()).toContain(
      'MANG VỀ #EA',
    );
    await page.getByTestId('btn-provisional-bill').click();
    await page.getByTestId('provisional-option-all').click();
    await expect.poll(async () => await page.locator('#thermal-print-container').innerText()).toContain(
      'TT MVEA',
    );

    // 3. Toggle setting back mid-day to NUMBER -> order #23 becomes Mang về #23 while #D/#AA/#E/#EA remain preserved!
    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('takeaway-format-number').click();
    await page.getByTestId('store-settings-save-btn').click();
    await expect.poll(() => putSettingsBodies.length).toBe(2);

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('create-takeaway-btn').click();
    await page.getByTestId('pos-quick-add-product-1').click();
    await page.getByTestId('pos-submit-new-order-btn').click();
    await expect(page.getByTestId('invoice-header-label')).toHaveText('Mang về #23');

    await expect(page.getByTestId('takeaway-card-805')).toContainText('Mang về #AA');
    await expect(page.getByTestId('takeaway-card-821')).toContainText('Mang về #E');
    await expect(page.getByTestId('takeaway-card-823')).toContainText('Mang về #23');

    // Verify invoices page reflects preserved snapshots side by side
    await page.goto('/invoices', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText('Mang về #AA')).toBeVisible();
    await expect(page.getByText('Mang về #23')).toBeVisible();

    // Verify Touch Board also displays #AA and #23 badges accurately
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('touch-takeaway-card-805')).toContainText('#AA');
    await expect(page.getByTestId('touch-takeaway-card-823')).toContainText('#23');
  });

  test('blocks non-settings role from toggling takeaway label format on /settings', async ({ page }) => {
    await setupMockApi(page);
    const nonSettingsUser = {
      ...MOCK_SUPER_ADMIN,
      isSuperAdmin: false,
      permissions: {
        ...MOCK_SUPER_ADMIN.permissions,
        settings: { view: false, update: false },
      },
    };
    await page.addInitScript((user) => {
      window.localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 }));
    }, nonSettingsUser);
    await page.route('**/api/v1/auth/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'cashier-token', user: nonSettingsUser }),
      }),
    );

    await page.goto('/settings', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('takeaway-format-letter')).toHaveCount(0);
  });
});
