import { UserPermissionsSchema, type PosTableGridResponse } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('AppShell global QR overdue warning banner & reminder monitor', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
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
});
