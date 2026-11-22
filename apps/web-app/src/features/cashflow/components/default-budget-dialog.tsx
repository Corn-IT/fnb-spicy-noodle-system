import { UpdateDefaultBudgetSchema } from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CurrencyInput } from '@/components/ui/currency-input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useUpdateDefaultBudgetMutation } from '@/features/cashflow/api/cashflow.api';
import { formatVnd } from '@/utils/currency';

export interface DefaultBudgetDialogProps {
  currentBudget: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DefaultBudgetDialog({
  currentBudget,
  open,
  onOpenChange,
}: DefaultBudgetDialogProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const [budgetStr, setBudgetStr] = React.useState(String(currentBudget));
  const updateBudgetMutation = useUpdateDefaultBudgetMutation();

  React.useEffect(() => {
    if (open) {
      setBudgetStr(String(currentBudget));
    }
  }, [open, currentBudget]);

  const handleSave = async () => {
    const parsed = UpdateDefaultBudgetSchema.safeParse({
      openingBudget: Number(budgetStr),
    });
    if (!parsed.success) {
      notify('cashflow.budget.invalidAmount', { variant: 'destructive' });
      return;
    }

    try {
      await updateBudgetMutation.mutateAsync(parsed.data);
      notify('cashflow.budget.saveSuccess', {
        vars: { amountFormatted: formatVnd(parsed.data.openingBudget) },
      });
      onOpenChange(false);
    } catch (err) {
      const resolvedErr = resolveErrorMessage(
        'cashflow.budget.saveError',
        err,
        'Vui lòng thử lại.',
      );
      notify('cashflow.budget.saveError', {
        variant: 'destructive',
        vars: { reason: resolvedErr.description ?? 'Vui lòng thử lại.' },
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="default-budget-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cấu hình Ngân sách Tiền lẻ Đầu ngày</DialogTitle>
          <DialogDescription>
            Thiết lập số tiền mặt cố định để lại trong két đầu mỗi ca làm việc phục vụ thối tiền lẻ
            (Quyền <code className="font-mono">cashflow:config</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <label
            htmlFor="default-budget-input-field"
            className="block text-xs font-semibold text-foreground"
          >
            Ngân sách tiền lẻ mặc định (VNĐ)
          </label>
          <CurrencyInput
            id="default-budget-input-field"
            data-testid="default-budget-input"
            value={budgetStr}
            onValueChange={(rawDigits) => setBudgetStr(rawDigits)}
            placeholder="VD: 1.000.000"
            suffix="đ"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="active:scale-[0.98] transition-transform select-none"
          >
            Huỷ bỏ
          </Button>
          <Button
            type="button"
            data-testid="save-default-budget-btn"
            disabled={updateBudgetMutation.isPending}
            onClick={handleSave}
            className="font-bold shadow-xs active:scale-[0.98] transition-transform select-none"
          >
            Lưu ngân sách
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
