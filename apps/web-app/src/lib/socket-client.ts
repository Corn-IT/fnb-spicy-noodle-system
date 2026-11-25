import { SocketNamespace } from '@fnb/shared';
import { io, type Socket } from 'socket.io-client';

import { env } from '@/config/env';

export type SocketAuthMode =
  | {
      mode: 'staff';
      token: string;
      getToken?: () => string | null;
    }
  | {
      mode: 'qr_guest';
      qrToken: string;
      orderId?: number | string | null;
      guestSessionToken?: string | null;
    };

let activeStaffSocket: Socket | null = null;
let activeGuestSocket: Socket | null = null;

export function connectPosSocket(authConfig: SocketAuthMode): Socket {
  if (authConfig.mode === 'staff') {
    if (activeStaffSocket) {
      activeStaffSocket.disconnect();
      activeStaffSocket = null;
    }
  } else if (activeGuestSocket) {
    activeGuestSocket.disconnect();
    activeGuestSocket = null;
  }

  const baseUrl = env.VITE_SOCKET_URL.replace(/\/+$/, '');
  const namespaceUrl = baseUrl.endsWith(SocketNamespace)
    ? baseUrl
    : `${baseUrl}${SocketNamespace}`;

  const authOption =
    authConfig.mode === 'staff'
      ? (cb: (data: Record<string, unknown>) => void) => {
          const latestToken = authConfig.getToken?.() ?? authConfig.token;
          cb({ token: latestToken });
        }
      : {
          qrToken: authConfig.qrToken,
          ...(authConfig.orderId !== undefined && authConfig.orderId !== null
            ? { orderId: authConfig.orderId }
            : {}),
          ...(authConfig.guestSessionToken
            ? { guestSessionToken: authConfig.guestSessionToken }
            : {}),
        };

  const instance = io(namespaceUrl, {
    auth: authOption,
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10_000,
  });

  if (authConfig.mode === 'staff') {
    activeStaffSocket = instance;
  } else {
    activeGuestSocket = instance;
  }

  return instance;
}

export function getPosSocket(mode?: 'staff' | 'qr_guest'): Socket | null {
  if (mode === 'staff') return activeStaffSocket;
  if (mode === 'qr_guest') return activeGuestSocket;
  return activeStaffSocket ?? activeGuestSocket;
}

export function disconnectPosSocket(mode?: 'staff' | 'qr_guest'): void {
  if (mode === 'staff') {
    if (activeStaffSocket) {
      activeStaffSocket.disconnect();
      activeStaffSocket = null;
    }
    return;
  }
  if (mode === 'qr_guest') {
    if (activeGuestSocket) {
      activeGuestSocket.disconnect();
      activeGuestSocket = null;
    }
    return;
  }
  if (activeStaffSocket) {
    activeStaffSocket.disconnect();
    activeStaffSocket = null;
  }
  if (activeGuestSocket) {
    activeGuestSocket.disconnect();
    activeGuestSocket = null;
  }
}
