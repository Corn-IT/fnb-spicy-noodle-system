import {
  DashboardDailyItemSalesResponseSchema,
  type DashboardDailyItemSalesResponse,
  type DashboardOverviewResponse,
  DashboardOverviewResponseSchema,
  type DashboardPreset,
  DashboardQuerySchema,
  type ProductStation,
  SocketEvents,
} from '@fnb/shared';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { usePosSocketContext } from '@/providers/socket-provider';

export interface DashboardFilterParams {
  preset: DashboardPreset;
  fromDate?: string;
  toDate?: string;
}

export interface DashboardItemSalesFilterParams extends DashboardFilterParams {
  station?: 'ALL' | ProductStation;
  categoryId?: number;
  search?: string;
}

const REALTIME_DASHBOARD_EVENTS = [
  SocketEvents.ORDER_QR_NEW,
  SocketEvents.ORDER_QR_ADDON,
  SocketEvents.ORDER_QR_AUTO_CANCELLED,
  SocketEvents.ORDER_STATUS_UPDATED,
  SocketEvents.TABLE_GRID_SYNC,
  SocketEvents.MENU_UPDATED,
  SocketEvents.SCHEDULE_UPDATED,
  SocketEvents.PAYROLL_UPDATED,
] as const;

export function getDashboardQueryKey(filter: DashboardFilterParams) {
  return [
    'dashboard',
    'overview',
    filter.preset,
    filter.fromDate ?? '',
    filter.toDate ?? '',
  ] as const;
}

export function getDashboardDailyItemSalesQueryKey(filter: DashboardItemSalesFilterParams) {
  return [
    'dashboard',
    'daily-item-sales',
    filter.preset,
    filter.fromDate ?? '',
    filter.toDate ?? '',
    filter.station ?? 'ALL',
    filter.categoryId ?? 'ALL',
    filter.search ?? '',
  ] as const;
}

export async function fetchDashboardOverview(
  filter: DashboardFilterParams,
): Promise<DashboardOverviewResponse> {
  const params: Record<string, string> = { preset: filter.preset };
  if (filter.preset === 'custom' && filter.fromDate && filter.toDate) {
    params.fromDate = filter.fromDate;
    params.toDate = filter.toDate;
  }
  const raw = await apiClient.get<unknown>('/api/v1/dashboard/overview', { params });
  return DashboardOverviewResponseSchema.parse(raw);
}

export async function fetchDashboardDailyItemSales(
  filter: DashboardItemSalesFilterParams,
): Promise<DashboardDailyItemSalesResponse> {
  const params: Record<string, string> = { preset: filter.preset };
  if (filter.preset === 'custom' && filter.fromDate && filter.toDate) {
    params.fromDate = filter.fromDate;
    params.toDate = filter.toDate;
  }
  if (filter.station && filter.station !== 'ALL') {
    params.station = filter.station;
  }
  if (filter.categoryId !== undefined) {
    params.categoryId = String(filter.categoryId);
  }
  const trimmedSearch = filter.search?.trim();
  if (trimmedSearch) {
    params.search = trimmedSearch;
  }
  const raw = await apiClient.get<unknown>('/api/v1/dashboard/daily-item-sales', { params });
  return DashboardDailyItemSalesResponseSchema.parse(raw);
}

export function useDashboardDailyItemSales(filter: DashboardItemSalesFilterParams) {
  const isCustomReady = getDashboardCustomRangeError(filter) === null;
  return useQuery({
    queryKey: getDashboardDailyItemSalesQueryKey(filter),
    queryFn: () => fetchDashboardDailyItemSales(filter),
    enabled: isCustomReady,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function getDashboardCustomRangeError(filter: DashboardFilterParams): string | null {
  if (filter.preset !== 'custom') return null;
  if (!filter.fromDate || !filter.toDate) {
    return 'Vui lòng chọn đầy đủ Từ ngày và Đến ngày.';
  }
  const parsed = DashboardQuerySchema.safeParse(filter);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? 'Khoảng ngày tuỳ chọn không hợp lệ.';
}

/**
 * Fetches dashboard overview with keepPreviousData smooth transitions and realtime socket invalidation.
 */
export function useDashboardOverview(filter: DashboardFilterParams) {
  const queryClient = useQueryClient();
  const { socket } = usePosSocketContext();

  const isCustomReady = getDashboardCustomRangeError(filter) === null;

  React.useEffect(() => {
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const handleRealtimeEvent = () => {
      if (timer) clearTimeout(timer);
      // Coalesce burst socket emissions (e.g., split-kitchen + table sync) into one refetch
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 300);
    };

    for (const eventName of REALTIME_DASHBOARD_EVENTS) {
      socket.on(eventName, handleRealtimeEvent);
    }

    return () => {
      if (timer) clearTimeout(timer);
      for (const eventName of REALTIME_DASHBOARD_EVENTS) {
        socket.off(eventName, handleRealtimeEvent);
      }
    };
  }, [socket, queryClient]);

  return useQuery({
    queryKey: getDashboardQueryKey(filter),
    queryFn: () => fetchDashboardOverview(filter),
    enabled: isCustomReady,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export function formatDashboardDateVi(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function formatDashboardTimeVi(isoDateTime: string | null | undefined): string {
  if (!isoDateTime) return '--:--';
  const parsed = new Date(isoDateTime);
  if (Number.isNaN(parsed.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
}

export function formatWaitDuration(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}p ${String(secs).padStart(2, '0')}s`;
}
