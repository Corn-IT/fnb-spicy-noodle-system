import { SocketEvents, UserPermissionsSchema } from '@fnb/shared';
import { QueryClient } from '@tanstack/react-query';
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { InvoicesPage } from '@/features/invoices';
import { PayrollPage } from '@/features/payroll';
import { ScheduleCellMultiselect } from '@/features/schedules';
import { useBulkSaveScheduleMutation } from '@/features/schedules/api/schedules.api';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const superAdminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    pos: { view: true },
    menu: { view: true, import: true, export: true },
    invoices: { view: true, export: true },
    inventory: { view: true },
    cashflow: { view: true },
    employees: { view: true },
    schedules: { view: true, create: true, update: true, delete: true, export: true },
    payroll: { view: true, update: true, config: true, export: true },
    mdm: { view: true },
    rbac: { view: true },
  }),
};

describe('Payroll, Schedule Full-ca Mode, and Invoices Footer Summary UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().clearAuth();
    useAuthStore.getState().setAuth({ accessToken: 'token-123', user: superAdminUser });
  });

  it('renders total paid invoices footer summary in InvoicesPage', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      page: 1,
      limit: 20,
      total: 2,
      summary: {
        totalPaidAmount: 350000,
        totalCashAmount: 200000,
        totalTransferAmount: 150000,
        paidCount: 2,
      },
      items: [
        {
          orderId: 101,
          orderCode: 'HD-20261114-0101',
          orderType: 'DINE_IN',
          tableId: 1,
          tableLabel: 'Bàn 01',
          takeawayNumber: null,
          status: 'PAID',
          paymentMethod: 'CASH',
          cashAmount: 200000,
          transferAmount: 0,
          totalAmount: 200000,
          createdAt: '2026-11-14T10:00:00.000Z',
          paidAt: '2026-11-14T10:30:00.000Z',
          note: null,
        },
      ],
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryProvider>
          <InvoicesPage />
        </QueryProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      const footer = screen.getByTestId('invoices-footer-total');
      expect(footer.textContent).toContain('350.000');
      expect(footer.textContent).toContain('Tiền mặt: 200.000');
      expect(footer.textContent).toContain('Chuyển khoản: 150.000');
    });
  });

  it('shows Full ca and Tùy biến giờ mode toggles for Full-time schedule cells only', async () => {
    const onChange = vi.fn();
    const employees = [
      { id: 1, fullName: 'Nguyễn Văn A', shortName: 'V.A', isDeleted: false, specialty: null },
    ];

    render(
      <ScheduleCellMultiselect
        timeSlot="Full-time"
        employees={employees}
        selectedIds={[1]}
        attendances={[{ employeeId: 1, mode: 'FULL_SHIFT' }]}
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('schedule-tag-1').textContent).toContain('Full ca');
    fireEvent.click(screen.getByTestId('schedule-cell-trigger'));
    expect(await screen.findByTestId('schedule-mode-full-1')).toBeTruthy();
    expect(screen.getByTestId('schedule-mode-custom-1')).toBeTruthy();

    fireEvent.click(screen.getByTestId('schedule-mode-custom-1'));
    expect(onChange).toHaveBeenCalledWith([1], [
      expect.objectContaining({ employeeId: 1, mode: 'CUSTOM_HOURS' }),
    ]);
  });

  it('renders PayrollPage table columns, formula summary, config dialog, and employee edit dialog', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({
      fromDate: '2026-11-01',
      toDate: '2026-11-30',
      config: {
        defaultBaseSalary: 7000000,
        standardFullTimeDays: 28,
        standardHoursPerDay: 12,
        defaultPartTimeHourlyRate: 25000,
      },
      items: [
        {
          employeeId: 1,
          fullName: 'Nguyễn Minh Quân',
          shortName: 'M.Quân',
          isDeleted: false,
          positionName: 'Quản lý',
          specialtyName: null,
          shiftType: 'FULL_TIME',
          scheduleFullShiftDays: 24,
          scheduleCustomHours: 6,
          fullShiftDays: 24,
          customHours: 6,
          hasManualOverride: false,
          useCustomRate: false,
          appliedBaseSalary: 7000000,
          appliedHourlyRate: 20833.33,
          bonusOrAdjustment: 0,
          note: null,
          totalSalary: 6125000,
        },
      ],
      summary: {
        totalEmployees: 1,
        totalFullShiftDays: 24,
        totalCustomHours: 6,
        totalSalary: 6125000,
      },
    });

    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <QueryProvider>
          <PayrollPage />
        </QueryProvider>
      </MemoryRouter>,
    );

    const footer = await screen.findByTestId('payroll-footer-total');
    await waitFor(() => {
      expect(footer.textContent).toContain('6.125.000');
    });
    expect(screen.getByTestId('payroll-short-name-1').textContent).toBe('M.Quân');
    expect(screen.getByTestId('export-payroll-excel-btn')).toBeTruthy();

    fireEvent.click(screen.getByTestId('open-payroll-config-btn'));
    expect(await screen.findByTestId('payroll-config-dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ bỏ' }));

    fireEvent.click(screen.getByTestId('edit-payroll-btn-1'));
    expect(await screen.findByTestId('edit-employee-payroll-dialog')).toBeTruthy();
  });

  it('invalidates payroll cache immediately when schedules are saved', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000, retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries');
    vi.spyOn(apiClient, 'put').mockResolvedValueOnce({ saved: 1 });

    const { result } = renderHook(() => useBulkSaveScheduleMutation(), {
      wrapper: ({ children }) => <QueryProvider client={client}>{children}</QueryProvider>,
    });

    await result.current.mutateAsync({
      weekStartDate: '2026-11-09',
      cells: [{ dayOfWeek: 0, timeSlot: 'Full-time', employeeIds: [1] }],
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['schedules'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['payroll'] });
    expect(SocketEvents.SCHEDULE_UPDATED).toBe('schedule:updated');
    expect(SocketEvents.PAYROLL_UPDATED).toBe('payroll:updated');
  });
});
