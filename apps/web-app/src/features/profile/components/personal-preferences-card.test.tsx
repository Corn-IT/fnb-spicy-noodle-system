import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PersonalPreferencesCard } from '@/features/profile/components/personal-preferences-card';
import { apiClient } from '@/lib/api-client';
import { resetAccountPreferencesQueueForTesting } from '@/lib/persist-account-preferences';
import { isQrVoiceAlertEnabled } from '@/lib/qr-voice-announcer';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

function renderCard() {
  return render(
    <QueryProvider client={new QueryClient()}>
      <PersonalPreferencesCard />
    </QueryProvider>,
  );
}

describe('PersonalPreferencesCard', () => {
  let patch: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    resetAccountPreferencesQueueForTesting();
    localStorage.clear();
    vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('offline'));
    patch = vi.spyOn(apiClient, 'patch').mockResolvedValue({} as never);
    useAuthStore.getState().setAuth({
      accessToken: 'token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Admin',
        isSuperAdmin: true,
        permissions: UserPermissionsSchema.parse({}),
      },
    });
    useUiPreferencesStore.setState({
      theme: 'light',
      hasExplicitTheme: false,
      sidebarWidth: 260,
      userDisplayScale: { perPath: {} },
      userNavOrder: [],
      userNavGroupOrder: [],
      userVoiceAlertEnabled: undefined,
      sidebarCollapsed: false,
    });
  });

  it('removes personal theme, scale and navigation controls while retaining stored values', () => {
    useUiPreferencesStore.setState({ theme: 'light', hasExplicitTheme: true, userDisplayScale: { globalPercent: 80, perPath: {} }, userNavOrder: ['/menu'], userNavGroupOrder: ['sales'] });
    renderCard();
    for (const id of ['personal-theme-select', 'personal-display-scale-select', 'personal-per-path-scale', 'personal-menu-reset']) {
      expect(screen.queryByTestId(id)).not.toBeInTheDocument();
    }
    expect(useUiPreferencesStore.getState().userDisplayScale.globalPercent).toBe(80);
    expect(useUiPreferencesStore.getState().userNavOrder).toEqual(['/menu']);
    expect(patch).not.toHaveBeenCalled();
  });

  it('syncs the voice toggle to device storage and the server', async () => {
    renderCard();
    const toggle = screen.getByTestId('personal-voice-toggle') as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);

    expect(isQrVoiceAlertEnabled()).toBe(false);
    expect(useUiPreferencesStore.getState().userVoiceAlertEnabled).toBe(false);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { voiceAlertEnabled: false }),
    );
  });

  it('syncs the collapsed sidebar toggle', async () => {
    renderCard();
    fireEvent.click(screen.getByTestId('personal-sidebar-collapsed-toggle'));

    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { sidebarCollapsed: true }),
    );
  });

  it('keeps the local change and reports it when the server save fails', async () => {
    patch.mockRejectedValue(new Error('network'));
    renderCard();
    fireEvent.click(screen.getByTestId('personal-sidebar-collapsed-toggle'));

    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent('Không lưu được lên máy chủ'),
      { timeout: 2000 },
    );
  });

  it('resets speaker and sidebar without deleting legacy store-controlled preferences', async () => {
    useUiPreferencesStore.setState({
      theme: 'dark',
      hasExplicitTheme: true,
      sidebarWidth: 320,
      sidebarCollapsed: true,
      userDisplayScale: { globalPercent: 125, perPath: { '/pos': 130 } },
      userNavOrder: ['/menu', '/pos'],
      userNavGroupOrder: ['finance', 'sales'],
      userVoiceAlertEnabled: false,
    });

    renderCard();
    const resetAllBtn = screen.getByTestId('personal-preferences-reset-all');
    expect(resetAllBtn).not.toBeDisabled();

    fireEvent.click(resetAllBtn);

    const state = useUiPreferencesStore.getState();
    expect(state.hasExplicitTheme).toBe(true);
    expect(state.sidebarWidth).toBe(260);
    expect(state.sidebarCollapsed).toBe(false);
    expect(state.userDisplayScale).toEqual({ globalPercent: 125, perPath: { '/pos': 130 } });
    expect(state.userNavOrder).toEqual(['/menu', '/pos']);
    expect(state.userNavGroupOrder).toEqual(['finance', 'sales']);
    expect(state.userVoiceAlertEnabled).toBe(true);
    expect(isQrVoiceAlertEnabled()).toBe(true);
    expect(resetAllBtn).toBeDisabled();

    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', {
        sidebarCollapsed: false,
        sidebarWidth: 260,
        voiceAlertEnabled: true,
      }),
    );
  });
});
