import { QueryClient } from '@tanstack/react-query';
import {
  UserPermissionsSchema,
  type OrderDetailResponse,
  type PosTableGridResponse,
  type PublicMenuResponse,
} from '@fnb/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ThermalPrintProvider } from '@/components/print-slips';
import { useToastStore } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { POS_DEVICE_MODE_STORAGE_KEY } from '@/lib/pos-device-mode';
import * as socketClient from '@/lib/socket-client';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';
import { PosTouchPage } from '../pos-touch-page';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

type EventHandler = (payload: unknown) => void;

class MockSocket {
  public listeners = new Map<string, Set<EventHandler>>();
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

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

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
        orderCode: 'HD-20261123-0020',
        orderType: 'DINE_IN',
        tableId: 7,
        tableLabel: 'Bàn 07',
        takeawayNumber: null,
        status: 'SERVING',
        totalAmount: 85000,
        createdAt: minutesAgo(81),
      },
    },
  ],
  takeaways: [],
};

const takeaway02: PosTableGridResponse['takeaways'][number] = {
  orderId: 802,
  orderCode: 'HD-20261124-0802',
  orderType: 'TAKEAWAY',
  tableId: null,
  tableLabel: null,
  takeawayNumber: 2,
  status: 'SERVING',
  totalAmount: 30000,
  createdAt: minutesAgo(20),
};

const takeaway01: PosTableGridResponse['takeaways'][number] = {
  orderId: 801,
  orderCode: 'HD-20261124-0801',
  orderType: 'TAKEAWAY',
  tableId: null,
  tableLabel: null,
  takeawayNumber: 1,
  status: 'SERVING',
  totalAmount: 45000,
  createdAt: minutesAgo(10),
};

const boardGridWithTakeaways: PosTableGridResponse = {
  ...grid,
  takeaways: [takeaway02, takeaway01],
};

const servingOrder: OrderDetailResponse = {
  orderId: 700,
  orderCode: 'HD-20261123-0020',
  orderType: 'DINE_IN',
  orderSource: 'POS_COUNTER',
  tableId: 7,
  tableLabel: 'Bàn 07',
  takeawayNumber: null,
  status: 'SERVING',
  paymentMethod: null,
  cashAmount: 0,
  transferAmount: 0,
  totalAmount: 85000,
  note: null,
  createdAt: minutesAgo(81),
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
      kitchenStatus: 'PRINTED',
    },
    {
      id: 9002,
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

function mockGetApi(tableGrid: PosTableGridResponse = grid) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/v1/pos/tables') return tableGrid;
    if (url === '/api/v1/menu/products') return products;
    if (url === '/api/v1/pos/orders/700') return servingOrder;
    return [];
  });
}

function renderTouchPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryProvider client={queryClient}>
      <SocketProvider>
        <ThermalPrintProvider>
          <MemoryRouter initialEntries={['/pos/touch']} future={routerFutureFlags}>
            <Routes>
              <Route path="/pos/touch" element={<PosTouchPage />} />
              <Route path="/pos" element={<div data-testid="desktop-pos-route" />} />
              <Route path="/login" element={<div data-testid="login-route" />} />
            </Routes>
          </MemoryRouter>
        </ThermalPrintProvider>
      </SocketProvider>
    </QueryProvider>,
  );
  return Object.assign(view, { queryClient });
}

function mockGetApiWithOrderStatus(getStatus: () => OrderDetailResponse['status']) {
  return vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
    if (url === '/api/v1/pos/tables') return grid;
    if (url === '/api/v1/menu/products') return products;
    if (url === '/api/v1/pos/orders/700') return { ...servingOrder, status: getStatus() };
    return [];
  });
}

const toastTexts = () =>
  useToastStore
    .getState()
    .toasts.map((t) => `${t.title} ${t.description ?? ''}`)
    .join(' | ');

describe('POS cảm ứng (/pos/touch)', () => {
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
        }),
      },
    });
  });

  it('marks <html> for touch sizing while mounted and shows the table summary with seated time', async () => {
    mockGetApi();
    const view = renderTouchPage();

    expect(document.documentElement).toHaveAttribute('data-pos-touch', 'true');
    await screen.findByTestId('touch-table-card-7');
    expect(screen.getByTestId('touch-table-summary')).toHaveTextContent('Trống 1/2 bàn');
    expect(screen.getByTestId('touch-table-card-7')).toHaveTextContent('1h:21p');
    expect(screen.getByTestId('touch-table-card-1')).toHaveTextContent('Bàn trống');

    fireEvent.click(screen.getByTestId('touch-only-occupied'));
    expect(screen.queryByTestId('touch-table-card-1')).not.toBeInTheDocument();

    view.unmount();
    expect(document.documentElement).not.toHaveAttribute('data-pos-touch');
  });

  it('taps an empty table, adds items through the option dialog and creates a DINE_IN order', async () => {
    mockGetApi();
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/orders') {
        return {
          orderId: 701,
          orderCode: 'HD-20261123-0021',
          orderType: 'DINE_IN',
          tableId: 1,
          takeawayNumber: null,
          tableLabel: 'Bàn 01',
          status: 'SERVING',
          totalAmount: 115000,
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-1'));
    expect(await screen.findByTestId('touch-order-screen')).toBeInTheDocument();
    expect(screen.getByTestId('touch-order-title')).toHaveTextContent('Bàn 01');

    fireEvent.click(await screen.findByTestId('touch-product-102'));
    fireEvent.click(screen.getByTestId('touch-product-102'));
    expect(screen.getByTestId('touch-product-qty-102')).toHaveTextContent('2');
    // Chạm lặp lại cùng món thì cộng dồn trên một dòng, không tách thành 2 dòng.
    expect(screen.getByTestId('touch-draft-item-0')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-draft-item-1')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('touch-product-101'));
    const modal = await screen.findByTestId('pos-modifier-modal');
    fireEvent.click(within(modal).getByTestId('pos-mod-option-11'));
    fireEvent.click(within(modal).getByTestId('pos-confirm-modifier-btn'));

    expect(screen.getByTestId('touch-cart-total')).toHaveTextContent('115.000 đ');

    fireEvent.click(screen.getByTestId('touch-submit-draft'));
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/pos/orders',
        expect.objectContaining({
          orderType: 'DINE_IN',
          tableId: 1,
          items: [
            expect.objectContaining({ productId: 102, quantity: 2 }),
            expect.objectContaining({
              productId: 101,
              quantity: 1,
              modifiers: [expect.objectContaining({ modifierId: 11 })],
            }),
          ],
        }),
      );
    });
  });

  it('filters the menu as you type without needing Enter (accent-insensitive)', async () => {
    mockGetApi();
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-1'));
    await screen.findByTestId('touch-product-101');
    fireEvent.change(screen.getByTestId('touch-menu-search'), { target: { value: 'tra dao' } });

    await waitFor(() => {
      expect(screen.queryByTestId('touch-product-101')).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('touch-product-102')).toBeInTheDocument();
  });

  it('opens an occupied table, sends only NEW items to the kitchen and opens checkout', async () => {
    mockGetApi();
    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/orders/700/split-kitchen') {
        return { tickets: [], batchNo: 2, message: 'Không có món mới cần tách' };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-7'));
    const splitButton = await screen.findByTestId('touch-split-kitchen');
    expect(splitButton).toHaveTextContent('Gửi bếp (1)');
    expect(screen.getByTestId('touch-order-title')).toHaveTextContent('Bàn 07');

    fireEvent.click(splitButton);
    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/pos/orders/700/split-kitchen');
    });

    fireEvent.click(screen.getByTestId('touch-checkout'));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('asks before cancelling a printed item and only then calls the API', async () => {
    mockGetApi();
    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      orderId: 700,
      totalAmount: 30000,
      requireCancellationSlip: false,
      kitchenCancellationSlips: [],
    });
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-7'));
    fireEvent.click(await screen.findByTestId('touch-cancel-printed-9001'));
    expect(await screen.findByTestId('touch-confirm-dialog')).toHaveTextContent(
      'Huỷ món đã gửi bếp?',
    );
    expect(patchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('touch-confirm-accept'));
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/pos/orders/700/items', {
        removeItemIds: [9001],
      });
    });
  });

  it('goes back to the table map and confirms before discarding an unsaved draft', async () => {
    mockGetApi();
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-1'));
    fireEvent.click(await screen.findByTestId('touch-product-102'));
    fireEvent.click(screen.getByTestId('touch-back-to-tables'));

    expect(await screen.findByTestId('touch-confirm-dialog')).toHaveTextContent(
      'Bỏ đơn đang chọn dở?',
    );
    fireEvent.click(screen.getByTestId('touch-confirm-accept'));
    expect(await screen.findByTestId('touch-table-board')).toBeInTheDocument();
  });

  it('kiosk menu toggles the device mode and exits back to the full /pos screen', async () => {
    mockGetApi();
    renderTouchPage();

    await screen.findByTestId('touch-table-card-1');
    fireEvent.click(screen.getByTestId('touch-kiosk-menu-btn'));
    fireEvent.click(await screen.findByTestId('touch-sheet-action-device-mode'));
    await waitFor(() => {
      expect(localStorage.getItem(POS_DEVICE_MODE_STORAGE_KEY)).toBe('touch');
    });

    fireEvent.click(screen.getByTestId('touch-kiosk-menu-btn'));
    fireEvent.click(await screen.findByTestId('touch-sheet-action-exit'));
    expect(await screen.findByTestId('desktop-pos-route')).toBeInTheDocument();
    // Thoát không xoá ghi nhớ của máy: lần đăng nhập sau vẫn vào thẳng màn cảm ứng.
    expect(localStorage.getItem(POS_DEVICE_MODE_STORAGE_KEY)).toBe('touch');
  });

  it('warns and returns to the table map when the open order is paid on another device', async () => {
    let status: OrderDetailResponse['status'] = 'SERVING';
    mockGetApiWithOrderStatus(() => status);
    const view = renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-7'));
    expect(await screen.findByTestId('touch-checkout')).toBeEnabled();

    // Thu ngân khác vừa thanh toán đơn này; socket làm mới dữ liệu đơn.
    status = 'PAID';
    await view.queryClient.invalidateQueries();

    expect(await screen.findByTestId('touch-table-board')).toBeInTheDocument();
    await waitFor(() => expect(toastTexts()).toContain('máy khác'));
  });

  it('does not claim "another device" when this screen checks the order out itself', async () => {
    let status: OrderDetailResponse['status'] = 'SERVING';
    mockGetApiWithOrderStatus(() => status);
    const view = renderTouchPage();
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/orders/700/checkout') {
        status = 'PAID';
        // Như trình duyệt thật: dữ liệu đơn (đã PAID) về và hiển thị TRƯỚC khi lệnh thanh toán
        // trả kết quả và màn hình bỏ chọn đơn.
        await view.queryClient.refetchQueries({ queryKey: ['pos', 'order', 700] });
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { orderId: 700, status: 'PAID', paidAt: new Date().toISOString() };
      }
      throw new Error(`Unexpected POST ${url}`);
    });

    fireEvent.click(await screen.findByTestId('touch-table-card-7'));
    fireEvent.click(await screen.findByTestId('touch-checkout'));
    fireEvent.click(await screen.findByTestId('payment-method-CASH'));
    fireEvent.click(screen.getByTestId('checkout-confirm-noprint-btn'));

    expect(await screen.findByTestId('touch-table-board')).toBeInTheDocument();
    await waitFor(() => expect(toastTexts()).toMatch(/thanh toán/i));
    expect(toastTexts()).not.toContain('máy khác');
  });

  it('selects the All tab and shows a board for the default tab', async () => {
    mockGetApi();
    renderTouchPage();

    await screen.findByTestId('touch-table-card-1');
    expect(screen.getByTestId('touch-tab-all')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'all');
  });

  it('shows the new takeaway tile, numbered takeaways and then tables in one All grid', async () => {
    mockGetApi(boardGridWithTakeaways);
    renderTouchPage();

    const takeawayCard01 = await screen.findByTestId('touch-takeaway-card-801');
    expect(takeawayCard01).toHaveTextContent('Mang về');
    expect(takeawayCard01).toHaveTextContent('#01');
    expect(screen.getByTestId('touch-takeaway-card-802')).toHaveTextContent('#02');
    expect(screen.getByTestId('touch-table-card-7')).toBeInTheDocument();
    expect(Array.from(screen.getByTestId('touch-table-grid').children).map((child) => child.getAttribute('data-testid'))).toEqual([
      'touch-new-takeaway',
      'touch-takeaway-card-801',
      'touch-takeaway-card-802',
      'touch-table-card-1',
      'touch-table-card-7',
    ]);
  });

  it('omits the new takeaway tile without create permission and starts with the first takeaway', async () => {
    mockGetApi(boardGridWithTakeaways);
    const user = useAuthStore.getState().user!;
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-jwt-token',
      user: {
        ...user,
        permissions: UserPermissionsSchema.parse({ pos: { view: true, create: false } }),
      },
    });
    renderTouchPage();

    await screen.findByTestId('touch-takeaway-card-801');
    expect(screen.queryByTestId('touch-new-takeaway')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-table-grid').firstElementChild).toHaveAttribute(
      'data-testid',
      'touch-takeaway-card-801',
    );
  });

  it('starts with the first table when there are no takeaways and no create permission', async () => {
    mockGetApi({ ...grid, takeaways: [] });
    const user = useAuthStore.getState().user!;
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-jwt-token',
      user: {
        ...user,
        permissions: UserPermissionsSchema.parse({ pos: { view: true, create: false } }),
      },
    });
    renderTouchPage();

    await screen.findByTestId('touch-table-card-1');
    expect(screen.queryByTestId('touch-new-takeaway')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-table-grid').firstElementChild).toHaveAttribute(
      'data-testid',
      'touch-table-card-1',
    );
  });

  it('shows only table cards in the Tables tab', async () => {
    mockGetApi(boardGridWithTakeaways);
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-tab-tables'));

    expect(screen.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'tables');
    expect(screen.queryByTestId('touch-new-takeaway')).not.toBeInTheDocument();
    expect(screen.queryByTestId('touch-takeaway-card-801')).not.toBeInTheDocument();
    expect(Array.from(screen.getByTestId('touch-table-grid').children).map((child) => child.getAttribute('data-testid'))).toEqual([
      'touch-table-card-1',
      'touch-table-card-7',
    ]);
  });

  it('shows only takeaways in the Takeaway tab and hides the table filter', async () => {
    mockGetApi(boardGridWithTakeaways);
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-tab-takeaway'));

    expect(screen.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'takeaway');
    expect(screen.queryByTestId('touch-table-card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-new-takeaway')).toBeInTheDocument();
    expect(screen.getByTestId('touch-takeaway-card-801')).toBeInTheDocument();
    expect(screen.getByTestId('touch-tab-takeaway')).toHaveTextContent('Mang về (2)');
    expect(screen.queryByTestId('touch-only-occupied')).not.toBeInTheDocument();
  });

  it('keeps takeaway tiles visible when the All tab filters out empty tables', async () => {
    mockGetApi(boardGridWithTakeaways);
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-only-occupied'));

    expect(screen.queryByTestId('touch-table-card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-new-takeaway')).toBeInTheDocument();
    expect(screen.getByTestId('touch-takeaway-card-801')).toBeInTheDocument();
    expect(screen.getByTestId('touch-table-card-7')).toBeInTheDocument();
  });

  it('keeps takeaway tiles and shows the existing empty-table message when no tables have orders', async () => {
    const emptyTableGrid: PosTableGridResponse = {
      tables: grid.tables.map((table) => ({
        ...table,
        status: 'AVAILABLE',
        activeOrderId: null,
        activeOrder: null,
      })),
      takeaways: [takeaway02, takeaway01],
    };
    mockGetApi(emptyTableGrid);
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-only-occupied'));

    expect(screen.queryByTestId('touch-table-card-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('touch-table-card-7')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-new-takeaway')).toBeInTheDocument();
    expect(screen.getByTestId('touch-takeaway-card-801')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có bàn nào đang có hoá đơn')).not.toBeInTheDocument();
  });

  it('shows the existing empty-table message when the All filter removes every table and takeaway', async () => {
    const emptyTableGrid: PosTableGridResponse = {
      tables: grid.tables.map((table) => ({
        ...table,
        status: 'AVAILABLE',
        activeOrderId: null,
        activeOrder: null,
      })),
      takeaways: [],
    };
    mockGetApi(emptyTableGrid);
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-only-occupied'));

    expect(await screen.findByText('Chưa có bàn nào đang có hoá đơn')).toBeInTheDocument();
    expect(screen.getByTestId('touch-new-takeaway')).toBeInTheDocument();
  });

  it('keeps the selected board tab after opening a takeaway and returning to the board', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return boardGridWithTakeaways;
      if (url === '/api/v1/menu/products') return products;
      if (url === '/api/v1/pos/orders/801') {
        return {
          ...servingOrder,
          orderId: 801,
          orderCode: takeaway01.orderCode,
          orderType: 'TAKEAWAY',
          tableId: null,
          tableLabel: 'Mang về #01',
          takeawayNumber: 1,
        };
      }
      return [];
    });
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-tab-takeaway'));
    fireEvent.click(await screen.findByTestId('touch-takeaway-card-801'));
    await waitFor(() =>
      expect(screen.getByTestId('touch-order-title')).toHaveTextContent('Mang về'),
    );
    fireEvent.click(screen.getByTestId('touch-back-to-tables'));

    await waitFor(() => {
      expect(screen.getByTestId('touch-table-board')).toHaveAttribute('data-tab', 'takeaway');
      expect(screen.getByTestId('touch-tab-takeaway')).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('shows the empty takeaway message when the cashier cannot create orders', async () => {
    mockGetApi({ ...grid, takeaways: [] });
    const user = useAuthStore.getState().user!;
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-jwt-token',
      user: {
        ...user,
        permissions: UserPermissionsSchema.parse({ pos: { view: true, create: false } }),
      },
    });
    renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-tab-takeaway'));
    expect(await screen.findByText('Chưa có đơn mang về nào đang phục vụ')).toBeInTheDocument();
  });

  it('starts a new takeaway from the header', async () => {
    mockGetApi();
    renderTouchPage();

    fireEvent.click(screen.getByTestId('touch-header-new-takeaway'));
    expect(await screen.findByTestId('touch-order-title')).toHaveTextContent('Mang về');
  });

  it('lets the cashier pick table and menu columns from the ⋮ menu, saved for this device', async () => {
    mockGetApi();
    renderTouchPage();

    await screen.findByTestId('touch-table-card-1');
    expect(screen.getByTestId('touch-table-grid')).toHaveAttribute('data-columns', '6');

    fireEvent.click(screen.getByTestId('touch-kiosk-menu-btn'));
    fireEvent.click(await screen.findByTestId('touch-sheet-action-layout'));
    const dialog = await screen.findByTestId('touch-layout-dialog');
    expect(within(dialog).getByTestId('layout-tables-auto')).toHaveAttribute('aria-checked', 'true');

    fireEvent.click(within(dialog).getByTestId('layout-tables-4'));
    fireEvent.click(within(dialog).getByTestId('layout-menu-3'));
    expect(screen.getByTestId('touch-table-grid')).toHaveAttribute('data-columns', '4');
    expect(JSON.parse(localStorage.getItem('fnb-pos-touch-layout') ?? '{}')).toEqual({
      tableColumns: 4,
      menuColumns: 3,
    });

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('touch-table-card-1'));
    expect(await screen.findByTestId('touch-menu-grid')).toHaveAttribute('data-columns', '3');
  });

  it('still warns when another device pays an order this screen only moved to another table', async () => {
    let status: OrderDetailResponse['status'] = 'SERVING';
    mockGetApiWithOrderStatus(() => status);
    vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/orders/700/table-action') {
        return { action: 'MOVE', sourceTableId: 7, targetTableId: 1, requireKitchenNoticePrint: false };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    const view = renderTouchPage();

    fireEvent.click(await screen.findByTestId('touch-table-card-7'));
    fireEvent.click(await screen.findByTestId('touch-table-action'));
    fireEvent.click(await screen.findByTestId('target-table-1'));
    fireEvent.click(screen.getByTestId('confirm-table-action-btn'));
    await waitFor(() => expect(screen.queryByTestId('table-action-dialog')).not.toBeInTheDocument());

    status = 'PAID';
    await view.queryClient.invalidateQueries();
    expect(await screen.findByTestId('touch-table-board')).toBeInTheDocument();
    await waitFor(() => expect(toastTexts()).toContain('máy khác'));
  });
});
