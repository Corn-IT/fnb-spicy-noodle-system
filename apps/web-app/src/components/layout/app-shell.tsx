import { PosTableGridResponseSchema, QrAutoCancelledPayloadSchema, SocketEvents, type PosTableGridResponse } from '@fnb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, WifiOff } from 'lucide-react';
import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import { AiAssistantDrawer } from '@/components/ai-assistant';
import { CommandPalette } from '@/components/layout/command-palette';
import {
  APP_NAVIGATION_ROUTES,
  getAccessibleRoutes,
} from '@/lib/app-navigation';
import { MobileAudioActivationBanner } from '@/components/layout/mobile-alert-controls';
import { MobileSidebarNav, ResizableSidebar, TabletIconRail } from '@/components/layout/resizable-sidebar';
import { TopNavbar } from '@/components/layout/top-navbar';
import { clearPendingNavigation, TopProgressBar } from '@/components/loading';
import {
  findTouchRouteMeta,
  isPosLiveBoardPath,
  isPosTouchShellPath,
  TOUCH_PATHS,
} from '@/components/touch-shell';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useDisplayScale } from '@/hooks/use-display-scale';
import { useMobileOrderAlertLifecycle } from '@/hooks/use-mobile-order-alerts';
import { resolveNavLabel, useStoreSettings } from '@/hooks/use-store-settings';
import { useSyncAccountPreferencesOnFocus } from '@/hooks/use-sync-account-preferences-on-focus';
import { apiClient } from '@/lib/api-client';
import { POS_TABLE_GRID_QUERY_KEY } from '@/lib/pos-table-grid-query';
import {
  useQrPendingReminderMonitor,
  collectPendingQrItems,
} from '@/lib/qr-pending-reminder';
import { enqueueQrVoiceAlert } from '@/lib/qr-voice-announcer';
import { startIdleRouteChunkWarmup } from '@/lib/route-prefetch';
import { getCurrentBrowserPushSubscription } from '@/lib/web-push-client';
import { usePosSocketContext } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

interface QrSocketAlertPayload {
  orderId?: number;
  tableLabel?: string;
  batchNo?: number;
}

const RECENT_ORDER_ALERT_DEDUP_MS = 10_000;
const recentOrderAlertSeen = new Map<string, number>();

export function resetAppShellOrderAlertDedupForTesting(): void {
  recentOrderAlertSeen.clear();
}

export function shouldEmitDeduplicatedOrderAlert(dedupKey: string): boolean {
  const now = Date.now();
  const last = recentOrderAlertSeen.get(dedupKey);
  if (last !== undefined && now - last < RECENT_ORDER_ALERT_DEDUP_MS) {
    return false;
  }
  recentOrderAlertSeen.set(dedupKey, now);
  if (recentOrderAlertSeen.size > 100) {
    for (const [k, ts] of recentOrderAlertSeen.entries()) {
      if (now - ts >= RECENT_ORDER_ALERT_DEDUP_MS) {
        recentOrderAlertSeen.delete(k);
      }
    }
  }
  return true;
}

function triggerBackgroundTabBrowserNotification(params: {
  title: string;
  body: string;
  tag: string;
}): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isBackgroundOrUnfocused =
    document.visibilityState === 'hidden' ||
    (typeof document.hasFocus === 'function' && !document.hasFocus());
  if (!isBackgroundOrUnfocused) return;
  if (!('Notification' in window) || window.Notification.permission !== 'granted') return;

  // Skip if Web Push subscription is already active (Service Worker push handles background alerts)
  void getCurrentBrowserPushSubscription()
    .then((sub) => {
      if (sub) return;
      try {
        const n = new window.Notification(params.title, {
          body: params.body,
          tag: params.tag,
          icon: '/images/logo-icon-square.png',
        });
        n.onclick = () => {
          try {
            window.focus();
            n.close();
          } catch {
            // Ignore focus error
          }
        };
      } catch {
        // Ignore browsers that disallow direct Notification constructor
      }
    })
    .catch(() => undefined);
}

export function AppShell() {
  useSyncAccountPreferencesOnFocus();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useStoreSettings();
  const { notify } = useAppMessages();
  const notifyRef = React.useRef(notify);
  notifyRef.current = notify;
  const { socket } = usePosSocketContext();
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const canReceivePosAlerts = Boolean(user?.isSuperAdmin || user?.permissions.pos?.view);

  const [commandOpen, setCommandOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [isBrowserOnline, setIsBrowserOnline] = React.useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
  );
  const [isSocketDisconnected, setIsSocketDisconnected] = React.useState<boolean>(false);
  const [isResyncingAfterWake, setIsResyncingAfterWake] = React.useState<boolean>(false);

  // Chỉ màn bán hàng POS trực tiếp (`/pos` và `/pos/touch`) có `usePosWorkspace` nghe socket QR.
  // Các màn con trong Touch Shell (`/pos/touch/hub`, `/pos/touch/invoices`...) vẫn cần AppShell
  // phát giọng đọc QR mới và hiện banner đỏ cảnh báo đơn QR quá hạn.
  const isPosLiveBoardRoute = isPosLiveBoardPath(location.pathname);
  // Toàn bộ nhánh Touch Shell (`/pos/touch` và `/pos/touch/*`) chạy kiểu "trình chiếu":
  // ẩn sidebar, navbar, command palette. Chỉ áp dụng khi tài khoản xem được POS; nếu không (403),
  // giữ sidebar/navbar để người dùng còn đường sang màn khác hoặc đăng xuất.
  const isPosTouchRoute =
    canReceivePosAlerts && isPosTouchShellPath(location.pathname);
  useDisplayScale(location.pathname);

  const globalTableGridQuery = useQuery<PosTableGridResponse | null>({
    queryKey: POS_TABLE_GRID_QUERY_KEY,
    queryFn: async () => {
      try {
        const raw = await apiClient.get<unknown>('/api/v1/pos/tables');
        const parsed = PosTableGridResponseSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
    enabled: Boolean(accessToken && canReceivePosAlerts),
    retry: false,
    staleTime: 10_000,
    refetchInterval: isSocketDisconnected ? 12_000 : 25_000,
  });

  // Pause client-side overdue reminders while offline, socket disconnected, or resyncing after
  // phone wake-up so stale cached PENDING tables never trigger false reminders for already-printed orders.
  const canEvaluateOverdueReminders = Boolean(
    accessToken &&
      canReceivePosAlerts &&
      isBrowserOnline &&
      !isSocketDisconnected &&
      !globalTableGridQuery.isFetching &&
      !isResyncingAfterWake,
  );

  const overdueQrItems = useQrPendingReminderMonitor(
    globalTableGridQuery.data,
    canEvaluateOverdueReminders,
  );

  // When phone wakes up from lock screen / background tab, force-refetch live table grid
  // before re-enabling client-side overdue reminders, then read ONE catch-up announcement
  // covering every order that is STILL waiting for confirmation (including overdue ones).
  const knownPendingQrKeysRef = React.useRef<Set<string> | null>(null);
  const hiddenAtMsRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (!accessToken || !canReceivePosAlerts || typeof document === 'undefined') return;
    let active = true;
    const WAKE_CATCH_UP_MIN_HIDDEN_MS = 20_000;
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') {
        if (hiddenAtMsRef.current === null) hiddenAtMsRef.current = Date.now();
        return;
      }
      const hiddenMs = hiddenAtMsRef.current === null ? 0 : Date.now() - hiddenAtMsRef.current;
      hiddenAtMsRef.current = null;
      setIsResyncingAfterWake(true);
      void queryClient
        .refetchQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY })
        .then(() => {
          if (!active) return;
          const grid = queryClient.getQueryData<PosTableGridResponse | null>(
            POS_TABLE_GRID_QUERY_KEY,
          );
          const pending = collectPendingQrItems(grid);
          // Mark everything currently pending as known so the diff detector never repeats it.
          knownPendingQrKeysRef.current = new Set(pending.map((item) => item.key));
          if (hiddenMs < WAKE_CATCH_UP_MIN_HIDDEN_MS || pending.length === 0) return;
          if (pending.length === 1) {
            const only = pending[0]!;
            void enqueueQrVoiceAlert({
              tableLabel: only.tableLabel,
              kind: only.kind,
              orderCode: only.orderCode,
            });
          } else {
            void enqueueQrVoiceAlert({
              tableLabel: pending.map((item) => item.tableLabel).join(', '),
              kind: pending[0]!.kind,
              isReminder: true,
              reminderTables: pending.map((item) => ({
                tableLabel: item.tableLabel,
                kind: item.kind,
              })),
            });
          }
        })
        .finally(() => {
          if (active) setIsResyncingAfterWake(false);
        });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [accessToken, canReceivePosAlerts, queryClient]);

  // Track browser online/offline state and auto-resync queries upon recovery
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => {
      setIsBrowserOnline(true);
      void queryClient.invalidateQueries();
    };
    const handleOffline = () => {
      setIsBrowserOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient]);

  // Track realtime Socket disconnect / server crash and auto-resync upon reconnect
  React.useEffect(() => {
    if (!socket) {
      setIsSocketDisconnected(false);
      return;
    }
    const handleConnect = () => {
      setIsSocketDisconnected(false);
      void queryClient.invalidateQueries();
    };
    const handleDisconnect = () => {
      setIsSocketDisconnected(true);
    };
    const handleConnectError = () => {
      setIsSocketDisconnected(true);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
    };
  }, [socket, queryClient]);

  React.useEffect(() => {
    clearPendingNavigation();
  }, [location.pathname]);

  React.useEffect(() => {
    if (!accessToken || !user) return;
    const accessiblePaths = getAccessibleRoutes(user).map((route) => route.path);
    return startIdleRouteChunkWarmup(accessiblePaths);
  }, [accessToken, user]);

  React.useEffect(() => {
    const touchMeta = findTouchRouteMeta(location.pathname);
    if (touchMeta) {
      const resolvedLabel = touchMeta.navLabelPath
        ? resolveNavLabel(touchMeta.navLabelPath, touchMeta.label, settings.navLabels)
        : touchMeta.label;
      document.title = `${resolvedLabel} · ${settings.storeName}`;
      return;
    }

    const matchedRoute = APP_NAVIGATION_ROUTES.find(
      (route) =>
        location.pathname === route.path ||
        location.pathname.startsWith(`${route.path}/`),
    );
    if (matchedRoute) {
      const resolvedLabel = resolveNavLabel(
        matchedRoute.path,
        matchedRoute.label,
        settings.navLabels,
      );
      document.title = `${resolvedLabel} · ${settings.storeName}`;
    } else {
      document.title = settings.storeName;
    }
  }, [location.pathname, settings.navLabels, settings.storeName]);

  const dispatchUnifiedQrOrderAlert = React.useCallback(
    (params: {
      kind: 'NEW' | 'ADDON';
      tableLabel?: string;
      orderId?: number;
      batchNo?: number;
      invalidateGrid?: boolean;
    }) => {
      const tableLabel = params.tableLabel?.trim() || 'Bàn';
      const batchNo = params.batchNo ?? 2;
      const dedupKey = `${params.kind}:${tableLabel.toLowerCase()}:${params.kind === 'ADDON' ? batchNo : 1}`;

      void enqueueQrVoiceAlert({
        tableLabel,
        kind: params.kind,
        ...(params.kind === 'ADDON' ? { batchNo } : {}),
      });

      if (shouldEmitDeduplicatedOrderAlert(dedupKey)) {
        if (params.kind === 'NEW') {
          notifyRef.current('pos.socket.newQrOrder', {
            variant: 'warning',
            vars: { tableLabel },
            duration: 6000,
          });
          triggerBackgroundTabBrowserNotification({
            title: `Đơn QR mới · ${tableLabel}`,
            body: `${tableLabel} vừa gửi đơn QR mới. Chạm để mở quầy POS xác nhận.`,
            tag: `pos-tab-qr-new-${params.orderId ?? tableLabel}`,
          });
        } else {
          notifyRef.current('pos.socket.qrAppendItems', {
            variant: 'info',
            vars: { tableLabel, batchNo },
            duration: 6000,
          });
          triggerBackgroundTabBrowserNotification({
            title: `Gọi thêm món · ${tableLabel}`,
            body: `${tableLabel} vừa gọi thêm lượt ${batchNo}. Chạm để xem ngay.`,
            tag: `pos-tab-qr-addon-${params.orderId ?? tableLabel}-${batchNo}`,
          });
        }
      }

      if (params.invalidateGrid !== false) {
        void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
      }
    },
    [queryClient],
  );

  // Diff-based fallback detector: if a new pending QR order or addon appears in `globalTableGridQuery.data`
  // (via background poll, tab focus refetch, or reconnect) that was missed by Socket.io, alert immediately at t=0
  // instead of waiting 5 minutes for the overdue reminder!
  React.useEffect(() => {
    if (!canReceivePosAlerts || !globalTableGridQuery.data) return;
    const currentItems = collectPendingQrItems(globalTableGridQuery.data);
    const currentKeySet = new Set(currentItems.map((item) => item.key));

    if (knownPendingQrKeysRef.current === null) {
      knownPendingQrKeysRef.current = currentKeySet;
      return;
    }

    // Only orders that are STILL pending in the freshly fetched grid can appear here, so anything the
    // cashier already confirmed / printed / voided while the app was asleep is never announced.
    const freshItems = currentItems.filter(
      (item) => !knownPendingQrKeysRef.current!.has(item.key),
    );
    if (freshItems.length >= 2) {
      // Catch-up after wake-up: read ONE grouped sentence instead of replaying every order.
      void enqueueQrVoiceAlert({
        tableLabel: freshItems.map((item) => item.tableLabel).join(', '),
        kind: freshItems[0]!.kind,
        isReminder: true,
        reminderTables: freshItems.map((item) => ({
          tableLabel: item.tableLabel,
          kind: item.kind,
        })),
      });
      notifyRef.current('pos.socket.newQrOrder', {
        variant: 'warning',
        vars: { tableLabel: freshItems.map((item) => item.tableLabel).join(', ') },
        duration: 6000,
      });
    } else if (freshItems.length === 1) {
      const item = freshItems[0]!;
      dispatchUnifiedQrOrderAlert({
        kind: item.kind,
        tableLabel: item.tableLabel,
        orderId: item.orderId,
        invalidateGrid: false,
      });
    }
    knownPendingQrKeysRef.current = currentKeySet;
  }, [canReceivePosAlerts, globalTableGridQuery.data, dispatchUnifiedQrOrderAlert]);

  // Resilient mobile/desktop audio unlock, Layer 2 background keep-alive & Layer 3 Web Push sync
  useMobileOrderAlertLifecycle({
    enabled: Boolean(accessToken && canReceivePosAlerts),
    storeName: settings.storeName,
    onNavigateToUrl: (url) => {
      if (isPosTouchRoute) {
        const queryIdx = url.indexOf('?');
        const query = queryIdx >= 0 ? url.slice(queryIdx) : '';
        navigate(`${TOUCH_PATHS.POS}${query}`);
        return;
      }
      navigate(url);
    },
    onForegroundPushOrderAlert: (pushPayload) => {
      // A frozen background tab receives its queued push messages all at once when the user returns.
      // Anything older than 20s is stale: the grid refetch + grouped catch-up above already covers
      // orders that are still pending, and orders handled meanwhile must stay silent.
      const pushedAtMs = pushPayload.timestamp ? Date.parse(pushPayload.timestamp) : Number.NaN;
      if (!Number.isFinite(pushedAtMs) || Date.now() - pushedAtMs > 20_000) {
        void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
        return;
      }
      if (pushPayload.kind === 'QR_NEW') {
        dispatchUnifiedQrOrderAlert({
          kind: 'NEW',
          tableLabel: pushPayload.tableLabel,
          orderId: pushPayload.orderId,
        });
      } else if (pushPayload.kind === 'QR_ADDON') {
        dispatchUnifiedQrOrderAlert({
          kind: 'ADDON',
          tableLabel: pushPayload.tableLabel,
          orderId: pushPayload.orderId,
          batchNo: pushPayload.batchNo,
        });
      }
    },
  });

  // Always-mounted global QR order voice alert & toast across ALL routes (including /pos, /pos/touch, and all other modules).
  // When on /pos or /pos/touch, usePosCashierSocket also runs; deduplication ensures zero double-toasts or double-voice.
  React.useEffect(() => {
    if (!socket || !canReceivePosAlerts) return;

    const handleGlobalQrNew = (raw: unknown) => {
      const payload = raw as QrSocketAlertPayload;
      dispatchUnifiedQrOrderAlert({
        kind: 'NEW',
        tableLabel: payload?.tableLabel ?? 'Bàn',
        orderId: payload?.orderId,
      });
    };

    const handleGlobalQrAddon = (raw: unknown) => {
      const payload = raw as QrSocketAlertPayload;
      dispatchUnifiedQrOrderAlert({
        kind: 'ADDON',
        tableLabel: payload?.tableLabel ?? 'Bàn',
        orderId: payload?.orderId,
        batchNo: payload?.batchNo ?? 2,
      });
    };

    const handleGlobalGridSync = () => {
      void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
    };

    const handleGlobalQrAutoCancelled = (raw: unknown) => {
      const parsed = QrAutoCancelledPayloadSchema.safeParse(raw);
      if (parsed.success && !isPosLiveBoardRoute) {
        notifyRef.current('pos.socket.qrAutoCancelled', {
          variant: 'warning',
          vars: {
            tableLabel: parsed.data.tableLabel ?? 'Bàn',
            detail: parsed.data.reason,
          },
          duration: 7000,
        });
      }
      void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
    };

    socket.on(SocketEvents.ORDER_QR_NEW, handleGlobalQrNew);
    socket.on(SocketEvents.ORDER_QR_ADDON, handleGlobalQrAddon);
    socket.on(SocketEvents.TABLE_GRID_SYNC, handleGlobalGridSync);
    socket.on(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleGlobalQrAutoCancelled);
    return () => {
      socket.off(SocketEvents.ORDER_QR_NEW, handleGlobalQrNew);
      socket.off(SocketEvents.ORDER_QR_ADDON, handleGlobalQrAddon);
      socket.off(SocketEvents.TABLE_GRID_SYNC, handleGlobalGridSync);
      socket.off(SocketEvents.ORDER_QR_AUTO_CANCELLED, handleGlobalQrAutoCancelled);
    };
  }, [socket, canReceivePosAlerts, isPosLiveBoardRoute, queryClient, dispatchUnifiedQrOrderAlert]);

  return (
    <div className="fixed inset-0 flex h-dvh w-full overflow-hidden overscroll-none bg-background text-foreground">
      <TopProgressBar />
      {isPosTouchRoute ? null : (
        <>
          <ResizableSidebar />
          <TabletIconRail onOpenDrawer={() => setMobileMenuOpen(true)} />
        </>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isBrowserOnline || isSocketDisconnected ? (
          <div
            role="status"
            data-testid="network-offline-banner"
            className={cn(
              'pointer-events-none fixed bottom-3 left-1/2 z-50 flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center justify-center gap-2 rounded-full border border-amber-600/30 bg-amber-500/95 px-3.5 py-1.5 text-center text-xs font-bold text-amber-950 shadow-lg backdrop-blur-xs',
              isPosTouchRoute && 'bottom-20 py-2 text-sm',
            )}
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span className="leading-snug">
              {!isBrowserOnline
                ? 'Đang mất kết nối mạng — Phiên đăng nhập vẫn được giữ nguyên, sẽ tự đồng bộ khi có mạng.'
                : 'Kết nối thời gian thực đang gián đoạn — Đang tự động kết nối lại...'}
            </span>
          </div>
        ) : null}
        {isPosTouchRoute ? null : (
          <TopNavbar
            queryClient={queryClient}
            onOpenCommandPalette={() => setCommandOpen(true)}
            onToggleMobileMenu={() => setMobileMenuOpen(true)}
          />
        )}
        <MobileAudioActivationBanner compact={isPosTouchRoute} />
        {!isPosLiveBoardRoute && overdueQrItems.length > 0 ? (
          <button
            type="button"
            data-testid="global-overdue-qr-banner"
            onClick={() => {
              const firstOrderId = overdueQrItems[0]?.orderId;
              const base = isPosTouchRoute ? TOUCH_PATHS.POS : '/pos';
              navigate(firstOrderId ? `${base}?orderId=${firstOrderId}` : base);
            }}
            className={cn(
              'flex w-full items-center justify-center gap-2 bg-red-600 px-3 py-1.5 text-center text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700 animate-pulse',
              isPosTouchRoute && 'min-h-12 py-2.5 text-sm',
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 touch-ui:h-5 touch-ui:w-5" />
            <span className="leading-snug break-words">
              Cảnh báo đỏ: {overdueQrItems.map((entry) => entry.tableLabel).join(', ')} chưa xác nhận đơn QR quá hạn — Nhấn để mở quầy POS xử lý ngay
            </span>
          </button>
        ) : null}
        <main
          data-app-content="true"
          className={cn(
            'flex-1 min-h-0 flex flex-col',
            isPosTouchRoute ? 'p-0' : 'p-2.5 sm:p-4 md:p-5',
            isPosLiveBoardRoute || isPosTouchRoute
              ? 'overflow-hidden'
              : 'overflow-y-auto overflow-x-hidden overscroll-y-contain pb-8 sm:pb-6',
          )}
        >
          <Outlet />
        </main>
      </div>
      {isPosTouchRoute ? null : (
        <>
          <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetContent side="left" className="w-[min(18rem,calc(100vw-2rem))] p-0 flex flex-col">
              <MobileSidebarNav
                onClose={() => setMobileMenuOpen(false)}
                onOpenCommandPalette={() => setCommandOpen(true)}
              />
            </SheetContent>
          </Sheet>
        </>
      )}
      {accessToken && user && settings.aiAssistant.enabled ? <AiAssistantDrawer /> : null}
    </div>
  );
}
