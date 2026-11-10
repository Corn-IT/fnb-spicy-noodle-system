import { SocketNamespace } from '@fnb/shared';
import { io, type Socket } from 'socket.io-client';

import { env } from '@/config/env';

export type SocketAuthMode =
  | {
      mode: 'staff';
      token: string;
    }
  | {
      mode: 'qr_guest';
      qrToken: string;
      orderId: number | string;
    };

let activeSocket: Socket | null = null;

export function connectPosSocket(authConfig: SocketAuthMode): Socket {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }

  const baseUrl = env.VITE_SOCKET_URL.replace(/\/+$/, '');
  const namespaceUrl = `${baseUrl}${SocketNamespace}`;

  const authPayload =
    authConfig.mode === 'staff'
      ? { token: authConfig.token }
      : { qrToken: authConfig.qrToken, orderId: authConfig.orderId };

  activeSocket = io(namespaceUrl, {
    auth: authPayload,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelayMax: 5000,
  });

  return activeSocket;
}

export function getPosSocket(): Socket | null {
  return activeSocket;
}

export function disconnectPosSocket(): void {
  if (activeSocket) {
    activeSocket.disconnect();
    activeSocket = null;
  }
}
