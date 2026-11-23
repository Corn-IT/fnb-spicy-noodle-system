import { PosTableGridResponseSchema, QrAutoCancelledPayloadSchema, SocketEvents, type PosTableGridResponse } from '@fnb/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, WifiOff } from 'lucide-react';
import * as React from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

import {
  APP_NAVIGATION_ROUTES,
  CommandPalette,
  getAccessibleRoutes,
} from '@/components/layout/command-palette';
import { MobileSidebarNav, ResizableSidebar } from '@/components/layout/resizable-sidebar';
import { TopNavbar } from '@/components/layout/top-navbar';
import { clearPendingNavigation, TopProgressBar } from '@/components/loading';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useDisplayScale } from '@/hooks/use-display-scale';
import { resolveNavLabel, useStoreSettings } from '@/hooks/use-store-settings';
import { apiClient } from '@/lib/api-client';
import { POS_TABLE_GRID_QUERY_KEY } from '@/lib/pos-table-grid-query';
import { useQrPendingReminderMonitor } from '@/lib/qr-pending-reminder';
import { enqueueQrVoiceAlert, unlockQrVoiceAudio } from '@/lib/qr-voice-announcer';
import { startIdleRouteChunkWarmup } from '@/lib/route-prefetch';
import { usePosSocketContext } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

interface QrSocketAlertPayload {
  orderId?: number;
  tableLabel?: string;
  batchNo?: number;
}

export function AppShell() {
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

  const isPosRoute = location.pathname.startsWith('/pos');
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
    refetchInterval: false,
  });

  const overdueQrItems = useQrPendingReminderMonitor(
    globalTableGridQuery.data,
    Boolean(accessToken && canReceivePosAlerts),
  );

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

  // Unlock browser AudioContext on first user interaction in the shift
  React.useEffect(() => {
    const handleFirstInteraction = () => {
      void unlockQrVoiceAudio();
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
    window.addEventListener('pointerdown', handleFirstInteraction, { passive: true });
    window.addEventListener('keydown', handleFirstInteraction, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, []);

  // Global QR order voice alert & toast when staff is browsing non-POS admin screens
  React.useEffect(() => {
    if (!socket || !canReceivePosAlerts || isPosRoute) return;

    const handleGlobalQrNew = (raw: unknown) => {
      const payload = raw as QrSocketAlertPayload;
      const tableLabel = payload?.tableLabel ?? 'Bàn';
      void enqueueQrVoiceAlert({ tableLabel, kind: 'NEW' });
      notifyRef.current('pos.socket.newQrOrder', {
        variant: 'warning',
        vars: { tableLabel },
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
    };

    const handleGlobalQrAddon = (raw: unknown) => {
      const payload = raw as QrSocketAlertPayload;
      const tableLabel = payload?.tableLabel ?? 'Bàn';
      const batchNo = payload?.batchNo ?? 2;
      void enqueueQrVoiceAlert({ tableLabel, kind: 'ADDON' });
      notifyRef.current('pos.socket.qrAppendItems', {
        variant: 'info',
        vars: { tableLabel, batchNo },
        duration: 6000,
      });
      void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
    };

    const handleGlobalGridSync = () => {
      void queryClient.invalidateQueries({ queryKey: POS_TABLE_GRID_QUERY_KEY });
    };

    const handleGlobalQrAutoCancelled = (raw: unknown) => {
      const parsed = QrAutoCancelledPayloadSchema.safeParse(raw);
      if (parsed.success) {
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
  }, [socket, canReceivePosAlerts, isPosRoute, queryClient]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-background text-foreground">
      <TopProgressBar />
      <ResizableSidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!isBrowserOnline || isSocketDisconnected ? (
          <div
            role="status"
            data-testid="network-offline-banner"
            className="flex items-center justify-center gap-2 bg-amber-500/95 px-3 py-1.5 text-center text-xs font-bold text-amber-950 shadow-xs"
          >
            <WifiOff className="h-3.5 w-3.5 shrink-0" />
            <span>
              {!isBrowserOnline
                ? 'Đang mất kết nối mạng Wi-Fi/Internet — Phiên đăng nhập vẫn được giữ nguyên, hệ thống sẽ tự đồng bộ lại ngay khi có mạng.'
                : 'Kết nối thời gian thực tới máy chủ đang gián đoạn — Hệ thống đang tự động kết nối lại...'}
            </span>
          </div>
        ) : null}
        <TopNavbar
          queryClient={queryClient}
          onOpenCommandPalette={() => setCommandOpen(true)}
          onToggleMobileMenu={() => setMobileMenuOpen(true)}
        />
        {!isPosRoute && overdueQrItems.length > 0 ? (
          <button
            type="button"
            data-testid="global-overdue-qr-banner"
            onClick={() => navigate('/pos')}
            className="flex w-full items-center justify-center gap-2 bg-red-600 px-3 py-1.5 text-center text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-700 animate-pulse"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Cảnh báo đỏ: {overdueQrItems.map((entry) => entry.tableLabel).join(', ')} chưa xác nhận đơn QR quá hạn — Nhấn để mở quầy POS xử lý ngay
            </span>
          </button>
        ) : null}
        <main
          data-app-content="true"
          className={cn(
            'flex-1 min-h-0 flex flex-col p-2.5 sm:p-4 md:p-5',
            isPosRoute ? 'overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
          )}
        >
          <Outlet />
        </main>
      </div>
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0 flex flex-col">
          <MobileSidebarNav onClose={() => setMobileMenuOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
