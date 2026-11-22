import { QrAutoCancelledPayloadSchema, SocketEvents, type OrderStatus } from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { STORE_SETTINGS_QUERY_KEY } from '@/hooks/use-store-settings';
import { connectPosSocket, disconnectPosSocket } from '@/lib/socket-client';
import { resolveCachedAppMessage } from '@/utils/store-messages-cache';

export interface QrSessionRedirectPayload {
  previousOrderId: number;
  newActiveOrderId: number;
  previousTableLabel: string;
  newTableId: number;
  newTableLabel: string;
  message: string;
}

export interface QrOrderStatusUpdatedPayload {
  orderId?: number;
  status: OrderStatus;
  message?: string;
  paidAt?: string;
}

export interface QrSessionState {
  activeOrderId: number | null;
  currentTableLabel: string;
  orderStatus: OrderStatus | null;
  statusMessage: string | null;
  redirectNotice: string | null;
}

const getSessionKey = (qrToken: string) => `fnb_qr_session_${qrToken}`;

function readStoredSession(qrToken: string): Partial<QrSessionState> {
  try {
    const raw = sessionStorage.getItem(getSessionKey(qrToken));
    if (!raw) return {};
    return JSON.parse(raw) as Partial<QrSessionState>;
  } catch {
    return {};
  }
}

function writeStoredSession(qrToken: string, state: Partial<QrSessionState>): void {
  try {
    sessionStorage.setItem(getSessionKey(qrToken), JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

export interface ServerQrTableSnapshot {
  tableName?: string;
  activeOrderId?: number | null;
}

export function useQrSessionSocket(
  qrToken: string,
  initialTableName?: string,
  serverTableSnapshot?: ServerQrTableSnapshot,
) {
  const queryClient = useQueryClient();
  const initialStored = React.useMemo(() => readStoredSession(qrToken), [qrToken]);
  const staleCandidateOrderIdRef = React.useRef<number | null>(
    initialStored.activeOrderId ?? null,
  );

  const [sessionState, setSessionState] = React.useState<QrSessionState>(() => ({
    activeOrderId: initialStored.activeOrderId ?? null,
    currentTableLabel: initialStored.currentTableLabel ?? initialTableName ?? '',
    orderStatus: initialStored.orderStatus ?? null,
    statusMessage: initialStored.statusMessage ?? null,
    redirectNotice: initialStored.redirectNotice ?? null,
  }));

  React.useEffect(() => {
    staleCandidateOrderIdRef.current = readStoredSession(qrToken).activeOrderId ?? null;
  }, [qrToken]);

  React.useEffect(() => {
    if (initialTableName && !sessionState.currentTableLabel) {
      setSessionState((prev) => {
        const next = { ...prev, currentTableLabel: initialTableName };
        writeStoredSession(qrToken, next);
        return next;
      });
    }
  }, [initialTableName, qrToken, sessionState.currentTableLabel]);

  React.useEffect(() => {
    const staleOrderId = staleCandidateOrderIdRef.current;
    if (
      !serverTableSnapshot?.tableName ||
      staleOrderId === null ||
      sessionState.activeOrderId !== staleOrderId
    ) {
      return;
    }

    const sameTableAndStale =
      serverTableSnapshot.tableName === sessionState.currentTableLabel &&
      serverTableSnapshot.activeOrderId !== staleOrderId;
    if (!sameTableAndStale) return;

    staleCandidateOrderIdRef.current = null;
    setSessionState((prev) => {
      const next: QrSessionState = {
        ...prev,
        activeOrderId: serverTableSnapshot.activeOrderId ?? null,
        orderStatus: null,
        statusMessage: null,
        redirectNotice: null,
      };
      writeStoredSession(qrToken, next);
      return next;
    });
  }, [
    qrToken,
    serverTableSnapshot?.tableName,
    serverTableSnapshot?.activeOrderId,
    sessionState.activeOrderId,
    sessionState.currentTableLabel,
  ]);

  const registerSubmittedOrder = React.useCallback(
    (payload: {
      activeOrderId: number;
      currentTableLabel: string;
      status: OrderStatus;
    }) => {
      staleCandidateOrderIdRef.current = null;
      const defaultMsg = resolveCachedAppMessage(
        payload.status === 'PENDING' ? 'qr.status.orderPending' : 'qr.status.orderServing',
      ).title;
      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: payload.activeOrderId,
          currentTableLabel: payload.currentTableLabel,
          orderStatus: payload.status,
          statusMessage: defaultMsg,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
    },
    [qrToken],
  );

  React.useEffect(() => {
    if (!qrToken) return;

    const socket = connectPosSocket({
      mode: 'qr_guest',
      qrToken,
      orderId: sessionState.activeOrderId,
    });

    const invalidatePublicMenu = () => {
      void queryClient.invalidateQueries({ queryKey: ['public-menu', qrToken] });
    };

    const handleSessionRedirected = (raw: unknown) => {
      const payload = raw as QrSessionRedirectPayload;
      if (!payload || typeof payload.newActiveOrderId !== 'number') return;

      staleCandidateOrderIdRef.current = null;
      const fallbackNotice = resolveCachedAppMessage('qr.status.redirectFallback', {
        tableLabel: payload.newTableLabel,
      });

      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: payload.newActiveOrderId,
          currentTableLabel: payload.newTableLabel || prev.currentTableLabel,
          redirectNotice: fallbackNotice.isOverridden
            ? fallbackNotice.title
            : payload.message || fallbackNotice.title,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
      invalidatePublicMenu();
    };

    const handleStatusUpdated = (raw: unknown) => {
      const payload = raw as QrOrderStatusUpdatedPayload;
      if (!payload || !payload.status) return;

      const statusKey =
        payload.status === 'SERVING'
          ? 'qr.status.orderServingShort'
          : payload.status === 'PAID'
            ? 'qr.status.orderPaid'
            : payload.status === 'VOIDED'
              ? 'qr.status.orderVoided'
              : null;
      const resolvedStatus = statusKey ? resolveCachedAppMessage(statusKey) : null;
      const statusMessage = resolvedStatus?.isOverridden
        ? resolvedStatus.title
        : (payload.message ?? resolvedStatus?.title ?? null);

      const isTerminal = payload.status === 'PAID' || payload.status === 'VOIDED';
      if (isTerminal) {
        staleCandidateOrderIdRef.current = null;
      }

      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: isTerminal ? null : prev.activeOrderId,
          orderStatus: payload.status,
          statusMessage,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
      invalidatePublicMenu();
    };

    const handleMenuUpdated = () => {
      invalidatePublicMenu();
    };

    const handleStoreSettingsUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: STORE_SETTINGS_QUERY_KEY });
    };

    const handleQrAutoCancelled = (raw: unknown) => {
      const parsed = QrAutoCancelledPayloadSchema.safeParse(raw);
      if (!parsed.success) return;
      const minutes = parsed.data.autoCancelMinutes;
      const messageKey =
        parsed.data.kind === 'NEW' ? 'qr.status.orderAutoCancelled' : 'qr.status.addonAutoCancelled';
      const resolved = resolveCachedAppMessage(messageKey, { minutes });
      const statusMessage = resolved.title || parsed.data.reason;

      if (parsed.data.kind === 'NEW') {
        staleCandidateOrderIdRef.current = null;
        setSessionState((prev) => {
          const next: QrSessionState = {
            ...prev,
            activeOrderId: null,
            orderStatus: 'VOIDED',
            statusMessage,
          };
          writeStoredSession(qrToken, next);
          return next;
        });
      } else {
        setSessionState((prev) => {
          const next: QrSessionState = {
            ...prev,
            statusMessage,
          };
          writeStoredSession(qrToken, next);
          return next;
        });
      }
      invalidatePublicMenu();
    };

    const handleConnectError = () => {
      if (sessionState.activeOrderId === null) return;
      staleCandidateOrderIdRef.current = null;
      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: null,
          orderStatus: null,
          statusMessage: null,
          redirectNotice: null,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
      invalidatePublicMenu();
    };

    socket.on('connect', invalidatePublicMenu);
    socket.on('connect_error', handleConnectError);
    socket.on(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
    socket.on(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);
    socket.on(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
    socket.on(SocketEvents.MENU_UPDATED, handleMenuUpdated);
    socket.on(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);

    return () => {
      socket.off('connect', invalidatePublicMenu);
      socket.off('connect_error', handleConnectError);
      socket.off(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
      socket.off(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);
      socket.off(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
      socket.off(SocketEvents.MENU_UPDATED, handleMenuUpdated);
      socket.off(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
      disconnectPosSocket();
    };
  }, [qrToken, sessionState.activeOrderId, queryClient]);

  return {
    ...sessionState,
    registerSubmittedOrder,
  };
}
