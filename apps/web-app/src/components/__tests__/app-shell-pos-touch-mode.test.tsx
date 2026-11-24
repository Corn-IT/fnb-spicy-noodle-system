import { UserPermissionsSchema, type PosTableGridResponse } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/app-shell';
import { apiClient } from '@/lib/api-client';
import * as qrVoiceAnnouncer from '@/lib/qr-voice-announcer';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

vi.mock('@/providers/socket-provider', () => ({
  SocketProvider: ({ children }: { children: React.ReactNode }) => children,
  usePosSocketContext: () => ({ socket: null, connectGuestSocket: vi.fn() }),
}));

function renderShellAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter initialEntries={[path]} future={routerFutureFlags}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/pos" element={<div data-testid="mock-pos-view" />} />
            <Route path="/pos/touch" element={<div data-testid="mock-pos-touch-view" />} />
            <Route path="/pos/touch/hub" element={<div data-testid="mock-touch-hub-view" />} />
            <Route
              path="/pos/touch/invoices"
              element={<div data-testid="mock-touch-invoices-view" />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('AppShell — chế độ trình chiếu cho /pos/touch', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(apiClient, 'get').mockResolvedValue({ tables: [], takeaways: [] });
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-tok',
      user: {
        id: 2,
        employeeId: 12,
        username: 'cashier01',
        fullName: 'Thu ngân',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
      },
    });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps the sidebar and top navbar on the regular /pos screen', async () => {
    renderShellAt('/pos');
    expect(await screen.findByTestId('mock-pos-view')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-right-controls')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar-standalone-routes')).toBeInTheDocument();
  });

  it('hides the sidebar, navbar and page padding on /pos/touch', async () => {
    renderShellAt('/pos/touch');
    expect(await screen.findByTestId('mock-pos-touch-view')).toBeInTheDocument();
    expect(screen.queryByTestId('navbar-right-controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sidebar-standalone-routes')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    const main = document.querySelector('main[data-app-content="true"]');
    expect(main?.className).toContain('p-0');
    expect(main?.className).not.toContain('md:p-5');
  });

  it('still shows the offline banner on /pos/touch', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    renderShellAt('/pos/touch');
    expect(await screen.findByTestId('network-offline-banner')).toBeInTheDocument();
  });

  it('keeps the sidebar and navbar on /pos/touch for an account without POS access (no 403 dead end)', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: {
        id: 5,
        employeeId: 5,
        username: 'ketoan',
        fullName: 'Kế toán',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ invoices: { view: true } }),
      },
    });
    renderShellAt('/pos/touch');
    expect(await screen.findByTestId('mock-pos-touch-view')).toBeInTheDocument();
    expect(screen.getByTestId('navbar-right-controls')).toBeInTheDocument();
  });

  it('hides sidebar and navbar on /pos/touch/hub and /pos/touch/invoices subpages', async () => {
    renderShellAt('/pos/touch/hub');
    expect(await screen.findByTestId('mock-touch-hub-view')).toBeInTheDocument();
    expect(screen.queryByTestId('navbar-right-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('shows overdue QR red banner on /pos/touch/invoices and navigates back to /pos/touch (not desktop /pos)', async () => {
    vi.spyOn(qrVoiceAnnouncer, 'enqueueQrVoiceAlert').mockResolvedValue(undefined);
    const sixMinsAgo = new Date(Date.now() - 6 * 60_000).toISOString();
    const gridPayload: PosTableGridResponse = {
      tables: [
        {
          id: 9,
          name: 'Bàn 09',
          status: 'PENDING',
          activeOrderId: 909,
          activeOrder: {
            orderId: 909,
            orderCode: 'HD-909',
            orderType: 'DINE_IN',
            tableId: 9,
            tableLabel: 'Bàn 09',
            takeawayNumber: null,
            status: 'PENDING',
            totalAmount: 65000,
            createdAt: sixMinsAgo,
            pendingQrSince: sixMinsAgo,
            pendingQrKind: 'NEW',
          },
        },
      ],
      takeaways: [],
    };
    vi.spyOn(apiClient, 'get').mockResolvedValue(gridPayload);

    renderShellAt('/pos/touch/invoices');
    expect(await screen.findByTestId('mock-touch-invoices-view')).toBeInTheDocument();
    const banner = await screen.findByTestId('global-overdue-qr-banner');
    expect(banner).toHaveTextContent('Bàn 09');

    fireEvent.click(banner);
    expect(await screen.findByTestId('mock-pos-touch-view')).toBeInTheDocument();
    expect(screen.queryByTestId('global-overdue-qr-banner')).not.toBeInTheDocument();
  });
});
