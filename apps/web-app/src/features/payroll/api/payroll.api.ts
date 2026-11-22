import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type PayrollConfig,
  type PayrollQuery,
  type PayrollRow,
  type PayrollSummaryResponse,
  type UpdateEmployeePayrollInput,
  type UpdatePayrollConfigInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import { HR_SOCKET_SYNCED_STALE_TIME_MS } from '@/lib/route-prefetch';

export function usePayrollSummaryQuery(query: PayrollQuery) {
  return useQuery({
    queryKey: ['payroll', query],
    queryFn: () =>
      apiClient.get<PayrollSummaryResponse>('/api/v1/payroll', {
        params: {
          fromDate: query.fromDate,
          toDate: query.toDate,
          keyword: query.keyword || undefined,
        },
      }),
    enabled: Boolean(query.fromDate && query.toDate && query.fromDate <= query.toDate),
    staleTime: HR_SOCKET_SYNCED_STALE_TIME_MS,
    placeholderData: keepPreviousData,
  });
}

export function useUpdatePayrollConfigMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdatePayrollConfigInput) =>
      apiClient.put<PayrollConfig>('/api/v1/payroll/config', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'PAYROLL'] });
    },
  });
}

export function useUpdateEmployeePayrollMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      employeeId,
      body,
    }: {
      employeeId: number;
      body: UpdateEmployeePayrollInput;
    }) => apiClient.put<PayrollRow | null>(`/api/v1/payroll/employees/${employeeId}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'PAYROLL'] });
    },
  });
}
