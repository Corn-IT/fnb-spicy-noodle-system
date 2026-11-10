import { QueryClient } from '@tanstack/react-query';
import { type PublicMenuResponse, type PosTableGridResponse, type OrderDetailResponse } from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { PosUnifiedPage } from '@/features/pos-counter';
import { QrOrderPage } from '@/features/qr-order';
import { apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

type EventHandler = (payload: unknown) => void;

class MockSocket {
  public listeners = new Map<string, Set<EventHandler>>();
  public disconnected = false;

  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler?: EventHandler) {
    if (!handler) {
      this.listeners.delete(event);
      return this;
    }
    this.listeners.get(event)?.delete(handler);
    return this;
  }

  emitServerEvent(event: string, payload: unknown) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const h of handlers) {
        h(payload);
      }
    }
  }

  disconnect() {
    this.disconnected = true;
  }
}

const mockProducts: PublicMenuResponse['products'] = [
  {
    id: 101,
    name: 'Mì Kim Chi Bò Mỹ',
    price: 55000,
    station: 'BEP_NAU',
    isAvailable: true,
    imageUrl: null,
    sortOrder: 1,
    comboItems: [],
    modifierGroups: [
      {
        id: 1,
        name: 'Cấp độ cay',
        isRequired: true,
        maxSelect: 1,
        modifiers: [
          { id: 10, name: 'Cấp 0', extraPrice: 0 },
          { id: 11, name: 'Cấp 1', extraPrice: 0 },
          { id: 12, name: 'Cấp 3', extraPrice: 0 },
          { id: 13, name: 'Cấp 7', extraPrice: 0 },
        ],
      },
      {
        id: 2,
        name: 'Thêm Topping',
        isRequired: false,
        maxSelect: 5,
        modifiers: [
          { id: 20, name: 'Thêm Bò Mỹ', extraPrice: 20000 },
          { id: 21, name: 'Thêm Phô Mai', extraPrice: 10000 },
        ],
      },
    ],
  },
  {
    id: 102,
    name: 'Trà Đào Cam Sả',
    price: 30000,
    station: 'PHA_CHE',
    isAvailable: true,
    imageUrl: null,
    sortOrder: 2,
    comboItems: [],
    modifierGroups: [],
  },
];

describe('Story 09 — QR Mobile Order (/qr/:token) & Unified POS Screen (/pos)', () => {
  let mockSocketInstance: MockSocket;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();

    mockSocketInstance = new MockSocket();
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(
      mockSocketInstance as unknown as ReturnType<typeof socketClient.connectPosSocket>,
    );
    vi.spyOn(socketClient, 'getPosSocket').mockImplementation(
      () => mockSocketInstance as unknown as ReturnType<typeof socketClient.getPosSocket>,
    );

    useAuthStore.getState().setAuth({
      accessToken: 'cashier-jwt-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Nguyễn Văn Anh',
        isSuperAdmin: false,
        permissions: {
          pos: {
            view: true,
            create: true,
            update: true,
            delete: true,
            splitKitchen: true,
            tableAction: true,
            checkout: true,
          },
          invoices: { view: true, reprint: true, void: false },
          inventory: { view: true, create: true, update: false, delete: true },
          cashflow: { view: true, create: true, config: false },
          employees: { view: false, create: false, update: false, delete: false },
          schedules: { view: false, update: false },
          mdm: { view: false, write: false },
          rbac: { view: false, manage: false },
        },
      },
    });
  });

  describe('AC-09.1: QR Mobile Seamless Redirect (EC-POS-01)', () => {
    it('should select required spicy level & toppings, submit initial QR order (538 at Bàn 01), auto-update header to Bàn 07 on order:session_redirected, and send activeOrderId when ordering add-on items without rescanning QR', async () => {
      const publicMenuResponse: PublicMenuResponse = {
        table: {
          tableId: 1,
          tableName: 'Bàn 01',
          status: 'AVAILABLE',
          activeOrderId: null,
        },
        products: mockProducts,
        updatedAt: '2026-11-08T08:00:00.000Z',
      };

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce(publicMenuResponse);
      const postSpy = vi
        .spyOn(apiClient, 'post')
        .mockResolvedValueOnce({
          orderId: 538,
          activeOrderId: 538,
          orderCode: 'HD-20261108-0001',
          currentTableLabel: 'Bàn 01',
          status: 'PENDING',
          batchNo: 1,
          totalAmount: 75000,
        })
        .mockResolvedValueOnce({
          orderId: 540,
          activeOrderId: 540,
          orderCode: 'HD-20261108-0002',
          currentTableLabel: 'Bàn 07',
          status: 'SERVING',
          batchNo: 2,
          totalAmount: 105000,
        });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const validQrToken = '550e8400-e29b-41d4-a716-446655440001';

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <MemoryRouter initialEntries={[`/qr/${validQrToken}`]} future={routerFutureFlags}>
              <Routes>
                <Route path="/qr/:token" element={<QrOrderPage />} />
              </Routes>
            </MemoryRouter>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 01');
      });

      // Click product requiring spicy level modifier
      fireEvent.click(screen.getByTestId('qr-product-card-101'));

      // Modifier bottom sheet opens
      expect(screen.getByTestId('modifier-selector-sheet')).toBeInTheDocument();

      // Add-to-cart button disabled or blocked until required group (Cấp độ cay) is selected
      const confirmModifierBtn = screen.getByTestId('confirm-modifier-btn');
      expect(confirmModifierBtn).toBeDisabled();

      // Select Cấp 3 (radio) and Thêm Bò Mỹ (+20k checkbox)
      fireEvent.click(screen.getByTestId('modifier-option-12'));
      fireEvent.click(screen.getByTestId('modifier-option-20'));
      expect(confirmModifierBtn).not.toBeDisabled();

      fireEvent.click(confirmModifierBtn);

      // Submit initial order
      const submitOrderBtn = screen.getByTestId('qr-submit-order-btn');
      fireEvent.click(submitOrderBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/public/orders/qr',
          expect.objectContaining({
            qrToken: validQrToken,
            items: [
              expect.objectContaining({
                productId: 101,
                quantity: 1,
                modifiers: [
                  { groupId: 1, modifierId: 12 },
                  { groupId: 2, modifierId: 20 },
                ],
              }),
            ],
          }),
          expect.anything(),
        );
      });

      // Status banner shows waiting for cashier confirmation
      expect(
        screen.getByText(/Đã gửi đơn, vui lòng chờ thu ngân xác nhận/i),
      ).toBeInTheDocument();

      // Simulate Socket.io order:session_redirected to Bàn 07 (newActiveOrderId: 540)
      act(() => {
        mockSocketInstance.emitServerEvent('order:session_redirected', {
          previousOrderId: 538,
          newActiveOrderId: 540,
          previousTableLabel: 'Bàn 01',
          newTableId: 7,
          newTableLabel: 'Bàn 07',
          message: 'Đơn hàng của bạn đã được chuyển sang Bàn 07.',
        });
      });

      // Header seamlessly updates to Bàn 07 and shows redirect banner
      await waitFor(() => {
        expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 07');
      });
      expect(
        screen.getByText(/Đơn hàng của bạn đã được chuyển sang Bàn 07/i),
      ).toBeInTheDocument();

      // Guest orders an add-on drink (Trà Đào Cam Sả - no modifiers required)
      fireEvent.click(screen.getByTestId('qr-product-card-102'));
      fireEvent.click(screen.getByTestId('qr-submit-order-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenLastCalledWith(
          '/api/v1/public/orders/qr',
          expect.objectContaining({
            qrToken: validQrToken,
            activeOrderId: 540,
            items: [
              expect.objectContaining({
                productId: 102,
                quantity: 1,
              }),
            ],
          }),
          expect.anything(),
        );
      });
    });
  });

  describe('AC-09.2: Unified POS 3 Order Sources & Table Colors (Hard Invariant 2 & DISCREPANCY-SM-01)', () => {
    it('should render AVAILABLE (emerald), PENDING (amber animate-pulse), OCCUPIED (rose), allow approving QR orders, and create independent TAKEAWAY orders (tableId: null)', async () => {
      const tableGridResponse: PosTableGridResponse = {
        tables: [
          {
            id: 1,
            name: 'Bàn 01',
            status: 'AVAILABLE',
            activeOrderId: null,
            activeOrder: null,
          },
          {
            id: 2,
            name: 'Bàn 02',
            status: 'PENDING',
            activeOrderId: 601,
            activeOrder: {
              orderId: 601,
              orderCode: 'HD-20261108-0010',
              orderType: 'DINE_IN',
              tableId: 2,
              tableLabel: 'Bàn 02',
              takeawayNumber: null,
              status: 'PENDING',
              totalAmount: 55000,
              createdAt: '2026-11-08T08:10:00.000Z',
            },
          },
          {
            id: 3,
            name: 'Bàn 03',
            status: 'OCCUPIED',
            activeOrderId: 602,
            activeOrder: {
              orderId: 602,
              orderCode: 'HD-20261108-0011',
              orderType: 'DINE_IN',
              tableId: 3,
              tableLabel: 'Bàn 03',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 120000,
              createdAt: '2026-11-08T08:05:00.000Z',
            },
          },
        ],
        takeaways: [
          {
            orderId: 603,
            orderCode: 'HD-20261108-0012',
            orderType: 'TAKEAWAY',
            tableId: null,
            tableLabel: 'Mang về #01',
            takeawayNumber: 1,
            status: 'SERVING',
            totalAmount: 85000,
            createdAt: '2026-11-08T08:12:00.000Z',
          },
        ],
      };

      const pendingOrderDetail: OrderDetailResponse = {
        orderId: 601,
        orderCode: 'HD-20261108-0010',
        orderType: 'DINE_IN',
        orderSource: 'QR_CODE',
        tableId: 2,
        tableLabel: 'Bàn 02',
        takeawayNumber: null,
        status: 'PENDING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 55000,
        note: null,
        createdAt: '2026-11-08T08:10:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 9001,
            productId: 101,
            name: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
            unitPrice: 55000,
            lineTotal: 55000,
            modifiers: ['Cấp 1'],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'NEW',
          },
        ],
      };

      const takeawayOrderDetail: OrderDetailResponse = {
        orderId: 604,
        orderCode: 'HD-20261108-0013',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        tableLabel: 'Mang về #02',
        takeawayNumber: 2,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 30000,
        note: null,
        createdAt: '2026-11-08T08:15:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 9002,
            productId: 102,
            name: 'Trà Đào Cam Sả',
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            modifiers: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'NEW',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGridResponse;
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/601') return pendingOrderDetail;
        if (url === '/api/v1/pos/orders/604') return takeawayOrderDetail;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/orders/601/approve') {
          return { orderId: 601, status: 'SERVING' };
        }
        if (url === '/api/v1/pos/orders') {
          return {
            orderId: 604,
            orderCode: 'HD-20261108-0013',
            orderType: 'TAKEAWAY',
            tableId: null,
            takeawayNumber: 2,
            tableLabel: 'Mang về #02',
            status: 'SERVING',
            totalAmount: 30000,
          };
        }
        throw new Error(`Unexpected POST ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <MemoryRouter future={routerFutureFlags}>
              <PosUnifiedPage />
            </MemoryRouter>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('table-card-1')).toBeInTheDocument();
      });

      // Verify exact color classes per DISCREPANCY-SM-01
      expect(screen.getByTestId('table-card-1').className).toMatch(/emerald/);
      expect(screen.getByTestId('table-card-2').className).toMatch(/amber/);
      expect(screen.getByTestId('table-card-2').className).toMatch(/animate-pulse/);
      expect(screen.getByTestId('table-card-3').className).toMatch(/rose/);

      // Source A: Click PENDING table Bàn 02 and approve QR order
      fireEvent.click(screen.getByTestId('table-card-2'));
      await waitFor(() => {
        expect(screen.getByTestId('invoice-header-label')).toHaveTextContent('Bàn 02');
      });
      fireEvent.click(screen.getByTestId('approve-qr-order-btn'));
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/orders/601/approve', { approved: true });
      });

      // Source C: Click [+ TẠO ĐƠN MANG VỀ], pick item from menu, submit TAKEAWAY order with tableId: null
      fireEvent.click(screen.getByTestId('create-takeaway-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('pos-menu-product-102')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('pos-menu-product-102'));
      fireEvent.click(screen.getByTestId('pos-submit-new-order-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/pos/orders',
          expect.objectContaining({
            orderType: 'TAKEAWAY',
            tableId: null,
            items: [expect.objectContaining({ productId: 102, quantity: 1 })],
          }),
        );
      });

    });
  });

  describe('AC-09.3 & AC-09.4: Double-Click Guard on [Tách đơn], Provisional Bill vs 2-Step Checkout (SPLIT validation)', () => {
    it('should disable [Tách đơn] while splitKitchenMutation is pending or when no NEW items exist, keep SERVING on [In tạm tính (QR)], and validate SPLIT payment in 2-step Checkout dialog', async () => {
      let currentOrderState: OrderDetailResponse = {
        orderId: 700,
        orderCode: 'HD-20261108-0020',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 7,
        tableLabel: 'Bàn 07',
        takeawayNumber: null,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 185000,
        note: null,
        createdAt: '2026-11-08T08:20:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 9101,
            productId: 101,
            name: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
            unitPrice: 185000,
            lineTotal: 185000,
            modifiers: ['Cấp 3'],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'NEW',
          },
        ],
      };

      const tableGridResponse: PosTableGridResponse = {
        tables: [
          {
            id: 7,
            name: 'Bàn 07',
            status: 'OCCUPIED',
            activeOrderId: 700,
            activeOrder: {
              orderId: 700,
              orderCode: 'HD-20261108-0020',
              orderType: 'DINE_IN',
              tableId: 7,
              tableLabel: 'Bàn 07',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 185000,
              createdAt: '2026-11-08T08:20:00.000Z',
            },
          },
        ],
        takeaways: [],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGridResponse;
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/700') return currentOrderState;
        if (url === '/api/v1/pos/orders/700/provisional-bill') {
          return {
            orderId: 700,
            orderCode: 'HD-20261108-0020',
            orderType: 'DINE_IN',
            tableId: 7,
            takeawayNumber: null,
            items: [
              {
                name: 'Mì Kim Chi Bò Mỹ',
                quantity: 1,
                unitPrice: 185000,
                lineTotal: 185000,
                modifiers: ['Cấp 3'],
                note: null,
              },
            ],
            totalAmount: 185000,
            status: 'SERVING',
            vietQrPayload: 'https://img.vietqr.io/image/VCB-123-compact2.png?amount=185000',
          };
        }
        throw new Error(`Unexpected GET ${url}`);
      });

      let resolveSplitKitchen!: (val: unknown) => void;
      const splitPromise = new Promise((res) => {
        resolveSplitKitchen = res;
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/orders/700/split-kitchen') {
          return splitPromise;
        }
        if (url === '/api/v1/pos/orders/700/checkout') {
          return {
            orderId: 700,
            status: 'PAID',
            paidAt: '2026-11-08T08:30:00.000Z',
          };
        }
        throw new Error(`Unexpected POST ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <MemoryRouter future={routerFutureFlags}>
              <PosUnifiedPage />
            </MemoryRouter>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('table-card-7')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('table-card-7'));

      await waitFor(() => {
        expect(screen.getByTestId('btn-split-kitchen')).not.toBeDisabled();
      });

      // Click [Tách đơn] -> immediately disabled while pending (EC-POS-05)
      fireEvent.click(screen.getByTestId('btn-split-kitchen'));
      await waitFor(() => {
        expect(screen.getByTestId('btn-split-kitchen')).toBeDisabled();
      });

      // Update mock order state so all items are now PRINTED
      currentOrderState = {
        ...currentOrderState,
        items: currentOrderState.items.map((item) => ({
          ...item,
          kitchenStatus: 'PRINTED',
        })),
      };

      await act(async () => {
        resolveSplitKitchen({
          batchNo: 1,
          tickets: [
            {
              station: 'BEP_NAU',
              stationTitle: 'BẾP NẤU (MÌ CAY)',
              logoType: 'CHEF_HAT_NOODLE',
              batchNo: 1,
              items: [{ name: 'Mì Kim Chi Bò Mỹ', qty: 1, modifiers: ['Cấp 3'], note: '' }],
            },
          ],
        });
      });

      // After split completes and items are PRINTED, [Tách đơn] remains disabled because there are no NEW items
      await waitFor(() => {
        expect(screen.getByTestId('btn-split-kitchen')).toBeDisabled();
      });

      // Click [In tạm tính (QR)] -> calls provisional-bill, keeps order SERVING
      fireEvent.click(screen.getByTestId('btn-provisional-bill'));
      await waitFor(() => {
        expect(apiClient.get).toHaveBeenCalledWith('/api/v1/pos/orders/700/provisional-bill');
      });
      expect(screen.getByTestId('invoice-status-badge')).toHaveTextContent('SERVING');

      // Click [Thanh toán] -> opens 2-step CheckoutConfirmDialog
      fireEvent.click(screen.getByTestId('btn-checkout'));
      expect(screen.getByTestId('checkout-confirm-dialog')).toBeInTheDocument();

      // Switch to SPLIT payment method
      fireEvent.click(screen.getByTestId('payment-method-SPLIT'));

      const cashInput = screen.getByTestId('split-cash-input');
      const transferInput = screen.getByTestId('split-transfer-input');
      const confirmPrintBtn = screen.getByTestId('checkout-confirm-print-btn');
      const confirmNoPrintBtn = screen.getByTestId('checkout-confirm-noprint-btn');

      // Enter mismatched amounts (100000 + 50000 !== 185000) -> confirm buttons disabled
      fireEvent.change(cashInput, { target: { value: '100000' } });
      fireEvent.change(transferInput, { target: { value: '50000' } });
      expect(confirmPrintBtn).toBeDisabled();
      expect(confirmNoPrintBtn).toBeDisabled();

      // Enter exact amounts (85000 + 100000 === 185000) -> confirm buttons enabled
      fireEvent.change(cashInput, { target: { value: '85000' } });
      fireEvent.change(transferInput, { target: { value: '100000' } });
      expect(confirmPrintBtn).not.toBeDisabled();
      expect(confirmNoPrintBtn).not.toBeDisabled();

      // Click [Xác nhận & Không in]
      fireEvent.click(confirmNoPrintBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/orders/700/checkout', {
          paymentMethod: 'SPLIT',
          totalAmount: 185000,
          cashAmount: 85000,
          transferAmount: 100000,
          printReceipt: false,
        });
      });
    });

    it('should handle EC-POS-06 item cancellation (NEW hard-delete vs PRINTED cancel with kitchen slip) and EC-POS-03 blocking MERGE/MOVE on TAKEAWAY orders', async () => {
      const takeawayOrderWithMixedItems: OrderDetailResponse = {
        orderId: 801,
        orderCode: 'HD-20261108-0030',
        orderType: 'TAKEAWAY',
        orderSource: 'POS_COUNTER',
        tableId: null,
        tableLabel: 'Mang về #01',
        takeawayNumber: 1,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 85000,
        note: null,
        createdAt: '2026-11-08T08:30:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 9201,
            productId: 101,
            name: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
            unitPrice: 55000,
            lineTotal: 55000,
            modifiers: ['Cấp 1'],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'PRINTED',
          },
          {
            id: 9202,
            productId: 102,
            name: 'Trà Đào Cam Sả',
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            modifiers: [],
            itemNote: null,
            batchNo: 2,
            kitchenStatus: 'NEW',
          },
        ],
      };

      const tableGridResponse: PosTableGridResponse = {
        tables: [
          {
            id: 1,
            name: 'Bàn 01',
            status: 'AVAILABLE',
            activeOrderId: null,
            activeOrder: null,
          },
        ],
        takeaways: [
          {
            orderId: 801,
            orderCode: 'HD-20261108-0030',
            orderType: 'TAKEAWAY',
            tableId: null,
            tableLabel: 'Mang về #01',
            takeawayNumber: 1,
            status: 'SERVING',
            totalAmount: 85000,
            createdAt: '2026-11-08T08:30:00.000Z',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGridResponse;
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/801') return takeawayOrderWithMixedItems;
        throw new Error(`Unexpected GET ${url}`);
      });

      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
        orderId: 801,
        totalAmount: 30000,
        requireCancellationSlip: true,
        kitchenCancellationSlips: [
          {
            station: 'BEP_NAU',
            tableLabel: 'Mang về #01',
            itemName: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
          },
        ],
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <MemoryRouter future={routerFutureFlags}>
              <PosUnifiedPage />
            </MemoryRouter>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('takeaway-card-801')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('takeaway-card-801'));

      await waitFor(() => {
        expect(screen.getByTestId('invoice-header-label')).toHaveTextContent('Mang về #01');
      });

      // Verify batch grouping labels
      expect(screen.getByText('Lượt 1')).toBeInTheDocument();
      expect(screen.getByText('GỌI THÊM - LƯỢT 2')).toBeInTheDocument();

      // Branch B (EC-POS-06): Cancel PRINTED item -> calls PATCH removeItemIds
      fireEvent.click(screen.getByTestId('cancel-printed-item-9201'));
      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/801/items', {
          removeItemIds: [9201],
        });
      });

      // Branch A (EC-POS-06): Delete NEW item
      fireEvent.click(screen.getByTestId('delete-new-item-9202'));
      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/801/items', {
          removeItemIds: [9202],
        });
      });

      // EC-POS-03: Click [Đổi / Gộp bàn] on TAKEAWAY order -> shows blocked message and hides confirm button
      fireEvent.click(screen.getByTestId('btn-table-action'));
      expect(screen.getByTestId('takeaway-action-blocked-msg')).toBeInTheDocument();
      expect(screen.queryByTestId('confirm-table-action-btn')).not.toBeInTheDocument();
    });
  });
});
