import {
  QrAutoCancelledPayloadSchema,
  QrOrderNoticePayloadSchema,
  QrTableRotatedPayloadSchema,
  SocketEvents,
  type OrderStatus,
} from '@fnb/shared';
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
  reason?: string;
  paidAt?: string;
}

export interface QrEphemeralNotice {
  id: string;
  variant: 'info' | 'success' | 'warning';
  title: string;
  createdAt: number;
}

export interface QrEndedState {
  kind: 'PAID' | 'VOIDED';
  title: string;
  reason?: string | null;
  isAutoCancelled?: boolean;
}

export interface QrSessionState {
  activeOrderId: number | null;
  guestSessionToken: string | null;
  currentTableLabel: string;
  orderStatus: OrderStatus | null;
}

interface StoredQrSession {
  activeOrderId: number | null;
  guestSessionToken: string | null;
  currentTableLabel: string;
}

interface TabSyncMessage {
  type: 'SESSION_SYNC';
  senderId: string;
  session: QrSessionState;
  endedState: QrEndedState | null;
  addonAutoCancelNotice: string | null;
}

const EPHEMERAL_AUTO_DISMISS_MS = 6000;
const MAX_EPHEMERAL_NOTICES = 2;
const NOTICE_DEDUPE_WINDOW_MS = 2000;
const SELF_SUBMIT_SUPPRESS_MS = 5000;

const getSessionKey = (qrToken: string) => `fnb_qr_session_${qrToken}`;
const getTabSyncChannelName = (qrToken: string) => `fnb_qr_tab_sync_${qrToken}`;

function formatVnd(amount: number | undefined | null): string {
  return `${Number(amount ?? 0).toLocaleString('vi-VN')} đ`;
}

function readStoredSession(qrToken: string): Partial<StoredQrSession> {
  const key = getSessionKey(qrToken);
  try {
    const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredQrSession & { orderStatus?: OrderStatus | null }>;
    if (!parsed.activeOrderId && (parsed.orderStatus === 'PAID' || parsed.orderStatus === 'VOIDED')) {
      return {
        activeOrderId: null,
        guestSessionToken: null,
        currentTableLabel: typeof parsed.currentTableLabel === 'string' ? parsed.currentTableLabel : '',
      };
    }
    return {
      activeOrderId: typeof parsed.activeOrderId === 'number' ? parsed.activeOrderId : null,
      guestSessionToken: typeof parsed.guestSessionToken === 'string' ? parsed.guestSessionToken : null,
      currentTableLabel: typeof parsed.currentTableLabel === 'string' ? parsed.currentTableLabel : '',
    };
  } catch {
    return {};
  }
}

function writeStoredSession(qrToken: string, state: StoredQrSession): void {
  const key = getSessionKey(qrToken);
  const minimal: StoredQrSession = {
    activeOrderId: state.activeOrderId,
    guestSessionToken: state.guestSessionToken,
    currentTableLabel: state.currentTableLabel,
  };
  try {
    const serialized = JSON.stringify(minimal);
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
  activeOrderTableLabel?: string | null;
  hasKitchenPrinted?: boolean;
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
  const tabIdRef = React.useRef<string>(`tab_${Math.random().toString(36).slice(2)}`);
  const broadcastChannelRef = React.useRef<BroadcastChannel | null>(null);
  const noticeTimersRef = React.useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const lastSeenNoticeRef = React.useRef<Map<string, number>>(new Map());
  const lastSelfSubmitRef = React.useRef<{ orderId: number; batchNo?: number; at: number } | null>(null);
  const redirectLockRef = React.useRef<{ orderId: number; tableLabel: string } | null>(null);
  const wasDisconnectedRef = React.useRef<boolean>(false);

  const [sessionState, setSessionState] = React.useState<QrSessionState>(() => ({
    activeOrderId: initialStored.activeOrderId ?? null,
    guestSessionToken: initialStored.guestSessionToken ?? null,
    currentTableLabel: initialStored.currentTableLabel ?? initialTableName ?? '',
    orderStatus: null,
  }));
  const [ephemeralNotices, setEphemeralNotices] = React.useState<QrEphemeralNotice[]>([]);
  const [endedState, setEndedState] = React.useState<QrEndedState | null>(null);
  const [addonAutoCancelNotice, setAddonAutoCancelNotice] = React.useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = React.useState<boolean>(() =>
    typeof navigator !== 'undefined' && navigator.onLine === false,
  );
  const [qrRotated, setQrRotated] = React.useState<boolean>(false);

  const endedStateRef = React.useRef<QrEndedState | null>(endedState);
  endedStateRef.current = endedState;
  const sessionStateRef = React.useRef<QrSessionState>(sessionState);
  sessionStateRef.current = sessionState;
  const endedOrderIdsRef = React.useRef<Set<number>>(new Set());

  React.useEffect(() => {
    staleCandidateOrderIdRef.current = readStoredSession(qrToken).activeOrderId ?? null;
    endedOrderIdsRef.current.clear();
  }, [qrToken]);

  const getSessionFilter = React.useCallback(() => {
    const cur = sessionStateRef.current;
    if (!cur.activeOrderId) return undefined;
    return {
      activeOrderId: cur.activeOrderId,
      ...(cur.guestSessionToken ? { guestSessionToken: cur.guestSessionToken } : {}),
    };
  }, []);

  const markOrderEnded = React.useCallback(
    (endedOrderId: number | null | undefined) => {
      if (typeof endedOrderId !== 'number') return;
      endedOrderIdsRef.current.add(endedOrderId);
      queryClient.removeQueries({
        queryKey: ['public-menu', qrToken],
        predicate: (query) => {
          if (query.getObserversCount() > 0) return false;
          const cached = query.state.data as { table?: { activeOrderId?: number | null } } | undefined;
          return cached?.table?.activeOrderId === endedOrderId;
        },
      });
    },
    [qrToken, queryClient],
  );

  const clearAllNoticeTimers = React.useCallback(() => {
    for (const timer of noticeTimersRef.current.values()) {
      clearTimeout(timer);
    }
    noticeTimersRef.current.clear();
  }, []);

  React.useEffect(() => clearAllNoticeTimers, [clearAllNoticeTimers]);

  const dismissEphemeralNotice = React.useCallback((id: string) => {
    const existingTimer = noticeTimersRef.current.get(id);
    if (existingTimer) {
      clearTimeout(existingTimer);
      noticeTimersRef.current.delete(id);
    }
    setEphemeralNotices((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushEphemeralNotice = React.useCallback(
    (input: { dedupeKey: string; variant: QrEphemeralNotice['variant']; title: string }) => {
      const now = Date.now();
      const prevTime = lastSeenNoticeRef.current.get(input.dedupeKey);
      if (prevTime !== undefined && now - prevTime < NOTICE_DEDUPE_WINDOW_MS) {
        return;
      }
      lastSeenNoticeRef.current.set(input.dedupeKey, now);

      const id = `notice_${now}_${Math.random().toString(36).slice(2, 7)}`;
      const entry: QrEphemeralNotice = {
        id,
        variant: input.variant,
        title: input.title,
        createdAt: now,
      };

      setEphemeralNotices((prev) => {
        const next = [...prev, entry];
        while (next.length > MAX_EPHEMERAL_NOTICES) {
          const evicted = next.shift();
          if (evicted) {
            const t = noticeTimersRef.current.get(evicted.id);
            if (t) {
              clearTimeout(t);
              noticeTimersRef.current.delete(evicted.id);
            }
          }
        }
        return next;
      });

      const timer = setTimeout(() => {
        noticeTimersRef.current.delete(id);
        setEphemeralNotices((prev) => prev.filter((item) => item.id !== id));
      }, EPHEMERAL_AUTO_DISMISS_MS);
      noticeTimersRef.current.set(id, timer);
    },
    [],
  );

  const postTabSync = React.useCallback(
    (nextSession: QrSessionState, nextEnded: QrEndedState | null, nextAddonNotice: string | null) => {
      const channel = broadcastChannelRef.current;
      if (!channel) return;
      try {
        const message: TabSyncMessage = {
          type: 'SESSION_SYNC',
          senderId: tabIdRef.current,
          session: nextSession,
          endedState: nextEnded,
          addonAutoCancelNotice: nextAddonNotice,
        };
        channel.postMessage(message);
      } catch {
        // Ignore broadcast failure
      }
    },
    [],
  );

  const commitSessionState = React.useCallback(
    (
      updater: QrSessionState | ((prev: QrSessionState) => QrSessionState | null),
      options?: { persist?: boolean; syncTabs?: { endedState: QrEndedState | null; addonNotice: string | null } },
    ) => {
      const prev = sessionStateRef.current;
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (!next) return prev;
      sessionStateRef.current = next;
      setSessionState(next);
      if (options?.persist) {
        writeStoredSession(qrToken, next);
      }
      if (options?.syncTabs) {
        postTabSync(next, options.syncTabs.endedState, options.syncTabs.addonNotice);
      }
      return next;
    },
    [qrToken, postTabSync],
  );

  const syncTableSnapshot = React.useCallback(
    (tableName?: string, snapshot?: ServerQrTableSnapshot) => {
      const lock = redirectLockRef.current;
      if (lock && snapshot?.activeOrderId === lock.orderId && snapshot.activeOrderTableLabel === lock.tableLabel) {
        redirectLockRef.current = null;
      }
      const isLockedToStaleLabel = Boolean(
        lock &&
          snapshot?.activeOrderId === lock.orderId &&
          snapshot.activeOrderTableLabel !== lock.tableLabel,
      );

      if (tableName) {
        commitSessionState(
          (prev) => {
            const shouldSetTakeawayLabel =
              snapshot?.orderMode === 'TAKEAWAY' &&
              tableName !== prev.currentTableLabel &&
              (Boolean(snapshot.activeOrderId) || prev.activeOrderId === null);
            const shouldSetMovedLabel =
              !isLockedToStaleLabel &&
              snapshot?.activeOrderTableLabel &&
              snapshot.activeOrderTableLabel !== prev.currentTableLabel &&
              snapshot.activeOrderId === prev.activeOrderId;
            const nextLabel = shouldSetMovedLabel
              ? snapshot.activeOrderTableLabel!
              : !prev.currentTableLabel || shouldSetTakeawayLabel
                ? tableName
                : prev.currentTableLabel;

            if (nextLabel !== prev.currentTableLabel) {
              return { ...prev, currentTableLabel: nextLabel };
            }
            return null;
          },
          { persist: true },
        );
      }

      if (!snapshot) return;

      // Sync same-order status updates (PENDING vs SERVING) from server snapshot
      if (
        snapshot.activeOrderId &&
        snapshot.activeOrderId === sessionStateRef.current.activeOrderId &&
        snapshot.activeOrderStatus &&
        snapshot.activeOrderStatus !== sessionStateRef.current.orderStatus
      ) {
        commitSessionState((prev) => ({
          ...prev,
          currentTableLabel: isLockedToStaleLabel
            ? prev.currentTableLabel
            : snapshot.activeOrderTableLabel || tableName || prev.currentTableLabel,
          orderStatus: snapshot.activeOrderStatus ?? prev.orderStatus,
        }));
      }

      // Sync DINE_IN table active order in BOTH directions (idle guest catches new order + active guest clears finished order)
      if (snapshot.orderMode !== 'TAKEAWAY') {
        const latestSession = sessionStateRef.current;
        if (
          snapshot.activeOrderId &&
          snapshot.activeOrderId !== latestSession.activeOrderId &&
          !endedOrderIdsRef.current.has(snapshot.activeOrderId)
        ) {
          if (endedStateRef.current === null) {
            staleCandidateOrderIdRef.current = null;
            commitSessionState(
              (prev) => ({
                ...prev,
                activeOrderId: snapshot.activeOrderId ?? null,
                guestSessionToken: null,
                currentTableLabel: isLockedToStaleLabel
                  ? prev.currentTableLabel
                  : snapshot.activeOrderTableLabel || tableName || prev.currentTableLabel,
                orderStatus: snapshot.activeOrderStatus ?? null,
              }),
              { persist: true },
            );
          }
          return;
        }

        const staleOrderId = staleCandidateOrderIdRef.current;
        const isDineInEndedOnServer =
          latestSession.activeOrderId !== null &&
          snapshot.queriedOrderId === latestSession.activeOrderId &&
          snapshot.activeOrderId === null;
        const sameTableAndStale =
          staleOrderId !== null &&
          snapshot.tableName === latestSession.currentTableLabel &&
          snapshot.activeOrderId !== staleOrderId &&
          staleOrderId === latestSession.activeOrderId;
        if (sameTableAndStale || isDineInEndedOnServer) {
          if (
            latestSession.activeOrderId !== null &&
            snapshot.activeOrderId !== latestSession.activeOrderId
          ) {
            markOrderEnded(latestSession.activeOrderId);
          }
          staleCandidateOrderIdRef.current = null;
          commitSessionState(
            (prev) => ({
              ...prev,
              activeOrderId: snapshot.activeOrderId ?? null,
              guestSessionToken: snapshot.activeOrderId ? prev.guestSessionToken : null,
              currentTableLabel: tableName || prev.currentTableLabel,
              orderStatus: snapshot.activeOrderStatus ?? null,
            }),
            { persist: true },
          );
        }
        return;
      }

      // TAKEAWAY snapshot reconciliation
      const latestTakeawaySession = sessionStateRef.current;
      const isTakeawayEndedOnServer =
        snapshot.orderMode === 'TAKEAWAY' &&
        latestTakeawaySession.activeOrderId !== null &&
        snapshot.queriedOrderId === latestTakeawaySession.activeOrderId &&
        snapshot.activeOrderId === null;
      const staleOrderId = staleCandidateOrderIdRef.current;
      const isStaleTakeaway =
        isTakeawayEndedOnServer ||
        (staleOrderId !== null &&
          snapshot.activeOrderId !== staleOrderId &&
          staleOrderId === latestTakeawaySession.activeOrderId);
      if (!isStaleTakeaway) return;

      if (
        latestTakeawaySession.activeOrderId !== null &&
        snapshot.activeOrderId !== latestTakeawaySession.activeOrderId
      ) {
        markOrderEnded(latestTakeawaySession.activeOrderId);
      }
      staleCandidateOrderIdRef.current = null;
      commitSessionState(
        (prev) => ({
          ...prev,
          activeOrderId: snapshot.activeOrderId ?? null,
          guestSessionToken: snapshot.activeOrderId ? prev.guestSessionToken : null,
          currentTableLabel: tableName || prev.currentTableLabel,
          orderStatus: snapshot.activeOrderStatus ?? null,
        }),
        { persist: true },
      );
    },
    [qrToken, commitSessionState, markOrderEnded],
  );

  React.useEffect(() => {
    syncTableSnapshot(initialTableName, serverTableSnapshot);
  }, [
    syncTableSnapshot,
    initialTableName,
    serverTableSnapshot?.tableName,
    serverTableSnapshot?.activeOrderId,
    serverTableSnapshot?.activeOrderStatus,
    serverTableSnapshot?.activeOrderTableLabel,
    serverTableSnapshot?.orderMode,
  ]);

  const markSubmittingAddon = React.useCallback((orderId?: number | null) => {
    if (typeof orderId === 'number') {
      lastSelfSubmitRef.current = { orderId, at: Date.now() };
    }
  }, []);

  const clearSubmittingAddon = React.useCallback(() => {
    lastSelfSubmitRef.current = null;
  }, []);

  const registerSubmittedOrder = React.useCallback(
    (payload: {
      activeOrderId: number;
      currentTableLabel: string;
      status: OrderStatus;
      batchNo?: number;
      guestSessionToken?: string | null;
    }) => {
      staleCandidateOrderIdRef.current = null;
      lastSelfSubmitRef.current = {
        orderId: payload.activeOrderId,
        batchNo: payload.batchNo ?? 1,
        at: Date.now(),
      };
      setEndedState(null);
      setAddonAutoCancelNotice(null);
      redirectLockRef.current = null;
      commitSessionState(
        (prev) => ({
          ...prev,
          activeOrderId: payload.activeOrderId,
          guestSessionToken: payload.guestSessionToken ?? prev.guestSessionToken,
          currentTableLabel: payload.currentTableLabel,
          orderStatus: payload.status,
        }),
        { persist: true, syncTabs: { endedState: null, addonNotice: null } },
      );
    },
    [commitSessionState],
  );

  const startNewOrderSession = React.useCallback(
    (defaultLabel?: string) => {
      staleCandidateOrderIdRef.current = null;
      redirectLockRef.current = null;
      const fallbackLabel =
        defaultLabel || initialTableName || sessionStateRef.current.currentTableLabel || '';
      const next: QrSessionState = {
        activeOrderId: null,
        guestSessionToken: null,
        currentTableLabel: fallbackLabel,
        orderStatus: null,
      };
      setEndedState(null);
      setAddonAutoCancelNotice(null);
      commitSessionState(next, { persist: true, syncTabs: { endedState: null, addonNotice: null } });
      void queryClient.invalidateQueries({ queryKey: ['public-menu', qrToken] });
    },
    [qrToken, initialTableName, queryClient, commitSessionState],
  );

  const startNewTakeawaySession = React.useCallback(() => {
    startNewOrderSession('Mang về');
  }, [startNewOrderSession]);

  // Multi-tab same-device synchronization (RT-28)
  React.useEffect(() => {
    if (!qrToken || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(getTabSyncChannelName(qrToken));
      broadcastChannelRef.current = channel;
      channel.onmessage = (event: MessageEvent<TabSyncMessage>) => {
        const msg = event.data;
        if (!msg || msg.type !== 'SESSION_SYNC' || msg.senderId === tabIdRef.current) return;
        staleCandidateOrderIdRef.current = null;
        commitSessionState(msg.session, { persist: true });
        setEndedState(msg.endedState);
        setAddonAutoCancelNotice(msg.addonAutoCancelNotice);
        void queryClient.invalidateQueries({ queryKey: ['public-menu', qrToken] });
      };
    } catch {
      broadcastChannelRef.current = null;
    }
    return () => {
      broadcastChannelRef.current = null;
      try {
        channel?.close();
      } catch {
        // Ignore close errors
      }
    };
  }, [qrToken, queryClient]);

  // Realtime WebSocket subscription + reconnect / offline / visibilitychange handlers
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
    const invalidateStoreSettings = () => {
      void queryClient.invalidateQueries({ queryKey: STORE_SETTINGS_QUERY_KEY });
    };

    const handleConnect = () => {
      setIsReconnecting(false);
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        invalidatePublicMenu();
        invalidateStoreSettings();
      }
    };

    const handleDisconnect = (reason?: string) => {
      if (reason === 'io client disconnect') return;
      wasDisconnectedRef.current = true;
      setIsReconnecting(true);
    };

    const handleSessionRedirected = (raw: unknown) => {
      const payload = raw as QrSessionRedirectPayload;
      if (!payload || typeof payload.newActiveOrderId !== 'number') return;

      staleCandidateOrderIdRef.current = null;
      const fallbackNotice = resolveCachedAppMessage('qr.status.redirectFallback', {
        tableLabel: payload.newTableLabel,
      });
      const title = fallbackNotice.isOverridden
        ? fallbackNotice.title
        : payload.message || fallbackNotice.title;

      pushEphemeralNotice({
        dedupeKey: `redirect:${payload.previousOrderId}->${payload.newActiveOrderId}`,
        variant: 'warning',
        title,
      });

      if (payload.newTableLabel) {
        redirectLockRef.current = {
          orderId: payload.newActiveOrderId,
          tableLabel: payload.newTableLabel,
        };
      }
      commitSessionState(
        (prev) => ({
          ...prev,
          activeOrderId: payload.newActiveOrderId,
          currentTableLabel: payload.newTableLabel || prev.currentTableLabel,
        }),
        { persist: true },
      );
      invalidatePublicMenu();
    };

    const handleStatusUpdated = (raw: unknown) => {
      const payload = raw as QrOrderStatusUpdatedPayload;
      if (!payload || !payload.status) return;

      if (payload.status === 'SERVING') {
        const isPreKitchenApproval =
          typeof payload.message === 'string' && payload.message.includes('chờ chuyển xuống bếp');
        if (isPreKitchenApproval) {
          pushEphemeralNotice({
            dedupeKey: `approved:${payload.orderId ?? sessionStateRef.current.activeOrderId ?? 'cur'}`,
            variant: 'info',
            title: payload.message || 'Quầy đã xác nhận đơn, đang chờ chuyển xuống bếp',
          });
        } else if (payload.message) {
          const resolvedServing = resolveCachedAppMessage('qr.status.orderServingShort');
          pushEphemeralNotice({
            dedupeKey: `serving:${payload.orderId ?? sessionStateRef.current.activeOrderId ?? 'cur'}`,
            variant: 'success',
            title: resolvedServing.isOverridden ? resolvedServing.title : payload.message,
          });
        }
        setEndedState(null);
        setAddonAutoCancelNotice(null);
        commitSessionState((prev) => ({ ...prev, orderStatus: 'SERVING' }));
        invalidatePublicMenu();
        return;
      }

      if (payload.status === 'PAID' || payload.status === 'VOIDED') {
        staleCandidateOrderIdRef.current = null;
        const prev = sessionStateRef.current;
        markOrderEnded(payload.orderId ?? prev.activeOrderId);
        const statusKey = payload.status === 'PAID' ? 'qr.status.orderPaid' : 'qr.status.orderVoided';
        const resolved = resolveCachedAppMessage(statusKey);
        const reason =
          payload.status === 'VOIDED'
            ? (payload.reason?.trim() ||
              (payload.message && payload.message !== resolved.title ? payload.message : null))
            : null;
        const nextEnded: QrEndedState = {
          kind: payload.status,
          title: resolved.title,
          ...(reason ? { reason } : {}),
        };

        const shouldResetTakeawayLabel = prev.currentTableLabel.startsWith('Mang về');
        const nextSession: QrSessionState = {
          activeOrderId: null,
          guestSessionToken: null,
          currentTableLabel: shouldResetTakeawayLabel ? 'Mang về' : prev.currentTableLabel,
          orderStatus: null,
        };
        setAddonAutoCancelNotice(null);
        setEndedState(nextEnded);
        commitSessionState(nextSession, {
          persist: true,
          syncTabs: { endedState: nextEnded, addonNotice: null },
        });
        invalidatePublicMenu();
      }
    };

    const handleQrOrderNotice = (raw: unknown) => {
      const parsed = QrOrderNoticePayloadSchema.safeParse(raw);
      if (!parsed.success) return;
      const payload = parsed.data;

      if (payload.kind === 'GUEST_ORDER_CREATED') {
        if (endedStateRef.current === null && sessionStateRef.current.activeOrderId === null) {
          staleCandidateOrderIdRef.current = null;
          commitSessionState(
            (prev) => ({
              ...prev,
              activeOrderId: payload.orderId,
              orderStatus: payload.orderStatus ?? 'PENDING',
            }),
            { persist: true },
          );
        }
        invalidatePublicMenu();
        return;
      }

      if (payload.kind === 'GUEST_ADDON_ADDED') {
        const selfSubmit = lastSelfSubmitRef.current;
        const isSelfAction =
          selfSubmit !== null &&
          selfSubmit.orderId === payload.orderId &&
          (selfSubmit.batchNo === undefined || selfSubmit.batchNo === (payload.batchNo ?? 1)) &&
          Date.now() - selfSubmit.at < SELF_SUBMIT_SUPPRESS_MS;
        if (!isSelfAction) {
          pushEphemeralNotice({
            dedupeKey: `addon:${payload.orderId}:${payload.batchNo ?? 0}:${payload.timestamp}`,
            variant: 'info',
            title: resolveCachedAppMessage('qr.notice.guestAddonAdded', {
              batchNo: payload.batchNo ?? 2,
            }).title,
          });
        }
        invalidatePublicMenu();
        return;
      }

      if (payload.kind === 'ITEMS_UPDATED') {
        const cancelled = payload.cancelledItems ?? [];
        if (cancelled.length === 1) {
          pushEphemeralNotice({
            dedupeKey: `items:${payload.orderId}:${payload.timestamp}`,
            variant: 'warning',
            title: resolveCachedAppMessage('qr.notice.itemCancelled', {
              qty: cancelled[0].quantity,
              itemName: cancelled[0].name,
            }).title,
          });
        } else if (cancelled.length > 1) {
          const summary = cancelled.map((c) => `${c.quantity} × ${c.name}`).join(', ');
          pushEphemeralNotice({
            dedupeKey: `items:${payload.orderId}:${payload.timestamp}`,
            variant: 'warning',
            title: `Quầy đã huỷ: ${summary}`,
          });
        } else {
          pushEphemeralNotice({
            dedupeKey: `items:${payload.orderId}:${payload.timestamp}`,
            variant: 'info',
            title: resolveCachedAppMessage('qr.notice.itemsAdjusted', {
              total: formatVnd(payload.totalAmount),
            }).title,
          });
        }
        invalidatePublicMenu();
        return;
      }

      if (payload.kind === 'DISCOUNT_APPLIED') {
        pushEphemeralNotice({
          dedupeKey: `discount_on:${payload.orderId}:${payload.timestamp}`,
          variant: 'success',
          title: resolveCachedAppMessage('qr.notice.discountApplied', {
            discountAmount: formatVnd(payload.discountAmount),
            total: formatVnd(payload.totalAmount),
          }).title,
        });
        invalidatePublicMenu();
        return;
      }

      if (payload.kind === 'DISCOUNT_REMOVED') {
        pushEphemeralNotice({
          dedupeKey: `discount_off:${payload.orderId}:${payload.timestamp}`,
          variant: 'info',
          title: resolveCachedAppMessage('qr.notice.discountRemoved', {
            total: formatVnd(payload.totalAmount),
          }).title,
        });
        invalidatePublicMenu();
        return;
      }

      if (payload.kind === 'PROVISIONAL_BILL_PRINTED') {
        pushEphemeralNotice({
          dedupeKey: `provisional:${payload.orderId}:${payload.timestamp}`,
          variant: 'info',
          title: resolveCachedAppMessage('qr.notice.provisionalPrinted', {
            total: formatVnd(payload.totalAmount),
          }).title,
        });
        return;
      }

      if (payload.kind === 'TABLE_MERGED_INTO') {
        const currentOrderId = sessionStateRef.current.activeOrderId;
        if (currentOrderId !== null && payload.orderId !== currentOrderId) {
          return;
        }
        pushEphemeralNotice({
          dedupeKey: `merged_into:${payload.orderId}:${payload.sourceTableLabel ?? ''}:${payload.timestamp}`,
          variant: 'warning',
          title: resolveCachedAppMessage('qr.notice.tableMergedInto', {
            sourceTable: payload.sourceTableLabel ?? 'Bàn khác',
            targetTable: payload.targetTableLabel ?? 'bàn hiện tại',
          }).title,
        });
        invalidatePublicMenu();
      }
    };

    const handleTableQrRotated = (raw: unknown) => {
      const parsed = QrTableRotatedPayloadSchema.safeParse(raw);
      if (!parsed.success) return;
      staleCandidateOrderIdRef.current = null;
      setQrRotated(true);
      const next: QrSessionState = {
        activeOrderId: null,
        guestSessionToken: null,
        currentTableLabel: sessionStateRef.current.currentTableLabel,
        orderStatus: null,
      };
      setSessionState(next);
      writeStoredSession(qrToken, next);
    };

    const handleMenuUpdated = () => {
      pushEphemeralNotice({
        dedupeKey: 'menu_updated',
        variant: 'info',
        title: resolveCachedAppMessage('qr.notice.menuUpdated').title,
      });
      invalidatePublicMenu();
    };

    const handleStoreSettingsUpdated = () => {
      invalidateStoreSettings();
      invalidatePublicMenu();
    };

    const handleQrAutoCancelled = (raw: unknown) => {
      const parsed = QrAutoCancelledPayloadSchema.safeParse(raw);
      if (!parsed.success) return;
      const minutes = parsed.data.autoCancelMinutes;
      const messageKey =
        parsed.data.kind === 'NEW' ? 'qr.status.orderAutoCancelled' : 'qr.status.addonAutoCancelled';
      const resolved = resolveCachedAppMessage(messageKey, { minutes });
      const title = resolved.title || parsed.data.reason;

      if (parsed.data.kind === 'NEW') {
        staleCandidateOrderIdRef.current = null;
        const prev = sessionStateRef.current;
        markOrderEnded(parsed.data.orderId ?? prev.activeOrderId);
        const nextEnded: QrEndedState = {
          kind: 'VOIDED',
          title,
          reason: parsed.data.reason,
          isAutoCancelled: true,
        };
        const next: QrSessionState = {
          activeOrderId: null,
          guestSessionToken: null,
          currentTableLabel: prev.currentTableLabel.startsWith('Mang về')
            ? 'Mang về'
            : prev.currentTableLabel,
          orderStatus: null,
        };
        setAddonAutoCancelNotice(null);
        setEndedState(nextEnded);
        commitSessionState(next, {
          persist: true,
          syncTabs: { endedState: nextEnded, addonNotice: null },
        });
      } else {
        setAddonAutoCancelNotice(title);
      }
      invalidatePublicMenu();
    };

    const handleConnectError = (err?: unknown) => {
      const errMessage =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message?: unknown }).message ?? '')
            : '';
      const isAuthRejection =
        /unauthorized|forbidden|invalid|not belong|unknown qr/i.test(errMessage);
      if (!isAuthRejection) {
        wasDisconnectedRef.current = true;
        setIsReconnecting(true);
        return;
      }
      if (sessionStateRef.current.activeOrderId === null) return;
      staleCandidateOrderIdRef.current = null;
      commitSessionState(
        (prev) => ({
          activeOrderId: null,
          guestSessionToken: null,
          currentTableLabel: prev.currentTableLabel,
          orderStatus: null,
        }),
        { persist: true },
      );
      invalidatePublicMenu();
    };

    const handleWindowOffline = () => {
      wasDisconnectedRef.current = true;
      setIsReconnecting(true);
    };

    const handleWindowOnline = () => {
      if (!socket.connected) {
        socket.connect();
      } else {
        setIsReconnecting(false);
      }
      invalidatePublicMenu();
      invalidateStoreSettings();
    };

    const handleVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      if (!socket.connected) {
        wasDisconnectedRef.current = true;
        socket.connect();
      }
      invalidatePublicMenu();
      invalidateStoreSettings();
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
    socket.on(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);
    socket.on(SocketEvents.QR_ORDER_NOTICE, handleQrOrderNotice);
    socket.on(SocketEvents.TABLE_QR_ROTATED, handleTableQrRotated);
    socket.on(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
    socket.on(SocketEvents.MENU_UPDATED, handleMenuUpdated);
    socket.on(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);

    if (typeof window !== 'undefined') {
      window.addEventListener('offline', handleWindowOffline);
      window.addEventListener('online', handleWindowOnline);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off(SocketEvents.ORDER_SESSION_REDIRECTED, handleSessionRedirected);
      socket.off(SocketEvents.ORDER_STATUS_UPDATED, handleStatusUpdated);
      socket.off(SocketEvents.QR_ORDER_NOTICE, handleQrOrderNotice);
      socket.off(SocketEvents.TABLE_QR_ROTATED, handleTableQrRotated);
      socket.off(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleQrAutoCancelled);
      socket.off(SocketEvents.MENU_UPDATED, handleMenuUpdated);
      socket.off(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
      if (typeof window !== 'undefined') {
        window.removeEventListener('offline', handleWindowOffline);
        window.removeEventListener('online', handleWindowOnline);
      }
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      disconnectPosSocket('qr_guest');
    };
  }, [
    qrToken,
    sessionState.activeOrderId,
    sessionState.guestSessionToken,
    queryClient,
    commitSessionState,
    markOrderEnded,
    pushEphemeralNotice,
  ]);

  const dismissAddonAutoCancelNotice = React.useCallback(() => {
    setAddonAutoCancelNotice(null);
  }, []);

  const dismissEndedState = React.useCallback(() => {
    setEndedState(null);
  }, []);

  return {
    ...sessionState,
    ephemeralNotices,
    endedState,
    addonAutoCancelNotice,
    isReconnecting,
    qrRotated,
    dismissEphemeralNotice,
    dismissAddonAutoCancelNotice,
    dismissEndedState,
    markSubmittingAddon,
    clearSubmittingAddon,
    registerSubmittedOrder,
    startNewOrderSession,
    startNewTakeawaySession,
    syncTableSnapshot,
    getSessionFilter,
  };
}
