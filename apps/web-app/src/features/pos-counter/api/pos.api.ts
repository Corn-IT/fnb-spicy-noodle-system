import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreatePosOrderSchema,
  OrderDetailResponseSchema,
  PatchOrderItemsResponseSchema,
  PatchOrderItemsSchema,
  PosOrderCreationResponseSchema,
  PosTableGridResponseSchema,
  ProductSchema,
  ProvisionalBillResponseSchema,
  ReprintKitchenRequestSchema,
  SplitKitchenResponseSchema,
  TableActionRequestSchema,
  TableActionResponseSchema,
  VoidInvoiceRequestSchema,
  type ApproveQrOrderInput,
  type CheckoutOrderRequest,
  type CreatePosOrderInput,
  type OrderDetailResponse,
  type PatchOrderItemsInput,
  type PatchOrderItemsResponse,
  type PosOrderCreationResponse,
  type PosTableGridResponse,
  type Product,
  type ProvisionalBillResponse,
  type ReprintKitchenRequest,
  type SplitKitchenResponse,
  type TableActionRequest,
  type TableActionResponse,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { z } from 'zod';

import { apiClient } from '@/lib/api-client';

export const posQueryKeys = {
  all: ['pos'] as const,
  tableGrid: () => ['pos', 'tables'] as const,
  products: () => ['pos', 'products'] as const,
  orderDetail: (orderId: number | null) => ['pos', 'order', orderId] as const,
};

export async function fetchPosTableGrid(): Promise<PosTableGridResponse> {
  const raw = await apiClient.get<unknown>('/api/v1/pos/tables');
  return PosTableGridResponseSchema.parse(raw);
}

export async function fetchPosProducts(): Promise<Product[]> {
  const raw = await apiClient.get<unknown>('/api/v1/menu/products');
  return z.array(ProductSchema).parse(raw);
}

export async function fetchPosOrderDetail(orderId: number): Promise<OrderDetailResponse> {
  const raw = await apiClient.get<unknown>(`/api/v1/pos/orders/${orderId}`);
  return OrderDetailResponseSchema.parse(raw);
}

export async function createPosOrder(
  input: CreatePosOrderInput,
): Promise<PosOrderCreationResponse> {
  const parsed = CreatePosOrderSchema.parse(input);
  const raw = await apiClient.post<unknown>('/api/v1/pos/orders', parsed);
  return PosOrderCreationResponseSchema.parse(raw);
}

export async function approvePosQrOrder(params: {
  orderId: number;
  input: ApproveQrOrderInput;
}): Promise<{ orderId: number; status: string }> {
  const parsed = ApproveQrOrderSchema.parse(params.input);
  return apiClient.post<{ orderId: number; status: string }>(
    `/api/v1/pos/orders/${params.orderId}/approve`,
    parsed,
  );
}

export async function patchPosOrderItems(params: {
  orderId: number;
  input: PatchOrderItemsInput;
}): Promise<PatchOrderItemsResponse> {
  const parsed = PatchOrderItemsSchema.parse(params.input);
  const raw = await apiClient.patch<unknown>(
    `/api/v1/pos/orders/${params.orderId}/items`,
    parsed,
  );
  return PatchOrderItemsResponseSchema.parse(raw);
}

export async function splitPosKitchen(orderId: number): Promise<SplitKitchenResponse> {
  const raw = await apiClient.post<unknown>(`/api/v1/pos/orders/${orderId}/split-kitchen`);
  return SplitKitchenResponseSchema.parse(raw);
}

export async function reprintPosKitchen(params: {
  orderId: number;
  input?: ReprintKitchenRequest;
}): Promise<SplitKitchenResponse> {
  const parsed = params.input ? ReprintKitchenRequestSchema.parse(params.input) : {};
  const raw = await apiClient.post<unknown>(
    `/api/v1/pos/orders/${params.orderId}/reprint-kitchen`,
    parsed,
  );
  return SplitKitchenResponseSchema.parse(raw);
}

export async function fetchPosProvisionalBill(
  orderId: number,
): Promise<ProvisionalBillResponse> {
  const raw = await apiClient.get<unknown>(`/api/v1/pos/orders/${orderId}/provisional-bill`);
  return ProvisionalBillResponseSchema.parse(raw);
}

export async function checkoutPosOrder(params: {
  orderId: number;
  input: CheckoutOrderRequest;
}): Promise<{ orderId: number; status: 'PAID'; paidAt: string }> {
  const parsed = CheckoutOrderRequestSchema.parse(params.input);
  return apiClient.post<{ orderId: number; status: 'PAID'; paidAt: string }>(
    `/api/v1/pos/orders/${params.orderId}/checkout`,
    parsed,
  );
}

export async function cancelPosOrder(params: {
  orderId: number;
  input: VoidInvoiceRequest;
}): Promise<{ orderId: number; status: 'VOIDED'; tableId: number | null }> {
  const parsed = VoidInvoiceRequestSchema.parse(params.input);
  return apiClient.post<{ orderId: number; status: 'VOIDED'; tableId: number | null }>(
    `/api/v1/pos/orders/${params.orderId}/cancel`,
    parsed,
  );
}

export async function executePosTableAction(params: {
  orderId: number;
  input: TableActionRequest;
}): Promise<TableActionResponse> {
  const parsed = TableActionRequestSchema.parse(params.input);
  const raw = await apiClient.post<unknown>(
    `/api/v1/pos/orders/${params.orderId}/table-action`,
    parsed,
  );
  return TableActionResponseSchema.parse(raw);
}

export function usePosTableGridQuery() {
  return useQuery({
    queryKey: posQueryKeys.tableGrid(),
    queryFn: fetchPosTableGrid,
  });
}

export function usePosProductsQuery() {
  return useQuery({
    queryKey: posQueryKeys.products(),
    queryFn: fetchPosProducts,
  });
}

export function usePosOrderDetailQuery(orderId: number | null) {
  return useQuery({
    queryKey: posQueryKeys.orderDetail(orderId),
    queryFn: () => fetchPosOrderDetail(orderId!),
    enabled: typeof orderId === 'number' && orderId > 0,
  });
}

export function useCreatePosOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPosOrder,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
    },
  });
}

export function useApproveQrOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: approvePosQrOrder,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(variables.orderId),
        }),
      ]);
    },
  });
}

export function usePatchOrderItemsMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: patchPosOrderItems,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(variables.orderId),
        }),
      ]);
    },
  });
}

export function useSplitKitchenMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: splitPosKitchen,
    onSuccess: async (_data, orderId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(orderId),
        }),
      ]);
    },
  });
}

export function useReprintKitchenMutation() {
  return useMutation({
    mutationFn: reprintPosKitchen,
  });
}

export function useProvisionalBillMutation() {
  return useMutation({
    mutationFn: fetchPosProvisionalBill,
  });
}

export function useCheckoutOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: checkoutPosOrder,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(variables.orderId),
        }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['cashflow'] }),
      ]);
    },
  });
}

export function useTableActionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: executePosTableAction,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
      ]);
    },
  });
}

export function useCancelPosOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPosOrder,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(variables.orderId),
        }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['cashflow'] }),
      ]);
    },
  });
}
