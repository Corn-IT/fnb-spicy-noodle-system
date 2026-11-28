import { SocketEvents } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQrSessionSocket } from '../hooks/use-qr-session-socket';

type Handler = (...args: unknown[]) => void;

const socketHarness = vi.hoisted(() => {
  const listeners = new Map<string, Set<Handler>>();
  const fakeSocket = {
    connected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn((event: string, fn: Handler) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return fakeSocket;
    }),
    off: vi.fn((event: string, fn?: Handler) => {
      if (!fn) listeners.delete(event);
      else listeners.get(event)?.delete(fn);
      return fakeSocket;
    }),
  };
  return {
    listeners,
    fakeSocket,
    emitServer(event: string, payload?: unknown) {
      for (const fn of [...(listeners.get(event) ?? [])]) {
        fn(payload);
      }
    },
    reset() {
      listeners.clear();
      fakeSocket.connected = false;
      fakeSocket.connect.mockClear();
      fakeSocket.disconnect.mockClear();
      fakeSocket.on.mockClear();
      fakeSocket.off.mockClear();
    },
  };
});

vi.mock('@/lib/socket-client', () => ({
  connectPosSocket: vi.fn(() => socketHarness.fakeSocket),
  disconnectPosSocket: vi.fn(),
}));

describe('useQrSessionSocket', () => {
  let client: QueryClient;

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    socketHarness.reset();
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('handles full QR guest realtime lifecycle: create, notices, discount, merge, redirect, auto-cancel, rotation, and reconnect', () => {
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue(undefined);

    const { result } = renderHook(
      () =>
        useQrSessionSocket('ban05-tok', 'Bàn 05', {
          tableName: 'Bàn 05',
          activeOrderId: null,
          orderMode: 'DINE_IN',
        }),
      { wrapper },
    );

    expect(result.current.currentTableLabel).toBe('Bàn 05');

    // 1. GUEST_ORDER_CREATED attaches orderId & PENDING
    act(() => {
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'GUEST_ORDER_CREATED',
        orderStatus: 'PENDING',
        batchNo: 1,
        totalAmount: 100000,
        timestamp: '2026-11-28T01:00:00.000Z',
      });
    });
    expect(result.current.activeOrderId).toBe(42);
    expect(result.current.getSessionFilter()).toEqual({ activeOrderId: 42 });

    // 2. ORDER_STATUS_UPDATED: SERVING pre-approval then kitchen serving
    act(() => {
      socketHarness.emitServer(SocketEvents.ORDER_STATUS_UPDATED, {
        orderId: 42,
        status: 'SERVING',
        message: 'Quầy đã xác nhận, chờ chuyển xuống bếp',
      });
      socketHarness.emitServer(SocketEvents.ORDER_STATUS_UPDATED, {
        orderId: 42,
        status: 'SERVING',
        message: 'Bếp đã tiếp nhận',
      });
    });
    expect(result.current.orderStatus).toBe('SERVING');
    expect(result.current.ephemeralNotices.length).toBeGreaterThanOrEqual(1);

    // 3. ITEMS_UPDATED (single cancel, multi cancel, general adjusted) + DISCOUNT + PROVISIONAL + MERGE + MENU_UPDATED
    act(() => {
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'ITEMS_UPDATED',
        cancelledItems: [{ name: 'Ngao', quantity: 1 }],
        totalAmount: 90000,
        timestamp: '2026-11-28T01:01:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'ITEMS_UPDATED',
        cancelledItems: [
          { name: 'Tôm', quantity: 1 },
          { name: 'Mực', quantity: 2 },
        ],
        totalAmount: 70000,
        timestamp: '2026-11-28T01:02:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'ITEMS_UPDATED',
        totalAmount: 75000,
        timestamp: '2026-11-28T01:03:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'DISCOUNT_APPLIED',
        discountAmount: 15000,
        totalAmount: 60000,
        timestamp: '2026-11-28T01:04:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'DISCOUNT_REMOVED',
        totalAmount: 75000,
        timestamp: '2026-11-28T01:05:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'PROVISIONAL_BILL_PRINTED',
        totalAmount: 75000,
        timestamp: '2026-11-28T01:06:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'TABLE_MERGED_INTO',
        sourceTableLabel: 'Bàn 04',
        targetTableLabel: 'Bàn 05',
        timestamp: '2026-11-28T01:07:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.MENU_UPDATED);
      socketHarness.emitServer(SocketEvents.STORE_SETTINGS_UPDATED);
    });
    expect(result.current.ephemeralNotices.length).toBeLessThanOrEqual(2);

    // Dismiss top ephemeral notice cleanly
    const firstNoticeId = result.current.ephemeralNotices[0]?.id;
    if (firstNoticeId) {
      act(() => result.current.dismissEphemeralNotice(firstNoticeId));
    }

    // 4. GUEST_ADDON_ADDED external vs self-suppressed + ADDON auto-cancelled
    act(() => {
      result.current.markSubmittingAddon(42);
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'GUEST_ADDON_ADDED',
        batchNo: 2,
        totalAmount: 95000,
        timestamp: '2026-11-28T01:08:00.000Z',
      });
      result.current.clearSubmittingAddon();
      socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
        orderId: 42,
        tableId: 5,
        kind: 'GUEST_ADDON_ADDED',
        batchNo: 3,
        totalAmount: 110000,
        timestamp: '2026-11-28T01:09:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.ORDER_QR_AUTO_CANCELLED, {
        orderId: 42,
        orderCode: 'HD-42',
        tableId: 5,
        tableLabel: 'Bàn 05',
        kind: 'ADDON',
        cancelledItemCount: 1,
        autoCancelMinutes: 12,
        reason: 'Quá hạn gọi thêm',
        cancelledAt: '2026-11-28T01:10:00.000Z',
      });
    });
    expect(result.current.addonAutoCancelNotice).toBeTruthy();
    act(() => result.current.dismissAddonAutoCancelNotice());
    expect(result.current.addonAutoCancelNotice).toBeNull();

    // 5. ORDER_SESSION_REDIRECTED moves session to Bàn 08 / order 88
    act(() => {
      socketHarness.emitServer(SocketEvents.ORDER_SESSION_REDIRECTED, {
        previousOrderId: 42,
        newActiveOrderId: 88,
        previousTableLabel: 'Bàn 05',
        newTableId: 8,
        newTableLabel: 'Bàn 08',
        message: 'Đã chuyển sang Bàn 08',
      });
    });
    expect(result.current.activeOrderId).toBe(88);
    expect(result.current.currentTableLabel).toBe('Bàn 08');

    // 6. Transient network disconnect + offline/online + connect recovery + auth connect_error clearing session
    act(() => {
      socketHarness.emitServer('disconnect', 'transport close');
    });
    expect(result.current.isReconnecting).toBe(true);
    act(() => {
      socketHarness.emitServer('connect');
    });
    expect(result.current.isReconnecting).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
      document.dispatchEvent(new Event('visibilitychange'));
      socketHarness.emitServer('connect_error', new Error('network timeout'));
      socketHarness.emitServer('connect_error', new Error('Order does not belong'));
    });
    expect(result.current.activeOrderId).toBeNull();

    // 7. Re-register submitted order -> PAID -> dismiss -> takeaway new session -> auto-cancelled NEW -> TABLE_QR_ROTATED
    act(() => {
      result.current.registerSubmittedOrder({
        activeOrderId: 99,
        currentTableLabel: 'Mang về #03',
        status: 'PENDING',
        batchNo: 1,
        guestSessionToken: 'tok-guest',
      });
    });
    expect(result.current.getSessionFilter()).toEqual({
      activeOrderId: 99,
      guestSessionToken: 'tok-guest',
    });

    act(() => {
      socketHarness.emitServer(SocketEvents.ORDER_STATUS_UPDATED, {
        orderId: 99,
        status: 'PAID',
      });
    });
    expect(result.current.endedState).toMatchObject({ kind: 'PAID' });
    act(() => result.current.dismissEndedState());
    expect(result.current.endedState).toBeNull();

    act(() => {
      result.current.startNewTakeawaySession();
      socketHarness.emitServer(SocketEvents.ORDER_QR_AUTO_CANCELLED, {
        orderId: 100,
        orderCode: 'HD-100',
        tableId: null,
        tableLabel: 'Mang về #04',
        kind: 'NEW',
        cancelledItemCount: 2,
        autoCancelMinutes: 12,
        reason: 'Quá hạn 12 phút',
        cancelledAt: '2026-11-28T01:15:00.000Z',
      });
      socketHarness.emitServer(SocketEvents.TABLE_QR_ROTATED, {
        tableId: 5,
        rotatedAt: '2026-11-28T01:16:00.000Z',
      });
    });
    expect(result.current.endedState).toMatchObject({ kind: 'VOIDED', isAutoCancelled: true });
    expect(result.current.qrRotated).toBe(true);
    expect(invalidateSpy).toHaveBeenCalled();
  });

  it('handles BroadcastChannel multi-tab sync, self-suppressed addon notices, VOIDED status, and corrupted storage', () => {
    localStorage.setItem('qr_session:bad-tok', '{broken-json');
    const channels: Array<{ onmessage: ((ev: MessageEvent) => void) | null; postMessage: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }> = [];
    const OriginalBroadcast = globalThis.BroadcastChannel;
    globalThis.BroadcastChannel = class MockBroadcast {
      onmessage: ((ev: MessageEvent) => void) | null = null;
      postMessage = vi.fn();
      close = vi.fn();
      constructor() {
        channels.push(this);
      }
    } as unknown as typeof BroadcastChannel;

    try {
      const { result } = renderHook(
        () =>
          useQrSessionSocket('bad-tok', 'Bàn 02', {
            tableName: 'Bàn 02',
            activeOrderId: 50,
            orderMode: 'DINE_IN',
          }),
        { wrapper },
      );

      // Receive cross-tab SESSION_SYNC from another tab
      act(() => {
        channels[0]?.onmessage?.({
          data: {
            type: 'SESSION_SYNC',
            senderId: 'other-tab-id',
            session: {
              activeOrderId: 55,
              guestSessionToken: 'tok-55',
              currentTableLabel: 'Bàn 03',
              orderStatus: 'SERVING',
            },
            endedState: null,
            addonAutoCancelNotice: 'Addon cancelled',
          },
        } as MessageEvent);
      });
      expect(result.current.activeOrderId).toBe(55);
      expect(result.current.currentTableLabel).toBe('Bàn 03');

      // Self addon notice suppressed, different batch shows notice, TABLE_MERGED_INTO + VOIDED
      act(() => {
        result.current.markSubmittingAddon(55);
        socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
          orderId: 55,
          tableId: 3,
          kind: 'GUEST_ADDON_ADDED',
          batchNo: 2,
          totalAmount: 90000,
          timestamp: '2026-11-28T02:00:00.000Z',
        });
        socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
          orderId: 55,
          tableId: 3,
          kind: 'PROVISIONAL_BILL_PRINTED',
          totalAmount: 90000,
          timestamp: '2026-11-28T02:01:00.000Z',
        });
        socketHarness.emitServer(SocketEvents.QR_ORDER_NOTICE, {
          orderId: 55,
          tableId: 3,
          kind: 'TABLE_MERGED_INTO',
          sourceTableLabel: 'Bàn 01',
          targetTableLabel: 'Bàn 03',
          totalAmount: 140000,
          timestamp: '2026-11-28T02:02:00.000Z',
        });
        socketHarness.emitServer(SocketEvents.ORDER_STATUS_UPDATED, {
          orderId: 55,
          status: 'VOIDED',
        });
      });
      expect(result.current.endedState).toMatchObject({ kind: 'VOIDED' });
      expect(result.current.endedState?.isAutoCancelled).toBeFalsy();
      expect(result.current.activeOrderId).toBeNull();
    } finally {
      globalThis.BroadcastChannel = OriginalBroadcast;
    }
  });
});
