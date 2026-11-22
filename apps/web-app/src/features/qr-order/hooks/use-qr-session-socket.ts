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
  guestSessionToken: string | null;
  currentTableLabel: string;
  orderStatus: OrderStatus | null;
  statusMessage: string | null;
  redirectNotice: string | null;
}

const getSessionKey = (qrToken: string) => `fnb_qr_session_${qrToken}`;

function readStoredSession(qrToken: string): Partial<QrSessionState> {
  const key = getSessionKey(qrToken);
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<QrSessionState>;
    if (!parsed.activeOrderId && (parsed.orderStatus === 'PAID' || parsed.orderStatus === 'VOIDED')) {
      return {
        activeOrderId: null,
        guestSessionToken: null,
        orderStatus: null,
        statusMessage: null,
        redirectNotice: null,
      };
    }
    return parsed;
  } catch {
    return {};
  }
}

function writeStoredSession(qrToken: string, state: Partial<QrSessionState>): void {
  const key = getSessionKey(qrToken);
  try {
    const serialized = JSON.stringify(state);
    localStorage.setItem(key, serialized);
    sessionStorage.setItem(key, serialized);
  } catch {
    // Ignore storage quota errors
  }
}

export interface ServerQrTableSnapshot {
  tableName?: string;
  activeOrderId?: number | null;
  activeOrderStatus?: OrderStatus | null;
  queriedOrderId?: number | null;
  orderMode?: 'DINE_IN' | 'TAKEAWAY';
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
    guestSessionToken: initialStored.guestSessionToken ?? null,
    currentTableLabel: initialStored.currentTableLabel ?? initialTableName ?? '',
    orderStatus: initialStored.orderStatus ?? null,
    statusMessage: initialStored.statusMessage ?? null,
    redirectNotice: initialStored.redirectNotice ?? null,
  }));

  React.useEffect(() => {
    staleCandidateOrderIdRef.current = readStoredSession(qrToken).activeOrderId ?? null;
  }, [qrToken]);

  const syncTableSnapshot = React.useCallback(
    (tableName?: string, snapshot?: ServerQrTableSnapshot) => {
      if (tableName) {
        setSessionState((prev) => {
          const shouldSetTakeawayLabel =
            snapshot?.orderMode === 'TAKEAWAY' && tableName !== prev.currentTableLabel;
          if (!prev.currentTableLabel || shouldSetTakeawayLabel) {
            const next: QrSessionState = { ...prev, currentTableLabel: tableName };
            writeStoredSession(qrToken, next);
            return next;
          }
          return prev;
        });
      }

      if (
        snapshot?.activeOrderId &&
        snapshot.activeOrderId === sessionState.activeOrderId &&
        snapshot.activeOrderStatus &&
        snapshot.activeOrderStatus !== sessionState.orderStatus
      ) {
        const nextStatus = snapshot.activeOrderStatus;
        const resolvedMsg =
          nextStatus === 'SERVING'
            ? resolveCachedAppMessage('qr.status.orderServing').title
            : nextStatus === 'PENDING'
              ? resolveCachedAppMessage('qr.status.orderPending').title
              : null;
        setSessionState((prev) => {
          const next: QrSessionState = {
            ...prev,
            currentTableLabel: tableName || prev.currentTableLabel,
            orderStatus: nextStatus,
            statusMessage: resolvedMsg ?? prev.statusMessage,
          };
          writeStoredSession(qrToken, next);
          return next;
        });
      }

      const isTakeawayEndedOnServer =
        snapshot?.orderMode === 'TAKEAWAY' &&
        sessionState.activeOrderId !== null &&
        snapshot.queriedOrderId === sessionState.activeOrderId &&
        snapshot.activeOrderId === null;

      const staleOrderId = staleCandidateOrderIdRef.current;
      if (!snapshot?.tableName || (staleOrderId === null && !isTakeawayEndedOnServer)) {
        return;
      }

      const isStaleTakeaway =
        isTakeawayEndedOnServer ||
        (snapshot.orderMode === 'TAKEAWAY' &&
          staleOrderId !== null &&
          snapshot.activeOrderId !== staleOrderId &&
          staleOrderId === sessionState.activeOrderId);
      const sameTableAndStale =
        staleOrderId !== null &&
        snapshot.tableName === sessionState.currentTableLabel &&
        snapshot.activeOrderId !== staleOrderId &&
        staleOrderId === sessionState.activeOrderId;

      if (!sameTableAndStale && !isStaleTakeaway) return;

      staleCandidateOrderIdRef.current = null;
      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: snapshot.activeOrderId ?? null,
          guestSessionToken: snapshot.activeOrderId ? prev.guestSessionToken : null,
          currentTableLabel: tableName || prev.currentTableLabel,
          orderStatus: null,
          statusMessage: null,
          redirectNotice: null,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
    },
    [qrToken, sessionState.activeOrderId, sessionState.currentTableLabel, sessionState.orderStatus],
  );

  React.useEffect(() => {
    syncTableSnapshot(initialTableName, serverTableSnapshot);
  }, [
    syncTableSnapshot,
    initialTableName,
    serverTableSnapshot?.tableName,
    serverTableSnapshot?.activeOrderId,
    serverTableSnapshot?.orderMode,
  ]);

  const registerSubmittedOrder = React.useCallback(
    (payload: {
      activeOrderId: number;
      currentTableLabel: string;
      status: OrderStatus;
      guestSessionToken?: string | null;
    }) => {
      staleCandidateOrderIdRef.current = null;
      const defaultMsg = resolveCachedAppMessage(
        payload.status === 'PENDING' ? 'qr.status.orderPending' : 'qr.status.orderServing',
      ).title;
      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: payload.activeOrderId,
          guestSessionToken: payload.guestSessionToken ?? prev.guestSessionToken,
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

  const startNewTakeawaySession = React.useCallback(() => {
    staleCandidateOrderIdRef.current = null;
    setSessionState({
      activeOrderId: null,
      guestSessionToken: null,
      currentTableLabel: 'Mang về',
      orderStatus: null,
      statusMessage: null,
      redirectNotice: null,
    });
    writeStoredSession(qrToken, {
      activeOrderId: null,
      guestSessionToken: null,
      currentTableLabel: 'Mang về',
      orderStatus: null,
      statusMessage: null,
      redirectNotice: null,
    });
    void queryClient.invalidateQueries({ queryKey: ['public-menu', qrToken] });
  }, [qrToken, queryClient]);

  React.useEffect(() => {
    if (!qrToken) return;

    const socket = connectPosSocket({
      mode: 'qr_guest',
      qrToken,
      orderId: sessionState.activeOrderId,
      ...(sessionState.guestSessionToken
        ? { guestSessionToken: sessionState.guestSessionToken }
        : {}),
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
        const shouldResetTakeawayLabel =
          isTerminal && prev.currentTableLabel.startsWith('Mang về');
        const next: QrSessionState = {
          ...prev,
          activeOrderId: isTerminal ? null : prev.activeOrderId,
          guestSessionToken: isTerminal ? null : prev.guestSessionToken,
          ...(shouldResetTakeawayLabel ? { currentTableLabel: 'Mang về' } : {}),
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
            guestSessionToken: null,
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

    const handleConnectError = (err?: unknown) => {
      if (sessionState.activeOrderId === null) return;
      const errMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message ?? '')
            : '';
      const isAuthRejection =
        !errMessage || /unauthorized|forbidden|invalid|not belong|unknown qr/i.test(errMessage);
      if (!isAuthRejection) {
        return;
      }
      staleCandidateOrderIdRef.current = null;
      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: null,
          guestSessionToken: null,
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
  }, [qrToken, sessionState.activeOrderId, sessionState.guestSessionToken, queryClient]);

  return {
    ...sessionState,
    registerSubmittedOrder,
    startNewTakeawaySession,
    syncTableSnapshot,
  };
}
