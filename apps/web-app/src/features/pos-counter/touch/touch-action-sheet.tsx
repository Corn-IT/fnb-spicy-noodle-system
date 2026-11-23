import type { LucideIcon } from 'lucide-react';

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

export interface TouchSheetAction {
  key: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  tone?: 'default' | 'destructive' | 'success';
  disabled?: boolean;
  onSelect: () => void;
}

export interface TouchActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  actions: TouchSheetAction[];
  testId?: string;
}

/** Danh sách thao tác dạng nút lớn trượt từ phải, thay cho menu Popover nhỏ. */
export function TouchActionSheet({
  open,
  onOpenChange,
  title,
  description,
  actions,
  testId,
}: TouchActionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        data-testid={testId}
        className="flex w-[360px] max-w-[90vw] flex-col gap-4 p-5"
      >
        <SheetHeader className="pr-12 text-left">
          <SheetTitle className="text-xl font-bold">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-sm">{description}</SheetDescription>
          ) : null}
        </SheetHeader>
        <div className="flex flex-1 min-h-0 flex-col gap-2.5 overflow-y-auto overscroll-contain">
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                data-testid={`touch-sheet-action-${action.key}`}
                disabled={action.disabled}
                onClick={() => {
                  onOpenChange(false);
                  // Đợi sheet đóng xong rồi mới mở dialog kế tiếp để Radix trả focus đúng chỗ.
                  window.setTimeout(action.onSelect, 0);
                }}
                className={cn(
                  'flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-transform active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
                  action.tone === 'destructive'
                    ? 'border-rose-500/50 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                    : action.tone === 'success'
                      ? 'border-emerald-600/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                      : 'border-border bg-card text-foreground',
                )}
              >
                <Icon className="h-6 w-6 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-base font-bold leading-snug">{action.label}</span>
                  {action.hint ? (
                    <span className="block text-xs font-medium opacity-75">{action.hint}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
