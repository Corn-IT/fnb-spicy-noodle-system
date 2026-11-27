import { QueryClient } from '@tanstack/react-query';
import {
  type ApplicableDiscountsResponse,
  type OrderDetailResponse,
  UserPermissionsSchema,
} from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { InvoicesPage } from '@/features/invoices';
import { LiveInvoicePanel, PosDiscountDialog, TableActionDialog } from '@/features/pos-counter';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const baseOrder: OrderDetailResponse = {
  orderId: 42,
  orderCode: 'HD-20261115-0042',
  orderType: 'DINE_IN',
  orderSource: 'POS_COUNTER',
  tableId: 1,
  tableLabel: 'Bàn 01',
  takeawayNumber: null,
  status: 'SERVING',
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  subtotalAmount: 200000,
  discountAmount: 20000,
  discountId: 1,
  discountSnapshot: {
    kind: 'CODE',
    discountId: 1,
    code: 'GIAM10',
    name: 'Giảm 10%',
    valueType: 'PERCENT',
    value: 10,
    maxDiscountAmount: 20000,
    scope: 'ORDER',
    targetCategoryIds: [],
    targetProductIds: [],
    minOrderAmount: 100000,
    appliedAt: '2026-11-15T10:00:00.000Z',
    appliedBy: 2,
    reason: null,
  },
  discountWarning: null,
  totalAmount: 180000,
  note: null,
  createdAt: '2026-11-15T09:50:00.000Z',
  paidAt: null,
  tableTransferLogs: [],
  items: [
    {
      id: 1,
      productId: 101,
      name: 'Mì Cay Bò',
      quantity: 2,
      unitPrice: 100000,
      lineTotal: 200000,
      modifiers: [],
      itemNote: null,
      batchNo: 1,
      kitchenStatus: 'PRINTED',
    },
  ],
};

const mockApplicable: ApplicableDiscountsResponse = {
  subtotalAmount: 200000,
  currentDiscountSnapshot: null,
  items: [
    {
      id: 1,
      code: 'GIAM10',
      name: 'Giảm 10%',
      valueType: 'PERCENT',
      value: 10,
      maxDiscountAmount: 20000,
      scope: 'ORDER',
      minOrderAmount: 100000,
      targetCategoryIds: [],
      targetProductIds: [],
      endsAt: null,
      usageLimit: 50,
      usedCount: 5,
      remainingCount: 45,
      estimatedDiscountAmount: 20000,
      isEligibleForCurrentOrder: true,
      warningCode: null,
      warningMessage: null,
    },
  ],
};

describe('Story 18 — POS Discount UI, Split/Merge Guards & Invoices Discount Filter', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  it('hides manual discount tab when pos.manualDiscount=false and reveals + submits it when true', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(mockApplicable);
    const onApply = vi.fn(async () => baseOrder);

    useAuthStore.getState().setAuth({
      user: {
        id: 2,
        employeeId: 2,
        username: 'cashier',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ pos: { view: true, checkout: true, manualDiscount: false } }),
      },
      accessToken: 'tk',
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = render(
      <QueryProvider client={queryClient}>
        <PosDiscountDialog
          open={true}
          onOpenChange={vi.fn()}
          order={baseOrder}
          isSubmitting={false}
          onApplyDiscount={onApply}
        />
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('applicable-discount-GIAM10')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('discount-tab-manual')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('applicable-discount-GIAM10'));
    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({ code: 'GIAM10' });
    });

    act(() => {
      useAuthStore.getState().setAuth({
        user: {
          id: 3,
          employeeId: 3,
          username: 'manager',
          fullName: 'Quản lý',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({ pos: { view: true, checkout: true, manualDiscount: true } }),
        },
        accessToken: 'tk2',
      });
    });

    rerender(
      <QueryProvider client={queryClient}>
        <PosDiscountDialog
          open={true}
          onOpenChange={vi.fn()}
          order={baseOrder}
          isSubmitting={false}
          onApplyDiscount={onApply}
        />
      </QueryProvider>,
    );

    expect(await screen.findByTestId('discount-tab-manual')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('discount-tab-manual'));
    fireEvent.change(screen.getByTestId('manual-discount-value-input'), { target: { value: '25000' } });
    fireEvent.change(screen.getByTestId('manual-discount-reason-input'), { target: { value: 'Khách VIP thân thiết' } });
    fireEvent.click(screen.getByTestId('submit-manual-discount-btn'));

    await waitFor(() => {
      expect(onApply).toHaveBeenCalledWith({
        manual: { valueType: 'FIXED', value: 25000, reason: 'Khách VIP thân thiết' },
      });
    });
  });

  it('displays discount breakdown, A1 warning banner, remove action in LiveInvoicePanel, and MERGE warning in TableActionDialog', () => {
    const onOpenDiscount = vi.fn();
    const onRemoveDiscount = vi.fn();

    render(
      <LiveInvoicePanel
        order={{ ...baseOrder, discountAmount: 0, totalAmount: 200000, discountWarning: 'MIN_ORDER_NOT_MET' }}
        draftTarget={null}
        draftItems={[]}
        isSplitPending={false}
        isProvisionalPending={false}
        isApprovingQr={false}
        isSubmittingDraft={false}
        onUpdateDraftQty={vi.fn()}
        onRemoveDraftItem={vi.fn()}
        onSubmitDraftOrder={vi.fn()}
        onApproveQrOrder={vi.fn()}
        onUpdateOrderItemQuantity={vi.fn()}
        onRemoveOrCancelOrderItem={vi.fn()}
        onOpenTableAction={vi.fn()}
        onSplitKitchen={vi.fn()}
        onPrintProvisionalBill={vi.fn()}
        onOpenCheckout={vi.fn()}
        onOpenDiscount={onOpenDiscount}
        onRemoveDiscount={onRemoveDiscount}
      />,
    );

    expect(screen.getByTestId('invoice-subtotal-amount')).toHaveTextContent('200.000 đ');
    expect(screen.getByTestId('invoice-discount-warning')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('btn-open-discount'));
    expect(onOpenDiscount).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('btn-remove-discount'));
    expect(onRemoveDiscount).toHaveBeenCalledTimes(1);

    render(
      <TableActionDialog
        open={true}
        onOpenChange={vi.fn()}
        order={baseOrder}
        tables={[
          { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 42, activeOrder: null },
          { id: 2, name: 'Bàn 02', status: 'OCCUPIED', activeOrderId: 99, activeOrder: null },
        ]}
        isSubmitting={false}
        onConfirm={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId('table-action-type-MERGE'));
    expect(screen.getByTestId('merge-discount-drop-warning')).toBeInTheDocument();
  });

  it('renders discount columns, discount_code search option, and footer summary on InvoicesPage', async () => {
    useAuthStore.getState().setAuth({
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Admin',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
      accessToken: 'tk',
    });

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      page: 1,
      limit: 20,
      total: 1,
      summary: {
        totalPaidAmount: 180000,
        totalCashAmount: 180000,
        totalTransferAmount: 0,
        totalDiscountAmount: 20000,
        paidCount: 1,
      },
      items: [
        {
          orderId: 42,
          orderCode: 'HD-20261115-0042',
          orderType: 'DINE_IN',
          tableId: 1,
          tableLabel: 'Bàn 01',
          takeawayNumber: null,
          status: 'PAID',
          paymentMethod: 'CASH',
          cashAmount: 180000,
          transferAmount: 0,
          subtotalAmount: 200000,
          discountAmount: 20000,
          discountId: 1,
          discountSnapshot: baseOrder.discountSnapshot,
          totalAmount: 180000,
          createdAt: '2026-11-15T09:50:00.000Z',
          paidAt: '2026-11-15T10:05:00.000Z',
          note: null,
          pendingPaymentEdit: null,
        },
      ],
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <InvoicesPage />
        </MemoryRouter>
      </QueryProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('HD-20261115-0042')).toBeInTheDocument();
    });
    expect(screen.getByTestId('invoice-search-field-select')).toHaveTextContent('Mã giảm giá');
    expect(screen.getByTestId('invoices-footer-total')).toHaveTextContent('20.000 đ');
  });
});
