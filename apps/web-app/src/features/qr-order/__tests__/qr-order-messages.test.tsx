import { DEFAULT_STORE_SETTINGS, SocketEvents, type PublicStoreSettingsResponse } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { queryClient as appQueryClient } from '@/providers/query-provider';
import * as socketClient from '@/lib/socket-client';

import { ThemeProvider } from '@/providers/theme-provider';

import { QrOrderPage } from '../components/qr-order-page';

vi.mock('@/providers/socket-provider', () => ({
  useSocket: () => ({ socket: null, status: 'disconnected' }),
}));

function makePublicSettings(
  overrides: Partial<PublicStoreSettingsResponse> = {},
): PublicStoreSettingsResponse {
  return {
    ...DEFAULT_STORE_SETTINGS,
    updatedAt: '2026-11-15T10:00:00.000Z',
    assets: { logo: null, favicon: null, qrLogo: null },
    ...overrides,
  };
}

describe('QrOrderPage custom message catalog (Story 17)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('renders customized qr.banner.tableMoveNotice from StoreSettingsContext.qrMessages', async () => {
    const customNotice = 'Vui lòng báo thu ngân nếu đổi bàn sang khu sân vườn!';
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/public/menu')) {
        return {
          table: {
            tableId: 5,
            tableName: 'Bàn 05',
            status: 'AVAILABLE',
            activeOrderId: null,
          },
          stations: [],
          categories: [],
          activeOrder: null,
          products: [],
          updatedAt: '2026-11-15T10:00:00.000Z',
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const settings = makePublicSettings({
      qrMessages: {
        'qr.banner.tableMoveNotice': {
          title: customNotice,
        },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StoreSettingsContext.Provider
          value={{ settings, messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-5-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-transfer-warning')).toBeInTheDocument();
    });

    expect(screen.getByTestId('qr-table-transfer-warning')).toHaveTextContent(customNotice);
  });

  it('keeps the guest dark theme when staff light settings refresh branding', async () => {
    const previousPath = window.location.pathname;
    window.history.replaceState(null, '', '/qr/table-5-token');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      table: { tableId: 5, tableName: 'Bàn 05', status: 'AVAILABLE', activeOrderId: null },
      stations: [], categories: [], activeOrder: null, products: [], updatedAt: null,
    });
    const settings = makePublicSettings({ defaultTheme: 'light', qr: { ...DEFAULT_STORE_SETTINGS.qr, theme: 'dark' } });
    const content = (current: PublicStoreSettingsResponse) => (
      <QueryClientProvider client={client}>
        <StoreSettingsContext.Provider value={{ settings: current }}>
          <ThemeProvider>
            <MemoryRouter initialEntries={['/qr/table-5-token']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
              <Routes><Route path="/qr/:token" element={<QrOrderPage />} /></Routes>
            </MemoryRouter>
          </ThemeProvider>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>
    );
    const view = render(content(settings));
    try {
      await waitFor(() => expect(document.documentElement.classList.contains('dark')).toBe(true));
      view.rerender(content({ ...settings, brandColor: '#059669', updatedAt: '2026-11-27T12:00:00.000Z' }));
      expect(document.documentElement.classList.contains('dark')).toBe(true);
    } finally {
      view.unmount();
      client.clear();
      window.history.replaceState(null, '', previousPath);
    }
  });

  it('clears stale sessionStorage activeOrderId when the same table is now AVAILABLE and recovers from socket connect_error', async () => {
    sessionStorage.setItem(
      'fnb_qr_session_table-5-token',
      JSON.stringify({
        activeOrderId: 80,
        currentTableLabel: 'Bàn 05',
        orderStatus: 'SERVING',
        statusMessage: 'Bếp đang chế biến món ăn của quý khách',
        redirectNotice: 'Đơn hàng cũ đã chuyển sang Bàn 05.',
      }),
    );

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== fn),
        );
      }),
      disconnect: vi.fn(),
    };
    const connectSpy = vi
      .spyOn(socketClient, 'connectPosSocket')
      .mockReturnValue(mockSocket as never);
    vi.spyOn(socketClient, 'disconnectPosSocket').mockImplementation(() => {});

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/public/menu')) {
        return {
          table: {
            tableId: 5,
            tableName: 'Bàn 05',
            status: 'AVAILABLE',
            activeOrderId: null,
          },
          stations: [],
          categories: [],
          activeOrder: null,
          products: [],
          updatedAt: '2026-11-17T10:00:00.000Z',
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-5-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(connectSpy).toHaveBeenLastCalledWith({
        mode: 'qr_guest',
        qrToken: 'table-5-token',
        orderId: null,
      });
    });

    const parsed = JSON.parse(sessionStorage.getItem('fnb_qr_session_table-5-token') ?? '{}') as {
      activeOrderId: number | null;
      redirectNotice?: string | null;
    };
    expect(parsed.activeOrderId).toBeNull();
    expect(parsed.redirectNotice).toBeUndefined();

    // Also verify cross-table stale VOIDED session recovers cleanly on socket connect_error
    connectSpy.mockClear();
    sessionStorage.setItem(
      'fnb_qr_session_table-6-token',
      JSON.stringify({
        activeOrderId: 99,
        currentTableLabel: 'Bàn 08',
        orderStatus: 'SERVING',
        statusMessage: 'Đang phục vụ',
        redirectNotice: 'Đã chuyển sang Bàn 08',
      }),
    );

    const queryClient2 = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient2}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-6-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    expect(connectSpy).toHaveBeenCalledWith({
      mode: 'qr_guest',
      qrToken: 'table-6-token',
      orderId: 99,
    });

    await act(async () => {
      for (const handler of listeners.get('connect_error') ?? []) {
        handler(new Error('Unauthorized'));
      }
    });

    await waitFor(() => {
      expect(connectSpy).toHaveBeenLastCalledWith({
        mode: 'qr_guest',
        qrToken: 'table-6-token',
        orderId: null,
      });
    });
  });

  it('displays distinct auto-cancel messages on QR guest screen for expired ADDON (keeps serving session) and expired NEW order (clears session)', async () => {
    sessionStorage.setItem(
      'fnb_qr_session_table-9-token',
      JSON.stringify({
        activeOrderId: 509,
        currentTableLabel: 'Bàn 09',
        orderStatus: 'SERVING',
        statusMessage: 'Bếp đang chế biến',
        redirectNotice: null,
      }),
    );

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== fn),
        );
      }),
      disconnect: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);
    vi.spyOn(socketClient, 'disconnectPosSocket').mockImplementation(() => {});

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/public/menu')) {
        return {
          table: {
            tableId: 9,
            tableName: 'Bàn 09',
            status: 'OCCUPIED',
            activeOrderId: 509,
          },
          stations: [],
          categories: [],
          activeOrder: {
            orderId: 509,
            orderCode: 'HD-509',
            status: 'SERVING',
            totalAmount: 55000,
            items: [],
            createdAt: '2026-11-17T12:00:00.000Z',
          },
          products: [],
          updatedAt: '2026-11-17T12:00:00.000Z',
        };
      }
      throw new Error(`Unexpected GET ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-9-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await screen.findByTestId('qr-table-header');

    // 1. Expired ADDON -> keeps SERVING session while showing 12-min addon auto-cancel banner
    await act(async () => {
      for (const handler of listeners.get('order:qr_auto_cancelled') ?? []) {
        handler({
          orderId: 509,
          orderCode: 'HD-509',
          tableId: 9,
          tableLabel: 'Bàn 09',
          kind: 'ADDON',
          cancelledItemCount: 2,
          autoCancelMinutes: 12,
          cancelledAt: new Date().toISOString(),
          reason: 'Tự động huỷ món gọi thêm QR quá 12 phút',
        });
      }
    });

    expect(screen.getByTestId('qr-status-banner')).toHaveTextContent(
      'Các món gọi thêm quá 12 phút chưa xác nhận đã tự động huỷ',
    );
    expect(
      (JSON.parse(sessionStorage.getItem('fnb_qr_session_table-9-token') ?? '{}') as {
        activeOrderId: number | null;
      }).activeOrderId,
    ).toBe(509);

    // 2. Expired NEW order -> sets VOIDED, shows orderAutoCancelled text, clears activeOrderId
    await act(async () => {
      for (const handler of listeners.get('order:qr_auto_cancelled') ?? []) {
        handler({
          orderId: 509,
          orderCode: 'HD-509',
          tableId: 9,
          tableLabel: 'Bàn 09',
          kind: 'NEW',
          cancelledItemCount: 1,
          autoCancelMinutes: 12,
          cancelledAt: new Date().toISOString(),
          reason: 'Tự động huỷ do quá 12 phút chưa xác nhận',
        });
      }
    });

    expect(screen.getByTestId('qr-status-banner')).toHaveTextContent(
      'Đơn gọi món của bạn đã tự động huỷ do quá 12 phút chưa được xác nhận tại quầy',
    );
    expect(
      (JSON.parse(sessionStorage.getItem('fnb_qr_session_table-9-token') ?? '{}') as {
        activeOrderId: number | null;
      }).activeOrderId,
    ).toBeNull();
  });

  it('configures networkMode always globally and keeps cart items clickable when offline NETWORK_ERROR occurs', async () => {
    expect(appQueryClient.getDefaultOptions().queries?.networkMode).toBe('always');
    expect(appQueryClient.getDefaultOptions().mutations?.networkMode).toBe('always');

    const localQc = new QueryClient({
      defaultOptions: {
        queries: { retry: false, networkMode: 'always' },
        mutations: { retry: false, networkMode: 'always' },
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      table: {
        tableId: 1,
        tableName: 'Bàn 01',
        status: 'AVAILABLE',
        activeOrderId: null,
      },
      stations: [],
      categories: [{ id: 1, code: 'TRA_TRAI_CAY', name: 'Trà Trái Cây', sortOrder: 1 }],
      activeOrder: null,
      products: [
        {
          id: 99,
          name: 'Trà Đào',
          price: 25000,
          station: 'PHA_CHE',
          categoryId: 1,
          categoryName: 'Trà Trái Cây',
          subtitle: null,
          imageUrl: null,
          isAvailable: true,
          sortOrder: 1,
          modifierGroups: [],
          comboItems: [],
        },
      ],
      updatedAt: '2026-11-18T00:00:00.000Z',
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockRejectedValue(
      new ApiClientError({
        statusCode: 0,
        error: 'Network Error',
        code: 'NETWORK_ERROR',
        message: 'Mất kết nối tới máy chủ hoặc đường truyền mạng bị gián đoạn.',
      }),
    );

    render(
      <QueryClientProvider client={localQc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={[`/qr/${'a'.repeat(64)}`]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    const chooseBtn = await screen.findByRole('button', { name: 'Chọn' });
    fireEvent.click(chooseBtn);

    const submitBtn = await screen.findByTestId('qr-submit-order-btn');
    expect(submitBtn).not.toBeDisabled();

    const originalOnLineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'onLine');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    try {
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledTimes(1);
      });
      await waitFor(() => {
        expect(screen.getByTestId('qr-submit-order-btn')).not.toBeDisabled();
      });
    } finally {
      if (originalOnLineDescriptor) {
        Object.defineProperty(window.navigator, 'onLine', originalOnLineDescriptor);
      } else {
        Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
      }
    }
  });

  it('supports QR Takeaway self-ordering with note-only field, draft cart persistence, active ticket card, localStorage session recovery across tab close, and auto-reset when PAID', async () => {
    const takeawayToken = 'e'.repeat(64);
    const guestSessionToken = 'f'.repeat(64);
    let serverOrderStage: 'PENDING' | 'APPROVED_NEW' | 'KITCHEN_PRINTED' | 'PAID' = 'PENDING';
    const localQc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const connectSpy = vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue({
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== fn),
        );
      }),
      disconnect: vi.fn(),
    } as never);
    vi.spyOn(socketClient, 'disconnectPosSocket').mockImplementation(() => undefined);

    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (_url, opts) => {
      const params = (opts as { params?: { activeOrderId?: number; guestSessionToken?: string } })?.params;
      if (
        serverOrderStage !== 'PAID' &&
        params?.activeOrderId === 801 &&
        params?.guestSessionToken === guestSessionToken
      ) {
        const isPending = serverOrderStage === 'PENDING';
        const isKitchenPrinted = serverOrderStage === 'KITCHEN_PRINTED';
        return {
          orderMode: 'TAKEAWAY',
          table: {
            tableId: null,
            tableName: 'Mang về #01',
            status: isPending ? 'PENDING' : 'OCCUPIED',
            activeOrderId: 801,
          },
          stations: [],
          categories: [],
          activeOrder: {
            orderId: 801,
            orderCode: 'HD-20261122-0001',
            status: isPending ? 'PENDING' : 'SERVING',
            note: 'Ít cay, để riêng nước dùng',
            totalAmount: 45000,
            createdAt: '2026-11-22T05:00:00.000Z',
            items: [
              {
                id: 1,
                productId: 55,
                productName: 'Mì Kim Chi Bò',
                quantity: 1,
                unitPrice: 45000,
                lineTotal: 45000,
                batchNo: 1,
                kitchenStatus: isKitchenPrinted ? 'PRINTED' : 'NEW',
                itemNote: null,
                modifiers: [],
                createdAt: '2026-11-22T05:00:00.000Z',
              },
            ],
          },
          products: [
            {
              id: 55,
              name: 'Mì Kim Chi Bò',
              price: 45000,
              station: 'BEP_NAU',
              categoryId: null,
              categoryName: null,
              subtitle: null,
              imageUrl: null,
              isAvailable: true,
              sortOrder: 1,
              modifierGroups: [],
              comboItems: [],
            },
          ],
          updatedAt: '2026-11-22T05:00:00.000Z',
        };
      }

      return {
        orderMode: 'TAKEAWAY',
        table: {
          tableId: null,
          tableName: 'Mang về',
          status: 'AVAILABLE',
          activeOrderId: null,
        },
        stations: [],
        categories: [],
        activeOrder: null,
        products: [
          {
            id: 55,
            name: 'Mì Kim Chi Bò',
            price: 45000,
            station: 'BEP_NAU',
            categoryId: null,
            categoryName: null,
            subtitle: null,
            imageUrl: null,
            isAvailable: true,
            sortOrder: 1,
            modifierGroups: [],
            comboItems: [],
          },
        ],
        updatedAt: '2026-11-22T05:00:00.000Z',
      };
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
      orderId: 801,
      activeOrderId: 801,
      orderCode: 'HD-20261122-0001',
      orderType: 'TAKEAWAY',
      takeawayNumber: 1,
      guestSessionToken,
      currentTableLabel: 'Mang về #01',
      status: 'PENDING',
      batchNo: 1,
      totalAmount: 45000,
    });

    const { unmount } = render(
      <QueryClientProvider client={localQc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={[`/qr/${takeawayToken}`]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('qr-table-header')).toHaveTextContent('Mang về');
    expect(screen.queryByTestId('qr-table-transfer-warning')).not.toBeInTheDocument();
    expect(screen.getByTestId('qr-takeaway-mode-banner')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Chọn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết giỏ hàng' }));

    // Customer name & phone fields are removed; only note field is present
    expect(screen.queryByTestId('qr-takeaway-customer-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('qr-takeaway-customer-phone')).not.toBeInTheDocument();
    fireEvent.change(await screen.findByTestId('qr-takeaway-note'), {
      target: { value: 'Ít cay, để riêng nước dùng' },
    });

    // Draft cart is persisted in localStorage before submit
    await waitFor(() => {
      const draftRaw = localStorage.getItem(`fnb_qr_draft_cart_${takeawayToken}`);
      expect(draftRaw).toBeTruthy();
      expect(draftRaw).toContain('Ít cay, để riêng nước dùng');
    });

    fireEvent.click(screen.getByRole('button', { name: /Xác nhận gửi đơn đặt món/i }));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/public/orders/qr',
        expect.objectContaining({
          qrToken: takeawayToken,
          note: 'Ít cay, để riêng nước dùng',
        }),
        { skipAuthRefresh: true },
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Mang về #01');
      expect(screen.getByTestId('qr-takeaway-active-ticket-card')).toBeInTheDocument();
      expect(screen.getByTestId('qr-takeaway-ticket-number')).toHaveTextContent('Mang về #01');
      expect(screen.getByTestId('qr-takeaway-progress-badge')).toHaveTextContent('Chờ quầy xác nhận');
      expect(screen.getByTestId('qr-takeaway-ticket-note')).toHaveTextContent('Ít cay, để riêng nước dùng');
      expect(screen.queryByTestId('qr-takeaway-new-order-btn')).not.toBeInTheDocument();
    });

    // Draft cart is cleared after successful submission
    expect(localStorage.getItem(`fnb_qr_draft_cart_${takeawayToken}`)).toBeNull();

    expect(connectSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        mode: 'qr_guest',
        qrToken: takeawayToken,
        orderId: 801,
        guestSessionToken,
      }),
    );

    // Transient network connect_error (e.g. mobile 4G/Wi-Fi blip) must NOT wipe activeOrderId
    await act(async () => {
      for (const handler of listeners.get('connect_error') ?? []) {
        handler(new Error('websocket error'));
      }
    });
    expect(
      (JSON.parse(localStorage.getItem(`fnb_qr_session_${takeawayToken}`) ?? '{}') as {
        activeOrderId: number | null;
      }).activeOrderId,
    ).toBe(801);

    // Simulate cashier approving QR order (Duyệt đơn) before Tách bếp -> banner & card both show approved-waiting-kitchen stage
    serverOrderStage = 'APPROVED_NEW';
    await act(async () => {
      for (const handler of listeners.get('order:status_updated') ?? []) {
        handler({
          orderId: 801,
          status: 'SERVING',
          message: 'Quầy đã xác nhận đơn, đang chờ chuyển xuống bếp',
        });
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-takeaway-progress-badge')).toHaveTextContent(
        'Quầy đã xác nhận • Chờ tách bếp',
      );
      expect(screen.getByTestId('qr-realtime-notice')).toHaveTextContent(
        'Quầy đã xác nhận đơn, đang chờ chuyển xuống bếp',
      );
    });

    // Simulate closing the browser tab completely (wiping sessionStorage) and scanning QR again in a new tab
    unmount();
    sessionStorage.clear();

    const reopenedQc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={reopenedQc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={[`/qr/${takeawayToken}`]}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    // Restores Mang về #01 and approved-waiting-kitchen stage from localStorage!
    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Mang về #01');
      expect(screen.getByTestId('qr-takeaway-active-ticket-card')).toBeInTheDocument();
      expect(screen.getByTestId('qr-takeaway-progress-badge')).toHaveTextContent(
        'Quầy đã xác nhận • Chờ tách bếp',
      );
    });

    // Now simulate cashier clicking "Tách bếp" -> transitions both banner and ticket card to kitchen preparing!
    serverOrderStage = 'KITCHEN_PRINTED';
    await act(async () => {
      for (const handler of listeners.get('order:status_updated') ?? []) {
        handler({ orderId: 801, status: 'SERVING', message: 'Bếp đang chế biến' });
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-takeaway-progress-badge')).toHaveTextContent(
        'Bếp đang chế biến (1/1 món)',
      );
      expect(screen.getByTestId('qr-realtime-notice')).toHaveTextContent('Bếp đang chế biến');
    });

    // Now simulate cashier completing payment (PAID) -> screen resets active ticket, shows durable PAID banner + Gọi đơn mới button
    serverOrderStage = 'PAID';
    await act(async () => {
      for (const handler of listeners.get('order:status_updated') ?? []) {
        handler({ orderId: 801, status: 'PAID' });
      }
    });

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Mang về');
      expect(screen.queryByTestId('qr-takeaway-active-ticket-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('qr-placed-orders-bar')).not.toBeInTheDocument();
      expect(screen.getByTestId('qr-status-banner')).toHaveTextContent('Cảm ơn quý khách và hẹn gặp lại!');
      expect(screen.getByTestId('qr-new-order-btn')).toBeInTheDocument();
    });
    expect(
      (JSON.parse(localStorage.getItem(`fnb_qr_session_${takeawayToken}`) ?? '{}') as {
        activeOrderId: number | null;
      }).activeOrderId,
    ).toBeNull();
    expect(getSpy).toHaveBeenCalled();
  });

  it('auto-dismisses ephemeral notices after 6s, supports manual dismiss without persisting across F5, caps bursts, and delivers new POS->QR notices', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      connected: true,
      connect: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== fn),
        );
      }),
      disconnect: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);
    vi.spyOn(socketClient, 'disconnectPosSocket').mockImplementation(() => undefined);

    sessionStorage.setItem(
      'fnb_qr_session_table-1-token',
      JSON.stringify({ activeOrderId: 101, guestSessionToken: null, currentTableLabel: 'Bàn 01' }),
    );
    localStorage.setItem(
      'fnb_qr_session_table-1-token',
      JSON.stringify({ activeOrderId: 101, guestSessionToken: null, currentTableLabel: 'Bàn 01' }),
    );

    vi.spyOn(apiClient, 'get').mockResolvedValue({
      orderMode: 'DINE_IN',
      table: { tableId: 1, tableName: 'Bàn 01', status: 'OCCUPIED', activeOrderId: 101 },
      stations: [],
      categories: [],
      activeOrder: {
        orderId: 101,
        orderCode: 'HD-101',
        status: 'SERVING',
        subtotalAmount: 40000,
        discountAmount: 0,
        totalAmount: 40000,
        items: [],
        createdAt: '2026-11-22T05:00:00.000Z',
      },
      products: [],
      updatedAt: '2026-11-22T05:00:00.000Z',
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-1-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await screen.findByTestId('qr-table-header');
    vi.useFakeTimers();
    try {
      // 1. Fire ITEMS_UPDATED notice & verify auto-dismiss at 6000ms
      act(() => {
        for (const h of listeners.get('qr:order_notice') ?? []) {
          h({
            orderId: 101,
            tableId: 1,
            kind: 'ITEMS_UPDATED',
            cancelledItems: [{ name: 'Mì Xúc Xích', quantity: 1 }],
            totalAmount: 40000,
            timestamp: '2026-11-22T12:00:01.000Z',
          });
        }
      });

      const noticesAfterCancel = screen.getAllByTestId('qr-realtime-notice');
      expect(noticesAfterCancel[0]).toHaveTextContent('Quầy đã huỷ 1 × Mì Xúc Xích');
      // Ephemeral notices are NEVER written to storage
      expect(localStorage.getItem('fnb_qr_session_table-1-token')).not.toContain('Quầy đã huỷ');

      act(() => {
        vi.advanceTimersByTime(6000);
      });
      expect(screen.queryByTestId('qr-realtime-notice')).not.toBeInTheDocument();

      // 2. Burst 5 notices within 1s -> capped at max 2 visible and manual dismiss works
      const burstKinds = [
        { kind: 'DISCOUNT_APPLIED', discountAmount: 10000, totalAmount: 30000, ts: '2026-11-22T12:00:02.000Z' },
        { kind: 'DISCOUNT_REMOVED', totalAmount: 40000, ts: '2026-11-22T12:00:03.000Z' },
        { kind: 'PROVISIONAL_BILL_PRINTED', totalAmount: 40000, ts: '2026-11-22T12:00:04.000Z' },
        { kind: 'TABLE_MERGED_INTO', sourceTableLabel: 'Bàn 02', targetTableLabel: 'Bàn 01', ts: '2026-11-22T12:00:05.000Z' },
        { kind: 'GUEST_ADDON_ADDED', batchNo: 2, totalAmount: 55000, ts: '2026-11-22T12:00:06.000Z' },
      ];
      act(() => {
        for (const entry of burstKinds) {
          for (const h of listeners.get('qr:order_notice') ?? []) {
            h({
              orderId: 101,
              tableId: 1,
              kind: entry.kind,
              ...(entry.discountAmount !== undefined ? { discountAmount: entry.discountAmount } : {}),
              ...(entry.totalAmount !== undefined ? { totalAmount: entry.totalAmount } : {}),
              ...(entry.sourceTableLabel ? { sourceTableLabel: entry.sourceTableLabel } : {}),
              ...(entry.targetTableLabel ? { targetTableLabel: entry.targetTableLabel } : {}),
              ...(entry.batchNo !== undefined ? { batchNo: entry.batchNo } : {}),
              timestamp: entry.ts,
            });
          }
        }
      });

      const cappedNotices = screen.getAllByTestId('qr-realtime-notice');
      expect(cappedNotices).toHaveLength(2);
      expect(cappedNotices[0]).toHaveTextContent('Bàn 02 đã được gộp vào bàn của bạn (Bàn 01)');
      expect(cappedNotices[1]).toHaveTextContent('Bàn vừa gọi thêm món (Lượt #2)');

      // Dismiss one manually via X button
      const dismissButtons = screen.getAllByTestId('qr-realtime-notice-dismiss');
      fireEvent.click(dismissButtons[0]);
      expect(screen.getAllByTestId('qr-realtime-notice')).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }

    // 3. Simulated F5 (unmount + remount): remaining ephemeral notice must NOT come back
    unmount();
    const qc2 = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc2}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-1-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );
    await screen.findByTestId('qr-table-header');
    expect(screen.queryByTestId('qr-realtime-notice')).not.toBeInTheDocument();
  });

  it('syncs new table order for idle co-diner, shows reconnect indicator, handles QR rotation, flags unavailable cart items, and preserves draft cart on VOIDED', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      connected: true,
      connect: vi.fn(),
      on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(fn);
        listeners.set(event, list);
      }),
      off: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
        listeners.set(
          event,
          (listeners.get(event) ?? []).filter((entry) => entry !== fn),
        );
      }),
      disconnect: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);
    vi.spyOn(socketClient, 'disconnectPosSocket').mockImplementation(() => undefined);

    let productAvailable = true;
    let tableActiveOrderId: number | null = null;

    const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async () => ({
      orderMode: 'DINE_IN',
      table: {
        tableId: 2,
        tableName: 'Bàn 02',
        status: tableActiveOrderId ? 'PENDING' : 'AVAILABLE',
        activeOrderId: tableActiveOrderId,
      },
      stations: [],
      categories: [{ id: 1, code: 'TOPPING', name: 'Topping', sortOrder: 1 }],
      activeOrder: tableActiveOrderId
        ? {
            orderId: tableActiveOrderId,
            orderCode: `HD-${tableActiveOrderId}`,
            status: 'PENDING',
            subtotalAmount: 10000,
            discountAmount: 0,
            totalAmount: 10000,
            items: [
              {
                id: 1,
                productId: 50,
                productName: 'Topping Bò',
                quantity: 1,
                unitPrice: 10000,
                lineTotal: 10000,
                batchNo: 1,
                kitchenStatus: 'NEW',
                itemNote: null,
                modifiers: [],
                createdAt: '2026-11-22T05:00:00.000Z',
              },
            ],
            createdAt: '2026-11-22T05:00:00.000Z',
          }
        : null,
      products: productAvailable
        ? [
            {
              id: 50,
              name: 'Topping Bò',
              price: 10000,
              station: 'BEP_NAU',
              categoryId: 1,
              categoryName: 'Topping',
              subtitle: null,
              imageUrl: null,
              isAvailable: true,
              sortOrder: 1,
              modifierGroups: [],
              comboItems: [],
            },
          ]
        : [],
      updatedAt: '2026-11-22T05:00:00.000Z',
    }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/table-2-token']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    // Put 1 item into draft cart
    fireEvent.click(await screen.findByRole('button', { name: 'Chọn' }));
    expect(await screen.findByTestId('qr-submit-order-btn')).not.toBeDisabled();

    // 1. Co-diner submits first order -> idle guest gets GUEST_ORDER_CREATED and sees PENDING banner & placed bar
    tableActiveOrderId = 202;
    await act(async () => {
      for (const h of listeners.get('qr:order_notice') ?? []) {
        h({
          orderId: 202,
          tableId: 2,
          kind: 'GUEST_ORDER_CREATED',
          batchNo: 1,
          totalAmount: 10000,
          timestamp: '2026-11-22T12:01:00.000Z',
        });
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-placed-orders-bar')).toHaveTextContent('Món đã gọi (1 món)');
      expect(screen.getByTestId('qr-status-banner')).toHaveTextContent('Mới gọi món');
    });

    // 2. Socket disconnects -> reconnecting indicator appears; reconnects -> indicator clears & refetches
    await act(async () => {
      for (const h of listeners.get('disconnect') ?? []) {
        h('transport close');
      }
    });
    expect(screen.getByTestId('qr-reconnecting-indicator')).toHaveTextContent('Mất kết nối, đang kết nối lại');

    const prevGetCount = getSpy.mock.calls.length;
    await act(async () => {
      for (const h of listeners.get('connect') ?? []) {
        h();
      }
    });
    await waitFor(() => {
      expect(screen.queryByTestId('qr-reconnecting-indicator')).not.toBeInTheDocument();
      expect(getSpy.mock.calls.length).toBeGreaterThan(prevGetCount);
    });

    // 3. Menu item becomes unavailable -> draft cart flags item & disables submit button
    productAvailable = false;
    await act(async () => {
      for (const h of listeners.get('menu:updated') ?? []) {
        h();
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-cart-unavailable-warning')).toBeInTheDocument();
      expect(screen.getByTestId('qr-submit-order-btn')).toBeDisabled();
    });

    // 4. Order VOIDED -> durable red banner shows reason AND keeps guest draft cart intact
    tableActiveOrderId = null;
    await act(async () => {
      for (const h of listeners.get('order:status_updated') ?? []) {
        h({ status: 'VOIDED', reason: 'Quán tạm hết hàng' });
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-status-banner')).toHaveTextContent('Quán tạm hết hàng');
      expect(screen.getByTestId('qr-submit-order-btn')).toBeInTheDocument();
    });

    // 5. Table QR rotated -> dedicated clear lock screen appears
    await act(async () => {
      for (const h of listeners.get('table:qr_rotated') ?? []) {
        h({ tableId: 2, rotatedAt: '2026-11-22T12:05:00.000Z' });
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-rotated-lock-screen')).toBeInTheDocument();
    });
  });

  it('keeps redirected table label stable across stale snapshots and does not flash PENDING banner when receiving a SERVING moved order', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(cb);
        listeners.set(event, list);
      }),
      off: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);

    let activeOrderId: number | null = 301;
    let activeOrderTableLabel = 'Bàn 01';
    let orderStatus: 'PENDING' | 'SERVING' = 'SERVING';

    vi.spyOn(apiClient, 'get').mockImplementation(async () => ({
      orderMode: 'DINE_IN',
      table: {
        tableId: 1,
        tableName: 'Bàn 01',
        status: activeOrderId ? 'OCCUPIED' : 'AVAILABLE',
        activeOrderId,
      },
      stations: [],
      categories: [],
      activeOrder: activeOrderId
        ? {
            orderId: activeOrderId,
            orderCode: `HD-${activeOrderId}`,
            status: orderStatus,
            tableLabel: activeOrderTableLabel,
            subtotalAmount: 10000,
            discountAmount: 0,
            totalAmount: 10000,
            items: [],
            createdAt: '2026-11-22T05:00:00.000Z',
          }
        : null,
      products: [],
      updatedAt: '2026-11-22T05:00:00.000Z',
    }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/ban01-tok']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 01');
    });

    // Simulate ORDER_SESSION_REDIRECTED to Bàn 02 while stale snapshot still returns activeOrderTableLabel = Bàn 01 once
    await act(async () => {
      for (const h of listeners.get('order:session_redirected') ?? []) {
        h({
          previousOrderId: 301,
          newActiveOrderId: 301,
          newTableId: 2,
          newTableLabel: 'Bàn 02',
          message: 'Đơn hàng của bạn đã được chuyển sang Bàn 02.',
        });
      }
    });

    // Header stays Bàn 02 without reverting back to Bàn 01!
    expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 02');
    unmount();
    listeners.clear();

    // Idle guest at Bàn 02 receives SERVING order from MOVE -> must NOT flash PENDING banner!
    activeOrderId = null;
    const qc2 = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={qc2}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/ban02-tok']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 01');
    });

    activeOrderId = 301;
    orderStatus = 'SERVING';
    activeOrderTableLabel = 'Bàn 02';
    await act(async () => {
      for (const h of listeners.get('qr:order_notice') ?? []) {
        h({
          orderId: 301,
          tableId: 2,
          kind: 'GUEST_ORDER_CREATED',
          orderStatus: 'SERVING',
          timestamp: '2026-11-22T12:06:00.000Z',
        });
      }
    });
    expect(screen.queryByText(/vui lòng chờ thu ngân xác nhận/i)).not.toBeInTheDocument();
  });

  it('re-evaluates public menu on store:settings_updated to enforce and release QR Wi-Fi lock realtime', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(cb);
        listeners.set(event, list);
      }),
      off: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);

    let wifiBlocked = false;
    vi.spyOn(apiClient, 'get').mockImplementation(async () => {
      if (wifiBlocked) {
        throw new ApiClientError({
          statusCode: 403,
          error: 'Forbidden',
          code: 'QR_WIFI_REQUIRED',
          message: 'Vui lòng kết nối Wi-Fi quán để đặt món',
          details: { wifiSsid: 'An Vat Tran', wifiPassword: 'chucngonmieng' },
        });
      }
      return {
        orderMode: 'DINE_IN',
        table: { tableId: 1, tableName: 'Bàn 01', status: 'AVAILABLE', activeOrderId: null },
        stations: [],
        categories: [],
        activeOrder: null,
        products: [],
        updatedAt: '2026-11-22T05:00:00.000Z',
      };
    });

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/ban01-tok']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 01');
    });

    wifiBlocked = true;
    await act(async () => {
      for (const h of listeners.get(SocketEvents.STORE_SETTINGS_UPDATED) ?? []) {
        h();
      }
    });
    await waitFor(() => {
      expect(screen.getByTestId('qr-wifi-lock-screen')).toBeInTheDocument();
      expect(screen.getByTestId('qr-lock-wifi-ssid')).toHaveTextContent('An Vat Tran');
    });

    wifiBlocked = false;
    await act(async () => {
      for (const h of listeners.get(SocketEvents.STORE_SETTINGS_UPDATED) ?? []) {
        h();
      }
    });
    await waitFor(() => {
      expect(screen.queryByTestId('qr-wifi-lock-screen')).not.toBeInTheDocument();
      expect(screen.getByTestId('qr-table-header')).toHaveTextContent('Bàn 01');
    });
  });

  it('reconciles missed terminal order transition cleanly on visibilitychange foreground return without replaying old ephemeral notices', async () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const mockSocket = {
      connected: true,
      connect: vi.fn(),
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(cb);
        listeners.set(event, list);
      }),
      off: vi.fn(),
    };
    vi.spyOn(socketClient, 'connectPosSocket').mockReturnValue(mockSocket as never);

    let serverOrderActive = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async () => ({
      orderMode: 'DINE_IN',
      table: {
        tableId: 1,
        tableName: 'Bàn 01',
        status: serverOrderActive ? 'PENDING' : 'AVAILABLE',
        activeOrderId: serverOrderActive ? 501 : null,
      },
      stations: [],
      categories: [],
      activeOrder: serverOrderActive
        ? {
            orderId: 501,
            orderCode: 'HD-501',
            status: 'PENDING',
            tableLabel: 'Bàn 01',
            subtotalAmount: 10000,
            discountAmount: 0,
            totalAmount: 10000,
            items: [
              {
                id: 1,
                productId: 50,
                productName: 'Topping Bò',
                quantity: 1,
                unitPrice: 10000,
                lineTotal: 10000,
                batchNo: 1,
                kitchenStatus: 'NEW',
                itemNote: null,
                modifiers: [],
                createdAt: '2026-11-22T05:00:00.000Z',
              },
            ],
            createdAt: '2026-11-22T05:00:00.000Z',
          }
        : null,
      products: [],
      updatedAt: '2026-11-22T05:00:00.000Z',
    }));

    const qc = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(
      <QueryClientProvider client={qc}>
        <StoreSettingsContext.Provider
          value={{ settings: makePublicSettings(), messages: undefined, query: {} as never }}
        >
          <MemoryRouter
            initialEntries={['/qr/ban01-tok']}
            future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
          >
            <Routes>
              <Route path="/qr/:token" element={<QrOrderPage />} />
            </Routes>
          </MemoryRouter>
        </StoreSettingsContext.Provider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('qr-status-banner')).toHaveTextContent('Mới gọi món');
    });

    // Simulate missed PAID while device slept, then returning to foreground (visibilitychange === 'visible')
    serverOrderActive = false;
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('qr-status-banner')).not.toBeInTheDocument();
      expect(screen.queryByTestId('qr-placed-orders-bar')).not.toBeInTheDocument();
      expect(screen.queryByTestId('qr-realtime-notice')).not.toBeInTheDocument();
    });
    expect(
      (JSON.parse(localStorage.getItem('fnb_qr_session_ban01-tok') ?? '{}') as {
        activeOrderId: number | null;
      }).activeOrderId,
    ).toBeNull();
  });
});
