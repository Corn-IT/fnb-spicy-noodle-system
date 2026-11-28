import { DEFAULT_STORE_SETTINGS, UserPermissionsSchema } from '@fnb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';
import {
  unflattenColumnWidths,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';
import { resolvePublicAssetUrl } from '../asset-url';
import {
  readCachedStoreMessages,
  readMergedCachedMessages,
  resolveCachedAppMessage,
  resolveErrorFromStoreCache,
  STORE_MESSAGES_CACHE_KEY,
  writeCachedStoreMessages,
} from '../store-messages-cache';

describe('resolvePublicAssetUrl, store-messages-cache & useAuthStore edges', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    vi.restoreAllMocks();
  });

  it('resolves public asset URLs across empty, external, relative, and /api/v1 base forms', () => {
    expect(resolvePublicAssetUrl(null)).toBeNull();
    expect(resolvePublicAssetUrl('   ')).toBeNull();
    expect(resolvePublicAssetUrl('https://cdn.example.com/logo.png')).toBe('https://cdn.example.com/logo.png');
    expect(resolvePublicAssetUrl('/api/v1/public/avatars/2', 'http://127.0.0.1:3000/api/v1/')).toBe(
      'http://127.0.0.1:3000/api/v1/public/avatars/2',
    );
    expect(resolvePublicAssetUrl('/api/v1/public/avatars/2', '   ')).toBe('/api/v1/public/avatars/2');
  });

  it('reads/writes cached store messages & qrMessages defensively on invalid JSON or quota errors', () => {
    expect(readCachedStoreMessages()).toEqual({});

    localStorage.setItem(STORE_MESSAGES_CACHE_KEY, '{broken');
    expect(readCachedStoreMessages()).toEqual({});

    localStorage.setItem(STORE_MESSAGES_CACHE_KEY, JSON.stringify('invalid-shape'));
    expect(readCachedStoreMessages()).toEqual({});

    writeCachedStoreMessages('not-an-object' as never);
    expect(localStorage.getItem(STORE_MESSAGES_CACHE_KEY)).toBe('"invalid-shape"');

    writeCachedStoreMessages({ 'error.VALIDATION_FAILED': { title: 'Tiêu đề mới' } });
    expect(readCachedStoreMessages()).toMatchObject({
      'error.VALIDATION_FAILED': { title: 'Tiêu đề mới' },
    });

    localStorage.setItem('store_settings_cache', '{broken');
    expect(readMergedCachedMessages()).toMatchObject({
      'error.VALIDATION_FAILED': { title: 'Tiêu đề mới' },
    });

    localStorage.setItem(
      'store_settings_cache',
      JSON.stringify({
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: '2026-11-28T00:00:00.000Z',
        assets: { logo: null, favicon: null, qrLogo: null },
        qrMessages: { 'qr.banner.tableMoveNotice': { title: 'Xin chào QR' } },
      }),
    );
    expect(readMergedCachedMessages()).toMatchObject({
      'qr.banner.tableMoveNotice': { title: 'Xin chào QR' },
      'error.VALIDATION_FAILED': { title: 'Tiêu đề mới' },
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => writeCachedStoreMessages({ 'error.VALIDATION_FAILED': { title: 'OK' } })).not.toThrow();

    expect(resolveErrorFromStoreCache('UNKNOWN_ERR', 'Fallback message').title).toBeTruthy();
    expect(resolveCachedAppMessage('error.VALIDATION_FAILED').title).toBe('Tiêu đề mới');
  });

  it('handles useAuthStore updateUser (null vs authenticated) and clearAuthNotice', () => {
    useAuthStore.getState().updateUser({ fullName: 'Noop' });
    expect(useAuthStore.getState().user).toBeNull();

    useAuthStore.getState().setAuth({
      accessToken: 'tok-1',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Old',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
    useAuthStore.getState().updateUser({ fullName: 'Updated Name' });
    expect(useAuthStore.getState().user?.fullName).toBe('Updated Name');

    useAuthStore.getState().clearAuth('SESSION_EXPIRED', { reason: 'ADMIN_REVOKED', at: '2026-11-28T00:00:00Z' });
    expect(useAuthStore.getState().authNotice).toBe('SESSION_EXPIRED');
    useAuthStore.getState().clearAuthNotice();
    expect(useAuthStore.getState().authNotice).toBeNull();

    // ui-preferences helpers & theme toggles
    expect(unflattenColumnWidths({ colA: 120, 'orders.colB': 240 })).toEqual({
      default: { colA: 120 },
      orders: { colB: 240 },
    });
    const uiStore = useUiPreferencesStore.getState();
    uiStore.setTheme('light');
    uiStore.toggleTheme();
    expect(useUiPreferencesStore.getState().theme).toBe('dark');
    uiStore.toggleTheme();
    expect(useUiPreferencesStore.getState().theme).toBe('light');
    uiStore.resetThemeToStoreDefault();
    expect(useUiPreferencesStore.getState().hasExplicitTheme).toBe(false);
    uiStore.setUserVoiceAlertEnabled(true);
    uiStore.setAccountSyncPending(true);
    expect(useUiPreferencesStore.getState().userVoiceAlertEnabled).toBe(true);
    expect(useUiPreferencesStore.getState().accountSyncPending).toBe(true);
  });
});
