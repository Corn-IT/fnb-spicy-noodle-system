import { UserPermissionsSchema } from '@fnb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { bootstrapAuthSession } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const refreshResponse = (uiPreferences?: Record<string, unknown>) => ({
  ok: true,
  status: 200,
  json: async () => ({
    accessToken: 'fresh-token',
    user: {
      id: 4,
      employeeId: 2,
      username: 'cashier01',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({}),
      employee: { fullName: 'Cashier One', avatarUrl: null },
      ...(uiPreferences ? { uiPreferences } : {}),
    },
  }),
});

describe('restoring a session with the refresh cookie', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    // After a page reload the user is remembered but the access token is gone.
    useAuthStore.getState().setAuth({
      accessToken: 'stale',
      user: {
        id: 4,
        employeeId: 2,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
    useAuthStore.setState({ accessToken: null });
    useUiPreferencesStore.setState({
      accountSyncPending: false,
      userDisplayScale: { perPath: {} },
      userNavOrder: [],
      userNavGroupOrder: [],
      userVoiceAlertEnabled: undefined,
      sidebarCollapsed: false,
    });
  });

  it('loads the account preferences from the server so a reload or a second device sees them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        refreshResponse({
          theme: 'light',
          sidebarCollapsed: true,
          displayScale: { globalPercent: 120, perPath: { '/pos': 110 } },
          navOrder: ['/pos'],
          voiceAlertEnabled: false,
        }),
      ),
    );

    const token = await bootstrapAuthSession();

    expect(token).toBe('fresh-token');
    const prefs = useUiPreferencesStore.getState();
    expect(prefs.sidebarCollapsed).toBe(true);
    expect(prefs.userDisplayScale).toEqual({ globalPercent: 120, perPath: { '/pos': 110 } });
    expect(prefs.userNavOrder).toEqual(['/pos']);
    expect(localStorage.getItem('fnb-pos-voice-alert')).toBe('false');
  });

  it('does not overwrite a local change that has not reached the server yet', async () => {
    useUiPreferencesStore.setState({ userNavOrder: ['/menu'], accountSyncPending: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshResponse({ navOrder: ['/pos'] })));

    await bootstrapAuthSession();

    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
  });

  it('leaves local preferences untouched when the response carries none', async () => {
    useUiPreferencesStore.setState({ userNavOrder: ['/menu'] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(refreshResponse()));

    await bootstrapAuthSession();

    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
  });
});
