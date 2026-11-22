import { QueryClient } from '@tanstack/react-query';
import {
  type PaymentAccount,
  type PaymentAccountOrdersResponse,
  UserPermissionsSchema,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { PaymentQrPage } from '@/features/payment-qr';
import { apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const mockAccounts: PaymentAccount[] = [
  {
    id: 1,
    label: 'TK Chính (VPBank)',
    bankCode: 'VPB',
    bankName: 'VPBank',
    accountNo: '186877721',
    accountName: 'THAN THI LOAN',
    priority: 1,
    isActive: true,
    dailyLimit: 5000000,
    monthlyLimit: 100000000,
    yearlyLimit: null,
    usedDay: 4500000,
    usedMonth: 25000000,
    usedYear: 80000000,
    orderCount: 18,
    hasOrders: true,
    status: 'AVAILABLE',
    createdAt: '2026-11-15T01:00:00.000Z',
    updatedAt: '2026-11-15T02:00:00.000Z',
  },
  {
    id: 2,
    label: 'TK Phụ 1 (Vietcombank)',
    bankCode: 'VCB',
    bankName: 'Vietcombank',
    accountNo: '0071001234567',
    accountName: 'THAN THI LOAN',
    priority: 2,
    isActive: true,
    dailyLimit: 10000000,
    monthlyLimit: null,
    yearlyLimit: null,
    usedDay: 0,
    usedMonth: 5000000,
    usedYear: 5000000,
    orderCount: 0,
    hasOrders: false,
    status: 'AVAILABLE',
    createdAt: '2026-11-15T01:10:00.000Z',
    updatedAt: '2026-11-15T02:10:00.000Z',
  },
];

const mockOrdersResponse: PaymentAccountOrdersResponse = {
  items: [
    {
      orderId: 501,
      orderCode: 'HD-20261115-0001',
      orderType: 'DINE_IN',
      tableLabel: 'Bàn 05',
      paymentMethod: 'TRANSFER',
      totalAmount: 250000,
      transferAmount: 250000,
      paidAt: '2026-11-15T03:00:00.000Z',
      cashierName: 'Chủ Quán Sơn Bảo',
    },
  ],
  total: 1,
  page: 1,
  limit: 20,
  totalTransferAmount: 250000,
};

describe('Story 13 — Payment QR Management & Automatic Rotation UI (/payment-qr)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();

    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue({
      on: vi.fn().mockReturnThis(),
      off: vi.fn().mockReturnThis(),
      disconnect: vi.fn(),
    } as unknown as ReturnType<typeof socketClient.connectPosSocket>);

    useAuthStore.getState().setAuth({
      accessToken: 'admin-jwt-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán Sơn Bảo',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
  });

  it('should render QR accounts table, status toggle buttons, constraints on Edit/Delete, bank tooltip, and Vietnamese labels', async () => {
    let currentAccounts = mockAccounts.map((acc) => ({ ...acc }));

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/payment-qr') return currentAccounts;
      if (url === '/api/v1/payment-qr/1/orders') return mockOrdersResponse;
      throw new Error(`Unexpected GET ${url}`);
    });

    const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/v1/payment-qr/reorder') {
        const { orderedIds } = body as { orderedIds: number[] };
        currentAccounts = orderedIds.map((id, idx) => {
          const found = currentAccounts.find((a) => a.id === id)!;
          return { ...found, priority: idx + 1 };
        });
        return currentAccounts;
      }
      if (url === '/api/v1/payment-qr/1' || url === '/api/v1/payment-qr/2') {
        const targetId = url.endsWith('/1') ? 1 : 2;
        const patch = (body ?? {}) as { isActive?: boolean; dailyLimit?: number | null };
        currentAccounts = currentAccounts.map((a) => {
          if (a.id !== targetId) return a;
          const nextActive = patch.isActive ?? a.isActive;
          return {
            ...a,
            ...(patch.dailyLimit !== undefined ? { dailyLimit: patch.dailyLimit } : {}),
            isActive: nextActive,
            status: nextActive ? 'AVAILABLE' : 'INACTIVE',
          };
        });
        return currentAccounts.find((a) => a.id === targetId)!;
      }
      throw new Error(`Unexpected PUT ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryProvider client={queryClient}>
        <SocketProvider>
          <MemoryRouter future={routerFutureFlags}>
            <PaymentQrPage />
          </MemoryRouter>
        </SocketProvider>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('payment-qr-page')).toBeInTheDocument();
      expect(screen.getByText('TK Chính (VPBank)')).toBeInTheDocument();
      expect(screen.getByText('TK Phụ 1 (Vietcombank)')).toBeInTheDocument();
    });

    // Item 1, 2, 3, 6, 9 assertions + reset search button
    expect(screen.getByText('Ngân hàng')).toBeInTheDocument();
    expect(screen.getByTestId('qr-status-ACTIVE_PRIMARY')).toHaveTextContent('Đang dùng');
    expect(screen.getByTestId('qr-status-STANDBY')).toHaveTextContent('Dự phòng');
    expect(screen.getByText('STK: 186877721')).toBeInTheDocument();
    expect(screen.getByTestId('table-search-reset-btn')).toBeDisabled();
    const searchInput = screen.getByPlaceholderText('Tìm theo tên gợi nhớ, ngân hàng, STK...');
    fireEvent.change(searchInput, { target: { value: 'VPBank' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });
    expect(screen.queryByText('TK Phụ 1 (Vietcombank)')).not.toBeInTheDocument();
    expect(screen.getByTestId('table-search-reset-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('table-search-reset-btn'));
    expect(screen.getByText('TK Phụ 1 (Vietcombank)')).toBeInTheDocument();
    expect(screen.getByText(/Tính theo các hoá đơn đã thanh toán \(Chuyển khoản & Kết hợp\)/)).toBeInTheDocument();
    expect(screen.getByText(/Tự động trừ khi hoá đơn bị huỷ/)).toBeInTheDocument();
    expect(screen.getByTestId('btn-create-payment-qr')).toHaveTextContent(/^Thêm mã QR$/);
    expect(screen.queryByTestId('qr-toggle-active-1')).not.toBeInTheDocument();

    // Active banner shows #1 TK Chính (VPBank)
    expect(screen.getByTestId('payment-qr-active-banner')).toHaveTextContent(
      '#1 TK Chính (VPBank)',
    );
    expect(screen.getByTestId('payment-qr-summary-today')).toHaveTextContent('4.500.000 đ');

    // Item 5: Delete is disabled for #1 (hasOrders=true & isActive=true) and #2 (isActive=true)
    expect(screen.getByTestId('qr-delete-1')).toBeDisabled();
    expect(screen.getByTestId('qr-delete-2')).toBeDisabled();

    // Item 7: Edit button is disabled for #1 (Đang dùng) and enabled for #2 (Dự phòng)
    expect(screen.getByTestId('qr-edit-1')).toBeDisabled();
    expect(screen.getByTestId('qr-edit-2')).not.toBeDisabled();

    // Item 4 & 5: Click status button on #2 (Dự phòng) -> Đang tắt, enabling qr-delete-2 and locking move buttons
    fireEvent.click(screen.getByTestId('qr-status-btn-2'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/payment-qr/2', { isActive: false });
      expect(screen.getByTestId('qr-status-INACTIVE')).toHaveTextContent('Đang tắt');
      expect(screen.getByTestId('qr-delete-2')).not.toBeDisabled();
      expect(screen.getByTestId('qr-move-up-2')).toBeDisabled();
      expect(screen.getByTestId('qr-move-down-2')).toBeDisabled();
    });

    // Item 4: Turn #2 back on -> Dự phòng; reorder #2 up to #1 while both are active
    fireEvent.click(screen.getByTestId('qr-status-btn-2'));
    await waitFor(() => {
      expect(screen.getByTestId('qr-status-STANDBY')).toHaveTextContent('Dự phòng');
      expect(screen.getByTestId('qr-move-up-2')).not.toBeDisabled();
    });

    fireEvent.click(screen.getByTestId('qr-move-up-2'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/payment-qr/reorder', {
        orderedIds: [2, 1],
      });
    });

    // Now #1 is Dự phòng and #2 is Đang dùng; click #2 (Đang dùng) -> confirmation dialog -> Đang tắt, then turn #1 off? Or click #1 (Dự phòng) -> Đang tắt so #1 can be edited
    fireEvent.click(screen.getByTestId('qr-status-btn-1'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith('/api/v1/payment-qr/1', { isActive: false });
      expect(screen.getByTestId('qr-edit-1')).not.toBeDisabled();
    });

    // Open Edit Drawer for #1 (inactive + hasOrders=true) -> bank tooltip present, bankCode & accountNo locked
    fireEvent.click(screen.getByTestId('qr-edit-1'));
    await waitFor(() => {
      expect(screen.getByTestId('payment-qr-form-drawer')).toBeInTheDocument();
    });
    expect(screen.getByTestId('payment-qr-locked-warning')).toBeInTheDocument();
    expect(screen.getByTestId('payment-qr-bank-tooltip-wrapper')).toHaveAttribute(
      'title',
      expect.stringContaining('VPBank (VPB)'),
    );
    expect(screen.getByTestId('payment-qr-bank-hover-tooltip')).toHaveTextContent('VPBank (VPB)');
    expect(screen.getByTestId('payment-qr-bank-select')).toBeDisabled();
    expect(screen.getByTestId('payment-qr-account-no-input')).toBeDisabled();

    // Close edit drawer, verify clicking row does NOT open Orders Drawer, then open via action button
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByText('TK Chính (VPBank)'));
    expect(screen.queryByTestId('payment-qr-orders-drawer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('qr-view-orders-1'));

    await waitFor(() => {
      expect(screen.getByTestId('payment-qr-orders-drawer')).toBeInTheDocument();
      expect(screen.getByText('HD-20261115-0001')).toBeInTheDocument();
      expect(screen.getByTestId('payment-qr-orders-total-transfer')).toHaveTextContent(
        '250.000 đ',
      );
    });

    // Close orders drawer, open Create Form Drawer, verify bank dropdown toggle-deselect & full-label portal
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('btn-create-payment-qr'));
    await waitFor(() => {
      expect(screen.getByTestId('payment-qr-form-drawer')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('payment-qr-label-input'), {
      target: { value: 'TK Mới Test' },
    });
    fireEvent.click(screen.getByTestId('payment-qr-bank-select'));
    expect(screen.getByTestId('payment-qr-bank-listbox')).toBeInTheDocument();
    expect(screen.queryByTestId('payment-qr-bank-hover-tooltip')).not.toBeInTheDocument();

    // Clicking already-selected VPB deselects it
    fireEvent.click(screen.getByTestId('payment-qr-bank-option-VPB'));
    expect(screen.queryByTestId('payment-qr-bank-listbox')).not.toBeInTheDocument();
    expect(screen.getByTestId('payment-qr-bank-select')).toHaveTextContent(
      'Chọn ngân hàng thụ hưởng',
    );

    // Submitting without bank selected shows validation message
    fireEvent.click(screen.getByTestId('payment-qr-submit-btn'));
    expect(screen.getByTestId('payment-qr-form-error')).toHaveTextContent(
      'Vui lòng chọn ngân hàng thụ hưởng.',
    );

    // Selecting MB selects MBBank cleanly
    fireEvent.click(screen.getByTestId('payment-qr-bank-select'));
    fireEvent.click(screen.getByTestId('payment-qr-bank-option-MB'));
    expect(screen.getByTestId('payment-qr-bank-select')).toHaveTextContent('MBBank (MB)');
  }, 15000);

  it('supports non-diacritic Vietnamese keyword filtering across payment accounts', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/payment-qr') return mockAccounts;
      throw new Error(`Unexpected GET ${url}`);
    });

    render(
      <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <SocketProvider>
          <MemoryRouter future={routerFutureFlags}>
            <PaymentQrPage />
          </MemoryRouter>
        </SocketProvider>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('TK Chính (VPBank)')).toBeInTheDocument();
      expect(screen.getByText('TK Phụ 1 (Vietcombank)')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Tìm theo tên gợi nhớ, ngân hàng, STK...');
    fireEvent.change(searchInput, { target: { value: 'chinh' } });
    fireEvent.keyDown(searchInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('TK Chính (VPBank)')).toBeInTheDocument();
      expect(screen.queryByText('TK Phụ 1 (Vietcombank)')).not.toBeInTheDocument();
    });
  });
});
