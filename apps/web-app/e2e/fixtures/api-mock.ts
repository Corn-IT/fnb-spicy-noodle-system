import { DEFAULT_STORE_SETTINGS } from '@fnb/shared';
import type { Page } from '@playwright/test';

export const MOCK_QR_TOKEN = 'a'.repeat(64);

export const MOCK_SUPER_ADMIN = {
  id: 1,
  employeeId: 1,
  username: 'admin',
  fullName: 'Quản trị viên Hệ thống Mì Cay Hàn Quốc Siêu Dài Để Test Tràn Viền',
  avatarUrl: null,
  isSuperAdmin: true,
  permissions: {
    pos: { view: true, create: true, update: true, delete: true },
    menu: { view: true, create: true, update: true, delete: true },
    discounts: { view: true, create: true, update: true, delete: true },
    invoices: { view: true, create: true, update: true, delete: true },
    cashflow: { view: true, create: true, update: true, delete: true },
    inventory: { view: true, create: true, update: true, delete: true },
    employees: { view: true, create: true, update: true, delete: true },
    schedules: { view: true, create: true, update: true, delete: true },
    payroll: { view: true, create: true, update: true, delete: true },
    mdm: { view: true, create: true, update: true, delete: true },
    rbac: { view: true, create: true, update: true, delete: true },
    settings: { view: true, update: true },
  },
};

export interface MockApiOptions {
  storeSettingsOverride?: Record<string, unknown>;
}

/**
 * Seeds authenticated Super Admin into localStorage and intercepts /api/v1/**
 * with realistic + stress-test data matching @fnb/shared Zod contracts.
 */
export async function setupMockApi(page: Page, options: MockApiOptions = {}): Promise<void> {
  await page.addInitScript((user) => {
    window.localStorage.setItem(
      'fnb-auth',
      JSON.stringify({ state: { user }, version: 0 }),
    );
  }, MOCK_SUPER_ADMIN);

  await page.route('**/socket.io/**', (route) => route.abort());

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

    if (pathname.endsWith('/auth/refresh') || pathname.endsWith('/auth/me')) {
      return json({ accessToken: 'mock-e2e-token', user: MOCK_SUPER_ADMIN });
    }

    if (pathname.includes('/settings/messages') || pathname.endsWith('/store-messages')) {
      return json({ messages: {}, updatedAt: '2026-11-23T06:00:00.000Z' });
    }

    if (
      pathname.endsWith('/settings') ||
      pathname.endsWith('/settings/public') ||
      pathname.endsWith('/public/store-settings')
    ) {
      const baseSettings = {
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: '2026-11-23T06:00:00.000Z',
        assets: { logo: null, favicon: null, qrLogo: null },
        qrMessages: {},
        ...(options.storeSettingsOverride ?? {}),
      };
      return json(baseSettings);
    }

    if (pathname.endsWith('/pos/tables')) {
      const tables = Array.from({ length: 24 }, (_, idx) => ({
        id: idx + 1,
        name: `Bàn ${String(idx + 1).padStart(2, '0')}`,
        qrToken: `${String(idx + 1).padStart(2, '0')}${'a'.repeat(62)}`,
        status: idx === 0 ? 'OCCUPIED' : idx === 1 ? 'PENDING' : 'AVAILABLE',
        activeOrderId: idx === 0 ? 101 : idx === 1 ? 102 : null,
        activeOrder:
          idx === 0
            ? {
                orderId: 101,
                orderCode: 'HD-20261123-0001',
                orderType: 'DINE_IN',
                tableId: 1,
                tableLabel: 'Bàn 01',
                takeawayNumber: null,
                status: 'SERVING',
                subtotalAmount: 299000,
                discountAmount: 0,
                totalAmount: 299000,
                createdAt: '2026-11-23T06:30:00.000Z',
              }
            : null,
      }));
      return json({ tables, takeaways: [], takeawayQrToken: 'b'.repeat(64) });
    }

    if (pathname.endsWith('/pos/drafts') && method === 'GET') {
      return json({ drafts: [] });
    }

    if (/\/pos\/orders\/\d+$/.test(pathname)) {
      return json({
        orderId: 101,
        orderCode: 'HD-20261123-0001',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 1,
        tableLabel: 'Bàn 01',
        takeawayNumber: null,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        subtotalAmount: 299000,
        discountAmount: 0,
        totalAmount: 299000,
        note: null,
        createdAt: '2026-11-23T06:30:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 1001,
            productId: 1,
            categoryId: 1,
            name: 'Mì Cay Hải Sản Thập Cẩm Đặc Biệt Phô Mai Kéo Sợi Tôm Hùm Mini',
            quantity: 2,
            unitPrice: 50000,
            lineTotal: 100000,
            modifiers: ['Cấp độ 2', 'Nấm kim châm (5k)'],
            pricedModifiers: ['Nấm kim châm (5k)'],
            itemNote: 'Không hành',
            batchNo: 1,
            kitchenStatus: 'PRINTED',
          },
          {
            id: 1002,
            productId: 2,
            categoryId: 2,
            name: 'Lẩu Kim Chi Bò Mỹ Nấm Tươi Hàn Quốc Nồi Lớn',
            quantity: 1,
            unitPrice: 199000,
            lineTotal: 199000,
            modifiers: ['Cấp độ 0'],
            pricedModifiers: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'NEW',
          },
        ],
      });
    }

    if (pathname.includes('/menu/categories') || pathname.includes('/mdm/lookup')) {
      return json([
        { id: 1, name: 'Mì Cay 7 Cấp Độ', displayOrder: 1, isActive: true },
        { id: 2, name: 'Lẩu Hàn Quốc', displayOrder: 2, isActive: true },
        { id: 3, name: 'Đồ Uống & Trà Trái Cây', displayOrder: 3, isActive: true },
      ]);
    }

    const mockProducts = [
      {
        id: 1,
        categoryId: 1,
        categoryName: 'Mì Cay 7 Cấp Độ',
        name: 'Mì Cay Hải Sản Thập Cẩm Đặc Biệt Phô Mai Kéo Sợi',
        subtitle: null,
        price: 45000,
        station: 'BEP_NAU',
        isAvailable: true,
        sortOrder: 1,
        imageUrl: null,
        modifierGroups: [],
        comboItems: [],
      },
      {
        id: 2,
        categoryId: 2,
        categoryName: 'Lẩu Hàn Quốc',
        name: 'Lẩu Kim Chi Bò Mỹ Nấm Tươi Hàn Quốc',
        subtitle: null,
        price: 199000,
        station: 'BEP_NAU',
        isAvailable: true,
        sortOrder: 2,
        imageUrl: null,
        modifierGroups: [],
        comboItems: [],
      },
      {
        id: 3,
        categoryId: 3,
        categoryName: 'Đồ Uống',
        name: 'Trà Xoài Sữa Chua Trân Châu Trắng',
        subtitle: null,
        price: 30000,
        station: 'PHA_CHE',
        isAvailable: true,
        sortOrder: 3,
        imageUrl: null,
        modifierGroups: [],
        comboItems: [],
      },
    ];

    if (pathname.endsWith('/public/menu')) {
      return json({
        orderMode: 'DINE_IN',
        table: {
          tableId: 1,
          tableName: 'Bàn 01',
          status: 'AVAILABLE',
          activeOrderId: null,
        },
        categories: [
          { id: 1, code: 'MI_CAY', name: 'Mì Cay 7 Cấp Độ', sortOrder: 1 },
          { id: 2, code: 'LAU_HQ', name: 'Lẩu Hàn Quốc', sortOrder: 2 },
          { id: 3, code: 'DO_UONG', name: 'Đồ Uống', sortOrder: 3 },
        ],
        activeOrder: null,
        products: mockProducts,
        updatedAt: '2026-11-23T06:00:00.000Z',
      });
    }

    if (pathname.includes('/menu/products') || pathname.includes('/pos/menu')) {
      return json(mockProducts);
    }

    if (pathname.includes('/dashboard')) {
      return json({
        kpis: {
          todayRevenue: 12500000,
          todayOrders: 148,
          activeTables: 8,
          totalTables: 24,
          avgOrderValue: 84459,
        },
        hourlyRevenue: [],
        topProducts: [],
        paymentBreakdown: { cash: 7000000, transfer: 5500000 },
        alerts: [],
      });
    }

    if (method === 'GET') {
      return json({ items: [], data: [], total: 0, page: 1, pageSize: 20 });
    }

    return json({ ok: true });
  });
}
