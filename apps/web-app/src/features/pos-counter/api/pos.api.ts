import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ApplicableDiscountsResponse,
  ApplicableDiscountsResponseSchema,
  type ApplyPosDiscountRequest,
  ApplyPosDiscountRequestSchema,
  ApproveQrOrderSchema,
  CheckoutOrderRequestSchema,
  CreateDiningTableSchema,
  CreatePosOrderSchema,
  OrderDetailResponseSchema,
  PatchOrderItemsResponseSchema,
  PatchOrderItemsSchema,
  PosOrderCreationResponseSchema,
  ProductSchema,
  ProvisionalBillResponseSchema,
  QrSecurityConfigResponseSchema,
  ReprintKitchenRequestSchema,
  RotateTableQrResponseSchema,
  RotateTakeawayQrResponseSchema,
  SplitCheckoutOrderRequestSchema,
  SplitKitchenResponseSchema,
  SplitProvisionalBillRequestSchema,
  TableActionRequestSchema,
  TableActionResponseSchema,
  UpdateDiningTableSchema,
  UpdateQrSecurityConfigSchema,
  VoidInvoiceRequestSchema,
  type ApproveQrOrderInput,
  type CheckoutOrderRequest,
  type CreateDiningTableInput,
  type CreatePosOrderInput,
  type OrderDetailResponse,
  type PatchOrderItemsInput,
  type PatchOrderItemsResponse,
  type PosOrderCreationResponse,
  type Product,
  type ProvisionalBillResponse,
  type QrSecurityConfigResponse,
  type ReprintKitchenRequest,
  type RotateTableQrResponse,
  type RotateTakeawayQrResponse,
  type SplitCheckoutOrderRequest,
  type SplitKitchenResponse,
  type SplitProvisionalBillRequest,
  type TableActionRequest,
  type TableActionResponse,
  type UpdateDiningTableInput,
  type UpdateQrSecurityConfigInput,
  type VoidInvoiceRequest,
} from '@fnb/shared';
import { z } from 'zod';

import { apiClient } from '@/lib/api-client';
import {
  fetchPosTableGrid,
  POS_TABLE_GRID_QUERY_KEY,
} from '@/lib/pos-table-grid-query';

export const posQueryKeys = {
  all: ['pos'] as const,
  tableGrid: () => POS_TABLE_GRID_QUERY_KEY,
  products: () => ['pos', 'products'] as const,
  orderDetail: (orderId: number | null) => ['pos', 'order', orderId] as const,
  applicableDiscounts: (orderId: number | null) =>
    ['pos', 'order', orderId, 'applicable-discounts'] as const,
  qrSecurityConfig: () => ['pos', 'qr-security-config'] as const,
};

export { fetchPosTableGrid };

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
  const raw = await apiClient.post<unknown>(`/api/v1/pos/orders/${orderId}/provisional-bill`, {});
  return ProvisionalBillResponseSchema.parse(raw);
}

export async function fetchPosSplitProvisionalBill(params: {
  orderId: number;
  input: SplitProvisionalBillRequest;
}): Promise<ProvisionalBillResponse> {
  const parsed = SplitProvisionalBillRequestSchema.parse(params.input);
  const raw = await apiClient.post<unknown>(
    `/api/v1/pos/orders/${params.orderId}/split-provisional-bill`,
    parsed,
  );
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

export interface SplitCheckoutPosOrderResponse {
  isFullCheckout: boolean;
  paidOrderId: number;
  paidOrderCode: string;
  remainingOrderId: number | null;
  remainingTotalAmount: number;
  paidTotalAmount: number;
  paidAt: string;
  status: 'PAID' | 'SERVING';
}

export async function splitCheckoutPosOrder(params: {
  orderId: number;
  input: SplitCheckoutOrderRequest;
}): Promise<SplitCheckoutPosOrderResponse> {
  const parsed = SplitCheckoutOrderRequestSchema.parse(params.input);
  return apiClient.post<SplitCheckoutPosOrderResponse>(
    `/api/v1/pos/orders/${params.orderId}/split-checkout`,
    parsed,
  );
}

export async function createPosDiningTable(
  input: CreateDiningTableInput,
): Promise<{ id: number; name: string; status: string; activeOrderId: number | null }> {
  const parsed = CreateDiningTableSchema.parse(input);
  return apiClient.post<{ id: number; name: string; status: string; activeOrderId: number | null }>(
    '/api/v1/pos/tables',
    parsed,
  );
}

export async function updatePosDiningTable(params: {
  id: number;
  input: UpdateDiningTableInput;
}): Promise<{ id: number; name: string; status: string; activeOrderId: number | null }> {
  const parsed = UpdateDiningTableSchema.parse(params.input);
  return apiClient.put<{ id: number; name: string; status: string; activeOrderId: number | null }>(
    `/api/v1/pos/tables/${params.id}`,
    parsed,
  );
}

export async function deletePosDiningTable(id: number): Promise<{ deleted: boolean; id: number }> {
  return apiClient.delete<{ deleted: boolean; id: number }>(`/api/v1/pos/tables/${id}`);
}

export async function rotatePosDiningTableQr(id: number): Promise<RotateTableQrResponse> {
  const raw = await apiClient.post<unknown>(`/api/v1/pos/tables/${id}/rotate-qr`, {});
  return RotateTableQrResponseSchema.parse(raw);
}

export async function rotatePosTakeawayQr(): Promise<RotateTakeawayQrResponse> {
  const raw = await apiClient.post<unknown>('/api/v1/pos/takeaway-qr/rotate', {});
  return RotateTakeawayQrResponseSchema.parse(raw);
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fetchPosProvisionalBill,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-qr'] });
    },
  });
}

export function useSplitProvisionalBillMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fetchPosSplitProvisionalBill,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payment-qr'] });
    },
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
        queryClient.invalidateQueries({ queryKey: ['payment-qr'] }),
      ]);
    },
  });
}

export function useSplitCheckoutOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: splitCheckoutPosOrder,
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(variables.orderId),
        }),
        queryClient.invalidateQueries({ queryKey: ['invoices'] }),
        queryClient.invalidateQueries({ queryKey: ['cashflow'] }),
        queryClient.invalidateQueries({ queryKey: ['payment-qr'] }),
      ]);
    },
  });
}

export function useCreateDiningTableMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPosDiningTable,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    },
  });
}

export function useUpdateDiningTableMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePosDiningTable,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    },
  });
}

export function useDeleteDiningTableMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePosDiningTable,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    },
  });
}

export function useRotateDiningTableQrMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotatePosDiningTableQr,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    },
  });
}

export function useRotateTakeawayQrMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: rotatePosTakeawayQr,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
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

export async function fetchPosQrSecurityConfig(): Promise<QrSecurityConfigResponse> {
  const raw = await apiClient.get<unknown>('/api/v1/pos/qr-security-config');
  return QrSecurityConfigResponseSchema.parse(raw);
}

export async function updatePosQrSecurityConfig(
  input: UpdateQrSecurityConfigInput,
): Promise<QrSecurityConfigResponse> {
  const parsed = UpdateQrSecurityConfigSchema.parse(input);
  const raw = await apiClient.put<unknown>('/api/v1/pos/qr-security-config', parsed);
  return QrSecurityConfigResponseSchema.parse(raw);
}

export function usePosQrSecurityConfigQuery(enabled = true) {
  return useQuery({
    queryKey: posQueryKeys.qrSecurityConfig(),
    queryFn: fetchPosQrSecurityConfig,
    enabled,
  });
}

export function useUpdatePosQrSecurityConfigMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updatePosQrSecurityConfig,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: posQueryKeys.qrSecurityConfig() });
    },
  });
}

export async function fetchPosApplicableDiscounts(
  orderId: number,
): Promise<ApplicableDiscountsResponse> {
  const raw = await apiClient.get<unknown>(
    `/api/v1/pos/orders/${orderId}/applicable-discounts`,
  );
  return ApplicableDiscountsResponseSchema.parse(raw);
}

export async function applyPosDiscount(params: {
  orderId: number;
  input: ApplyPosDiscountRequest;
}): Promise<OrderDetailResponse> {
  const parsed = ApplyPosDiscountRequestSchema.parse(params.input);
  const raw = await apiClient.post<unknown>(
    `/api/v1/pos/orders/${params.orderId}/discount`,
    parsed,
  );
  return OrderDetailResponseSchema.parse(raw);
}

export async function removePosDiscount(orderId: number): Promise<OrderDetailResponse> {
  const raw = await apiClient.delete<unknown>(`/api/v1/pos/orders/${orderId}/discount`);
  return OrderDetailResponseSchema.parse(raw);
}

export function useApplicableDiscountsQuery(orderId: number | null, enabled = true) {
  return useQuery({
    queryKey: posQueryKeys.applicableDiscounts(orderId),
    queryFn: () => fetchPosApplicableDiscounts(orderId!),
    enabled: enabled && typeof orderId === 'number' && orderId > 0,
  });
}

export function useApplyPosDiscountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: applyPosDiscount,
    onSuccess: async (updatedOrder, variables) => {
      queryClient.setQueryData(posQueryKeys.orderDetail(variables.orderId), updatedOrder);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orderDetail(variables.orderId) }),
        queryClient.invalidateQueries({
          queryKey: posQueryKeys.applicableDiscounts(variables.orderId),
        }),
        queryClient.invalidateQueries({ queryKey: ['discounts'] }),
      ]);
    },
  });
}

export function useRemovePosDiscountMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removePosDiscount,
    onSuccess: async (updatedOrder, orderId) => {
      queryClient.setQueryData(posQueryKeys.orderDetail(orderId), updatedOrder);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() }),
        queryClient.invalidateQueries({ queryKey: posQueryKeys.orderDetail(orderId) }),
        queryClient.invalidateQueries({ queryKey: posQueryKeys.applicableDiscounts(orderId) }),
        queryClient.invalidateQueries({ queryKey: ['discounts'] }),
      ]);
    },
  });
}

