import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeCleanLogout } from '@/components/layout/top-navbar';
import { UserPermissionsSchema } from '@fnb/shared';

import { apiClient } from '@/lib/api-client';
import {
  POS_DEFAULT_PATH,
  POS_DEVICE_MODE_STORAGE_KEY,
  POS_TOUCH_PATH,
  readPosDeviceMode,
  resolvePosHomePath,
  writePosDeviceMode,
} from '@/lib/pos-device-mode';
import { useAuthStore } from '@/stores/auth.store';

const signIn = (posView: boolean) =>
  useAuthStore.getState().setAuth({
    accessToken: 'tok',
    user: {
      id: 9,
      employeeId: 9,
      username: posView ? 'thungan' : 'ketoan',
      fullName: 'Nhân viên',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse(
        posView ? { pos: { view: true } } : { invoices: { view: true } },
      ),
    },
  });

describe('pos-device-mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useAuthStore.getState().clearAuth();
    signIn(true);
  });

  it('defaults to the mouse POS screen', () => {
    expect(readPosDeviceMode()).toBe('default');
    expect(resolvePosHomePath()).toBe(POS_DEFAULT_PATH);
  });

  it('sends this device to the touch screen once enabled, and back when disabled', () => {
    writePosDeviceMode('touch');
    expect(resolvePosHomePath()).toBe(POS_TOUCH_PATH);

    writePosDeviceMode('default');
    expect(localStorage.getItem(POS_DEVICE_MODE_STORAGE_KEY)).toBeNull();
    expect(resolvePosHomePath()).toBe(POS_DEFAULT_PATH);
  });

  it('survives logout because it belongs to the device, not the account', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue(undefined);
    writePosDeviceMode('touch');

    await executeCleanLogout(new QueryClient());

    expect(readPosDeviceMode()).toBe('touch');
    // Người tiếp theo đăng nhập (thu ngân) vẫn vào thẳng màn cảm ứng.
    signIn(true);
    expect(resolvePosHomePath()).toBe(POS_TOUCH_PATH);
  });

  it('keeps accounts without POS access on the regular screen even on a touch-mode device', () => {
    writePosDeviceMode('touch');
    signIn(false);
    expect(resolvePosHomePath()).toBe(POS_DEFAULT_PATH);
  });
});
