import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditHistoryDrawer } from '../audit-history-drawer';
import { apiClient } from '@/lib/api-client';

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('AuditHistoryDrawer (Per-Module Isolation & Filter Chips)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches scoped endpoint /api/v1/audit-logs/:module and filters by module-specific action chips', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
      items: [
        {
          id: 10,
          module: 'INVOICES',
          action: 'Duyệt sửa PTTT',
          actorId: 1,
          actorFullName: 'Quản lý Hệ thống',
          actorUsername: 'superadmin',
          summary:
            'Nhân viên Quản lý Hệ thống (superadmin) đã thực hiện thao tác duyệt sửa phương thức thanh toán hoá đơn HD-20261114-0001 từ Tiền mặt sang Chuyển khoản tại Hoá đơn & Doanh thu',
          metadata: {
            orderCode: 'HD-20261114-0001',
            fromPaymentMethodLabel: 'Tiền mặt',
            toPaymentMethodLabel: 'Chuyển khoản',
            decisionLabel: 'Đã duyệt',
          },
          createdAt: '2026-11-14T08:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    renderWithQuery(
      <AuditHistoryDrawer open onOpenChange={() => undefined} module="INVOICES" />,
    );

    expect(screen.getByText('Lịch sử Hoá đơn & Doanh thu')).toBeInTheDocument();
    expect(await screen.findByText('Quản lý Hệ thống')).toBeInTheDocument();
    expect(screen.getByText('Nhân viên')).toBeInTheDocument();
    expect(screen.getByText('Thời gian')).toBeInTheDocument();
    expect(screen.getByText('Thao tác hành động')).toBeInTheDocument();
    expect(screen.getByText('@superadmin')).toBeInTheDocument();
    expect(screen.getByText('Hoá đơn: HD-20261114-0001')).toBeInTheDocument();
    expect(screen.getByText('PTTT: Tiền mặt → Chuyển khoản')).toBeInTheDocument();

    expect(getSpy).toHaveBeenCalledWith(
      '/api/v1/audit-logs/INVOICES',
      expect.objectContaining({
        params: expect.objectContaining({
          page: 1,
          limit: 20,
          action: undefined,
        }),
      }),
    );

    const actionSelect = screen.getByRole('combobox', {
      name: /Bộ lọc thao tác Hoá đơn & Doanh thu/i,
    });
    fireEvent.click(actionSelect);
    fireEvent.click(screen.getByRole('option', { name: 'Từ chối sửa PTTT' }));

    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith(
        '/api/v1/audit-logs/INVOICES',
        expect.objectContaining({
          params: expect.objectContaining({
            action: 'Từ chối sửa PTTT',
          }),
        }),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));

    await waitFor(() => {
      expect(getSpy).toHaveBeenLastCalledWith(
        '/api/v1/audit-logs/INVOICES',
        expect.objectContaining({
          params: expect.objectContaining({
            action: undefined,
          }),
        }),
      );
    });

    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });
});
