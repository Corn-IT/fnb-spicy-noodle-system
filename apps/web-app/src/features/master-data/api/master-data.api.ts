import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MdmItem,
  type MdmListResponse,
  type MdmLookupQuery,
  type UpdateMdmInput,
  type UpsertMdmInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import { broadcastMenuSync } from '@/lib/menu-sync';

export type { MdmListResponse };

function invalidateMasterDataCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['mdm'] });
  void queryClient.invalidateQueries({ queryKey: ['menu'] });
  void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
  void queryClient.invalidateQueries({ queryKey: ['pos'] });
  void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
  broadcastMenuSync();
}

export function useMdmListQuery(filter: MdmLookupQuery) {
  return useQuery({
    queryKey: ['mdm', 'list', filter],
    queryFn: () =>
      apiClient.get<MdmListResponse>('/api/v1/mdm', {
        params: {
          category: filter.category,
          page: filter.page,
          limit: filter.limit,
          keyword: filter.keyword || undefined,
          activeOnly: filter.activeOnly,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateMdmMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpsertMdmInput) =>
      apiClient.post<MdmItem>('/api/v1/mdm', body),
    onSuccess: () => {
      invalidateMasterDataCaches(queryClient);
    },
  });
}

export function useUpdateMdmMutation(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateMdmInput) =>
      apiClient.put<MdmItem>(`/api/v1/mdm/${id}`, body),
    onSuccess: () => {
      invalidateMasterDataCaches(queryClient);
    },
  });
}

export function usePatchMdmItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMdmInput }) =>
      apiClient.put<MdmItem>(`/api/v1/mdm/${id}`, body),
    onSuccess: () => {
      invalidateMasterDataCaches(queryClient);
    },
  });
}

export function useDeleteMdmMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<MdmItem>(`/api/v1/mdm/${id}`),
    onSuccess: () => {
      invalidateMasterDataCaches(queryClient);
    },
  });
}
