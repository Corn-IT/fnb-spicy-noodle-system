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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="table-action-dialog">
        <DialogHeader>
          <DialogTitle>Chuyển / Gộp / Hoán đổi Bàn — {order.tableLabel}</DialogTitle>
          <DialogDescription>
            Chọn thao tác bàn và bàn đích. Nếu đã có món in bếp, hệ thống sẽ tự động in Phiếu
            Thông báo Đổi bàn.
          </DialogDescription>
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
                  { type: TableActionType.MOVE, label: 'Chuyển bàn trống (MOVE)' },
                  { type: TableActionType.MERGE, label: 'Gộp vào bàn (MERGE)' },
                  { type: TableActionType.SWAP, label: 'Đổi 2 bàn (SWAP)' },
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
                    'flex items-center justify-center text-center rounded-lg border px-3 py-2 text-xs font-semibold transition active:scale-[0.98]',
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
                <div className="grid max-h-40 grid-cols-3 sm:grid-cols-4 gap-2 overflow-y-auto">
                  {candidateTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      data-testid={`target-table-${t.id}`}
                      onClick={() => setTargetTableId(t.id)}
                      className={cn(
                        'flex items-center justify-center text-center rounded-lg border p-2 text-xs font-bold transition active:scale-95',
                        targetTableId === t.id
                          ? 'border-rose-600 bg-rose-600 text-white shadow-xs'
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
              className="bg-rose-600 text-white hover:bg-rose-700 font-bold active:scale-[0.98] transition-transform select-none shadow-xs"
            >
              Thực hiện {action}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
