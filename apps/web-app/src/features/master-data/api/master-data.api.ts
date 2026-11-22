import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type MdmItem,
  type MdmListResponse,
  type MdmLookupQuery,
  type UpdateMdmInput,
  type UpsertMdmInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export type { MdmListResponse };

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
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });
}

export function useUpdateMdmMutation(id: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpdateMdmInput) =>
      apiClient.put<MdmItem>(`/api/v1/mdm/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });
}

export function usePatchMdmItemMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMdmInput }) =>
      apiClient.put<MdmItem>(`/api/v1/mdm/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });
}

export function useDeleteMdmMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<MdmItem>(`/api/v1/mdm/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
    },
  });
}
