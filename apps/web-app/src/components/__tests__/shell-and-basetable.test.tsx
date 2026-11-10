import { QueryClient } from '@tanstack/react-query';
import { type ColumnDef } from '@tanstack/react-table';
import { UserPermissionsSchema } from '@fnb/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseTable } from '@/components/base-table/base-table';
import { CommandPalette } from '@/components/layout/command-palette';
import { RbacRouteGuard } from '@/components/layout/rbac-route-guard';
import { ResizableSidebar } from '@/components/layout/resizable-sidebar';
import { TopNavbar, executeCleanLogout } from '@/components/layout/top-navbar';
import { Toaster, useToastStore } from '@/components/ui/toast';
import { ProfilePage, type JoinedUserProfile } from '@/features/profile';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';
import {
  UI_PREFERENCES_STORAGE_KEY,
  useUiPreferencesStore,
} from '@/stores/ui-preferences.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

describe('Story 08 — Shell, Navbar, Command Palette, Profile & BaseTable 60fps', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
    useUiPreferencesStore.setState({
      theme: 'light',
      sidebarWidth: 260,
      sidebarCollapsed: false,
      columnWidths: {},
    });
  });

  describe('Toast interaction', () => {
    it('should let POS controls receive clicks through a visible toast while keeping its close button interactive', () => {
      useToastStore.getState().addToast({ title: 'Đăng nhập thành công' });

      render(
        <>
          <button type="button">Xác nhận Tạo Đơn</button>
          <Toaster />
        </>,
      );

      const toast = screen.getByRole('alert');
      const toastRegion = toast.parentElement;
      const closeButton = screen.getByRole('button', { name: 'Đóng thông báo' });

      expect(toastRegion).toHaveClass('pointer-events-none');
      expect(toast).toHaveClass('pointer-events-none');
      expect(closeButton).toHaveClass('pointer-events-auto');
    });

    it('should dismiss notifications after five seconds so POS actions are not covered indefinitely', () => {
      vi.useFakeTimers();
      useToastStore.getState().addToast({ title: 'Đăng nhập thành công' });

      render(<Toaster />);

      expect(screen.getByRole('alert')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('AC-08.1: Logout Preserves UI Preferences (Hard Invariant 9 & EC-UI-01)', () => {
    it('should clear queryClient cache and auth tokens while strictly preserving fnb-ui-preferences in localStorage and Zustand store', async () => {
      const queryClient = new QueryClient();
      queryClient.setQueryData(['invoices', { page: 1 }], { data: [{ id: 101 }] });

      useAuthStore.getState().setAuth({
        accessToken: 'jwt-access-token-123',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: true, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      const uiPrefs = useUiPreferencesStore.getState();
      uiPrefs.setTheme('dark');
      uiPrefs.setSidebarWidth(280);
      uiPrefs.setTableColumnWidths('invoices', { orderCode: 220, totalAmount: 180 });

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValueOnce({ ok: true });

      expect(queryClient.getQueryData(['invoices', { page: 1 }])).toBeDefined();
      expect(useAuthStore.getState().accessToken).toBe('jwt-access-token-123');

      await executeCleanLogout(queryClient);

      expect(queryClient.getQueryData(['invoices', { page: 1 }])).toBeUndefined();
      expect(useAuthStore.getState().accessToken).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(postSpy).toHaveBeenCalledWith('/api/v1/auth/logout');

      const rawStored = localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
      expect(rawStored).not.toBeNull();
      const parsedStored = JSON.parse(rawStored!);
      expect(parsedStored.state.theme).toBe('dark');
      expect(parsedStored.state.sidebarWidth).toBe(280);
      expect(parsedStored.state.columnWidths.invoices).toEqual({
        orderCode: 220,
        totalAmount: 180,
      });

      expect(useUiPreferencesStore.getState().theme).toBe('dark');
      expect(useUiPreferencesStore.getState().sidebarWidth).toBe(280);
      expect(useUiPreferencesStore.getState().columnWidths.invoices).toEqual({
        orderCode: 220,
        totalAmount: 180,
      });
    });
  });

  describe('AC-08.2: Command Palette & Sidebar RBAC Filtering (Hard Invariant 8 & EC-UI-02)', () => {
    it('should hide forbidden routes like Phân quyền (rbac) and Nhân viên (employees) when logged in as cashier01', () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      render(
        <MemoryRouter future={routerFutureFlags}>
          <ResizableSidebar />
          <CommandPalette open={true} onOpenChange={() => {}} />
        </MemoryRouter>,
      );

      expect(screen.getAllByText(/Bán hàng POS/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Quản lý Hoá đơn/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Nhập hàng Kho/i).length).toBeGreaterThan(0);

      expect(screen.queryByText(/Phân quyền Hệ thống/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Hồ sơ Nhân sự/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Quản trị Master Data/i)).not.toBeInTheDocument();
    });

    it('should show all routes when logged in as superadmin', () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: {
          id: 1,
          employeeId: 1,
          username: 'superadmin',
          fullName: 'Chủ Quán Sơn Bảo',
          isSuperAdmin: true,
          permissions: {
            pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
            invoices: { view: false, reprint: false, void: false },
            inventory: { view: false, create: false, update: false, delete: false },
            cashflow: { view: false, create: false, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      render(
        <MemoryRouter future={routerFutureFlags}>
          <CommandPalette open={true} onOpenChange={() => {}} />
        </MemoryRouter>,
      );

      expect(screen.getByText(/Phân quyền Hệ thống/i)).toBeInTheDocument();
      expect(screen.getByText(/Hồ sơ Nhân sự/i)).toBeInTheDocument();
      expect(screen.getByText(/Quản trị Master Data/i)).toBeInTheDocument();
    });

    it('should render 403 Forbidden screen without clearing auth session when cashier01 visits a restricted route', () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      render(
        <MemoryRouter initialEntries={['/rbac']} future={routerFutureFlags}>
          <Routes>
            <Route
              path="/rbac"
              element={
                <RbacRouteGuard module="rbac">
                  <div>RBAC Secret Page</div>
                </RbacRouteGuard>
              }
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('rbac-forbidden-screen')).toBeInTheDocument();
      expect(screen.getByText(/403 — Không đủ quyền truy cập/i)).toBeInTheDocument();
      expect(useAuthStore.getState().accessToken).toBe('cashier-token');
    });

    it('should show a destructive toast on HTTP 403 from apiClient while strictly keeping the user logged in, and auto-refresh token on HTTP 401', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'expired-access-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      const fetchMock = vi
        .spyOn(globalThis, 'fetch')
        // 1st call: 403 Forbidden
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 403,
              error: 'Forbidden',
              message: 'Thiếu quyền cấu hình ngân sách',
              code: 'RBAC_PERMISSION_DENIED',
            }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        // 2nd call: 401 Unauthorized -> triggers /api/v1/auth/refresh
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              statusCode: 401,
              error: 'Unauthorized',
              message: 'Token expired',
              code: 'AUTH_TOKEN_EXPIRED',
            }),
            { status: 401, headers: { 'Content-Type': 'application/json' } },
          ),
        )
        // Refresh call returns new accessToken
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ accessToken: 'fresh-access-token-999' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        )
        // Retried original request succeeds
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'ok-after-refresh' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );

      await expect(
        apiClient.put('/api/v1/cashflow/default-budget', { openingBudget: 1000000 }),
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'RBAC_PERMISSION_DENIED',
      });

      // Must NOT log out on 403!
      expect(useAuthStore.getState().accessToken).toBe('expired-access-token');
      expect(useToastStore.getState().toasts[0]?.title).toContain('403');

      // Now test 401 auto-refresh
      const refreshedResult = await apiClient.get<{ data: string }>('/api/v1/pos/tables');
      expect(refreshedResult.data).toBe('ok-after-refresh');
      expect(useAuthStore.getState().accessToken).toBe('fresh-access-token-999');
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('AC-08.3: Navbar Right-Corner Order', () => {
    it('should render right-corner controls in exact order: [Search Ctrl+K] -> [Theme Toggle] -> [Avatar + User Name Dropdown]', () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      const queryClient = new QueryClient();
      render(
        <MemoryRouter future={routerFutureFlags}>
          <TopNavbar queryClient={queryClient} onOpenCommandPalette={() => {}} />
        </MemoryRouter>,
      );

      const rightCluster = screen.getByTestId('navbar-right-controls');
      const buttons = Array.from(rightCluster.querySelectorAll('[data-navbar-item]')).map((el) =>
        el.getAttribute('data-navbar-item'),
      );

      expect(buttons).toEqual(['search-ctrl-k', 'theme-toggle', 'user-avatar-dropdown']);
    });
  });

  describe('AC-08.4: Profile Page Readonly Badges & 1-1 Employee Sync', () => {
    it('should display Chức vụ and Chuyên môn as readonly badges and submit updated phone, address, and bank details to PUT /api/v1/profile', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      const mockProfile: JoinedUserProfile = {
        id: 2,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({}),
        uiPreferences: { theme: 'system', sidebarWidth: 260, columnWidths: {} },
        employee: {
          id: 12,
          fullName: 'Nguyễn Văn Anh',
          shortName: 'V.Anh',
          phone: '0901112222',
          address: '123 Linh Xuân, Thủ Đức',
          bankName: 'Vietcombank',
          bankAccountNo: '0071001234567',
          bankAccountName: 'NGUYEN VAN ANH',
          avatarUrl: null,
          position: {
            id: 1,
            name: 'Thu Ngân Chính',
          },
          specialty: {
            id: 2,
            name: 'Quầy Pha Chế',
          },
        },
      };

      vi.spyOn(apiClient, 'get').mockResolvedValueOnce(mockProfile);
      const putSpy = vi
        .spyOn(apiClient, 'put')
        .mockImplementationOnce(async (_url, body) => ({
          ...mockProfile,
          employee: {
            ...mockProfile.employee,
            ...(body as Record<string, unknown>),
          },
        }));

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <ProfilePage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByTestId('badge-readonly-position')).toHaveTextContent('Thu Ngân Chính');
      });
      expect(screen.getByTestId('badge-readonly-specialty')).toHaveTextContent('Quầy Pha Chế');

      const phoneInput = screen.getByLabelText(/Số điện thoại/i);
      const addressInput = screen.getByLabelText(/Địa chỉ nơi ở hiện tại/i);
      const bankNoInput = screen.getByLabelText(/Số tài khoản/i);

      fireEvent.change(phoneInput, { target: { value: '0988777666' } });
      fireEvent.change(addressInput, { target: { value: '456 Võ Văn Ngân, Thủ Đức' } });
      fireEvent.change(bankNoInput, { target: { value: '999988887777' } });

      fireEvent.click(screen.getByRole('button', { name: /Lưu thay đổi Hồ sơ/i }));

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith(
          '/api/v1/profile',
          expect.objectContaining({
            fullName: 'Nguyễn Văn Anh',
            phone: '0988777666',
            address: '456 Võ Văn Ngân, Thủ Đức',
            bankName: 'Vietcombank',
            bankAccountNo: '999988887777',
            bankAccountName: 'NGUYEN VAN ANH',
          }),
        );
      });
    });

    it('should validate and submit a password change through the authenticated profile route', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: UserPermissionsSchema.parse({}),
        },
      });
      const mockProfile: JoinedUserProfile = {
        id: 2,
        username: 'cashier01',
        isSuperAdmin: false,
        permissions: UserPermissionsSchema.parse({}),
        uiPreferences: { theme: 'light', sidebarWidth: 260, columnWidths: {} },
        employee: {
          id: 12,
          fullName: 'Nguyễn Văn Anh',
          shortName: 'V.Anh',
          phone: null,
          address: null,
          bankName: null,
          bankAccountNo: null,
          bankAccountName: null,
          avatarUrl: null,
          position: null,
          specialty: null,
        },
      };
      vi.spyOn(apiClient, 'get').mockResolvedValue(mockProfile);
      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ message: 'Đổi mật khẩu thành công' });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <ProfilePage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await screen.findByText('Nguyễn Văn Anh');
      fireEvent.change(screen.getByTestId('profile-current-password'), { target: { value: 'current-pass' } });
      fireEvent.change(screen.getByTestId('profile-new-password'), { target: { value: 'new-pass-123' } });
      fireEvent.change(screen.getByTestId('profile-confirm-password'), { target: { value: 'new-pass-123' } });
      fireEvent.click(screen.getByTestId('change-password-submit'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/profile/password', {
          currentPassword: 'current-pass',
          newPassword: 'new-pass-123',
          confirmPassword: 'new-pass-123',
        });
      });
    });
  });

  describe('AC-08.1 & 3.2: BaseTable 60fps CSS Variables & Debounced Column Resize Persistence', () => {
    interface InvoiceRow {
      id: number;
      orderCode: string;
      totalAmount: number;
    }

    const columns: ColumnDef<InvoiceRow, unknown>[] = [
      { accessorKey: 'orderCode', header: 'Mã HĐ', size: 160 },
      { accessorKey: 'totalAmount', header: 'Tổng tiền', size: 140 },
    ];

    it('should apply CSS sizing variables on the table element and debounce 500ms before syncing column widths to localStorage and PATCH /api/v1/profile/ui-prefs', async () => {
      vi.useFakeTimers();
      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({ ok: true });

      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: {
          id: 2,
          employeeId: 12,
          username: 'cashier01',
          fullName: 'Nguyễn Văn Anh',
          isSuperAdmin: false,
          permissions: {
            pos: { view: true, create: true, update: true, delete: false, splitKitchen: true, tableAction: true, checkout: true },
            invoices: { view: true, reprint: true, void: false },
            inventory: { view: true, create: true, update: false, delete: true },
            cashflow: { view: true, create: true, config: false },
            employees: { view: false, create: false, update: false, delete: false },
            schedules: { view: false, update: false },
            mdm: { view: false, write: false },
            rbac: { view: false, manage: false },
          },
        },
      });

      render(
        <BaseTable
          tableId="invoices"
          data={[{ id: 1, orderCode: 'HD-20261107-0001', totalAmount: 185000 }]}
          columns={columns}
        />,
      );

      const tableEl = screen.getByRole('table');
      expect(tableEl.style.getPropertyValue('--col-orderCode-size')).toBe('160');

      const resizer = screen.getByTestId('column-resizer-orderCode');
      fireEvent.mouseDown(resizer, { clientX: 160 });
      fireEvent.mouseMove(document, { clientX: 220 });
      fireEvent.mouseUp(document);

      expect(patchSpy).not.toHaveBeenCalled();

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(useUiPreferencesStore.getState().columnWidths.invoices?.orderCode).toBe(220);
      expect(patchSpy).toHaveBeenCalledWith(
        '/api/v1/profile/ui-prefs',
        expect.objectContaining({
          columnWidths: expect.objectContaining({
            'invoices.orderCode': 220,
          }),
        }),
      );

      vi.useRealTimers();
    });
  });
});
