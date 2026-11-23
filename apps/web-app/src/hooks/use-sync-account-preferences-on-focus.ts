import * as React from 'react';

import { apiClient } from '@/lib/api-client';
import { getAccountPreferencesVersion } from '@/lib/persist-account-preferences';
import { useAuthStore } from '@/stores/auth.store';
import { type ServerUiPreferences, useUiPreferencesStore } from '@/stores/ui-preferences.store';

/** Coming back to the tab re-checks the server at most this often. */
export const ACCOUNT_PREFERENCES_FOCUS_SYNC_MIN_INTERVAL_MS = 20_000;

/**
 * Keeps this device in step with changes the same account made elsewhere: whenever the tab or window
 * becomes active again, the saved preferences are re-read from the server.
 * A snapshot is dropped if the user changed something locally while it was on its way.
 */
export function useSyncAccountPreferencesOnFocus(): void {
  const accessToken = useAuthStore((state) => state.accessToken);

  React.useEffect(() => {
    if (!accessToken) return;

    let lastSyncAt = Date.now();
    let inFlight = false;

    const sync = async () => {
      if (inFlight || Date.now() - lastSyncAt < ACCOUNT_PREFERENCES_FOCUS_SYNC_MIN_INTERVAL_MS) return;
      inFlight = true;
      lastSyncAt = Date.now();
      const versionAtStart = getAccountPreferencesVersion();
      try {
        const profile = await apiClient.get<{ uiPreferences?: ServerUiPreferences }>('/api/v1/profile');
        if (profile.uiPreferences && versionAtStart === getAccountPreferencesVersion()) {
          useUiPreferencesStore.getState().hydrateFromServer(profile.uiPreferences);
        }
      } catch {
        // Offline or expired session: keep what is on screen, the next focus tries again.
      } finally {
        inFlight = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    const handleFocus = () => void sync();

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [accessToken]);
}
