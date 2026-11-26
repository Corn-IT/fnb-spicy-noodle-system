import { QueryClient } from '@tanstack/react-query';
import {
  UserPermissionsSchema,
  type OrderDetailResponse,
  type PosTableGridResponse,
  type PublicMenuResponse,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { PosUnifiedPage } from '@/features/pos-counter';
import { apiClient } from '@/lib/api-client';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';

type EventHandler = (payload: unknown) => void;
class MockSocket {
  listeners = new Map<string, Set<EventHandler>>();
  on(event: string, handler: EventHandler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return this;
  }
  off(event: string, handler?: EventHandler) {
    if (!handler) this.listeners.delete(event);
    else this.listeners.get(event)?.delete(handler);
    return this;
  }
  disconnect() {}
}

const products: PublicMenuResponse['products'] = [
  {
    id: 102,
    name: 'Trà Đào Cam Sả',
    price: 30000,
    station: 'PHA_CHE',
    isAvailable: true,
    imageUrl: null,
    sortOrder: 1,
    comboItems: [],
    modifierGroups: [],
  },
];

const grid: PosTableGridResponse = {
  tables: [
    { id: 1, name: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null, activeOrder: null },
    {
      id: 7,
      name: 'Bàn 07',
      status: 'OCCUPIED',
      activeOrderId: 700,
      activeOrder: {
        orderId: 700,
        orderCode: 'HD-20261124-0001',
        orderType: 'DINE_IN',
        tableId: 7,
        tableLabel: 'Bàn 07',
        takeawayNumber: null,
        status: 'SERVING',
        totalAmount: 30000,
        createdAt: new Date().toISOString(),
      },
    },
  ],
  takeaways: [],
};

const orderWithTea = (quantity: number, kitchenStatus: 'NEW' | 'PRINTED'): OrderDetailResponse => ({
  orderId: 700,
  orderCode: 'HD-20261124-0001',
  orderType: 'DINE_IN',
  orderSource: 'POS_COUNTER',
  tableId: 7,
  tableLabel: 'Bàn 07',
  takeawayNumber: null,
  status: 'SERVING',
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  totalAmount: 30000 * quantity,
  note: null,
  createdAt: new Date().toISOString(),
  paidAt: null,
  tableTransferLogs: [],
  items: [
    {
      id: 9002,
      productId: 102,
      name: 'Trà Đào Cam Sả',
      quantity,
      unitPrice: 30000,
      lineTotal: 30000 * quantity,
      modifiers: [],
      itemNote: null,
      batchNo: 1,
      kitchenStatus,
    },
  ],
});

function renderDesktopPos() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <SocketProvider>
        <ThermalPrintProvider>
          <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <PosUnifiedPage />
          </MemoryRouter>
        </ThermalPrintProvider>
      </SocketProvider>
    </QueryProvider>,
  );
}

const patchResponse = (total: number) => ({
  orderId: 700,
  totalAmount: total,
  requireCancellationSlip: false,
  kitchenCancellationSlips: [],
});

describe('POS — đặt cùng món thì cộng dồn số lượng trên một dòng', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
    const socket = new MockSocket();
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(
      socket as unknown as ReturnType<typeof socketClient.connectPosSocket>,
    );
    vi.spyOn(socketClient, 'getPosSocket').mockImplementation(
      () => socket as unknown as ReturnType<typeof socketClient.getPosSocket>,
    );
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-jwt-token',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true, create: true, update: true, splitKitchen: true, tableAction: true, checkout: true },
        }),
      },
    });
  });

  it('merges repeated picks in the draft cart and creates the order with quantity 2', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/pos/drafts') return { drafts: [] };
      if (url === '/api/v1/menu/products') return products;
      return [];
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string, body?: unknown) => {
      if (url === '/api/v1/pos/drafts') {
        return {
          ...(body as Record<string, unknown>),
          id: 'draft-701',
          revision: 1,
          tableName: 'Bàn 01',
          createdAt: '2026-11-24T08:15:00.000Z',
          updatedAt: '2026-11-24T08:15:00.000Z',
        };
      }
      if (url === '/api/v1/pos/drafts/draft-701/submit') {
        return {
          draftId: 'draft-701',
          idempotentReplay: false,
          order: {
            orderId: 701,
            orderCode: 'HD-20261124-0002',
            orderType: 'DINE_IN',
            tableId: 1,
            takeawayNumber: null,
            tableLabel: 'Bàn 01',
            status: 'SERVING',
            totalAmount: 60000,
          },
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-1'));
    fireEvent.click(await screen.findByTestId('pos-menu-product-102'));
    fireEvent.click(screen.getByTestId('pos-menu-product-102'));

    expect(screen.getByTestId('draft-item-0')).toHaveTextContent('60.000');
    expect(screen.queryByTestId('draft-item-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pos-submit-new-order-btn'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/pos/drafts',
        expect.objectContaining({ items: [expect.objectContaining({ productId: 102, quantity: 2 })] }),
      );
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/pos/drafts/draft-701/submit',
        expect.objectContaining({ expectedRevision: 1, idempotencyKey: expect.any(String) }),
      );
    });
  });

  it('hydrates a resumed draft item after the product query finishes loading', async () => {
    let resolveProducts!: (value: PublicMenuResponse['products']) => void;
    const delayedProducts = new Promise<PublicMenuResponse['products']>((resolve) => {
      resolveProducts = resolve;
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/pos/drafts') {
        return {
          drafts: [{
            id: 'draft-702',
            revision: 1,
            orderType: 'DINE_IN',
            tableId: null,
            tableName: null,
            items: [{ productId: 102, quantity: 1, modifiers: [] }],
            note: null,
            createdAt: '2026-11-24T08:15:00.000Z',
            updatedAt: '2026-11-24T08:15:00.000Z',
          }],
        };
      }
      if (url === '/api/v1/menu/products') return delayedProducts;
      return [];
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('pos-resume-draft-draft-702'));
    expect(await screen.findByTestId('draft-item-0')).toHaveTextContent('Món #102');
    expect(screen.getByTestId('draft-item-0')).toHaveTextContent('0 đ');

    resolveProducts(products);
    await waitFor(() => {
      expect(screen.getByTestId('draft-item-0')).toHaveTextContent('Trà Đào Cam Sả');
      expect(screen.getByTestId('draft-item-0')).toHaveTextContent('30.000 đ');
    });
  });

  it('on a live order, sends rapid taps as additive adds one after another (server merges them)', async () => {
    let serverQty = 1;
    let inFlight = 0;
    let maxInFlight = 0;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/menu/products') return products;
      if (url === '/api/v1/pos/orders/700') return orderWithTea(serverQty, 'NEW');
      return [];
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const added = (body as { addItems?: Array<{ quantity: number }> }).addItems?.[0];
      if (added) serverQty += added.quantity;
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return patchResponse(30000 * serverQty);
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-7'));
    await screen.findByTestId('invoice-item-9002');
    fireEvent.mouseDown(screen.getByTestId('pos-tab-menu'));
    const tile = await screen.findByTestId('pos-menu-product-102');
    fireEvent.click(tile);
    fireEvent.click(tile);

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(2));
    expect(patchSpy.mock.calls.map((call) => call[1])).toEqual([
      { addItems: [{ productId: 102, quantity: 1, modifiers: [] }] },
      { addItems: [{ productId: 102, quantity: 1, modifiers: [] }] },
    ]);
    expect(maxInFlight).toBe(1);
    await waitFor(() => expect(serverQty).toBe(3));
  });

  it('a "+" tapped right after a dish tap applies +1 on top of the merged quantity', async () => {
    let serverQty = 1;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/menu/products') return products;
      if (url === '/api/v1/pos/orders/700') return orderWithTea(serverQty, 'NEW');
      return [];
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
      const payload = body as { addItems?: Array<{ quantity: number }>; updates?: Array<{ quantity: number }> };
      if (payload.addItems) serverQty += payload.addItems[0].quantity; // server cộng dồn vào dòng NEW
      if (payload.updates) serverQty = payload.updates[0].quantity;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return patchResponse(30000 * serverQty);
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-7'));
    await screen.findByTestId('invoice-item-9002');
    fireEvent.mouseDown(screen.getByTestId('pos-tab-menu'));
    fireEvent.click(await screen.findByTestId('pos-menu-product-102'));
    // Ngay sau đó bấm "+" trên dòng đang hiển thị số lượng 1.
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng Trà Đào Cam Sả' }));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(2));
    expect(patchSpy.mock.calls[1][1]).toEqual({ updates: [{ orderItemId: 9002, quantity: 3 }] });
    expect(serverQty).toBe(3);
  });

  it('always sends an additive add (the server decides whether to merge)', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/menu/products') return products;
      if (url === '/api/v1/pos/orders/700') return orderWithTea(1, 'PRINTED');
      return [];
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue(patchResponse(60000));
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-7'));
    await screen.findByTestId('invoice-item-9002');
    fireEvent.mouseDown(screen.getByTestId('pos-tab-menu'));
    fireEvent.click(await screen.findByTestId('pos-menu-product-102'));

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1));
    expect(patchSpy.mock.calls[0][1]).toEqual({
      addItems: [{ productId: 102, quantity: 1, modifiers: [] }],
    });
  });
});
