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

export interface GuestQrSessionFilter {
  activeOrderId?: number | null;
  guestSessionToken?: string | null;
}

export const qrOrderQueryKeys = {
  publicMenu: (
    qrToken: string,
    coords?: GuestQrCoordinates | null,
    session?: GuestQrSessionFilter | null,
  ) => {
    const activeOrderId = session?.activeOrderId ?? null;
    const guestSessionToken = session?.guestSessionToken ?? null;
    if (coords && activeOrderId && guestSessionToken) {
      return ['public-menu', qrToken, coords, activeOrderId, guestSessionToken] as const;
    }
    if (activeOrderId && guestSessionToken) {
      return ['public-menu', qrToken, activeOrderId, guestSessionToken] as const;
    }
    if (coords) {
      return ['public-menu', qrToken, coords] as const;
    }
    return ['public-menu', qrToken] as const;
  },
};

export async function fetchPublicMenu(
  qrToken: string,
  coords?: GuestQrCoordinates | null,
  session?: GuestQrSessionFilter | null,
): Promise<PublicMenuResponse> {
  const hasTakeawaySession =
    Boolean(session?.activeOrderId) && Boolean(session?.guestSessionToken);
  const raw = await apiClient.get<unknown>('/api/v1/public/menu', {
    params: {
      token: qrToken,
      lat: coords?.lat,
      lng: coords?.lng,
      ...(hasTakeawaySession
        ? {
            activeOrderId: session!.activeOrderId,
            guestSessionToken: session!.guestSessionToken,
          }
        : {}),
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

export function usePublicMenuQuery(
  qrToken: string,
  coords?: GuestQrCoordinates | null,
  session?: GuestQrSessionFilter | null,
) {
  return useQuery({
    queryKey: qrOrderQueryKeys.publicMenu(qrToken, coords, session),
    queryFn: () => fetchPublicMenu(qrToken, coords, session),
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
