import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      userDisplayScale: { perPath: {} },
      userNavOrder: [],
      userNavGroupOrder: [],
      userVoiceAlertEnabled: undefined,
      sidebarCollapsed: false,
    });
  });

  it('saves the account display scale and can reset it to the store default', async () => {
    renderCard();
    const select = screen.getByTestId('personal-display-scale-select') as HTMLSelectElement;
    expect(select.value).toBe('100');
    expect(screen.getByTestId('personal-display-scale-reset')).toBeDisabled();

    fireEvent.change(select, { target: { value: '120' } });

    expect(useUiPreferencesStore.getState().userDisplayScale.globalPercent).toBe(120);
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', {
        displayScale: { globalPercent: 120, perPath: {} },
      }),
    );

    fireEvent.click(screen.getByTestId('personal-display-scale-reset'));
    expect(useUiPreferencesStore.getState().userDisplayScale).toEqual({ perPath: {} });
    await waitFor(() =>
      expect(patch).toHaveBeenLastCalledWith('/api/v1/profile/ui-prefs', {
        displayScale: { perPath: {} },
      }),
    );
  });

  it('sets and clears a per-screen scale override', async () => {
    renderCard();
    const select = screen.getByTestId('personal-scale-path-pos') as HTMLSelectElement;

    fireEvent.change(select, { target: { value: '130' } });
    expect(useUiPreferencesStore.getState().userDisplayScale.perPath).toEqual({ '/pos': 130 });

    fireEvent.change(select, { target: { value: '' } });
    expect(useUiPreferencesStore.getState().userDisplayScale.perPath).toEqual({});
    // Both quick changes are merged into one request carrying the final state.
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { displayScale: { perPath: {} } });
  });

  it('keeps screens in their own ordered lists and never offers the profile as a menu item', () => {
    renderCard();

    const sales = within(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Bán hàng/ }));
    expect(sales.getByText('Bán hàng POS')).toBeInTheDocument();
    expect(sales.queryByText('Tổng quan')).not.toBeInTheDocument();
    // The profile is opened from the user menu, not the sidebar, so it is not an orderable menu item.
    expect(screen.queryByText('Hồ sơ Tài khoản Cá nhân', { selector: 'li span' })).not.toBeInTheDocument();
    expect(screen.getByTestId('personal-scale-path-profile')).toBeInTheDocument();
  });

  it('only shows lists that have at least two entries to reorder', () => {
    // A cashier-like account: the dashboard is a lone standalone screen and groups hold one screen each.
    useAuthStore.getState().setAuth({
      accessToken: 'token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'cashier',
        fullName: 'Cashier',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ pos: { view: true }, invoices: { view: true } }),
      },
    });
    renderCard();

    expect(screen.queryByRole('list', { name: 'Thứ tự màn hình độc lập' })).not.toBeInTheDocument();
    const lists = screen.queryAllByRole('list').filter((list) => /^Thứ tự/.test(list.getAttribute('aria-label') ?? ''));
    for (const list of lists) {
      expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(1);
    }
    // The two screens the account can reach share one group, so that single list is still offered.
    expect(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Bán hàng/ })).toBeInTheDocument();
  });

  it('reorders screens inside one group without touching other groups, then resets', async () => {
    renderCard();
    const sales = within(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Bán hàng/ }));
    const before = within(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Tài chính/ }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);

    fireEvent.click(sales.getByRole('button', { name: 'Đưa Bán hàng POS xuống' }));

    const order = useUiPreferencesStore.getState().userNavOrder;
    expect(order.indexOf('/menu')).toBeLessThan(order.indexOf('/pos'));
    await waitFor(() =>
      expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { navOrder: order }),
    );
    const salesItems = within(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Bán hàng/ }))
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(salesItems[0]).toContain('Quản trị Thực đơn');
    const after = within(screen.getByRole('list', { name: /Thứ tự màn hình trong nhóm Tài chính/ }))
      .getAllByRole('listitem')
      .map((item) => item.textContent);
    expect(after).toEqual(before);

    fireEvent.click(screen.getByTestId('personal-menu-reset'));
    expect(useUiPreferencesStore.getState().userNavOrder).toEqual([]);
    expect(useUiPreferencesStore.getState().userNavGroupOrder).toEqual([]);
  });

  it('reorders the menu groups', async () => {
    renderCard();
    const groups = within(screen.getByRole('list', { name: 'Thứ tự nhóm menu' }));
    const firstLabel = groups.getAllByRole('listitem')[0]?.textContent ?? '';

    fireEvent.click(groups.getAllByRole('button', { name: /xuống$/ })[0] as HTMLElement);

    const nextOrder = useUiPreferencesStore.getState().userNavGroupOrder;
    expect(nextOrder.length).toBeGreaterThan(1);
    const afterFirst = within(screen.getByRole('list', { name: 'Thứ tự nhóm menu' })).getAllByRole('listitem')[0]?.textContent;
    expect(afterFirst).not.toBe(firstLabel);
    await waitFor(
      () => expect(patch).toHaveBeenCalledWith('/api/v1/profile/ui-prefs', { navGroupOrder: nextOrder }),
      { timeout: 2000 },
    );
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
    fireEvent.change(screen.getByTestId('personal-display-scale-select'), { target: { value: '110' } });

    expect(useUiPreferencesStore.getState().userDisplayScale.globalPercent).toBe(110);
    await waitFor(
      () => expect(screen.getByRole('status')).toHaveTextContent('Không lưu được lên máy chủ'),
      { timeout: 2000 },
    );
  });
});
