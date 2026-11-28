import { QueryClient } from '@tanstack/react-query';
import { type OrderDetailResponse, UserPermissionsSchema } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { InvoicesPage } from '@/features/invoices';
import * as excelExport from '@/lib/excel-export';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    invoices: { view: true, reprint: true, update: true, approve: true, void: true, export: true },
  }),
};

const baseListResponse = {
  page: 1,
  limit: 20,
  total: 2,
  summary: {
    totalPaidAmount: 335000,
    totalCashAmount: 185000,
    totalTransferAmount: 150000,
    totalDiscountAmount: 15000,
    paidCount: 2,
  },
  items: [
    {
      orderId: 601,
      orderCode: 'HD-20261127-0601',
      orderType: 'DINE_IN' as const,
      tableId: 5,
      tableLabel: 'Bàn 05',
      takeawayNumber: null,
      status: 'PAID' as const,
      paymentMethod: 'CASH' as const,
      cashAmount: 185000,
      transferAmount: 0,
      subtotalAmount: 200000,
      discountAmount: 15000,
      discountSnapshot: {
        kind: 'CODE' as const,
        discountId: 1,
        code: 'GIAM15K',
        name: 'Giảm 15k',
        valueType: 'FIXED' as const,
        value: 15000,
        maxDiscountAmount: null,
        scope: 'ORDER' as const,
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: null,
        appliedAt: '2026-11-27T02:00:00.000Z',
        appliedBy: 1,
        reason: null,
      },
      totalAmount: 185000,
      pendingPaymentEdit: {
        paymentMethod: 'SPLIT' as const,
        cashAmount: 100000,
        transferAmount: 85000,
        reason: 'Khách chuyển một phần qua QR',
        requestedBy: 2,
        requestedByName: 'Thu Ngân An',
        requestedByUsername: 'cashier01',
        requestedAt: '2026-11-27T02:30:00.000Z',
      },
      createdAt: '2026-11-27T02:15:00.000Z',
      paidAt: '2026-11-27T02:20:00.000Z',
      note: 'Không hành',
    },
    {
      orderId: 602,
      orderCode: 'HD-20261127-0602',
      orderType: 'TAKEAWAY' as const,
      tableId: null,
      tableLabel: null,
      takeawayNumber: 3,
      takeawayLabelFormat: 'NUMBER' as const,
      status: 'PAID' as const,
      paymentMethod: 'TRANSFER' as const,
      cashAmount: 0,
      transferAmount: 150000,
      subtotalAmount: 150000,
      discountAmount: 0,
      discountSnapshot: null,
      totalAmount: 150000,
      pendingPaymentEdit: null,
      createdAt: '2026-11-27T03:00:00.000Z',
      paidAt: '2026-11-27T03:05:00.000Z',
      note: null,
    },
  ],
};

function renderInvoicesPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags}>
        <ThermalPrintProvider>
          <InvoicesPage />
        </ThermalPrintProvider>
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('Wave 4 — InvoicesPage, InvoiceDualFilterBar, Detail Modal, Void & Review Modals', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({ accessToken: 'token', user: superAdminUser });
  });

  it('exercises InvoiceDualFilterBar presets, inverted date clamping, search fields, filters, and resets', async () => {
    const capturedParams: Array<Record<string, unknown>> = [];
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, opts?: { params?: Record<string, unknown> }) => {
      if (url === '/api/v1/invoices') {
        capturedParams.push(opts?.params ?? {});
        return baseListResponse;
      }
      return {};
    });

    renderInvoicesPage();
    await waitFor(() => expect(screen.getByText('HD-20261127-0601')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('preset-yesterday-btn'));
    fireEvent.click(screen.getByTestId('preset-week-btn'));
    fireEvent.click(screen.getByTestId('preset-today-btn'));

    // Date clamping when fromDate > toDate and vice versa
    const fromInput = screen.getByTestId('invoice-from-date-input') as HTMLInputElement;
    const toInput = screen.getByTestId('invoice-to-date-input') as HTMLInputElement;
    fireEvent.change(fromInput, { target: { value: '2026-11-01' } });
    fireEvent.change(toInput, { target: { value: '2026-11-10' } });
    fireEvent.change(fromInput, { target: { value: '2026-11-20' } });
    expect(toInput.value).toBe('2026-11-20');

    fireEvent.change(toInput, { target: { value: '2026-11-05' } });
    expect(toInput.value).toBe('2026-11-20');

    // Reset date button restores today
    fireEvent.click(screen.getByTestId('invoice-reset-date-btn'));

    // Payment method, orderType, search field + keyword + reset keyword
    fireEvent.change(screen.getByTestId('invoice-payment-filter'), { target: { value: 'SPLIT' } });
    fireEvent.change(screen.getByTestId('invoice-order-type-filter'), { target: { value: 'TAKEAWAY' } });
    fireEvent.change(screen.getByTestId('invoice-search-field-select'), { target: { value: 'discount_code' } });
    const keywordInput = screen.getByTestId('invoice-keyword-input');
    fireEvent.change(keywordInput, { target: { value: 'giam15k' } });
    fireEvent.keyDown(keywordInput, { key: 'Enter' });

    await waitFor(() => {
      const last = capturedParams.at(-1);
      expect(last).toMatchObject({
        paymentMethod: 'SPLIT',
        orderType: 'TAKEAWAY',
        searchField: 'discount_code',
        keyword: 'giam15k',
      });
    });

    fireEvent.click(screen.getByTestId('invoice-reset-keyword-btn'));
    expect((screen.getByTestId('invoice-keyword-input') as HTMLInputElement).value).toBe('');
  });

  it('handles VOIDED detail modal blocking reprint, error feedback on reprint failure, and VOID invoice validation + submission', async () => {
    const voidedDetail: OrderDetailResponse = {
      orderId: 601,
      orderCode: 'HD-20261127-0601',
      orderType: 'DINE_IN',
      orderSource: 'POS_COUNTER',
      tableId: 5,
      tableLabel: 'Bàn 05',
      takeawayNumber: null,
      status: 'VOIDED',
      paymentMethod: 'CASH',
      cashAmount: 185000,
      transferAmount: 0,
      subtotalAmount: 200000,
      discountAmount: 15000,
      discountId: 1,
      discountSnapshot: baseListResponse.items[0].discountSnapshot,
      totalAmount: 185000,
      note: null,
      createdAt: '2026-11-27T02:15:00.000Z',
      paidAt: '2026-11-27T02:20:00.000Z',
      pendingPaymentEdit: baseListResponse.items[0].pendingPaymentEdit,
      tableTransferLogs: [
        { action: 'MOVE', fromTable: 'Bàn 01', toTable: 'Bàn 05', reason: 'Khách đổi bàn rộng', timestamp: '2026-11-27T02:16:00.000Z' },
      ],
      items: [
        {
          id: 11,
          productId: 1,
          name: 'Mì Cay Bò Cấp 2',
          quantity: 2,
          unitPrice: 70000,
          lineTotal: 140000,
          modifiers: ['Ít cay'],
          pricedModifiers: [],
          itemNote: 'Không tiêu',
          batchNo: 1,
          kitchenStatus: 'PRINTED',
        },
        {
          id: 12,
          productId: 2,
          name: 'Khoai Tây Chiên',
          quantity: 1,
          unitPrice: 30000,
          lineTotal: 30000,
          modifiers: [],
          pricedModifiers: [],
          itemNote: null,
          batchNo: 2,
          kitchenStatus: 'CANCELLED',
        },
      ],
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/invoices') return baseListResponse;
      if (url === '/api/v1/invoices/601') return voidedDetail;
      if (url === '/api/v1/invoices/602') {
        return { ...voidedDetail, orderId: 602, orderCode: 'HD-20261127-0602', status: 'PAID', pendingPaymentEdit: null, tableTransferLogs: [] };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url.endsWith('/reprint')) throw new Error('Printer service offline');
      if (url.endsWith('/void')) {
        return { orderId: 601, orderCode: 'HD-20261127-0601', status: 'VOIDED', voidReason: 'Khách phản ánh sai tiền món' };
      }
      return {};
    });

    renderInvoicesPage();
    await waitFor(() => expect(screen.getByTestId('view-invoice-btn-601')).toBeInTheDocument());

    // Open VOIDED detail modal: reprint button hidden, blocked note + transfer logs + pending banner shown
    fireEvent.click(screen.getByTestId('view-invoice-btn-601'));
    await waitFor(() => expect(screen.getByTestId('voided-reprint-blocked-note')).toBeInTheDocument());
    expect(screen.getByTestId('invoice-detail-pending-banner')).toBeInTheDocument();
    expect(screen.getByText(/Khách đổi bàn rộng/)).toBeInTheDocument();
    expect(screen.getByText('ĐÃ HUỶ')).toBeInTheDocument();
    expect(screen.queryByTestId('reprint-invoice-btn')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('close-invoice-detail-btn'));

    // Open PAID detail #602 & trigger failing reprint
    fireEvent.click(screen.getByTestId('view-invoice-btn-602'));
    await waitFor(() => expect(screen.getByTestId('reprint-invoice-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('reprint-invoice-btn'));
    await waitFor(() => expect(screen.getByTestId('reprint-feedback')).toHaveAttribute('role', 'alert'));
    fireEvent.click(screen.getByTestId('close-invoice-detail-btn'));

    // Void modal: short reason < 10 chars disables button, >= 10 chars submits POST /void
    fireEvent.click(screen.getByTestId('void-invoice-btn-601'));
    await waitFor(() => expect(screen.getByTestId('void-invoice-dialog')).toBeInTheDocument());

    const voidInput = screen.getByTestId('void-invoice-reason-input');
    fireEvent.change(voidInput, { target: { value: 'Ngắn quá' } });
    expect(screen.getByTestId('confirm-void-invoice-btn')).toBeDisabled();

    fireEvent.change(voidInput, { target: { value: 'Khách phản ánh sai tiền món' } });
    expect(screen.getByTestId('confirm-void-invoice-btn')).not.toBeDisabled();
    fireEvent.click(screen.getByTestId('confirm-void-invoice-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/invoices/601/void', {
        voidReason: 'Khách phản ánh sai tiền món',
      });
    });
  });

  it('handles SPLIT validation inside EditPaymentMethodDialog, REJECT in ReviewPaymentEditDialog, Excel export & query error retry', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockRejectedValueOnce(new Error('Network down'));
    renderInvoicesPage();

    await waitFor(() => expect(screen.getByTestId('system-error-view')).toBeInTheDocument());

    getSpy.mockImplementation(async (url: string) => {
      if (url === '/api/v1/invoices') return baseListResponse;
      return {};
    });
    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      orderId: 601,
      orderCode: 'HD-20261127-0601',
      status: 'REJECTED',
    });

    fireEvent.click(screen.getByTestId('error-retry-btn'));
    await waitFor(() => expect(screen.getByTestId('invoices-footer-total')).toBeInTheDocument());
    expect(screen.getByTestId('invoices-footer-total')).toHaveTextContent('335.000 đ');

    // Excel export calls exportToExcel with all rows
    fireEvent.click(screen.getByTestId('export-invoices-excel-btn'));
    await waitFor(() => expect(exportSpy).toHaveBeenCalledTimes(1));

    // Edit payment SPLIT validation: invalid cashAmount >= totalAmount disables submit
    fireEvent.click(screen.getByTestId('edit-payment-btn-601'));
    await waitFor(() => expect(screen.getByTestId('edit-payment-method-dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-pm-option-SPLIT'));
    fireEvent.change(screen.getByTestId('edit-pm-cash-input'), { target: { value: '185000' } });
    fireEvent.change(screen.getByTestId('edit-pm-reason-input'), { target: { value: 'Đổi sang tách tiền mặt và chuyển khoản' } });
    expect(screen.getByTestId('submit-edit-pm-btn')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bỏ' }));

    // Review pending payment edit REJECT branch
    fireEvent.click(screen.getByTestId('review-payment-btn-601'));
    await waitFor(() => expect(screen.getByTestId('review-payment-edit-dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('review-pm-note-input'), { target: { value: 'Chưa thấy sao kê' } });
    fireEvent.click(screen.getByTestId('reject-pm-edit-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/invoices/601/payment-method/review', {
        decision: 'REJECT',
        reviewNote: 'Chưa thấy sao kê',
      });
    });
  });
});
