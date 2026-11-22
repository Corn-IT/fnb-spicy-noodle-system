import { defaultUserPermissions, MdmCategory, type MdmItem } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';

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
});
