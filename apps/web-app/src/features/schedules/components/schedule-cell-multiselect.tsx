import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/utils/cn';

import { type ScheduleEmployeeInfo } from '../api/schedules.api';

export interface ScheduleCellMultiselectProps {
  employees: ScheduleEmployeeInfo[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
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
};

function getTagClasses(specialty: string | null | undefined, isDeleted: boolean): string {
  if (isDeleted) {
    return 'bg-gray-100 text-gray-500 border-gray-200 opacity-60 line-through dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700';
  }
  const specKey = specialty ?? '';
  const colors = SPECIALTY_COLORS[specKey];
  if (colors) return `${colors.tag} ${colors.tagDark}`;
  return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700';
}

export function ScheduleCellMultiselect({
  employees,
  selectedIds,
  onChange,
  disabled = false,
}: ScheduleCellMultiselectProps) {
  const selectedEmployees = selectedIds
    .map((id) => employees.find((e) => e.id === id))
    .filter((e): e is ScheduleEmployeeInfo => e !== undefined);

  const toggleEmployee = (empId: number) => {
    if (disabled) return;
    if (selectedIds.includes(empId)) {
      onChange(selectedIds.filter((id) => id !== empId));
    } else {
      onChange([...selectedIds, empId]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          data-testid="schedule-cell-trigger"
          className={cn(
            'flex min-h-[2.5rem] w-full flex-wrap gap-1 rounded-md border bg-background p-1.5 text-left text-xs',
            disabled && 'cursor-not-allowed opacity-50',
            !disabled && 'hover:border-primary/50 cursor-pointer',
          )}
        >
          {selectedEmployees.length === 0 ? (
            <span className="px-1 text-muted-foreground">—</span>
          ) : (
            selectedEmployees.map((emp) => (
              <Badge
                key={emp.id}
                variant="outline"
                data-testid={`schedule-tag-${emp.id}`}
                className={cn(
                  'px-1.5 py-0.5 text-[10px] font-medium',
                  getTagClasses(emp.specialty?.name, emp.isDeleted),
                )}
              >
                {emp.shortName}
                {emp.isDeleted ? ' (Đã nghỉ)' : ''}
              </Badge>
            ))
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
          {employees.map((emp) => (
            <label
              key={emp.id}
              data-testid={`schedule-option-${emp.id}`}
              className={cn(
                'flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted',
                emp.isDeleted && 'opacity-60',
              )}
            >
              <Checkbox
                checked={selectedIds.includes(emp.id)}
                onCheckedChange={() => toggleEmployee(emp.id)}
                disabled={disabled}
              />
              <Badge
                variant="outline"
                className={cn(
                  'px-1.5 py-0.5 text-[10px]',
                  getTagClasses(emp.specialty?.name, emp.isDeleted),
                )}
              >
                {emp.shortName}
                {emp.isDeleted ? ' (Đã nghỉ)' : ''}
              </Badge>
              <span className={cn('truncate', emp.isDeleted && 'line-through')}>
                {emp.fullName}
              </span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
