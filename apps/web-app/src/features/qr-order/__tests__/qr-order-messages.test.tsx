import { DEFAULT_STORE_SETTINGS, type PublicStoreSettingsResponse } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { ApiClientError, apiClient } from '@/lib/api-client';
import { queryClient as appQueryClient } from '@/providers/query-provider';
import * as socketClient from '@/lib/socket-client';

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
      redirectNotice: string | null;
    };
    expect(parsed.activeOrderId).toBeNull();
    expect(parsed.redirectNotice).toBeNull();

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

    await screen.findByTestId('qr-status-banner');

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
});
