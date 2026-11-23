import { type OrderDetailResponse } from '@fnb/shared';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
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
import { cn } from '@/utils/cn';

const QUICK_CANCEL_REASONS = [
  'Khách đổi ý không dùng nữa',
  'Thu ngân nhập nhầm bàn',
  'Khách rời đi / bỏ bàn',
] as const;

const CUSTOM_REASON_KEY = '__CUSTOM__';

export interface CancelOrderConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetailResponse;
  isPending?: boolean;
  onConfirm: (reason: string) => void | Promise<void>;
}

export function CancelOrderConfirmDialog({
  open,
  onOpenChange,
  order,
  isPending = false,
  onConfirm,
}: CancelOrderConfirmDialogProps) {
  const [selectedChip, setSelectedChip] = React.useState<string>(QUICK_CANCEL_REASONS[0]);
  const [customReason, setCustomReason] = React.useState<string>('');

  React.useEffect(() => {
    if (open) {
      setSelectedChip(QUICK_CANCEL_REASONS[0]);
      setCustomReason('');
    }
  }, [open, order.orderId]);

  const isTakeaway = order.orderType === 'TAKEAWAY';
  const targetLabel =
    order.tableLabel ??
    (isTakeaway
      ? `Mang về #${String(order.takeawayNumber ?? 1).padStart(2, '0')}`
      : `Bàn #${order.tableId}`);

  const activeItems = order.items.filter((i) => i.kitchenStatus !== 'CANCELLED');
  const activeItemCount = activeItems.reduce((sum, i) => sum + i.quantity, 0);
  const printedItemCount = activeItems
    .filter((i) => i.kitchenStatus === 'PRINTED')
    .reduce((sum, i) => sum + i.quantity, 0);

  const isCustom = selectedChip === CUSTOM_REASON_KEY;
  const resolvedReason = isCustom ? customReason.trim() : selectedChip;
  const isReasonValid = resolvedReason.length >= 10;

  const handleSubmit = () => {
    if (!isReasonValid || isPending) return;
    void onConfirm(resolvedReason);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="cancel-order-confirm-dialog"
        className="sm:max-w-md max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
            <Trash2 className="h-5 w-5 shrink-0" />
            <span>{isTakeaway ? 'Huỷ đơn mang về' : 'Huỷ đơn & Giải phóng bàn'}</span>
          </DialogTitle>
          <DialogDescription>
            Thao tác này sẽ huỷ toàn bộ đơn hàng và không thể hoàn tác. Vui lòng kiểm tra kỹ trước khi xác nhận.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Order summary */}
          <div className="rounded-lg border bg-muted/30 p-3 text-xs sm:text-sm space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Bàn / Đơn:</span>
              <span className="font-bold text-foreground">
                {targetLabel} ({order.orderCode})
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Số món đang mở:</span>
              <span className="font-bold text-foreground">{activeItemCount} món</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Tổng tiền:</span>
              <span className="font-extrabold text-price tabular-nums">
                {order.totalAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>

          {/* Printed kitchen items warning */}
          {printedItemCount > 0 ? (
            <div
              data-testid="cancel-order-printed-warning"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>
                Đơn hiện có <strong>{printedItemCount} món đã báo bếp</strong>. Sau khi xác nhận, hệ thống sẽ tự động in <strong>Phiếu báo huỷ món</strong> xuống các trạm bếp liên quan.
              </span>
            </div>
          ) : null}

          {/* Quick reason chips */}
          <div className="space-y-2">
            <span className="block text-xs font-semibold text-foreground">
              Chọn lý do huỷ đơn:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CANCEL_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  data-testid={`cancel-reason-chip-${reason}`}
                  onClick={() => setSelectedChip(reason)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    selectedChip === reason
                      ? 'border-rose-600 bg-rose-600 text-white'
                      : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {reason}
                </button>
              ))}
              <button
                type="button"
                data-testid="cancel-reason-chip-custom"
                onClick={() => setSelectedChip(CUSTOM_REASON_KEY)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                  isCustom
                    ? 'border-rose-600 bg-rose-600 text-white'
                    : 'border-border bg-background text-foreground hover:bg-muted',
                )}
              >
                Khác...
              </button>
            </div>

            {isCustom ? (
              <div className="space-y-1 pt-1">
                <textarea
                  data-testid="cancel-order-custom-reason-input"
                  rows={2}
                  maxLength={500}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Nhập lý do huỷ đơn (tối thiểu 10 ký tự)..."
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs sm:text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {!isReasonValid ? (
                  <p
                    data-testid="cancel-order-reason-error"
                    className="text-[11px] font-medium text-rose-600 dark:text-rose-400"
                  >
                    Vui lòng nhập ít nhất 10 ký tự ({resolvedReason.length}/10).
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="btn-cancel-order-dismiss"
            disabled={isPending}
            onClick={() => onOpenChange(false)}
          >
            Quay lại
          </Button>
          <Button
            type="button"
            data-testid="btn-cancel-order-confirm"
            disabled={!isReasonValid || isPending}
            onClick={handleSubmit}
            className="bg-rose-600 font-bold text-white hover:bg-rose-700"
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" />
            )}
            <span>{isTakeaway ? 'Xác nhận huỷ đơn' : 'Huỷ đơn & Giải phóng bàn'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
