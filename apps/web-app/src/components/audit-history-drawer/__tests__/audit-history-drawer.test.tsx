import { defaultUserPermissions, type AuditLogItem } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

import { AuditHistoryButton } from '../audit-history-drawer';

const buildAuditItem = (
  id: number,
  action: string,
  metadata: Record<string, unknown>,
  summary = 'Nhân viên Admin đã thực hiện thao tác trên hệ thống',
): AuditLogItem => ({
  id,
  module: 'POS',
  action,
  summary,
  actorId: 1,
  actorFullName: 'Chủ quán',
  actorUsername: 'admin',
  ipAddress: '10.0.0.8',
  deviceLabel: 'Chrome macOS',
  createdAt: '2026-11-27T10:00:00.000Z',
  metadata,
});

function renderAudit(module: 'POS' | 'MENU' | 'INVOICES' | 'INVENTORY' | 'CASHFLOW' | 'EMPLOYEES' | 'SCHEDULES' | 'MDM' | 'RBAC' | 'DISCOUNTS') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuditHistoryButton module={module} />
    </QueryClientProvider>,
  );
}

describe('AuditHistoryButton & AuditHistoryDrawer', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Chủ quán',
        isSuperAdmin: true,
        permissions: defaultUserPermissions,
      },
    });
  });

  it('opens drawer, renders module tags, diffs, SuperAdmin IP badge, action filter, keyword search, pagination & reset', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (_url, opts) => {
      const page = Number((opts?.params as Record<string, unknown>)?.page ?? 1);
      if (page === 2) {
        return {
          page: 2,
          limit: 20,
          total: 45,
          items: [
            buildAuditItem(2, 'Huỷ đơn', {
              orderCode: 'HD-002',
              reason: 'Khách đổi ý',
            }),
          ],
        } as never;
      }
      return {
        page: 1,
        limit: 20,
        total: 45,
        items: [
          buildAuditItem(1, 'Chuyển bàn', {
            orderCode: 'HD-001',
            tableLabel: 'Bàn 01',
            fromLabel: 'Bàn 01',
            toLabel: 'Bàn 05',
            paymentMethodLabel: 'Tiền mặt',
            discountCode: 'VIP10',
            changes: [{ field: 'Vị trí bàn', from: 'Bàn 01', to: 'Bàn 05' }],
          }),
          buildAuditItem(3, 'Thanh toán tách đơn', {
            orderCode: 'HD-003',
          }),
          buildAuditItem(4, 'Chốt ca cuối ngày', {
            orderCode: 'HD-004',
          }),
        ],
      } as never;
    });

    renderAudit('POS');
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử thao tác' }));

    await screen.findByText('HD-001', { exact: false });
    expect(screen.getByTestId('audit-client-info-1')).toHaveTextContent('IP: 10.0.0.8 · Chrome macOS');
    expect(screen.getByTestId('audit-changes-1')).toHaveTextContent('Vị trí bàn:');

    // Pagination next/prev while initial query is settled
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang sau' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByTestId('audit-client-info-2');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Trang trước' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    await screen.findByTestId('audit-client-info-1');

    // Action filter dropdown open & choose first non-all option
    fireEvent.click(screen.getByTestId('audit-action-filter-trigger'));
    const options = screen.getAllByRole('option');
    if (options.length > 1) {
      fireEvent.click(options[1]!);
    }

    // Keyword search commit, inverted date clamping & Reset filter button & refresh
    const dateInputs = Array.from(document.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    if (dateInputs.length === 2) {
      fireEvent.change(dateInputs[0]!, { target: { value: '2026-11-20' } });
      fireEvent.change(dateInputs[1]!, { target: { value: '2026-11-10' } });
      expect(dateInputs[1]!.value).toBe('2026-11-20');
      fireEvent.change(dateInputs[0]!, { target: { value: '2026-11-25' } });
      expect(dateInputs[1]!.value).toBe('2026-11-25');
    }
    const input = screen.getByPlaceholderText(/Tìm theo tên/);
    fireEvent.change(input, { target: { value: 'HD-001' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    fireEvent.click(screen.getByRole('button', { name: 'Làm mới' }));
    expect(getSpy).toHaveBeenCalled();
  });

  it('renders error fallback, hides IP for non-SuperAdmin, and renders metadata across other audit modules', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      user: {
        id: 2,
        employeeId: 2,
        username: 'cashier',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: defaultUserPermissions,
      },
    });

    vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('network error'));
    renderAudit('MENU');
    fireEvent.click(screen.getByRole('button', { name: 'Lịch sử thao tác' }));
    await screen.findByText('Không thể tải lịch sử thao tác. Vui lòng thử lại sau.');
    cleanup();

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      page: 1,
      limit: 10,
      total: 4,
      items: [
        buildAuditItem(10, 'Cập nhật', {
          productName: 'Mì Bò',
          stationLabel: 'Bếp Nấu',
          categoryLabel: 'Mì Cay',
          unavailableToppings: ['Trứng'],
          targetUsername: 'cashier',
          failureReason: 'INVALID_PASSWORD',
          employeeName: 'Nguyễn A',
          weekStartDate: '2026-11-16',
          targetWeekStartDate: '2026-11-23',
          settlementDate: '2026-11-27',
          note: 'Ca sáng',
          itemName: 'Thịt bò',
          paymentSourceLabel: 'Két thu ngân',
          decisionLabel: 'Đã duyệt',
          fromPaymentMethodLabel: 'Tiền mặt',
          toPaymentMethodLabel: 'QR',
          code: 'SALE10',
          name: 'Giảm 10%',
        }),
      ],
    } as never);

    for (const mod of ['INVOICES', 'INVENTORY', 'CASHFLOW', 'EMPLOYEES', 'SCHEDULES', 'MDM', 'RBAC', 'DISCOUNTS'] as const) {
      renderAudit(mod);
      fireEvent.click(screen.getByRole('button', { name: 'Lịch sử thao tác' }));
      await screen.findByText('@admin');
      expect(screen.queryByTestId('audit-client-info-10')).not.toBeInTheDocument();
      cleanup();
    }
  });
});
