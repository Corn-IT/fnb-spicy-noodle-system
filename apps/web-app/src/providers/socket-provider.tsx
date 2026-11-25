import {
  AccountPreferencesUpdatedSocketPayloadSchema,
  PermissionsUpdatedSocketPayloadSchema,
  SessionRevokedSocketPayloadSchema,
  SocketEvents,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { type Socket } from 'socket.io-client';

import { toast } from '@/components/ui/toast';
import { getJwtExpirationMs, refreshAccessToken } from '@/lib/api-client';
import { connectPosSocket, disconnectPosSocket, type SocketAuthMode } from '@/lib/socket-client';
import { type AuthNoticeReason, useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
  connectGuestSocket: (qrToken: string, orderId?: number | string | null) => Socket;
}

const SocketContext = React.createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
  connectGuestSocket: () => {
    throw new Error('SocketProvider chưa được khởi tạo');
  },
});

const PROACTIVE_REFRESH_BUFFER_MS = 90_000;
const MIN_REACTIVE_REFRESH_INTERVAL_MS = 3_000;

function notifyServiceWorkerOrderHandled(orderId: number): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.controller?.postMessage({
      type: 'POS_CLOSE_ORDER_NOTIFICATIONS',
      orderId,
    });
  } catch {
    // Ignore SW message failures
  }
}

export interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const hasStaffSession = Boolean(accessToken && userId);
  const queryClient = useQueryClient();
  const [socket, setSocket] = React.useState<Socket | null>(null);
  const [isConnected, setIsConnected] = React.useState<boolean>(false);
  const lastReactiveRefreshAtRef = React.useRef<number>(0);

  // Establish ONE persistent staff socket per authenticated user session.
  // Rotating accessToken does NOT tear down the live socket; reconnects dynamically pull
  // the latest accessToken from useAuthStore via `getToken`.
  React.useEffect(() => {
    if (!hasStaffSession) {
      disconnectPosSocket('staff');
      setSocket(null);
      setIsConnected(false);
      return;
    }

    const initialToken = useAuthStore.getState().accessToken;
    if (!initialToken) return;

    const authConfig: SocketAuthMode = {
      mode: 'staff',
      token: initialToken,
      getToken: () => useAuthStore.getState().accessToken,
    };
    const instance = connectPosSocket(authConfig);
    setSocket(instance);
    setIsConnected(Boolean(instance.connected));

    return () => {
      disconnectPosSocket('staff');
      setIsConnected(false);
    };
  }, [hasStaffSession, userId]);

  // Proactive JWT access token refresh ~90s before expiry so mobile Socket.io never hits
  // expired-token Unauthorized loops on long shifts or overnight sessions.
  React.useEffect(() => {
    if (!accessToken || !userId || typeof window === 'undefined') return;

    const expMs = getJwtExpirationMs(accessToken);
    if (!expMs) return;

    const delayMs = Math.max(5_000, expMs - Date.now() - PROACTIVE_REFRESH_BUFFER_MS);
    const timer = window.setTimeout(() => {
      void refreshAccessToken();
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [accessToken, userId]);

  // Reactive auth recovery on connect_error + immediate wake-up recovery on visibility/online
  React.useEffect(() => {
    if (!socket) {
      setIsConnected(false);
      return;
    }

    const handleConnect = () => {
      setIsConnected(true);
    };
    const handleDisconnect = () => {
      setIsConnected(false);
    };
    const handleConnectError = (err: Error) => {
      setIsConnected(false);
      if (!useAuthStore.getState().user) return;
      const now = Date.now();
      const token = useAuthStore.getState().accessToken;
      const expMs = getJwtExpirationMs(token);
      const isTokenExpiredOrNear = expMs !== null && expMs - now <= PROACTIVE_REFRESH_BUFFER_MS;
      const isAuthFailure = /unauthorized|jwt|expired|token/i.test(err?.message ?? '');

      if ((isAuthFailure || isTokenExpiredOrNear) && now - lastReactiveRefreshAtRef.current >= MIN_REACTIVE_REFRESH_INTERVAL_MS) {
        lastReactiveRefreshAtRef.current = now;
        void refreshAccessToken().then((freshToken) => {
          if (freshToken && !socket.connected) {
            socket.connect();
          }
        });
      }
    };

    const recoverConnection = () => {
      if (!useAuthStore.getState().user) return;
      const token = useAuthStore.getState().accessToken;
      const expMs = getJwtExpirationMs(token);
      const needsRefresh = !token || (expMs !== null && expMs - Date.now() <= PROACTIVE_REFRESH_BUFFER_MS);

      if (needsRefresh) {
        lastReactiveRefreshAtRef.current = Date.now();
        void refreshAccessToken().then((freshToken) => {
          if (freshToken && !socket.connected) {
            socket.connect();
          }
        });
      } else if (!socket.connected) {
        socket.connect();
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recoverConnection();
      }
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', recoverConnection);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', recoverConnection);
    };
  }, [socket]);

  React.useEffect(() => {
    if (!socket) return;

    const handleMenuUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['mdm'] });
      void queryClient.invalidateQueries({ queryKey: ['menu-products'] });
      void queryClient.invalidateQueries({ queryKey: ['menu'] });
      void queryClient.invalidateQueries({ queryKey: ['pos'] });
      void queryClient.invalidateQueries({ queryKey: ['public-menu'] });
    };

    const handleScheduleUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void queryClient.invalidateQueries({ queryKey: ['schedules'] });
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SCHEDULES'] });
    };

    const handlePayrollUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['payroll'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'PAYROLL'] });
    };

    const handleStoreSettingsUpdated = () => {
      void queryClient.invalidateQueries({ queryKey: ['store-settings'] });
      void queryClient.invalidateQueries({ queryKey: ['store-messages'] });
      void queryClient.invalidateQueries({ queryKey: ['audit-logs', 'SETTINGS'] });
    };

    const handleSessionRevoked = (raw: unknown) => {
      const parsed = SessionRevokedSocketPayloadSchema.safeParse(raw);
      const notice = parsed.success ? parsed.data : undefined;

      const reason: AuthNoticeReason =
        notice?.reason === 'NEW_LOGIN'
          ? 'SESSION_REPLACED'
          : notice?.reason === 'LOGGED_OUT'
            ? 'SESSION_EXPIRED'
            : 'SESSION_REVOKED';

      queryClient.clear();
      useAuthStore.getState().clearAuth(
        reason,
        notice
          ? {
              reason: notice.reason,
              at: notice.at,
            }
          : null,
      );

      toast({
        variant: 'destructive',
        title:
          reason === 'SESSION_REPLACED'
            ? 'Tài khoản đã đăng nhập trên thiết bị khác'
            : reason === 'SESSION_EXPIRED'
              ? 'Phiên làm việc đã đăng xuất'
              : 'Phiên đăng nhập đã bị thu hồi',
        description:
          reason === 'SESSION_REPLACED'
            ? 'Phiên trên máy này đã tự động kết thúc. Vui lòng đăng nhập lại hoặc liên hệ Quản lý.'
            : 'Vui lòng đăng nhập lại để tiếp tục.',
        duration: 5000,
      });
    };

    const handlePermissionsUpdated = (raw: unknown) => {
      const parsed = PermissionsUpdatedSocketPayloadSchema.safeParse(raw);
      if (!parsed.success) return;

      const currentUser = useAuthStore.getState().user;
      if (!currentUser || currentUser.id !== parsed.data.userId) return;

      useAuthStore.getState().updateUser({ permissions: parsed.data.permissions });
      void queryClient.invalidateQueries({ queryKey: ['profile', 'me'] });

      toast({
        title: 'Quyền truy cập vừa được cập nhật',
        description: 'Danh sách chức năng của bạn vừa được Quản trị viên điều chỉnh.',
        duration: 4500,
      });
    };

    const handleAccountPreferencesUpdated = (raw: unknown) => {
      const parsed = AccountPreferencesUpdatedSocketPayloadSchema.safeParse(raw);
      if (!parsed.success) return;

      const currentUser = useAuthStore.getState().user;
      if (!currentUser || currentUser.id !== parsed.data.userId) return;

      // This device's own save echoes back too; hydrate skips it while a local change is still unsent.
      useUiPreferencesStore.getState().hydrateFromServer(parsed.data.uiPreferences);
    };

    const handleTableGridSync = (raw: unknown) => {
      const payload = (raw ?? {}) as { orderId?: number; status?: string };
      if (
        typeof payload.orderId === 'number' &&
        (payload.status === 'SERVING' ||
          payload.status === 'PAID' ||
          payload.status === 'AVAILABLE' ||
          payload.status === 'VOIDED')
      ) {
        notifyServiceWorkerOrderHandled(payload.orderId);
      }
    };

    socket.on(SocketEvents.MENU_UPDATED, handleMenuUpdated);
    socket.on(SocketEvents.SCHEDULE_UPDATED, handleScheduleUpdated);
    socket.on(SocketEvents.PAYROLL_UPDATED, handlePayrollUpdated);
    socket.on(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
    socket.on(SocketEvents.SESSION_REVOKED, handleSessionRevoked);
    socket.on(SocketEvents.PERMISSIONS_UPDATED, handlePermissionsUpdated);
    socket.on(SocketEvents.ACCOUNT_PREFERENCES_UPDATED, handleAccountPreferencesUpdated);
    socket.on(SocketEvents.TABLE_GRID_SYNC, handleTableGridSync);
    return () => {
      socket.off(SocketEvents.MENU_UPDATED, handleMenuUpdated);
      socket.off(SocketEvents.SCHEDULE_UPDATED, handleScheduleUpdated);
      socket.off(SocketEvents.PAYROLL_UPDATED, handlePayrollUpdated);
      socket.off(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
      socket.off(SocketEvents.SESSION_REVOKED, handleSessionRevoked);
      socket.off(SocketEvents.PERMISSIONS_UPDATED, handlePermissionsUpdated);
      socket.off(SocketEvents.ACCOUNT_PREFERENCES_UPDATED, handleAccountPreferencesUpdated);
      socket.off(SocketEvents.TABLE_GRID_SYNC, handleTableGridSync);
    };
  }, [socket, queryClient]);

  const connectGuestSocket = React.useCallback(
    (qrToken: string, orderId?: number | string | null) => {
      return connectPosSocket({
        mode: 'qr_guest',
        qrToken,
        orderId,
      });
    },
    [],
  );

  const value = React.useMemo(
    () => ({ socket, isConnected, connectGuestSocket }),
    [socket, isConnected, connectGuestSocket],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function usePosSocketContext(): SocketContextValue {
  return React.useContext(SocketContext);
}
