import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CashflowSettlementFilterQuery,
  type CompensateSettlementRequest,
  type CreateSettlementRequest,
  type SettlementResponse,
  type UpdateDefaultBudgetInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export interface CashflowPreviewResponse {
  settlementDate: string;
  shiftName: string;
  blindMode?: boolean;
  openingBudget: number;
  totalCashSales: number | null;
  totalTransferSales: number | null;
  totalCashImports: number | null;
  expectedCashInDrawer: number | null;
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

export async function fetchCashflowSettlements(filter: CashflowSettlementFilterQuery) {
  return apiClient.get<CashflowSettlementListResponse>('/api/v1/cashflow/settlements', {
    params: {
      page: filter.page,
      limit: filter.limit,
      fromDate: filter.fromDate,
      toDate: filter.toDate,
      closerKeyword: filter.closerKeyword,
    },
  });
}

export function useCashflowSettlementsQuery(filter: CashflowSettlementFilterQuery) {
  return useQuery({
    queryKey: ['cashflow', 'settlements', filter],
    queryFn: () => fetchCashflowSettlements(filter),
    placeholderData: keepPreviousData,
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

export function useCompensateSettlementMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ settlementId, body }: { settlementId: number; body: CompensateSettlementRequest }) =>
      apiClient.post<SettlementResponse>(`/api/v1/cashflow/settlements/${settlementId}/compensate`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}
