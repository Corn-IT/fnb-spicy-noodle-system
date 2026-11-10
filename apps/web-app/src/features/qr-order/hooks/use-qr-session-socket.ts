import { SocketEvents, type OrderStatus } from '@fnb/shared';
import * as React from 'react';

import { connectPosSocket, disconnectPosSocket } from '@/lib/socket-client';

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

export function useQrSessionSocket(qrToken: string, initialTableName?: string) {
  const [sessionState, setSessionState] = React.useState<QrSessionState>(() => {
    const stored = readStoredSession(qrToken);
    return {
      activeOrderId: stored.activeOrderId ?? null,
      currentTableLabel: stored.currentTableLabel ?? initialTableName ?? '',
      orderStatus: stored.orderStatus ?? null,
      statusMessage: stored.statusMessage ?? null,
      redirectNotice: stored.redirectNotice ?? null,
    };
  });

  React.useEffect(() => {
    if (initialTableName && !sessionState.currentTableLabel) {
      setSessionState((prev) => {
        const next = { ...prev, currentTableLabel: initialTableName };
        writeStoredSession(qrToken, next);
        return next;
      });
    }
  }, [initialTableName, qrToken, sessionState.currentTableLabel]);

  const registerSubmittedOrder = React.useCallback(
    (payload: {
      activeOrderId: number;
      currentTableLabel: string;
      status: OrderStatus;
    }) => {
      const defaultMsg =
        payload.status === 'PENDING'
          ? 'Đã gửi đơn, vui lòng chờ thu ngân xác nhận'
          : 'Bếp đang chế biến món ăn của quý khách';
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
    if (!qrToken || !sessionState.activeOrderId) return;

    const socket = connectPosSocket({
      mode: 'qr_guest',
      qrToken,
      orderId: sessionState.activeOrderId,
    });

    const handleSessionRedirected = (raw: unknown) => {
      const payload = raw as QrSessionRedirectPayload;
      if (!payload || typeof payload.newActiveOrderId !== 'number') return;

      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          activeOrderId: payload.newActiveOrderId,
          currentTableLabel: payload.newTableLabel || prev.currentTableLabel,
          redirectNotice:
            payload.message || `Đơn hàng của bạn đã được chuyển sang ${payload.newTableLabel}.`,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
    };

    const handleStatusUpdated = (raw: unknown) => {
      const payload = raw as QrOrderStatusUpdatedPayload;
      if (!payload || !payload.status) return;

      let statusMessage = payload.message ?? null;
      if (!statusMessage) {
        if (payload.status === 'SERVING') statusMessage = 'Bếp đang chế biến';
        else if (payload.status === 'PAID') statusMessage = 'Cảm ơn quý khách và hẹn gặp lại!';
        else if (payload.status === 'VOIDED') statusMessage = 'Đơn hàng đã bị từ chối';
      }

      setSessionState((prev) => {
        const next: QrSessionState = {
          ...prev,
          orderStatus: payload.status,
          statusMessage,
        };
        writeStoredSession(qrToken, next);
        return next;
      });
    };

    socket.on(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
    socket.on(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);

    return () => {
      socket.off(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
      socket.off(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);
      disconnectPosSocket();
    };
  }, [qrToken, sessionState.activeOrderId]);

  return {
    ...sessionState,
    registerSubmittedOrder,
  };
}
