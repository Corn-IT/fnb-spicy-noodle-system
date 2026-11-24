import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import {
  type ColumnChoice,
  MENU_COLUMN_OPTIONS,
  TABLE_COLUMN_OPTIONS,
  type TouchLayoutPrefs,
} from './touch-layout';

export const describeColumnChoice = (choice: ColumnChoice) =>
  choice === 'auto' ? 'Tự động' : `${choice} / hàng`;

export interface TouchLayoutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefs: TouchLayoutPrefs;
  onChange: (patch: Partial<TouchLayoutPrefs>) => void;
}

/** Chọn số thẻ bàn / số món mỗi hàng. Áp dụng ngay, lưu riêng cho máy này. */
export function TouchLayoutDialog({ open, onOpenChange, prefs, onChange }: TouchLayoutDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="touch-layout-dialog" className="max-w-2xl gap-6 p-6">
        <DialogHeader className="text-left">
          <DialogTitle className="text-xl font-bold">Bố cục hiển thị</DialogTitle>
          <DialogDescription className="text-sm">
            Áp dụng ngay và chỉ lưu cho máy này. "Tự động" chọn theo bề ngang màn hình; nếu màn quá
            hẹp so với số đã chọn, hệ thống tự giảm để thẻ không quá nhỏ.
          </DialogDescription>
        </DialogHeader>
        <ColumnPicker
          label="Sơ đồ bàn & Mang về — số thẻ mỗi hàng"
          testIdPrefix="layout-tables"
          options={TABLE_COLUMN_OPTIONS}
          value={prefs.tableColumns}
          onSelect={(tableColumns) => onChange({ tableColumns })}
        />
        <ColumnPicker
          label="Thực đơn gọi món — số món mỗi hàng"
          testIdPrefix="layout-menu"
          options={MENU_COLUMN_OPTIONS}
          value={prefs.menuColumns}
          onSelect={(menuColumns) => onChange({ menuColumns })}
        />
      </DialogContent>
    </Dialog>
  );
}

function ColumnPicker({
  label,
  testIdPrefix,
  options,
  value,
  onSelect,
}: {
  label: string;
  testIdPrefix: string;
  options: readonly number[];
  value: ColumnChoice;
  onSelect: (choice: ColumnChoice) => void;
}) {
  const choices: ColumnChoice[] = ['auto', ...options];
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-base font-bold">{label}</legend>
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={label}>
        {choices.map((choice) => {
          const isActive = value === choice;
          return (
            <button
              key={String(choice)}
              type="button"
              role="radio"
              aria-checked={isActive}
              data-testid={`${testIdPrefix}-${choice}`}
              onClick={() => onSelect(choice)}
              className={cn(
                'min-h-14 min-w-14 rounded-xl border-2 px-4 text-lg font-extrabold transition-transform active:scale-[0.97]',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                  : 'border-border bg-card text-foreground',
              )}
            >
              {choice === 'auto' ? 'Tự động' : choice}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
