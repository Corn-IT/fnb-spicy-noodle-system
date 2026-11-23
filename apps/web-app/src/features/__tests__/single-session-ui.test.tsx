import { ErrorCodes, SocketEvents, UiPreferencesSchema, UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditHistoryDrawer } from '@/components/audit-history-drawer/audit-history-drawer';
import { useToastStore } from '@/components/ui/toast';
import { LoginPage } from '@/features/profile/components/login-page';
import { RbacUsersPage } from '@/features/rbac';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { AppProvider } from '@/providers/app-provider';
import { QueryProvider } from '@/providers/query-provider';
import { SocketProvider } from '@/providers/socket-provider';
import { AUTH_STORAGE_KEY, useAuthStore } from '@/stores/auth.store';
import { UI_PREFERENCES_STORAGE_KEY, useUiPreferencesStore } from '@/stores/ui-preferences.store';

const { socketHandlers, mockSocketInstance, loginMutateAsyncMock } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => void>();
  const socketInstance = {
    on: vi.fn((event: string, fn: (...args: unknown[]) => void) => {
      handlers.set(event, fn);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
  };
  return {
    socketHandlers: handlers,
    mockSocketInstance: socketInstance,
    loginMutateAsyncMock: vi.fn(),
  };
});

vi.mock('@/lib/socket-client', () => ({
  connectPosSocket: vi.fn(() => mockSocketInstance),
  disconnectPosSocket: vi.fn(),
}));

vi.mock('@/features/profile/api/auth.api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/profile/api/auth.api')>();
  return {
    ...actual,
    useLoginMutation: () => ({ mutateAsync: loginMutateAsyncMock, isPending: false }),
  };
});

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    pos: { view: true },
    rbac: { view: true, create: true, update: true, resetPassword: true },
  }),
};

describe('Single Active Session & IP/Device Audit UI (Frontend)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    socketHandlers.clear();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  it('clears auth immediately on 401 AUTH_SESSION_REPLACED without storing IP/device on client notice and preserves ui_preferences (Invariant 9)', async () => {
    const savedPrefs = JSON.stringify({ state: { theme: 'dark', sidebarWidth: 280 }, version: 0 });
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, savedPrefs);
    useAuthStore.getState().setAuth({
      accessToken: 'stale-token-a',
      user: superAdminUser,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 401,
          code: ErrorCodes.AUTH_SESSION_REPLACED,
          message: 'Tài khoản đã đăng nhập trên thiết bị khác.',
          details: {
            reason: 'NEW_LOGIN',
            at: '2026-11-17T08:15:00.000Z',
          },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(apiClient.get('/api/v1/users')).rejects.toBeInstanceOf(ApiClientError);

    // Never calls /auth/refresh when session was explicitly replaced
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.authNotice).toBe('SESSION_REPLACED');
    expect(state.authNoticeMeta).toEqual({
      reason: 'NEW_LOGIN',
      at: '2026-11-17T08:15:00.000Z',
    });
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBe(savedPrefs);
  });

  it('kicks user in 0ms when Socket receives session:revoked, clears Query cache, and preserves ui_preferences', async () => {
    const savedPrefs = JSON.stringify({ state: { theme: 'light', sidebarWidth: 240 }, version: 0 });
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, savedPrefs);

    const queryClient = new QueryClient();
    queryClient.setQueryData(['pos', 'tables'], [{ id: 1 }]);
    useAuthStore.getState().setAuth({
      accessToken: 'active-token',
      user: superAdminUser,
    });

    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(
      <QueryProvider client={queryClient}>
        <SocketProvider>
          <div>Active Screen</div>
        </SocketProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(socketHandlers.has(SocketEvents.SESSION_REVOKED)).toBe(true));

    act(() => {
      socketHandlers.get(SocketEvents.SESSION_REVOKED)?.({
        reason: 'NEW_LOGIN',
        at: '2026-11-17T08:20:00.000Z',
      });
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    expect(clearSpy).toHaveBeenCalled();
    expect(useAuthStore.getState().authNotice).toBe('SESSION_REPLACED');
    expect(useAuthStore.getState().authNoticeMeta).toEqual({
      reason: 'NEW_LOGIN',
      at: '2026-11-17T08:20:00.000Z',
    });
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBe(savedPrefs);
  });

  it('shows kick reason and timestamp (without leaking IP or device) on LoginPage when session was replaced or revoked', () => {
    useAuthStore.getState().clearAuth('SESSION_REPLACED', {
      reason: 'NEW_LOGIN',
      at: '2026-11-17T08:15:00.000Z',
    });

    const { rerender } = render(
      <MemoryRouter initialEntries={['/login']} future={routerFutureFlags}>
        <LoginPage />
      </MemoryRouter>,
    );

    const alert = screen.getByTestId('login-401-notice');
    expect(alert).toHaveTextContent('401 — Phiên làm việc đã kết thúc do có đăng nhập mới');
    expect(alert).toHaveTextContent('17/11/2026');
    expect(alert.textContent).not.toMatch(/IP:|192\.168\.|iPhone|Windows/);

    act(() => {
      useAuthStore.getState().clearAuth('SESSION_REVOKED', {
        reason: 'ADMIN_REVOKED',
        at: '2026-11-17T08:22:00.000Z',
      });
    });

    rerender(
      <MemoryRouter initialEntries={['/login']} future={routerFutureFlags}>
        <LoginPage />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('login-401-notice')).toHaveTextContent(
      '401 — Phiên đăng nhập đã bị Quản trị viên thu hồi',
    );
  });

  it('renders IP and Device forensic badge on AuditHistoryDrawer rows for Super Admin', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: superAdminUser,
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      items: [
        {
          id: 401,
          module: 'RBAC',
          actorId: 1,
          actorUsername: 'superadmin',
          actorFullName: 'Chủ Quán Sơn Bảo',
          action: 'Chiếm phiên đăng nhập',
          summary: 'đã đăng nhập từ thiết bị mới cho @cashier01',
          ipAddress: '192.168.1.88',
          deviceLabel: 'iPhone · Safari',
          metadata: {},
          createdAt: '2026-11-17T08:05:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    render(
      <QueryProvider client={new QueryClient()}>
        <AuditHistoryDrawer open onOpenChange={vi.fn()} module="RBAC" />
      </QueryProvider>,
    );

    const chip = await screen.findByTestId('audit-client-info-401');
    expect(chip).toHaveTextContent('IP: 192.168.1.88 · iPhone · Safari');
  });

  it('removes wide session column, shows compact status indicator & icon actions with session history dialog for superadmin', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'admin-token',
      user: superAdminUser,
    });

    const getMock = vi.spyOn(apiClient, 'get').mockImplementation(async (path: string) => {
      if (path.startsWith('/api/v1/users/2/session-history')) {
        return {
          user: {
            id: 2,
            username: 'cashier01',
            fullName: 'Nguyễn Văn Anh',
            isSuperAdmin: false,
            isActive: true,
          },
          currentSession: {
            isActiveSession: true,
            isSocketOnline: true,
            ipAddress: '192.168.1.42',
            deviceLabel: 'Windows · Chrome',
            startedAt: '2026-11-17T07:30:00.000Z',
          },
          items: [
            {
              id: 501,
              eventType: 'SESSION_REPLACED',
              actionLabel: 'Đăng nhập mới (đá phiên cũ)',
              summary: 'Đăng nhập đè',
              actorUsername: 'cashier01',
              actorFullName: 'Nguyễn Văn Anh',
              ipAddress: '192.168.1.42',
              deviceLabel: 'Windows · Chrome',
              previousIp: '192.168.1.12',
              previousDevice: 'iPhone · Safari',
              createdAt: '2026-11-17T07:30:00.000Z',
            },
            {
              id: 500,
              eventType: 'ADMIN_REVOKED',
              actionLabel: 'Bị thu hồi từ xa',
              summary: 'Thu hồi phiên',
              actorUsername: 'superadmin',
              actorFullName: 'Chủ Quán Sơn Bảo',
              ipAddress: '192.168.1.1',
              deviceLabel: 'macOS · Safari',
              previousIp: '192.168.1.12',
              previousDevice: 'iPhone · Safari',
              createdAt: '2026-11-17T07:00:00.000Z',
            },
            {
              id: 499,
              eventType: 'LOGIN_FAILED',
              actionLabel: 'Đăng nhập thất bại',
              summary: 'thử đăng nhập thất bại (Sai mật khẩu)',
              actorUsername: 'cashier01',
              actorFullName: 'Nguyễn Văn Anh',
              ipAddress: '203.113.10.9',
              deviceLabel: 'Android · Chrome',
              previousIp: null,
              previousDevice: null,
              createdAt: '2026-11-17T06:55:00.000Z',
            },
          ],
        };
      }
      if (path.startsWith('/api/v1/audit-logs/RBAC')) {
        return { items: [], total: 0, page: 1, limit: 20 };
      }
      if (path.startsWith('/api/v1/users')) {
        return {
          items: [
            {
              id: 2,
              employeeId: 12,
              username: 'cashier01',
              isSuperAdmin: false,
              isActive: true,
              permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
              employee: {
                id: 12,
                fullName: 'Nguyễn Văn Anh',
                shortName: 'V.Anh',
                avatarUrl: null,
                position: { name: 'Thu Ngân' },
                specialty: null,
              },
              session: {
                isActiveSession: true,
                isSocketOnline: true,
                ipAddress: '192.168.1.42',
                deviceLabel: 'Windows · Chrome',
                startedAt: '2026-11-17T07:30:00.000Z',
              },
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        };
      }
      return {};
    });

    const postMock = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({
      revoked: true,
      userId: 2,
    });

    render(
      <QueryProvider client={new QueryClient()}>
        <MemoryRouter future={routerFutureFlags}>
          <RbacUsersPage />
        </MemoryRouter>
      </QueryProvider>,
    );

    const statusIndicator = await screen.findByTestId('user-session-indicator-2');
    expect(statusIndicator).toHaveTextContent('Đang trực tuyến');
    expect(screen.queryByTestId('user-session-cell-2')).not.toBeInTheDocument();

    // Compact icon buttons carry accessible labels & titles
    const permBtn = screen.getByTestId('open-permissions-btn-2');
    const historyBtn = screen.getByTestId('session-history-btn-2');
    const revokeBtn = screen.getByTestId('revoke-session-btn-2');
    expect(permBtn).toHaveAttribute('aria-label', 'Phân quyền tài khoản');
    expect(historyBtn).toHaveAttribute('aria-label', 'Lịch sử phiên đăng nhập');
    expect(revokeBtn).toHaveAttribute('aria-label', 'Thu hồi phiên đăng nhập');

    // Open session history dialog
    fireEvent.click(historyBtn);
    const historyDialog = await screen.findByTestId('user-session-history-dialog');
    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith('/api/v1/users/2/session-history', { params: { limit: 5 } }),
    );
    expect(historyDialog).toHaveTextContent('Phiên hiện tại');
    expect(historyDialog).toHaveTextContent('192.168.1.42');
    expect(historyDialog).toHaveTextContent('Đăng nhập mới (đá phiên cũ)');
    expect(historyDialog).toHaveTextContent('Phiên cũ bị đá: iPhone · Safari · IP: 192.168.1.12');
    expect(historyDialog).toHaveTextContent('Bị thu hồi từ xa');
    expect(historyDialog).toHaveTextContent('Đăng nhập thất bại');
    expect(historyDialog).toHaveTextContent('Lý do: Nhập sai mật khẩu đăng nhập');
    expect(screen.getByTestId('session-history-open-full-audit-btn')).toHaveTextContent(
      'Xem toàn bộ lịch sử thao tác',
    );

    // Revoke session directly via the row icon button & confirmation dialog
    fireEvent.click(screen.getByTestId('session-history-revoke-btn'));
    const revokeDialog = await screen.findByTestId('revoke-session-dialog');
    expect(revokeDialog).toHaveTextContent('@cashier01');

    fireEvent.click(screen.getByTestId('confirm-revoke-session-btn'));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith('/api/v1/users/2/revoke-session'),
    );
  });

  it('hides session history & revoke icon buttons on RbacUsersPage when viewer is not Super Admin', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'staff-token',
      user: {
        ...superAdminUser,
        id: 3,
        username: 'adminview',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ rbac: { view: true } }),
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      items: [
        {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          isSuperAdmin: false,
          isActive: true,
          permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
          employee: {
            id: 12,
            fullName: 'Nguyễn Văn Anh',
            shortName: 'V.Anh',
            avatarUrl: null,
            position: { name: 'Thu Ngân' },
            specialty: null,
          },
          session: {
            isActiveSession: true,
            isSocketOnline: false,
            ipAddress: '192.168.1.42',
            deviceLabel: 'Windows · Chrome',
            startedAt: '2026-11-17T07:30:00.000Z',
          },
        },
      ],
      total: 1,
      page: 1,
      limit: 50,
    });

    render(
      <QueryProvider client={new QueryClient()}>
        <MemoryRouter future={routerFutureFlags}>
          <RbacUsersPage />
        </MemoryRouter>
      </QueryProvider>,
    );

    const indicator = await screen.findByTestId('user-session-indicator-2');
    expect(indicator).toHaveTextContent('Có phiên (chờ kết nối)');
    expect(screen.getByTestId('open-permissions-btn-2')).toBeInTheDocument();
    expect(screen.queryByTestId('session-history-btn-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('revoke-session-btn-2')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Lịch sử thao tác' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('create-user-btn')).not.toBeInTheDocument();
  });

  it('hides client IP/device search hints and badges in AuditHistoryDrawer when viewer is not Super Admin', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-token',
      user: {
        ...superAdminUser,
        id: 4,
        username: 'thungan',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({ pos: { view: true } }),
      },
    });

    vi.spyOn(apiClient, 'get').mockResolvedValueOnce({
      items: [
        {
          id: 402,
          module: 'POS',
          actorId: 4,
          actorUsername: 'thungan',
          actorFullName: 'Trần Thị Lan',
          action: 'Tạo đơn tại bàn',
          summary: 'đã tạo đơn HD-02',
          ipAddress: '192.168.1.90',
          deviceLabel: 'Windows · Chrome',
          metadata: {},
          createdAt: '2026-11-17T08:05:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    render(
      <QueryProvider client={new QueryClient()}>
        <AuditHistoryDrawer open onOpenChange={vi.fn()} module="POS" />
      </QueryProvider>,
    );

    expect(await screen.findByText('Đã tạo đơn HD-02')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('Tìm theo tên, tài khoản hoặc nội dung...'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('audit-client-info-402')).not.toBeInTheDocument();
  });

  it('auto-redirects authenticated users away from /login when opening a new tab in the same browser', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'live-tab-token',
      user: superAdminUser,
    });

    render(
      <MemoryRouter initialEntries={['/login']} future={routerFutureFlags}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pos" element={<h1>Màn hình POS</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Màn hình POS' })).toBeInTheDocument();
  });

  it('prompts confirmation dialog on 409 AUTH_SESSION_CONFLICT_ONLINE and forces login only when confirmed', async () => {
    loginMutateAsyncMock
      .mockReset()
      .mockRejectedValueOnce(
        new ApiClientError({
          statusCode: 409,
          error: 'Conflict',
          code: ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE,
          message: 'Tài khoản @superadmin hiện đang hoạt động ở nơi khác.',
          details: {
            username: 'superadmin',
            startedAt: '2026-11-17T10:15:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce({});

    render(
      <MemoryRouter initialEntries={['/login']} future={routerFutureFlags}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/pos" element={<h1>Màn hình POS</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Tên đăng nhập'), { target: { value: 'superadmin' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'Password@123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập Quầy POS' }));

    const dialog = await screen.findByTestId('login-session-conflict-dialog');
    expect(dialog).toHaveTextContent('@superadmin');
    expect(dialog).toHaveTextContent('17/11/2026');
    expect(dialog.textContent).not.toMatch(/IP:|192\.168\.|Windows/);
    expect(loginMutateAsyncMock).toHaveBeenCalledTimes(1);
    expect(loginMutateAsyncMock).toHaveBeenLastCalledWith({
      username: 'superadmin',
      password: 'Password@123',
    });

    // Clicking cancel closes dialog cleanly without calling force=true
    fireEvent.click(screen.getByTestId('cancel-force-login-btn'));
    await waitFor(() =>
      expect(screen.queryByTestId('login-session-conflict-dialog')).not.toBeInTheDocument(),
    );
    expect(loginMutateAsyncMock).toHaveBeenCalledTimes(1);

    // Re-trigger conflict, then confirm force login
    loginMutateAsyncMock
      .mockReset()
      .mockRejectedValueOnce(
        new ApiClientError({
          statusCode: 409,
          error: 'Conflict',
          code: ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE,
          message: 'Conflict',
          details: {
            username: 'superadmin',
            startedAt: '2026-11-17T10:15:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce({});

    fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập Quầy POS' }));
    await screen.findByTestId('login-session-conflict-dialog');
    fireEvent.click(screen.getByTestId('confirm-force-login-btn'));

    await waitFor(() =>
      expect(loginMutateAsyncMock).toHaveBeenLastCalledWith({
        username: 'superadmin',
        password: 'Password@123',
        force: true,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Màn hình POS' })).toBeInTheDocument();
  });

  it('synchronizes logout across tabs in the same browser via storage event while preserving ui_preferences', async () => {
    const savedPrefs = JSON.stringify({ state: { theme: 'dark', sidebarWidth: 280 }, version: 0 });
    localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, savedPrefs);

    vi.spyOn(apiClient, 'get').mockResolvedValue({} as never);
    vi.spyOn(apiClient, 'post').mockResolvedValue({} as never);

    const queryClient = new QueryClient();
    queryClient.setQueryData(['pos', 'tables'], [{ id: 1 }]);
    useAuthStore.getState().setAuth({
      accessToken: 'tab-token',
      user: superAdminUser,
    });
    const clearSpy = vi.spyOn(queryClient, 'clear');

    render(
      <AppProvider queryClient={queryClient}>
        <div>POS Tab 2</div>
      </AppProvider>,
    );

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: AUTH_STORAGE_KEY,
          newValue: JSON.stringify({ state: { user: null }, version: 0 }),
        }),
      );
    });

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBeNull());
    expect(useAuthStore.getState().user).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
    expect(localStorage.getItem(UI_PREFERENCES_STORAGE_KEY)).toBe(savedPrefs);
  });

  it('syncs updated RBAC permissions live via SocketEvents.PERMISSIONS_UPDATED without revoking session', async () => {
    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const cashierUser = {
      ...superAdminUser,
      id: 4,
      username: 'thungan',
      isSuperAdmin: false,
      permissions: UserPermissionsSchema.parse({ pos: { view: true }, menu: { view: false } }),
    };
    useAuthStore.getState().setAuth({
      accessToken: 'cashier-live-token',
      user: cashierUser,
    });

    render(
      <QueryProvider client={queryClient}>
        <SocketProvider>
          <div>Cashier Screen</div>
        </SocketProvider>
      </QueryProvider>,
    );

    await waitFor(() => expect(socketHandlers.has(SocketEvents.PERMISSIONS_UPDATED)).toBe(true));

    const nextPermissions = UserPermissionsSchema.parse({
      pos: { view: true },
      menu: { view: true, update: true },
    });

    act(() => {
      socketHandlers.get(SocketEvents.PERMISSIONS_UPDATED)?.({
        userId: 4,
        permissions: nextPermissions,
        updatedAt: '2026-11-17T13:30:00.000Z',
      });
    });

    await waitFor(() =>
      expect(useAuthStore.getState().user?.permissions.menu.view).toBe(true),
    );
    expect(useAuthStore.getState().user?.permissions.menu.update).toBe(true);
    expect(useAuthStore.getState().accessToken).toBe('cashier-live-token');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profile', 'me'] });
    expect(
      useToastStore.getState().toasts.some((t) => t.title === 'Quyền truy cập vừa được cập nhật'),
    ).toBe(true);
  });

  it('applies account preference changes pushed from another device via SocketEvents.ACCOUNT_PREFERENCES_UPDATED', async () => {
    useAuthStore.getState().setAuth({ accessToken: 'live-staff-token', user: { ...superAdminUser, id: 4 } });
    useUiPreferencesStore.setState({ sidebarCollapsed: false, userNavGroupOrder: [], accountSyncPending: false });

    render(
      <QueryProvider client={new QueryClient()}>
        <SocketProvider>
          <div>Staff Screen</div>
        </SocketProvider>
      </QueryProvider>,
    );
    await waitFor(() => expect(socketHandlers.has(SocketEvents.ACCOUNT_PREFERENCES_UPDATED)).toBe(true));
    const handler = () => socketHandlers.get(SocketEvents.ACCOUNT_PREFERENCES_UPDATED);
    const payload = (userId: number, sidebarCollapsed: boolean) => ({
      userId,
      uiPreferences: UiPreferencesSchema.parse({ sidebarCollapsed, navGroupOrder: ['finance', 'sales'] }),
      updatedAt: '2026-11-23T12:00:00.000Z',
    });

    // Another account's event is ignored.
    act(() => handler()?.(payload(9, true)));
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(false);

    // Malformed payloads are ignored.
    act(() => handler()?.({ userId: 4, uiPreferences: { sidebarCollapsed: 'yes' } }));
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(false);

    // This account's event is applied.
    act(() => handler()?.(payload(4, true)));
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(true);
    expect(useUiPreferencesStore.getState().userNavGroupOrder).toEqual(['finance', 'sales']);

    // But it never wipes a change that is still waiting to be saved from this device.
    useUiPreferencesStore.setState({ sidebarCollapsed: false, accountSyncPending: true });
    act(() => handler()?.(payload(4, true)));
    expect(useUiPreferencesStore.getState().sidebarCollapsed).toBe(false);
  });

  it('handles 422 wrong currentPassword on PATCH /api/v1/profile/password without triggering refresh/retry', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'live-staff-token',
      user: superAdminUser,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          statusCode: 422,
          error: 'Unprocessable Entity',
          code: ErrorCodes.VALIDATION_FAILED,
          message: 'Mật khẩu hiện tại không chính xác',
        }),
        { status: 422, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(
      apiClient.patch('/api/v1/profile/password', {
        currentPassword: 'WrongPassword@1',
        newPassword: 'NewPassword@123',
        confirmPassword: 'NewPassword@123',
      }),
    ).rejects.toMatchObject({
      statusCode: 422,
      message: 'Mật khẩu hiện tại không chính xác',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().accessToken).toBe('live-staff-token');
    expect(useAuthStore.getState().user).not.toBeNull();
  });
});
