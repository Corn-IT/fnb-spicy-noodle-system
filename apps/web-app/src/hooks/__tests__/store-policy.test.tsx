import { DEFAULT_STORE_SETTINGS, UserPermissionsSchema } from '@fnb/shared';
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEffectiveNavOrder } from '@/hooks/use-effective-nav-order';
import { useDisplayScale } from '@/hooks/use-display-scale';
import { StoreSettingsContext, useStoreSettingsQuery } from '@/hooks/use-store-settings';
import { useStoreMessagesQuery } from '@/hooks/use-app-messages';
import { apiClient } from '@/lib/api-client';
import { ThemeProvider } from '@/providers/theme-provider';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

const settings = { ...DEFAULT_STORE_SETTINGS, defaultTheme: 'dark' as const, navOrder: ['/pos'], navGroupOrder: ['sales'], displayScale: { globalPercent: 150, perPath: {}, qrOrderPercent: 125 }, updatedAt: null, assets: { logo: null, favicon: null, qrLogo: null }, qrMessages: {} };

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  onlineManager.setOnline(true);
  useAuthStore.getState().clearAuth();
});

describe('store configuration authority', () => {
  it('ignores legacy account overrides on a 320px phone and retains them in storage', () => {
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(320);
    useUiPreferencesStore.setState({ theme: 'light', hasExplicitTheme: true, userDisplayScale: { globalPercent: 80, perPath: { '/pos': 80 } }, userNavOrder: ['/menu'], userNavGroupOrder: ['finance'] });
    function Consumer() {
      const { navOrder, navGroupOrder } = useEffectiveNavOrder();
      const percent = useDisplayScale('/pos');
      return <output>{JSON.stringify({ navOrder, navGroupOrder, percent })}</output>;
    }
    const view = render(<StoreSettingsContext.Provider value={{ settings }}><ThemeProvider><Consumer /></ThemeProvider></StoreSettingsContext.Provider>);
    expect(view.getByRole('status').textContent).toBe(JSON.stringify({ navOrder: ['/pos'], navGroupOrder: ['sales'], percent: 150 }));
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--page-zoom')).toBe('1.5');
    expect(useUiPreferencesStore.getState().userDisplayScale.globalPercent).toBe(80);
    expect(useUiPreferencesStore.getState().theme).toBe('light');
  });

  it('refreshes settings and authenticated messages on focus/reconnect and preserves cache on failure', async () => {
    useAuthStore.setState({ accessToken: 'token', user: { id: 1, employeeId: 1, username: 'cashier', fullName: 'Cashier', isSuperAdmin: false, permissions: UserPermissionsSchema.parse({}) } });
    const get = vi.spyOn(apiClient, 'get').mockImplementation(async (path) => path.includes('store-messages') ? { messages: {}, updatedAt: null } : settings);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    function wrapper({ children }: { children: ReactNode }) { return <QueryClientProvider client={client}>{children}</QueryClientProvider>; }
    const hook = renderHook(() => ({ settings: useStoreSettingsQuery(), messages: useStoreMessagesQuery() }), { wrapper });
    await waitFor(() => expect(hook.result.current.settings.data).toEqual(settings));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(4));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(6));
    get.mockRejectedValue(new Error('offline'));
    await act(async () => { await hook.result.current.settings.refetch(); });
    expect(hook.result.current.settings.data).toEqual(settings);
    get.mockImplementation(async (path) => path.includes('store-messages') ? { messages: {}, updatedAt: null } : { ...settings, storeName: 'Recovered' });
    act(() => focusManager.setFocused(false));
    act(() => focusManager.setFocused(true));
    await waitFor(() => expect(hook.result.current.settings.data?.storeName).toBe('Recovered'));
    hook.unmount();
    client.clear();
  });

  it('polls every 60 seconds only in the foreground', async () => {
    vi.useFakeTimers();
    focusManager.setFocused(true);
    const get = vi.spyOn(apiClient, 'get').mockResolvedValue(settings);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const hook = renderHook(() => useStoreSettingsQuery(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(get).toHaveBeenCalledTimes(2);
    act(() => focusManager.setFocused(false));
    await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
    expect(get).toHaveBeenCalledTimes(2);
    hook.unmount();
    client.clear();
  });
});
