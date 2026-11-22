import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import * as React from 'react';
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
  publicMenu: (qrToken: string, coords?: GuestQrCoordinates | null) =>
    coords ? (['public-menu', qrToken, coords] as const) : (['public-menu', qrToken] as const),
};

export async function fetchPublicMenu(
  qrToken: string,
  coords?: GuestQrCoordinates | null,
  session?: GuestQrSessionFilter | null,
): Promise<PublicMenuResponse> {
  const activeOrderId = session?.activeOrderId ?? null;
  const guestSessionToken = session?.guestSessionToken ?? null;
  const raw = await apiClient.get<unknown>('/api/v1/public/menu', {
    params: {
      token: qrToken,
      lat: coords?.lat,
      lng: coords?.lng,
      ...(activeOrderId ? { activeOrderId } : {}),
      ...(activeOrderId && guestSessionToken ? { guestSessionToken } : {}),
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
  session?: GuestQrSessionFilter | (() => GuestQrSessionFilter | undefined) | null,
) {
  const sessionGetter = typeof session === 'function' ? session : undefined;
  const sessionRef = React.useRef<GuestQrSessionFilter | null | undefined>(
    typeof session === 'function' ? session() : session,
  );
  if (typeof session !== 'function') {
    sessionRef.current = session;
  }

  const fetchSeqRef = React.useRef(0);
  const appliedSeqRef = React.useRef(0);
  const fetchedTokenRef = React.useRef(qrToken);
  const fetchedOrderIdRef = React.useRef<number | null>(null);
  if (fetchedTokenRef.current !== qrToken) {
    fetchedTokenRef.current = qrToken;
    fetchedOrderIdRef.current = null;
  }

  const query = useQuery({
    queryKey: qrOrderQueryKeys.publicMenu(qrToken, coords),
    queryFn: async () => {
      const seq = ++fetchSeqRef.current;
      const filter = sessionGetter ? sessionGetter() : sessionRef.current;
      const requestedOrderId = filter?.activeOrderId ?? null;
      const result = await fetchPublicMenu(qrToken, coords, filter);
      if (seq >= appliedSeqRef.current && fetchedTokenRef.current === qrToken) {
        appliedSeqRef.current = seq;
        fetchedOrderIdRef.current = requestedOrderId;
      }
      return result;
    },
    enabled: Boolean(qrToken),
    staleTime: 0,
    retry: false,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  return {
    ...query,
    queriedOrderId: fetchedOrderIdRef.current,
  };
}

export function useSubmitQrOrderMutation() {
  return useMutation({
    mutationFn: submitQrOrder,
  });
}
