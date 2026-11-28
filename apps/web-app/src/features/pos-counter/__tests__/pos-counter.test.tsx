import { QueryClient } from '@tanstack/react-query';
import {
  DEFAULT_STORE_SETTINGS,
  ErrorCodes,
  QR_CARD_DEFAULTS,
  type OrderDetailResponse,
  type PosTableGridResponse,
  type PublicMenuResponse,
  type PublicStoreSettingsResponse,
  UserPermissionsSchema,
} from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { PosUnifiedPage } from '@/features/pos-counter';
import { LiveInvoicePanel } from '../components/live-invoice-panel';
import { QrSecurityConfigDialog } from '../components/qr-security-config-dialog';
import { TableManageDialog } from '../components/table-manage-dialog';
import * as qrExportUtils from '@/utils/qr-export';
import { QrOrderPage } from '@/features/qr-order';
import { ApiClientError, apiClient } from '@/lib/api-client';
import * as qrVoiceAnnouncer from '@/lib/qr-voice-announcer';
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
        permissions: UserPermissionsSchema.parse({
          pos: {
            view: true,
            create: true,
            update: true,
            delete: true,
            splitKitchen: true,
            tableAction: true,
            checkout: true,
          },
          invoices: { view: true, reprint: true },
          inventory: { view: true, create: true, delete: true },
          cashflow: { view: true, create: true },
        }),
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

      // Guest orders an add-on drink (Trà Đào Cam Sả - no modifiers required) and selects "Mang về" for the 2nd batch
      fireEvent.click(screen.getByTestId('qr-product-card-102'));
      expect(screen.getByTestId('qr-addon-serving-mode-bar')).toBeInTheDocument();
      expect(screen.getByTestId('qr-addon-mode-dine-in')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByTestId('qr-addon-mode-takeaway'));
      expect(screen.getByTestId('qr-addon-mode-takeaway')).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(screen.getByTestId('qr-submit-order-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenLastCalledWith(
          '/api/v1/public/orders/qr',
          expect.objectContaining({
            qrToken: validQrToken,
            activeOrderId: 540,
            isTakeawayBatch: true,
            items: [
              expect.objectContaining({
                productId: 102,
                quantity: 1,
                isTakeaway: true,
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
              createdAt: new Date().toISOString(),
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
        if (url === '/api/v1/pos/drafts') return { drafts: [] };
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/601') return pendingOrderDetail;
        if (url === '/api/v1/pos/orders/604') return takeawayOrderDetail;
        throw new Error(`Unexpected GET ${url}`);
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string, body?: unknown) => {
        if (url === '/api/v1/pos/orders/601/approve') {
          return { orderId: 601, status: 'SERVING' };
        }
        if (url === '/api/v1/pos/drafts') {
          return {
            ...(body as Record<string, unknown>),
            id: 'draft-604',
            revision: 1,
            tableName: null,
            createdAt: '2026-11-08T08:15:00.000Z',
            updatedAt: '2026-11-08T08:15:00.000Z',
          };
        }
        if (url === '/api/v1/pos/drafts/draft-604/submit') {
          return {
            draftId: 'draft-604',
            idempotentReplay: false,
            order: {
              orderId: 604,
              orderCode: 'HD-20261108-0013',
              orderType: 'TAKEAWAY',
              tableId: null,
              takeawayNumber: 2,
              tableLabel: 'Mang về #02',
              status: 'SERVING',
              totalAmount: 30000,
            },
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
          '/api/v1/pos/drafts',
          expect.objectContaining({
            orderType: 'TAKEAWAY',
            tableId: null,
            items: [expect.objectContaining({ productId: 102, quantity: 1 })],
          }),
        );
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/pos/drafts/draft-604/submit',
          expect.objectContaining({ expectedRevision: 1, idempotencyKey: expect.any(String) }),
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
            paymentAccount: {
              id: 1,
              label: 'TK Chính (VPBank)',
              bankCode: 'VPB',
              bankName: 'VPBank',
              accountNo: '186877721',
              accountName: 'THAN THI LOAN',
            },
            qrRotated: false,
            qrOverLimit: false,
          };
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

      // Click [In tạm tính (QR)] -> opens Popover -> click [Tất cả] -> calls provisional-bill, keeps order SERVING
      fireEvent.click(screen.getByTestId('btn-provisional-bill'));
      fireEvent.click(screen.getByTestId('provisional-option-all'));
      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/orders/700/provisional-bill', {});
      });
      expect(screen.getByTestId('invoice-status-badge')).toHaveTextContent(/SERVING|Đang phục vụ/);

      // Click [Thanh toán] -> opens Popover -> click [Tất cả] -> opens 2-step CheckoutConfirmDialog
      fireEvent.click(screen.getByTestId('btn-checkout'));
      fireEvent.click(screen.getByTestId('checkout-option-all'));
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

      // Branch A (EC-POS-06): Delete NEW item (opens popover confirmation then confirms delete)
      fireEvent.click(screen.getByTestId('delete-new-item-9202'));
      fireEvent.click(screen.getByTestId('confirm-delete-new-item-9202'));
      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/801/items', {
          removeItemIds: [9202],
        });
      });

      // EC-POS-03 (updated): Click [Đổi / Gộp bàn] on TAKEAWAY order -> allows MOVE to empty table or MERGE into occupied table (no SWAP)
      fireEvent.click(screen.getByTestId('btn-table-action'));
      expect(screen.getByTestId('table-action-type-MOVE')).toBeInTheDocument();
      expect(screen.getByTestId('table-action-type-MERGE')).toBeInTheDocument();
      expect(screen.queryByTestId('table-action-type-SWAP')).not.toBeInTheDocument();
      expect(screen.getByTestId('confirm-table-action-btn')).toBeInTheDocument();
    });
  });

  describe('AC-09.5: QR 3-Tier Menu Sync, Out-of-Stock Toppings & Placed Orders Drawer', () => {
    it('should sync stations/categories, show disabled strikethrough "Tạm hết" topping with active substitutes, and toggle "Món đã gọi" strictly while activeOrder has items', async () => {
      const qrToken = '550e8400-e29b-41d4-a716-446655440009';
      const menuWithOutStockAndActiveOrder: PublicMenuResponse = {
        table: {
          tableId: 9,
          tableName: 'Bàn 09',
          status: 'OCCUPIED',
          activeOrderId: 910,
        },
        stations: [
          { id: 1, code: 'BEP_NAU', name: 'Bếp Nấu', sortOrder: 1 },
          { id: 2, code: 'PHA_CHE', name: 'Pha Chế', sortOrder: 2 },
        ],
        categories: [
          { id: 10, code: 'MI_CAY', name: 'Mì Cay', stationCode: 'BEP_NAU', sortOrder: 1 },
          { id: 20, code: 'TRA_SUA', name: 'Trà Sữa', stationCode: 'PHA_CHE', sortOrder: 2 },
        ],
        products: [
          {
            id: 301,
            name: 'Mì Cay Hải Sản',
            categoryId: 10,
            categoryName: 'Mì Cay',
            price: 69000,
            station: 'BEP_NAU',
            isAvailable: true,
            imageUrl: null,
            sortOrder: 1,
            comboItems: [],
            modifierGroups: [
              {
                id: 30,
                name: 'Đồ ăn chính',
                isRequired: false,
                maxSelect: 3,
                isAutoSelect: true,
                allowSubstitution: true,
                modifiers: [
                  { id: 3001, name: 'Tôm', extraPrice: 0, isDefaultChecked: true, isAvailable: false, defaultSubstituteName: 'Mực' },
                  { id: 3002, name: 'Mực', extraPrice: 0, isDefaultChecked: true, isAvailable: true, defaultSubstituteName: 'Ngao' },
                  { id: 3003, name: 'Ngao', extraPrice: 0, isDefaultChecked: true, isAvailable: true, defaultSubstituteName: 'Mực' },
                ],
              },
            ],
          },
          {
            id: 302,
            name: 'Trà Sữa Truyền Thống',
            categoryId: 20,
            categoryName: 'Trà Sữa',
            price: 35000,
            station: 'PHA_CHE',
            isAvailable: true,
            imageUrl: null,
            sortOrder: 2,
            comboItems: [],
            modifierGroups: [],
          },
        ],
        activeOrder: {
          orderId: 910,
          orderCode: 'HD-20261114-0910',
          status: 'SERVING',
          totalAmount: 69000,
          createdAt: '2026-11-14T04:00:00.000Z',
          items: [
            {
              id: 5001,
              productId: 301,
              productName: 'Mì Cay Hải Sản',
              quantity: 1,
              unitPrice: 69000,
              lineTotal: 69000,
              batchNo: 1,
              kitchenStatus: 'PRINTED',
              itemNote: null,
              modifiers: [
                {
                  groupId: 30,
                  modifierId: 3001,
                  name: 'Đổi Tôm → Mực',
                  action: 'SUBSTITUTE',
                  substitutedFromName: 'Tôm',
                  substituteName: 'Mực',
                  extraPrice: 0,
                },
              ],
              createdAt: '2026-11-14T04:00:00.000Z',
            },
          ],
        },
        updatedAt: '2026-11-14T04:00:00.000Z',
      };

      const menuAfterPaid: PublicMenuResponse = {
        ...menuWithOutStockAndActiveOrder,
        table: {
          tableId: 9,
          tableName: 'Bàn 09',
          status: 'AVAILABLE',
          activeOrderId: null,
        },
        activeOrder: null,
      };

      let getCalls = 0;
      vi.spyOn(apiClient, 'get').mockImplementation(async () => {
        getCalls += 1;
        return getCalls === 1 ? menuWithOutStockAndActiveOrder : menuAfterPaid;
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <MemoryRouter initialEntries={[`/qr/${qrToken}`]} future={routerFutureFlags}>
              <Routes>
                <Route path="/qr/:token" element={<QrOrderPage />} />
              </Routes>
            </MemoryRouter>
          </SocketProvider>
        </QueryProvider>,
      );

      // 3-tier filtering: select PHA_CHE station -> shows Trà Sữa, hides Mì Cay Hải Sản
      await waitFor(() => {
        expect(screen.getByTestId('qr-station-tab-PHA_CHE')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('qr-station-tab-PHA_CHE'));
      expect(screen.getByTestId('qr-category-tab-20')).toBeInTheDocument();
      expect(screen.queryByTestId('qr-product-card-301')).not.toBeInTheDocument();
      expect(screen.getByTestId('qr-product-card-302')).toBeInTheDocument();

      // Switch back to ALL and open Mì Cay Hải Sản modifier sheet -> Tôm is disabled + strikethrough + "Tạm hết"
      fireEvent.click(screen.getByTestId('qr-station-tab-ALL'));
      fireEvent.click(screen.getByTestId('qr-product-card-301'));
      expect(screen.getByTestId('modifier-option-3001')).toBeDisabled();
      expect(screen.getByTestId('modifier-out-of-stock-3001')).toHaveTextContent('Tạm hết');
      expect(screen.getByTestId('modifier-option-3002')).not.toBeDisabled();

      // Close modifier sheet and open "Món đã gọi" bar
      fireEvent.keyDown(document, { key: 'Escape' });
      const placedBar = screen.getByTestId('qr-placed-orders-bar');
      expect(placedBar).toHaveTextContent('Món đã gọi');
      fireEvent.click(placedBar);
      await waitFor(() => {
        expect(screen.getByTestId('qr-placed-orders-sheet')).toBeInTheDocument();
      });
      expect(screen.getByTestId('qr-placed-orders-sheet')).toHaveTextContent(/Đổi Tôm → Mực/);

      // Emit PAID status via socket -> "Món đã gọi" button hides cleanly
      act(() => {
        mockSocketInstance.emitServerEvent('order:status_updated', {
          orderId: 910,
          status: 'PAID',
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('qr-placed-orders-bar')).not.toBeInTheDocument();
      });
    });
  });

  describe('AC-09.6: QR Voice Announcer Controls & Real-time Voice Alert on POS', () => {
    it('should toggle voice alert state in localStorage, play sample voice on test button, and trigger voice alert on ORDER_QR_NEW / ORDER_QR_ADDON', async () => {
      const enqueueSpy = vi
        .spyOn(qrVoiceAnnouncer, 'enqueueQrVoiceAlert')
        .mockResolvedValue(undefined);

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
        takeaways: [],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGridResponse;
        if (url === '/api/v1/menu/products') return mockProducts;
        throw new Error(`Unexpected GET ${url}`);
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
        expect(screen.getByTestId('toggle-qr-voice-btn')).toBeInTheDocument();
      });

      const toggleBtn = screen.getByTestId('toggle-qr-voice-btn');
      expect(toggleBtn).toHaveTextContent('Loa báo đơn: Bật');

      // Click toggle -> disables voice in localStorage
      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveTextContent('Loa báo đơn: Tắt');
      expect(localStorage.getItem(qrVoiceAnnouncer.QR_VOICE_ALERT_STORAGE_KEY)).toBe('false');

      // Re-enable -> ready for socket events
      fireEvent.click(toggleBtn);
      expect(toggleBtn).toHaveTextContent('Loa báo đơn: Bật');
      expect(localStorage.getItem(qrVoiceAnnouncer.QR_VOICE_ALERT_STORAGE_KEY)).toBe('true');

      // Emit ORDER_QR_NEW and ORDER_QR_ADDON via socket
      act(() => {
        mockSocketInstance.emitServerEvent('order:qr_new', {
          orderId: 777,
          tableId: 1,
          tableLabel: 'Bàn 01',
          totalAmount: 55000,
        });
        mockSocketInstance.emitServerEvent('order:qr_addon', {
          orderId: 777,
          tableId: 1,
          tableLabel: 'Bàn 01',
          batchNo: 2,
          totalAmount: 85000,
        });
      });

      expect(enqueueSpy).toHaveBeenCalledWith({
        tableLabel: 'Bàn 01',
        kind: 'NEW',
      });
      expect(enqueueSpy).toHaveBeenCalledWith({
        tableLabel: 'Bàn 01',
        kind: 'ADDON',
      });
    });

    it('should build /qr/:token URLs, render 100% offline SVG QR preview, and print 80mm thermal slip without external QR APIs', async () => {
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
      vi.spyOn(apiClient, 'get').mockResolvedValue({} as never);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      const tables: PosTableGridResponse['tables'] = [
        {
          id: 5,
          name: 'Bàn 05',
          status: 'AVAILABLE',
          activeOrderId: null,
          activeOrder: null,
          qrToken: 'token-ban-05',
        },
      ];

      render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <TableManageDialog
              open={true}
              onOpenChange={vi.fn()}
              tables={tables}
              canManageTables={true}
            />
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      const openPrintBtn = await screen.findByTestId('print-pos-table-qr-btn-5');
      fireEvent.click(openPrintBtn);

      const dialog = await screen.findByTestId('table-print-qr-dialog');
      expect(dialog).toBeInTheDocument();

      const expectedUrl = `${window.location.origin}/q/token-ban-05`;
      expect(dialog).toHaveTextContent(expectedUrl);
      expect(dialog.innerHTML).not.toContain('qrserver.com');
      expect(dialog.innerHTML).not.toContain('/qr?token=');

      const qrImg = await waitFor(() => {
        const img = screen.getByAltText('QR Bàn 05') as HTMLImageElement;
        expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
        return img;
      });
      expect(qrImg).toBeInTheDocument();

      const printBtn = screen.getByTestId('trigger-print-table-qr-btn');
      await waitFor(() => expect(printBtn).not.toBeDisabled());
      fireEvent.click(printBtn);

      await waitFor(() => {
        expect(printSpy).toHaveBeenCalledTimes(1);
      });
      const printContainer = document.getElementById('thermal-print-container');
      expect(printContainer).not.toBeNull();
      expect(printContainer?.textContent).toContain('Bàn 05');
      expect(printContainer?.textContent).toContain(expectedUrl);
    });

    it('highlights overdue (>5m) QR new orders & QR addons in red, shows invoice overdue warning, and handles ORDER_QR_AUTO_CANCELLED', async () => {
      const sixMinsAgo = new Date(Date.now() - 6 * 60_000).toISOString();
      const twoMinsAgo = new Date(Date.now() - 2 * 60_000).toISOString();

      let currentGrid: PosTableGridResponse = {
        tables: [
          {
            id: 2,
            name: 'Bàn 02',
            status: 'PENDING',
            activeOrderId: 901,
            activeOrder: {
              orderId: 901,
              orderCode: 'HD-901',
              orderType: 'DINE_IN',
              tableId: 2,
              tableLabel: 'Bàn 02',
              takeawayNumber: null,
              status: 'PENDING',
              totalAmount: 55000,
              createdAt: sixMinsAgo,
              pendingQrSince: sixMinsAgo,
              pendingQrKind: 'NEW',
            },
          },
          {
            id: 3,
            name: 'Bàn 03',
            status: 'PENDING',
            activeOrderId: 902,
            activeOrder: {
              orderId: 902,
              orderCode: 'HD-902',
              orderType: 'DINE_IN',
              tableId: 3,
              tableLabel: 'Bàn 03',
              takeawayNumber: null,
              status: 'PENDING',
              totalAmount: 45000,
              createdAt: twoMinsAgo,
              pendingQrSince: twoMinsAgo,
              pendingQrKind: 'NEW',
            },
          },
          {
            id: 7,
            name: 'Bàn 07',
            status: 'OCCUPIED',
            activeOrderId: 903,
            activeOrder: {
              orderId: 903,
              orderCode: 'HD-903',
              orderType: 'DINE_IN',
              tableId: 7,
              tableLabel: 'Bàn 07',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 120000,
              createdAt: sixMinsAgo,
              hasUnprintedAddon: true,
              unprintedAddonBatchNo: 2,
              pendingQrSince: sixMinsAgo,
              pendingQrKind: 'ADDON',
            },
          },
        ],
        takeaways: [],
      };

      const pendingOrder901: OrderDetailResponse = {
        orderId: 901,
        orderCode: 'HD-901',
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
        createdAt: sixMinsAgo,
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 1,
            productId: 11,
            name: 'Mì cay',
            quantity: 1,
            unitPrice: 55000,
            lineTotal: 55000,
            modifiers: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'NEW',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return currentGrid;
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/901') return pendingOrder901;
        throw new Error(`Unexpected GET ${url}`);
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

      // Overdue banner & red badges appear strictly for >= 5m tables (02 & 07), NOT 03 (2m)
      const banner = await screen.findByTestId('pos-overdue-qr-banner');
      expect(banner).toHaveTextContent('Bàn 02');
      expect(banner).toHaveTextContent('Bàn 07');
      expect(banner).not.toHaveTextContent('Bàn 03');
      expect(screen.getByTestId('table-overdue-badge-2')).toBeInTheDocument();
      expect(screen.getByTestId('table-overdue-badge-7')).toBeInTheDocument();
      expect(screen.queryByTestId('table-overdue-badge-3')).not.toBeInTheDocument();

      // Click Bàn 02 -> LiveInvoicePanel shows red overdue countdown alert
      fireEvent.click(screen.getByTestId('table-card-2'));
      const invoiceAlert = await screen.findByTestId('invoice-overdue-qr-alert');
      expect(invoiceAlert).toHaveTextContent('6 phút');
      expect(invoiceAlert).toHaveTextContent('Tự động huỷ');

      // Simulate backend 12-minute auto-cancel Socket event for Bàn 02
      currentGrid = {
        ...currentGrid,
        tables: currentGrid.tables.map((t) =>
          t.id === 2
            ? { ...t, status: 'AVAILABLE', activeOrderId: null, activeOrder: null }
            : t,
        ),
      };
      act(() => {
        mockSocketInstance.emitServerEvent('order:qr_auto_cancelled', {
          orderId: 901,
          orderCode: 'HD-901',
          tableId: 2,
          tableLabel: 'Bàn 02',
          kind: 'NEW',
          cancelledItemCount: 1,
          autoCancelMinutes: 12,
          cancelledAt: new Date().toISOString(),
          reason: 'Tự động huỷ do quá 12 phút chưa xác nhận',
        });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('invoice-header-label')).not.toBeInTheDocument();
        expect(screen.queryByTestId('table-overdue-badge-2')).not.toBeInTheDocument();
      });
    });
  });

  describe('RBAC read-only guard (adminview)', () => {
    it('hides all POS write actions when user only has pos.view', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'adminview-jwt-token',
        user: {
          id: 99,
          employeeId: 99,
          username: 'adminview',
          fullName: 'Quản lý chỉ xem',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({
            pos: { view: true },
            menu: { view: true },
          }),
        },
      });

      const gridResponse: PosTableGridResponse = {
        tables: [
          { id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null, activeOrder: null },
          {
            id: 2,
            name: 'Bàn 02',
            status: 'OCCUPIED',
            activeOrderId: 777,
            activeOrder: {
              orderId: 777,
              orderCode: 'HD-777',
              orderType: 'DINE_IN',
              tableId: 2,
              tableLabel: 'Bàn 02',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 45000,
              createdAt: '2026-11-18T00:00:00.000Z',
              pendingQrSince: null,
              pendingQrKind: null,
              hasUnprintedAddon: false,
              unprintedAddonBatchNo: null,
            },
          },
        ],
        takeaways: [],
      };

      const orderDetail: OrderDetailResponse = {
        orderId: 777,
        orderCode: 'HD-777',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 2,
        tableLabel: 'Bàn 02',
        takeawayNumber: null,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        totalAmount: 45000,
        note: null,
        createdAt: '2026-11-18T00:00:00.000Z',
        paidAt: null,
        tableTransferLogs: [],
        items: [
          {
            id: 1,
            productId: 101,
            name: 'Mì Hải Sản',
            quantity: 1,
            unitPrice: 45000,
            lineTotal: 45000,
            modifiers: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'PRINTED',
          },
        ],
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return gridResponse;
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/777') return orderDetail;
        throw new Error(`Unexpected GET ${url}`);
      });

      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <SocketProvider>
            <ThermalPrintProvider>
              <MemoryRouter future={routerFutureFlags}>
                <PosUnifiedPage />
              </MemoryRouter>
            </ThermalPrintProvider>
          </SocketProvider>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('table-card-1')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('create-takeaway-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('open-table-manager-btn')).not.toBeInTheDocument();
      expect(screen.queryByTestId('pos-goto-menu-admin-btn')).not.toBeInTheDocument();

      // Clicking empty Bàn 01 must NOT create a draft
      fireEvent.click(screen.getByTestId('table-card-1'));
      expect(screen.queryByTestId('pos-submit-new-order-btn')).not.toBeInTheDocument();

      // Clicking serving Bàn 02 shows order details but hides write/checkout buttons
      fireEvent.click(screen.getByTestId('table-card-2'));
      await waitFor(() => {
        expect(screen.getByTestId('invoice-header-label')).toHaveTextContent('Bàn 02');
      });

      expect(screen.queryByTestId('btn-table-action')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-split-kitchen')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-provisional-bill')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-checkout')).not.toBeInTheDocument();
      expect(screen.queryByTestId('btn-open-discount')).not.toBeInTheDocument();
      expect(screen.queryByTestId('cancel-printed-item-1')).not.toBeInTheDocument();
    });

    it('disables table action and hides item mutation buttons when viewing a PAID order', () => {
      const paidOrder: OrderDetailResponse = {
        orderId: 100,
        orderCode: 'HD-20261118-0010',
        orderType: 'DINE_IN',
        orderSource: 'QR_CODE',
        tableId: 4,
        tableLabel: 'Bàn 04',
        takeawayNumber: null,
        status: 'PAID',
        paymentMethod: 'CASH',
        cashAmount: 50000,
        transferAmount: 0,
        subtotalAmount: 50000,
        discountAmount: 0,
        discountId: null,
        discountSnapshot: null,
        discountWarning: null,
        totalAmount: 50000,
        note: null,
        createdAt: new Date().toISOString(),
        paidAt: new Date().toISOString(),
        tableTransferLogs: [],
        items: [
          {
            id: 1,
            productId: 10,
            categoryId: 1,
            name: 'Mì Bò Mỹ',
            quantity: 1,
            unitPrice: 50000,
            lineTotal: 50000,
            modifiers: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'PRINTED',
          },
        ],
      };

      render(
        <LiveInvoicePanel
          order={paidOrder}
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
        />,
      );

      expect(screen.getByTestId('btn-table-action')).toBeDisabled();
      expect(screen.getByTestId('btn-split-kitchen')).toBeDisabled();
      expect(screen.getByTestId('btn-provisional-bill')).toBeDisabled();
      expect(screen.getByTestId('btn-checkout')).toBeDisabled();
      expect(screen.queryByTestId('cancel-printed-item-1')).not.toBeInTheDocument();
    });

    it('renders Takeaway QR management card, exports single PNG & batch ZIP, toggles Takeaway QR security, and displays Quét QR mang về + note on LiveInvoicePanel', async () => {
      const tableToken = 'a'.repeat(64);
      const takeawayToken = 'e'.repeat(64);
      const rotatedToken = 'b'.repeat(64);

      const pngSpy = vi
        .spyOn(qrExportUtils, 'renderQrCardPngBlob')
        .mockResolvedValue(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
      const zipSpy = vi
        .spyOn(qrExportUtils, 'createStoredZipBlob')
        .mockReturnValue(new Blob([new Uint8Array([4, 5])], { type: 'application/zip' }));
      const downloadSpy = vi
        .spyOn(qrExportUtils, 'downloadBlobFile')
        .mockImplementation(() => undefined);

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ qrToken: rotatedToken });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <TableManageDialog
              open
              onOpenChange={vi.fn()}
              tables={[
                {
                  id: 1,
                  name: 'Bàn 01',
                  qrToken: tableToken,
                  status: 'AVAILABLE',
                  activeOrderId: null,
                  activeOrder: null,
                },
              ]}
              takeawayQrToken={takeawayToken}
              canManageTables
            />
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      expect(screen.getByTestId('takeaway-qr-manage-card')).toBeInTheDocument();

      // Single PNG download for Bàn 01 and Takeaway QR
      fireEvent.click(screen.getByTestId('download-pos-table-qr-btn-1'));
      await waitFor(() => expect(pngSpy).toHaveBeenCalledTimes(1));
      expect(downloadSpy).toHaveBeenCalledWith(expect.any(Blob), 'qr-ban-01.png');

      fireEvent.click(screen.getByTestId('download-takeaway-qr-btn'));
      await waitFor(() => expect(pngSpy).toHaveBeenCalledTimes(2));
      expect(downloadSpy).toHaveBeenCalledWith(expect.any(Blob), 'qr-don-mang-ve.png');

      // Preview dialog PNG download button
      fireEvent.click(screen.getByTestId('print-takeaway-qr-btn'));
      expect(await screen.findByTestId('download-print-table-qr-btn')).toBeInTheDocument();

      // Batch ZIP download
      fireEvent.click(screen.getByTestId('download-all-qr-zip-btn'));
      await waitFor(() => expect(zipSpy).toHaveBeenCalledTimes(1));
      expect(downloadSpy).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringMatching(/^qr-.*\.zip$/),
      );

      // Rotate Takeaway QR confirmation
      fireEvent.click(screen.getByTestId('rotate-takeaway-qr-btn'));
      fireEvent.click(await screen.findByTestId('confirm-rotate-table-qr-btn'));
      await waitFor(() =>
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/takeaway-qr/rotate', {}),
      );

      // QrSecurityConfigDialog applySecurityToTakeaway toggle
      vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
        wifiProtectionEnabled: false,
        autoSyncPosIp: true,
        allowedWifiIps: [],
        wifiSsid: '',
        wifiPassword: '',
        geoProtectionEnabled: false,
        shopLatitude: null,
        shopLongitude: null,
        geoRadiusMeters: 200,
        applySecurityToTakeaway: false,
        detectedClientIp: '127.0.0.1',
        syncedPosIp: '127.0.0.1',
        updatedAt: '2026-11-22T00:00:00.000Z',
      });
      const putSecuritySpy = vi.spyOn(apiClient, 'put').mockResolvedValueOnce({
        wifiProtectionEnabled: false,
        autoSyncPosIp: true,
        allowedWifiIps: [],
        wifiSsid: '',
        wifiPassword: '',
        geoProtectionEnabled: false,
        shopLatitude: null,
        shopLongitude: null,
        geoRadiusMeters: 200,
        applySecurityToTakeaway: true,
        detectedClientIp: '127.0.0.1',
        syncedPosIp: '127.0.0.1',
        updatedAt: '2026-11-22T00:00:00.000Z',
      });

      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <QrSecurityConfigDialog open onOpenChange={vi.fn()} />
        </QueryProvider>,
      );

      const takeawayToggle = await screen.findByTestId('toggle-takeaway-qr-security-btn');
      expect(takeawayToggle).toHaveTextContent('Đang TẮT');
      fireEvent.click(takeawayToggle);
      expect(takeawayToggle).toHaveTextContent('Đang BẬT');
      fireEvent.click(screen.getByTestId('save-qr-security-config-btn'));
      await waitFor(() =>
        expect(putSecuritySpy).toHaveBeenCalledWith(
          '/api/v1/pos/qr-security-config',
          expect.objectContaining({ applySecurityToTakeaway: true }),
        ),
      );

      // LiveInvoicePanel shows "Quét QR mang về" and order.note
      const qrTakeawayOrder: OrderDetailResponse = {
        orderId: 300,
        orderCode: 'HD-20261122-0001',
        orderType: 'TAKEAWAY',
        orderSource: 'QR_CODE',
        tableId: null,
        tableLabel: null,
        takeawayNumber: 1,
        status: 'PENDING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        subtotalAmount: 45000,
        discountAmount: 0,
        discountId: null,
        discountSnapshot: null,
        discountWarning: null,
        totalAmount: 45000,
        note: 'Khách: Anh Minh - 0901234567 | Ít cay',
        createdAt: new Date().toISOString(),
        paidAt: null,
        tableTransferLogs: [],
        items: [],
      };
      render(
        <LiveInvoicePanel
          order={qrTakeawayOrder}
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
        />,
      );
      expect(screen.getByText('Quét QR mang về')).toBeInTheDocument();
      expect(screen.getByTestId('invoice-order-note')).toHaveTextContent(
        'Khách: Anh Minh - 0901234567 | Ít cay',
      );
    });

    it('displays /q/:token short chips and converts untouched legacy long QR tokens in 1 click', async () => {
      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        updatedTables: 1,
        updatedTakeaway: true,
      });

      const tables: PosTableGridResponse['tables'] = [
        {
          id: 5,
          name: 'Bàn 05',
          status: 'AVAILABLE',
          activeOrderId: null,
          activeOrder: null,
          qrToken: 'a'.repeat(64),
        },
      ];

      render(
        <QueryProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <ThermalPrintProvider>
            <TableManageDialog
              open={true}
              onOpenChange={vi.fn()}
              tables={tables}
              takeawayQrToken="mangve-x4p2"
              canManageTables={true}
            />
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      expect(screen.getByTestId('copy-short-takeaway-qr-chip')).toHaveTextContent('/q/mangve-x4p2');
      const shortenBtn = screen.getByTestId('shorten-legacy-qr-btn');
      fireEvent.click(shortenBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/tables/shorten-qr', {});
      });
    });

    it('lets authorized admins customize QR card template inside TableManageDialog, blocks non-settings roles from saving, and syncs 80mm Takeaway slip copy', async () => {
      const serverUpdatedAt = '2026-11-22T08:00:00.000Z';
      let currentSettings: PublicStoreSettingsResponse = {
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: serverUpdatedAt,
        assets: { logo: 'v-logo', favicon: null, qrLogo: null },
        qrCard: { ...QR_CARD_DEFAULTS },
      };

      const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/settings' || url === '/api/v1/public/store-settings') {
          return currentSettings;
        }
        throw new Error(`Unexpected GET ${url}`);
      });

      const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (_url, body) => {
        const savedFields = { ...(body as Record<string, unknown>) };
        delete savedFields.expectedUpdatedAt;
        currentSettings = {
          ...currentSettings,
          ...(savedFields as Partial<PublicStoreSettingsResponse>),
          updatedAt: '2026-11-22T08:05:00.000Z',
        };
        return currentSettings;
      });
      const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});

      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: {
          id: 1,
          employeeId: 1,
          username: 'superadmin',
          fullName: 'Chủ Quán',
          isSuperAdmin: true,
          permissions: UserPermissionsSchema.parse({
            pos: { view: true, update: true },
            settings: { view: true, update: true },
          }),
        },
      });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryProvider client={queryClient}>
          <ThermalPrintProvider>
            <TableManageDialog
              open={true}
              onOpenChange={vi.fn()}
              tables={[
                {
                  id: 1,
                  name: 'Bàn 01',
                  qrToken: 'ban01-zry8',
                  status: 'AVAILABLE',
                  activeOrderId: null,
                  activeOrder: null,
                },
              ]}
              takeawayQrToken="mangve-qpy2"
              canManageTables={true}
            />
          </ThermalPrintProvider>
        </QueryProvider>,
      );

      fireEvent.click(screen.getByTestId('open-qr-template-customizer-btn'));
      expect(await screen.findByTestId('qr-card-quick-dialog')).toBeInTheDocument();
      await waitFor(() => expect(getSpy).toHaveBeenCalledWith('/api/v1/settings'));

      fireEvent.change(screen.getByTestId('input-qr-card-takeaway-headline'), {
        target: { value: 'QUÉT MÃ MANG VỀ TẠI QUẦY' },
      });
      fireEvent.change(screen.getByTestId('input-qr-card-footer-text'), {
        target: { value: 'Quét mã để order ngay!' },
      });
      fireEvent.click(screen.getByTestId('checkbox-qr-card-show-link'));
      fireEvent.click(screen.getByTestId('qr-card-quick-save-btn'));

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith(
          '/api/v1/settings',
          expect.objectContaining({
            expectedUpdatedAt: serverUpdatedAt,
            qrCard: expect.objectContaining({
              takeawayHeadline: 'QUÉT MÃ MANG VỀ TẠI QUẦY',
              footerText: 'Quét mã để order ngay!',
              showLinkText: false,
            }),
          }),
        );
      });

      // Wait for quick dialog close, then open Takeaway 80mm preview & verify synced copy (and hidden link)
      await waitFor(() => {
        expect(screen.queryByTestId('qr-card-quick-dialog')).not.toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('print-takeaway-qr-btn'));
      const slipPreview = await screen.findByTestId('thermal-table-qr-slip');
      expect(slipPreview).toHaveTextContent('QUÉT MÃ MANG VỀ TẠI QUẦY');
      expect(slipPreview).toHaveTextContent('Quét mã để order ngay!');
      expect(screen.queryByTestId('preview-table-qr-link-text')).not.toBeInTheDocument();

      const triggerPrintBtn = screen.getByTestId('trigger-print-table-qr-btn');
      await waitFor(() => expect(triggerPrintBtn).not.toBeDisabled());
      fireEvent.click(triggerPrintBtn);

      await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
      const printDom = document.getElementById('thermal-print-container');
      expect(printDom?.textContent).toContain('QUÉT MÃ MANG VỀ TẠI QUẦY');
      expect(printDom?.textContent).toContain('Quét mã để order ngay!');
      expect(printDom?.textContent).not.toContain('/q/mangve-qpy2');

      // Switch to cashier without settings:update permission -> quick dialog becomes strictly read-only
      act(() => {
        useAuthStore.getState().setAuth({
          accessToken: 'cashier-token',
          user: {
            id: 3,
            employeeId: 3,
            username: 'thungan01',
            fullName: 'Thu Ngân',
            isSuperAdmin: false,
            permissions: UserPermissionsSchema.parse({
              pos: { view: true, update: true },
              settings: { view: false, update: false },
            }),
          },
        });
      });
      fireEvent.click(screen.getByTestId('open-qr-template-customizer-btn'));
      expect(await screen.findByTestId('qr-card-quick-dialog')).toBeInTheDocument();
      await waitFor(() => {
        expect(screen.queryByTestId('qr-card-quick-save-btn')).not.toBeInTheDocument();
        expect(screen.getByTestId('input-qr-card-takeaway-headline')).toBeDisabled();
      });
      await screen.findByAltText('Xem trước mã QR');
    });
  });

  describe('Direct click-to-edit unprinted (NEW) & draft items + 409 concurrency race', () => {
    it('edits a draft item options/qty/note on click without opening modal from +/- buttons', async () => {
      const tableGrid: PosTableGridResponse = {
        tables: [
          { id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null, activeOrder: null },
        ],
        takeaways: [],
      };
      vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(new MockSocket() as never);
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGrid;
        if (url === '/api/v1/pos/drafts') return { drafts: [] };
        if (url === '/api/v1/menu/products') return mockProducts;
        return [];
      });

      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 3,
          employeeId: 3,
          username: 'thungan01',
          fullName: 'Thu Ngân',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({
            pos: { view: true, create: true, update: true },
          }),
        },
      });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <ThermalPrintProvider>
              <MemoryRouter future={routerFutureFlags}>
                <PosUnifiedPage />
              </MemoryRouter>
            </ThermalPrintProvider>
          </SocketProvider>
        </QueryProvider>,
      );

      // Select Bàn 01 (draft mode) and add Mì Kim Chi Bò Mỹ (Cấp 0)
      fireEvent.click(await screen.findByTestId('table-card-1'));
      fireEvent.click(await screen.findByTestId('pos-menu-product-101'));
      expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('pos-mod-option-10'));
      fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));

      const draftRow = await screen.findByTestId('draft-item-0');
      expect(draftRow).toHaveTextContent('Mì Kim Chi Bò Mỹ');
      expect(draftRow).toHaveTextContent('55.000 đ');

      // Quick + button increments quantity without opening edit modal
      fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng Mì Kim Chi Bò Mỹ' }));
      expect(screen.queryByTestId('pos-modifier-modal')).not.toBeInTheDocument();
      expect(screen.getByTestId('draft-item-0')).toHaveTextContent('110.000 đ');

      // Click directly on draft item -> opens edit modal pre-populated with Cấp 0 & qty 2
      fireEvent.click(screen.getByTestId('edit-draft-item-0'));
      expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
      expect(screen.getByTestId('pos-modal-edit-badge')).toHaveTextContent('Chỉnh sửa món');
      expect(screen.getByTestId('pos-confirm-modifier-btn')).toHaveTextContent('Lưu thay đổi');

      // Change spice to Cấp 3 (12), add Bò Mỹ (20, +20k), and set note "Không hành"
      fireEvent.click(screen.getByTestId('pos-mod-option-12'));
      fireEvent.click(screen.getByTestId('pos-mod-option-20'));
      fireEvent.change(screen.getByTestId('pos-item-note-input'), {
        target: { value: 'Không hành' },
      });
      fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('pos-modifier-modal')).not.toBeInTheDocument();
      });
      const updatedDraftRow = screen.getByTestId('draft-item-0');
      expect(updatedDraftRow).toHaveTextContent('Cấp 3');
      expect(updatedDraftRow).toHaveTextContent('Thêm Bò Mỹ');
      expect(updatedDraftRow).toHaveTextContent('Ghi chú: Không hành');
      expect(updatedDraftRow).toHaveTextContent('150.000 đ');
    });

    it('edits NEW live items (including zero-modifier items), blocks PRINTED/CANCELLED & readonly roles, and handles 409 POS_ITEM_ALREADY_PRINTED', async () => {
      const tableGrid: PosTableGridResponse = {
        tables: [
          {
            id: 2,
            name: 'Bàn 02',
            status: 'OCCUPIED',
            activeOrderId: 502,
            activeOrder: {
              orderId: 502,
              orderCode: 'HD-20261127-0502',
              orderType: 'DINE_IN',
              tableId: 2,
              tableLabel: 'Bàn 02',
              takeawayNumber: null,
              status: 'SERVING',
              totalAmount: 195000,
              createdAt: '2026-11-27T04:00:00.000Z',
            },
          },
        ],
        takeaways: [],
      };

      const orderDetail: OrderDetailResponse = {
        orderId: 502,
        orderCode: 'HD-20261127-0502',
        orderType: 'DINE_IN',
        orderSource: 'POS_COUNTER',
        tableId: 2,
        tableLabel: 'Bàn 02',
        takeawayNumber: null,
        takeawayLabelFormat: null,
        status: 'SERVING',
        paymentMethod: null,
        cashAmount: 0,
        transferAmount: 0,
        subtotalAmount: 150000,
        discountAmount: 0,
        totalAmount: 150000,
        note: null,
        createdAt: '2026-11-27T04:00:00.000Z',
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
            modifiers: ['Cấp 0'],
            modifierSelections: [{ groupId: 1, modifierId: 10 }],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'PRINTED',
            isTakeaway: false,
          },
          {
            id: 9002,
            productId: 101,
            name: 'Mì Kim Chi Bò Mỹ',
            quantity: 1,
            unitPrice: 65000,
            lineTotal: 65000,
            modifiers: ['Cấp 1', 'Thêm Phô Mai'],
            modifierSelections: [
              { groupId: 1, modifierId: 11 },
              { groupId: 2, modifierId: 21 },
            ],
            itemNote: 'Ít hành',
            batchNo: 2,
            kitchenStatus: 'NEW',
            isTakeaway: false,
          },
          {
            id: 9003,
            productId: 102,
            name: 'Trà Đào Cam Sả',
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 30000,
            modifiers: [],
            modifierSelections: [],
            itemNote: null,
            batchNo: 2,
            kitchenStatus: 'NEW',
            isTakeaway: false,
          },
          {
            id: 9004,
            productId: 102,
            name: 'Trà Đào Cam Sả',
            quantity: 1,
            unitPrice: 30000,
            lineTotal: 0,
            modifiers: [],
            modifierSelections: [],
            itemNote: null,
            batchNo: 1,
            kitchenStatus: 'CANCELLED',
            isTakeaway: false,
          },
        ],
      };

      vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(new MockSocket() as never);
      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/pos/tables') return tableGrid;
        if (url === '/api/v1/pos/drafts') return { drafts: [] };
        if (url === '/api/v1/menu/products') return mockProducts;
        if (url === '/api/v1/pos/orders/502') return orderDetail;
        return [];
      });
      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
        orderId: 502,
        totalAmount: 160000,
        requireCancellationSlip: false,
        kitchenCancellationSlips: [],
      });

      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 3,
          employeeId: 3,
          username: 'thungan01',
          fullName: 'Thu Ngân',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({
            pos: { view: true, create: true, update: true, splitKitchen: true },
          }),
        },
      });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryProvider client={queryClient}>
          <SocketProvider>
            <ThermalPrintProvider>
              <MemoryRouter future={routerFutureFlags}>
                <PosUnifiedPage />
              </MemoryRouter>
            </ThermalPrintProvider>
          </SocketProvider>
        </QueryProvider>,
      );

      fireEvent.click(await screen.findByTestId('table-card-2'));
      expect(await screen.findByTestId('invoice-item-9002')).toBeInTheDocument();

      // PRINTED and CANCELLED items are NEVER editable
      expect(screen.queryByTestId('edit-new-item-9001')).not.toBeInTheDocument();
      expect(screen.queryByTestId('edit-new-item-9004')).not.toBeInTheDocument();

      // "+ Mang về" sibling button triggers isTakeaway update without opening edit modal
      fireEvent.click(screen.getByTestId('toggle-item-takeaway-9002'));
      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/502/items', {
          updates: [{ orderItemId: 9002, isTakeaway: true }],
        });
      });
      expect(screen.queryByTestId('pos-modifier-modal')).not.toBeInTheDocument();

      // Click NEW item 9002 -> edit spice level to Cấp 3 (12), swap Phô Mai (21) -> Bò Mỹ (20)
      fireEvent.click(screen.getByTestId('edit-new-item-9002'));
      expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
      expect(screen.getByTestId('pos-item-note-input')).toHaveValue('Ít hành');
      fireEvent.click(screen.getByTestId('pos-mod-option-12'));
      fireEvent.click(screen.getByTestId('pos-mod-option-21'));
      fireEvent.click(screen.getByTestId('pos-mod-option-20'));
      fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/502/items', {
          updates: [
            {
              orderItemId: 9002,
              expectedKitchenStatus: 'NEW',
              quantity: 1,
              modifiers: [
                { groupId: 1, modifierId: 12 },
                { groupId: 2, modifierId: 20 },
              ],
              itemNote: 'Ít hành',
            },
          ],
        });
      });

      // Zero-modifier NEW item 9003 opens modal cleanly for note/qty update
      fireEvent.click(screen.getByTestId('edit-new-item-9003'));
      expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
      expect(
        screen.getByText(/Món này chưa cấu hình tuỳ chọn thêm/i),
      ).toBeInTheDocument();
      fireEvent.change(screen.getByTestId('pos-item-note-input'), {
        target: { value: 'Ít đường' },
      });
      fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/502/items', {
          updates: [
            {
              orderItemId: 9003,
              expectedKitchenStatus: 'NEW',
              quantity: 1,
              modifiers: [],
              itemNote: 'Ít đường',
            },
          ],
        });
      });

      // Simulate 409 POS_ITEM_ALREADY_PRINTED race when saving edit on 9002
      patchSpy.mockRejectedValueOnce(
        new ApiClientError({
          statusCode: 409,
          error: 'Conflict',
          code: ErrorCodes.POS_ITEM_ALREADY_PRINTED,
          message: 'Món đã tách bếp nên không thể sửa',
          details: null,
          requestId: 'req-409',
        }),
      );
      fireEvent.click(screen.getByTestId('edit-new-item-9002'));
      expect(await screen.findByTestId('pos-modifier-modal')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('pos-confirm-modifier-btn'));

      await waitFor(() => {
        expect(screen.queryByTestId('pos-modifier-modal')).not.toBeInTheDocument();
      });
      expect(
        useToastStore
          .getState()
          .toasts.some((t) => `${t.title} ${t.description ?? ''}`.includes('Món đã tách bếp')),
      ).toBe(true);

      // Readonly user (no pos.update) cannot open edit on NEW items
      act(() => {
        useAuthStore.getState().setAuth({
          accessToken: 'viewer-token',
          user: {
            id: 9,
            employeeId: 9,
            username: 'viewer',
            fullName: 'Xem POS',
            isSuperAdmin: false,
            permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
          },
        });
      });
      await waitFor(() => {
        expect(screen.queryByTestId('edit-new-item-9002')).not.toBeInTheDocument();
      });
    });
  });
});
