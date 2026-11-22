import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BulkSaveScheduleRequest,
  type CopyPreviousWeekRequest,
  type ScheduleCell,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import { HR_SOCKET_SYNCED_STALE_TIME_MS } from '@/lib/route-prefetch';

export interface ScheduleEmployeeInfo {
  id: number;
  fullName: string;
  shortName: string;
  isDeleted: boolean;
  specialtyCode?: string | null;
  specialty?: { id: number; name: string } | null;
}

export type ScheduleWeekCell = ScheduleCell & {
  employees?: ScheduleEmployeeInfo[];
};

export interface ScheduleWeekResponse {
  weekStartDate: string;
  cells: ScheduleWeekCell[];
  availableEmployees: ScheduleEmployeeInfo[];
}

export function useScheduleWeekQuery(weekStartDate: string) {
  return useQuery({
    queryKey: ['schedules', weekStartDate],
    queryFn: () =>
      apiClient.get<ScheduleWeekResponse>('/api/v1/schedules', {
        params: { weekStartDate },
      }),
    enabled: !!weekStartDate,
    staleTime: HR_SOCKET_SYNCED_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function useBulkSaveScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkSaveScheduleRequest) =>
      apiClient.put<{ saved: number }>('/api/v1/schedules/bulk-save', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SCHEDULES'] });
    },
  });
}

export function useCopyPreviousWeekMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CopyPreviousWeekRequest) =>
      apiClient.post<{ copied: number }>('/api/v1/schedules/copy-previous-week', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SCHEDULES'] });
    },
  });
}
