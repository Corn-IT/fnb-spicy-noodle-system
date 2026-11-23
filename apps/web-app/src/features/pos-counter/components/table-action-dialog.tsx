import {
  TableActionType,
  type OrderDetailResponse,
  type PosTableGridResponse,
  type TableActionRequest,
  type TableActionType as TableActionTypeValue,
} from '@fnb/shared';
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
import { useAppMessages } from '@/hooks/use-app-messages';
import { cn } from '@/utils/cn';

export interface TableActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetailResponse | null;
  tables: PosTableGridResponse['tables'];
  isSubmitting: boolean;
  onConfirm: (input: TableActionRequest) => void;
}

export function TableActionDialog({
  open,
  onOpenChange,
  order,
  tables,
  isSubmitting,
  onConfirm,
}: TableActionDialogProps) {
  const { resolveMessage } = useAppMessages();
  const [action, setAction] = React.useState<TableActionTypeValue>(TableActionType.MOVE);
  const [targetTableId, setTargetTableId] = React.useState<number | null>(null);
  const [reason, setReason] = React.useState('Khách yêu cầu đổi chỗ ngồi');

  React.useEffect(() => {
    if (open) {
      setAction(TableActionType.MOVE);
      setTargetTableId(null);
      setReason('Khách yêu cầu đổi chỗ ngồi');
    }
  }, [open]);

  if (!order) return null;

  const isTakeaway = order.orderType === 'TAKEAWAY';

  const candidateTables = tables.filter((t) => {
    if (t.id === order.tableId) return false;
    if (action === TableActionType.MOVE) return t.status === 'AVAILABLE';
    if (action === TableActionType.MERGE || action === TableActionType.SWAP) {
      return t.status === 'OCCUPIED';
    }
    return false;
  });

  const handleConfirm = () => {
    if (isTakeaway || !targetTableId || !reason.trim()) return;
    onConfirm({
      action,
      targetTableId,
      reason: reason.trim(),
    });
  };

  const dialogCopy = resolveMessage('pos.dialog.tableAction', {
    tableLabel: order.tableLabel,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="table-action-dialog">
        <DialogHeader>
          <DialogTitle>{dialogCopy.title}</DialogTitle>
          {dialogCopy.description ? (
            <DialogDescription>{dialogCopy.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        {isTakeaway ? (
          <div
            data-testid="takeaway-action-blocked-msg"
            className="rounded-lg border border-rose-500/40 bg-rose-50 p-4 text-sm font-medium text-rose-700 dark:bg-rose-950/50 dark:text-rose-200"
          >
            Đơn Mang về ({order.tableLabel}) hoạt động độc lập, không được phép Gộp hoặc Chuyển
            vào bàn vật lý (EC-POS-03).
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { type: TableActionType.MOVE, label: 'Chuyển bàn trống' },
                  { type: TableActionType.MERGE, label: 'Gộp vào bàn khác' },
                  { type: TableActionType.SWAP, label: 'Hoán đổi 2 bàn' },
                ] as const
              ).map((item) => (
                <button
                  key={item.type}
                  type="button"
                  data-testid={`table-action-type-${item.type}`}
                  onClick={() => {
                    setAction(item.type);
                    setTargetTableId(null);
                  }}
                  className={cn(
                    'flex items-center justify-center text-center rounded-lg border px-3 py-2 text-xs font-semibold transition active:scale-[0.98] touch-ui:min-h-12 touch-ui:text-sm',
                    action === item.type
                      ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-semibold">
                Chọn bàn đích ({candidateTables.length} bàn khả dụng)
              </span>
              {candidateTables.length === 0 ? (
                <p className="rounded border border-dashed p-3 text-xs text-muted-foreground">
                  Không có bàn đích phù hợp cho thao tác {action}.
                </p>
              ) : (
                <div className="grid max-h-40 grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto overscroll-contain touch-ui:max-h-[min(16rem,40dvh)] touch-ui:sm:grid-cols-5">
                  {candidateTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`target-table-${t.id}`}
                      onClick={() => setTargetTableId(t.id)}
                      className={cn(
                        'flex items-center justify-center text-center rounded-lg border p-2 text-xs font-bold transition active:scale-95 touch-ui:min-h-12 touch-ui:text-base',
                        targetTableId === t.id
                          ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                          : 'border-border bg-card hover:bg-muted',
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="table-action-reason" className="text-xs font-semibold">
                Lý do thực hiện
              </label>
              <Input
                id="table-action-reason"
                data-testid="table-action-reason-input"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {action === TableActionType.MERGE &&
            (Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0) ? (
              <div
                data-testid="merge-discount-drop-warning"
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs font-medium text-amber-800 dark:text-amber-300"
              >
                Cảnh báo: Bàn nguồn đang có ưu đãi giảm giá. Khi gộp bàn, giảm giá của bàn nguồn sẽ tự động bị huỷ và bàn đích sẽ tính lại tổng tiền.
              </div>
            ) : null}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="font-semibold active:scale-[0.98] transition-transform select-none"
            onClick={() => onOpenChange(false)}
          >
            Huỷ bỏ
          </Button>
          {!isTakeaway ? (
            <Button
              type="button"
              data-testid="confirm-table-action-btn"
              disabled={!targetTableId || !reason.trim() || isSubmitting}
              onClick={handleConfirm}
              className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold active:scale-[0.98] transition-transform select-none shadow-xs"
            >
              {action === TableActionType.MOVE
                ? 'Xác nhận Chuyển bàn'
                : action === TableActionType.MERGE
                  ? 'Xác nhận Gộp bàn'
                  : 'Xác nhận Hoán đổi bàn'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
