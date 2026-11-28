import { UserPermissionsSchema } from '@fnb/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient, refreshAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';

const user = { id: 10, employeeId: 10, username: 'cashier', isSuperAdmin: false, permissions: UserPermissionsSchema.parse({}) };
const never = () => new Promise<never>(() => undefined);

describe('idle HTTP recovery', () => {
  beforeEach(() => { vi.useFakeTimers(); useAuthStore.getState().setAuth({ accessToken: 'old', user }); });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); useAuthStore.getState().clearAuth(); });

  it.each(['fetch', 'body'])('bounds shared refresh %s and releases it for later recovery', async (phase) => {
    const fetchMock = vi.fn().mockImplementationOnce(phase === 'fetch' ? never : async () => ({ ok: true, json: never }))
      .mockResolvedValueOnce(new Response('{"accessToken":"recovered"}'));
    vi.stubGlobal('fetch', fetchMock);
    const first = refreshAccessToken();
    const second = refreshAccessToken();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await first).toBeNull(); expect(await second).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1].signal.aborted).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('old');
    expect(await refreshAccessToken()).toBe('recovered');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([200, 401, 503])('bounds a stalled %s response body even with a caller signal', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue({ status, ok: status === 200, text: never });
    vi.stubGlobal('fetch', fetchMock);
    const result = apiClient.post('/api/v1/pos/orders', {}, { signal: new AbortController().signal }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await result).toMatchObject({ statusCode: 408 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves AbortError for explicit cancellation', async () => {
    vi.stubGlobal('fetch', vi.fn(never));
    const controller = new AbortController();
    const result = apiClient.get('/api/v1/pos/tables', { signal: controller.signal }).catch((error: unknown) => error);
    controller.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['/api/v1/pos/orders', '/api/v1/pos/orders/101/split-kitchen', '/api/v1/pos/orders/101/checkout'])('never replays a timed-out POST %s', async (path) => {
    const fetchMock = vi.fn(never);
    vi.stubGlobal('fetch', fetchMock);
    const pending = apiClient.post(path, {}).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120 * 60_000);
    expect(await pending).toMatchObject({ statusCode: 408 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not send a pre-cancelled mutation', async () => {
    const fetchMock = vi.fn(never); vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController(); controller.abort();
    await expect(apiClient.post('/api/v1/pos/orders', {}, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([new Response('broken-json'), new Response('{}', { status: 403 }), new Response('{}', { status: 503 })])('preserves session on malformed success or transient/permission refresh failure', async (response) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    expect(await refreshAccessToken()).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('old');
  });

  it('cancels one caller waiting for refresh without cancelling the shared refresh', async () => {
    useAuthStore.setState({ accessToken: null });
    let release!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; })).mockResolvedValueOnce(new Response('{"tables":[]}'));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const cancelled = apiClient.get('/api/v1/pos/tables', { signal: controller.signal }).catch((error: unknown) => error);
    const shared = refreshAccessToken();
    controller.abort();
    expect(await cancelled).toMatchObject({ name: 'AbortError' });
    release(new Response('{"accessToken":"shared-fresh"}'));
    expect(await shared).toBe('shared-fresh');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not reuse a bootstrap refresh after a cross-tab account replacement', async () => {
    useAuthStore.setState({ accessToken: null });
    let release!: (value: Response) => void;
    const fetchMock = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { release = resolve; })).mockResolvedValueOnce(new Response('{"accessToken":"account-b"}'));
    vi.stubGlobal('fetch', fetchMock);
    const pending = refreshAccessToken();
    useAuthStore.setState({ accessToken: null, user: { ...user, id: 20 } });
    expect(await refreshAccessToken()).toBe('account-b');
    release(new Response('{"accessToken":"account-a-late"}'));
    expect(await pending).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('account-b');
  });

  it.each(['AUTH_SESSION_REVOKED', 'AUTH_TOKEN_EXPIRED'])('ignores delayed %s after direct cross-tab account replacement', async (code) => {
    let release!: (value: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = apiClient.post('/api/v1/pos/orders', {}).catch((error: unknown) => error);
    useAuthStore.setState({ accessToken: 'account-b', user: { ...user, id: 20 } });
    release(new Response(JSON.stringify({ code, message: 'Unauthorized' }), { status: 401 }));
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(useAuthStore.getState().accessToken).toBe('account-b');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['bootstrap', '401'])('does not send or replay a mutation after account replacement during %s refresh', async (phase) => {
    if (phase === 'bootstrap') useAuthStore.setState({ accessToken: null });
    let release!: (value: Response) => void;
    const refreshStarted = new Promise<void>((resolveStarted) => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes('/auth/refresh')) {
          resolveStarted();
          return new Promise<Response>((resolve) => { release = resolve; });
        }
        return new Response('{}', { status: 401 });
      });
      vi.stubGlobal('fetch', fetchMock);
    });
    const pending = apiClient.post('/api/v1/pos/orders', {}).catch((error: unknown) => error);
    await refreshStarted;
    useAuthStore.setState({ accessToken: 'account-b', user: { ...user, id: 20 } });
    release(new Response('{"accessToken":"account-a-late"}'));
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(useAuthStore.getState().accessToken).toBe('account-b');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(phase === 'bootstrap' ? 1 : 2);
  });

  it.each([200, 401])('ignores a late refresh %s after account replacement', async (status) => {
    let release!: (value: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const pending = refreshAccessToken();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({ accessToken: 'new-account', user: { ...user, id: 20 } });
    release(new Response('{"accessToken":"late"}', { status }));
    expect(await pending).toBeNull();
    expect(useAuthStore.getState().accessToken).toBe('new-account');
    expect(useAuthStore.getState().user?.id).toBe(20);
  });
});
