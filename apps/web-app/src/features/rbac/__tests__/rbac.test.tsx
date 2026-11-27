import { UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { RbacUsersPage } from '@/features/rbac';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

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
    pos: { view: true, create: true, update: true, delete: true, splitKitchen: true, tableAction: true, checkout: true },
    rbac: { view: true, create: true, update: true, resetPassword: true },
  }),
};

const rbacViewerUser = {
  id: 9,
  employeeId: 9,
  username: 'adminview',
  fullName: 'Quản Lý Xem',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    rbac: { view: true },
  }),
};

const sampleUsersResponse = {
  page: 1,
  limit: 50,
  total: 2,
  items: [
    {
      id: 1,
      username: 'superadmin',
      employeeId: 1,
      roleLabel: 'Chủ quán',
      isSuperAdmin: true,
      isActive: true,
      permissions: UserPermissionsSchema.parse({ rbac: { view: true } }),
      session: {
        isActiveSession: true,
        ipAddress: '192.168.1.10',
        deviceLabel: 'macOS · Chrome',
        startedAt: '2026-11-27T08:00:00.000Z',
      },
      employee: {
        id: 1,
        fullName: 'Chủ Quán Sơn Bảo',
        shortName: 'S.Bảo',
        position: { id: 1, name: 'Chủ quán' },
        specialty: null,
      },
    },
    {
      id: 2,
      username: 'cashier01',
      employeeId: 12,
      roleLabel: 'Thu ngân',
      isSuperAdmin: false,
      isActive: true,
      permissions: UserPermissionsSchema.parse({
        pos: { view: true, create: true, checkout: true },
      }),
      session: {
        isActiveSession: true,
        ipAddress: '192.168.1.55',
        deviceLabel: 'Android · Chrome',
        startedAt: '2026-11-27T09:15:00.000Z',
      },
      employee: {
        id: 12,
        fullName: 'Nguyễn Văn Anh',
        shortName: 'V.Anh',
        position: { id: 2, name: 'Thu Ngân' },
        specialty: { id: 3, name: 'PHA_CHE' },
      },
    },
  ],
};

function renderRbacPage(initialUrl = '/rbac') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return {
    queryClient,
    ...render(
      <QueryProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialUrl]} future={routerFutureFlags}>
          <RbacUsersPage />
        </MemoryRouter>
      </QueryProvider>,
    ),
  };
}

describe('RBAC Users Module (Wave 1 Comprehensive)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({
      accessToken: 'super-token',
      user: superAdminUser,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('masks sensitive session IP/history/admin actions for non-SuperAdmin rbac.view users and locks drawer editing', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'viewer-token',
      user: rbacViewerUser,
    });

    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url.startsWith('/api/v1/users')) {
        return {
          ...sampleUsersResponse,
          items: sampleUsersResponse.items.map((item) => ({
            ...item,
            session: {
              isActiveSession: item.session.isActiveSession,
              ipAddress: null,
              deviceLabel: null,
              startedAt: null,
            },
          })),
        };
      }
      if (url.startsWith('/api/v1/employees')) {
        return { items: [] };
      }
      if (url.startsWith('/api/v1/audit-logs')) {
        return { items: [], total: 0, page: 1, limit: 20 };
      }
      return {};
    });

    renderRbacPage();

    await waitFor(() => {
      expect(screen.getByText('cashier01')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('create-user-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('session-history-btn-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('revoke-session-btn-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('user-session-indicator-2')).toHaveTextContent('Có phiên (chờ kết nối)');
    expect(screen.getByTestId('user-session-indicator-2')).not.toHaveTextContent('192.168.1.55');

    // Non-SuperAdmin opening PermissionsDrawer sees read-only notice & cannot save
    fireEvent.click(screen.getByTestId('open-permissions-btn-2'));
    await waitFor(() => {
      expect(screen.getByTestId('permissions-drawer')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Chế độ chỉ xem: chỉ Super Admin mới có quyền chỉnh sửa phân quyền/),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('preset-cashier-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('save-permissions-btn')).not.toBeInTheDocument();
    expect(screen.getByTestId('perm-checkbox-pos-view')).toBeDisabled();
  });

  it('supports UserSessionHistoryDialog empty, error+retry, populated timeline, full-audit callback, and force revoke session', async () => {
    let historyFailOnce = true;
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/users') return sampleUsersResponse;
      if (url === '/api/v1/users/2/session-history') {
        if (historyFailOnce) {
          historyFailOnce = false;
          throw new Error('Network error');
        }
        return {
          user: { id: 2, username: 'cashier01', fullName: 'Nguyễn Văn Anh' },
          currentSession: sampleUsersResponse.items[1].session,
          items: [
            {
              id: 101,
              eventType: 'LOGIN_FAILED',
              actionLabel: 'Đăng nhập thất bại',
              summary: 'Sai mật khẩu đăng nhập',
              deviceLabel: 'iPhone · Safari',
              ipAddress: '113.161.10.2',
              previousDevice: null,
              previousIp: null,
              actorUsername: null,
              actorFullName: null,
              createdAt: '2026-11-27T09:14:00.000Z',
            },
            {
              id: 102,
              eventType: 'SESSION_REPLACED',
              actionLabel: 'Chiếm phiên đăng nhập',
              summary: 'Đăng nhập mới đá phiên cũ',
              deviceLabel: 'Android · Chrome',
              ipAddress: '192.168.1.55',
              previousDevice: 'Windows · Chrome',
              previousIp: '192.168.1.22',
              actorUsername: null,
              actorFullName: null,
              createdAt: '2026-11-27T09:15:00.000Z',
            },
            {
              id: 103,
              eventType: 'ADMIN_REVOKED',
              actionLabel: 'Thu hồi phiên',
              summary: 'Super Admin ngắt kết nối',
              deviceLabel: null,
              ipAddress: null,
              previousDevice: 'Windows · Chrome',
              previousIp: '192.168.1.22',
              actorUsername: 'superadmin',
              actorFullName: 'Chủ Quán Sơn Bảo',
              createdAt: '2026-11-27T09:16:00.000Z',
            },
          ],
        };
      }
      if (url.startsWith('/api/v1/audit-logs')) {
        return { items: [], total: 0, page: 1, limit: 20 };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({ revoked: true, userId: 2 });

    renderRbacPage();

    await waitFor(() => {
      expect(screen.getByTestId('session-history-btn-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('session-history-btn-2'));

    await waitFor(() => {
      expect(screen.getByTestId('user-session-history-dialog')).toBeInTheDocument();
      expect(screen.getByText(/Không tải được lịch sử phiên đăng nhập/)).toBeInTheDocument();
    });

    // Retry loads full event cards
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(screen.getByTestId('session-history-list')).toBeInTheDocument();
    });
    expect(screen.getByTestId('session-history-item-101')).toHaveTextContent('Lý do: Nhập sai mật khẩu đăng nhập');
    expect(screen.getByTestId('session-history-item-102')).toHaveTextContent('Phiên cũ bị đá: Windows · Chrome');
    expect(screen.getByTestId('session-history-item-103')).toHaveTextContent('@superadmin');

    // Trigger "Thu hồi phiên" from session history dialog -> opens confirm dialog -> POST revoke-session
    fireEvent.click(screen.getByTestId('session-history-revoke-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('revoke-session-dialog')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('confirm-revoke-session-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/users/2/revoke-session');
    });
  });

  it('supports per-module select-all toggle & client validation in CreateUserDialog and resets password validation in AccountDetailsDrawer', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
      if (url === '/api/v1/users') return sampleUsersResponse;
      if (url === '/api/v1/employees') {
        return {
          page: 1,
          limit: 100,
          total: 1,
          items: [
            {
              id: 30,
              fullName: 'Lê Minh Tuấn',
              isDeleted: false,
              user: null,
              position: { id: 2, name: 'Thu Ngân' },
            },
          ],
        };
      }
      return {};
    });

    const postSpy = vi.spyOn(apiClient, 'post').mockImplementation(async (url: string) => {
      if (url === '/api/v1/users') {
        return { id: 3, username: 'newstaff', isSuperAdmin: false, isActive: true, employeeId: 30 };
      }
      if (url === '/api/v1/users/2/reset-password') {
        return { id: 2, username: 'cashier01', passwordReset: true };
      }
      return {};
    });

    renderRbacPage();

    await waitFor(() => {
      expect(screen.getByTestId('create-user-btn')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('create-user-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('create-user-drawer')).toBeInTheDocument();
    });

    // Validation errors for short username & short password
    fireEvent.change(screen.getByTestId('create-user-username-input'), { target: { value: 'ab' } });
    fireEvent.change(screen.getByTestId('create-user-password-input'), { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('submit-create-user-btn'));
    expect(screen.getByTestId('create-user-error')).toHaveTextContent('Tên đăng nhập phải có ít nhất 3 ký tự.');

    fireEvent.change(screen.getByTestId('create-user-username-input'), { target: { value: 'newstaff' } });
    fireEvent.click(screen.getByTestId('submit-create-user-btn'));
    expect(screen.getByTestId('create-user-error')).toHaveTextContent('Mật khẩu phải có ít nhất 6 ký tự.');

    // Toggle entire `discounts` module on using the newly wired per-module Select All button
    fireEvent.click(screen.getByTestId('create-perm-select-all-discounts'));
    fireEvent.change(screen.getByTestId('create-user-password-input'), { target: { value: 'Secret@123' } });
    fireEvent.click(screen.getByTestId('submit-create-user-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(
        '/api/v1/users',
        expect.objectContaining({
          username: 'newstaff',
          permissions: expect.objectContaining({
            discounts: expect.objectContaining({ view: true, create: true, update: true, delete: true }),
          }),
        }),
      );
    });

    // Open AccountDetailsDrawer for cashier01 -> test reset password validation toasts & submission
    fireEvent.click(screen.getByTestId('open-account-details-btn-2'));
    await waitFor(() => {
      expect(screen.getByTestId('account-details-drawer')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: '12345' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm-input'), { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));
    expect(useToastStore.getState().toasts.some((t) => t.title.includes('6 ký tự') || t.description?.includes('6 ký tự'))).toBe(true);
    expect(postSpy).not.toHaveBeenCalledWith('/api/v1/users/2/reset-password', expect.anything());

    fireEvent.change(screen.getByTestId('reset-password-input'), { target: { value: 'Reset@123' } });
    fireEvent.change(screen.getByTestId('reset-password-confirm-input'), { target: { value: 'Mismatch@123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));
    expect(postSpy).not.toHaveBeenCalledWith('/api/v1/users/2/reset-password', expect.anything());

    fireEvent.change(screen.getByTestId('reset-password-confirm-input'), { target: { value: 'Reset@123' } });
    fireEvent.click(screen.getByTestId('reset-password-submit-btn'));

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith('/api/v1/users/2/reset-password', {
        newPassword: 'Reset@123',
      });
    });
  });

  it('supports presets (Manager & Clear) and module toggles inside PermissionsDrawer', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(sampleUsersResponse);
    const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(sampleUsersResponse.items[1]);

    renderRbacPage();

    await waitFor(() => {
      expect(screen.getByTestId('open-permissions-btn-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('open-permissions-btn-2'));
    await waitFor(() => {
      expect(screen.getByTestId('permissions-drawer')).toBeInTheDocument();
    });

    // Apply manager preset, then clear preset, then toggle pos module select-all
    fireEvent.click(screen.getByTestId('preset-manager-btn'));
    expect(screen.getByTestId('perm-checkbox-cashflow-compensate')).toBeChecked();

    fireEvent.click(screen.getByTestId('preset-clear-btn'));
    expect(screen.getByTestId('perm-checkbox-pos-view')).not.toBeChecked();

    fireEvent.click(screen.getByTestId('perm-select-all-pos'));
    expect(screen.getByTestId('perm-checkbox-pos-deleteDrafts')).toBeChecked();
    expect(screen.getByTestId('perm-checkbox-pos-openCashDrawer')).toBeChecked();

    fireEvent.click(screen.getByTestId('save-permissions-btn'));
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/users/2/permissions',
        expect.objectContaining({
          permissions: expect.objectContaining({
            pos: expect.objectContaining({
              view: true,
              deleteDrafts: true,
              openCashDrawer: true,
            }),
          }),
        }),
      );
    });
  });
});
