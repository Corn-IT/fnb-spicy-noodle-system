import { type ScheduleAttendanceEntry } from '@fnb/shared';
import { Clock } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/utils/cn';

import { type ScheduleEmployeeInfo } from '../api/schedules.api';

const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES_60 = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function parseTime24(value: string | undefined, fallback: string): [string, string] {
  const raw = value && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  const [h = '08', m = '00'] = raw.split(':');
  return [HOURS_24.includes(h) ? h : '08', MINUTES_60.includes(m) ? m : '00'];
}

interface Time24SelectProps {
  value: string | undefined;
  fallback: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  testId?: string;
  ariaLabel: string;
}

function Time24Select({
  value,
  fallback,
  onChange,
  disabled,
  testId,
  ariaLabel,
}: Time24SelectProps) {
  const [hour, minute] = parseTime24(value, fallback);
  const selectCls =
    'h-6 rounded border bg-background px-1 text-[11px] font-medium tabular-nums text-foreground focus:outline-none focus:ring-1 focus:ring-primary';

  return (
    <div data-testid={testId} className="inline-flex items-center gap-0.5">
      <select
        aria-label={`${ariaLabel} - Giờ`}
        data-testid={testId ? `${testId}-hour` : undefined}
        value={hour}
        disabled={disabled}
        onChange={(e) => onChange(`${e.target.value}:${minute}`)}
        className={selectCls}
      >
        {HOURS_24.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-[11px] font-semibold text-muted-foreground">:</span>
      <select
        aria-label={`${ariaLabel} - Phút`}
        data-testid={testId ? `${testId}-minute` : undefined}
        value={minute}
        disabled={disabled}
        onChange={(e) => onChange(`${hour}:${e.target.value}`)}
        className={selectCls}
      >
        {MINUTES_60.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

export interface ScheduleCellMultiselectProps {
  timeSlot?: string;
  employees: ScheduleEmployeeInfo[];
  selectedIds: number[];
  attendances?: ScheduleAttendanceEntry[];
  onChange: (ids: number[], attendances?: ScheduleAttendanceEntry[]) => void;
  disabled?: boolean;
}

const SPECIALTY_COLORS: Record<string, { tag: string; tagDark: string }> = {
  BEP_NAU: {
    tag: 'bg-red-100 text-red-800 border-red-200',
    tagDark: 'dark:bg-red-950 dark:text-red-200 dark:border-red-800',
  },
  BEP_CHIEN: {
    tag: 'bg-amber-100 text-amber-800 border-amber-200',
    tagDark: 'dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  },
  PHA_CHE: {
    tag: 'bg-sky-100 text-sky-800 border-sky-200',
    tagDark: 'dark:bg-sky-950 dark:text-sky-200 dark:border-sky-800',
  },
  PHUC_VU: {
    tag: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    tagDark: 'dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  },
};

function resolveSpecialtyKey(specialty: string | null | undefined): string {
  const raw = (specialty ?? '').trim();
  if (!raw) return '';
  if (SPECIALTY_COLORS[raw]) return raw;
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd');
  if (normalized.includes('bep nau')) return 'BEP_NAU';
  if (normalized.includes('bep chien')) return 'BEP_CHIEN';
  if (normalized.includes('pha che')) return 'PHA_CHE';
  if (normalized.includes('phuc vu')) return 'PHUC_VU';
  return raw;
}

function resolveEmployeeSpecialty(emp: ScheduleEmployeeInfo): string | null | undefined {
  return emp.specialty?.name ?? emp.specialtyCode;
}

function getTagClasses(specialty: string | null | undefined, isDeleted: boolean): string {
  if (isDeleted) {
    return 'bg-gray-100 text-gray-500 border-gray-200 opacity-60 line-through dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
  const specKey = resolveSpecialtyKey(specialty);
  const colors = SPECIALTY_COLORS[specKey];
  if (colors) return `${colors.tag} ${colors.tagDark}`;
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function ScheduleCellMultiselect({
  timeSlot = 'Full-time',
  employees,
  selectedIds,
  attendances = [],
  onChange,
  disabled = false,
}: ScheduleCellMultiselectProps) {
  const isFullTimeRow = timeSlot.toLowerCase().includes('full');

  const employeeOrderIndex = new Map(employees.map((e, idx) => [e.id, idx]));
  const selectedEmployees = selectedIds
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is ScheduleEmployeeInfo => e !== undefined)
    .sort(
      (a, b) =>
        (employeeOrderIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (employeeOrderIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );

  const getAttendanceForEmployee = (empId: number): ScheduleAttendanceEntry | undefined =>
    attendances.find((a) => a.employeeId === empId);

  const isFullShiftMode = (att: ScheduleAttendanceEntry | undefined): boolean => {
    if (!isFullTimeRow) return false;
    if (att?.mode === 'FULL_SHIFT') return true;
    if (att?.mode === 'CUSTOM_HOURS') return false;
    return !(att?.startTime || att?.endTime);
  };

  const toggleEmployee = (empId: number) => {
    if (disabled) return;
    if (selectedIds.includes(empId)) {
      const nextIds = selectedIds.filter((id) => id !== empId);
      const nextAttendances = attendances.filter((a) => a.employeeId !== empId);
      onChange(nextIds, nextAttendances);
    } else {
      const nextIds = [...selectedIds, empId];
      const defaultEntry: ScheduleAttendanceEntry = isFullTimeRow
        ? { employeeId: empId, mode: 'FULL_SHIFT' }
        : { employeeId: empId, mode: 'CUSTOM_HOURS', startTime: '08:00', endTime: '17:00' };
      const nextAttendances = [
        ...attendances.filter((a) => a.employeeId !== empId),
        defaultEntry,
      ];
      onChange(nextIds, nextAttendances);
    }
  };

  const setEmployeeMode = (empId: number, mode: 'FULL_SHIFT' | 'CUSTOM_HOURS') => {
    if (disabled) return;
    const existing = getAttendanceForEmployee(empId) ?? { employeeId: empId };
    const updated: ScheduleAttendanceEntry =
      mode === 'FULL_SHIFT'
        ? { employeeId: empId, mode: 'FULL_SHIFT' }
        : {
            employeeId: empId,
            mode: 'CUSTOM_HOURS',
            startTime: existing.startTime || '08:00',
            endTime: existing.endTime || '20:00',
          };
    const nextAttendances = selectedIds.map((id) =>
      id === empId ? updated : (getAttendanceForEmployee(id) ?? { employeeId: id }),
    );
    onChange(selectedIds, nextAttendances);
  };

  const updateEmployeeTime = (
    empId: number,
    field: 'startTime' | 'endTime',
    value: string,
  ) => {
    if (disabled) return;
    const existing = getAttendanceForEmployee(empId) ?? { employeeId: empId };
    const updated: ScheduleAttendanceEntry = {
      ...existing,
      ...(existing.mode
        ? { mode: existing.mode === 'FULL_SHIFT' ? ('CUSTOM_HOURS' as const) : existing.mode }
        : {}),
      [field]: value,
    };
    const nextAttendances = selectedIds.map((id) =>
      id === empId ? updated : (getAttendanceForEmployee(id) ?? { employeeId: id }),
    );
    onChange(selectedIds, nextAttendances);
  };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-testid="schedule-cell-trigger"
          className={cn(
            'flex min-h-[2.5rem] w-full min-w-0 flex-wrap gap-1 overflow-hidden rounded-md border bg-background p-1.5 text-left text-xs',
            disabled && 'cursor-not-allowed opacity-50',
            !disabled && 'hover:border-primary/50 cursor-pointer',
          )}
        >
          {selectedEmployees.length === 0 ? (
            <span className="px-1 text-muted-foreground">—</span>
          ) : (
            selectedEmployees.map((emp) => {
              const att = getAttendanceForEmployee(emp.id);
              const fullShift = isFullShiftMode(att);
              const hasTime = Boolean(att?.startTime || att?.endTime);
              const timeText = fullShift
                ? ' (Full ca)'
                : hasTime
                  ? ` (${att?.startTime || '--:--'}-${att?.endTime || '--:--'})`
                  : '';

              return (
                <Badge
                  key={emp.id}
                  variant="outline"
                  data-testid={`schedule-tag-${emp.id}`}
                  className={cn(
                    'max-w-full whitespace-normal break-words px-1.5 py-0.5 text-left text-[10px] font-medium leading-tight',
                    getTagClasses(resolveEmployeeSpecialty(emp), emp.isDeleted),
                  )}
                >
                  {emp.shortName}
                  {timeText}
                  {emp.isDeleted ? ' (Đã nghỉ)' : ''}
                </Badge>
              );
            })
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2.5" align="start">
        <div className="mb-1.5 flex items-center gap-1.5 border-b pb-1.5 text-[11px] font-semibold text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>Chọn nhân viên & Giờ làm việc (Chấm công)</span>
        </div>
        <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-0.5">
          {employees
            .filter((emp) => !emp.isDeleted || selectedIds.includes(emp.id))
            .map((emp) => {
            const isChecked = selectedIds.includes(emp.id);
            const att = getAttendanceForEmployee(emp.id);

            return (
              <div
                key={emp.id}
                className={cn(
                  'rounded-md border border-transparent px-2 py-1.5 text-xs transition-colors hover:bg-muted/60',
                  isChecked && 'border-border bg-muted/40',
                  emp.isDeleted && 'opacity-60',
                )}
              >
                <label
                  data-testid={`schedule-option-${emp.id}`}
                  className="flex cursor-pointer items-center gap-2"
                >
                  <Checkbox
                    checked={isChecked}
                    onCheckedChange={() => toggleEmployee(emp.id)}
                    disabled={disabled}
                  />
                  <Badge
                    variant="outline"
                    className={cn(
                      'px-1.5 py-0.5 text-[10px]',
                      getTagClasses(resolveEmployeeSpecialty(emp), emp.isDeleted),
                    )}
                  >
                    {emp.shortName}
                    {emp.isDeleted ? ' (Đã nghỉ)' : ''}
                  </Badge>
                  <span className={cn('truncate font-medium', emp.isDeleted && 'line-through')}>
                    {emp.fullName}
                  </span>
                </label>

                {isChecked ? (
                  <div className="mt-2 space-y-1.5 text-[11px]">
                    {isFullTimeRow ? (
                      <div className="flex items-center gap-1 rounded-md border bg-background p-0.5 w-fit">
                        <button
                          type="button"
                          disabled={disabled}
                          data-testid={`schedule-mode-full-${emp.id}`}
                          onClick={() => setEmployeeMode(emp.id, 'FULL_SHIFT')}
                          className={cn(
                            'rounded px-2 py-0.5 text-[11px] font-semibold transition-colors',
                            isFullShiftMode(att)
                              ? 'bg-primary text-primary-foreground shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          Full ca
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          data-testid={`schedule-mode-custom-${emp.id}`}
                          onClick={() => setEmployeeMode(emp.id, 'CUSTOM_HOURS')}
                          className={cn(
                            'rounded px-2 py-0.5 text-[11px] font-semibold transition-colors',
                            !isFullShiftMode(att)
                              ? 'bg-primary text-primary-foreground shadow-2xs'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          Tùy biến giờ
                        </button>
                      </div>
                    ) : null}

                    {!isFullTimeRow || !isFullShiftMode(att) ? (
                      <div className="flex flex-wrap items-center gap-1.5 pl-0">
                        <span className="shrink-0 text-muted-foreground">Giờ làm:</span>
                        <Time24Select
                          testId={`schedule-start-time-${emp.id}`}
                          ariaLabel={`Giờ bắt đầu của ${emp.fullName}`}
                          value={att?.startTime}
                          fallback="08:00"
                          onChange={(nextVal) => updateEmployeeTime(emp.id, 'startTime', nextVal)}
                          disabled={disabled}
                        />
                        <span className="text-muted-foreground">→</span>
                        <Time24Select
                          testId={`schedule-end-time-${emp.id}`}
                          ariaLabel={`Giờ kết thúc của ${emp.fullName}`}
                          value={att?.endTime}
                          fallback={isFullTimeRow ? '20:00' : '17:00'}
                          onChange={(nextVal) => updateEmployeeTime(emp.id, 'endTime', nextVal)}
                          disabled={disabled}
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
