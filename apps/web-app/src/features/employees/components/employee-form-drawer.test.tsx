import { defaultUserPermissions, MdmCategory, type MdmItem } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';

import { type EmployeeRecord } from '../api/employees.api';
import { EmployeeFormDrawer } from './employee-form-drawer';

const { createMutateAsyncMock, updateMutateAsyncMock } = vi.hoisted(() => ({
  createMutateAsyncMock: vi.fn(),
  updateMutateAsyncMock: vi.fn(),
}));

vi.mock('../api/employees.api', () => ({
  useCreateEmployeeMutation: () => ({ mutateAsync: createMutateAsyncMock, isPending: false }),
  useUpdateEmployeeMutation: () => ({ mutateAsync: updateMutateAsyncMock, isPending: false }),
}));

const samplePositions: MdmItem[] = [
  {
    id: 1,
    category: MdmCategory.POSITION,
    name: 'Nhân Viên Bếp Nấu',
    normalizedName: 'nhan vien bep nau',
    metadata: {},
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

const sampleSpecialties: MdmItem[] = [
  {
    id: 2,
    category: MdmCategory.SPECIALTY,
    name: 'Bếp Nấu',
    normalizedName: 'bep nau',
    metadata: {},
    isActive: true,
    createdAt: '2026-11-01T00:00:00.000Z',
  },
];

describe('EmployeeFormDrawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.getState().setAuth({
      accessToken: 'token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'admin',
        fullName: 'Quản Lý',
        isSuperAdmin: false,
        permissions: defaultUserPermissions,
      },
    });
  });

  it('hides linked-account creation option from non-super-admin users', () => {
    render(
      <EmployeeFormDrawer
        open
        onOpenChange={() => undefined}
        mode="create"
        employee={null}
        positions={samplePositions}
        specialties={sampleSpecialties}
      />,
    );

    expect(screen.queryByTestId('create-account-checkbox')).toBeNull();
  });

  it('shows linked-account option to super-admin and validates account credentials inline', async () => {
    useAuthStore.getState().setAuth({
      accessToken: 'token',
      user: {
        id: 1,
        employeeId: 1,
        username: 'superadmin',
        fullName: 'Chủ Quán',
        isSuperAdmin: true,
        permissions: defaultUserPermissions,
      },
    });

    render(
      <EmployeeFormDrawer
        open
        onOpenChange={() => undefined}
        mode="create"
        employee={null}
        positions={samplePositions}
        specialties={sampleSpecialties}
      />,
    );

    expect(screen.getByTestId('create-account-checkbox')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('emp-fullname'), { target: { value: 'Nguyễn Văn Anh' } });
    fireEvent.click(screen.getByTestId('emp-position-select'));
    fireEvent.click(screen.getByRole('option', { name: 'Nhân Viên Bếp Nấu' }));
    fireEvent.click(screen.getByTestId('emp-specialty-select'));
    fireEvent.click(screen.getByRole('option', { name: 'Bếp Nấu' }));
    fireEvent.click(screen.getByTestId('create-account-checkbox'));

    fireEvent.change(screen.getByTestId('emp-username'), { target: { value: 'ab' } });
    fireEvent.click(screen.getByTestId('submit-employee-btn'));
    expect(await screen.findByTestId('employee-form-error')).toHaveTextContent('Tên đăng nhập phải có ít nhất 3 ký tự.');
    expect(createMutateAsyncMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('emp-username'), { target: { value: 'nv_anh' } });
    fireEvent.change(screen.getByTestId('emp-password'), { target: { value: '123' } });
    fireEvent.click(screen.getByTestId('submit-employee-btn'));
    expect(await screen.findByTestId('employee-form-error')).toHaveTextContent('Mật khẩu tài khoản phải có ít nhất 6 ký tự.');
    expect(createMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('surfaces backend conflict error reasons inside the drawer alert', async () => {
    createMutateAsyncMock.mockRejectedValueOnce(new Error('Số CCCD đã được sử dụng'));

    render(
      <EmployeeFormDrawer
        open
        onOpenChange={() => undefined}
        mode="create"
        employee={null}
        positions={samplePositions}
        specialties={sampleSpecialties}
      />,
    );

    fireEvent.change(screen.getByTestId('emp-fullname'), { target: { value: 'Trần Văn Anh' } });
    fireEvent.click(screen.getByTestId('emp-position-select'));
    fireEvent.click(screen.getByRole('option', { name: 'Nhân Viên Bếp Nấu' }));
    fireEvent.click(screen.getByTestId('emp-specialty-select'));
    fireEvent.click(screen.getByRole('option', { name: 'Bếp Nấu' }));
    fireEvent.click(screen.getByTestId('submit-employee-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('employee-form-error')).toHaveTextContent('Số CCCD đã được sử dụng');
    });
  });

  const sampleEmployeeWithAccount: EmployeeRecord = {
    id: 10,
    fullName: 'Nguyễn Thu Ngân',
    shortName: 'T.Ngân',
    dob: '1999-05-12',
    phone: '0901234567',
    address: 'Hà Nội',
    citizenId: '012345678901',
    citizenIdIssuedPlace: 'Cục CSQLHC',
    positionId: 1,
    specialtyId: 2,
    startDate: '2025-01-01',
    bankName: 'VCB',
    bankAccountNo: '12345678',
    bankAccountName: 'NGUYEN THU NGAN',
    avatarUrl: null,
    attachmentUrls: [],
    note: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: '2026-11-01T00:00:00.000Z',
    position: { id: 1, name: 'Thu Ngân Quầy' },
    specialty: { id: 2, name: 'Thu Ngân' },
    user: {
      id: 4,
      username: 'thungan01',
      isActive: true,
      isSuperAdmin: false,
      roleLabel: 'Thu ngân ca tối',
    },
  };

  it('displays linked account info in view mode (and unlinked state when employee has no user)', () => {
    const { rerender } = render(
      <EmployeeFormDrawer
        open
        onOpenChange={() => undefined}
        mode="view"
        employee={sampleEmployeeWithAccount}
        positions={samplePositions}
        specialties={sampleSpecialties}
      />,
    );

    expect(screen.getByTestId('emp-linked-account-username')).toHaveTextContent('@thungan01');
    expect(screen.getByTestId('emp-linked-account-role')).toHaveTextContent('Thu ngân ca tối');
    expect(screen.getByTestId('emp-linked-account-status')).toHaveTextContent('Hoạt động');
    expect(screen.queryByTestId('emp-open-rbac-btn')).toBeNull();

    rerender(
      <EmployeeFormDrawer
        open
        onOpenChange={() => undefined}
        mode="view"
        employee={{ ...sampleEmployeeWithAccount, user: null }}
        positions={samplePositions}
        specialties={sampleSpecialties}
      />,
    );
    expect(screen.getByTestId('emp-linked-account-username')).toHaveTextContent(
      'Chưa được gán tài khoản đăng nhập',
    );
  });

  it('locks linked account field with tooltip in edit mode and navigates to /rbac when permitted', () => {
    useAuthStore.getState().setAuth({
      accessToken: 'token',
      user: {
        id: 2,
        employeeId: 2,
        username: 'manager',
        fullName: 'Quản Lý',
        isSuperAdmin: false,
        permissions: {
          ...defaultUserPermissions,
          rbac: { ...defaultUserPermissions.rbac, view: true },
        },
      },
    });

    function LocationSpy() {
      const loc = useLocation();
      return <div data-testid="current-route">{`${loc.pathname}${loc.search}`}</div>;
    }

    const onOpenChange = vi.fn();
    render(
      <MemoryRouter initialEntries={['/employees']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <LocationSpy />
                <EmployeeFormDrawer
                  open
                  onOpenChange={onOpenChange}
                  mode="edit"
                  employee={sampleEmployeeWithAccount}
                  positions={samplePositions}
                  specialties={sampleSpecialties}
                />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    const card = screen.getByTestId('emp-linked-account-card');
    expect(card).toHaveAttribute('title', expect.stringContaining('Phân quyền Hệ thống'));

    fireEvent.click(screen.getByTestId('emp-open-rbac-btn'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.getByTestId('current-route')).toHaveTextContent('/rbac?keyword=thungan01');
  });
});
