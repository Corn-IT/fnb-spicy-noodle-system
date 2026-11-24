import { UserPermissionsSchema, type PosTableGridResponse } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  hasAnyBackOfficeAccess,
  isPosLiveBoardPath,
  isPosTouchShellPath,
  resolveDesktopFallbackPath,
  resolveTouchAwarePath,
  resolveTouchPrefetchDataPath,
  TOUCH_PATHS,
  TOUCH_ROUTE_BY_PATH,
  TouchHubPage,
  TouchShellLayout,
  useTouchShell,
} from '@/components/touch-shell';
import { apiClient } from '@/lib/api-client';
import { POS_TABLE_GRID_QUERY_KEY } from '@/lib/pos-table-grid-query';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore, type AuthenticatedUser } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

function createUser(
  overrides: Omit<Partial<AuthenticatedUser>, 'permissions'> & {
    permissions?: Record<string, Record<string, boolean>>;
  } = {},
): AuthenticatedUser {
  return {
    id: 2,
    employeeId: 12,
    username: 'thungan',
    fullName: 'Nguyễn Thu Ngân',
    isSuperAdmin: false,
    ...overrides,
    permissions: UserPermissionsSchema.parse(
      overrides.permissions ?? {
        pos: { view: true, create: true, update: true },
        invoices: { view: true },
        cashflow: { view: true },
        inventory: { view: true },
        menu: { view: true, update: true },
        dashboard: { view: true },
      },
    ),
  };
}

function MockOrderToggleBoard() {
  const { setHideBottomNav } = useTouchShell();
  const [inOrder, setInOrder] = React.useState(false);

  React.useEffect(() => {
    setHideBottomNav(inOrder);
    return () => setHideBottomNav(false);
  }, [inOrder, setHideBottomNav]);

  return (
    <div data-testid="mock-touch-board">
      <button type="button" data-testid="enter-order-btn" onClick={() => setInOrder(true)}>
        Vào bàn
      </button>
      <button type="button" data-testid="leave-order-btn" onClick={() => setInOrder(false)}>
        Quay lại sơ đồ
      </button>
    </div>
  );
}

function renderTouchShell(initialPath: string, queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]} future={routerFutureFlags}>
        <Routes>
          <Route path="/pos" element={<div data-testid="desktop-pos-page" />} />
          <Route path="/invoices" element={<div data-testid="desktop-invoices-page" />} />
          <Route path="/login" element={<div data-testid="login-page" />} />
          <Route path="/pos/touch" element={<TouchShellLayout />}>
            <Route index element={<MockOrderToggleBoard />} />
            <Route path="hub" element={<TouchHubPage />} />
            <Route path="invoices" element={<div data-testid="touch-invoices-content" />} />
            <Route path="cashflow" element={<div data-testid="touch-cashflow-content" />} />
            <Route path="stock-status" element={<div data-testid="touch-stock-content" />} />
            <Route path="printer" element={<div data-testid="touch-printer-content" />} />
            <Route path="profile" element={<div data-testid="touch-profile-content" />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('touch-routes helpers', () => {
  it('distinguishes Touch Shell paths from live POS board paths', () => {
    expect(isPosTouchShellPath('/pos/touch')).toBe(true);
    expect(isPosTouchShellPath('/pos/touch/hub')).toBe(true);
    expect(isPosTouchShellPath('/pos/touch/invoices')).toBe(true);
    expect(isPosTouchShellPath('/pos')).toBe(false);

    expect(isPosLiveBoardPath('/pos')).toBe(true);
    expect(isPosLiveBoardPath('/pos/touch')).toBe(true);
    expect(isPosLiveBoardPath('/pos/touch/hub')).toBe(false);
    expect(isPosLiveBoardPath('/pos/touch/invoices')).toBe(false);
  });

  it('resolves desktop fallback paths accurately for Touch Shell subpages', () => {
    expect(resolveDesktopFallbackPath(TOUCH_PATHS.INVOICES)).toBe('/invoices');
    expect(resolveDesktopFallbackPath(TOUCH_PATHS.CASHFLOW)).toBe('/cashflow');
    expect(resolveDesktopFallbackPath(TOUCH_PATHS.STOCK_STATUS)).toBe('/menu');
    expect(resolveDesktopFallbackPath(TOUCH_PATHS.PRINTER)).toBe('/settings');
    expect(resolveDesktopFallbackPath(TOUCH_PATHS.HUB)).toBe('/pos');

    // Printer & Hub không được prefetch API `/settings` hoặc `/pos` để tránh 403 với tài khoản thu ngân.
    expect(resolveTouchPrefetchDataPath(TOUCH_ROUTE_BY_PATH.get(TOUCH_PATHS.PRINTER)!)).toBeNull();
    expect(resolveTouchPrefetchDataPath(TOUCH_ROUTE_BY_PATH.get(TOUCH_PATHS.HUB)!)).toBeNull();
    expect(resolveTouchPrefetchDataPath(TOUCH_ROUTE_BY_PATH.get(TOUCH_PATHS.INVOICES)!)).toBe(
      '/invoices',
    );

    // Ánh xạ route khi bấm phím tắt (VD trong Dashboard): trong Touch Shell giữ nguyên chế độ cảm ứng.
    expect(resolveTouchAwarePath('/pos', true)).toBe(TOUCH_PATHS.POS);
    expect(resolveTouchAwarePath('/payment-qr', true)).toBe(TOUCH_PATHS.PAYMENT_QR);
    expect(resolveTouchAwarePath('/invoices', true)).toBe(TOUCH_PATHS.INVOICES);
    expect(resolveTouchAwarePath('/cashflow', true)).toBe(TOUCH_PATHS.CASHFLOW);
    expect(resolveTouchAwarePath('/inventory', true)).toBe(TOUCH_PATHS.INVENTORY);
    // Module Giai đoạn 2 chưa có trong Touch Shell giữ nguyên đường dẫn desktop.
    expect(resolveTouchAwarePath('/schedules', true)).toBe('/schedules');
    // Ngoài Touch Shell giữ nguyên đường dẫn gốc.
    expect(resolveTouchAwarePath('/payment-qr', false)).toBe('/payment-qr');
  });

  it('detects back-office access for Phase 2 banner', () => {
    expect(hasAnyBackOfficeAccess(createUser())).toBe(false);
    expect(
      hasAnyBackOfficeAccess(
        createUser({ permissions: { pos: { view: true }, employees: { view: true } } }),
      ),
    ).toBe(true);
    expect(hasAnyBackOfficeAccess(createUser({ isSuperAdmin: true }))).toBe(true);
  });
});

describe('TouchShellLayout & TouchBottomNav', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: createUser(),
    });
    vi.spyOn(apiClient, 'get').mockResolvedValue([]);
    vi.spyOn(apiClient, 'post').mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-pos-touch');
  });

  it('sets data-pos-touch on html and renders RBAC-filtered bottom nav items', async () => {
    renderTouchShell(TOUCH_PATHS.POS);
    expect(document.documentElement).toHaveAttribute('data-pos-touch', 'true');
    expect(screen.getByTestId('touch-bottom-nav-pos')).toBeInTheDocument();
    expect(screen.getByTestId('touch-bottom-nav-invoices')).toBeInTheDocument();
    expect(screen.getByTestId('touch-bottom-nav-cashflow')).toBeInTheDocument();
    expect(screen.getByTestId('touch-bottom-nav-hub')).toBeInTheDocument();
  });

  it('hides cashflow bottom nav tab when user lacks cashflow.view permission', () => {
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: createUser({
        permissions: { pos: { view: true }, invoices: { view: true } },
      }),
    });
    renderTouchShell(TOUCH_PATHS.POS);
    expect(screen.getByTestId('touch-bottom-nav-pos')).toBeInTheDocument();
    expect(screen.getByTestId('touch-bottom-nav-invoices')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-bottom-nav-cashflow')).not.toBeInTheDocument();
    expect(screen.getByTestId('touch-bottom-nav-hub')).toBeInTheDocument();
  });

  it('shows red QR pending count badge on POS bottom nav tab', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const gridData: PosTableGridResponse = {
      tables: [
        { id: 1, name: 'Bàn 01', status: 'PENDING', activeOrderId: 10, activeOrder: null },
        { id: 2, name: 'Bàn 02', status: 'PENDING', activeOrderId: 11, activeOrder: null },
        { id: 3, name: 'Bàn 03', status: 'OCCUPIED', activeOrderId: 12, activeOrder: null },
      ],
      takeaways: [],
    };
    queryClient.setQueryData(POS_TABLE_GRID_QUERY_KEY, gridData);

    renderTouchShell(TOUCH_PATHS.INVOICES, queryClient);
    expect(screen.getByTestId('touch-bottom-nav-qr-badge')).toHaveTextContent('2');
  });

  it('hides bottom nav while entering an order screen and restores it on back', () => {
    renderTouchShell(TOUCH_PATHS.POS);
    expect(screen.getByTestId('touch-bottom-nav')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('enter-order-btn'));
    expect(screen.queryByTestId('touch-bottom-nav')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('leave-order-btn'));
    expect(screen.getByTestId('touch-bottom-nav')).toBeInTheDocument();
  });

  it('navigates to matching desktop route when tapping exit desktop on a touch subpage', async () => {
    renderTouchShell(TOUCH_PATHS.INVOICES);
    expect(screen.getByTestId('touch-subpage-header')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('touch-subpage-exit-desktop'));
    expect(await screen.findByTestId('desktop-invoices-page')).toBeInTheDocument();
    expect(document.documentElement).not.toHaveAttribute('data-pos-touch');
  });
});

describe('TouchHubPage', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiPreferencesStore.getState().setTheme('dark');
    useAuthStore.getState().setAuth({
      accessToken: 'tok',
      user: createUser(),
    });
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/menu/products') {
        return [
          {
            id: 1,
            name: 'Mì Cay Hải Sản',
            price: 55000,
            station: 'BEP_NAU',
            isAvailable: false,
            modifierGroups: [],
          },
          {
            id: 2,
            name: 'Mì Cay Bò',
            price: 50000,
            station: 'BEP_NAU',
            isAvailable: true,
            modifierGroups: [],
          },
        ];
      }
      return [];
    });
    vi.spyOn(apiClient, 'post').mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute('data-pos-touch');
  });

  it('filters Hub tiles by RBAC and displays out-of-stock count badge', async () => {
    renderTouchShell(TOUCH_PATHS.HUB);

    expect(screen.getByTestId('touch-hub-tile-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-menu')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-hub-tile-settings')).not.toBeInTheDocument();
    expect(screen.queryByTestId('touch-hub-tile-discounts')).not.toBeInTheDocument();

    expect(screen.getByTestId('touch-hub-tile-stock-status')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-printer')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-invoices')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-cashflow')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-inventory')).toBeInTheDocument();
    expect(screen.getByTestId('touch-hub-tile-profile')).toBeInTheDocument();
    expect(screen.queryByTestId('touch-hub-backoffice-banner')).not.toBeInTheDocument();

    expect(await screen.findByTestId('touch-hub-out-of-stock-badge')).toHaveTextContent('1');
  });

  it('preserves fnb-ui-preferences on logout from Touch Hub (Hard Invariant 9)', async () => {
    localStorage.setItem('fnb-ui-preferences', JSON.stringify({ state: { theme: 'dark' } }));
    renderTouchShell(TOUCH_PATHS.HUB);

    fireEvent.click(screen.getByTestId('touch-hub-logout'));

    expect(await screen.findByTestId('login-page')).toBeInTheDocument();
    await waitFor(() => {
      expect(useAuthStore.getState().user).toBeNull();
    });
    expect(localStorage.getItem('fnb-ui-preferences')).not.toBeNull();
  });
});
