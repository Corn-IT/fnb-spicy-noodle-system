import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type CreateProductInput,
  type ImportMenuExcelRequest,
  type ImportMenuExcelResponse,
  type MdmItem,
  type Product,
  type UpdateMdmInput,
  type UpdateProductInput,
  type UpsertMdmInput,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import {
  broadcastMenuSync,
  useKitchenStationsLookup,
  useMenuCategoriesLookup,
} from '@/lib/menu-sync';

function invalidateAllMenuCaches(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['mdm'] });
  void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
  void queryClient.invalidateQueries({ queryKey: ['pos'] });
  void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
  broadcastMenuSync();
}

export function useMenuProductsQuery() {
  return useQuery({
    queryKey: ['menu-products'],
    queryFn: () => apiClient.get<Product[]>('/api/v1/menu/products'),
  });
}

export function useMenuCategoriesQuery() {
  return useMenuCategoriesLookup();
}

export function useMenuStationsQuery() {
  return useKitchenStationsLookup();
}

export function useCreateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: CreateProductInput) =>
      apiClient.post<Product>('/api/v1/menu/products', body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useUpdateProductMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateProductInput }) =>
      apiClient.put<Product>(`/api/v1/menu/products/${id}`, body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
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
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useImportMenuExcelMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: ImportMenuExcelRequest) =>
      apiClient.post<ImportMenuExcelResponse>('/api/v1/menu/products/import-excel', body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useCreateMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpsertMdmInput) =>
      apiClient.post<MdmItem>('/api/v1/menu/categories', body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useUpdateMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMdmInput }) =>
      apiClient.put<MdmItem>(`/api/v1/menu/categories/${id}`, body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useDeleteMenuCategoryMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<MdmItem>(`/api/v1/menu/categories/${id}`),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useCreateMenuStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: UpsertMdmInput) =>
      apiClient.post<MdmItem>('/api/v1/menu/stations', body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useUpdateMenuStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateMdmInput }) =>
      apiClient.put<MdmItem>(`/api/v1/menu/stations/${id}`, body),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}

export function useDeleteMenuStationMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) =>
      apiClient.delete<MdmItem>(`/api/v1/menu/stations/${id}`),
    onSuccess: () => {
      invalidateAllMenuCaches(queryClient);
    },
  });
}
