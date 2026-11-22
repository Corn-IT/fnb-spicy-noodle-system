import {
  type CreateDiscountInput,
  type DiscountFilterQuery,
  type DiscountListResponse,
  type DiscountRecord,
  type MdmItem,
  type MdmListResponse,
  type Product,
  type UpdateDiscountInput,
} from '@fnb/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

export const discountsQueryKeys = {
  all: ['discounts'] as const,
  list: (filters: DiscountFilterQuery) => ['discounts', 'list', filters] as const,
  categories: ['discounts', 'categories'] as const,
  products: ['discounts', 'products'] as const,
};

function buildDiscountsQueryString(filters: DiscountFilterQuery): string {
  const params = new URLSearchParams();
  params.set('page', String(filters.page ?? 1));
  params.set('limit', String(filters.limit ?? 20));
  if (filters.status && filters.status !== 'all') {
    params.set('status', filters.status);
  }
  if (filters.scope) {
    params.set('scope', filters.scope);
  }
  if (filters.keyword?.trim()) {
    params.set('keyword', filters.keyword.trim());
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export async function fetchDiscounts(filters: DiscountFilterQuery): Promise<DiscountListResponse> {
  return apiClient.get<DiscountListResponse>(
    `/api/v1/discounts${buildDiscountsQueryString(filters)}`,
  );
}

export async function fetchDiscountMenuCategories(): Promise<MdmItem[]> {
  const res = await apiClient.get<MdmItem[] | MdmListResponse>(
    '/api/v1/mdm/lookup?category=MENU_CATEGORY&limit=100',
  );
  return Array.isArray(res) ? res : res.items ?? [];
}

export async function fetchDiscountMenuProducts(): Promise<Product[]> {
  return apiClient.get<Product[]>('/api/v1/menu/products');
}

export async function createDiscount(payload: CreateDiscountInput): Promise<DiscountRecord> {
  return apiClient.post<DiscountRecord>('/api/v1/discounts', payload);
}

export async function updateDiscount(input: {
  id: number;
  payload: UpdateDiscountInput;
}): Promise<DiscountRecord> {
  return apiClient.put<DiscountRecord>(`/api/v1/discounts/${input.id}`, input.payload);
}

export async function toggleDiscountStatus(input: {
  id: number;
  isActive: boolean;
}): Promise<DiscountRecord> {
  return apiClient.patch<DiscountRecord>(`/api/v1/discounts/${input.id}/status`, {
    isActive: input.isActive,
  });
}

export async function deleteOrArchiveDiscount(
  id: number,
): Promise<{ id: number; archived: boolean; deleted: boolean }> {
  return apiClient.delete<{ id: number; archived: boolean; deleted: boolean }>(
    `/api/v1/discounts/${id}`,
  );
}

export function useDiscountsQuery(filters: DiscountFilterQuery) {
  return useQuery({
    queryKey: discountsQueryKeys.list(filters),
    queryFn: () => fetchDiscounts(filters),
    placeholderData: keepPreviousData,
  });
}

export function useDiscountCategoriesQuery(enabled = true) {
  return useQuery({
    queryKey: discountsQueryKeys.categories,
    queryFn: fetchDiscountMenuCategories,
    enabled,
    staleTime: 60_000,
  });
}

export function useDiscountProductsQuery(enabled = true) {
  return useQuery({
    queryKey: discountsQueryKeys.products,
    queryFn: fetchDiscountMenuProducts,
    enabled,
    staleTime: 60_000,
  });
}

export function useCreateDiscountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createDiscount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKeys.all });
    },
  });
}

export function useUpdateDiscountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateDiscount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKeys.all });
    },
  });
}

export function useToggleDiscountStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: toggleDiscountStatus,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKeys.all });
    },
  });
}

export function useDeleteDiscountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteOrArchiveDiscount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: discountsQueryKeys.all });
    },
  });
}
