import { UserPermissionsSchema } from '@fnb/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loginWithCredentials } from './auth.api';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

describe('loginWithCredentials', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.getState().clearAuth();
    useUiPreferencesStore.setState({
      theme: 'light',
      sidebarWidth: 260,
      sidebarCollapsed: false,
      columnWidths: {},
    });
  });

  it('should accept refresh-cookie login responses and map the joined employee into client auth state', async () => {
    const permissions = UserPermissionsSchema.parse({ pos: { view: true } });
    const response = {
      accessToken: 'access-token',
      user: {
        id: 4,
        employeeId: 2,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions,
        employee: {
          fullName: 'Cashier One',
          shortName: 'C.One',
          avatarUrl: 'https://assets.example/avatar.png',
          position: { id: 1, name: 'Thu Ngân' },
          specialty: null,
        },
        uiPreferences: { theme: 'dark' as const, sidebarWidth: 280, columnWidths: { 'orders.name': 240 } },
      },
    };
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue(response as never);

    const result = await loginWithCredentials({ username: 'cashier01', password: 'Password@123' });

    expect(post).toHaveBeenCalledWith('/api/v1/auth/login', {
      username: 'cashier01', password: 'Password@123',
    }, { skipAuthRefresh: true });
    expect(result).not.toHaveProperty('refreshToken');
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-token',
      user: { username: 'cashier01', fullName: 'Cashier One', avatarUrl: 'https://assets.example/avatar.png' },
    });
    expect(useUiPreferencesStore.getState()).toMatchObject({ theme: 'dark', sidebarWidth: 280 });
    expect(useUiPreferencesStore.getState().columnWidths).toEqual({ orders: { name: 240 } });
  });
});
