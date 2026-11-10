import { ChevronLeft, ChevronRight, Copy, Save } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';

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
const DEFAULT_TIME_SLOTS = ['Ca Sáng', 'Ca Tối', 'Ca Gãy'] as const;

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

type CellMap = Record<string, number[]>;

function buildCellKey(dayOfWeek: number, timeSlot: string): string {
  return `${dayOfWeek}:${timeSlot}`;
}

export function SchedulesMatrixPage() {
  const [weekOffset, setWeekOffset] = React.useState(0);

  const currentMonday = React.useMemo(() => {
    const today = new Date();
    const monday = getMondayOfWeek(today);
    return addDays(monday, weekOffset * 7);
  }, [weekOffset]);

  const weekStartDate = formatDateIso(currentMonday);
  const weekEndDate = formatDateIso(addDays(currentMonday, 6));

  const { data, isLoading } = useScheduleWeekQuery(weekStartDate);
  const bulkSave = useBulkSaveScheduleMutation();
  const copyWeek = useCopyPreviousWeekMutation();

  const employees: ScheduleEmployeeInfo[] = data?.availableEmployees ?? [];
  const timeSlots = React.useMemo(() => {
    if (!data?.cells?.length) return [...DEFAULT_TIME_SLOTS];
    const slots = new Set(data.cells.map((c) => c.timeSlot));
    return slots.size > 0 ? Array.from(slots) : [...DEFAULT_TIME_SLOTS];
  }, [data]);

  const initialCells = React.useMemo<CellMap>(() => {
    const map: CellMap = {};
    for (const cell of data?.cells ?? []) {
      map[buildCellKey(cell.dayOfWeek, cell.timeSlot)] = [...cell.employeeIds];
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
      const init = (initialCells[key] ?? []).sort().join(',');
      const draft = (draftCells[key] ?? []).sort().join(',');
      if (init !== draft) return true;
    }
    return false;
  }, [initialCells, draftCells]);

  const blocker = useUnsavedChangesGuard(isDirty);

  const updateCell = (dayOfWeek: number, timeSlot: string, ids: number[]) => {
    setDraftCells((prev) => ({
      ...prev,
      [buildCellKey(dayOfWeek, timeSlot)]: ids,
    }));
  };

  const handleSave = async () => {
    const cells = [];
    for (let day = 0; day <= 6; day++) {
      for (const slot of timeSlots) {
        const key = buildCellKey(day, slot);
        cells.push({
          dayOfWeek: day,
          timeSlot: slot,
          employeeIds: draftCells[key] ?? [],
        });
      }
    }

    try {
      await bulkSave.mutateAsync({ weekStartDate, cells });
      toast({ variant: 'success', title: 'Đã lưu lịch làm việc tuần thành công' });
    } catch {
      toast({ variant: 'destructive', title: 'Lưu lịch thất bại' });
    }
  };

  const handleCopyPreviousWeek = async () => {
    const prevMonday = addDays(currentMonday, -7);
    try {
      await copyWeek.mutateAsync({
        sourceWeekStartDate: formatDateIso(prevMonday),
        targetWeekStartDate: weekStartDate,
      });
      toast({ variant: 'success', title: 'Đã sao chép lịch từ tuần trước thành công' });
    } catch {
      toast({ variant: 'destructive', title: 'Sao chép lịch thất bại' });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight">Lịch làm việc Ma trận</h1>
        <div className="flex flex-wrap items-center gap-2">
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
          <Button
            size="sm"
            className="font-bold shadow-xs active:scale-[0.98]"
            data-testid="save-schedule-btn"
            onClick={handleSave}
            disabled={bulkSave.isPending || !isDirty}
          >
            <Save className="h-4 w-4 shrink-0" />
            <span>Lưu lịch tuần</span>
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
        <Button
          variant="ghost"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="prev-week-btn"
          onClick={() => setWeekOffset((o) => o - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
          Tuần trước
        </Button>
        <span className="text-xs sm:text-sm font-semibold px-2.5 py-1 rounded bg-muted/50 tabular-nums whitespace-nowrap" data-testid="week-range-label">
          {weekStartDate} → {weekEndDate}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="current-week-btn"
          onClick={() => setWeekOffset(0)}
        >
          Tuần hiện tại
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="font-medium active:scale-95 transition-transform select-none"
          data-testid="next-week-btn"
          onClick={() => setWeekOffset((o) => o + 1)}
        >
          Tuần sau
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Đang tải lịch làm việc...</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm touch-pan-x">
          <table className="w-full min-w-[780px] table-fixed border-collapse text-left text-sm" data-testid="schedule-matrix-table">
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
                      <td key={dayIdx} className="px-1.5 py-1.5 align-top">
                        <ScheduleCellMultiselect
                          employees={employees}
                          selectedIds={draftCells[key] ?? []}
                          onChange={(ids) => updateCell(dayIdx, slot, ids)}
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
    </div>
  );
}
