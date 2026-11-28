import { SocketEvents } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePosCashierSocket } from '../use-pos-cashier-socket';

type Handler = (...args: unknown[]) => void;

class MockCashierSocket {
  public handlers = new Map<string, Set<Handler>>();
  on = vi.fn((event: string, fn: Handler) => {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(fn);
    return this;
  });
  off = vi.fn((event: string, fn: Handler) => {
    this.handlers.get(event)?.delete(fn);
    return this;
  });
  emitServer(event: string, payload?: unknown) {
    for (const fn of this.handlers.get(event) ?? []) {
      fn(payload);
    }
  }
}

let mockSocket: MockCashierSocket | null = null;
const notifyMock = vi.fn();
const enqueueVoiceMock = vi.fn().mockResolvedValue(undefined);
const shouldEmitMock = vi.fn<(dedupKey: string) => boolean>(() => true);

vi.mock('@/providers/socket-provider', () => ({
  usePosSocketContext: () => ({ socket: mockSocket, isConnected: Boolean(mockSocket) }),
}));

vi.mock('@/hooks/use-app-messages', () => ({
  useAppMessages: () => ({ notify: notifyMock }),
}));

vi.mock('@/lib/qr-voice-announcer', () => ({
  enqueueQrVoiceAlert: (arg: unknown) => enqueueVoiceMock(arg),
}));

vi.mock('@/components/layout/app-shell', () => ({
  shouldEmitDeduplicatedOrderAlert: (key: string) => shouldEmitMock(key),
}));

describe('usePosCashierSocket', () => {
  beforeEach(() => {
    notifyMock.mockReset();
    enqueueVoiceMock.mockClear();
    shouldEmitMock.mockReturnValue(true);
    mockSocket = new MockCashierSocket();
  });

  it('handles socket=null safely without registering listeners', () => {
    mockSocket = null;
    const qc = new QueryClient();
    const { result } = renderHook(() => usePosCashierSocket(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    expect(result.current.addonBadgesByOrderId).toEqual({});
    act(() => result.current.clearAddonBadge(999));
  });

  it('handles QR_NEW, QR_ADDON, TABLE_GRID_SYNC, DRAFTS_UPDATED, connect, QR_AUTO_CANCELLED, and unmounts cleanly', () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
    const onAutoCancelled = vi.fn();

    const { result, unmount } = renderHook(
      () => usePosCashierSocket({ onQrAutoCancelled: onAutoCancelled }),
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      },
    );

    act(() => {
      mockSocket!.emitServer(SocketEvents.ORDER_QR_NEW, { orderId: 101, tableLabel: 'Bàn 01' });
      mockSocket!.emitServer(SocketEvents.ORDER_QR_NEW, {});
      mockSocket!.emitServer(SocketEvents.ORDER_QR_ADDON, {
        orderId: 101,
        tableLabel: 'Bàn 01',
        batchNo: 2,
      });
      mockSocket!.emitServer(SocketEvents.ORDER_QR_ADDON, {});
    });

    expect(result.current.addonBadgesByOrderId[101]).toBe(2);
    expect(enqueueVoiceMock).toHaveBeenCalled();
    expect(notifyMock).toHaveBeenCalledWith(
      'pos.socket.newQrOrder',
      expect.objectContaining({ variant: 'warning' }),
    );
    expect(notifyMock).toHaveBeenCalledWith(
      'pos.socket.qrAppendItems',
      expect.objectContaining({ variant: 'info' }),
    );

    // Deduplicated alert false branch & clearAddonBadge no-op vs delete
    shouldEmitMock.mockReturnValue(false);
    act(() => {
      mockSocket!.emitServer(SocketEvents.ORDER_QR_NEW, { orderId: 102 });
      mockSocket!.emitServer(SocketEvents.ORDER_QR_ADDON, { orderId: 102, batchNo: 3 });
      mockSocket!.emitServer(SocketEvents.TABLE_GRID_SYNC, { orderId: 101, status: 'SERVING' });
      mockSocket!.emitServer(SocketEvents.TABLE_GRID_SYNC, {});
      mockSocket!.emitServer(SocketEvents.POS_DRAFTS_UPDATED);
      mockSocket!.emitServer('connect');
    });
    expect(result.current.addonBadgesByOrderId[101]).toBeUndefined();
    expect(result.current.addonBadgesByOrderId[102]).toBe(3);

    act(() => {
      mockSocket!.emitServer(SocketEvents.ORDER_QR_AUTO_CANCELLED, { bad: 'shape' });
      mockSocket!.emitServer(SocketEvents.ORDER_QR_AUTO_CANCELLED, {
        orderId: 102,
        orderCode: 'HD-102',
        tableId: 2,
        tableLabel: null,
        kind: 'ADDON',
        cancelledItemCount: 1,
        autoCancelMinutes: 5,
        cancelledAt: '2026-11-28T02:00:00.000Z',
        reason: 'Quá hạn xác nhận',
      });
    });

    expect(onAutoCancelled).toHaveBeenCalledTimes(1);
    expect(result.current.addonBadgesByOrderId[102]).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalled();

    unmount();
    expect(mockSocket!.off).toHaveBeenCalledTimes(6);
  });
});
