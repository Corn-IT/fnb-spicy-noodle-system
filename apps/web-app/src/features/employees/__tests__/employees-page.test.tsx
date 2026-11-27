import { defaultUserPermissions } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';
import { exportToExcel } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';

import { EmployeesPage } from '../components/employees-page';

vi.mock('@/lib/excel-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/excel-export')>();
  return {
    ...actual,
    exportToExcel: vi.fn(),
  };
});

const oldDeletedAt = new Date(Date.now() - 40 * 86_400_000).toISOString();
const recentDeletedAt = new Date(Date.now() - 5 * 86_400_000).toISOString();

const sampleEmployees = [
  {
    id: 1,
    fullName: 'Chủ Quán Sơn Bảo',
    shortName: 'S.Bảo',
    dob: '1990-01-01',
    phone: '0900000001',
    address: 'TP.HCM',
    citizenId: '079090000001',
    citizenIdIssuedPlace: 'TP.HCM',
    positionId: 10,
    specialtyId: 20,
    startDate: '2024-01-01',
    bankName: 'VPBank',
    bankAccountNo: '123456',
    bankAccountName: 'CHU QUAN SON BAO',
    avatarUrl: null,
    attachmentUrls: [],
    note: 'Tài khoản gốc',
    isDeleted: false,
    deletedAt: null,
    createdAt: '2024-01-01T00:00:00.000Z',
    position: { id: 10, name: 'Chủ Quán' },
    specialty: { id: 20, name: 'Quản Lý Chung' },
    user: { id: 1, username: 'admin', isActive: true, isSuperAdmin: true, roleLabel: 'Chủ quán' },
  },
  {
    id: 2,
    fullName: 'Nguyễn Minh Quân',
    shortName: 'M.Quân',
    dob: '1998-05-12',
    phone: '0909111222',
    address: 'Quận 1',
    citizenId: null,
    citizenIdIssuedPlace: null,
    positionId: 11,
    specialtyId: 21,
    startDate: '2025-02-01',
    bankName: null,
    bankAccountNo: null,
    bankAccountName: null,
    avatarUrl: null,
    attachmentUrls: [],
    note: 'Ca sáng',
    isDeleted: false,
    deletedAt: null,
    createdAt: '2025-02-01T00:00:00.000Z',
    position: { id: 11, name: 'Thu Ngân' },
    specialty: { id: 21, name: 'Thu Ngân' },
    user: { id: 2, username: 'thungan', isActive: true, isSuperAdmin: false, roleLabel: 'Thu ngân' },
  },
  {
    id: 3,
    fullName: 'Trần Nghỉ Lâu',
    shortName: 'N.Lâu',
    dob: null,
    phone: null,
    address: null,
    citizenId: null,
    citizenIdIssuedPlace: null,
    positionId: 11,
    specialtyId: 21,
    startDate: null,
    bankName: null,
    bankAccountNo: null,
    bankAccountName: null,
    avatarUrl: null,
    attachmentUrls: [],
    note: null,
    isDeleted: true,
    deletedAt: oldDeletedAt,
    createdAt: '2024-05-01T00:00:00.000Z',
    position: { id: 11, name: 'Thu Ngân' },
    specialty: { id: 21, name: 'Thu Ngân' },
    user: { id: 3, username: 'nghilau', isActive: false, isSuperAdmin: false, roleLabel: null },
  },
  {
    id: 4,
    fullName: 'Lê Mới Nghỉ',
    shortName: 'M.Nghỉ',
    dob: null,
    phone: null,
    address: null,
    citizenId: null,
    citizenIdIssuedPlace: null,
    positionId: 11,
    specialtyId: 21,
    startDate: null,
    bankName: null,
    bankAccountNo: null,
    bankAccountName: null,
    avatarUrl: null,
    attachmentUrls: [],
    note: null,
    isDeleted: true,
    deletedAt: recentDeletedAt,
    createdAt: '2025-05-01T00:00:00.000Z',
    position: { id: 11, name: 'Thu Ngân' },
    specialty: { id: 21, name: 'Thu Ngân' },
    user: null,
  },
];

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <EmployeesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('EmployeesPage & employees.api CRUD flows', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useAuthStore.setState({
      accessToken: 'tok',
      user: {
        id: 1,
        employeeId: 1,
        username: 'admin',
        fullName: 'Chủ quán',
        isSuperAdmin: true,
        permissions: defaultUserPermissions,
      },
    });
  });

  it('lists employees, filters by status, enforces 30-day permanent delete rule, toggles active status, and exports Excel', async () => {
    vi.spyOn(apiClient, 'get').mockImplementation(async (url: string, opts?: { params?: Record<string, unknown> }) => {
      if (url === '/api/v1/employees') {
        const includeDeleted = Boolean(opts?.params?.includeDeleted);
        const inactiveOnly = Boolean(opts?.params?.inactiveOnly);
        const items = inactiveOnly
          ? sampleEmployees.filter((e) => e.isDeleted)
          : includeDeleted
            ? sampleEmployees
            : sampleEmployees.filter((e) => !e.isDeleted);
        return { page: 1, limit: 20, total: items.length, items } as never;
      }
      if (url === '/api/v1/mdm/lookup') {
        const cat = opts?.params?.category;
        if (cat === 'POSITION') {
          return [{ id: 10, category: 'POSITION', name: 'Chủ Quán', normalizedName: 'chu quan', isActive: true, metadata: {} }] as never;
        }
        return [{ id: 20, category: 'SPECIALTY', name: 'Quản Lý Chung', normalizedName: 'quan ly chung', isActive: true, metadata: {} }] as never;
      }
      return [] as never;
    });

    const patchSpy = vi.spyOn(apiClient, 'patch').mockResolvedValue({
      id: 2,
      isDeleted: true,
      isActive: false,
    } as never);
    const deleteSpy = vi.spyOn(apiClient, 'delete').mockResolvedValue({
      id: 3,
      deleted: true,
    } as never);

    renderPage();

    await screen.findByText('Nguyễn Minh Quân');
    expect(screen.getByTestId('short-name-badge-2')).toHaveTextContent('M.Quân');

    // Toggle active status dialog & confirm
    fireEvent.click(screen.getByTestId('toggle-employee-active-btn-2'));
    await screen.findByTestId('employee-status-confirm-dialog');
    fireEvent.click(screen.getByTestId('confirm-employee-status-btn'));
    await waitFor(() =>
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/employees/2/status', { isActive: false }),
    );

    // Switch status filter to 'all' to view both old (>30d) & recent (<30d) deleted records
    fireEvent.change(screen.getByTestId('employee-status-filter'), { target: { value: 'all' } });
    await screen.findByText('Trần Nghỉ Lâu');
    expect(screen.getByTestId('delete-employee-btn-4')).toBeDisabled();
    expect(screen.getByTestId('delete-employee-btn-3')).toBeEnabled();

    // Permanent delete eligible employee #3
    fireEvent.click(screen.getByTestId('delete-employee-btn-3'));
    await screen.findByTestId('delete-employee-dialog');
    fireEvent.click(screen.getByTestId('confirm-delete-employee-btn'));
    await waitFor(() =>
      expect(deleteSpy).toHaveBeenCalledWith('/api/v1/employees/3/permanent'),
    );

    // Open view, edit, and create drawer paths
    fireEvent.click(screen.getByTestId('view-employee-btn-2'));
    fireEvent.click(screen.getByTestId('edit-employee-btn-2'));
    fireEvent.click(screen.getByTestId('create-employee-btn'));

    // Export Excel via fetchAllPaginated -> apiClient.get
    fireEvent.click(screen.getByTestId('export-employees-excel-btn'));
    await waitFor(() => expect(exportToExcel).toHaveBeenCalledTimes(1));

    // Also filter by inactive status (wait for keepPreviousData refetch to replace rows)
    fireEvent.change(screen.getByTestId('employee-status-filter'), { target: { value: 'inactive' } });
    await screen.findByText('Trần Nghỉ Lâu');
    await waitFor(() =>
      expect(screen.queryByText('Nguyễn Minh Quân')).not.toBeInTheDocument(),
    );
  });

  it('hides create and export buttons when employee permissions are absent', async () => {
    useAuthStore.setState({
      accessToken: 'tok',
      user: {
        id: 5,
        employeeId: 5,
        username: 'viewer',
        fullName: 'Viewer',
        isSuperAdmin: false,
        permissions: {
          ...defaultUserPermissions,
          employees: { view: true, create: false, update: false, delete: false, export: false },
        },
      },
    });
    vi.spyOn(apiClient, 'get').mockResolvedValue({ page: 1, limit: 20, total: 0, items: [] } as never);

    renderPage();

    await waitFor(() =>
      expect(screen.queryByTestId('create-employee-btn')).not.toBeInTheDocument(),
    );
    expect(screen.queryByTestId('export-employees-excel-btn')).not.toBeInTheDocument();
  });
});
