import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateInventoryImportBatchResponse,
  type CreateInventoryImportBatchInput,
  type InventoryImportListResponse,
  type InventoryImportRecord,
  type InventoryImportFilterQuery,
  type MdmCategory,
  type MdmItem,
} from '@fnb/shared';

export type {
  InventoryImportListResponse,
  InventoryImportRecord,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export function getBusinessDateIso(date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function useInventoryImportsQuery(filter: InventoryImportFilterQuery) {
  return useQuery({
    queryKey: ['inventory-imports', filter],
    queryFn: () =>
      apiClient.get<InventoryImportListResponse>('/api/v1/inventory-imports', {
        params: {
          page: filter.page,
          limit: filter.limit,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          keyword: filter.keyword || undefined,
          paymentSource: filter.paymentSource,
          ingredientMdmId: filter.ingredientMdmId,
        },
      }),
  });
}

export function useMdmLookupQuery(category: MdmCategory, keyword?: string) {
  return useQuery({
    queryKey: ['mdm', 'lookup', category, keyword ?? ''],
    queryFn: () =>
      apiClient.get<MdmItem[]>('/api/v1/mdm/lookup', {
        params: {
          category,
          keyword: keyword?.trim() || undefined,
          page: 1,
          limit: 50,
        },
      }),
  });
}

export function useCreateInventoryImportBatchMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateInventoryImportBatchInput) =>
      apiClient.post<CreateInventoryImportBatchResponse>(
        '/api/v1/inventory-imports',
        body,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-imports'] });
      void queryClient.invalidateQueries({ queryKey: ['mdm', 'lookup'] });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

export function useDeleteInventoryImportMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<InventoryImportRecord>(`/api/v1/inventory-imports/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-imports'] });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}
