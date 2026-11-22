import { defaultUserPermissions } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/auth.store';

import { ScheduleCellMultiselect } from './schedule-cell-multiselect';
import { SchedulesMatrixPage } from './schedules-matrix-page';

const { scheduleDataMock } = vi.hoisted(() => ({
  scheduleDataMock: {
    current: {
      weekStartDate: '2026-11-16',
      cells: [
        {
          dayOfWeek: 0,
          timeSlot: 'Full-time',
          employeeIds: [1, 2, 3, 4],
          attendances: [
            { employeeId: 1, mode: 'FULL_SHIFT' },
            { employeeId: 2, mode: 'CUSTOM_HOURS', startTime: '08:30', endTime: '12:30' },
          ],
          employees: [
            { id: 1, fullName: 'NV Bếp Nấu', shortName: 'B.Nấu', isDeleted: false, specialtyCode: 'bep nau (mi cay)' },
            { id: 2, fullName: 'NV Đã Nghỉ', shortName: 'Đ.Nghỉ', isDeleted: true, specialtyCode: 'bep nau (mi cay)' },
            { id: 3, fullName: 'NV Pha Chế', shortName: 'P.Chế', isDeleted: false, specialtyCode: 'pha che (nuoc uong)' },
            { id: 4, fullName: 'NV Phục Vụ', shortName: 'P.Vụ', isDeleted: false, specialtyCode: 'phuc vu ban' },
          ],
        },
      ],
      availableEmployees: [
        { id: 1, fullName: 'NV Bếp Nấu', shortName: 'B.Nấu', isDeleted: false, specialtyCode: 'bep nau (mi cay)' },
        { id: 3, fullName: 'NV Pha Chế', shortName: 'P.Chế', isDeleted: false, specialtyCode: 'pha che (nuoc uong)' },
        { id: 4, fullName: 'NV Phục Vụ', shortName: 'P.Vụ', isDeleted: false, specialtyCode: 'phuc vu ban' },
      ],
    },
  },
}));

vi.mock('../api/schedules.api', () => ({
  useScheduleWeekQuery: () => ({ data: scheduleDataMock.current, isLoading: false, isFetching: false, isPlaceholderData: false, isError: false }),
  useBulkSaveScheduleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCopyPreviousWeekMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('SchedulesMatrixPage & ScheduleCellMultiselect', () => {
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
        permissions: { ...defaultUserPermissions, schedules: { view: true, create: true, update: true, delete: true, export: true } },
      },
    });
  });

  it('renders specialty colors from backend specialtyCode and preserves soft-deleted (Đã nghỉ) badge', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SchedulesMatrixPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const bepNauTag = screen.getByTestId('schedule-tag-1');
    const deletedTag = screen.getByTestId('schedule-tag-2');
    const phaCheTag = screen.getByTestId('schedule-tag-3');
    const phucVuTag = screen.getByTestId('schedule-tag-4');

    expect(bepNauTag.className).toContain('bg-red-100');
    expect(phaCheTag.className).toContain('bg-sky-100');
    expect(phucVuTag.className).toContain('bg-emerald-100');
    expect(deletedTag).toHaveTextContent('Đ.Nghỉ (08:30-12:30) (Đã nghỉ)');
    expect(deletedTag.className).toContain('line-through');
  });

  it('does not offer unselected soft-deleted employees in unrelated cells', () => {
    render(
      <ScheduleCellMultiselect
        timeSlot="Full-time"
        employees={scheduleDataMock.current.cells[0]!.employees!}
        selectedIds={[1]}
        onChange={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('schedule-cell-trigger'));
    expect(screen.getByTestId('schedule-option-1')).toBeInTheDocument();
    expect(screen.queryByTestId('schedule-option-2')).toBeNull();
  });

  it('prompts confirmation before switching weeks when there are unsaved schedule changes', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <SchedulesMatrixPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const triggers = screen.getAllByTestId('schedule-cell-trigger');
    fireEvent.click(triggers[1]!);
    fireEvent.click(screen.getByTestId('schedule-option-1'));
    fireEvent.click(screen.getByTestId('next-week-btn'));

    expect(screen.getByTestId('unsaved-week-switch-dialog')).toBeInTheDocument();
  });
});
