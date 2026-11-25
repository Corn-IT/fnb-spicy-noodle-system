import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as apiClientModule from '@/lib/api-client';
import * as socketClientModule from '@/lib/socket-client';
import { SocketProvider } from '@/providers/socket-provider';
import { useAuthStore } from '@/stores/auth.store';

function makeJwtWithExp(expOffsetSeconds: number): string {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSeconds;
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 10, exp })}.sig`;
}

describe('SocketProvider 24/7 Mobile Token Auto-Refresh & Wake Recovery (BUG-1)', () => {
  beforeEach(() => {
    useAuthStore.setState({
      accessToken: makeJwtWithExp(-60), // Expired 1 minute ago (simulating >15m mobile sleep)
      user: {
        id: 10,
        employeeId: 10,
        username: 'cashier01',
        fullName: 'Thu Ngân 01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
      },
      authNotice: null,
      authNoticeMeta: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('automatically calls refreshAccessToken and reconnects with the fresh token on connect_error(Unauthorized)', async () => {
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    const connectSpy = vi.fn();
    const disconnectSpy = vi.fn();
    let capturedGetToken: (() => string | null) | undefined;

    const fakeSocket = {
      connected: false,
      connect: connectSpy,
      disconnect: disconnectSpy,
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!listeners.has(event)) listeners.set(event, new Set());
        listeners.get(event)!.add(cb);
      }),
      off: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        listeners.get(event)?.delete(cb);
      }),
    };

    vi.spyOn(socketClientModule, 'connectPosSocket').mockImplementation((cfg) => {
      if (cfg.mode === 'staff') {
        capturedGetToken = cfg.getToken;
      }
      return fakeSocket as never;
    });
    vi.spyOn(socketClientModule, 'disconnectPosSocket').mockImplementation(() => undefined);

    const freshToken = makeJwtWithExp(900);
    const refreshSpy = vi
      .spyOn(apiClientModule, 'refreshAccessToken')
      .mockImplementation(async () => {
        useAuthStore.getState().setAccessToken(freshToken);
        return freshToken;
      });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          <div>child</div>
        </SocketProvider>
      </QueryClientProvider>,
    );

    // Trigger Unauthorized connect_error as happens when mobile wakes up after >15m
    act(() => {
      for (const cb of listeners.get('connect_error') ?? []) {
        cb(new Error('Unauthorized'));
      }
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });
    // Dynamic auth getter now supplies the fresh token on reconnect without tearing down socket
    expect(capturedGetToken?.()).toBe(freshToken);
    expect(socketClientModule.connectPosSocket).toHaveBeenCalledTimes(1);
  });

  it('recovers connection and refreshes near-expired token immediately when phone screen wakes up (visibilitychange)', async () => {
    const connectSpy = vi.fn();
    const fakeSocket = {
      connected: false,
      connect: connectSpy,
      disconnect: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };
    vi.spyOn(socketClientModule, 'connectPosSocket').mockReturnValue(fakeSocket as never);
    vi.spyOn(socketClientModule, 'disconnectPosSocket').mockImplementation(() => undefined);

    const freshToken = makeJwtWithExp(900);
    const refreshSpy = vi
      .spyOn(apiClientModule, 'refreshAccessToken')
      .mockImplementation(async () => {
        useAuthStore.getState().setAccessToken(freshToken);
        return freshToken;
      });

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <SocketProvider>
          <div>child</div>
        </SocketProvider>
      </QueryClientProvider>,
    );

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalledTimes(1);
      expect(connectSpy).toHaveBeenCalledTimes(1);
    });
  });
});
