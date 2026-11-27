import { QueryClient } from '@tanstack/react-query';
import {
  UserPermissionsSchema,
  type DashboardDailyItemSalesResponse,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import * as excelExport from '@/lib/excel-export';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { DailyItemSalesSection } from '../components/daily-item-sales-section';

function makeDailySalesResponse(
  overrides: Partial<DashboardDailyItemSalesResponse> = {},
): DashboardDailyItemSalesResponse {
  return {
    meta: {
      preset: 'today',
      fromDate: '2026-11-27',
      toDate: '2026-11-27',
      generatedAt: '2026-11-27T12:00:00.000Z',
      blindMode: false,
      canViewProfit: true,
      canViewSales: true,
    },
    summary: {
      totalProductsSold: 3,
      totalQuantity: 7,
      totalRevenue: 295000,
      totalOrders: 4,
    },
    categories: [
      { id: 10, name: 'Mì Cay' },
      { id: 20, name: 'Đồ Uống' },
      { id: 30, name: 'Ăn Vặt' },
    ],
    stations: ['BEP_NAU', 'PHA_CHE', 'BEP_CHIEN'],
    items: [
      {
        productId: 1,
        name: 'Mì Cay Xúc Xích',
        categoryId: 10,
        categoryName: 'Mì Cay',
        station: 'BEP_NAU',
        qty: 2,
        orderCount: 2,
        revenue: 80000,
        avgUnitPrice: 40000,
        sharePercent: 27.1,
      },
      {
        productId: 2,
        name: 'Mì Kim Chi Hải Sản',
        categoryId: 10,
        categoryName: 'Mì Cay',
        station: 'BEP_NAU',
        qty: 3,
        orderCount: 2,
        revenue: 165000,
        avgUnitPrice: 55000,
        sharePercent: 55.9,
      },
      {
        productId: 3,
        name: 'Trà Đào Cam Sả',
        categoryId: 20,
        categoryName: 'Đồ Uống',
        station: 'PHA_CHE',
        qty: 2,
        orderCount: 1,
        revenue: 50000,
        avgUnitPrice: 25000,
        sharePercent: 16.9,
      },
    ],
    ...overrides,
  };
}

function renderSection(props: Partial<React.ComponentProps<typeof DailyItemSalesSection>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const onFilterChange = vi.fn();
  const utils = render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <DailyItemSalesSection
          filter={{ preset: 'today', fromDate: '2026-11-27', toDate: '2026-11-27' }}
          onFilterChange={onFilterChange}
          canExport={true}
          todayIso="2026-11-27"
          {...props}
        />
      </MemoryRouter>
    </QueryProvider>,
  );
  return { ...utils, onFilterChange, queryClient };
}

describe('DailyItemSalesSection (Thống kê món bán được trong ngày)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({
          dashboard: { view: true, viewProfit: true, export: true },
        }),
      },
    });
  });

  it('renders sold items summary, supports station/category/accent-insensitive search filters, quick date picker, and exports Excel', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(makeDailySalesResponse());
    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});

    const { onFilterChange } = renderSection();

    expect(await screen.findByText('Mì Cay Xúc Xích')).toBeInTheDocument();
    expect(screen.getByText('Mì Kim Chi Hải Sản')).toBeInTheDocument();
    expect(screen.getByText('Trà Đào Cam Sả')).toBeInTheDocument();

    const footer = screen.getByTestId('daily-item-sales-footer');
    expect(footer).toHaveTextContent('3');
    expect(footer).toHaveTextContent('7');
    expect(footer).toHaveTextContent('295.000 đ');

    // Accent-insensitive search (BaseTable commits on Enter)
    const searchInput = screen.getByPlaceholderText(/Tìm tên món không dấu/i);
    fireEvent.change(searchInput, { target: { value: 'mi cay xuc xich' } });
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });
    await waitFor(() => {
      expect(screen.getByText('Mì Cay Xúc Xích')).toBeInTheDocument();
      expect(screen.queryByText('Trà Đào Cam Sả')).not.toBeInTheDocument();
    });
    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

    // Station filter
    fireEvent.change(screen.getByTestId('daily-item-sales-station-filter'), {
      target: { value: 'PHA_CHE' },
    });
    expect(screen.queryByText('Mì Cay Xúc Xích')).not.toBeInTheDocument();
    expect(screen.getByText('Trà Đào Cam Sả')).toBeInTheDocument();

    // Reset station + category filter
    fireEvent.change(screen.getByTestId('daily-item-sales-station-filter'), {
      target: { value: 'ALL' },
    });
    fireEvent.change(screen.getByTestId('daily-item-sales-category-filter'), {
      target: { value: '10' },
    });
    expect(screen.getByText('Mì Cay Xúc Xích')).toBeInTheDocument();
    expect(screen.queryByText('Trà Đào Cam Sả')).not.toBeInTheDocument();
    fireEvent.change(screen.getByTestId('daily-item-sales-category-filter'), {
      target: { value: 'ALL' },
    });

    // Quick single-day date selector updates parent filter cleanly
    fireEvent.change(screen.getByTestId('daily-item-sales-date-input'), {
      target: { value: '2026-11-26' },
    });
    expect(onFilterChange).toHaveBeenCalledWith({
      preset: 'custom',
      fromDate: '2026-11-26',
      toDate: '2026-11-26',
    });

    // Export Excel includes all columns
    fireEvent.click(screen.getByTestId('daily-item-sales-export-btn'));
    expect(exportSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'ThongKe_MonBan_2026-11-27_2026-11-27.xlsx',
        rows: expect.arrayContaining([
          expect.objectContaining({ name: 'Mì Cay Xúc Xích', qty: 2, revenue: 80000 }),
        ]),
      }),
    );
  });

  it('hides revenue columns and revenue totals in Blind Mode', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(
      makeDailySalesResponse({
        meta: {
          preset: 'today',
          fromDate: '2026-11-27',
          toDate: '2026-11-27',
          generatedAt: '2026-11-27T12:00:00.000Z',
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
        items: [
          {
            productId: 1,
            name: 'Mì Cay Xúc Xích',
            categoryId: 10,
            categoryName: 'Mì Cay',
            station: 'BEP_NAU',
            qty: 2,
            orderCount: 2,
            revenue: 0,
            avgUnitPrice: 0,
            sharePercent: 0,
          },
        ],
      }),
    );

    renderSection({ canExport: false });

    expect(await screen.findByText('Mì Cay Xúc Xích')).toBeInTheDocument();
    expect(screen.getByTestId('daily-item-sales-blind-badge')).toBeInTheDocument();
    expect(screen.queryByText('Doanh thu')).not.toBeInTheDocument();
    expect(screen.getByTestId('daily-item-sales-footer')).not.toHaveTextContent('Tổng doanh thu món');
    expect(screen.queryByTestId('daily-item-sales-export-btn')).not.toBeInTheDocument();
  });

  it('shows empty state and error retry cleanly', async () => {
    const spy = vi
      .spyOn(apiClient, 'get')
      .mockRejectedValueOnce(new Error('Network down'))
      .mockResolvedValueOnce(
        makeDailySalesResponse({
          summary: { totalProductsSold: 0, totalQuantity: 0, totalRevenue: 0, totalOrders: 0 },
          categories: [],
          stations: [],
          items: [],
        }),
      );

    renderSection();

    const retryBtn = await screen.findByRole('button', { name: /Thử tải lại/i });
    fireEvent.click(retryBtn);

    expect(
      await screen.findByText(/Chưa có món nào được thanh toán trong ngày\/kỳ đã chọn/i),
    ).toBeInTheDocument();
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
