import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CreateQrOrderSchema,
  PublicMenuResponseSchema,
  QrOrderResponseSchema,
  type CreateQrOrderInput,
  type PublicMenuResponse,
  type QrOrderResponse,
} from '@fnb/shared';

import { apiClient } from '@/lib/api-client';

export const qrOrderQueryKeys = {
  publicMenu: (qrToken: string) => ['public-menu', qrToken] as const,
};

export async function fetchPublicMenu(qrToken: string): Promise<PublicMenuResponse> {
  const raw = await apiClient.get<unknown>('/api/v1/public/menu', {
    params: { token: qrToken },
    skipAuthRefresh: true,
  });
  return PublicMenuResponseSchema.parse(raw);
}

export async function submitQrOrder(input: CreateQrOrderInput): Promise<QrOrderResponse> {
  const parsed = CreateQrOrderSchema.parse(input);
  const raw = await apiClient.post<unknown>('/api/v1/public/orders/qr', parsed, {
    skipAuthRefresh: true,
  });
  return QrOrderResponseSchema.parse(raw);
}

export function usePublicMenuQuery(qrToken: string) {
  return useQuery({
    queryKey: qrOrderQueryKeys.publicMenu(qrToken),
    queryFn: () => fetchPublicMenu(qrToken),
    enabled: Boolean(qrToken),
  });
}

export function useSubmitQrOrderMutation() {
  return useMutation({
    mutationFn: submitQrOrder,
  });
}
