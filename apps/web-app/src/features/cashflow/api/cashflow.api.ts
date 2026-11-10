import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CashflowSettlementFilterQuery,
  type CreateSettlementRequest,
  type SettlementResponse,
  type UpdateDefaultBudgetInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export interface CashflowPreviewResponse {
  settlementDate: string;
  shiftName: string;
  openingBudget: number;
  totalCashSales: number;
  totalTransferSales: number;
  totalCashImports: number;
  expectedCashInDrawer: number;
}

export interface CashflowSettlementListResponse {
  page: number;
  limit: number;
  total: number;
  items: SettlementResponse[];
}

export function useCashflowPreviewQuery() {
  return useQuery({
    queryKey: ['cashflow', 'preview'],
    queryFn: () => apiClient.get<CashflowPreviewResponse>('/api/v1/cashflow/preview'),
  });
}

export function useCashflowSettlementsQuery(filter: CashflowSettlementFilterQuery) {
  return useQuery({
    queryKey: ['cashflow', 'settlements', filter],
    queryFn: () =>
      apiClient.get<CashflowSettlementListResponse>('/api/v1/cashflow/settlements', {
        params: {
          page: filter.page,
          limit: filter.limit,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
        },
      }),
  });
}

export function useSettleShiftMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateSettlementRequest) =>
      apiClient.post<SettlementResponse>('/api/v1/cashflow/settle', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

export function useUpdateDefaultBudgetMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateDefaultBudgetInput) =>
      apiClient.put<{ openingBudget: number }>('/api/v1/cashflow/default-budget', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}
