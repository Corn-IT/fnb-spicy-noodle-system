import {
  QrAutoCancelledPayloadSchema,
  SocketEvents,
  type QrAutoCancelledPayload,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { useAppMessages } from '@/hooks/use-app-messages';
import { enqueueQrVoiceAlert } from '@/lib/qr-voice-announcer';
import { usePosSocketContext } from '@/providers/socket-provider';
import { posQueryKeys } from '../api/pos.api';

interface QrOrderSocketPayload {
  orderId?: number;
  tableId?: number;
  tableLabel?: string;
  batchNo?: number;
  totalAmount?: number;
}

export interface UsePosCashierSocketOptions {
  onQrAutoCancelled?: (payload: QrAutoCancelledPayload) => void;
}

export function usePosCashierSocket(options?: UsePosCashierSocketOptions) {
  const { socket } = usePosSocketContext();
  const queryClient = useQueryClient();
  const { notify } = useAppMessages();
  const notifyRef = React.useRef(notify);
  notifyRef.current = notify;
  const autoCancelCallbackRef = React.useRef(options?.onQrAutoCancelled);
  autoCancelCallbackRef.current = options?.onQrAutoCancelled;
  const [addonBadgesByOrderId, setAddonBadgesByOrderId] = React.useState<Record<number, number>>({});

  const clearAddonBadge = React.useCallback((orderId: number) => {
    setAddonBadgesByOrderId((prev) => {
      if (!(orderId in prev)) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  React.useEffect(() => {
    if (!socket) return;

    const handleQrNew = (raw: unknown) => {
      const payload = raw as QrOrderSocketPayload;
      const tableLabel = payload?.tableLabel ?? 'Bàn';
      void enqueueQrVoiceAlert({ tableLabel, kind: 'NEW' });
      notifyRef.current('pos.socket.newQrOrder', {
        variant: 'warning',
        vars: { tableLabel },
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
      if (payload?.orderId) {
        void queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(payload.orderId),
        });
      }
    };

    const handleQrAddon = (raw: unknown) => {
      const payload = raw as QrOrderSocketPayload;
      const tableLabel = payload?.tableLabel ?? 'Bàn';
      void enqueueQrVoiceAlert({ tableLabel, kind: 'ADDON' });
      const batchNo = payload?.batchNo ?? 2;
      if (payload?.orderId && batchNo >= 2) {
        setAddonBadgesByOrderId((prev) => ({
          ...prev,
          [payload.orderId!]: batchNo,
        }));
      }
      notifyRef.current('pos.socket.qrAppendItems', {
        variant: 'info',
        vars: { tableLabel, batchNo },
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
      if (payload?.orderId) {
        void queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(payload.orderId),
        });
      }
    };

    const handleGridSync = (raw?: unknown) => {
      const payload = (raw ?? {}) as QrOrderSocketPayload & { status?: string };
      if (
        typeof payload.orderId === 'number' &&
        (payload.status === 'SERVING' ||
          payload.status === 'PAID' ||
          payload.status === 'AVAILABLE')
      ) {
        clearAddonBadge(payload.orderId);
      }
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
      if (typeof payload.orderId === 'number') {
        void queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(payload.orderId),
        });
      } else {
        void queryClient.invalidateQueries({ queryKey: ['pos', 'order'] });
      }
    };

    const handleSocketReconnect = () => {
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
      void queryClient.invalidateQueries({ queryKey: ['pos', 'order'] });
    };

    const handleQrAutoCancelled = (raw: unknown) => {
      const parsed = QrAutoCancelledPayloadSchema.safeParse(raw);
      if (parsed.success) {
        clearAddonBadge(parsed.data.orderId);
        notifyRef.current('pos.socket.qrAutoCancelled', {
          variant: 'warning',
          vars: {
            tableLabel: parsed.data.tableLabel ?? 'Bàn',
            detail: parsed.data.reason,
          },
          duration: 7000,
        });
        autoCancelCallbackRef.current?.(parsed.data);
        void queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(parsed.data.orderId),
        });
      }
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    };

    socket.on(SocketEvents.ORDER_QR_NEW, handleQrNew);
    socket.on(SocketEvents.ORDER_QR_ADDON, handleQrAddon);
    socket.on(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
    socket.on(SocketEvents.TABLE_GRID_SYNC, handleGridSync);
    socket.on('connect', handleSocketReconnect);

    return () => {
      socket.off(SocketEvents.ORDER_QR_NEW, handleQrNew);
      socket.off(SocketEvents.ORDER_QR_ADDON, handleQrAddon);
      socket.off(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
      socket.off(SocketEvents.TABLE_GRID_SYNC, handleGridSync);
      socket.off('connect', handleSocketReconnect);
    };
  }, [socket, queryClient, clearAddonBadge]);

  return {
    addonBadgesByOrderId,
    clearAddonBadge,
  };
}
