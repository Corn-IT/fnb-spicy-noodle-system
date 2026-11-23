import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/app-shell';
import { apiClient } from '@/lib/api-client';
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
});
