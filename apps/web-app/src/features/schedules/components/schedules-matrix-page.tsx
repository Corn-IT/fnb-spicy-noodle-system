import { type ScheduleAttendanceEntry } from '@fnb/shared';
import { ChevronLeft, ChevronRight, Copy, FileSpreadsheet, Save } from 'lucide-react';
import * as React from 'react';

import { AuditHistoryButton } from '@/components/audit-history-drawer/audit-history-drawer';
import { SystemErrorView } from '@/components/error-display';
import { PageHeader } from '@/components/layout/page-header';
import { ScheduleMatrixSkeleton } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppMessages } from '@/hooks/use-app-messages';
import { exportToExcel } from '@/lib/excel-export';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

import {
  type ScheduleEmployeeInfo,
  useBulkSaveScheduleMutation,
  useCopyPreviousWeekMutation,
  useScheduleWeekQuery,
} from '../api/schedules.api';
import {
  UnsavedChangesDialog,
  useUnsavedChangesGuard,
} from '../hooks/use-unsaved-changes-guard';
import { ScheduleCellMultiselect } from './schedule-cell-multiselect';

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ Nhật'] as const;
const DEFAULT_TIME_SLOTS = ['Full-time', 'Part-time'] as const;

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

interface DraftCellValue {
  employeeIds: number[];
  attendances: ScheduleAttendanceEntry[];
}

type CellMap = Record<string, DraftCellValue>;

function serializeCell(cell: DraftCellValue | undefined): string {
  if (!cell) return '';
  const ids = [...cell.employeeIds].sort((a, b) => a - b).join(',');
  const attStr = [...(cell.attendances ?? [])]
    .sort((a, b) => a.employeeId - b.employeeId)
    .map((a) => `${a.employeeId}:${a.mode ?? ''}:${a.startTime ?? ''}-${a.endTime ?? ''}`)
    .join('|');
  return `${ids}#${attStr}`;
}

function buildCellKey(dayOfWeek: number, timeSlot: string): string {
  return `${dayOfWeek}:${timeSlot}`;
}

export function SchedulesMatrixPage() {
  const { notify, resolveMessage } = useAppMessages();
  const user = useAuthStore((s) => s.user);
  const canSave = Boolean(
    user?.isSuperAdmin ||
      user?.permissions.schedules.create ||
      user?.permissions.schedules.update ||
      user?.permissions.schedules.delete,
  );
  const canCopy = Boolean(
    user?.isSuperAdmin || user?.permissions.schedules.create || user?.permissions.schedules.update,
  );
  const canExport = Boolean(user?.isSuperAdmin || user?.permissions.schedules.export);

  const [weekOffset, setWeekOffset] = React.useState(0);
  const [pendingWeekOffset, setPendingWeekOffset] = React.useState<number | null>(null);

  const currentMonday = React.useMemo(() => {
    const today = new Date();
    const monday = getMondayOfWeek(today);
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);

  const weekStartDate = formatDateIso(currentMonday);
  const weekEndDate = formatDateIso(addDays(currentMonday, 6));

  const scheduleQuery = useScheduleWeekQuery(weekStartDate);
  const { data, isLoading } = scheduleQuery;
  const bulkSave = useBulkSaveScheduleMutation();
  const copyWeek = useCopyPreviousWeekMutation();

  const employees = React.useMemo<ScheduleEmployeeInfo[]>(() => {
    const merged = new Map<number, ScheduleEmployeeInfo>();
    for (const emp of data?.availableEmployees ?? []) {
      merged.set(emp.id, emp);
    }
    for (const cell of data?.cells ?? []) {
      for (const emp of cell.employees ?? []) {
        if (!merged.has(emp.id)) {
          merged.set(emp.id, emp);
        }
      }
    }
    return Array.from(merged.values());
  }, [data]);
  const timeSlots = React.useMemo(() => [...DEFAULT_TIME_SLOTS], []);

  const initialCells = React.useMemo<CellMap>(() => {
    const map: CellMap = {};
    for (const cell of data?.cells ?? []) {
      map[buildCellKey(cell.dayOfWeek, cell.timeSlot)] = {
        employeeIds: [...cell.employeeIds],
        attendances: cell.attendances ? [...cell.attendances] : [],
      };
    }
    return map;
  }, [data]);

  const [draftCells, setDraftCells] = React.useState<CellMap>({});

  React.useEffect(() => {
    setDraftCells(initialCells);
  }, [initialCells]);

  const isDirty = React.useMemo(() => {
    const keys = new Set([...Object.keys(initialCells), ...Object.keys(draftCells)]);
    for (const key of keys) {
      if (serializeCell(initialCells[key]) !== serializeCell(draftCells[key])) {
        return true;
      }
    }
    return false;
  }, [initialCells, draftCells]);

  const blocker = useUnsavedChangesGuard(isDirty);

  const updateCell = (
    dayOfWeek: number,
    timeSlot: string,
    ids: number[],
    attendances?: ScheduleAttendanceEntry[],
  ) => {
    setDraftCells((prev) => ({
      ...prev,
      [buildCellKey(dayOfWeek, timeSlot)]: {
        employeeIds: ids,
        attendances: attendances ?? [],
      },
    }));
  };

  const handleSave = async () => {
    const cells = [];
    for (let day = 0; day <= 6; day++) {
      for (const slot of timeSlots) {
        const key = buildCellKey(day, slot);
        const draft = draftCells[key];
        cells.push({
          dayOfWeek: day,
          timeSlot: slot,
          employeeIds: draft?.employeeIds ?? [],
          ...(draft?.attendances && draft.attendances.length > 0
            ? { attendances: draft.attendances }
            : {}),
        });
      }
    }

    try {
      await bulkSave.mutateAsync({ weekStartDate, cells });
      notify('schedules.saveSuccess', { variant: 'success' });
    } catch {
      notify('schedules.saveError', { variant: 'destructive' });
    }
  };

  const handleCopyPreviousWeek = async () => {
    const prevMonday = addDays(currentMonday, -7);
    try {
      await copyWeek.mutateAsync({
        sourceWeekStartDate: formatDateIso(prevMonday),
        targetWeekStartDate: weekStartDate,
      });
      notify('schedules.copyWeekSuccess', { variant: 'success' });
    } catch {
      notify('schedules.copyWeekError', { variant: 'destructive' });
    }
  };

  const handleExportExcel = () => {
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const rows = timeSlots.map((slot) => {
      const isFullSlot = slot.toLowerCase().includes('full');
      const record: Record<string, string> = { timeSlot: slot };
      for (let dayIdx = 0; dayIdx < DAY_LABELS.length; dayIdx++) {
        const key = buildCellKey(dayIdx, slot);
        const cell = draftCells[key];
        const names = (cell?.employeeIds ?? []).map((empId) => {
          const emp = employeeById.get(empId);
          const att = cell?.attendances?.find((a) => a.employeeId === empId);
          const isFullShift =
            att?.mode === 'FULL_SHIFT' ||
            (isFullSlot && att?.mode !== 'CUSTOM_HOURS' && !att?.startTime && !att?.endTime);
          const timeSuffix = isFullShift
            ? ' (Full ca)'
            : att?.startTime || att?.endTime
              ? ` (${att?.startTime || '--:--'}-${att?.endTime || '--:--'})`
              : '';
          return `${emp?.fullName ?? `NV#${empId}`}${timeSuffix}`;
        });
        record[`day_${dayIdx}`] = names.join(', ') || '—';
      }
      return record;
    });

    exportToExcel({
      filename: `bang-tinh-ngay-cong-${weekStartDate}.xlsx`,
      sheetName: 'BangTinhNgayCong',
      rows,
      columns: [
        { header: 'Ca / Ngày', key: 'timeSlot', width: 14 },
        ...DAY_LABELS.map((label, dayIdx) => ({
          header: `${label} (${formatDateIso(addDays(currentMonday, dayIdx))})`,
          key: `day_${dayIdx}` as keyof Record<string, string>,
          width: 28,
        })),
      ],
    });
    notify('schedules.exportExcelSuccess', {
      variant: 'success',
      vars: { weekStartDate, weekEndDate },
    });
  };

  const requestWeekChange = (nextOffset: number) => {
    if (isDirty) {
      setPendingWeekOffset(nextOffset);
      return;
    }
    setWeekOffset(nextOffset);
  };

  if (!data && scheduleQuery.isError) {
    return (
      <SystemErrorView
        variant="section"
        error={scheduleQuery.error}
        onRetry={() => void scheduleQuery.refetch()}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        path="/schedules"
        defaultTitle="Bảng tính ngày công"
        actions={
          <>
            <AuditHistoryButton module="SCHEDULES" />
            {canExport ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="font-semibold active:scale-[0.98]"
                data-testid="export-schedules-excel-btn"
                onClick={handleExportExcel}
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>Xuất file Excel</span>
              </Button>
            ) : null}
            {canCopy ? (
              <Button
                variant="outline"
                size="sm"
                className="font-medium active:scale-[0.98]"
                data-testid="copy-prev-week-btn"
                onClick={handleCopyPreviousWeek}
                disabled={copyWeek.isPending}
              >
                <Copy className="h-4 w-4 shrink-0" />
                <span>Sao chép từ tuần trước</span>
              </Button>
            ) : null}
            {canSave ? (
              <Button
                size="sm"
                className="font-bold shadow-xs active:scale-[0.98]"
                data-testid="save-schedule-btn"
                onClick={handleSave}
                disabled={bulkSave.isPending || !isDirty}
              >
                <Save className="h-4 w-4 shrink-0" />
                <span>Lưu thay đổi</span>
              </Button>
            ) : null}
          </>
        }
      />

      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="prev-week-btn"
          onClick={() => requestWeekChange(weekOffset - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Tuần trước
        </Button>
        <span className="text-xs sm:text-sm font-semibold px-2.5 py-1 rounded bg-muted/50 tabular-nums whitespace-nowrap" data-testid="week-range-label">
          {weekStartDate} → {weekEndDate}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="current-week-btn"
          onClick={() => requestWeekChange(0)}
        >
          Tuần hiện tại
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="next-week-btn"
          onClick={() => requestWeekChange(weekOffset + 1)}
        >
          Tuần sau
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <ScheduleMatrixSkeleton />
      ) : (
        <div
          className={cn(
            'relative overflow-x-auto rounded-xl border bg-card shadow-sm touch-pan-x transition-opacity duration-150',
            (scheduleQuery.isFetching || scheduleQuery.isPlaceholderData) && 'opacity-65',
            scheduleQuery.isPlaceholderData && 'pointer-events-none',
          )}
        >
          {!isLoading && (scheduleQuery.isFetching || scheduleQuery.isPlaceholderData) ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-primary/15"
            >
              <div className="animate-top-progress h-full w-1/2 rounded-r-full bg-primary" />
            </div>
          ) : null}
          <table className="w-full min-w-[700px] table-fixed border-collapse text-left text-sm" data-testid="schedule-matrix-table">
            <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-28 px-3 py-3 whitespace-nowrap">Ca / Ngày</th>
                {DAY_LABELS.map((label, idx) => (
                  <th key={idx} className="px-2 py-3 text-center whitespace-nowrap">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {timeSlots.map((slot) => (
                <tr key={slot}>
                  <td className="px-3 py-2 font-medium text-foreground whitespace-nowrap">{slot}</td>
                  {Array.from({ length: 7 }, (_, dayIdx) => {
                    const key = buildCellKey(dayIdx, slot);
                    return (
                      <td key={dayIdx} className="min-w-0 px-1.5 py-1.5 align-top">
                        <ScheduleCellMultiselect
                          timeSlot={slot}
                          employees={employees}
                          selectedIds={draftCells[key]?.employeeIds ?? []}
                          attendances={draftCells[key]?.attendances ?? []}
                          onChange={(ids, attendances) =>
                            updateCell(dayIdx, slot, ids, attendances)
                          }
                          disabled={!canSave}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <UnsavedChangesDialog blocker={blocker} />

      {pendingWeekOffset !== null ? (
        (() => {
          const unsavedCopy = resolveMessage('schedules.confirm.unsavedChanges');
          return (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) setPendingWeekOffset(null);
              }}
            >
              <DialogContent data-testid="unsaved-week-switch-dialog">
                <DialogHeader>
                  <DialogTitle>{unsavedCopy.title}</DialogTitle>
                  {unsavedCopy.description ? (
                    <DialogDescription>{unsavedCopy.description}</DialogDescription>
                  ) : null}
                </DialogHeader>
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    variant="outline"
                    className="font-semibold active:scale-[0.98] transition-transform select-none"
                    data-testid="unsaved-week-stay-btn"
                    onClick={() => setPendingWeekOffset(null)}
                  >
                    Huỷ bỏ &amp; Ở lại
                  </Button>
                  <Button
                    variant="destructive"
                    className="font-semibold active:scale-[0.98] transition-transform select-none shadow-xs"
                    data-testid="unsaved-week-leave-btn"
                    onClick={() => {
                      const next = pendingWeekOffset;
                      setPendingWeekOffset(null);
                      setWeekOffset(next);
                    }}
                  >
                    Rời đi không lưu
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          );
        })()
      ) : null}
    </div>
  );
}
