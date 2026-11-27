import { ErrorCodes } from '@fnb/shared';
import { expect, test } from '@playwright/test';

import { MOCK_SUPER_ADMIN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

const MENU_PRODUCTS = [
  {
    id: 1,
    categoryId: 1,
    categoryName: 'Mì Cay 7 Cấp Độ',
    name: 'Mì Cay Hải Sản',
    subtitle: null,
    price: 55000,
    station: 'BEP_NAU',
    isAvailable: true,
    sortOrder: 1,
    imageUrl: null,
    comboItems: [],
    modifierGroups: [
      {
        id: 10,
        name: 'Cấp độ cay',
        isRequired: true,
        maxSelect: 1,
        modifiers: [
          { id: 101, name: 'Cấp 1', extraPrice: 0, isDefaultChecked: true, isAvailable: true },
          { id: 103, name: 'Cấp 3', extraPrice: 0, isDefaultChecked: false, isAvailable: true },
          { id: 107, name: 'Cấp 7', extraPrice: 0, isDefaultChecked: false, isAvailable: true },
        ],
      },
      {
        id: 20,
        name: 'Thêm Topping',
        isRequired: false,
        maxSelect: 5,
        modifiers: [
          { id: 201, name: 'Thêm Bò Mỹ', extraPrice: 20000, isDefaultChecked: false, isAvailable: true },
          { id: 202, name: 'Nấm Kim Châm (Tạm hết)', extraPrice: 10000, isDefaultChecked: false, isAvailable: false },
        ],
      },
    ],
  },
  {
    id: 2,
    categoryId: 2,
    categoryName: 'Đồ Uống',
    name: 'Trà Đào Cam Sả',
    subtitle: null,
    price: 30000,
    station: 'PHA_CHE',
    isAvailable: true,
    sortOrder: 2,
    imageUrl: null,
    comboItems: [],
    modifierGroups: [],
  },
];

function setupEditOrderRoutes(
  page: Parameters<typeof setupMockApi>[0],
  options: { simulate409OnSave?: boolean } = {},
) {
  let activeOrder: Record<string, unknown> = {
    orderId: 503,
    orderCode: 'HD-20261127-0503',
    orderType: 'DINE_IN',
    orderSource: 'POS_COUNTER',
    tableId: 3,
    tableLabel: 'Bàn 03',
    takeawayNumber: null,
    takeawayLabelFormat: null,
    status: 'SERVING',
    paymentMethod: null,
    cashAmount: 0,
    transferAmount: 0,
    subtotalAmount: 85000,
    discountAmount: 0,
    totalAmount: 85000,
    note: null,
    createdAt: '2026-11-27T04:00:00.000Z',
    paidAt: null,
    tableTransferLogs: [],
    items: [
      {
        id: 7001,
        productId: 1,
        name: 'Mì Cay Hải Sản',
        quantity: 1,
        unitPrice: 55000,
        lineTotal: 55000,
        modifiers: ['Cấp 1'],
        modifierSelections: [{ groupId: 10, modifierId: 101 }],
        itemNote: null,
        batchNo: 1,
        kitchenStatus: 'NEW',
        isTakeaway: false,
      },
      {
        id: 7002,
        productId: 2,
        name: 'Trà Đào Cam Sả',
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 30000,
        modifiers: [],
        modifierSelections: [],
        itemNote: null,
        batchNo: 1,
        kitchenStatus: 'NEW',
        isTakeaway: false,
      },
      {
        id: 7003,
        productId: 2,
        name: 'Trà Đào Cam Sả',
        quantity: 1,
        unitPrice: 30000,
        lineTotal: 0,
        modifiers: [],
        modifierSelections: [],
        itemNote: null,
        batchNo: 1,
        kitchenStatus: 'CANCELLED',
        isTakeaway: false,
      },
    ],
  };

  const patchBodies: Array<Record<string, unknown>> = [];

  const install = async () => {
    await setupMockApi(page);
    await page.route('**/api/v1/**', async (route) => {
      const url = new URL(route.request().url());
      const pathname = url.pathname;
      const method = route.request().method();
      const json = (data: unknown, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });

      if (pathname.includes('/menu/products') || pathname.includes('/pos/menu')) {
        return json(MENU_PRODUCTS);
      }
      if (pathname.endsWith('/pos/tables')) {
        const tables = Array.from({ length: 6 }, (_, idx) => ({
          id: idx + 1,
          name: `Bàn ${String(idx + 1).padStart(2, '0')}`,
          qrToken: `ban0${idx + 1}-abcd`,
          status: idx + 1 === 3 ? 'OCCUPIED' : 'AVAILABLE',
          activeOrderId: idx + 1 === 3 ? 503 : null,
          activeOrder:
            idx + 1 === 3
              ? {
                  orderId: 503,
                  orderCode: 'HD-20261127-0503',
                  orderType: 'DINE_IN',
                  tableId: 3,
                  tableLabel: 'Bàn 03',
                  takeawayNumber: null,
                  status: 'SERVING',
                  totalAmount: activeOrder.totalAmount,
                  createdAt: '2026-11-27T04:00:00.000Z',
                }
              : null,
        }));
        return json({ tables, takeaways: [], takeawayQrToken: 'mangve-abcd' });
      }
      if (pathname.endsWith('/pos/orders/503') && method === 'GET') {
        return json(activeOrder);
      }
      if (pathname.endsWith('/pos/orders/503/items') && method === 'PATCH') {
        const body = route.request().postDataJSON() as { updates?: Array<Record<string, unknown>> };
        patchBodies.push(body);
        const upd = body.updates?.[0];

        if (options.simulate409OnSave && upd?.expectedKitchenStatus === 'NEW') {
          const items = (activeOrder.items as Array<Record<string, unknown>>).map((it) =>
            it.id === 7001 ? { ...it, kitchenStatus: 'PRINTED' } : it,
          );
          activeOrder = { ...activeOrder, items };
          return json(
            {
              statusCode: 409,
              error: 'Conflict',
              code: ErrorCodes.POS_ITEM_ALREADY_PRINTED,
              message: 'Món đã tách bếp nên không thể chỉnh sửa tuỳ chọn.',
              details: null,
              requestId: 'e2e-409',
            },
            409,
          );
        }

        if (upd) {
          const items = (activeOrder.items as Array<Record<string, unknown>>).map((it) => {
            if (it.id !== upd.orderItemId) return it;
            const nextQty = Number(upd.quantity ?? it.quantity);
            const nextMods = Array.isArray(upd.modifiers)
              ? (upd.modifiers as Array<{ groupId: number; modifierId: number }>).map((sel) => {
                  const prod = MENU_PRODUCTS.find((p) => p.id === it.productId);
                  const mod = prod?.modifierGroups
                    .flatMap((g) => g.modifiers)
                    .find((m) => m.id === sel.modifierId);
                  return { name: mod?.name ?? '', extraPrice: mod?.extraPrice ?? 0, sel };
                })
              : null;
            const extra = nextMods ? nextMods.reduce((s, m) => s + m.extraPrice, 0) : 0;
            const prod = MENU_PRODUCTS.find((p) => p.id === it.productId)!;
            const nextUnit = nextMods ? prod.price + extra : Number(it.unitPrice);
            return {
              ...it,
              quantity: nextQty,
              unitPrice: nextUnit,
              lineTotal: nextUnit * nextQty,
              modifiers: nextMods ? nextMods.map((m) => m.name) : it.modifiers,
              modifierSelections: nextMods ? nextMods.map((m) => m.sel) : it.modifierSelections,
              itemNote: upd.itemNote !== undefined ? upd.itemNote : it.itemNote,
              isTakeaway: upd.isTakeaway !== undefined ? upd.isTakeaway : it.isTakeaway,
            };
          });
          const nextTotal = items.reduce(
            (sum, it) => (it.kitchenStatus === 'CANCELLED' ? sum : sum + Number(it.lineTotal)),
            0,
          );
          activeOrder = {
            ...activeOrder,
            items,
            subtotalAmount: nextTotal,
            totalAmount: nextTotal,
          };
        }
        return json({
          orderId: 503,
          totalAmount: activeOrder.totalAmount,
          requireCancellationSlip: false,
          kitchenCancellationSlips: [],
        });
      }
      if (pathname.endsWith('/pos/orders/503/split-kitchen') && method === 'POST') {
        const items = (activeOrder.items as Array<Record<string, unknown>>).map((it) =>
          it.kitchenStatus === 'NEW' ? { ...it, kitchenStatus: 'PRINTED' } : it,
        );
        activeOrder = { ...activeOrder, items };
        return json({ batchNo: 1, tickets: [] });
      }
      return route.fallback();
    });
  };

  return { install, patchBodies };
}

test.describe('Direct Click-to-Edit Order Item (Desktop + Touch + 409 Race + RBAC)', () => {
  test('edits draft item & NEW live items directly, skips quick buttons, locks after split-kitchen, and passes layout audit on Desktop /pos', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const mock = setupEditOrderRoutes(page);
    await mock.install();

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });

    // 1. Draft item edit on empty table 01
    await page.getByTestId('table-card-1').click();
    await page.getByTestId('pos-menu-product-1').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();
    await page.getByTestId('pos-confirm-modifier-btn').click();
    await expect(page.getByTestId('draft-item-0')).toBeVisible();

    // Quick "+" does NOT open edit dialog
    await page.getByRole('button', { name: 'Tăng số lượng Mì Cay Hải Sản' }).click();
    await expect(page.getByTestId('pos-modifier-modal')).toHaveCount(0);

    // Click draft item text -> opens modal pre-populated, change Cấp 3 + Bò Mỹ + note "Không hành"
    await page.getByTestId('edit-draft-item-0').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();
    await expect(page.getByTestId('pos-modal-edit-badge')).toHaveText('Chỉnh sửa món');
    await page.getByTestId('pos-mod-option-103').click();
    await page.getByTestId('pos-mod-option-201').click();
    await page.getByTestId('pos-item-note-input').fill('Không hành');
    await page.getByTestId('pos-confirm-modifier-btn').click();
    await expect(page.getByTestId('draft-item-0')).toContainText('Cấp 3');
    await expect(page.getByTestId('draft-item-0')).toContainText('Thêm Bò Mỹ');
    await expect(page.getByTestId('draft-item-0')).toContainText('Ghi chú: Không hành');

    // Discard local draft cleanly before opening live Bàn 03
    await page.getByTestId('pos-discard-draft-btn').click();
    await page.getByTestId('confirm-discard-draft').click();

    // 2. Open Bàn 03 live order with NEW & CANCELLED items
    await page.getByTestId('table-card-3').click();
    await expect(page.getByTestId('invoice-item-7001')).toBeVisible();
    await expect(page.getByTestId('edit-new-item-7003')).toHaveCount(0); // CANCELLED cannot be edited

    // Verify clean desktop layout before transient toast notifications overlap corner buttons
    const posViolations = await auditPageLayout(page);
    expect(posViolations).toEqual([]);

    // Toggle + Mang về does NOT open edit dialog
    await page.getByTestId('toggle-item-takeaway-7001').click();
    await expect(page.getByTestId('pos-modifier-modal')).toHaveCount(0);
    await expect(page.getByTestId('invoice-item-takeaway-badge-7001')).toBeVisible();

    // Edit NEW Mì Cay Hải Sản (7001) to Cấp 7 + Bò Mỹ + note
    await page.getByTestId('edit-new-item-7001').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();
    await page.getByTestId('pos-mod-option-107').click();
    await page.getByTestId('pos-mod-option-201').click();
    await page.getByTestId('pos-item-note-input').fill('Không sa tế');
    await page.getByTestId('pos-confirm-modifier-btn').click();

    await expect(page.getByTestId('invoice-item-7001')).toContainText('Cấp 7');
    await expect(page.getByTestId('invoice-item-7001')).toContainText('Thêm Bò Mỹ');
    await expect(page.getByTestId('invoice-item-7001')).toContainText('75.000 đ');

    // Edit zero-modifier Trà Đào Cam Sả (7002) to add note
    await page.getByTestId('edit-new-item-7002').click();
    await expect(page.getByText(/chưa cấu hình tuỳ chọn thêm/i)).toBeVisible();
    await page.getByTestId('pos-item-note-input').fill('Ít đá');
    await page.getByTestId('pos-confirm-modifier-btn').click();
    await expect(page.getByTestId('invoice-item-7002')).toContainText('Ghi chú: Ít đá');

    // Split kitchen -> becomes PRINTED, edit trigger removed
    await page.getByTestId('btn-split-kitchen').click();
    await expect(page.getByTestId('edit-new-item-7001')).toHaveCount(0);
    await expect(page.getByTestId('invoice-item-7001')).toContainText('Đã in bếp');
  });

  test('handles 409 POS_ITEM_ALREADY_PRINTED concurrency conflict and blocks readonly users on /pos & /pos/touch', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    const mock = setupEditOrderRoutes(page, { simulate409OnSave: true });
    await mock.install();

    // Test Touch POS edit + 409 conflict
    await page.goto('/pos/touch', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('touch-table-card-3').click();
    await expect(page.getByTestId('touch-edit-item-7001')).toBeVisible();

    await page.getByTestId('touch-edit-item-7001').click();
    await expect(page.getByTestId('pos-modifier-modal')).toBeVisible();
    await page.getByTestId('pos-mod-option-103').click();
    await page.getByTestId('pos-confirm-modifier-btn').click();

    // 409 closes modal cleanly, shows toast, and refreshes item as PRINTED without edit button
    await expect(page.getByTestId('pos-modifier-modal')).toHaveCount(0);
    await expect(page.getByText(/đã tách bếp/i).first()).toBeVisible();
    await expect(page.getByTestId('touch-edit-item-7001')).toHaveCount(0);

    // Readonly cashier without pos:update cannot see edit button on NEW item 7002
    const readonlyUser = {
      ...MOCK_SUPER_ADMIN,
      isSuperAdmin: false,
      permissions: {
        ...MOCK_SUPER_ADMIN.permissions,
        pos: { view: true, create: false, update: false, delete: false },
      },
    };
    await page.addInitScript((user) => {
      window.localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 }));
    }, readonlyUser);
    await page.route('**/api/v1/auth/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'readonly-token', user: readonlyUser }),
      }),
    );

    await page.goto('/pos', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('table-card-3').click();
    await expect(page.getByTestId('invoice-item-7002')).toBeVisible();
    await expect(page.getByTestId('edit-new-item-7002')).toHaveCount(0);
  });
});
