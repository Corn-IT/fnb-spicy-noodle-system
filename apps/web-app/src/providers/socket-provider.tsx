import * as React from 'react';
import { type Socket } from 'socket.io-client';

import { connectPosSocket, disconnectPosSocket, type SocketAuthMode } from '@/lib/socket-client';
import { useAuthStore } from '@/stores/auth.store';

interface SocketContextValue {
  socket: Socket | null;
  connectGuestSocket: (qrToken: string, orderId: number | string) => Socket;
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

  const connectGuestSocket = React.useCallback((qrToken: string, orderId: number | string) => {
    const instance = connectPosSocket({
      mode: 'qr_guest',
      qrToken,
      orderId,
    });
    setSocket(instance);
    return instance;
  }, []);

  const value = React.useMemo(
    () => ({ socket, connectGuestSocket }),
    [socket, connectGuestSocket],
  );

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function usePosSocketContext(): SocketContextValue {
  return React.useContext(SocketContext);
}
