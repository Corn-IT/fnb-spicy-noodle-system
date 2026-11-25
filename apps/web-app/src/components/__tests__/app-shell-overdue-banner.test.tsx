import { SocketEvents, UserPermissionsSchema, type PosTableGridResponse } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AppShell,
  resetAppShellOrderAlertDedupForTesting,
} from '@/components/layout/app-shell';
import { useToastStore } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import * as qrVoiceAnnouncer from '@/lib/qr-voice-announcer';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

type SocketHandler = (payload: unknown) => void;
class FakeShellSocket {
  public connected = true;
  private handlers = new Map<string, Set<SocketHandler>>();
  on(event: string, fn: SocketHandler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return this;
  }
  off(event: string, fn?: SocketHandler) {
    if (!fn) this.handlers.delete(event);
    else this.handlers.get(event)?.delete(fn);
    return this;
  }
  emitFromServer(event: string, payload: unknown) {
    for (const fn of this.handlers.get(event) ?? []) {
      fn(payload);
    }
  }
}

let activeMockSocket: FakeShellSocket | null = null;

vi.mock('@/providers/socket-provider', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
  usePosSocketContext: () => ({
    socket: activeMockSocket,
    isConnected: Boolean(activeMockSocket?.connected),
    connectGuestSocket: vi.fn(),
  }),
}));

describe('AppShell global QR overdue warning banner & reminder monitor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    activeMockSocket = null;
    resetAppShellOrderAlertDedupForTesting();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-tok',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({
          pos: { view: true },
          invoices: { view: true },
        }),
      },
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows red overdue banner on non-POS routes, fires voice reminder at >= 5m, and navigates to /pos on click', async () => {
    const enqueueSpy = vi
      .spyOn(qrVoiceAnnouncer, 'enqueueQrVoiceAlert')
      .mockResolvedValue(undefined);
    const sixMinsAgo = new Date(Date.now() - 6 * 60_000).toISOString();
    const gridPayload: PosTableGridResponse = {
      tables: [
        {
          id: 5,
          name: 'Bàn 05',
          status: 'PENDING',
          activeOrderId: 505,
          activeOrder: {
            orderId: 505,
            orderCode: 'HD-505',
            orderType: 'DINE_IN',
            tableId: 5,
            tableLabel: 'Bàn 05',
            takeawayNumber: null,
            status: 'PENDING',
            totalAmount: 55000,
            createdAt: sixMinsAgo,
            pendingQrSince: sixMinsAgo,
            pendingQrKind: 'NEW',
          },
        },
      ],
      takeaways: [],
    };

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return gridPayload;
      throw new Error(`Unexpected GET ${url}`);
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter initialEntries={['/invoices']} future={routerFutureFlags}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/invoices" element={<div data-testid="mock-invoices-view">Invoices</div>} />
              <Route path="/pos" element={<div data-testid="mock-pos-view">POS View</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryProvider>,
    );

    const banner = await screen.findByTestId('global-overdue-qr-banner');
    expect(banner).toHaveTextContent('Bàn 05');

    await waitFor(() => {
      expect(enqueueSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableLabel: 'Bàn 05',
          kind: 'NEW',
          isReminder: true,
        }),
      );
    });

    fireEvent.click(banner);
    expect(await screen.findByTestId('mock-pos-view')).toBeInTheDocument();
    expect(screen.queryByTestId('global-overdue-qr-banner')).not.toBeInTheDocument();
  });

  it('plays voice alert & shows toast immediately at t=0 across route transitions (/pos -> /invoices -> /menu) and on Service Worker POS_PUSH_SUPPRESSED_FOREGROUND fallback', async () => {
    activeMockSocket = new FakeShellSocket();
    const enqueueSpy = vi
      .spyOn(qrVoiceAnnouncer, 'enqueueQrVoiceAlert')
      .mockResolvedValue(undefined);

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/pos/tables') return { tables: [], takeaways: [] };
      throw new Error(`Unexpected GET ${url}`);
    });

    const swListeners = new Set<(event: MessageEvent) => void>();
    Object.defineProperty(window.navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistration: vi.fn(async () => null),
        addEventListener: vi.fn((type: string, fn: (event: MessageEvent) => void) => {
          if (type === 'message') swListeners.add(fn);
        }),
        removeEventListener: vi.fn((type: string, fn: (event: MessageEvent) => void) => {
          if (type === 'message') swListeners.delete(fn);
        }),
      },
    });

    function NavProbe({ label }: { label: string }) {
      const nav = useNavigate();
      return (
        <div>
          <span data-testid="active-route-label">{label}</span>
          <button type="button" data-testid="go-invoices" onClick={() => nav('/invoices')}>
            Invoices
          </button>
          <button type="button" data-testid="go-menu" onClick={() => nav('/menu')}>
            Menu
          </button>
          <button type="button" data-testid="go-pos" onClick={() => nav('/pos')}>
            POS
          </button>
        </div>
      );
    }

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryProvider client={queryClient}>
        <MemoryRouter initialEntries={['/pos']} future={routerFutureFlags}>
          <Routes>
            <Route element={<AppShell />}>
              <Route path="/pos" element={<NavProbe label="POS" />} />
              <Route path="/invoices" element={<NavProbe label="INVOICES" />} />
              <Route path="/menu" element={<NavProbe label="MENU" />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryProvider>,
    );

    expect(await screen.findByTestId('active-route-label')).toHaveTextContent('POS');

    // 1. Navigate away from /pos to /invoices -> ORDER_QR_NEW arrives at t=0
    fireEvent.click(screen.getByTestId('go-invoices'));
    expect(await screen.findByTestId('active-route-label')).toHaveTextContent('INVOICES');

    act(() => {
      activeMockSocket!.emitFromServer(SocketEvents.ORDER_QR_NEW, {
        orderId: 301,
        tableLabel: 'Bàn 03',
      });
    });

    expect(enqueueSpy).toHaveBeenCalledWith({
      tableLabel: 'Bàn 03',
      kind: 'NEW',
    });
    expect(
      useToastStore.getState().toasts.some((t) => /Bàn 03/i.test(`${t.title} ${t.description ?? ''}`)),
    ).toBe(true);

    // 2. Navigate to /menu -> ORDER_QR_ADDON arrives at t=0
    fireEvent.click(screen.getByTestId('go-menu'));
    expect(await screen.findByTestId('active-route-label')).toHaveTextContent('MENU');

    act(() => {
      activeMockSocket!.emitFromServer(SocketEvents.ORDER_QR_ADDON, {
        orderId: 301,
        tableLabel: 'Bàn 03',
        batchNo: 2,
      });
    });

    expect(enqueueSpy).toHaveBeenCalledWith({
      tableLabel: 'Bàn 03',
      kind: 'ADDON',
      batchNo: 2,
    });

    // 3. Simulate mobile Service Worker delivering POS_PUSH_SUPPRESSED_FOREGROUND when Socket.io missed Bàn 08 at t=0
    act(() => {
      for (const listener of swListeners) {
        listener({
          data: {
            type: 'POS_PUSH_SUPPRESSED_FOREGROUND',
            payload: {
              kind: 'QR_NEW',
              orderId: 808,
              tableLabel: 'Bàn 08',
            },
          },
        } as unknown as MessageEvent);
      }
    });

    expect(enqueueSpy).toHaveBeenCalledWith({
      tableLabel: 'Bàn 08',
      kind: 'NEW',
    });
    expect(
      useToastStore.getState().toasts.some((t) => /Bàn 08/i.test(`${t.title} ${t.description ?? ''}`)),
    ).toBe(true);
  });
});
