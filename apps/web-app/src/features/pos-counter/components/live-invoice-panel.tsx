import { type OrderDetailResponse } from '@fnb/shared';
import {
  ArrowLeftRight,
  CheckCircle,
  CreditCard,
  Loader2,
  Minus,
  Plus,
  Printer,
  QrCode,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { type PosMenuSelectedItem } from './pos-menu-panel';

export type LiveInvoiceDraftTarget =
  | {
      orderType: 'DINE_IN';
      tableId: number;
      tableName: string;
    }
  | {
      orderType: 'TAKEAWAY';
    };

export interface LiveInvoicePanelProps {
  order: OrderDetailResponse | null;
  draftTarget: LiveInvoiceDraftTarget | null;
  draftItems: PosMenuSelectedItem[];
  isSplitPending: boolean;
  isProvisionalPending: boolean;
  isApprovingQr: boolean;
  isSubmittingDraft: boolean;
  onUpdateDraftQty: (index: number, delta: number) => void;
  onRemoveDraftItem: (index: number) => void;
  onSubmitDraftOrder: () => void;
  onApproveQrOrder: () => void;
  onUpdateOrderItemQuantity: (orderItemId: number, newQuantity: number) => void;
  onRemoveOrCancelOrderItem: (orderItemId: number) => void;
  onOpenTableAction: () => void;
  onSplitKitchen: () => void;
  onPrintProvisionalBill: () => void;
  onOpenCheckout: () => void;
}

export function LiveInvoicePanel({
  order,
  draftTarget,
  draftItems,
  isSplitPending,
  isProvisionalPending,
  isApprovingQr,
  isSubmittingDraft,
  onUpdateDraftQty,
  onRemoveDraftItem,
  onSubmitDraftOrder,
  onApproveQrOrder,
  onUpdateOrderItemQuantity,
  onRemoveOrCancelOrderItem,
  onOpenTableAction,
  onSplitKitchen,
  onPrintProvisionalBill,
  onOpenCheckout,
}: LiveInvoicePanelProps) {
  if (!order && draftTarget) {
    const draftTotal = draftItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const label =
      draftTarget.orderType === 'TAKEAWAY'
        ? 'Đơn Mang về mới (MV-#)'
        : draftTarget.tableName ?? `Bàn #${draftTarget.tableId}`;

    return (
      <div className="flex flex-1 min-h-0 h-full flex-col justify-between bg-card p-3 sm:p-4">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between border-b pb-2.5 sm:pb-3 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <h2 data-testid="invoice-header-label" className="text-base sm:text-lg font-bold truncate">
                {label}
              </h2>
              <p className="text-xs text-muted-foreground truncate">
                Đang chọn món tạo đơn mới ({draftTarget.orderType})
              </p>
            </div>
            <Badge className="shrink-0 bg-indigo-600 font-bold text-white shadow-xs px-2.5 py-0.5 text-xs">
              ĐƠN MỚI
            </Badge>
          </div>

          <div className="mt-3 flex-1 min-h-0 space-y-2.5 overflow-y-auto overscroll-contain touch-pan-y pr-1">
            {draftItems.length === 0 ? (
              <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Chưa có món trong giỏ. Vui lòng chọn món bên Tab Thực đơn.
              </p>
            ) : (
              draftItems.map((item, idx) => (
                <div
                  key={`${item.productId}-${idx}`}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                >
                  <div>
                    <p className="font-semibold">{item.name}</p>
                    {item.modifierLabels.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {item.modifierLabels.join(', ')}
                      </p>
                    ) : null}
                    <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                      {(item.unitPrice * item.quantity).toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => onUpdateDraftQty(idx, -1)}
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </Button>
                    <span className="w-6 text-center text-xs font-bold">{item.quantity}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => onUpdateDraftQty(idx, 1)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-rose-600"
                      onClick={() => onRemoveDraftItem(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Tổng cộng tạm tính</span>
            <span className="text-lg font-bold text-rose-600 dark:text-rose-400">
              {draftTotal.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <Button
            type="button"
            data-testid="pos-submit-new-order-btn"
            disabled={draftItems.length === 0 || isSubmittingDraft}
            onClick={onSubmitDraftOrder}
            className="w-full h-10 bg-rose-600 font-bold text-white hover:bg-rose-700 active:scale-[0.99] touch-manipulation shadow-sm"
          >
            {isSubmittingDraft ? 'Đang tạo đơn...' : 'Xác nhận Tạo Đơn'}
          </Button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Chưa chọn bàn hoặc đơn hàng</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Click vào một bàn trên sơ đồ hoặc bấm [TẠO ĐƠN MANG VỀ] để bắt đầu.
        </p>
      </div>
    );
  }

  const hasNewItems = order.items.some((item) => item.kitchenStatus === 'NEW');
  const isSplitDisabled = isSplitPending || !hasNewItems;

  // Group items by batchNo
  const batchesMap = new Map<number, OrderDetailResponse['items']>();
  for (const item of order.items) {
    const list = batchesMap.get(item.batchNo) ?? [];
    list.push(item);
    batchesMap.set(item.batchNo, list);
  }
  const sortedBatches = [...batchesMap.entries()].sort((a, b) => a[0] - b[0]);

  const resolvedHeaderLabel =
    order.tableLabel ??
    (order.orderType === 'TAKEAWAY'
      ? `Mang về #${String(order.takeawayNumber ?? 1).padStart(2, '0')}`
      : `Bàn #${order.tableId}`);

  return (
    <div className="flex h-full flex-col justify-between bg-card p-3 sm:p-4">
      <div className="flex items-start justify-between border-b pb-2.5 sm:pb-3">
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center gap-2">
            <h2 data-testid="invoice-header-label" className="text-base sm:text-lg font-bold truncate">
              {resolvedHeaderLabel}
            </h2>
            <Badge
              data-testid="invoice-status-badge"
              className={cn(
                'shrink-0 font-bold shadow-xs px-2.5 py-0.5 text-xs',
                order.status === 'PENDING' && 'bg-amber-500 text-white',
                order.status === 'SERVING' && 'bg-rose-600 text-white',
                order.status === 'PAID' && 'bg-emerald-600 text-white',
              )}
            >
              {order.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground truncate">
            Mã HĐ: <span className="font-mono font-semibold">{order.orderCode}</span> • Nguồn:{' '}
            {order.orderSource}
          </p>
        </div>

        {order.status === 'PENDING' && order.orderSource === 'QR_CODE' ? (
          <Button
            type="button"
            size="sm"
            data-testid="approve-qr-order-btn"
            disabled={isApprovingQr}
            onClick={onApproveQrOrder}
            className="bg-amber-500 font-bold text-white hover:bg-amber-600"
          >
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>Duyệt đơn QR</span>
          </Button>
        ) : null}
      </div>

      <div className="my-3 flex-1 min-h-0 space-y-4 overflow-y-auto overscroll-contain touch-pan-y pr-1">
        {sortedBatches.map(([batchNo, batchItems]) => (
          <div key={batchNo} className="space-y-2">
            <div className="rounded bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {batchNo === 1 ? 'Lượt 1' : `GỌI THÊM - LƯỢT ${batchNo}`}
            </div>

            <div className="space-y-2">
              {batchItems.map((item) => {
                const isCancelled = item.kitchenStatus === 'CANCELLED';
                const isPrinted = item.kitchenStatus === 'PRINTED';
                const isNew = item.kitchenStatus === 'NEW';

                return (
                  <div
                    key={item.id}
                    data-testid={`invoice-item-${item.id}`}
                    className={cn(
                      'flex items-center justify-between rounded-lg border p-2.5 text-sm',
                      isCancelled && 'bg-muted/40 opacity-60 line-through',
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold">
                          {item.quantity}x {item.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-2 py-0.5 font-bold',
                            isNew &&
                              'border-amber-500/80 bg-amber-50 text-amber-800 dark:border-amber-400/70 dark:bg-amber-950/60 dark:text-amber-200',
                            isPrinted &&
                              'border-emerald-600/80 bg-emerald-50 text-emerald-800 dark:border-emerald-400/70 dark:bg-emerald-950/60 dark:text-emerald-200',
                            isCancelled &&
                              'border-rose-500/80 bg-rose-50 text-rose-700 dark:border-rose-400/70 dark:bg-rose-950/60 dark:text-rose-200',
                          )}
                        >
                          {isNew ? 'Mới gọi' : isPrinted ? 'Đã in bếp' : 'Đã huỷ'}
                        </Badge>
                      </div>
                      {item.modifiers.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {item.modifiers.join(', ')}
                        </p>
                      ) : null}
                      {item.itemNote ? (
                        <p className="text-xs italic font-medium text-amber-700 dark:text-amber-300">
                          Ghi chú: {item.itemNote}
                        </p>
                      ) : null}
                      <p className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {item.lineTotal.toLocaleString('vi-VN')} đ
                      </p>
                    </div>

                    {!isCancelled ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isNew ? (
                          <>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              disabled={item.quantity <= 1}
                              onClick={() =>
                                onUpdateOrderItemQuantity(item.id, item.quantity - 1)
                              }
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-7 w-7"
                              onClick={() =>
                                onUpdateOrderItemQuantity(item.id, item.quantity + 1)
                              }
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              data-testid={`delete-new-item-${item.id}`}
                              onClick={() => onRemoveOrCancelOrderItem(item.id)}
                              className="text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            data-testid={`cancel-printed-item-${item.id}`}
                            onClick={() => onRemoveOrCancelOrderItem(item.id)}
                            className="border-rose-500 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-400/70 dark:text-rose-300 dark:hover:bg-rose-950/50"
                          >
                            Huỷ món bếp
                          </Button>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t pt-2.5 sm:pt-3">
        <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-semibold text-muted-foreground">Tổng thanh toán</span>
          <span
            data-testid="invoice-total-amount"
            className="text-lg sm:text-xl font-extrabold text-rose-600 dark:text-rose-400 tabular-nums"
          >
            {order.totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="btn-table-action"
            onClick={onOpenTableAction}
            className="h-10 px-3 text-xs xl:text-sm font-semibold touch-manipulation active:scale-[0.98]"
          >
            <ArrowLeftRight className="h-4 w-4 shrink-0" />
            <span>Đổi / Gộp bàn</span>
          </Button>

          <Button
            type="button"
            data-testid="btn-split-kitchen"
            disabled={isSplitDisabled}
            onClick={onSplitKitchen}
            className="h-10 px-3 text-xs xl:text-sm bg-amber-600 font-bold text-white hover:bg-amber-700 disabled:opacity-50 touch-manipulation active:scale-[0.98] shadow-xs"
          >
            {isSplitPending ? (
              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            ) : (
              <Printer className="h-4 w-4 shrink-0" />
            )}
            <span>Tách đơn</span>
          </Button>

          <Button
            type="button"
            variant="secondary"
            data-testid="btn-provisional-bill"
            disabled={isProvisionalPending || order.status !== 'SERVING'}
            onClick={onPrintProvisionalBill}
            className="h-10 px-3 text-xs xl:text-sm font-semibold touch-manipulation active:scale-[0.98]"
          >
            <QrCode className="h-4 w-4 shrink-0" />
            <span>In tạm tính (QR)</span>
          </Button>

          <Button
            type="button"
            data-testid="btn-checkout"
            disabled={order.status !== 'SERVING'}
            onClick={onOpenCheckout}
            className="h-10 px-3 text-xs xl:text-sm bg-emerald-600 font-bold text-white hover:bg-emerald-700 disabled:opacity-50 touch-manipulation active:scale-[0.98] shadow-xs"
          >
            <CreditCard className="h-4 w-4 shrink-0" />
            <span>Thanh toán</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
