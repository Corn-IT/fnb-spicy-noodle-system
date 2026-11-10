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
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useUpdateDefaultBudgetMutation } from '@/features/cashflow/api/cashflow.api';

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
      toast({
        variant: 'destructive',
        title: 'Ngân sách không hợp lệ',
        description: 'Vui lòng nhập số tiền hợp lệ (>= 0).',
      });
      return;
    }

    try {
      await updateBudgetMutation.mutateAsync(parsed.data);
      toast({
        title: 'Đã cập nhật ngân sách đầu ngày',
        description: `Ngân sách tiền lẻ mặc định đã đổi thành ${parsed.data.openingBudget.toLocaleString('vi-VN')} đ.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể lưu ngân sách mặc định',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
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
          <Input
            id="default-budget-input-field"
            type="number"
            min={0}
            step={10000}
            data-testid="default-budget-input"
            value={budgetStr}
            onChange={(e) => setBudgetStr(e.target.value)}
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
