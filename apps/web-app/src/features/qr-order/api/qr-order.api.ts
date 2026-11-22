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

export interface GuestQrCoordinates {
  lat: number;
  lng: number;
}

export const qrOrderQueryKeys = {
  publicMenu: (qrToken: string, coords?: GuestQrCoordinates | null) =>
    coords ? (['public-menu', qrToken, coords] as const) : (['public-menu', qrToken] as const),
};

export async function fetchPublicMenu(
  qrToken: string,
  coords?: GuestQrCoordinates | null,
): Promise<PublicMenuResponse> {
  const raw = await apiClient.get<unknown>('/api/v1/public/menu', {
    params: {
      token: qrToken,
      lat: coords?.lat,
      lng: coords?.lng,
    },
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

export function usePublicMenuQuery(qrToken: string, coords?: GuestQrCoordinates | null) {
  return useQuery({
    queryKey: qrOrderQueryKeys.publicMenu(qrToken, coords),
    queryFn: () => fetchPublicMenu(qrToken, coords),
    enabled: Boolean(qrToken),
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: true,
  });
}

export function useSubmitQrOrderMutation() {
  return useMutation({
    mutationFn: submitQrOrder,
  });
}
