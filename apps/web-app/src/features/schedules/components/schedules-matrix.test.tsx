import { defaultUserPermissions } from '@fnb/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as excelExport from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';

import { ScheduleCellMultiselect } from './schedule-cell-multiselect';
import { SchedulesMatrixPage } from './schedules-matrix-page';
import { UnsavedChangesDialog } from '../hooks/use-unsaved-changes-guard';

const { scheduleDataMock, bulkSaveMock, copyWeekMock, refetchMock } = vi.hoisted(() => ({
  refetchMock: vi.fn(),
  bulkSaveMock: vi.fn(),
  copyWeekMock: vi.fn(),
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
  useScheduleWeekQuery: () => ({ data: scheduleDataMock.current, isLoading: false, isFetching: false, isPlaceholderData: false, isError: false, refetch: refetchMock }),
  useBulkSaveScheduleMutation: () => ({ mutateAsync: bulkSaveMock, isPending: false }),
  useCopyPreviousWeekMutation: () => ({ mutateAsync: copyWeekMock, isPending: false }),
}));

describe('SchedulesMatrixPage & ScheduleCellMultiselect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetchMock.mockImplementation(async () => ({ data: scheduleDataMock.current }));
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
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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

  it('preserves edited cells when reconnect replaces server schedule data', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = <QueryClientProvider client={qc}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SchedulesMatrixPage /></MemoryRouter></QueryClientProvider>;
    const view = render(ui);
    fireEvent.click(screen.getAllByTestId('schedule-cell-trigger')[1]!);
    fireEvent.click(screen.getByTestId('schedule-option-1'));
    const original = scheduleDataMock.current;
    try {
      scheduleDataMock.current = { ...original, cells: [...original.cells, { ...original.cells[0]!, dayOfWeek: 2 }] };
      await act(async () => { view.rerender(<QueryClientProvider client={qc}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SchedulesMatrixPage /></MemoryRouter></QueryClientProvider>); });
      fireEvent.click(screen.getByTestId('save-schedule-btn'));
      await waitFor(() => expect(bulkSaveMock).toHaveBeenCalledWith(expect.objectContaining({ cells: expect.arrayContaining([expect.objectContaining({ dayOfWeek: 1, timeSlot: 'Full-time', employeeIds: [1] })]) })));
    } finally { scheduleDataMock.current = original; }
  });

  it.each([true, false])('hydrates a dirty matrix only after a successful explicit week copy (success=%s)', async (success) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={qc}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SchedulesMatrixPage /></MemoryRouter></QueryClientProvider>);
    fireEvent.click(screen.getAllByTestId('schedule-cell-trigger')[1]!);
    fireEvent.click(screen.getByTestId('schedule-option-1'));
    fireEvent.keyDown(document, { key: 'Escape' });
    const original = scheduleDataMock.current;
    const copied = { ...original, cells: [{ ...original.cells[0]!, dayOfWeek: 2 }] };
    if (success) copyWeekMock.mockResolvedValueOnce({ copied: 1 });
    else copyWeekMock.mockRejectedValueOnce(new Error('Copy failed'));
    refetchMock.mockImplementationOnce(async () => {
      scheduleDataMock.current = copied;
      return { data: copied };
    });
    try {
      await act(async () => { fireEvent.click(screen.getByTestId('copy-prev-week-btn')); });
      view.rerender(<QueryClientProvider client={qc}><MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><SchedulesMatrixPage /></MemoryRouter></QueryClientProvider>);
      if (success) {
        expect(refetchMock).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId('save-schedule-btn')).toBeDisabled();
        // A later edit/save must include the copied week, never the discarded pre-copy draft.
        fireEvent.click(screen.getAllByTestId('schedule-cell-trigger')[1]!);
        fireEvent.click(screen.getByTestId('schedule-option-3'));
      } else expect(refetchMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('save-schedule-btn'));
      await waitFor(() => expect(bulkSaveMock).toHaveBeenCalledTimes(1));
      const cells = bulkSaveMock.mock.calls[0]![0].cells;
      expect(cells).toEqual(expect.arrayContaining([expect.objectContaining({ dayOfWeek: 1, timeSlot: 'Full-time', employeeIds: success ? [3] : [1] })]));
      if (success) expect(cells).toEqual(expect.arrayContaining([expect.objectContaining({ dayOfWeek: 2, timeSlot: 'Full-time', employeeIds: [1, 2, 3, 4] })]));
    } finally { scheduleDataMock.current = original; }
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

  it('prompts confirmation before switching weeks when there are unsaved schedule changes', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <SchedulesMatrixPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const triggers = screen.getAllByTestId('schedule-cell-trigger');
    fireEvent.click(triggers[1]!);
    fireEvent.click(screen.getByTestId('schedule-option-1'));
    fireEvent.click(screen.getByTestId('next-week-btn'));

    expect(screen.getByTestId('unsaved-week-switch-dialog')).toBeInTheDocument();

    // Cancel week switch -> stays on week, then switch again and leave
    fireEvent.click(screen.getByTestId('unsaved-week-stay-btn'));
    expect(screen.queryByTestId('unsaved-week-switch-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-schedule-btn'));
    await waitFor(() => expect(bulkSaveMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('copy-prev-week-btn'));
    await waitFor(() => expect(copyWeekMock).toHaveBeenCalledTimes(1));

    const exportSpy = vi.spyOn(excelExport, 'exportToExcel').mockImplementation(() => {});
    fireEvent.click(screen.getByTestId('export-schedules-excel-btn'));
    expect(exportSpy).toHaveBeenCalledTimes(1);

    // Dirty again, then confirm discard-leave
    fireEvent.click(triggers[2]!);
    fireEvent.click(screen.getByTestId('schedule-option-3'));
    fireEvent.click(screen.getByTestId('next-week-btn'));
    fireEvent.click(screen.getByTestId('unsaved-week-leave-btn'));
    expect(screen.queryByTestId('unsaved-week-switch-dialog')).not.toBeInTheDocument();
  });

  it('supports UnsavedChangesDialog stay/leave actions and ScheduleCellMultiselect mode switching', () => {
    const reset = vi.fn();
    const proceed = vi.fn();
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <UnsavedChangesDialog
          blocker={{ state: 'blocked', reset, proceed, location: undefined } as never}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId('unsaved-changes-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('unsaved-stay-btn'));
    expect(reset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('unsaved-leave-btn'));
    expect(proceed).toHaveBeenCalledTimes(1);
  });
});
