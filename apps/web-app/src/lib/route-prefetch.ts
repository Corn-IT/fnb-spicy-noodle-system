import {
  DashboardOverviewResponseSchema,
  PaymentAccountSchema,
  PosTableGridResponseSchema,
  ProductSchema,
  PublicStoreSettingsResponseSchema,
} from '@fnb/shared';
import * as React from 'react';
import { z } from 'zod';

import { apiClient } from '@/lib/api-client';
import { queryClient } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

export const ROUTE_PREFETCH_DEBOUNCE_MS = 120;
export const HR_SOCKET_SYNCED_STALE_TIME_MS = 15_000;

type LazyComponentModule = Promise<{ default: React.ComponentType<Record<string, never>> }>;
type RouteChunkLoader = () => LazyComponentModule;

function createMemoizedLoader<TModule extends Record<string, unknown>>(
  importer: () => Promise<TModule>,
  pick: (mod: TModule) => React.ComponentType<Record<string, never>>,
): RouteChunkLoader {
  let cachedPromise: LazyComponentModule | null = null;
  return () => {
    if (!cachedPromise) {
      cachedPromise = importer()
        .then((mod) => ({ default: pick(mod) }))
        .catch((err) => {
          cachedPromise = null;
          throw err;
        });
    }
    return cachedPromise;
  };
}

export const loadQrOrderPage = createMemoizedLoader(
  () => import('@/features/qr-order'),
  (m) => m.QrOrderPage,
);
export const loadLoginPage = createMemoizedLoader(
  () => import('@/features/profile'),
  (m) => m.LoginPage,
);
export const loadProfilePage = createMemoizedLoader(
  () => import('@/features/profile'),
  (m) => m.ProfilePage,
);
export const loadDashboardPage = createMemoizedLoader(
  () => import('@/features/dashboard'),
  (m) => m.DashboardPage,
);
export const loadPosUnifiedPage = createMemoizedLoader(
  () => import('@/features/pos-counter'),
  (m) => m.PosUnifiedPage,
);
export const loadPosTouchPage = createMemoizedLoader(
  () => import('@/features/pos-counter'),
  (m) => m.PosTouchPage,
);
export const loadInvoicesPage = createMemoizedLoader(
  () => import('@/features/invoices'),
  (m) => m.InvoicesPage,
);
export const loadInventoryPage = createMemoizedLoader(
  () => import('@/features/inventory'),
  (m) => m.InventoryPage,
);
export const loadCashflowPage = createMemoizedLoader(
  () => import('@/features/cashflow'),
  (m) => m.CashflowPage,
);
export const loadPaymentQrPage = createMemoizedLoader(
  () => import('@/features/payment-qr'),
  (m) => m.PaymentQrPage,
);
export const loadDiscountsPage = createMemoizedLoader(
  () => import('@/features/discounts'),
  (m) => m.DiscountsPage,
);
export const loadEmployeesPage = createMemoizedLoader(
  () => import('@/features/employees'),
  (m) => m.EmployeesPage,
);
export const loadSchedulesMatrixPage = createMemoizedLoader(
  () => import('@/features/schedules'),
  (m) => m.SchedulesMatrixPage,
);
export const loadPayrollPage = createMemoizedLoader(
  () => import('@/features/payroll'),
  (m) => m.PayrollPage,
);
export const loadMasterDataPage = createMemoizedLoader(
  () => import('@/features/master-data'),
  (m) => m.MasterDataPage,
);
export const loadMenuManagementPage = createMemoizedLoader(
  () => import('@/features/menu'),
  (m) => m.MenuManagementPage,
);
export const loadRbacUsersPage = createMemoizedLoader(
  () => import('@/features/rbac'),
  (m) => m.RbacUsersPage,
);
export const loadStoreSettingsPage = createMemoizedLoader(
  () => import('@/features/store-settings'),
  (m) => m.StoreSettingsPage,
);

const STAFF_ROUTE_CHUNK_LOADERS: Record<string, RouteChunkLoader> = {
  '/dashboard': loadDashboardPage,
  '/pos': loadPosUnifiedPage,
  '/menu': loadMenuManagementPage,
  '/discounts': loadDiscountsPage,
  '/invoices': loadInvoicesPage,
  '/cashflow': loadCashflowPage,
  '/payment-qr': loadPaymentQrPage,
  '/inventory': loadInventoryPage,
  '/employees': loadEmployeesPage,
  '/schedules': loadSchedulesMatrixPage,
  '/payroll': loadPayrollPage,
  '/master-data': loadMasterDataPage,
  '/rbac': loadRbacUsersPage,
  '/settings': loadStoreSettingsPage,
  '/profile': loadProfilePage,
};

function getTodayVietnamDateIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function getCurrentVietnamMonthRange(): { fromDate: string; toDate: string } {
  const [yStr = '2026', mStr = '11'] = getTodayVietnamDateIso().split('-');
  const year = Number(yStr);
  const month = Number(mStr);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    fromDate: `${yStr}-${mStr}-01`,
    toDate: `${yStr}-${mStr}-${String(lastDay).padStart(2, '0')}`,
  };
}

function getCurrentWeekMondayIso(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

export async function prefetchRouteData(path: string): Promise<void> {
  if (!useAuthStore.getState().accessToken) {
    return;
  }

  switch (path) {
    case '/dashboard':
      await queryClient.prefetchQuery({
        queryKey: ['dashboard', 'overview', 'today', '', ''],
        queryFn: async () =>
          DashboardOverviewResponseSchema.parse(
            await apiClient.get('/api/v1/dashboard/overview', {
              params: { preset: 'today' },
            }),
          ),
      });
      return;

    case '/pos':
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: ['pos', 'tables'],
          queryFn: async () =>
            PosTableGridResponseSchema.parse(await apiClient.get('/api/v1/pos/tables')),
        }),
        queryClient.prefetchQuery({
          queryKey: ['pos', 'products'],
          queryFn: async () =>
            z.array(ProductSchema).parse(await apiClient.get('/api/v1/menu/products')),
        }),
      ]);
      return;

    case '/menu':
      await queryClient.prefetchQuery({
        queryKey: ['menu-products'],
        queryFn: () => apiClient.get('/api/v1/menu/products'),
      });
      return;

    case '/discounts': {
      const filters = {
        page: 1,
        limit: 50,
        status: 'all' as const,
        scope: undefined,
        keyword: undefined,
      };
      await queryClient.prefetchQuery({
        queryKey: ['discounts', 'list', filters],
        queryFn: () => apiClient.get('/api/v1/discounts?page=1&limit=50'),
      });
      return;
    }

    case '/invoices': {
      const today = getTodayVietnamDateIso();
      const filter = {
        page: 1,
        limit: 20,
        fromDate: today,
        toDate: today,
        status: 'PAID' as const,
        paymentMethod: undefined,
        orderType: undefined,
        searchField: 'order_code' as const,
        keyword: undefined,
      };
      await queryClient.prefetchQuery({
        queryKey: ['invoices', filter],
        queryFn: () =>
          apiClient.get('/api/v1/invoices', {
            params: {
              page: filter.page,
              limit: filter.limit,
              fromDate: filter.fromDate,
              toDate: filter.toDate,
              status: filter.status,
            },
          }),
      });
      return;
    }

    case '/cashflow': {
      const settlementsFilter = {
        page: 1,
        limit: 20,
        fromDate: undefined,
        toDate: undefined,
        closerKeyword: undefined,
      };
      await Promise.all([
        queryClient.prefetchQuery({
          queryKey: ['cashflow', 'preview'],
          queryFn: () => apiClient.get('/api/v1/cashflow/preview'),
        }),
        queryClient.prefetchQuery({
          queryKey: ['cashflow', 'settlements', settlementsFilter],
          queryFn: () =>
            apiClient.get('/api/v1/cashflow/settlements', {
              params: { page: 1, limit: 20 },
            }),
        }),
      ]);
      return;
    }

    case '/payment-qr':
      await queryClient.prefetchQuery({
        queryKey: ['payment-qr', 'list'],
        queryFn: async () =>
          z.array(PaymentAccountSchema).parse(await apiClient.get('/api/v1/payment-qr')),
      });
      return;

    case '/inventory': {
      const filter = {
        page: 1,
        limit: 20,
        fromDate: undefined,
        toDate: undefined,
        keyword: undefined,
      };
      await queryClient.prefetchQuery({
        queryKey: ['inventory-imports', filter],
        queryFn: () =>
          apiClient.get('/api/v1/inventory-imports', {
            params: { page: 1, limit: 20 },
          }),
      });
      return;
    }

    case '/employees': {
      const filter = {
        page: 1,
        limit: 20,
        keyword: undefined,
        positionId: undefined,
        specialtyId: undefined,
        includeDeleted: false,
        inactiveOnly: false,
      };
      await queryClient.prefetchQuery({
        queryKey: ['employees', filter],
        queryFn: () =>
          apiClient.get('/api/v1/employees', {
            params: { page: 1, limit: 20 },
          }),
      });
      return;
    }

    case '/schedules': {
      const weekStartDate = getCurrentWeekMondayIso();
      await queryClient.prefetchQuery({
        queryKey: ['schedules', weekStartDate],
        staleTime: HR_SOCKET_SYNCED_STALE_TIME_MS,
        queryFn: () =>
          apiClient.get('/api/v1/schedules', {
            params: { weekStartDate },
          }),
      });
      return;
    }

    case '/payroll': {
      const range = getCurrentVietnamMonthRange();
      const query = {
        fromDate: range.fromDate,
        toDate: range.toDate,
        keyword: undefined,
      };
      await queryClient.prefetchQuery({
        queryKey: ['payroll', query],
        staleTime: HR_SOCKET_SYNCED_STALE_TIME_MS,
        queryFn: () =>
          apiClient.get('/api/v1/payroll', {
            params: { fromDate: query.fromDate, toDate: query.toDate },
          }),
      });
      return;
    }

    case '/master-data': {
      const filter = {
        category: 'POSITION' as const,
        page: 1,
        limit: 20,
        keyword: undefined,
        activeOnly: false,
      };
      await queryClient.prefetchQuery({
        queryKey: ['mdm', 'list', filter],
        queryFn: () =>
          apiClient.get('/api/v1/mdm', {
            params: {
              category: 'POSITION',
              page: 1,
              limit: 20,
              activeOnly: false,
            },
          }),
      });
      return;
    }

    case '/rbac': {
      const params = { page: 1, limit: 50, keyword: undefined };
      await queryClient.prefetchQuery({
        queryKey: ['users', params],
        queryFn: () =>
          apiClient.get('/api/v1/users', {
            params: { page: 1, limit: 50 },
          }),
      });
      return;
    }

    case '/settings':
      await queryClient.prefetchQuery({
        queryKey: ['admin-store-settings'] as const,
        queryFn: async () =>
          PublicStoreSettingsResponseSchema.parse(await apiClient.get('/api/v1/settings')),
      });
      return;

    case '/profile':
      await queryClient.prefetchQuery({
        queryKey: ['profile', 'me'],
        queryFn: () => apiClient.get('/api/v1/profile'),
      });
      return;

    default:
      return;
  }
}

const loadedChunkPaths = new Set<string>();

export function prefetchRouteChunk(path: string): Promise<void> {
  if (!useAuthStore.getState().accessToken) {
    return Promise.resolve();
  }
  const loader = STAFF_ROUTE_CHUNK_LOADERS[path];
  if (!loader) {
    return Promise.resolve();
  }
  loadedChunkPaths.add(path);
  return loader()
    .then(() => undefined)
    .catch(() => {
      loadedChunkPaths.delete(path);
    });
}

const pendingTimers = new Map<string, number>();

export function cancelRoutePrefetch(path: string): void {
  const existing = pendingTimers.get(path);
  if (existing !== undefined) {
    window.clearTimeout(existing);
    pendingTimers.delete(path);
  }
}

export function scheduleRoutePrefetch(
  path: string,
  delayMs: number = ROUTE_PREFETCH_DEBOUNCE_MS,
): void {
  if (!useAuthStore.getState().accessToken) {
    return;
  }

  if (typeof window !== 'undefined' && window.location.pathname === path) {
    return;
  }

  cancelRoutePrefetch(path);

  const timer = window.setTimeout(() => {
    pendingTimers.delete(path);
    void prefetchRouteChunk(path);
    void prefetchRouteData(path).catch(() => undefined);
  }, delayMs);

  pendingTimers.set(path, timer);
}

export function startIdleRouteChunkWarmup(
  paths: readonly string[],
  options?: { initialDelayMs?: number; stepDelayMs?: number },
): () => void {
  if (typeof window === 'undefined' || !useAuthStore.getState().accessToken) {
    return () => undefined;
  }

  const initialDelayMs = options?.initialDelayMs ?? 1200;
  const stepDelayMs = options?.stepDelayMs ?? 250;
  const queue = paths.filter((path) => Boolean(STAFF_ROUTE_CHUNK_LOADERS[path]));
  if (queue.length === 0) {
    return () => undefined;
  }

  let cancelled = false;
  let timerId: number | null = null;
  let idleId: number | null = null;

  const scheduleIdleOrTimeout = (cb: () => void, delayMs: number) => {
    if (cancelled) return;
    timerId = window.setTimeout(() => {
      timerId = null;
      if (cancelled) return;
      const winWithIdle = window as Window & {
        requestIdleCallback?: (fn: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
      };
      if (typeof winWithIdle.requestIdleCallback === 'function') {
        idleId = winWithIdle.requestIdleCallback(
          () => {
            idleId = null;
            if (!cancelled) cb();
          },
          { timeout: 1000 },
        );
      } else {
        cb();
      }
    }, delayMs);
  };

  let index = 0;
  const pumpNext = () => {
    if (cancelled) return;
    while (index < queue.length && loadedChunkPaths.has(queue[index]!)) {
      index += 1;
    }
    if (index >= queue.length) {
      return;
    }
    const nextPath = queue[index++]!;
    void prefetchRouteChunk(nextPath).then(() => {
      if (!cancelled && index < queue.length) {
        scheduleIdleOrTimeout(pumpNext, stepDelayMs);
      }
    });
  };

  scheduleIdleOrTimeout(pumpNext, initialDelayMs);

  return () => {
    cancelled = true;
    if (timerId !== null) {
      window.clearTimeout(timerId);
      timerId = null;
    }
    if (idleId !== null) {
      const winWithIdle = window as Window & {
        cancelIdleCallback?: (id: number) => void;
      };
      winWithIdle.cancelIdleCallback?.(idleId);
      idleId = null;
    }
  };
}

export function clearAllRoutePrefetchTimers(): void {
  pendingTimers.forEach((timer) => {
    window.clearTimeout(timer);
  });
  pendingTimers.clear();
}
