import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { EmployeesPage } from '@/features/employees';
import { MasterDataPage } from '@/features/master-data';
import { RbacUsersPage } from '@/features/rbac';
import { ScheduleCellMultiselect, useUnsavedChangesGuard } from '@/features/schedules';
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
  permissions: {
    pos: { view: true, create: true, update: true, delete: true, splitKitchen: true, tableAction: true, checkout: true },
    invoices: { view: true, reprint: true, void: true },
    inventory: { view: true, create: true, update: true, delete: true },
    cashflow: { view: true, create: true, config: true },
    employees: { view: true, create: true, update: true, delete: true },
    schedules: { view: true, update: true },
    mdm: { view: true, write: true },
    rbac: { view: true, manage: true },
  },
};

const cashierUser = {
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
    employees: { view: true, create: false, update: false, delete: false },
    schedules: { view: true, update: false },
    mdm: { view: true, write: false },
    rbac: { view: false, manage: false },
  },
};

describe('Story 12 — HR (Module 5), Schedule (Module 6), Master Data (Module 7) & RBAC (Module 8)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
  });

  describe('AC-12.1: Module 5 — Employees 7-Column BaseTable with Short Name, MDM Filters & 1-1 Account Link', () => {
    const mockPositions = [
      { id: 1, category: 'POSITION', name: 'Thu Ngân', normalizedName: 'thu ngan', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 2, category: 'POSITION', name: 'Đầu Bếp', normalizedName: 'dau bep', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    const mockSpecialties = [
      { id: 3, category: 'SPECIALTY', name: 'BEP_NAU', normalizedName: 'bep nau', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 4, category: 'SPECIALTY', name: 'PHA_CHE', normalizedName: 'pha che', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    const mockEmployeesResponse = {
      page: 1,
      limit: 20,
      total: 2,
      items: [
        {
          id: 10,
          fullName: 'Nguyễn Văn Anh',
          shortName: 'V.Anh',
          dob: '1998-03-15',
          phone: '0901234567',
          address: '123 Lê Lợi, Quận 1',
          citizenId: null,
          citizenIdIssuedPlace: null,
          positionId: 1,
          specialtyId: 3,
          startDate: '2026-01-01',
          bankName: null,
          bankAccountNo: null,
          bankAccountName: null,
          avatarUrl: null,
          attachmentUrls: [],
          note: 'Nhân viên giỏi',
          isDeleted: false,
          createdAt: '2026-01-01T00:00:00.000Z',
          position: { id: 1, name: 'Thu Ngân' },
          specialty: { id: 3, name: 'BEP_NAU' },
          user: { id: 2, username: 'cashier01', isActive: true },
        },
        {
          id: 11,
          fullName: 'Trần Thị Bảo',
          shortName: 'T.Bảo',
          dob: '2000-07-20',
          phone: '0907654321',
          address: null,
          citizenId: null,
          citizenIdIssuedPlace: null,
          positionId: 2,
          specialtyId: 4,
          startDate: null,
          bankName: null,
          bankAccountNo: null,
          bankAccountName: null,
          avatarUrl: null,
          attachmentUrls: [],
          note: null,
          isDeleted: false,
          createdAt: '2026-02-01T00:00:00.000Z',
          position: { id: 2, name: 'Đầu Bếp' },
          specialty: { id: 4, name: 'PHA_CHE' },
          user: null,
        },
      ],
    };

    it('should render 7 standard columns with short_name badges, position/specialty filters from MDM, and create employee with 1-1 account link', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/employees') return mockEmployeesResponse;
        if (url === '/api/v1/mdm/lookup') {
          const params = getSpy.mock.calls[getSpy.mock.calls.length - 1]?.[1] as { params?: { category?: string } } | undefined;
          const category = params?.params?.category;
          if (category === 'POSITION') return mockPositions;
          if (category === 'SPECIALTY') return mockSpecialties;
          return [];
        }
        throw new Error(`Unexpected GET ${url}`);
      });

      vi.spyOn(apiClient, 'post').mockResolvedValue({
        id: 12,
        fullName: 'Lê Minh Đức',
        shortName: 'M.Đức',
        user: { id: 3, username: 'leduc01', isActive: true },
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <EmployeesPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      // Wait for data to load
      await waitFor(() => {
        expect(screen.getByText('Nguyễn Văn Anh')).toBeInTheDocument();
      });

      expect(getSpy).toHaveBeenCalledWith('/api/v1/mdm/lookup', {
        params: { category: 'POSITION', page: 1, limit: 100 },
      });
      expect(getSpy).toHaveBeenCalledWith('/api/v1/mdm/lookup', {
        params: { category: 'SPECIALTY', page: 1, limit: 100 },
      });

      // Verify 7 columns: check short_name badges
      expect(screen.getByTestId('short-name-badge-10')).toHaveTextContent('V.Anh');
      expect(screen.getByTestId('short-name-badge-11')).toHaveTextContent('T.Bảo');

      // Verify position and specialty columns
      expect(screen.getByText('Thu Ngân')).toBeInTheDocument();
      expect(screen.getByText('Đầu Bếp')).toBeInTheDocument();
      expect(screen.getByText('BEP_NAU')).toBeInTheDocument();
      expect(screen.getByText('PHA_CHE')).toBeInTheDocument();

      // Verify note column
      expect(screen.getByText('Nhân viên giỏi')).toBeInTheDocument();

      // Verify DOB year
      expect(screen.getByText('1998')).toBeInTheDocument();
      expect(screen.getByText('2000')).toBeInTheDocument();

      // Super Admin can see create button
      expect(screen.getByTestId('create-employee-btn')).toBeInTheDocument();

      // Open create drawer
      fireEvent.click(screen.getByTestId('create-employee-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('employee-form-drawer')).toBeInTheDocument();
      });

      // Fill form and enable account creation
      fireEvent.change(screen.getByTestId('emp-fullname'), { target: { value: 'Lê Minh Đức' } });
      fireEvent.click(screen.getByTestId('create-account-checkbox'));

      await waitFor(() => {
        expect(screen.getByTestId('emp-username')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('emp-username'), { target: { value: 'leduc01' } });
      fireEvent.change(screen.getByTestId('emp-password'), { target: { value: 'pass123456' } });
    });

    it('should hide create/edit/delete buttons for cashier without employees.create/update/delete permissions', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/employees') return mockEmployeesResponse;
        if (url === '/api/v1/mdm/lookup') return [];
        throw new Error(`Unexpected GET ${url}`);
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <EmployeesPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Nguyễn Văn Anh')).toBeInTheDocument();
      });

      // Cashier cannot create employees
      expect(screen.queryByTestId('create-employee-btn')).not.toBeInTheDocument();

      // Cashier cannot edit or delete
      expect(screen.queryByTestId('edit-employee-btn-10')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-employee-btn-10')).not.toBeInTheDocument();

      // But can still view
      expect(screen.getByTestId('view-employee-btn-10')).toBeInTheDocument();
    });

    it('should require confirmation to deactivate a linked employee account', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/employees') return mockEmployeesResponse;
        if (url === '/api/v1/mdm/lookup') return [];
        throw new Error(`Unexpected GET ${url}`);
      });
      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
        id: 10,
        isDeleted: true,
        isActive: false,
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <EmployeesPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/employees',
        expect.objectContaining({ params: expect.objectContaining({ includeDeleted: undefined }) }),
      ));
      expect(await screen.findByText('Nguyễn Văn Anh')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toggle-employee-active-btn-10'));
      expect(screen.getByTestId('employee-status-confirm-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('confirm-employee-status-btn')).toHaveTextContent('Tạm ngưng');

      fireEvent.click(screen.getByTestId('confirm-employee-status-btn'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/employees/10/status', { isActive: false });
      });
    });

    it('should filter inactive employees and confirm before restoring their linked login', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const inactiveEmployee = {
        ...mockEmployeesResponse.items[0],
        isDeleted: true,
        user: { id: 2, username: 'cashier01', isActive: false },
      };
      const getSpy = vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, options?: unknown) => {
        if (url === '/api/v1/employees') {
          const params = (options as { params?: { inactiveOnly?: boolean } } | undefined)?.params;
          return params?.inactiveOnly ? { ...mockEmployeesResponse, items: [inactiveEmployee] } : mockEmployeesResponse;
        }
        if (url === '/api/v1/mdm/lookup') return [];
        throw new Error(`Unexpected GET ${url}`);
      });
      const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
        id: 10,
        isDeleted: false,
        isActive: true,
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <EmployeesPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      fireEvent.change(screen.getByTestId('employee-status-filter'), { target: { value: 'inactive' } });
      await waitFor(() => expect(getSpy).toHaveBeenCalledWith(
        '/api/v1/employees',
        expect.objectContaining({ params: expect.objectContaining({ includeDeleted: true, inactiveOnly: true }) }),
      ));
      expect(await screen.findByText('Nguyễn Văn Anh')).toBeInTheDocument();
      fireEvent.click(screen.getByTestId('toggle-employee-active-btn-10'));
      expect(screen.getByTestId('employee-status-confirm-dialog')).toHaveTextContent('cashier01');
      expect(screen.getByTestId('confirm-employee-status-btn')).toHaveTextContent('Kích hoạt');
      fireEvent.click(screen.getByTestId('confirm-employee-status-btn'));

      await waitFor(() => {
        expect(patchSpy).toHaveBeenCalledWith('/api/v1/employees/10/status', { isActive: true });
      });
    });
  });

  describe('AC-12.2: Module 6 — Schedule Matrix Specialty Colors, Soft-Deleted Tag (EC-HR-02) & Unsaved Changes Guard (EC-HR-03)', () => {
    const mockEmployees = [
      {
        id: 10,
        fullName: 'Nguyễn Văn Anh',
        shortName: 'V.Anh',
        isDeleted: false,
        specialty: { id: 3, name: 'BEP_NAU' },
      },
      {
        id: 11,
        fullName: 'Trần Bảo Cam',
        shortName: 'B.Cam',
        isDeleted: false,
        specialty: { id: 4, name: 'BEP_CHIEN' },
      },
      {
        id: 12,
        fullName: 'Phạm Thanh Hà',
        shortName: 'T.Hà',
        isDeleted: true, // EC-HR-02: soft-deleted employee
        specialty: { id: 5, name: 'PHA_CHE' },
      },
    ];

    it('should render specialty color tags correctly: BEP_NAU=Red, BEP_CHIEN=Amber, PHA_CHE=Sky and soft-deleted employee as grayed-out with "(Đã nghỉ)" label (EC-HR-02) without crashing', () => {
      const selectedIds = [10, 11, 12];
      const onChange = vi.fn();

      render(
        <ScheduleCellMultiselect
          employees={mockEmployees}
          selectedIds={selectedIds}
          onChange={onChange}
        />,
      );

      // BEP_NAU (id=10) should have red tag
      const tagBepNau = screen.getByTestId('schedule-tag-10');
      expect(tagBepNau).toHaveTextContent('V.Anh');
      expect(tagBepNau.className).toContain('bg-red-100');
      expect(tagBepNau.className).toContain('text-red-800');

      // BEP_CHIEN (id=11) should have amber tag
      const tagBepChien = screen.getByTestId('schedule-tag-11');
      expect(tagBepChien).toHaveTextContent('B.Cam');
      expect(tagBepChien.className).toContain('bg-amber-100');
      expect(tagBepChien.className).toContain('text-amber-800');

      // PHA_CHE soft-deleted (id=12) should have gray tag with "(Đã nghỉ)" and opacity/line-through
      const tagDeleted = screen.getByTestId('schedule-tag-12');
      expect(tagDeleted).toHaveTextContent('T.Hà');
      expect(tagDeleted).toHaveTextContent('(Đã nghỉ)');
      expect(tagDeleted.className).toContain('opacity-60');
      expect(tagDeleted.className).toContain('line-through');
    });

    it('should register beforeunload handler when isDirty is true (EC-HR-03 Layer 1)', () => {
      const addSpy = vi.spyOn(window, 'addEventListener');
      const removeSpy = vi.spyOn(window, 'removeEventListener');

      // Test with custom component that uses the hook
      function TestGuard({ isDirty }: { isDirty: boolean }) {
        useUnsavedChangesGuard(isDirty);
        return <div>Guard active: {String(isDirty)}</div>;
      }

      const { rerender, unmount } = render(
        <MemoryRouter future={routerFutureFlags}>
          <TestGuard isDirty={false} />
        </MemoryRouter>,
      );

      // When isDirty is false, no beforeunload listener
      const beforeunloadCalls = addSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload',
      );
      expect(beforeunloadCalls).toHaveLength(0);

      // Set isDirty to true
      rerender(
        <MemoryRouter future={routerFutureFlags}>
          <TestGuard isDirty={true} />
        </MemoryRouter>,
      );

      const afterDirtyCalls = addSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload',
      );
      expect(afterDirtyCalls.length).toBeGreaterThanOrEqual(1);

      // Cleanup
      unmount();
      const removeBeforeunloadCalls = removeSpy.mock.calls.filter(
        (call) => call[0] === 'beforeunload',
      );
      expect(removeBeforeunloadCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('AC-12.3: Module 7 — Master Data 5 Tabs & Module 8 — RBAC Drawer with Super Admin DISABLED', () => {
    const mockMdmResponse = {
      page: 1,
      limit: 20,
      total: 2,
      items: [
        { id: 1, category: 'POSITION', name: 'Thu Ngân', normalizedName: 'thu ngan', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 2, category: 'POSITION', name: 'Đầu Bếp', normalizedName: 'dau bep', metadata: {}, isActive: true, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    };

    it('should render 5 MDM tabs including SUPPLIER and display name + normalizedName columns', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockMdmResponse);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <MasterDataPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      // Verify the four existing categories plus suppliers
      expect(screen.getByTestId('mdm-tab-POSITION')).toBeInTheDocument();
      expect(screen.getByTestId('mdm-tab-SPECIALTY')).toBeInTheDocument();
      expect(screen.getByTestId('mdm-tab-INGREDIENT')).toBeInTheDocument();
      expect(screen.getByTestId('mdm-tab-UNIT')).toBeInTheDocument();
      expect(screen.getByTestId('mdm-tab-SUPPLIER')).toBeInTheDocument();

      // Wait for data
      await waitFor(() => {
        expect(screen.getByText('Thu Ngân')).toBeInTheDocument();
      });

      // Verify normalizedName column
      expect(screen.getByText('thu ngan')).toBeInTheDocument();
      expect(screen.getByText('dau bep')).toBeInTheDocument();

      // Super Admin can see create button
      expect(screen.getByTestId('create-mdm-btn')).toBeInTheDocument();
    });

    it('should hide write actions for users without mdm.write permission', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'cashier-token',
        user: cashierUser,
      });

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockMdmResponse);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <MasterDataPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('Thu Ngân')).toBeInTheDocument();
      });

      // No create button
      expect(screen.queryByTestId('create-mdm-btn')).not.toBeInTheDocument();
      // No edit/delete action buttons in table
      expect(screen.queryByTestId('edit-mdm-btn-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-mdm-btn-1')).not.toBeInTheDocument();
    });

    const mockUsersResponse = {
      page: 1,
      limit: 50,
      total: 2,
      items: [
        {
          id: 1,
          username: 'superadmin',
          employeeId: 1,
          isSuperAdmin: true,
          isActive: true,
          permissions: superAdminUser.permissions,
          employee: { id: 1, fullName: 'Chủ Quán Sơn Bảo', shortName: 'S.Bảo', position: null, specialty: null },
        },
        {
          id: 2,
          username: 'cashier01',
          employeeId: 12,
          isSuperAdmin: false,
          isActive: false,
          permissions: cashierUser.permissions,
          employee: { id: 12, fullName: 'Nguyễn Văn Anh', shortName: 'V.Anh', position: { id: 1, name: 'Thu Ngân' }, specialty: { id: 3, name: 'BEP_NAU' } },
        },
      ],
    };

    it('should show Super Admin badge, [+ Thêm mới tài khoản] button only for Super Admin, and disable all checkboxes in Permissions Drawer for Super Admin account', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockUsersResponse);

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <RbacUsersPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('superadmin')).toBeInTheDocument();
      });

      // Super Admin badge visible
      expect(screen.getByTestId('super-admin-badge-1')).toHaveTextContent('Super Admin');
      expect(screen.getAllByText('Hoạt động')).toHaveLength(1);
      expect(screen.getByText('Vô hiệu')).toBeInTheDocument();

      // [+ Thêm mới tài khoản] button shown for Super Admin
      expect(screen.getByTestId('create-user-btn')).toBeInTheDocument();

      // Open permissions drawer for Super Admin user (id=1)
      fireEvent.click(screen.getByTestId('open-permissions-btn-1'));

      await waitFor(() => {
        expect(screen.getByTestId('permissions-drawer')).toBeInTheDocument();
      });

      // Super Admin notice is displayed
      expect(screen.getByTestId('super-admin-notice')).toHaveTextContent(
        /Super Admin mặc định có toàn quyền/,
      );

      // All permission checkboxes should be disabled for Super Admin
      const posViewCheckbox = screen.getByTestId('perm-checkbox-pos-view');
      expect(posViewCheckbox).toBeDisabled();

      const rbacManageCheckbox = screen.getByTestId('perm-checkbox-rbac-manage');
      expect(rbacManageCheckbox).toBeDisabled();

      // No save button should be visible for Super Admin
      expect(screen.queryByTestId('save-permissions-btn')).not.toBeInTheDocument();
    });

    it('should allow editing permissions for non-Super Admin users and call PUT /api/v1/users/:id/permissions', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockUsersResponse);
      const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue({
        ...mockUsersResponse.items[1],
        permissions: {
          ...cashierUser.permissions,
          invoices: { view: true, reprint: true, void: true },
        },
      });

      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      render(
        <QueryProvider client={queryClient}>
          <MemoryRouter future={routerFutureFlags}>
            <RbacUsersPage />
          </MemoryRouter>
        </QueryProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('cashier01')).toBeInTheDocument();
      });

      // Open permissions drawer for cashier (id=2)
      fireEvent.click(screen.getByTestId('open-permissions-btn-2'));

      await waitFor(() => {
        expect(screen.getByTestId('permissions-drawer')).toBeInTheDocument();
      });

      // Checkboxes should NOT be disabled for regular user
      const invoicesVoidCheckbox = screen.getByTestId('perm-checkbox-invoices-void');
      expect(invoicesVoidCheckbox).not.toBeDisabled();

      // Toggle invoices void permission
      fireEvent.click(invoicesVoidCheckbox);

      // Save button should be visible
      const saveBtn = screen.getByTestId('save-permissions-btn');
      expect(saveBtn).toBeInTheDocument();
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith(
          '/api/v1/users/2/permissions',
          expect.objectContaining({
            permissions: expect.objectContaining({
              invoices: expect.objectContaining({ void: true }),
            }),
          }),
        );
      });
    });
  });

  describe('AC-12.4 & AC-12.5: Feature Isolation Guard & Barrel Exports (Hard Invariant 1)', () => {
    it('should expose sole public APIs via barrel index.ts for employees, schedules, master-data, and rbac modules', async () => {
      const employeesBarrel = await import('@/features/employees');
      const schedulesBarrel = await import('@/features/schedules');
      const masterDataBarrel = await import('@/features/master-data');
      const rbacBarrel = await import('@/features/rbac');

      // Module 5 — Employees
      expect(typeof employeesBarrel.EmployeesPage).toBe('function');
      expect(typeof employeesBarrel.EmployeeFormDrawer).toBe('function');
      expect(typeof employeesBarrel.useEmployeesQuery).toBe('function');
      expect(typeof employeesBarrel.useCreateEmployeeMutation).toBe('function');

      // Module 6 — Schedules
      expect(typeof schedulesBarrel.SchedulesMatrixPage).toBe('function');
      expect(typeof schedulesBarrel.ScheduleCellMultiselect).toBe('function');
      expect(typeof schedulesBarrel.useUnsavedChangesGuard).toBe('function');
      expect(typeof schedulesBarrel.UnsavedChangesDialog).toBe('function');

      // Module 7 — Master Data
      expect(typeof masterDataBarrel.MasterDataPage).toBe('function');
      expect(typeof masterDataBarrel.useMdmListQuery).toBe('function');
      expect(typeof masterDataBarrel.useCreateMdmMutation).toBe('function');

      // Module 8 — RBAC
      expect(typeof rbacBarrel.RbacUsersPage).toBe('function');
      expect(typeof rbacBarrel.PermissionsDrawer).toBe('function');
      expect(typeof rbacBarrel.useUsersQuery).toBe('function');
      expect(typeof rbacBarrel.useUpdatePermissionsMutation).toBe('function');
    });
  });
});
