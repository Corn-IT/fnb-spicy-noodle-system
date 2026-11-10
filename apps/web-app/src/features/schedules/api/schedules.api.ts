import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BulkSaveScheduleRequest,
  type CopyPreviousWeekRequest,
  type ScheduleCell,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export interface ScheduleEmployeeInfo {
  id: number;
  fullName: string;
  shortName: string;
  isDeleted: boolean;
  specialty: { id: number; name: string } | null;
}

export interface ScheduleWeekResponse {
  weekStartDate: string;
  cells: ScheduleCell[];
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
  });
}

export function useBulkSaveScheduleMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: BulkSaveScheduleRequest) =>
      apiClient.put<{ saved: number }>('/api/v1/schedules/bulk-save', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
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
    },
  });
}
