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
      if (url === '/api/v1/menu/products') return products;
      return [];
    });
    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      orderId: 701,
      orderCode: 'HD-20261124-0002',
      orderType: 'DINE_IN',
      tableId: 1,
      takeawayNumber: null,
      tableLabel: 'Bàn 01',
      status: 'SERVING',
      totalAmount: 60000,
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-1'));
    fireEvent.click(await screen.findByTestId('pos-menu-product-102'));
    fireEvent.click(screen.getByTestId('pos-menu-product-102'));

    expect(screen.getByTestId('draft-item-0')).toHaveTextContent('60.000');
    expect(screen.queryByTestId('draft-item-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pos-submit-new-order-btn'));
    await waitFor(() =>
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/pos/orders',
        expect.objectContaining({ items: [expect.objectContaining({ productId: 102, quantity: 2 })] }),
      ),
    );
  });

  it('on a live order, raises the quantity of the NEW line and counts rapid double taps correctly', async () => {
    let serverQty = 1;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return grid;
      if (url === '/api/v1/menu/products') return products;
      if (url === '/api/v1/pos/orders/700') return orderWithTea(serverQty, 'NEW');
      return [];
    });
    const patchSpy = vi.spyOn(apiClient, 'patch').mockImplementation(async (_url, body) => {
      const update = (body as { updates?: Array<{ quantity: number }> }).updates?.[0];
      if (update) serverQty = update.quantity;
      await new Promise((resolve) => setTimeout(resolve, 20));
      return patchResponse(30000 * serverQty);
    });
    renderDesktopPos();

    fireEvent.click(await screen.findByTestId('table-card-7'));
    await screen.findByTestId('invoice-item-9002');
    fireEvent.mouseDown(screen.getByTestId('pos-tab-menu'));
    const tile = await screen.findByTestId('pos-menu-product-102');
    // Hai lần chạm liên tiếp trước khi lần đầu kịp xong.
    fireEvent.click(tile);
    fireEvent.click(tile);

    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(2));
    expect(patchSpy.mock.calls.map((call) => call[1])).toEqual([
      { updates: [{ orderItemId: 9002, quantity: 2 }] },
      { updates: [{ orderItemId: 9002, quantity: 3 }] },
    ]);
  });

  it('adds a new line when the same item was already sent to the kitchen', async () => {
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
