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
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  isCancellingOrder?: boolean;
  isReprintPending?: boolean;
  onUpdateDraftQty: (index: number, delta: number) => void;
  onRemoveDraftItem: (index: number) => void;
  onSubmitDraftOrder: () => void;
  onApproveQrOrder: () => void;
  onUpdateOrderItemQuantity: (orderItemId: number, newQuantity: number) => void;
  onRemoveOrCancelOrderItem: (orderItemId: number) => void;
  onOpenTableAction: () => void;
  onSplitKitchen: () => void;
  onReprintKitchen?: (batchNo?: number) => void;
  onPrintProvisionalBill: () => void;
  onOpenCheckout: () => void;
  onCancelOrder?: (reason?: string) => void;
}

export function LiveInvoicePanel({
  order,
  draftTarget,
  draftItems,
  isSplitPending,
  isProvisionalPending,
  isApprovingQr,
  isSubmittingDraft,
  isCancellingOrder = false,
  isReprintPending = false,
  onUpdateDraftQty,
  onRemoveDraftItem,
  onSubmitDraftOrder,
  onApproveQrOrder,
  onUpdateOrderItemQuantity,
  onRemoveOrCancelOrderItem,
  onOpenTableAction,
  onSplitKitchen,
  onReprintKitchen,
  onPrintProvisionalBill,
  onOpenCheckout,
  onCancelOrder,
}: LiveInvoicePanelProps) {
  const [confirmDeleteItemId, setConfirmDeleteItemId] = React.useState<number | null>(null);
  const [confirmDeleteDraftIndex, setConfirmDeleteDraftIndex] = React.useState<number | null>(null);

  if (!order && draftTarget) {
    const draftTotal = draftItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const label =
      draftTarget.orderType === 'TAKEAWAY'
        ? 'Đơn Mang về mới'
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
                Đang chọn món tạo đơn mới ({draftTarget.orderType === 'DINE_IN' ? 'TẠI BÀN' : 'MANG VỀ'})
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
                    <Popover
                      open={confirmDeleteDraftIndex === idx}
                      onOpenChange={(open) => setConfirmDeleteDraftIndex(open ? idx : null)}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent side="bottom" align="end" sideOffset={4} className="w-48 p-2.5 shadow-lg border bg-popover text-popover-foreground">
                        <p className="text-xs font-semibold mb-2">Bỏ món khỏi giỏ?</p>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-xs"
                            onClick={() => setConfirmDeleteDraftIndex(null)}
                          >
                            Huỷ
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            className="h-6 px-2.5 text-xs font-bold"
                            onClick={() => {
                              setConfirmDeleteDraftIndex(null);
                              onRemoveDraftItem(idx);
                            }}
                          >
                            Xoá
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
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

  const activeItems = order.items.filter((item) => item.kitchenStatus !== 'CANCELLED');
  const isAllCancelled = order.items.length > 0 && activeItems.length === 0;
  const hasNewItems = order.items.some((item) => item.kitchenStatus === 'NEW');
  const hasPrintedItems = order.items.some((item) => item.kitchenStatus === 'PRINTED');
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

  const resolvedStatusLabel =
    order.status === 'PENDING'
      ? 'Chờ duyệt QR'
      : order.status === 'SERVING'
        ? 'Đang phục vụ'
        : order.status === 'PAID'
          ? 'Đã thanh toán'
          : order.status === 'VOIDED'
            ? 'Đã huỷ'
            : order.status === 'MERGED'
              ? 'Đã gộp'
              : order.status;

  const resolvedOrderSourceLabel =
    order.orderSource === 'QR_CODE'
      ? 'Quét QR tại bàn'
      : order.orderSource === 'POS_COUNTER'
        ? 'Đặt đơn tại quầy'
        : order.orderSource;

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
                order.status === 'VOIDED' && 'bg-slate-600 text-white',
                order.status === 'MERGED' && 'bg-purple-600 text-white',
              )}
            >
              {resolvedStatusLabel}
            </Badge>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Mã HĐ: <span className="font-mono font-semibold">{order.orderCode}</span> • Nguồn:{' '}
            <span className="whitespace-nowrap">{resolvedOrderSourceLabel}</span>
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
        {order.items.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed text-center text-muted-foreground p-4">
            <ShoppingBag className="h-8 w-8 mb-2 opacity-40 text-muted-foreground" />
            <p className="text-xs sm:text-sm font-semibold">Đơn chưa có món nào</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Chọn món từ thực đơn để thêm vào đơn này</p>
          </div>
        ) : (
          sortedBatches.map(([batchNo, batchItems]) => {
          const hasPrintedInBatch = batchItems.some((item) => item.kitchenStatus === 'PRINTED');
          return (
            <div key={batchNo} className="space-y-2">
              <div className="flex items-center justify-between rounded bg-muted px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>{batchNo === 1 ? 'Lượt 1' : `GỌI THÊM - LƯỢT ${batchNo}`}</span>
                {hasPrintedInBatch ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    data-testid={`btn-reprint-batch-${batchNo}`}
                    disabled={isReprintPending}
                    onClick={() => onReprintKitchen?.(batchNo)}
                    className="h-6 px-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400 hover:bg-amber-100/60 dark:hover:bg-amber-950/40 gap-1 flex items-center"
                    title={`In lại phiếu bếp Lượt ${batchNo}`}
                  >
                    <Printer className="h-3 w-3" />
                    <span>In lại</span>
                  </Button>
                ) : null}
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
                            <Popover
                              open={confirmDeleteItemId === item.id}
                              onOpenChange={(open) =>
                                setConfirmDeleteItemId(open ? item.id : null)
                              }
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  data-testid={`delete-new-item-${item.id}`}
                                  className="text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent
                                side="top"
                                align="end"
                                className="w-52 p-3 shadow-lg border bg-popover text-popover-foreground"
                              >
                                <p className="text-xs font-semibold mb-2">
                                  Xác nhận xoá món khỏi đơn?
                                </p>
                                <div className="flex items-center justify-end gap-1.5">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setConfirmDeleteItemId(null)}
                                  >
                                    Huỷ
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="destructive"
                                    data-testid={`confirm-delete-new-item-${item.id}`}
                                    className="h-7 px-2.5 text-xs font-bold"
                                    onClick={() => {
                                      setConfirmDeleteItemId(null);
                                      onRemoveOrCancelOrderItem(item.id);
                                    }}
                                  >
                                    Xoá món
                                  </Button>
                                </div>
                              </PopoverContent>
                            </Popover>
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
        );
      })
      )}
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

        {order.items.length === 0 ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-amber-500/30 bg-amber-50 p-2.5 text-center text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {order.orderType === 'TAKEAWAY'
                ? 'Đơn mang về chưa có món nào. Bạn có thể huỷ đơn nếu không tiếp tục.'
                : 'Đơn chưa có món nào. Bạn có thể huỷ đơn để giải phóng bàn.'}
            </div>
            <Button
              type="button"
              data-testid="btn-void-empty-order"
              disabled={isCancellingOrder}
              onClick={() =>
                onCancelOrder?.(
                  order.orderType === 'TAKEAWAY'
                    ? 'Thu ngân huỷ đơn mang về rỗng'
                    : 'Thu ngân huỷ đơn bàn rỗng',
                )
              }
              className="w-full h-10 px-3 text-xs xl:text-sm bg-rose-600 font-bold text-white hover:bg-rose-700 disabled:opacity-50 touch-manipulation active:scale-[0.98] shadow-xs"
            >
              {isCancellingOrder ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Trash2 className="h-4 w-4 shrink-0" />
              )}
              <span>{order.orderType === 'TAKEAWAY' ? 'Huỷ đơn mang về' : 'Huỷ đơn & Giải phóng bàn'}</span>
            </Button>
          </div>
        ) : isAllCancelled ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-rose-500/30 bg-rose-50 p-2.5 text-center text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {order.orderType === 'TAKEAWAY'
                ? 'Tất cả món đã bị huỷ. Hãy huỷ đơn mang về.'
                : 'Tất cả món đã bị huỷ. Hãy huỷ đơn để giải phóng bàn.'}
            </div>
            <Button
              type="button"
              data-testid="btn-void-order"
              disabled={isCancellingOrder}
              onClick={() => onCancelOrder?.()}
              className="w-full h-10 px-3 text-xs xl:text-sm bg-rose-600 font-bold text-white hover:bg-rose-700 disabled:opacity-50 touch-manipulation active:scale-[0.98] shadow-xs"
            >
              {isCancellingOrder ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Trash2 className="h-4 w-4 shrink-0" />
              )}
              <span>{order.orderType === 'TAKEAWAY' ? 'Huỷ đơn mang về' : 'Huỷ đơn & Giải phóng bàn'}</span>
            </Button>
          </div>
        ) : (
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

            {hasNewItems ? (
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
            ) : hasPrintedItems ? (
              <Button
                type="button"
                data-testid="btn-reprint-kitchen"
                disabled={isReprintPending}
                onClick={() => onReprintKitchen?.()}
                className="h-10 px-3 text-xs xl:text-sm bg-slate-700 font-bold text-white hover:bg-slate-800 disabled:opacity-50 touch-manipulation active:scale-[0.98] shadow-xs"
                title="In lại phiếu bếp của đơn"
              >
                {isReprintPending ? (
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                ) : (
                  <Printer className="h-4 w-4 shrink-0" />
                )}
                <span>In lại bếp</span>
              </Button>
            ) : (
              <Button
                type="button"
                data-testid="btn-split-kitchen"
                disabled={true}
                className="h-10 px-3 text-xs xl:text-sm bg-amber-600 font-bold text-white disabled:opacity-50 touch-manipulation shadow-xs"
              >
                <Printer className="h-4 w-4 shrink-0" />
                <span>Tách đơn</span>
              </Button>
            )}

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
        )}
      </div>
    </div>
  );
}
