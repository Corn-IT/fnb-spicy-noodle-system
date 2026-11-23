import { UserPermissionsSchema } from '@fnb/shared';
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCOUNT_PREFERENCES_FOCUS_SYNC_MIN_INTERVAL_MS,
  useSyncAccountPreferencesOnFocus,
} from '@/hooks/use-sync-account-preferences-on-focus';
import { apiClient } from '@/lib/api-client';
import {
  persistAccountPreferences,
  resetAccountPreferencesQueueForTesting,
} from '@/lib/persist-account-preferences';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const signIn = () =>
  useAuthStore.getState().setAuth({
    accessToken: 'token',
    user: {
      id: 1,
      employeeId: 1,
      username: 'admin',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({}),
    },
  });

const comeBackToTab = () => window.dispatchEvent(new Event('focus'));
const flush = () => vi.advanceTimersByTimeAsync(0);
const waitInterval = () => vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_FOCUS_SYNC_MIN_INTERVAL_MS + 1);

describe('useSyncAccountPreferencesOnFocus', () => {
  let get: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    resetAccountPreferencesQueueForTesting();
    signIn();
    useUiPreferencesStore.setState({ userNavOrder: [], sidebarCollapsed: false, accountSyncPending: false });
    get = vi.spyOn(apiClient, 'get').mockResolvedValue({ uiPreferences: { navOrder: ['/pos'], sidebarCollapsed: true } } as never);
  });

  afterEach(() => {
    resetAccountPreferencesQueueForTesting();
    vi.useRealTimers();
  });

  it('pulls changes made on another device when the tab becomes active again', async () => {
    renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();

    comeBackToTab();
    await flush();

    expect(get).toHaveBeenCalledWith('/api/v1/profile');
    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/pos']);
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
  });

  it('does not hammer the server when focus changes repeatedly', async () => {
    renderHook(() => useSyncAccountPreferencesOnFocus());

    comeBackToTab();
    comeBackToTab();
    await flush();
    expect(get).not.toHaveBeenCalled();

    await waitInterval();
    comeBackToTab();
    comeBackToTab();
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reacts to the tab becoming visible, but not to it being hidden', async () => {
    renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(get).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('drops a server snapshot when the user changed something while it was on its way', async () => {
    let answer: (value: unknown) => void = () => undefined;
    get.mockImplementation(() => new Promise((resolve) => { answer = resolve; }) as never);
    vi.spyOn(apiClient, 'patch').mockResolvedValue({} as never);
    renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();

    comeBackToTab();
    await flush();
    useUiPreferencesStore.getState().setUserNavOrder(['/menu']);
    void persistAccountPreferences({ navOrder: ['/menu'] });
    answer({ uiPreferences: { navOrder: ['/pos'] } });
    await flush();

    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
  });

  it('keeps what is on screen when the server cannot be reached', async () => {
    get.mockRejectedValue(new Error('offline'));
    useUiPreferencesStore.setState({ userNavOrder: ['/menu'] });
    renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();

    comeBackToTab();
    await flush();

    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
  });

  it('does nothing while signed out and stops listening on unmount', async () => {
    useAuthStore.getState().clearAuth();
    const signedOut = renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();
    comeBackToTab();
    await flush();
    expect(get).not.toHaveBeenCalled();
    signedOut.unmount();

    signIn();
    const active = renderHook(() => useSyncAccountPreferencesOnFocus());
    await waitInterval();
    active.unmount();
    comeBackToTab();
    await flush();
    expect(get).not.toHaveBeenCalled();
  });
});
