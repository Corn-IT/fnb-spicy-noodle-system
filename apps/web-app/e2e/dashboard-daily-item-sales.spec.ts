import { expect, test } from '@playwright/test';

import { MOCK_SUPER_ADMIN, setupMockApi } from './fixtures/api-mock';
import { auditPageLayout } from './utils/layout-assertions';

function build18DailyItems() {
  const items = [
    {
      productId: 1,
      name: 'Mì Cay Xúc Xích',
      categoryId: 1,
      categoryName: 'Mì Cay 7 Cấp Độ',
      station: 'BEP_NAU',
      qty: 2,
      orderCount: 2,
      revenue: 80000,
      avgUnitPrice: 40000,
      sharePercent: 10.2,
    },
    {
      productId: 2,
      name: 'Bò Nướng Đá Sốt Cay',
      categoryId: 2,
      categoryName: 'Món Nướng',
      station: 'BEP_NUONG',
      qty: 3,
      orderCount: 2,
      revenue: 195000,
      avgUnitPrice: 65000,
      sharePercent: 24.9,
    },
    {
      productId: 3,
      name: 'Combo Mì + Trà',
      categoryId: 3,
      categoryName: 'Combo Tiết Kiệm',
      station: 'COMBO',
      qty: 2,
      orderCount: 2,
      revenue: 160000,
      avgUnitPrice: 80000,
      sharePercent: 20.4,
    },
  ];
  for (let i = 4; i <= 18; i += 1) {
    items.push({
      productId: i,
      name: `Món Bán Kèm ${String(i).padStart(2, '0')}`,
      categoryId: 4,
      categoryName: 'Đồ Uống & Khác',
      station: i % 2 === 0 ? 'PHA_CHE' : 'BEP_CHIEN',
      qty: 1,
      orderCount: 1,
      revenue: 25000,
      avgUnitPrice: 25000,
      sharePercent: 3.2,
    });
  }
  return items;
}

function buildOverviewResponse(blindMode: boolean, fromDate: string, toDate: string) {
  return {
    meta: {
      preset: fromDate === toDate && fromDate === '2026-11-26' ? 'custom' : 'today',
      fromDate,
      toDate,
      previousFromDate: '2026-11-26',
      previousToDate: '2026-11-26',
      generatedAt: '2026-11-27T12:00:00.000Z',
      isTodayIncluded: true,
      scope: {
        canPos: true,
        canInvoices: true,
        canInventory: true,
        canCashflow: !blindMode,
        canPaymentQr: true,
        canDiscounts: true,
        canSchedules: true,
        canPayroll: !blindMode,
        canViewProfit: !blindMode,
      },
    },
    alerts: { pendingQrTables: [], pendingPaymentEdits: [], nearLimitQrAccounts: [] },
    kpis: {
      revenue: blindMode
        ? null
        : {
            netPaidAmount: 785000,
            subtotalAmount: 785000,
            discountAmount: 0,
            paidOrderCount: 12,
            dineInCount: 10,
            takeawayCount: 2,
            qrSourceCount: 4,
            posSourceCount: 8,
            averageOrderValue: 65417,
            previousNetPaidAmount: 700000,
            growthPercent: 12.1,
          },
      cashDrawer: {
        blindMode,
        openingBudget: 1000000,
        totalCashSales: blindMode ? null : 400000,
        cashOnlySales: blindMode ? null : 400000,
        splitCashSales: blindMode ? null : 0,
        totalCashImports: blindMode ? null : 0,
        expectedCashInDrawer: blindMode ? null : 1400000,
        estimatedHandOver: blindMode ? null : 400000,
        latestSettlement: null,
      },
      transfer: {
        totalTransferSales: blindMode ? 0 : 385000,
        transferOnlySales: blindMode ? 0 : 385000,
        splitTransferSales: 0,
        transferOrderCount: 5,
        splitOrderCount: 0,
        sharePercent: 49,
        byAccount: [],
      },
      inventory: blindMode
        ? null
        : {
            totalImportCost: 0,
            cashDrawerImportCost: 0,
            externalImportCost: 0,
            importCount: 0,
            costToRevenuePercent: 0,
          },
      openOrders: {
        totalOpenAmount: 55000,
        occupiedTableCount: 1,
        pendingTableCount: 0,
        availableTableCount: 23,
        totalPhysicalTables: 24,
        takeawayOpenCount: 0,
        unprintedKitchenItemsCount: 0,
      },
      profit: null,
    },
    revenueSeries: null,
    paymentBreakdown: [],
    paymentQrAccounts: [],
    liveTables: null,
    kitchenStations: null,
    topProducts: { items: [], topModifiers: [] },
    discountsAndRisk: null,
    recentInventoryImports: [],
    staffing: null,
    recentInvoices: [],
    recentAuditLogs: [],
  };
}

test.describe('Dashboard Daily Sold Items Statistics', () => {
  test('renders >15 items without truncation, supports search/station/date sync, Excel export, and passes responsive layout audit', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setupMockApi(page);

    const items = build18DailyItems();

    await page.route('**/api/v1/dashboard/**', async (route) => {
      const url = new URL(route.request().url());
      const fromDate = url.searchParams.get('fromDate') ?? '2026-11-27';
      const toDate = url.searchParams.get('toDate') ?? '2026-11-27';

      if (url.pathname.endsWith('/dashboard/daily-item-sales')) {
        if (fromDate === '2026-11-26') {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              meta: {
                preset: 'custom',
                fromDate: '2026-11-26',
                toDate: '2026-11-26',
                generatedAt: '2026-11-27T12:00:00.000Z',
                blindMode: false,
                canViewProfit: true,
                canViewSales: true,
              },
              summary: { totalProductsSold: 0, totalQuantity: 0, totalRevenue: 0, totalOrders: 0 },
              categories: [],
              stations: [],
              items: [],
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            meta: {
              preset: 'today',
              fromDate,
              toDate,
              generatedAt: '2026-11-27T12:00:00.000Z',
              blindMode: false,
              canViewProfit: true,
              canViewSales: true,
            },
            summary: {
              totalProductsSold: 18,
              totalQuantity: 22,
              totalRevenue: 810000,
              totalOrders: 12,
            },
            categories: [
              { id: 1, name: 'Mì Cay 7 Cấp Độ' },
              { id: 2, name: 'Món Nướng' },
              { id: 3, name: 'Combo Tiết Kiệm' },
              { id: 4, name: 'Đồ Uống & Khác' },
            ],
            stations: ['BEP_NAU', 'BEP_NUONG', 'COMBO', 'PHA_CHE', 'BEP_CHIEN'],
            items,
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildOverviewResponse(false, fromDate, toDate)),
      });
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('daily-item-sales-section');
    await expect(section).toBeVisible();
    await expect(section.getByText('Mì Cay Xúc Xích')).toBeVisible();
    await expect(section.getByText('Món Bán Kèm 18')).toBeVisible();
    await expect(page.getByTestId('daily-item-sales-footer')).toContainText('18');
    await expect(page.getByTestId('daily-item-sales-footer')).toContainText('810.000 đ');

    // Accent-insensitive search
    const searchInput = section.getByPlaceholder(/Tìm tên món không dấu/i);
    await searchInput.fill('mi cay xuc xich');
    await searchInput.press('Enter');
    await expect(section.getByText('Mì Cay Xúc Xích')).toBeVisible();
    await expect(section.getByText('Món Bán Kèm 18')).toHaveCount(0);
    await searchInput.fill('');
    await searchInput.press('Enter');

    // Dynamic station filter
    await page.getByTestId('daily-item-sales-station-filter').selectOption('BEP_NUONG');
    await expect(section.getByText('Bò Nướng Đá Sốt Cay')).toBeVisible();
    await expect(section.getByText('Mì Cay Xúc Xích')).toHaveCount(0);
    await page.getByTestId('daily-item-sales-station-filter').selectOption('ALL');

    // Excel export triggers download
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('daily-item-sales-export-btn').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^ThongKe_MonBan_.*\.xlsx$/);

    // Date switch syncs to empty day without NaN
    await page.getByTestId('daily-item-sales-date-input').fill('2026-11-26');
    await expect(
      section.getByText(/Chưa có món nào được thanh toán trong ngày\/kỳ đã chọn/i),
    ).toBeVisible();
    await expect(page.getByTestId('daily-item-sales-footer')).not.toContainText('NaN');

    // Responsive check on Mobile 390x844
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileViolations = await auditPageLayout(page);
    expect(mobileViolations).toEqual([]);
  });

  test('supports error retry recovery and hides revenue columns/totals in Blind Settlement Mode', async ({
    page,
  }) => {
    await setupMockApi(page);
    const cashierUser = {
      ...MOCK_SUPER_ADMIN,
      isSuperAdmin: false,
      permissions: {
        ...MOCK_SUPER_ADMIN.permissions,
        dashboard: { view: true, viewProfit: false, export: false },
      },
    };
    await page.addInitScript((user) => {
      window.localStorage.setItem('fnb-auth', JSON.stringify({ state: { user }, version: 0 }));
    }, cashierUser);
    await page.route('**/api/v1/auth/*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ accessToken: 'cashier-token', user: cashierUser }),
      }),
    );

    let remainingDailyFailures = 3;
    await page.route('**/api/v1/dashboard/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/dashboard/daily-item-sales')) {
        if (remainingDailyFailures > 0) {
          remainingDailyFailures -= 1;
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ statusCode: 500, message: 'Server error' }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            meta: {
              preset: 'today',
              fromDate: '2026-11-27',
              toDate: '2026-11-27',
              generatedAt: '2026-11-27T12:00:00.000Z',
              blindMode: true,
              canViewProfit: false,
              canViewSales: true,
            },
            summary: { totalProductsSold: 1, totalQuantity: 2, totalRevenue: 0, totalOrders: 2 },
            categories: [{ id: 1, name: 'Mì Cay 7 Cấp Độ' }],
            stations: ['BEP_NAU'],
            items: [
              {
                productId: 1,
                name: 'Mì Cay Xúc Xích',
                categoryId: 1,
                categoryName: 'Mì Cay 7 Cấp Độ',
                station: 'BEP_NAU',
                qty: 2,
                orderCount: 2,
                revenue: 0,
                avgUnitPrice: 0,
                sharePercent: 0,
              },
            ],
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildOverviewResponse(true, '2026-11-27', '2026-11-27')),
      });
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    const section = page.getByTestId('daily-item-sales-section');
    await expect(section).toBeVisible();

    // Retry from section error state (after React Query's automatic retry exhausts)
    await section.getByRole('button', { name: /Thử tải lại/i }).click({ timeout: 15000 });
    await expect(section.getByText('Mì Cay Xúc Xích')).toBeVisible();
    await expect(page.getByTestId('daily-item-sales-blind-badge')).toBeVisible();
    await expect(section.getByRole('columnheader', { name: 'Doanh thu' })).toHaveCount(0);
    await expect(page.getByTestId('daily-item-sales-footer')).not.toContainText('Tổng doanh thu món');
    await expect(page.getByTestId('daily-item-sales-export-btn')).toHaveCount(0);
  });
});
