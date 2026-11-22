import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreatePaymentAccountRequestSchema,
  PaymentAccountOrdersResponseSchema,
  PaymentAccountSchema,
  ReorderPaymentAccountsRequestSchema,
  UpdatePaymentAccountRequestSchema,
  type CreatePaymentAccountRequest,
  type PaymentAccount,
  type PaymentAccountOrdersQuery,
  type PaymentAccountOrdersResponse,
  type ReorderPaymentAccountsRequest,
  type UpdatePaymentAccountRequest,
} from '@fnb/shared';
import { z } from 'zod';

import { apiClient } from '@/lib/api-client';

export const paymentQrQueryKeys = {
  all: ['payment-qr'] as const,
  list: () => ['payment-qr', 'list'] as const,
  orders: (accountId: number | null, params?: Partial<PaymentAccountOrdersQuery>) =>
    ['payment-qr', 'orders', accountId, params ?? {}] as const,
};

export function getTodayVietnamDateString(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

export async function fetchPaymentAccounts(): Promise<PaymentAccount[]> {
  const raw = await apiClient.get<unknown>('/api/v1/payment-qr');
  return z.array(PaymentAccountSchema).parse(raw);
}

export async function createPaymentAccount(
  input: CreatePaymentAccountRequest,
): Promise<PaymentAccount> {
  const parsed = CreatePaymentAccountRequestSchema.parse(input);
  const raw = await apiClient.post<unknown>('/api/v1/payment-qr', parsed);
  return PaymentAccountSchema.parse(raw);
}

export async function updatePaymentAccount(params: {
  id: number;
  input: UpdatePaymentAccountRequest;
}): Promise<PaymentAccount> {
  const parsed = UpdatePaymentAccountRequestSchema.parse(params.input);
  const raw = await apiClient.put<unknown>(`/api/v1/payment-qr/${params.id}`, parsed);
  return PaymentAccountSchema.parse(raw);
}

export async function reorderPaymentAccounts(
  input: ReorderPaymentAccountsRequest,
): Promise<PaymentAccount[]> {
  const parsed = ReorderPaymentAccountsRequestSchema.parse(input);
  const raw = await apiClient.put<unknown>('/api/v1/payment-qr/reorder', parsed);
  return z.array(PaymentAccountSchema).parse(raw);
}

export async function deletePaymentAccount(
  id: number,
): Promise<{ deleted: boolean; id: number }> {
  return apiClient.delete<{ deleted: boolean; id: number }>(`/api/v1/payment-qr/${id}`);
}

export async function fetchPaymentAccountOrders(params: {
  accountId: number;
  query: Partial<PaymentAccountOrdersQuery>;
}): Promise<PaymentAccountOrdersResponse> {
  const raw = await apiClient.get<unknown>(
    `/api/v1/payment-qr/${params.accountId}/orders`,
    { params: params.query },
  );
  return PaymentAccountOrdersResponseSchema.parse(raw);
}

export function usePaymentAccountsQuery() {
  return useQuery({
    queryKey: paymentQrQueryKeys.list(),
    queryFn: fetchPaymentAccounts,
  });
}

export function usePaymentAccountOrdersQuery(
  accountId: number | null,
  query: Partial<PaymentAccountOrdersQuery>,
) {
  return useQuery({
    queryKey: paymentQrQueryKeys.orders(accountId, query),
    queryFn: () =>
      fetchPaymentAccountOrders({
        accountId: accountId!,
        query,
      }),
    enabled: typeof accountId === 'number' && accountId > 0,
    placeholderData: keepPreviousData,
  });
}

export function useCreatePaymentAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPaymentAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQrQueryKeys.all });
    },
  });
}

export function useUpdatePaymentAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePaymentAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQrQueryKeys.all });
    },
  });
}

export function useReorderPaymentAccountsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: reorderPaymentAccounts,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQrQueryKeys.all });
    },
  });
}

export function useDeletePaymentAccountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePaymentAccount,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: paymentQrQueryKeys.all });
    },
  });
}
