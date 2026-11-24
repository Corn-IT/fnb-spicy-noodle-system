import { type OrderDetailResponse, UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as printSlips from '@/components/print-slips';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { usePosWorkspace } from '../hooks/use-pos-workspace';

vi.mock('../hooks/use-pos-cashier-socket', () => ({
  usePosCashierSocket: vi.fn(() => ({
    addonBadgesByOrderId: {},
    clearAddonBadge: vi.fn(),
  })),
}));

const ORDER_DETAIL: OrderDetailResponse = {
  orderId: 501,
  orderCode: 'HD-20261124-0501',
  orderType: 'DINE_IN',
  orderSource: 'POS_COUNTER',
  tableId: 1,
  tableLabel: 'Bàn 01',
  takeawayNumber: null,
  status: 'SERVING',
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  subtotalAmount: 100000,
  discountAmount: 0,
  discountId: null,
  discountSnapshot: null,
  totalAmount: 100000,
  note: null,
  createdAt: '2026-11-24T10:00:00.000Z',
  paidAt: null,
  tableTransferLogs: [],
  items: [
    {
      id: 1,
      productId: 10,
      name: 'Mì Cay Hải Sản',
      quantity: 2,
      unitPrice: 50000,
      lineTotal: 100000,
      modifiers: [],
      pricedModifiers: [],
      itemNote: null,
      kitchenStatus: 'PRINTED',
      batchNo: 1,
      isTakeaway: false,
    },
  ],
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryProvider client={queryClient}>{children}</QueryProvider>;
  };
}

describe('usePosWorkspace — tự động bung két khi thanh toán tiền mặt / kết hợp (không phụ thuộc pos.openCashDrawer)', () => {
  const kickMock = vi.fn();
  const printReceiptMock = vi.fn();

  beforeEach(() => {
    kickMock.mockReset().mockResolvedValue({ transport: 'RAWBT_WS', bytesSent: 7 });
    printReceiptMock.mockReset();

    // Máy POS dùng RawBT USB và bật auto kick két khi thu tiền mặt.
    printSlips.useThermalPrinterConfigStore.getState().updateConfig({
      driver: 'RAWBT_USB',
      cashDrawerKick: true,
    });

    vi.spyOn(printSlips, 'useThermalPrinter').mockReturnValue({
      printQueue: [],
      activePrintJob: null,
      lastPhysicalPrintResult: null,
      lastPhysicalPrintError: null,
      printKitchenSplit: vi.fn(),
      printTableTransferNotice: vi.fn(),
      printKitchenCancelItem: vi.fn(),
      printProvisionalVietQr: vi.fn(),
      printOfficialReceipt: printReceiptMock,
      printTableQr: vi.fn(),
      kickCashDrawerNow: kickMock,
      clearPrintQueue: vi.fn(),
    });

    // Thu ngân KHÔNG có quyền pos.openCashDrawer nhưng CÓ quyền pos.checkout.
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 2,
        employeeId: 2,
        username: 'thungan',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, checkout: true, openCashDrawer: false },
        }),
      },
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') {
        return {
          tables: [
            { id: 1, name: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 501, activeOrder: null },
          ],
          takeaways: [],
        };
      }
      if (url === '/api/v1/menu/products') return [];
      if (url === '/api/v1/pos/orders/501') return ORDER_DETAIL;
      return [];
    });
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url.endsWith('/split-checkout')) {
        return {
          paidOrderId: 502,
          paidOrderCode: 'HD-20261124-0502',
          paidAt: '2026-11-24T10:35:00.000Z',
          isFullCheckout: false,
          remainingTotalAmount: 50000,
        };
      }
      return {
        orderId: 501,
        status: 'PAID',
        paidAt: '2026-11-24T10:30:00.000Z',
      };
    });
  });

  afterEach(() => {
    cleanup();
    printSlips.useThermalPrinterConfigStore.getState().resetConfig();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  async function mountAndSelectOrder() {
    const hook = renderHook(() => usePosWorkspace(), { wrapper: createWrapper() });
    await waitFor(() => expect(hook.result.current.gridData?.tables.length).toBe(1));
    act(() => {
      hook.result.current.actions.selectTable(hook.result.current.gridData!.tables[0]);
    });
    await waitFor(() => expect(hook.result.current.currentOrder?.orderId).toBe(501));
    return hook;
  }

  it('auto-kicks cash drawer on CASH checkout with printReceipt=false even without pos.openCashDrawer', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmCheckout({
        paymentMethod: 'CASH',
        cashAmount: 100000,
        transferAmount: 0,
        printReceipt: false,
      });
    });

    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(kickMock).toHaveBeenCalledTimes(1);
  });

  it('auto-kicks cash drawer on SPLIT checkout with printReceipt=false even without pos.openCashDrawer', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmCheckout({
        paymentMethod: 'SPLIT',
        cashAmount: 40000,
        transferAmount: 60000,
        printReceipt: false,
      });
    });

    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(kickMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT kick cash drawer on TRANSFER-only checkout with printReceipt=false', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmCheckout({
        paymentMethod: 'TRANSFER',
        cashAmount: 0,
        transferAmount: 100000,
        printReceipt: false,
      });
    });

    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(kickMock).not.toHaveBeenCalled();
  });

  it('does NOT double-kick on CASH checkout with printReceipt=true (receipt print handles the kick)', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmCheckout({
        paymentMethod: 'CASH',
        cashAmount: 100000,
        transferAmount: 0,
        printReceipt: true,
      });
    });

    expect(printReceiptMock).toHaveBeenCalledTimes(1);
    expect(kickMock).not.toHaveBeenCalled();
  });

  it('auto-kicks cash drawer on split-bill SPLIT checkout with printReceipt=false even without pos.openCashDrawer', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmSplitCheckout(
        {
          items: [{ orderItemId: 1, quantity: 1 }],
          paymentMethod: 'SPLIT',
          cashAmount: 20000,
          transferAmount: 30000,
          printReceipt: false,
        },
        [
          {
            orderItemId: 1,
            name: 'Mì Cay Hải Sản',
            quantity: 1,
            unitPrice: 50000,
            lineTotal: 50000,
            modifiers: [],
            note: null,
          },
        ],
        50000,
      );
    });

    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(kickMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT kick cash drawer on split-bill TRANSFER checkout with printReceipt=false', async () => {
    const { result } = await mountAndSelectOrder();

    await act(async () => {
      await result.current.actions.confirmSplitCheckout(
        {
          items: [{ orderItemId: 1, quantity: 1 }],
          paymentMethod: 'TRANSFER',
          cashAmount: 0,
          transferAmount: 50000,
          printReceipt: false,
        },
        [
          {
            orderItemId: 1,
            name: 'Mì Cay Hải Sản',
            quantity: 1,
            unitPrice: 50000,
            lineTotal: 50000,
            modifiers: [],
            note: null,
          },
        ],
        50000,
      );
    });

    expect(printReceiptMock).not.toHaveBeenCalled();
    expect(kickMock).not.toHaveBeenCalled();
  });
});
