import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type InvoiceFilterQuery,
  type OrderDetailResponse,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type PendingPaymentEdit,
  type ReviewInvoicePaymentEditInput,
  type TakeawayLabelFormat,
  type UpdateInvoicePaymentMethodInput,
  type VoidInvoiceRequest,
  type DiscountSnapshot,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export interface InvoiceListItem {
  orderId: number;
  orderCode: string;
  orderType: OrderType;
  tableId: number | null;
  tableLabel: string | null;
  takeawayNumber: number | null;
  takeawayLabelFormat?: TakeawayLabelFormat | null;
  status: OrderStatus;
  paymentMethod: PaymentMethod | null;
  cashAmount: number;
  transferAmount: number;
  subtotalAmount?: number;
  discountAmount?: number;
  discountId?: number | null;
  discountSnapshot?: DiscountSnapshot | null;
  totalAmount: number;
  createdAt: string;
  paidAt?: string | null;
  note: string | null;
  pendingPaymentEdit?: PendingPaymentEdit | null;
}

export interface InvoiceListResponse {
  page: number;
  limit: number;
  total: number;
  summary?: {
    totalPaidAmount: number;
    totalCashAmount: number;
    totalTransferAmount: number;
    totalDiscountAmount?: number;
    paidCount: number;
  };
  items: InvoiceListItem[];
}

export interface UpdateInvoicePaymentMethodResponse {
  orderId: number;
  orderCode: string;
  status: 'APPLIED' | 'PENDING_APPROVAL';
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  pendingPaymentEdit?: PendingPaymentEdit | null;
  syncedSettlementIds?: number[];
}

export interface ReviewInvoicePaymentEditResponse {
  orderId: number;
  orderCode: string;
  status: 'APPROVED' | 'REJECTED';
  paymentMethod?: PaymentMethod;
  cashAmount?: number;
  transferAmount?: number;
  syncedSettlementIds?: number[];
}

export interface VoidInvoiceResponse {
  orderId: number;
  orderCode: string;
  status: OrderStatus;
  voidReason: string;
  syncedSettlementIds?: number[];
}

export function getTodayVietnamDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function useInvoicesQuery(filter: InvoiceFilterQuery) {
  return useQuery({
    queryKey: ['invoices', filter],
    queryFn: () =>
      apiClient.get<InvoiceListResponse>('/api/v1/invoices', {
        params: {
          page: filter.page,
          limit: filter.limit,
          fromDate: filter.fromDate,
          toDate: filter.toDate,
          keyword: filter.keyword || undefined,
          searchField: filter.keyword ? filter.searchField : undefined,
          status: filter.status,
          paymentMethod: filter.paymentMethod,
          orderType: filter.orderType,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useInvoiceDetailQuery(orderId: number | null) {
  return useQuery({
    queryKey: ['invoices', 'detail', orderId],
    queryFn: () => apiClient.get<OrderDetailResponse>(`/api/v1/invoices/${orderId}`),
    enabled: orderId !== null && orderId > 0,
  });
}

export function useReprintInvoiceMutation() {
  return useMutation({
    mutationFn: (orderId: number) =>
      apiClient.post<OrderDetailResponse>(`/api/v1/invoices/${orderId}/reprint`),
  });
}

export function useUpdateInvoicePaymentMethodMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: number; body: UpdateInvoicePaymentMethodInput }) =>
      apiClient.patch<UpdateInvoicePaymentMethodResponse>(
        `/api/v1/invoices/${orderId}/payment-method`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({
        queryKey: ['invoices', 'detail', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

export function useReviewInvoicePaymentEditMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: number; body: ReviewInvoicePaymentEditInput }) =>
      apiClient.post<ReviewInvoicePaymentEditResponse>(
        `/api/v1/invoices/${orderId}/payment-method/review`,
        body,
      ),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({
        queryKey: ['invoices', 'detail', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}

export function useVoidInvoiceMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, body }: { orderId: number; body: VoidInvoiceRequest }) =>
      apiClient.post<VoidInvoiceResponse>(`/api/v1/invoices/${orderId}/void`, body),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['invoices'] });
      void queryClient.invalidateQueries({
        queryKey: ['invoices', 'detail', variables.orderId],
      });
      void queryClient.invalidateQueries({ queryKey: ['discounts'] });
      void queryClient.invalidateQueries({ queryKey: ['payment-qr'] });
      void queryClient.invalidateQueries({ queryKey: ['cashflow'] });
    },
  });
}
