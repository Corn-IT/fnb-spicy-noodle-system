import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardOverviewResponseSchema,
  PosTableGridResponseSchema,
  PublicStoreSettingsResponseSchema,
  UserPermissionsSchema,
} from '@fnb/shared';
import { apiClient } from '@/lib/api-client';
import { queryClient } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import {
  cancelRoutePrefetch,
  clearAllRoutePrefetchTimers,
  loadQrOrderPage,
  prefetchRouteChunk,
  prefetchRouteData,
  scheduleRoutePrefetch,
  startIdleRouteChunkWarmup,
} from '@/lib/route-prefetch';

const stubComponent = () => null;

vi.mock('@/features/qr-order', () => ({ QrOrderPage: stubComponent }));
vi.mock('@/features/profile', () => ({ LoginPage: stubComponent, ProfilePage: stubComponent }));
vi.mock('@/features/dashboard', () => ({ DashboardPage: stubComponent }));
vi.mock('@/features/pos-counter', () => ({ PosUnifiedPage: stubComponent, PosTouchPage: stubComponent }));
vi.mock('@/components/touch-shell', () => ({ TouchHubPage: stubComponent }));
vi.mock('@/features/menu', () => ({
  TouchStockStatusPage: stubComponent,
  MenuManagementPage: stubComponent,
}));
vi.mock('@/features/store-settings', () => ({
  TouchPrinterPage: stubComponent,
  StoreSettingsPage: stubComponent,
}));
vi.mock('@/features/invoices', () => ({ InvoicesPage: stubComponent }));
vi.mock('@/features/inventory', () => ({ InventoryPage: stubComponent }));
vi.mock('@/features/cashflow', () => ({ CashflowPage: stubComponent }));
vi.mock('@/features/payment-qr', () => ({ PaymentQrPage: stubComponent }));
vi.mock('@/features/discounts', () => ({ DiscountsPage: stubComponent }));
vi.mock('@/features/employees', () => ({ EmployeesPage: stubComponent }));
vi.mock('@/features/schedules', () => ({ SchedulesMatrixPage: stubComponent }));
vi.mock('@/features/payroll', () => ({ PayrollPage: stubComponent }));
vi.mock('@/features/master-data', () => ({ MasterDataPage: stubComponent }));
vi.mock('@/features/rbac', () => ({ RbacUsersPage: stubComponent }));

describe('route-prefetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAllRoutePrefetchTimers();
    useAuthStore.getState().setAuth({
      accessToken: 'staff-token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Quản trị',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
  });

  afterEach(() => {
    clearAllRoutePrefetchTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('skips prefetchRouteData and prefetchRouteChunk when logged out', async () => {
    useAuthStore.getState().clearAuth();
    const getSpy = vi.spyOn(apiClient, 'get');
    const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery');

    await prefetchRouteData('/dashboard');
    await prefetchRouteChunk('/dashboard');
    scheduleRoutePrefetch('/dashboard', 50);

    expect(getSpy).not.toHaveBeenCalled();
    expect(prefetchSpy).not.toHaveBeenCalled();
  });

  it('prefetches query keys and invokes queryFn across every staff route', async () => {
    const requestedUrls: string[] = [];
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      requestedUrls.push(url);
      if (url === '/api/v1/menu/products') {
        return [
          {
            id: 1,
            name: 'Mì bò',
            price: 55000,
            station: 'BEP_NAU',
            modifierGroups: [],
            comboItems: [],
          },
        ] as never;
      }
      if (url === '/api/v1/payment-qr') {
        return [
          {
            id: 1,
            label: 'TK Chính',
            bankCode: 'VPB',
            bankName: 'VPBank',
            accountNo: '123456',
            accountName: 'QUAN MI CAY',
            priority: 1,
            isActive: true,
            dailyLimit: null,
            monthlyLimit: null,
            yearlyLimit: null,
            usedDay: 0,
            usedMonth: 0,
            usedYear: 0,
            status: 'AVAILABLE',
            hasOrders: false,
            orderCount: 0,
            createdAt: '2026-11-28T00:00:00.000Z',
            updatedAt: '2026-11-28T00:00:00.000Z',
          },
        ] as never;
      }
      return { ok: true } as never;
    });
    vi.spyOn(DashboardOverviewResponseSchema, 'parse').mockImplementation((v) => v as never);
    vi.spyOn(PosTableGridResponseSchema, 'parse').mockImplementation((v) => v as never);
    vi.spyOn(PublicStoreSettingsResponseSchema, 'parse').mockImplementation((v) => v as never);

    vi.spyOn(queryClient, 'prefetchQuery').mockImplementation((async (opts: { queryFn?: () => Promise<unknown> }) => {
      if (opts.queryFn) {
        await opts.queryFn();
      }
      return undefined;
    }) as never);

    const routes = [
      '/dashboard',
      '/pos',
      '/menu',
      '/discounts',
      '/invoices',
      '/cashflow',
      '/payment-qr',
      '/inventory',
      '/employees',
      '/schedules',
      '/payroll',
      '/master-data',
      '/rbac',
      '/settings',
      '/profile',
      '/unknown-route',
    ];

    for (const route of routes) {
      await prefetchRouteData(route);
    }

    expect(requestedUrls).toEqual([
      '/api/v1/dashboard/overview',
      '/api/v1/pos/tables',
      '/api/v1/menu/products',
      '/api/v1/menu/products',
      '/api/v1/discounts?page=1&limit=50',
      '/api/v1/invoices',
      '/api/v1/cashflow/preview',
      '/api/v1/cashflow/settlements',
      '/api/v1/payment-qr',
      '/api/v1/inventory-imports',
      '/api/v1/employees',
      '/api/v1/schedules',
      '/api/v1/payroll',
      '/api/v1/mdm',
      '/api/v1/users',
      '/api/v1/settings',
      '/api/v1/profile',
    ]);
  });

  it('loads route chunks, schedules debounced prefetches, cancels pending timers, and warms idle chunks', async () => {
    vi.useFakeTimers();

    const prefetchSpy = vi.spyOn(queryClient, 'prefetchQuery').mockResolvedValue(undefined);
    await prefetchRouteChunk('/unknown-chunk');
    await loadQrOrderPage();
    for (const chunkPath of [
      '/dashboard',
      '/pos',
      '/menu',
      '/discounts',
      '/invoices',
      '/cashflow',
      '/payment-qr',
      '/inventory',
      '/employees',
      '/schedules',
      '/payroll',
      '/master-data',
      '/rbac',
      '/settings',
      '/profile',
      '/pos/touch',
      '/pos/touch/hub',
      '/pos/touch/stock-status',
      '/pos/touch/printer',
    ]) {
      await prefetchRouteChunk(chunkPath);
    }

    // Same current pathname is skipped
    window.history.replaceState({}, '', '/invoices');
    scheduleRoutePrefetch('/invoices', 100);
    await vi.advanceTimersByTimeAsync(150);
    expect(prefetchSpy).not.toHaveBeenCalled();

    // Cancel before firing prevents prefetch
    scheduleRoutePrefetch('/cashflow', 100);
    cancelRoutePrefetch('/cashflow');
    await vi.advanceTimersByTimeAsync(150);
    expect(prefetchSpy).not.toHaveBeenCalled();

    // Debounced prefetch fires both chunk & data after delay
    scheduleRoutePrefetch('/rbac', 80);
    await vi.advanceTimersByTimeAsync(100);
    expect(prefetchSpy).toHaveBeenCalledTimes(1);

    // Warmup with fallback timer path (no requestIdleCallback)
    const origIdle = (window as { requestIdleCallback?: unknown }).requestIdleCallback;
    delete (window as { requestIdleCallback?: unknown }).requestIdleCallback;
    const stopFallback = startIdleRouteChunkWarmup(['/inventory', '/discounts'], {
      initialDelayMs: 50,
      stepDelayMs: 25,
    });
    await vi.advanceTimersByTimeAsync(200);
    stopFallback();

    // Warmup with requestIdleCallback + cancellation before idle callback runs
    const cancelIdle = vi.fn();
    Object.defineProperty(window, 'requestIdleCallback', {
      configurable: true,
      value: (cb: () => void) => {
        void cb;
        return 42;
      },
    });
    Object.defineProperty(window, 'cancelIdleCallback', {
      configurable: true,
      value: cancelIdle,
    });
    const stopIdle = startIdleRouteChunkWarmup(['/employees', '/payroll'], {
      initialDelayMs: 20,
      stepDelayMs: 10,
    });
    await vi.advanceTimersByTimeAsync(30);
    stopIdle();
    expect(cancelIdle).toHaveBeenCalledWith(42);

    // Empty queue returns no-op cleanup cleanly
    const stopEmpty = startIdleRouteChunkWarmup(['/non-existent']);
    stopEmpty();

    if (origIdle !== undefined) {
      Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: origIdle });
    }
  });
});
