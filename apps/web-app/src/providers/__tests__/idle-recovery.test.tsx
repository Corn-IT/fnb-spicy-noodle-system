// Post-fix regression checks. Historical characterization evidence remains unchanged.
import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '@/lib/api-client';
import * as sockets from '@/lib/socket-client';
import { SocketProvider } from '@/providers/socket-provider';
import { queryClient as defaultQueryClient } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const user = { id: 10, employeeId: 10, username: 'audit-cashier', isSuperAdmin: false, permissions: UserPermissionsSchema.parse({ pos: { view: true } }) };
function token(seconds = 900): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 10, sid: 'audit-session', exp: Math.floor(Date.now() / 1000) + seconds })}.signature`;
}

describe('idle stability audit: transport regression', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAuthStore.getState().setAuth({ accessToken: token(), user });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    useAuthStore.getState().clearAuth();
  });

  it('refresh fetch is bounded for concurrent callers and retains the local session', async () => {
    const fetchSpy = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined));
    vi.stubGlobal('fetch', fetchSpy);
    const first = api.refreshAccessToken();
    const second = api.refreshAccessToken();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe(user.id);
  });

  it('ordinary API deadline includes a stalled response body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: () => new Promise<string>(() => undefined) }));
    const pending = api.apiClient.get('/api/v1/pos/tables').catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await pending).toMatchObject({ statusCode: 408 });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a transient proactive refresh failure is retried while active and stops on teardown', async () => {
    const socket = { connected: true, connect: vi.fn(), on: vi.fn(), off: vi.fn() };
    vi.spyOn(sockets, 'connectPosSocket').mockReturnValue(socket as never);
    vi.spyOn(sockets, 'disconnectPosSocket').mockImplementation(() => undefined);
    const refresh = vi.spyOn(api, 'refreshAccessToken').mockResolvedValue(null);
    const client = new QueryClient();
    render(<QueryClientProvider client={client}><SocketProvider><div /></SocketProvider></QueryClientProvider>);
    await act(async () => { await vi.advanceTimersByTimeAsync(13.5 * 60_000); });
    expect(refresh).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(106.5 * 60_000); });
    expect(refresh.mock.calls.length).toBeGreaterThan(1);
    expect(useAuthStore.getState().user?.id).toBe(user.id);
    cleanup();
    const calls = refresh.mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(refresh).toHaveBeenCalledTimes(calls);
    client.clear();
  });

  it('refresh 503 preserves the session and a later explicit refresh can succeed', async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ accessToken: token() }), { status: 200 }));
    vi.stubGlobal('fetch', fetchSpy);
    expect(await api.refreshAccessToken()).toBeNull();
    expect(useAuthStore.getState().user?.id).toBe(user.id);
    expect(await api.refreshAccessToken()).toBeTruthy();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('socket reconnect and foreground return reconcile an active menu query after a missed event', async () => {
    useAuthStore.getState().setAccessToken(token(3 * 60 * 60));
    const handlers = new Map<string, () => void>();
    const socket = { connected: true, connect: vi.fn(), on: vi.fn((event: string, handler: () => void) => { handlers.set(event, handler); }), off: vi.fn() };
    vi.spyOn(sockets, 'connectPosSocket').mockReturnValue(socket as never);
    vi.spyOn(sockets, 'disconnectPosSocket').mockImplementation(() => undefined);
    const client = new QueryClient({ defaultOptions: defaultQueryClient.getDefaultOptions() });
    client.setQueryData(['menu-products'], ['old catalog']);
    const queryFn = vi.fn().mockResolvedValue(['new server catalog']);
    function ActiveMenu() {
      const query = useQuery({ queryKey: ['menu-products'], queryFn });
      return <div>{JSON.stringify(query.data)}</div>;
    }
    render(<QueryClientProvider client={client}><SocketProvider><ActiveMenu /></SocketProvider></QueryClientProvider>);
    await act(async () => {
      socket.connected = false;
      handlers.get('disconnect')?.();
      await vi.advanceTimersByTimeAsync(30 * 60_000);
      socket.connected = true;
      handlers.get('connect')?.();
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    expect(queryFn).toHaveBeenCalled();
    expect(client.getQueryData(['menu-products'])).toEqual(['new server catalog']);
    client.clear();
  });
});
