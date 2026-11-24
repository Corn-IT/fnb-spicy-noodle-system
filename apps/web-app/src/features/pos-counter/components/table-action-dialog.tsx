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
      setReason(
        order?.orderType === 'TAKEAWAY'
          ? 'Khách đổi ý ngồi dùng tại bàn'
          : 'Khách yêu cầu đổi chỗ ngồi',
      );
    }
  }, [open, order?.orderType]);

  if (!order) return null;

  const isTakeaway = order.orderType === 'TAKEAWAY';
  const requiresTargetTable = action !== TableActionType.TO_TAKEAWAY;

  const availableActions = isTakeaway
    ? ([
        { type: TableActionType.MOVE, label: 'Chuyển sang bàn trống' },
        { type: TableActionType.MERGE, label: 'Gộp vào bàn đang ăn' },
      ] as const)
    : ([
        { type: TableActionType.MOVE, label: 'Chuyển bàn trống' },
        { type: TableActionType.MERGE, label: 'Gộp vào bàn khác' },
        { type: TableActionType.SWAP, label: 'Hoán đổi 2 bàn' },
        { type: TableActionType.TO_TAKEAWAY, label: 'Chuyển sang Mang về' },
      ] as const);

  const candidateTables = tables.filter((t) => {
    if (t.id === order.tableId) return false;
    if (action === TableActionType.MOVE) return t.status === 'AVAILABLE';
    if (action === TableActionType.MERGE || action === TableActionType.SWAP) {
      return t.status === 'OCCUPIED';
    }
    return false;
  });

  const handleSelectAction = (nextAction: TableActionTypeValue) => {
    setAction(nextAction);
    setTargetTableId(null);
    if (nextAction === TableActionType.TO_TAKEAWAY) {
      setReason('Khách yêu cầu chuyển cả đơn sang Mang về');
    } else if (isTakeaway) {
      setReason(
        nextAction === TableActionType.MERGE
          ? 'Khách mang về gộp chung với bàn đang ăn'
          : 'Khách đổi ý ngồi dùng tại bàn',
      );
    } else {
      setReason('Khách yêu cầu đổi chỗ ngồi');
    }
  };

  const handleConfirm = () => {
    if (!reason.trim()) return;
    if (requiresTargetTable && !targetTableId) return;
    onConfirm({
      action,
      targetTableId: requiresTargetTable ? targetTableId : null,
      reason: reason.trim(),
    });
  };

  const dialogCopy = resolveMessage('pos.dialog.tableAction', {
    tableLabel: order.tableLabel,
  });

  const confirmLabel =
    action === TableActionType.MOVE
      ? isTakeaway
        ? 'Xác nhận Chuyển vào bàn'
        : 'Xác nhận Chuyển bàn'
      : action === TableActionType.MERGE
        ? 'Xác nhận Gộp bàn'
        : action === TableActionType.TO_TAKEAWAY
          ? 'Xác nhận Chuyển sang Mang về'
          : 'Xác nhận Hoán đổi bàn';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="table-action-dialog">
        <DialogHeader>
          <DialogTitle>{dialogCopy.title}</DialogTitle>
          {dialogCopy.description ? (
            <DialogDescription>{dialogCopy.description}</DialogDescription>
          ) : null}
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div
            className={cn(
              'grid grid-cols-1 gap-2',
              isTakeaway ? 'sm:grid-cols-2' : 'sm:grid-cols-2',
            )}
          >
            {availableActions.map((item) => (
              <button
                key={item.type}
                type="button"
                data-testid={`table-action-type-${item.type}`}
                onClick={() => handleSelectAction(item.type)}
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

          {requiresTargetTable ? (
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
          ) : (
            <div
              data-testid="to-takeaway-info-box"
              className="rounded-lg border border-sky-500/40 bg-sky-500/10 p-3 text-xs font-medium text-sky-900 dark:text-sky-200"
            >
              Bàn hiện tại ({order.tableLabel}) sẽ được giải phóng về trạng thái <strong>Trống</strong>. Đơn hàng được cấp số Mang về tiếp theo trong ngày và giữ nguyên toàn bộ món ăn cùng trạng thái bếp.
            </div>
          )}

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
              Cảnh báo: Đơn nguồn đang có ưu đãi giảm giá. Khi gộp bàn, giảm giá của đơn nguồn sẽ tự động bị huỷ và bàn đích sẽ tính lại tổng tiền.
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="font-semibold active:scale-[0.98] transition-transform select-none"
            onClick={() => onOpenChange(false)}
          >
            Huỷ bỏ
          </Button>
          <Button
            type="button"
            data-testid="confirm-table-action-btn"
            disabled={(requiresTargetTable && !targetTableId) || !reason.trim() || isSubmitting}
            onClick={handleConfirm}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold active:scale-[0.98] transition-transform select-none shadow-xs"
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
