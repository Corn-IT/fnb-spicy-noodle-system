import { QueryClient } from '@tanstack/react-query';
import { type DashboardOverviewResponse, UserPermissionsSchema } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RbacRouteGuard } from '@/components/layout/rbac-route-guard';
import { useToastStore } from '@/components/ui/toast';
import { DashboardPage } from '@/features/dashboard';
import {
  formatDashboardDateVi,
  getDashboardCustomRangeError,
} from '@/features/dashboard/api/dashboard.api';
import { DashboardAlertsStrip } from '@/features/dashboard/components/dashboard-alerts-strip';
import { DashboardInsightsRow } from '@/features/dashboard/components/dashboard-insights-row';
import { DashboardKpiGrid } from '@/features/dashboard/components/dashboard-kpi-grid';
import { formatVnd, parseCurrencyValue } from '@/utils/currency';
import { apiClient } from '@/lib/api-client';
import * as excelExportLib from '@/lib/excel-export';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

function makeSuperAdminOverview(): DashboardOverviewResponse {
  return {
    meta: {
      preset: 'today',
      fromDate: '2026-11-17',
      toDate: '2026-11-17',
      previousFromDate: '2026-11-16',
      previousToDate: '2026-11-16',
      generatedAt: '2026-11-17T14:30:00.000Z',
      isTodayIncluded: true,
      scope: {
        canPos: true,
        canInvoices: true,
        canInventory: true,
        canCashflow: true,
        canPaymentQr: true,
        canDiscounts: true,
        canSchedules: true,
        canPayroll: true,
        canViewProfit: true,
      },
    },
    alerts: {
      pendingQrTables: [
        {
          orderId: 201,
          orderCode: 'HD-20261117-0004',
          tableId: 5,
          tableLabel: 'Bàn 05',
          kind: 'NEW',
          totalAmount: 135000,
          pendingSince: '2026-11-17T14:24:00.000Z',
          waitSeconds: 360,
          isOverdue: true,
        },
      ],
      pendingPaymentEdits: [
        {
          orderId: 103,
          orderCode: 'HD-20261117-0003',
          tableLabel: 'Mang về #01',
          totalAmount: 150000,
          currentMethod: 'SPLIT',
          requestedMethod: 'TRANSFER',
          requestedByName: 'Trần Thị Lan',
          requestedAt: '2026-11-17T14:10:00.000Z',
        },
      ],
      nearLimitQrAccounts: [
        {
          id: 1,
          label: 'TK Chính (BIDV)',
          bankCode: 'BIDV',
          accountNo: '8878564012',
          usedDay: 4500000,
          dailyLimit: 5000000,
          dayPercent: 90,
          status: 'AVAILABLE',
        },
      ],
    },
    kpis: {
      revenue: {
        netPaidAmount: 450000,
        subtotalAmount: 470000,
        discountAmount: 20000,
        paidOrderCount: 3,
        dineInCount: 2,
        takeawayCount: 1,
        qrSourceCount: 1,
        posSourceCount: 2,
        averageOrderValue: 150000,
        previousNetPaidAmount: 300000,
        growthPercent: 50,
      },
      cashDrawer: {
        blindMode: false,
        openingBudget: 2000000,
        totalCashSales: 160000,
        cashOnlySales: 100000,
        splitCashSales: 60000,
        totalCashImports: 60000,
        expectedCashInDrawer: 2100000,
        estimatedHandOver: 100000,
        latestSettlement: {
          id: 11,
          settlementDate: '2026-11-16',
          shiftName: 'CA_NGAY',
          status: 'MATCHED',
          discrepancyAmount: 0,
          actualCountedCash: 4500000,
        },
      },
      transfer: {
        totalTransferSales: 290000,
        transferOnlySales: 200000,
        splitTransferSales: 90000,
        transferOrderCount: 1,
        splitOrderCount: 1,
        sharePercent: 64.4,
        byAccount: [
          {
            accountId: 1,
            label: 'TK Chính (BIDV)',
            bankCode: 'BIDV',
            amount: 290000,
            orderCount: 2,
          },
        ],
      },
      inventory: {
        totalImportCost: 410000,
        cashDrawerImportCost: 60000,
        externalImportCost: 350000,
        importCount: 2,
        costToRevenuePercent: 91.1,
      },
      openOrders: {
        totalOpenAmount: 230000,
        occupiedTableCount: 0,
        pendingTableCount: 1,
        availableTableCount: 1,
        totalPhysicalTables: 2,
        takeawayOpenCount: 1,
        unprintedKitchenItemsCount: 2,
      },
      profit: {
        grossProfitAfterInventory: 40000,
        estimatedLaborCost: 2200000,
        netOperatingProfit: -2160000,
        marginPercent: 8.9,
      },
    },
    revenueSeries: {
      granularity: 'hour',
      buckets: [
        {
          key: '14',
          label: '14h',
          cashSales: 160000,
          transferSales: 290000,
          dineInSales: 300000,
          takeawaySales: 150000,
          totalSales: 450000,
          orderCount: 3,
        },
      ],
      peakBucketLabel: '14h',
      peakBucketAmount: 450000,
      peakBucketOrders: 3,
      happyHourAmount: 450000,
      happyHourOrderCount: 3,
    },
    paymentBreakdown: [
      {
        method: 'TRANSFER',
        orderCount: 1,
        totalAmount: 200000,
        cashPortion: 0,
        transferPortion: 200000,
        sharePercent: 44.4,
      },
      {
        method: 'SPLIT',
        orderCount: 1,
        totalAmount: 150000,
        cashPortion: 60000,
        transferPortion: 90000,
        sharePercent: 33.3,
      },
      {
        method: 'CASH',
        orderCount: 1,
        totalAmount: 100000,
        cashPortion: 100000,
        transferPortion: 0,
        sharePercent: 22.2,
      },
    ],
    paymentQrAccounts: [
      {
        id: 1,
        label: 'TK Chính (BIDV)',
        bankCode: 'BIDV',
        bankName: 'BIDV',
        accountNo: '8878564012',
        accountName: 'TRAN VAN HUNG',
        priority: 1,
        isActive: true,
        dailyLimit: 5000000,
        monthlyLimit: 150000000,
        yearlyLimit: null,
        usedDay: 4500000,
        usedMonth: 12000000,
        usedYear: 50000000,
        status: 'AVAILABLE',
        hasOrders: true,
        orderCount: 10,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-17T14:00:00.000Z',
      },
    ],
    liveTables: {
      tables: [
        {
          id: 5,
          name: 'Bàn 05',
          status: 'PENDING',
          activeOrderId: 201,
          activeOrder: {
            orderId: 201,
            orderCode: 'HD-20261117-0004',
            orderType: 'DINE_IN',
            tableId: 5,
            tableLabel: 'Bàn 05',
            takeawayNumber: null,
            status: 'PENDING',
            hasUnprintedAddon: true,
            pendingQrKind: 'NEW',
            pendingQrSince: '2026-11-17T14:24:00.000Z',
            totalAmount: 135000,
            createdAt: '2026-11-17T14:24:00.000Z',
          },
        },
        {
          id: 6,
          name: 'Bàn 06',
          status: 'AVAILABLE',
          activeOrderId: null,
          activeOrder: null,
        },
      ],
      takeaways: [
        {
          orderId: 202,
          orderCode: 'HD-20261117-0005',
          orderType: 'TAKEAWAY',
          tableId: null,
          tableLabel: 'Mang về #02',
          takeawayNumber: 2,
          status: 'SERVING',
          hasUnprintedAddon: true,
          totalAmount: 95000,
          createdAt: '2026-11-17T14:20:00.000Z',
        },
      ],
    },
    kitchenStations: {
      comboDecomposedCount: 2,
      stations: [
        {
          station: 'BEP_NAU',
          label: 'Bếp Nấu',
          printedQty: 5,
          pendingQty: 1,
          cancelledQty: 0,
          revenue: 280000,
          sharePercent: 68,
        },
        {
          station: 'BEP_CHIEN',
          label: 'Bếp Chiên',
          printedQty: 1,
          pendingQty: 0,
          cancelledQty: 0,
          revenue: 70000,
          sharePercent: 17,
        },
        {
          station: 'PHA_CHE',
          label: 'Pha Chế',
          printedQty: 2,
          pendingQty: 0,
          cancelledQty: 0,
          revenue: 80000,
          sharePercent: 15,
        },
      ],
      spiceLevels: [
        { level: 0, label: 'Cấp 0', count: 0 },
        { level: 1, label: 'Cấp 1', count: 2 },
        { level: 2, label: 'Cấp 2', count: 0 },
        { level: 3, label: 'Cấp 3', count: 3 },
        { level: 4, label: 'Cấp 4', count: 0 },
        { level: 5, label: 'Cấp 5', count: 0 },
        { level: 6, label: 'Cấp 6', count: 0 },
        { level: 7, label: 'Cấp 7', count: 0 },
      ],
    },
    topProducts: {
      items: [
        {
          productId: 101,
          name: 'Mì Cay Bò Mỹ',
          categoryName: 'Mì Cay',
          station: 'BEP_NAU',
          qty: 5,
          revenue: 280000,
          sharePercent: 60,
        },
        {
          productId: 103,
          name: 'Trà Đào Cam Sả',
          categoryName: 'Đồ uống',
          station: 'PHA_CHE',
          qty: 2,
          revenue: 70000,
          sharePercent: 40,
        },
      ],
      topModifiers: [{ name: 'Bò Mỹ (10k)', qty: 2, revenue: 20000 }],
    },
    discountsAndRisk: {
      totalDiscountAmount: 20000,
      manualDiscountCount: 1,
      manualDiscountAmount: 20000,
      codeDiscountStats: [
        {
          discountId: 1,
          code: 'GIAM10',
          name: 'Giảm 10%',
          usedCountInPeriod: 1,
          totalDiscountedInPeriod: 10000,
          usageLimit: 100,
          totalUsedCount: 15,
        },
      ],
      voidedOrderCount: 0,
      voidedAmount: 0,
      cancelledPrintedItemCount: 0,
      tableTransferCounts: { move: 1, merge: 0, swap: 0 },
    },
    recentInventoryImports: [
      {
        id: 88,
        itemName: 'Thịt bò Mỹ ba chỉ',
        supplierName: 'NCC An Phú',
        unitName: 'Kg',
        quantity: 2,
        unitPrice: 175000,
        totalCost: 350000,
        paymentSource: 'EXTERNAL',
        importDate: '2026-11-17',
      },
    ],
    staffing: {
      todayDate: '2026-11-17',
      todayWeekdayLabel: 'Thứ 3',
      totalScheduledEmployees: 1,
      shifts: [
        {
          timeSlot: '08:00-14:00',
          employees: [
            {
              id: 2,
              shortName: 'T.Lan',
              fullName: 'Trần Thị Lan',
              specialtyName: 'Thu ngân',
              mode: 'FULL_SHIFT',
            },
          ],
        },
      ],
      payrollSummary: {
        fromDate: '2026-11-17',
        toDate: '2026-11-17',
        totalEmployees: 6,
        totalFullShiftDays: 12,
        totalCustomHours: 8,
        totalSalary: 2200000,
      },
    },
    recentInvoices: [
      {
        orderId: 103,
        orderCode: 'HD-20261117-0003',
        orderType: 'TAKEAWAY',
        tableLabel: null,
        takeawayNumber: 1,
        orderSource: 'POS_COUNTER',
        paymentMethod: 'SPLIT',
        paymentAccountLabel: 'TK Chính (BIDV)',
        discountAmount: 20000,
        totalAmount: 150000,
        paidAt: '2026-11-17T13:55:00.000Z',
      },
    ],
    recentAuditLogs: [
      {
        id: 1,
        module: 'RBAC',
        action: 'Đăng nhập',
        actorId: 1,
        actorFullName: 'Nguyễn Minh Quân',
        actorUsername: 'superadmin',
        summary: 'Đăng nhập hệ thống',
        ipAddress: '10.0.0.1',
        deviceLabel: 'Chrome',
        metadata: {},
        createdAt: '2026-11-17T08:00:00.000Z',
      },
    ],
  };
}

function makeCashierBlindOverview(): DashboardOverviewResponse {
  const base = makeSuperAdminOverview();
  return {
    ...base,
    meta: {
      ...base.meta,
      scope: {
        canPos: true,
        canInvoices: true,
        canInventory: true,
        canCashflow: true,
        canPaymentQr: false,
        canDiscounts: false,
        canSchedules: true,
        canPayroll: false,
        canViewProfit: false,
      },
    },
    kpis: {
      revenue: null,
      cashDrawer: {
        blindMode: true,
        openingBudget: 2000000,
        totalCashSales: null,
        cashOnlySales: null,
        splitCashSales: null,
        totalCashImports: null,
        expectedCashInDrawer: null,
        estimatedHandOver: null,
        latestSettlement: null,
      },
      transfer: null,
      inventory: base.kpis.inventory,
      openOrders: base.kpis.openOrders,
      profit: null,
    },
    revenueSeries: null,
    paymentBreakdown: [],
    paymentQrAccounts: [],
    staffing: base.staffing
      ? {
          ...base.staffing,
          payrollSummary: null,
        }
      : null,
    recentInvoices: [],
    recentAuditLogs: [
      {
        id: 2,
        module: 'POS',
        action: 'Thanh toán đơn',
        actorId: 2,
        actorFullName: 'Trần Thị Lan',
        actorUsername: 'cashier01',
        summary: 'Thanh toán HD-20261117-0003',
        ipAddress: null,
        deviceLabel: null,
        metadata: {},
        createdAt: '2026-11-17T13:55:00.000Z',
      },
    ],
  };
}

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardPage />
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('DashboardPage (/dashboard)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
  });

  it('renders full financial, operational, kitchen combo decomposition, and exports Excel for SuperAdmin', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'superadmin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Nguyễn Minh Quân',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });

    const makeDailySalesMock = (blindMode: boolean) => ({
      meta: {
        preset: 'today' as const,
        fromDate: '2026-11-17',
        toDate: '2026-11-17',
        generatedAt: '2026-11-17T12:00:00.000Z',
        blindMode,
        canViewProfit: !blindMode,
        canViewSales: true,
      },
      summary: {
        totalProductsSold: 1,
        totalQuantity: 2,
        totalRevenue: blindMode ? 0 : 80000,
        totalOrders: 2,
      },
      categories: [{ id: 1, name: 'Mì Cay' }],
      stations: ['BEP_NAU'],
      items: [
        {
          productId: 1,
          name: 'Mì Cay Xúc Xích',
          categoryId: 1,
          categoryName: 'Mì Cay',
          station: 'BEP_NAU' as const,
          qty: 2,
          orderCount: 2,
          revenue: blindMode ? 0 : 80000,
          avgUnitPrice: blindMode ? 0 : 40000,
          sharePercent: blindMode ? 0 : 100,
        },
      ],
    });

    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/daily-item-sales')) return makeDailySalesMock(false);
      return makeSuperAdminOverview();
    });
    const exportSpy = vi.spyOn(excelExportLib, 'exportToExcel').mockImplementation(() => {});

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('kpi-revenue-amount')).toHaveTextContent('450.000');
    });

    expect(screen.getByTestId('kpi-cash-expected')).toHaveTextContent('2.100.000');
    expect(screen.getByTestId('kpi-transfer-amount')).toHaveTextContent('290.000');
    expect(screen.getByTestId('kpi-inventory-cost')).toHaveTextContent('410.000');
    expect(screen.getByTestId('kpi-net-profit')).toHaveTextContent('-2.160.000');
    expect(screen.getByTestId('dashboard-alerts-strip')).toHaveTextContent('Bàn 05');
    expect(screen.getByText(/Đã rã 2 Combo/)).toBeInTheDocument();
    expect(screen.getByTestId('dashboard-payroll-summary')).toHaveTextContent('2.200.000');
    expect(screen.getByTestId('dashboard-audit-logs')).toHaveTextContent('IP 10.0.0.1');

    // Interactive station filter on Top Products
    fireEvent.click(screen.getByRole('button', { name: 'Pha Chế' }));
    expect(screen.getByTestId('dashboard-top-products')).toHaveTextContent('Trà Đào Cam Sả');
    expect(screen.getByTestId('dashboard-top-products')).not.toHaveTextContent('Mì Cay Bò Mỹ');

    // Click occupied table to inspect active order details
    fireEvent.click(screen.getByRole('button', { name: /Bàn 05/ }));
    expect(screen.getByTestId('dashboard-table-inspector')).toHaveTextContent('HD-20261117-0004');

    // Excel export
    fireEvent.click(screen.getByTestId('dashboard-export-btn'));
    expect(exportSpy).toHaveBeenCalledTimes(1);

    // Date preset change triggers API refetch
    fireEvent.click(screen.getByRole('tab', { name: '7 ngày' }));
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/v1/dashboard/overview', {
        params: { preset: '7d' },
      });
    });
  });

  it('enforces Blind Settlement Mode for Cashiers and hides profit, expectedCash, payroll, and RBAC logs', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'cashier01',
        fullName: 'Trần Thị Lan',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          dashboard: { view: true, viewProfit: false, export: false },
          pos: { view: true },
          cashflow: { view: true },
          schedules: { view: true },
        }),
      },
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/daily-item-sales')) {
        return {
          meta: {
            preset: 'today',
            fromDate: '2026-11-17',
            toDate: '2026-11-17',
            generatedAt: '2026-11-17T12:00:00.000Z',
            blindMode: true,
            canViewProfit: false,
            canViewSales: true,
          },
          summary: {
            totalProductsSold: 1,
            totalQuantity: 2,
            totalRevenue: 0,
            totalOrders: 2,
          },
          categories: [{ id: 1, name: 'Mì Cay' }],
          stations: ['BEP_NAU'],
          items: [
            {
              productId: 1,
              name: 'Mì Cay Xúc Xích',
              categoryId: 1,
              categoryName: 'Mì Cay',
              station: 'BEP_NAU',
              qty: 2,
              orderCount: 2,
              revenue: 0,
              avgUnitPrice: 0,
              sharePercent: 0,
            },
          ],
        };
      }
      return makeCashierBlindOverview();
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('dashboard-blind-mode-banner')).toBeInTheDocument();
    });

    expect(screen.getByTestId('kpi-revenue-blind')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-cash-blind')).toBeInTheDocument();
    expect(screen.getByTestId('revenue-series-blind')).toBeInTheDocument();
    expect(screen.queryByTestId('kpi-net-profit')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-payroll-summary')).not.toBeInTheDocument();
    expect(screen.queryByTestId('dashboard-export-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('dashboard-staffing-shifts')).toHaveTextContent('T.Lan');
    expect(screen.getByTestId('dashboard-audit-logs')).not.toHaveTextContent('RBAC');
  });

  it('supports custom date validation, revenue series channel switch, error retry, and RBAC 403 route isolation', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'superadmin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Nguyễn Minh Quân',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });

    let failOnce = true;
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.includes('/daily-item-sales')) {
        return {
          meta: {
            preset: 'today',
            fromDate: '2026-11-17',
            toDate: '2026-11-17',
            generatedAt: '2026-11-17T12:00:00.000Z',
            blindMode: false,
            canViewProfit: true,
            canViewSales: true,
          },
          summary: { totalProductsSold: 0, totalQuantity: 0, totalRevenue: 0, totalOrders: 0 },
          categories: [],
          stations: [],
          items: [],
        };
      }
      if (failOnce) {
        failOnce = false;
        throw new Error('Network unavailable');
      }
      return makeSuperAdminOverview();
    });

    const { unmount } = renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId('error-retry-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('error-retry-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('kpi-revenue-amount')).toHaveTextContent('450.000');
    });

    // Switch chart series legend from Payment Method to Channel (Tại bàn vs Mang về)
    fireEvent.click(screen.getByRole('button', { name: 'Tại bàn vs Mang về' }));
    expect(screen.getByText(/Tại bàn \(DINE_IN\)/)).toBeInTheDocument();
    expect(screen.getByText(/Mang về \(TAKEAWAY\)/)).toBeInTheDocument();

    // Custom date preset shows validation warning when fromDate > toDate and fetches when valid
    fireEvent.click(screen.getByRole('tab', { name: 'Tuỳ chọn' }));
    const fromInput = screen.getByLabelText('Từ ngày');
    const toInput = screen.getByLabelText('Đến ngày');

    fireEvent.change(fromInput, { target: { value: '2026-11-18' } });
    fireEvent.change(toInput, { target: { value: '2026-11-10' } });
    expect(
      screen.getByText(/Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc/i),
    ).toBeInTheDocument();

    fireEvent.change(toInput, { target: { value: '2026-11-20' } });
    await waitFor(() => {
      expect(getSpy).toHaveBeenCalledWith('/api/v1/dashboard/overview', {
        params: { preset: 'custom', fromDate: '2026-11-18', toDate: '2026-11-20' },
      });
    });

    unmount();

    // Verify RbacRouteGuard enforces 403 Forbidden (never redirects to /login) when dashboard.view = false
    useAuthStore.getState().setAuth({
      accessToken: 'restricted-token',
      user: {
        id: 9,
        employeeId: 9,
        username: 'restricted',
        fullName: 'Nhân viên Hạn chế',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          dashboard: { view: false, viewProfit: false, export: false },
          pos: { view: true },
        }),
      },
    });

    const guardClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryProvider client={guardClient}>
        <MemoryRouter
          initialEntries={['/dashboard']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Routes>
            <Route
              path="/dashboard"
              element={
                <RbacRouteGuard module="dashboard">
                  <DashboardPage />
                </RbacRouteGuard>
              }
            />
          </Routes>
        </MemoryRouter>
      </QueryProvider>,
    );

    expect(screen.getByTestId('rbac-forbidden-screen')).toBeInTheDocument();
  });

  it('renders DashboardKpiGrid blind-mode shield, null-permission fallbacks, negative growth, and null profit metrics', () => {
    const base = makeSuperAdminOverview();
    const { rerender } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardKpiGrid
          data={{
            ...base,
            kpis: {
              revenue: null,
              cashDrawer: { ...base.kpis.cashDrawer!, blindMode: true },
              transfer: null,
              inventory: null,
              openOrders: {
                totalOpenAmount: 190000,
                occupiedTableCount: 3,
                pendingTableCount: 1,
                availableTableCount: 16,
                totalPhysicalTables: 20,
                takeawayOpenCount: 2,
                unprintedKitchenItemsCount: 4,
              },
              profit: null,
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('kpi-revenue-blind')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-cash-blind')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-open-tables')).toHaveTextContent('4/20 bàn');
    expect(screen.getByText('4 chờ in')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Vào Kết ca để nhập số thực đếm/i }));
    fireEvent.click(screen.getByRole('button', { name: /Xem trạng thái TK VietQR/i }));

    rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardKpiGrid
          data={{
            ...base,
            kpis: {
              revenue: { ...base.kpis.revenue!, growthPercent: -12.5 },
              cashDrawer: null,
              transfer: { ...base.kpis.transfer!, byAccount: [] },
              inventory: { ...base.kpis.inventory!, costToRevenuePercent: null },
              openOrders: null,
              profit: {
                grossProfitAfterInventory: -50000,
                estimatedLaborCost: null,
                netOperatingProfit: null,
                marginPercent: -5.4,
              },
            },
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Không có quyền xem Quỹ & Kết ca.')).toBeInTheDocument();
    expect(screen.getByText('Chưa phát sinh chuyển khoản')).toBeInTheDocument();
    expect(screen.getByText('Biên -5.4%')).toBeInTheDocument();
    expect(screen.getByText('Chưa cộng trừ quỹ lương kỳ')).toBeInTheDocument();
  });

  it('covers DashboardAlertsStrip empty/overdue/addon/blocked states and currency formatting edge cases', () => {
    const emptyRender = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardAlertsStrip alerts={{ pendingQrTables: [], pendingPaymentEdits: [], nearLimitQrAccounts: [] }} />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId('dashboard-alerts-strip')).not.toBeInTheDocument();
    emptyRender.unmount();

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardAlertsStrip
          alerts={{
            pendingQrTables: [
              {
                orderId: 301,
                orderCode: 'HD-301',
                tableId: 4,
                tableLabel: 'Bàn 04',
                kind: 'ADDON',
                totalAmount: 95000,
                pendingSince: '2026-11-17T14:28:00.000Z',
                waitSeconds: 30,
                isOverdue: false,
              },
            ],
            pendingPaymentEdits: [
              {
                orderId: 302,
                orderCode: 'HD-302',
                tableLabel: 'Mang về #02',
                totalAmount: 65000,
                currentMethod: null,
                requestedMethod: 'CASH',
                requestedByName: 'Lan',
                requestedAt: '2026-11-17T14:25:00.000Z',
              },
            ],
            nearLimitQrAccounts: [
              {
                id: 9,
                label: 'TK Phụ',
                bankCode: 'ACB',
                accountNo: '999999',
                usedDay: 5000000,
                dailyLimit: null,
                dayPercent: null,
                status: 'DAY_FULL',
              },
            ],
          }}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Gọi thêm QR/)).toBeInTheDocument();
    expect(screen.getByText('N/A → CASH')).toBeInTheDocument();
    expect(screen.getByText('DAY_FULL')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Xử lý/i }));
    fireEvent.click(screen.getByRole('button', { name: /Duyệt/i }));
    fireEvent.click(screen.getByRole('button', { name: /Tài khoản/i }));

    expect(parseCurrencyValue('')).toBe(0);
    expect(parseCurrencyValue('00.000')).toBe(0);
    expect(parseCurrencyValue('125.000')).toBe(125000);
    expect(formatVnd(null)).toBe('0 đ');
    expect(formatVnd(Number.NaN)).toBe('0 đ');
    expect(formatVnd('12.5', { withSuffix: false, signed: true })).toContain('+12,5');
    expect(formatVnd(-5000, { signed: true })).toContain('-5.000 đ');

    // DashboardInsightsRow restricted/empty fallbacks & station tab filter
    const base = makeSuperAdminOverview();
    const { rerender } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardInsightsRow
          data={{
            ...base,
            meta: {
              ...base.meta,
              scope: { ...base.meta.scope, canViewProfit: false },
            },
            topProducts: null,
            discountsAndRisk: null,
            staffing: null,
            recentInventoryImports: [],
            recentAuditLogs: [],
          }}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('Không có quyền xem thống kê món bán chạy.')).toBeInTheDocument();

    rerender(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DashboardInsightsRow data={base} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Combo' }));

    expect(formatDashboardDateVi('2026-11-28')).toBe('28/11/2026');
    expect(formatDashboardDateVi('invalid')).toBe('invalid');
    expect(getDashboardCustomRangeError({ preset: 'today' })).toBeNull();
    expect(getDashboardCustomRangeError({ preset: 'custom' })).toBe(
      'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.',
    );
    expect(
      getDashboardCustomRangeError({
        preset: 'custom',
        fromDate: '2026-11-20',
        toDate: '2026-11-10',
      }),
    ).toBeTruthy();
  });
});
