import { SocketEvents } from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import { toast } from '@/components/ui/toast';
import { usePosSocketContext } from '@/providers/socket-provider';
import { posQueryKeys } from '../api/pos.api';

interface QrOrderSocketPayload {
  orderId: number;
  tableId?: number;
  tableLabel?: string;
  batchNo?: number;
  totalAmount?: number;
}

function playCashierBellSound(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.18);
  } catch {
    // Ignore audio autoplay blocks in headless/test environments
  }
}

export function usePosCashierSocket() {
  const { socket } = usePosSocketContext();
  const queryClient = useQueryClient();
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
      playCashierBellSound();
      toast({
        variant: 'warning',
        title: `🔔 Đơn QR mới tại ${payload?.tableLabel ?? 'Bàn'}`,
        description: 'Vui lòng kiểm tra và bấm Duyệt đơn / Tách bếp.',
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
      playCashierBellSound();
      const batchNo = payload?.batchNo ?? 2;
      if (payload?.orderId) {
        setAddonBadgesByOrderId((prev) => ({
          ...prev,
          [payload.orderId]: batchNo,
        }));
      }
      toast({
        variant: 'info',
        title: `🔔 ${payload?.tableLabel ?? 'Bàn'} gọi thêm Lượt ${batchNo}`,
        description: 'Khách vừa đặt thêm món qua QR.',
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
      if (payload?.orderId) {
        void queryClient.invalidateQueries({
          queryKey: posQueryKeys.orderDetail(payload.orderId),
        });
      }
    };

    const handleGridSync = () => {
      void queryClient.invalidateQueries({ queryKey: posQueryKeys.tableGrid() });
    };

    socket.on(SocketEvents.ORDER_QR_NEW, handleQrNew);
    socket.on(SocketEvents.ORDER_QR_ADDON, handleQrAddon);
    socket.on(SocketEvents.TABLE_GRID_SYNC, handleGridSync);

    return () => {
      socket.off(SocketEvents.ORDER_QR_NEW, handleQrNew);
      socket.off(SocketEvents.ORDER_QR_ADDON, handleQrAddon);
      socket.off(SocketEvents.TABLE_GRID_SYNC, handleGridSync);
    };
  }, [socket, queryClient]);

  return {
    addonBadgesByOrderId,
    clearAddonBadge,
  };
}
