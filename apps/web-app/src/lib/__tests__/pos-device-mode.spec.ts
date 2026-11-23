import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeCleanLogout } from '@/components/layout/top-navbar';
import { apiClient } from '@/lib/api-client';
import {
  POS_DEFAULT_PATH,
  POS_DEVICE_MODE_STORAGE_KEY,
  POS_TOUCH_PATH,
  readPosDeviceMode,
  resolvePosHomePath,
  writePosDeviceMode,
} from '@/lib/pos-device-mode';

describe('pos-device-mode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
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

    expect(resolvePosHomePath()).toBe(POS_TOUCH_PATH);
  });
});
