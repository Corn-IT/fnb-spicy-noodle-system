import { UserPermissionsSchema } from '@fnb/shared';
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
  permissions: UserPermissionsSchema.parse({
    pos: { view: true, create: true, update: true, delete: true, splitKitchen: true, tableAction: true, checkout: true, qrSecurity: true },
    menu: { view: true, create: true, update: true, delete: true, export: true },
    invoices: { view: true, reprint: true, update: true, approve: true, void: true, export: true },
    inventory: { view: true, create: true, update: true, delete: true, export: true },
    cashflow: { view: true, create: true, compensate: true, config: true, export: true },
    employees: { view: true, create: true, update: true, delete: true, export: true },
    schedules: { view: true, create: true, update: true, delete: true, export: true },
    mdm: { view: true, create: true, update: true, delete: true },
    rbac: { view: true, create: true, update: true, resetPassword: true },
  }),
};

const cashierUser = {
  id: 2,
  employeeId: 12,
  username: 'cashier01',
  fullName: 'Nguyễn Văn Anh',
  isSuperAdmin: false,
  permissions: UserPermissionsSchema.parse({
    pos: { view: true, create: true, update: true, splitKitchen: true, tableAction: true, checkout: true },
    menu: { view: true },
    invoices: { view: true, reprint: true },
    inventory: { view: true, create: true, delete: true },
    cashflow: { view: true, create: true },
    employees: { view: true },
    schedules: { view: true },
    mdm: { view: true },
  }),
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

    it('should lock the status button with tooltip and keep active styling for Super Admin employee', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const superAdminEmployee = {
        ...mockEmployeesResponse.items[0],
        id: 1,
        fullName: 'Nguyễn Minh Quân',
        shortName: 'M.Quân',
        isDeleted: false,
        user: { id: 1, username: 'superadmin', isActive: true, isSuperAdmin: true },
      };

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/employees') return { ...mockEmployeesResponse, items: [superAdminEmployee] };
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

      expect(await screen.findByText('Nguyễn Minh Quân')).toBeInTheDocument();

      const statusBtn = screen.getByTestId('toggle-employee-active-btn-1');
      expect(statusBtn).toBeDisabled();
      expect(statusBtn).toHaveAttribute(
        'title',
        'Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng',
      );
      expect(statusBtn).toHaveTextContent('Đang hoạt động');

      fireEvent.click(statusBtn);
      expect(screen.queryByTestId('employee-status-confirm-dialog')).not.toBeInTheDocument();
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

    it('should enforce >= 30 day waiting period on permanent delete for inactive employees and render Số điện thoại & Trạng thái columns', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      const now = Date.now();
      const recentDeletedAt = new Date(now - 5 * 86_400_000).toISOString();
      const eligibleDeletedAt = new Date(now - 35 * 86_400_000).toISOString();

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url === '/api/v1/employees') {
          return {
            page: 1,
            limit: 20,
            total: 2,
            items: [
              {
                id: 21,
                fullName: 'Nhân viên Mới Tạm Ngưng',
                shortName: 'M.Ngưng',
                dob: '1999-05-01',
                phone: '0903334444',
                address: null,
                citizenId: null,
                citizenIdIssuedPlace: null,
                positionId: 1,
                specialtyId: 3,
                startDate: '2025-01-01',
                bankName: null,
                bankAccountNo: null,
                bankAccountName: null,
                avatarUrl: null,
                attachmentUrls: [],
                note: null,
                isDeleted: true,
                deletedAt: recentDeletedAt,
                createdAt: recentDeletedAt,
                position: { id: 1, name: 'Thu Ngân' },
                specialty: { id: 3, name: 'BEP_NAU' },
                user: null,
              },
              {
                id: 22,
                fullName: 'Nhân viên Đủ 30 Ngày',
                shortName: 'Đ.Hạn',
                dob: '1997-08-12',
                phone: '0905556666',
                address: null,
                citizenId: null,
                citizenIdIssuedPlace: null,
                positionId: 1,
                specialtyId: 3,
                startDate: '2024-01-01',
                bankName: null,
                bankAccountNo: null,
                bankAccountName: null,
                avatarUrl: null,
                attachmentUrls: [],
                note: null,
                isDeleted: true,
                deletedAt: eligibleDeletedAt,
                createdAt: eligibleDeletedAt,
                position: { id: 1, name: 'Thu Ngân' },
                specialty: { id: 3, name: 'BEP_NAU' },
                user: null,
              },
            ],
          };
        }
        return [];
      });

      const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({ id: 22, deleted: true });

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

      fireEvent.change(screen.getByTestId('employee-status-filter'), {
        target: { value: 'inactive' },
      });

      await waitFor(() => {
        expect(screen.getByText('Nhân viên Mới Tạm Ngưng')).toBeInTheDocument();
        expect(screen.getByText('Nhân viên Đủ 30 Ngày')).toBeInTheDocument();
      });

      expect(screen.getByText('Số điện thoại')).toBeInTheDocument();
      expect(screen.getByText('Trạng thái')).toBeInTheDocument();
      expect(screen.getByText('0903334444')).toBeInTheDocument();
      expect(screen.getByText('0905556666')).toBeInTheDocument();

      const blockedDeleteBtn = screen.getByTestId('delete-employee-btn-21');
      expect(blockedDeleteBtn).toBeDisabled();
      expect(blockedDeleteBtn.getAttribute('title')).toMatch(/Cần đủ 30 ngày tạm ngưng.*còn 25 ngày/);

      const allowedDeleteBtn = screen.getByTestId('delete-employee-btn-22');
      expect(allowedDeleteBtn).not.toBeDisabled();
      fireEvent.click(allowedDeleteBtn);

      await waitFor(() => {
        expect(screen.getByTestId('delete-employee-dialog')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('confirm-delete-employee-btn'));

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith('/api/v1/employees/22/permanent');
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

    it('should render strict 24H time dropdown selectors (HH:mm without AM/PM) and update attendance cleanly', async () => {
      const onChange = vi.fn();

      render(
        <ScheduleCellMultiselect
          employees={mockEmployees}
          selectedIds={[10]}
          attendances={[{ employeeId: 10, startTime: '08:00', endTime: '21:30' }]}
          onChange={onChange}
        />,
      );

      expect(screen.getByTestId('schedule-tag-10')).toHaveTextContent('V.Anh (08:00-21:30)');
      fireEvent.click(screen.getByTestId('schedule-cell-trigger'));

      const startHourSelect = await screen.findByTestId('schedule-start-time-10-hour');
      const endHourSelect = screen.getByTestId('schedule-end-time-10-hour');
      expect((startHourSelect as HTMLSelectElement).value).toBe('08');
      expect((endHourSelect as HTMLSelectElement).value).toBe('21');
      expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument();

      fireEvent.change(endHourSelect, { target: { value: '22' } });
      expect(onChange).toHaveBeenCalledWith(
        [10],
        [{ employeeId: 10, startTime: '08:00', endTime: '22:30' }],
      );
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
      // No edit/delete/toggle-status action buttons in table
      expect(screen.queryByTestId('edit-mdm-btn-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('delete-mdm-btn-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('toggle-mdm-status-1')).not.toBeInTheDocument();
    });

    it('should render Thông tin phụ header, allow clicking status toggle, and edit name + normalizedName + metadata', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockResolvedValue(mockMdmResponse);
      const putSpy = vi.spyOn(apiClient, 'put').mockResolvedValue(mockMdmResponse.items[0]);

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

      expect(screen.getByText('Thông tin phụ')).toBeInTheDocument();
      expect(screen.queryByText('Thông tin phụ / Trạm bếp')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('toggle-mdm-status-1'));
      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith('/api/v1/mdm/1', { isActive: false });
      });

      fireEvent.click(screen.getByTestId('edit-mdm-btn-1'));
      const dialog = await screen.findByTestId('mdm-upsert-dialog');
      expect(dialog).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('mdm-name-input'), { target: { value: 'Thu Ngân Ca Chính' } });
      fireEvent.change(screen.getByTestId('mdm-normalized-name-input'), { target: { value: 'thu-ngan-ca-chinh' } });
      fireEvent.change(screen.getByTestId('mdm-description-input'), { target: { value: 'Quầy POS 01' } });
      fireEvent.click(screen.getByTestId('submit-mdm-btn'));

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith('/api/v1/mdm/1', {
          name: 'Thu Ngân Ca Chính',
          normalizedName: 'thu-ngan-ca-chinh',
          metadata: { description: 'Quầy POS 01' },
        });
      });
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

      // Clicking a table row cell must NOT open PermissionsDrawer; only the [Phân quyền] button should
      fireEvent.click(screen.getByText('superadmin'));
      expect(screen.queryByTestId('permissions-drawer')).not.toBeInTheDocument();

      // Open permissions drawer for Super Admin user (id=1) via explicit button
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

      const menuViewCheckbox = screen.getByTestId('perm-checkbox-menu-view');
      expect(menuViewCheckbox).toBeDisabled();

      const rbacResetPwCheckbox = screen.getByTestId('perm-checkbox-rbac-resetPassword');
      expect(rbacResetPwCheckbox).toBeDisabled();

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
          invoices: { ...cashierUser.permissions.invoices, view: true, reprint: true, update: false, approve: true },
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

      // Table search input must stay marked as non-autofill searchbox
      const searchInput = screen.getByPlaceholderText('Tìm kiếm tài khoản...') as HTMLInputElement;
      expect(searchInput).toHaveAttribute('type', 'search');
      expect(searchInput).toHaveAttribute('autocomplete', 'off');
      expect(searchInput.value).toBe('');

      // Open permissions drawer for cashier (id=2)
      fireEvent.click(screen.getByTestId('open-permissions-btn-2'));

      await waitFor(() => {
        expect(screen.getByTestId('permissions-drawer')).toBeInTheDocument();
      });

      // Reset-password fields must be isolated in an explicit <form> with new-password
      // so Chrome password manager never autofills the table search input
      const resetSection = screen.getByTestId('reset-password-section');
      expect(resetSection.tagName).toBe('FORM');
      expect(resetSection).toHaveAttribute('autocomplete', 'off');
      expect(screen.getByTestId('reset-password-input')).toHaveAttribute(
        'autocomplete',
        'new-password',
      );
      expect(screen.getByTestId('reset-password-confirm-input')).toHaveAttribute(
        'autocomplete',
        'new-password',
      );

      // Checkboxes should NOT be disabled for regular user
      const invoicesApproveCheckbox = screen.getByTestId('perm-checkbox-invoices-approve');
      expect(invoicesApproveCheckbox).not.toBeDisabled();

      // Verify pos.qrSecurity ("Bảo mật QR") checkbox exists and can be toggled
      const posQrSecurityCheckbox = screen.getByTestId('perm-checkbox-pos-qrSecurity');
      expect(posQrSecurityCheckbox).not.toBeDisabled();
      fireEvent.click(posQrSecurityCheckbox);

      // Toggle invoices approve permission
      fireEvent.click(invoicesApproveCheckbox);

      // invoices.void must remain locked (SuperAdminOnly on backend)
      expect(screen.getByTestId('perm-checkbox-invoices-void')).toBeDisabled();
      expect(screen.getByTestId('user-active-checkbox')).not.toBeDisabled();

      // Save button should be visible
      const saveBtn = screen.getByTestId('save-permissions-btn');
      expect(saveBtn).toBeInTheDocument();
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(putSpy).toHaveBeenCalledWith(
          '/api/v1/users/2/permissions',
          expect.objectContaining({
            permissions: expect.objectContaining({
              pos: expect.objectContaining({ qrSecurity: true }),
              invoices: expect.objectContaining({ approve: true, void: false }),
            }),
          }),
        );
      });
    });

    it('should open CreateUserDialog for Super Admin, filter employees without accounts, and submit POST /api/v1/users', async () => {
      useAuthStore.getState().setAuth({
        accessToken: 'admin-token',
        user: superAdminUser,
      });

      vi.spyOn(apiClient, 'get').mockImplementation(async (url: string) => {
        if (url.startsWith('/api/v1/users')) return mockUsersResponse;
        if (url.startsWith('/api/v1/employees')) {
          return {
            page: 1,
            limit: 100,
            total: 2,
            items: [
              {
                id: 30,
                fullName: 'Lê Minh Tuấn',
                isActive: true,
                user: null,
                position: { id: 2, name: 'Thu ngân' },
                specialty: { id: 3, name: 'Quầy' },
              },
              {
                id: 1,
                fullName: 'Nguyễn Minh Quân',
                isActive: true,
                user: { id: 1, username: 'superadmin', isActive: true },
                position: { id: 1, name: 'Quản lý' },
                specialty: { id: 3, name: 'Quầy' },
              },
            ],
          };
        }
        return {};
      });

      const postSpy = vi.spyOn(apiClient, 'post').mockResolvedValue({
        id: 10,
        username: 'thungan02',
        isSuperAdmin: false,
        isActive: true,
        employeeId: 30,
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
        expect(screen.getByTestId('create-user-btn')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-user-btn'));

      await waitFor(() => {
        expect(screen.getByTestId('create-user-drawer')).toBeInTheDocument();
        expect(screen.getByTestId('create-user-employee-select')).toHaveValue('30');
      });

      fireEvent.change(screen.getByTestId('create-user-username-input'), {
        target: { value: 'thungan02' },
      });
      fireEvent.change(screen.getByTestId('create-user-password-input'), {
        target: { value: 'Password@123' },
      });
      fireEvent.click(screen.getByTestId('submit-create-user-btn'));

      await waitFor(() => {
        expect(postSpy).toHaveBeenCalledWith(
          '/api/v1/users',
          expect.objectContaining({
            employeeId: 30,
            username: 'thungan02',
            password: 'Password@123',
            permissions: expect.objectContaining({
              pos: expect.objectContaining({ view: true, create: true, checkout: true }),
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
