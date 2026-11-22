import {
  PermissionsUpdatedSocketPayloadSchema,
  SessionRevokedSocketPayloadSchema,
  SocketEvents,
} from '@fnb/shared';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { type Socket } from 'socket.io-client';

import { toast } from '@/components/ui/toast';
import { connectPosSocket, disconnectPosSocket, type SocketAuthMode } from '@/lib/socket-client';
import { type AuthNoticeReason, useAuthStore } from '@/stores/auth.store';

interface SocketContextValue {
  socket: Socket | null;
  connectGuestSocket: (qrToken: string, orderId?: number | string | null) => Socket;
}

const SocketContext = React.createContext<SocketContextValue>({
  socket: null,
  connectGuestSocket: () => {
    throw new Error('SocketProvider chưa được khởi tạo');
  },
});

export interface SocketProviderProps {
  children: React.ReactNode;
}

export function SocketProvider({ children }: SocketProviderProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const queryClient = useQueryClient();
  const [socket, setSocket] = React.useState<Socket | null>(null);

  React.useEffect(() => {
    if (!accessToken) {
      disconnectPosSocket();
      setSocket(null);
      return;
    }

    const authConfig: SocketAuthMode = {
      mode: 'staff',
      token: accessToken,
    };
    const instance = connectPosSocket(authConfig);
    setSocket(instance);

    return () => {
      disconnectPosSocket();
    };
  }, [accessToken]);

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

    socket.on(SocketEvents.MENU_UPDATED, handleMenuUpdated);
    socket.on(SocketEvents.SCHEDULE_UPDATED, handleScheduleUpdated);
    socket.on(SocketEvents.PAYROLL_UPDATED, handlePayrollUpdated);
    socket.on(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
    socket.on(SocketEvents.SESSION_REVOKED, handleSessionRevoked);
    socket.on(SocketEvents.PERMISSIONS_UPDATED, handlePermissionsUpdated);
    return () => {
      socket.off(SocketEvents.MENU_UPDATED, handleMenuUpdated);
      socket.off(SocketEvents.SCHEDULE_UPDATED, handleScheduleUpdated);
      socket.off(SocketEvents.PAYROLL_UPDATED, handlePayrollUpdated);
      socket.off(SocketEvents.STORE_SETTINGS_UPDATED, handleStoreSettingsUpdated);
      socket.off(SocketEvents.SESSION_REVOKED, handleSessionRevoked);
      socket.off(SocketEvents.PERMISSIONS_UPDATED, handlePermissionsUpdated);
    };
  }, [socket, queryClient]);

  const connectGuestSocket = React.useCallback(
    (qrToken: string, orderId?: number | string | null) => {
      const instance = connectPosSocket({
        mode: 'qr_guest',
        qrToken,
        orderId,
      });
      setSocket(instance);
      return instance;
    },
    [],
  );

  const value = React.useMemo(
    () => ({ socket, connectGuestSocket }),
    [socket, connectGuestSocket],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function usePosSocketContext(): SocketContextValue {
  return React.useContext(SocketContext);
}
