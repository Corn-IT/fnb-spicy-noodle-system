import { UserPermissionsSchema } from '@fnb/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import {
  ACCOUNT_PREFERENCES_DEBOUNCE_MS,
  flushAccountPreferences,
  persistAccountPreferences,
  resetAccountPreferencesQueueForTesting,
} from '@/lib/persist-account-preferences';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const signIn = (id: number) =>
  useAuthStore.getState().setAuth({
    accessToken: `token-${id}`,
    user: {
      id,
      employeeId: id,
      username: `user${id}`,
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({}),
    },
  });

describe('persistAccountPreferences', () => {
  let patch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    resetAccountPreferencesQueueForTesting();
    patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({} as never);
    signIn(1);
  });

  afterEach(() => {
    resetAccountPreferencesQueueForTesting();
    vi.useRealTimers();
  });

  it('merges rapid changes into one request holding the latest values', async () => {
    const first = persistAccountPreferences({ navOrder: ['/pos', '/menu'] });
    const second = persistAccountPreferences({ navOrder: ['/menu', '/pos'], sidebarCollapsed: true });

    expect(patch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', {
      navOrder: ['/menu', '/pos'],
      sidebarCollapsed: true,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([true, true]);
  });

  it('sends batches one after another so a slow save cannot overwrite a newer one', async () => {
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    patch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseFirst = () => {
              order.push('first-finished');
              resolve({} as never);
            };
          }) as never,
      )
      .mockImplementationOnce((async () => {
        order.push('second-sent');
        return {};
      }) as never);

    void persistAccountPreferences({ sidebarCollapsed: true });
    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);
    void persistAccountPreferences({ sidebarCollapsed: false });
    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);

    expect(patch).toHaveBeenCalledTimes(1);
    releaseFirst();
    await vi.advanceTimersByTimeAsync(0);
    await flushAccountPreferences();

    expect(order).toEqual(['first-finished', 'second-sent']);
    expect(patch).toHaveBeenLastCalledWith('/api/v1/profile/ui-prefs', { sidebarCollapsed: false });
  });

  it('flags the store as pending until the server has answered', async () => {
    void persistAccountPreferences({ sidebarCollapsed: true });
    expect(useUiPreferencesStore.getState().accountSyncPending).toBe(true);

    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);
    await flushAccountPreferences();

    expect(useUiPreferencesStore.getState().accountSyncPending).toBe(false);
  });

  it('resolves false and clears the pending flag when the server rejects the save', async () => {
    patch.mockRejectedValue(new Error('network'));
    const result = persistAccountPreferences({ sidebarCollapsed: true });

    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);

    await expect(result).resolves.toBe(false);
    expect(useUiPreferencesStore.getState().accountSyncPending).toBe(false);
  });

  it('never sends one account queued change with another account token', async () => {
    const result = persistAccountPreferences({ sidebarCollapsed: true });
    signIn(2);

    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);

    expect(patch).not.toHaveBeenCalled();
    await expect(result).resolves.toBe(false);
  });

  it('drops the previous account queue when a different account starts a new change', async () => {
    const stale = persistAccountPreferences({ sidebarCollapsed: true });
    signIn(2);
    const fresh = persistAccountPreferences({ voiceAlertEnabled: false });

    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);

    expect(patch).toHaveBeenCalledTimes(1);
    expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { voiceAlertEnabled: false });
    await expect(stale).resolves.toBe(false);
    await expect(fresh).resolves.toBe(true);
  });

  it('does nothing when signed out', async () => {
    useAuthStore.getState().clearAuth();
    await expect(persistAccountPreferences({ sidebarCollapsed: true })).resolves.toBe(false);
    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);
    expect(patch).not.toHaveBeenCalled();
  });

  it('rejects invalid values instead of sending them', async () => {
    const result = persistAccountPreferences({ displayScale: { globalPercent: 999, perPath: {} } });
    await vi.advanceTimersByTimeAsync(ACCOUNT_PREFERENCES_DEBOUNCE_MS);
    await expect(result).resolves.toBe(false);
    expect(patch).not.toHaveBeenCalled();
  });
});
