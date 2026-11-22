import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { act, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseTable } from '@/components/base-table/base-table';
import {
  DelayedPageFallback,
  DelayedRender,
  TopProgressBar,
  clearPendingNavigation,
  getSuspensePendingCount,
  startPendingNavigation,
} from '@/components/loading';
import { apiClient } from '@/lib/api-client';
import * as routePrefetchModule from '@/lib/route-prefetch';
import {
  ROUTE_PREFETCH_DEBOUNCE_MS,
  cancelRoutePrefetch,
  clearAllRoutePrefetchTimers,
  prefetchRouteData,
  scheduleRoutePrefetch,
  startIdleRouteChunkWarmup,
} from '@/lib/route-prefetch';
import { queryClient as appQueryClient } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

interface RowItem {
  id: number;
  name: string;
}

const columns: ColumnDef<RowItem, unknown>[] = [
  { id: 'id', header: 'ID', accessorKey: 'id' },
  { id: 'name', header: 'Tên', accessorKey: 'name' },
];

describe('Smooth Navigation, 0ms Route Transition Feedback & keepPreviousData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    clearAllRoutePrefetchTimers();
    clearPendingNavigation();
    appQueryClient.clear();
    useAuthStore.getState().clearAuth();
    useUiPreferencesStore.setState({
      theme: 'light',
      sidebarWidth: 260,
      sidebarCollapsed: false,
      columnWidths: {},
    });
  });

  afterEach(() => {
    clearPendingNavigation();
    clearAllRoutePrefetchTimers();
    vi.useRealTimers();
  });

  describe('DelayedPageFallback (0ms cold load) & DelayedRender (150ms anti-flash)', () => {
    it('renders cold route PageSkeleton at 0ms by default so F5 / direct QR never hits a blank screen', () => {
      const { unmount } = render(
        <DelayedPageFallback variant="table" label="Đang tải bảng thử nghiệm..." />,
      );

      expect(screen.getByTestId('page-skeleton-table')).toBeInTheDocument();
      expect(getSuspensePendingCount()).toBe(1);

      unmount();
      expect(getSuspensePendingCount()).toBe(0);
    });

    it('suppresses DelayedRender fallback before 150ms when delayMs=150', () => {
      vi.useFakeTimers();

      const { unmount } = render(
        <DelayedRender delayMs={150} trackSuspense>
          <div data-testid="late-spinner">Loading...</div>
        </DelayedRender>,
      );

      act(() => {
        vi.advanceTimersByTime(140);
      });
      expect(screen.queryByTestId('late-spinner')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(screen.getByTestId('late-spinner')).toBeInTheDocument();

      unmount();
      expect(getSuspensePendingCount()).toBe(0);
    });
  });

  describe('TopProgressBar', () => {
    it('shows immediately at 0ms for pending route transitions, while keeping 150ms anti-flash for in-page suspense', () => {
      vi.useFakeTimers();
      const localClient = new QueryClient();

      const { rerender } = render(
        <QueryClientProvider client={localClient}>
          <TopProgressBar />
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('top-progress-bar')).not.toBeInTheDocument();

      // Clicking a sidebar route shows progress bar at 0ms immediately
      act(() => {
        startPendingNavigation('/invoices');
      });
      expect(screen.getByTestId('top-progress-bar')).toBeInTheDocument();

      act(() => {
        clearPendingNavigation();
      });
      expect(screen.queryByTestId('top-progress-bar')).not.toBeInTheDocument();

      // Non-navigation background suspense respects 150ms delay
      rerender(
        <QueryClientProvider client={localClient}>
          <TopProgressBar />
          <DelayedRender delayMs={150} trackSuspense>
            <div />
          </DelayedRender>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('top-progress-bar')).not.toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(150);
      });
      expect(screen.getByTestId('top-progress-bar')).toBeInTheDocument();
    });
  });

  describe('route-prefetch debounced chunk/data & idle warmup', () => {
    it('does nothing when unauthenticated so public QR guests never pull staff routes or data', () => {
      vi.useFakeTimers();
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue([]);
      const chunkSpy = vi.spyOn(routePrefetchModule, 'prefetchRouteChunk');

      scheduleRoutePrefetch('/invoices');
      act(() => {
        vi.advanceTimersByTime(ROUTE_PREFETCH_DEBOUNCE_MS + 50);
      });

      expect(chunkSpy).not.toHaveBeenCalled();
      expect(getSpy).not.toHaveBeenCalled();
    });

    it('cancels both API and chunk prefetch when cursor sweeps away before 120ms, and fires after 120ms dwell', async () => {
      vi.useFakeTimers();
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue({
        page: 1,
        limit: 50,
        total: 0,
        items: [],
      });

      useAuthStore.getState().setAuth({
        accessToken: 'valid-staff-token',
        user: {
          id: 1,
          employeeId: 1,
          username: 'cashier01',
          fullName: 'Thu Ngan',
          isSuperAdmin: true,
          permissions: {} as never,
        },
      });

      // Quick mouse sweep across /rbac (< 120ms) triggers neither chunk storm nor API call
      scheduleRoutePrefetch('/rbac');
      act(() => {
        vi.advanceTimersByTime(ROUTE_PREFETCH_DEBOUNCE_MS - 30);
      });
      cancelRoutePrefetch('/rbac');
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(getSpy).not.toHaveBeenCalled();

      // Genuine dwell >= 120ms on /rbac
      scheduleRoutePrefetch('/rbac');
      await act(async () => {
        vi.advanceTimersByTime(ROUTE_PREFETCH_DEBOUNCE_MS);
        await Promise.resolve();
      });

      expect(getSpy).toHaveBeenCalledWith('/api/v1/users', {
        params: { page: 1, limit: 50 },
      });

      // Second prefetch hits warm cache inside default staleTime (30s) -> zero extra network call
      await prefetchRouteData('/rbac');
      expect(getSpy).toHaveBeenCalledTimes(1);
    });

    it('cancels idle sequential warmup cleanly on cleanup', () => {
      vi.useFakeTimers();
      const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue([]);

      useAuthStore.getState().setAuth({
        accessToken: 'valid-staff-token',
        user: {
          id: 1,
          employeeId: 1,
          username: 'cashier01',
          fullName: 'Thu Ngan',
          isSuperAdmin: true,
          permissions: {} as never,
        },
      });

      const stop = startIdleRouteChunkWarmup(['/invoices', '/rbac'], {
        initialDelayMs: 1200,
        stepDelayMs: 250,
      });

      act(() => {
        vi.advanceTimersByTime(500);
      });
      stop();

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      // Idle warmup only loads chunks, never fires backend API traffic
      expect(getSpy).not.toHaveBeenCalled();
    });
  });

  describe('BaseTable keepPreviousData transitions', () => {
    it('keeps existing rows visible with gentle dim and slim bar instead of blank skeleton flash', () => {
      const { container } = render(
        <BaseTable<RowItem>
          tableId="smooth-nav-test"
          data={[{ id: 1, name: 'Mì cay hải sản' }]}
          columns={columns}
          isLoading={false}
          isFetching
          isPlaceholderData
        />,
      );

      expect(screen.getByText('Mì cay hải sản')).toBeInTheDocument();
      expect(screen.getByTestId('base-table-fetching-bar')).toBeInTheDocument();
      const tbody = container.querySelector('tbody');
      expect(tbody).toHaveClass('opacity-65');
    });

    it('preserves previous page rows with real keepPreviousData while next page is pending', async () => {
      const localClient = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            staleTime: 0,
          },
        },
      });

      let resolvePage2!: (value: RowItem[]) => void;
      const fetcher = vi
        .fn<(page: number) => Promise<RowItem[]>>()
        .mockResolvedValueOnce([{ id: 1, name: 'Hóa đơn trang 1' }])
        .mockImplementationOnce(
          () =>
            new Promise<RowItem[]>((resolve) => {
              resolvePage2 = resolve;
            }),
        );

      function PaginatedHarness() {
        const [page, setPage] = React.useState(1);
        const query = useQuery({
          queryKey: ['test-paginated', page],
          queryFn: () => fetcher(page),
          placeholderData: keepPreviousData,
        });

        return (
          <div>
            <button type="button" onClick={() => setPage(2)}>
              Trang 2
            </button>
            <BaseTable<RowItem>
              tableId="paginated-harness"
              data={query.data ?? []}
              columns={columns}
              isLoading={query.isLoading}
              isFetching={query.isFetching}
              isPlaceholderData={query.isPlaceholderData}
            />
          </div>
        );
      }

      render(
        <QueryClientProvider client={localClient}>
          <PaginatedHarness />
        </QueryClientProvider>,
      );

      expect(await screen.findByText('Hóa đơn trang 1')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Trang 2' }));

      // During page 2 fetch, page 1 row remains visible (no blank table / full skeleton reset)
      expect(await screen.findByTestId('base-table-fetching-bar')).toBeInTheDocument();
      expect(screen.getByText('Hóa đơn trang 1')).toBeInTheDocument();

      await act(async () => {
        resolvePage2([{ id: 2, name: 'Hóa đơn trang 2' }]);
        await Promise.resolve();
      });

      expect(await screen.findByText('Hóa đơn trang 2')).toBeInTheDocument();
      expect(screen.queryByTestId('base-table-fetching-bar')).not.toBeInTheDocument();
    });
  });
});
