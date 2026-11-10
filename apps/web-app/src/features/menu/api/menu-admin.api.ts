import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateProductInput,
  type MdmItem,
  type MdmListResponse,
  type Product,
  type UpdateMdmInput,
  type UpdateProductInput,
  type UpsertMdmInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export function useMenuProductsQuery() {
  return useQuery({
    queryKey: ['menu-products'],
    queryFn: () => apiClient.get<Product[]>('/api/v1/menu/products'),
  });
}

export function useMenuCategoriesQuery() {
  return useQuery({
    queryKey: ['mdm', 'lookup', 'MENU_CATEGORY'],
    queryFn: async () => {
      const res = await apiClient.get<MdmItem[] | MdmListResponse>('/api/v1/mdm/lookup', {
        params: {
          category: 'MENU_CATEGORY',
          page: 1,
          limit: 100,
          activeOnly: true,
        },
      });
      return Array.isArray(res) ? res : (res.items ?? []);
    },
  });
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProductInput) =>
      apiClient.post<Product>('/api/v1/menu/products', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos'] });
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateProductInput }) =>
      apiClient.put<Product>(`/api/v1/menu/products/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos'] });
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });
}

export function useDeleteProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<{ deleted: boolean; softDisabled: boolean; id?: number; product?: Product }>(
        `/api/v1/menu/products/${id}`,
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos'] });
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
    },
  });
}

export function useCreateMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpsertMdmInput) =>
      apiClient.post<MdmItem>('/api/v1/mdm', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
    },
  });
}

export function useUpdateMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMdmInput }) =>
      apiClient.put<MdmItem>(`/api/v1/mdm/${id}`, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
    },
  });
}

export function useDeleteMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<MdmItem>(`/api/v1/mdm/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
    },
  });
}
