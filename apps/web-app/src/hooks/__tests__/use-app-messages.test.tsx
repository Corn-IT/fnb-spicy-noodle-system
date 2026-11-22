import { DEFAULT_STORE_SETTINGS, ErrorCodes } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { executeCleanLogout } from '@/components/layout/top-navbar';
import { StoreSettingsContext } from '@/hooks/use-store-settings';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth.store';
import {
  readCachedStoreMessages,
  STORE_MESSAGES_CACHE_KEY,
  useAppMessages,
  writeCachedStoreMessages,
} from '../use-app-messages';

describe('useAppMessages & apiClient dynamic ErrorCodes (Story 17)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  it('merges qrMessages + staff messages, resolves placeholders, and emits customized toasts via notify()', () => {
    localStorage.setItem(
      'store_settings_cache',
      JSON.stringify({
        ...DEFAULT_STORE_SETTINGS,
        updatedAt: null,
        assets: { logo: null, favicon: null, qrLogo: null },
        qrMessages: {
          'qr.banner.tableMoveNotice': { title: 'Đổi bàn nhớ báo thu ngân!' },
        },
      }),
    );
    writeCachedStoreMessages({
      'pos.kitchen.splitSuccess': {
        title: 'Bếp nhận Lượt #{batchNo}',
        description: 'Đã in {ticketCount} phiếu',
      },
    });
    expect(readCachedStoreMessages()).toEqual({
      'pos.kitchen.splitSuccess': {
        title: 'Bếp nhận Lượt #{batchNo}',
        description: 'Đã in {ticketCount} phiếu',
      },
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <StoreSettingsContext.Provider
        value={{
          settings: {
            ...DEFAULT_STORE_SETTINGS,
            updatedAt: null,
            assets: { logo: null, favicon: null, qrLogo: null },
            qrMessages: {
              'qr.banner.tableMoveNotice': { title: 'Đổi bàn nhớ báo thu ngân!' },
            },
          },
          messages: {
            'pos.kitchen.splitSuccess': {
              title: 'Bếp nhận Lượt #{batchNo}',
              description: 'Đã in {ticketCount} phiếu',
            },
          },
        }}
      >
        {children}
      </StoreSettingsContext.Provider>
    );

    const { result } = renderHook(() => useAppMessages(), { wrapper });

    expect(result.current.resolveMessage('qr.banner.tableMoveNotice').title).toBe(
      'Đổi bàn nhớ báo thu ngân!',
    );

    act(() => {
      result.current.notify('pos.kitchen.splitSuccess', {
        variant: 'success',
        vars: { batchNo: 4, ticketCount: 2 },
      });
    });

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.title).toBe('Bếp nhận Lượt #4');
    expect(toasts[0]?.description).toBe('Đã in 2 phiếu');
  });

  it('uses customized error.RBAC_PERMISSION_DENIED from store_messages_cache in apiClient 403 toast and preserves cache across logout (AC-17.8, Invariant 9)', async () => {
    writeCachedStoreMessages({
      [`error.${ErrorCodes.RBAC_PERMISSION_DENIED}`]: {
        title: 'Tài khoản thiếu quyền',
        description: 'Liên hệ Quản lý để mở khoá tính năng này.',
      },
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 403,
          error: 'Forbidden',
          code: ErrorCodes.RBAC_PERMISSION_DENIED,
          message: 'Bạn không có quyền thực hiện thao tác này',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(apiClient.get('/api/v1/settings')).rejects.toBeInstanceOf(ApiClientError);
    expect(fetchSpy).toHaveBeenCalled();

    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.title).toBe('Tài khoản thiếu quyền');
    expect(toasts[0]?.description).toBe('Liên hệ Quản lý để mở khoá tính năng này.');

    // Verify clean logout keeps store_messages_cache intact
    const queryClient = new QueryClient();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 204 }));
    await executeCleanLogout(queryClient);
    expect(localStorage.getItem(STORE_MESSAGES_CACHE_KEY)).toContain('Tài khoản thiếu quyền');
  });
});
