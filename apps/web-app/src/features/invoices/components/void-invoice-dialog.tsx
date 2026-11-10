import { VoidInvoiceRequestSchema } from '@fnb/shared';
import { AlertTriangle } from 'lucide-react';
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
import { toast } from '@/components/ui/toast';
import {
  type InvoiceListItem,
  useVoidInvoiceMutation,
} from '@/features/invoices/api/invoices.api';

export interface VoidInvoiceDialogProps {
  invoice: InvoiceListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function VoidInvoiceDialog({
  invoice,
  open,
  onOpenChange,
}: VoidInvoiceDialogProps) {
  const [voidReason, setVoidReason] = React.useState('');
  const voidMutation = useVoidInvoiceMutation();

  React.useEffect(() => {
    if (open) {
      setVoidReason('');
    }
  }, [open, invoice?.orderId]);

  const validation = React.useMemo(
    () => VoidInvoiceRequestSchema.safeParse({ voidReason }),
    [voidReason],
  );

  const handleConfirmVoid = async () => {
    if (!invoice || !validation.success) return;

    try {
      await voidMutation.mutateAsync({
        orderId: invoice.orderId,
        body: validation.data,
      });

      toast({
        title: 'Đã huỷ hoá đơn',
        description: `Hoá đơn ${invoice.orderCode} đã được chuyển sang trạng thái Đã huỷ và loại trừ khỏi doanh thu kết ca.`,
      });
      onOpenChange(false);
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Không thể huỷ hoá đơn',
        description: err instanceof Error ? err.message : 'Đã xảy ra lỗi khi huỷ hoá đơn.',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="void-invoice-dialog" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>Huỷ hoá đơn ngoại lệ</span>
          </DialogTitle>
          <DialogDescription>
            Thao tác này sẽ chuyển hoá đơn{' '}
            <strong className="text-foreground">{invoice?.orderCode}</strong> sang trạng thái{' '}
            <strong className="text-destructive">Đã huỷ</strong> và khấu trừ khỏi doanh thu kết ca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <label
            htmlFor="void-reason-textarea"
            className="block text-xs font-semibold uppercase tracking-wide text-foreground"
          >
            Lý do huỷ hoá đơn (Bắt buộc tối thiểu 10 ký tự) *
          </label>
          <textarea
            id="void-reason-textarea"
            data-testid="void-reason-input"
            rows={3}
            value={voidReason}
            onChange={(e) => setVoidReason(e.target.value)}
            placeholder="Nhập lý do chi tiết (VD: Thu ngân chọn nhầm phương thức thanh toán...)"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between text-xs">
            <span
              className={
                voidReason.trim().length > 0 && !validation.success
                  ? 'font-medium text-destructive'
                  : 'text-muted-foreground'
              }
            >
              {voidReason.trim().length > 0 && !validation.success
                ? 'Lý do huỷ hoá đơn phải có ít nhất 10 ký tự'
                : 'Yêu cầu tối thiểu 10 ký tự để lưu vết kiểm toán.'}
            </span>
            <span className="text-muted-foreground">{voidReason.trim().length}/500</span>
          </div>
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
            variant="destructive"
            data-testid="confirm-void-invoice-btn"
            disabled={!validation.success || voidMutation.isPending}
            onClick={handleConfirmVoid}
            className="font-bold shadow-xs active:scale-[0.98] transition-transform select-none"
          >
            Xác nhận Huỷ đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
