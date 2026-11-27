import { QueryClient } from '@tanstack/react-query';
import { UserPermissionsSchema, type PayrollSummaryResponse } from '@fnb/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useToastStore } from '@/components/ui/toast';
import { PayrollPage } from '@/features/payroll';
import * as excelExport from '@/lib/excel-export';
import { apiClient } from '@/lib/api-client';
import { QueryProvider } from '@/providers/query-provider';
import { useAuthStore } from '@/stores/auth.store';

const routerFutureFlags = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const;

const adminUser = {
  id: 1,
  employeeId: 1,
  username: 'superadmin',
  fullName: 'Chủ Quán Sơn Bảo',
  isSuperAdmin: true,
  permissions: UserPermissionsSchema.parse({
    payroll: { view: true, update: true, config: true, export: true },
  }),
};

const basePayrollResponse: PayrollSummaryResponse = {
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
      positionName: 'Thu ngân',
      specialtyName: null,
      shiftType: 'FULL_TIME',
      scheduleFullShiftDays: 20,
      scheduleCustomHours: 4,
      fullShiftDays: 20,
      customHours: 4,
      hasManualOverride: false,
      useCustomRate: false,
      appliedBaseSalary: 7000000,
      appliedHourlyRate: 20833.33,
      bonusOrAdjustment: 0,
      note: null,
      totalSalary: 5083333,
    },
    {
      employeeId: 9,
      fullName: 'Trần Nghỉ Giữa Tháng',
      shortName: 'T.Nghỉ',
      isDeleted: true,
      positionName: 'Phục vụ',
      specialtyName: null,
      shiftType: 'PART_TIME',
      scheduleFullShiftDays: 0,
      scheduleCustomHours: 10,
      fullShiftDays: 0,
      customHours: 12,
      hasManualOverride: true,
      useCustomRate: false,
      appliedBaseSalary: 7000000,
      appliedHourlyRate: 25000,
      bonusOrAdjustment: 50000,
      note: 'Bù tăng ca',
      totalSalary: 350000,
    },
  ],
  summary: {
    totalEmployees: 2,
    totalFullShiftDays: 20,
    totalCustomHours: 16,
    totalSalary: 5433333,
  },
};

function renderPayroll() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryProvider client={queryClient}>
      <MemoryRouter future={routerFutureFlags}>
        <PayrollPage />
      </MemoryRouter>
    </QueryProvider>,
  );
}

describe('Wave 6 — PayrollPage (EC-HR-02 Deleted Badge, Config Formula & Employee Payroll Override)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useToastStore.getState().clearToasts();
    useAuthStore.getState().setAuth({ accessToken: 'token', user: adminUser });
  });

  it('renders soft-deleted (Đã nghỉ) staff badge, supports month/date filtering, updates payroll config, edits employee overrides & exports Excel', async () => {
    const getSpy = vi.spyOn(apiClient, 'get').mockResolvedValue(basePayrollResponse);
    const putSpy = vi.spyOn(apiClient, 'put').mockImplementation(async (url: string) => {
      if (url === '/api/v1/payroll/config') {
        return {
          defaultBaseSalary: 8400000,
          standardFullTimeDays: 28,
          standardHoursPerDay: 12,
          defaultPartTimeHourlyRate: 30000,
        };
      }
      return basePayrollResponse.items[1];
    });
    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});

    renderPayroll();
    await waitFor(() => expect(screen.getByTestId('payroll-deleted-badge-9')).toBeInTheDocument());
    expect(screen.getByTestId('payroll-deleted-badge-9')).toHaveTextContent('Đã nghỉ');

    // Change month and custom dates
    fireEvent.change(screen.getByTestId('payroll-month-input'), { target: { value: '2026-10' } });
    fireEvent.change(screen.getByTestId('payroll-from-date'), { target: { value: '2026-10-05' } });
    fireEvent.change(screen.getByTestId('payroll-to-date'), { target: { value: '2026-10-25' } });
    await waitFor(() =>
      expect(getSpy).toHaveBeenLastCalledWith(
        '/api/v1/payroll',
        expect.objectContaining({
          params: expect.objectContaining({ fromDate: '2026-10-05', toDate: '2026-10-25' }),
        }),
      ),
    );

    // Config dialog submit
    fireEvent.click(screen.getByTestId('open-payroll-config-btn'));
    await waitFor(() => expect(screen.getByTestId('payroll-config-dialog')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('payroll-cfg-base-salary'), { target: { value: '8400000' } });
    fireEvent.change(screen.getByTestId('payroll-cfg-standard-days'), { target: { value: '28' } });
    fireEvent.change(screen.getByTestId('payroll-cfg-standard-hours'), { target: { value: '12' } });
    fireEvent.change(screen.getByTestId('payroll-cfg-parttime-rate'), { target: { value: '30000' } });
    fireEvent.click(screen.getByTestId('save-payroll-config-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/payroll/config',
        expect.objectContaining({ defaultBaseSalary: 8400000, defaultPartTimeHourlyRate: 30000 }),
      );
    });

    // Edit employee payroll: switch to PART_TIME, toggle custom rate, set adjustment & note
    fireEvent.click(screen.getByTestId('edit-payroll-btn-1'));
    await waitFor(() => expect(screen.getByTestId('edit-employee-payroll-dialog')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('edit-payroll-shift-parttime'));
    fireEvent.click(screen.getByTestId('edit-payroll-custom-rate-toggle'));
    fireEvent.change(screen.getByTestId('edit-payroll-custom-hourly-rate'), { target: { value: '35000' } });
    fireEvent.change(screen.getByTestId('edit-payroll-full-days'), { target: { value: '22' } });
    fireEvent.change(screen.getByTestId('edit-payroll-custom-hours'), { target: { value: '8' } });
    fireEvent.change(screen.getByTestId('edit-payroll-adjustment'), { target: { value: '100000' } });
    fireEvent.change(screen.getByTestId('edit-payroll-note'), { target: { value: 'Thưởng chuyên cần' } });
    fireEvent.click(screen.getByTestId('save-employee-payroll-btn'));

    await waitFor(() => {
      expect(putSpy).toHaveBeenCalledWith(
        '/api/v1/payroll/employees/1',
        expect.objectContaining({
          shiftType: 'PART_TIME',
          useCustomRate: true,
          customHourlyRate: 35000,
          overrideFullShiftDays: 22,
          overrideCustomHours: 8,
          bonusOrAdjustment: 100000,
          note: 'Thưởng chuyên cần',
        }),
      );
    });

    // Export Excel
    fireEvent.click(screen.getByTestId('export-payroll-excel-btn'));
    expect(exportSpy).toHaveBeenCalledTimes(1);
  });

  it('handles error states on PayrollConfigDialog and EditEmployeePayrollDialog safely', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue(basePayrollResponse);
    vi.spyOn(apiClient, 'put').mockRejectedValue(new Error('Payroll API Error'));

    renderPayroll();
    await waitFor(() => expect(screen.getByTestId('open-payroll-config-btn')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('open-payroll-config-btn'));
    await waitFor(() => expect(screen.getByTestId('save-payroll-config-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('save-payroll-config-btn'));
    await waitFor(() => {
      expect(useToastStore.getState().toasts.some((t) => t.variant === 'destructive')).toBe(true);
    });
  });
});
