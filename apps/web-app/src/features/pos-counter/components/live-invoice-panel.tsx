import { formatProductNameWithSize, type OrderDetailResponse } from '@fnb/shared';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle,
  CreditCard,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  Printer,
  QrCode,
  ShoppingBag,
  Split,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { type OrderPendingAlertState } from '@/lib/qr-pending-reminder';
import { cn } from '@/utils/cn';
import { CancelOrderConfirmDialog } from './cancel-order-confirm-dialog';
import type { PosMenuSelectedItem } from './pos-menu-types';

export type LiveInvoiceDraftTarget =
  | {
      orderType: 'DINE_IN';
      tableId: number | null;
      tableName?: string;
    }
  | {
      orderType: 'TAKEAWAY';
    }
  | { orderType: null };

export interface LiveInvoicePanelProps {
  order: OrderDetailResponse | null;
  draftTarget: LiveInvoiceDraftTarget | null;
  draftItems: PosMenuSelectedItem[];
  canCreate?: boolean;
  canSaveDraft?: boolean;
  canUpdate?: boolean;
  canSplitKitchen?: boolean;
  canTableAction?: boolean;
  canCheckout?: boolean;
  isSplitPending: boolean;
  isProvisionalPending: boolean;
  isApprovingQr: boolean;
  isSubmittingDraft: boolean;
  isSavingDraft?: boolean;
  isCancellingOrder?: boolean;
  isDiscountPending?: boolean;
  isReprintPending?: boolean;
  pendingAlert?: OrderPendingAlertState | null;
  onUpdateDraftQty: (index: number, delta: number) => void;
  onRemoveDraftItem: (index: number) => void;
  onSubmitDraftOrder: () => void;
  onSaveDraft?: () => void;
  onChooseDraftTarget?: () => void;
  onApproveQrOrder: () => void;
  onUpdateOrderItemQuantity: (orderItemId: number, newQuantity: number) => void;
  onToggleOrderItemTakeaway?: (orderItemId: number, nextIsTakeaway: boolean) => void;
  onRemoveOrCancelOrderItem: (orderItemId: number) => void;
  addonIsTakeaway?: boolean;
  onChangeAddonIsTakeaway?: (isTakeaway: boolean) => void;
  onOpenTableAction: () => void;
  onSplitKitchen: () => void;
  onReprintKitchen?: (batchNo?: number) => void;
  onPrintProvisionalBill: () => void;
  onOpenSplitProvisionalBill?: () => void;
  onOpenCheckout: () => void;
  onOpenSplitCheckout?: () => void;
  onCancelOrder?: (reason?: string) => void;
  onOpenDiscount?: () => void;
  onRemoveDiscount?: () => void;
}

export function LiveInvoicePanel({
  order,
  draftTarget,
  draftItems,
  canCreate = true,
  canSaveDraft = canCreate,
  canUpdate = true,
  canSplitKitchen = true,
  canTableAction = true,
  canCheckout = true,
  isSplitPending,
  isProvisionalPending,
  isApprovingQr,
  isSubmittingDraft,
  isSavingDraft = false,
  isCancellingOrder = false,
  isDiscountPending = false,
  isReprintPending = false,
  pendingAlert = null,
  onUpdateDraftQty,
  onRemoveDraftItem,
  onSubmitDraftOrder,
  onSaveDraft = () => undefined,
  onChooseDraftTarget = () => undefined,
  onApproveQrOrder,
  onUpdateOrderItemQuantity,
  onToggleOrderItemTakeaway,
  onRemoveOrCancelOrderItem,
  addonIsTakeaway = false,
  onChangeAddonIsTakeaway,
  onOpenTableAction,
  onSplitKitchen,
  onReprintKitchen,
  onPrintProvisionalBill,
  onOpenSplitProvisionalBill,
  onOpenCheckout,
  onOpenSplitCheckout,
  onCancelOrder,
  onOpenDiscount,
  onRemoveDiscount,
}: LiveInvoicePanelProps) {
  const [confirmDeleteItemId, setConfirmDeleteItemId] = React.useState<number | null>(null);
  const [confirmDeleteDraftIndex, setConfirmDeleteDraftIndex] = React.useState<number | null>(null);
  const [provisionalMenuOpen, setProvisionalMenuOpen] = React.useState(false);
  const [checkoutMenuOpen, setCheckoutMenuOpen] = React.useState(false);
  const [zoomOpen, setZoomOpen] = React.useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const canPerformAnyAction =
    canCreate || canUpdate || canSplitKitchen || canTableAction || canCheckout;

  if (!order && draftTarget) {
    const draftTotal = draftItems.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );
    const label =
      draftTarget.orderType === 'TAKEAWAY'
        ? 'Đơn Mang về mới'
        : draftTarget.orderType === 'DINE_IN'
          ? draftTarget.tableName ?? (draftTarget.tableId ? `Bàn #${draftTarget.tableId}` : 'Chưa gán bàn')
          : 'Giỏ chưa gán bàn';

    return (
      <div className="flex flex-1 min-h-0 h-full flex-col justify-between bg-card p-3 sm:p-4">
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex items-center justify-between border-b pb-2.5 sm:pb-3 shrink-0">
            <div className="min-w-0 flex-1 pr-2">
              <h2 data-testid="invoice-header-label" className="text-base sm:text-lg font-bold leading-snug break-words">
                {label}
              </h2>
              <p className="text-xs text-muted-foreground leading-snug break-words">
                Đang chọn món tạo đơn mới ({draftTarget.orderType === null ? 'CHƯA GÁN BÀN' : draftTarget.orderType === 'DINE_IN' ? 'TẠI BÀN' : 'MANG VỀ'})
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
              draftItems.map((item, idx) => {
                const { displayName, remainingModifiers } = formatProductNameWithSize(
                  item.name,
                  item.modifierLabels,
                );
                return (
                <div
                  key={`${item.productId}-${idx}`}
                  data-testid={`draft-item-${idx}`}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-sm"
                >
                  <div>
                    <p className="font-semibold">{displayName}</p>
                    {remainingModifiers.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {remainingModifiers.join(', ')}
                      </p>
                    ) : null}
                    <p className="text-xs font-bold text-price">
                      {(item.unitPrice * item.quantity).toLocaleString('vi-VN')} đ
                    </p>
                  </div>
                  {canCreate ? (
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        aria-label={`Giảm số lượng ${item.name}`}
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
                        aria-label={`Tăng số lượng ${item.name}`}
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
                            aria-label={`Xoá ${item.name} khỏi giỏ`}
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
                    ) : (
                      <span className="text-xs font-bold tabular-nums">x{item.quantity}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="border-t pt-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Tổng cộng tạm tính</span>
            <span className="text-lg font-bold text-price">
              {draftTotal.toLocaleString('vi-VN')} đ
            </span>
          </div>
          {draftItems.length > 0 ? (
            <Button type="button" variant="outline" className="mb-2 w-full" onClick={onChooseDraftTarget}>
              {draftTarget.orderType === null || (draftTarget.orderType === 'DINE_IN' && draftTarget.tableId === null)
                ? 'Gán bàn hoặc chọn Mang về'
                : 'Đổi bàn hoặc chọn Mang về'}
            </Button>
          ) : null}
          {canCreate || canSaveDraft ? (
            <div className="grid grid-cols-2 gap-2">
              {canSaveDraft ? (
                <Button
                  type="button"
                  data-testid="pos-save-draft-btn"
                  variant="outline"
                  disabled={draftItems.length === 0 || isSavingDraft}
                  onClick={onSaveDraft}
                  className="h-10 font-bold"
                >
                  {isSavingDraft ? 'Đang lưu...' : 'Lưu tạm'}
                </Button>
              ) : null}
              {canCreate ? (
                <Button
                  type="button"
                  data-testid="pos-submit-new-order-btn"
                  disabled={draftItems.length === 0 || isSubmittingDraft || draftTarget.orderType === null || (draftTarget.orderType === 'DINE_IN' && draftTarget.tableId === null)}
                  onClick={onSubmitDraftOrder}
                  className="h-10 bg-primary font-bold text-primary-foreground hover:bg-primary/90 active:scale-[0.99] touch-manipulation shadow-sm"
                >
                  {isSubmittingDraft ? 'Đang tạo đơn...' : 'Xác nhận Tạo Đơn'}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-card p-6 text-center">
        <p className="text-sm font-semibold text-foreground">Chưa chọn bàn hoặc đơn hàng</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {canCreate
            ? 'Click vào một bàn trên sơ đồ hoặc bấm [TẠO ĐƠN MANG VỀ] để bắt đầu.'
            : 'Click vào một bàn đang phục vụ trên sơ đồ để xem chi tiết.'}
        </p>
      </div>
    );
  }

  const isOrderActive = order.status === 'PENDING' || order.status === 'SERVING';
  const activeItems = order.items.filter((item) => item.kitchenStatus !== 'CANCELLED');
  const isAllCancelled = order.items.length > 0 && activeItems.length === 0;
  const hasNewItems = order.items.some((item) => item.kitchenStatus === 'NEW');
  const hasPrintedItems = order.items.some((item) => item.kitchenStatus === 'PRINTED');
  const isSplitDisabled = isSplitPending || !hasNewItems || !isOrderActive;

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
      ? 'Mới gọi món'
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
      ? order.orderType === 'TAKEAWAY'
        ? 'Quét QR mang về'
        : 'Quét QR tại bàn'
      : order.orderSource === 'POS_COUNTER'
        ? 'Đặt đơn tại quầy'
        : order.orderSource;

  return (
    <div className="flex h-full flex-col justify-between bg-card px-3 pb-3 pt-2 sm:px-4 sm:pb-4 sm:pt-2.5">
      <div className="space-y-1.5 border-b pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 data-testid="invoice-header-label" className="text-base sm:text-lg font-bold leading-snug break-words">
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
          <div className="flex items-center gap-1 shrink-0">
            {canUpdate && isOrderActive && onCancelOrder ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-testid="btn-quick-cancel-order"
                disabled={isCancellingOrder}
                title={
                  order.orderType === 'TAKEAWAY'
                    ? 'Huỷ đơn mang về'
                    : 'Huỷ đơn & Giải phóng bàn'
                }
                aria-label={
                  order.orderType === 'TAKEAWAY'
                    ? 'Huỷ đơn mang về'
                    : 'Huỷ đơn & Giải phóng bàn'
                }
                className="h-7 w-7 shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/50"
                onClick={() => setCancelDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              data-testid="zoom-invoice-btn"
              title="Phóng to danh sách món"
              aria-label="Phóng to danh sách món"
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() => setZoomOpen(true)}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 space-y-0.5 text-xs text-muted-foreground leading-relaxed">
            <div>
              Mã HĐ: <span className="font-mono font-semibold">{order.orderCode}</span>
            </div>
            <div>
              Nguồn: <span className="whitespace-nowrap">{resolvedOrderSourceLabel}</span>
            </div>
          </div>

          {canUpdate && order.status === 'PENDING' && order.orderSource === 'QR_CODE' ? (
            <Button
              type="button"
              size="sm"
              data-testid="approve-qr-order-btn"
              disabled={isApprovingQr}
              onClick={onApproveQrOrder}
              className="shrink-0 bg-amber-500 font-bold text-white hover:bg-amber-600"
            >
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Duyệt đơn QR</span>
            </Button>
          ) : null}
        </div>

        {order.note ? (
          <div
            data-testid="invoice-order-note"
            className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-900 dark:text-amber-200 break-words"
          >
            {order.note}
          </div>
        ) : null}
      </div>

      {pendingAlert?.isOverdue ? (
        <div
          data-testid="invoice-overdue-qr-alert"
          role="alert"
          className="mt-2 flex items-start gap-2 rounded-lg border border-red-600 bg-red-600/15 px-2.5 py-2 text-xs font-bold text-red-900 dark:border-red-500 dark:bg-red-950/60 dark:text-red-100"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400 mt-0.5 animate-pulse" />
          <div className="leading-snug">
            <span>
              {pendingAlert.kind === 'ADDON'
                ? `Món gọi thêm QR đã chờ ${pendingAlert.elapsedMinutes} phút chưa tách bếp.`
                : `Đơn QR mới đã chờ ${pendingAlert.elapsedMinutes} phút chưa duyệt.`}
            </span>
            {pendingAlert.remainingBeforeCancelMinutes !== null ? (
              <span className="block text-[11px] font-semibold opacity-90">
                {pendingAlert.remainingBeforeCancelMinutes > 0
                  ? `Tự động huỷ sau khoảng ${pendingAlert.remainingBeforeCancelMinutes} phút nữa nếu chưa xác nhận.`
                  : 'Đang chờ hệ thống tự động huỷ đơn/món quá hạn...'}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="my-2 flex-1 min-h-0 space-y-3 overflow-y-auto overscroll-contain touch-pan-y pr-1">
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
                {canSplitKitchen && hasPrintedInBatch ? (
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
                const { displayName, remainingModifiers } = formatProductNameWithSize(
                  item.name,
                  item.modifiers,
                );
                const isTableOrder = order.orderType === 'DINE_IN';
                const itemIsTakeaway = Boolean(item.isTakeaway);

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
                        <span className="font-semibold leading-snug">
                          {item.quantity}x {displayName}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            'text-[10px] px-1.5 py-0.5 font-bold shrink-0',
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
                        {isTableOrder && itemIsTakeaway ? (
                          <Badge
                            variant="outline"
                            data-testid={`invoice-item-takeaway-badge-${item.id}`}
                            className="text-[10px] px-1.5 py-0.5 font-bold shrink-0 border-sky-500/80 bg-sky-50 text-sky-800 dark:border-sky-400/70 dark:bg-sky-950/60 dark:text-sky-200"
                          >
                            Mang về
                          </Badge>
                        ) : null}
                        {isTableOrder && !isCancelled && canUpdate && isOrderActive && onToggleOrderItemTakeaway ? (
                          <button
                            type="button"
                            data-testid={`toggle-item-takeaway-${item.id}`}
                            onClick={() => onToggleOrderItemTakeaway(item.id, !itemIsTakeaway)}
                            className="text-[10px] font-semibold text-muted-foreground hover:text-foreground underline"
                            title={itemIsTakeaway ? 'Đổi sang dùng tại bàn' : 'Đánh dấu món này đóng hộp mang về'}
                          >
                            {itemIsTakeaway ? 'Bỏ nhãn MV' : '+ Mang về'}
                          </button>
                        ) : null}
                      </div>
                      {remainingModifiers.length > 0 ? (
                        <p className="text-xs text-muted-foreground">
                          {remainingModifiers.join(', ')}
                        </p>
                      ) : null}
                      {item.itemNote ? (
                        <p className="text-xs italic font-medium text-amber-700 dark:text-amber-300">
                          Ghi chú: {item.itemNote}
                        </p>
                      ) : null}
                      <p className="text-xs font-bold text-price tabular-nums">
                        {item.lineTotal.toLocaleString('vi-VN')} đ
                      </p>
                    </div>

                    {!isCancelled && canUpdate && isOrderActive ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {isNew ? (
                          <>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              aria-label={`Giảm số lượng ${item.name}`}
                              className="h-8 w-8"
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
                              aria-label={`Tăng số lượng ${item.name}`}
                              className="h-8 w-8"
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
                                  aria-label={`Xoá món ${item.name}`}
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
                            className="h-8 px-2.5 border-rose-500 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-400/70 dark:text-rose-300 dark:hover:bg-rose-950/50 whitespace-nowrap"
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
        {(() => {
          const hasDiscount =
            Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0;
          const discountAmount = order.discountAmount ?? 0;
          const subtotalAmount = order.subtotalAmount ?? order.totalAmount + discountAmount;
          const discountLabel =
            order.discountSnapshot?.kind === 'CODE'
              ? (order.discountSnapshot.code ?? order.discountSnapshot.name)
              : (order.discountSnapshot?.name ?? 'Giảm tay');

          return (
            <>
              {canCheckout && order.status === 'SERVING' && order.items.length > 0 && onOpenDiscount ? (
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="btn-open-discount"
                    disabled={isDiscountPending}
                    onClick={onOpenDiscount}
                    className="h-7 gap-1.5 px-2.5 text-xs font-semibold"
                  >
                    <Tag className="h-3.5 w-3.5 text-accent-text" />
                    <span>{hasDiscount ? `Đổi ưu đãi (${discountLabel})` : 'Áp dụng giảm giá'}</span>
                  </Button>

                  {hasDiscount && onRemoveDiscount ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      data-testid="btn-remove-discount"
                      disabled={isDiscountPending}
                      onClick={onRemoveDiscount}
                      className="h-7 gap-1 px-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950/30"
                    >
                      <X className="h-3.5 w-3.5" />
                      <span>Gỡ</span>
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {hasDiscount ? (
                <div className="mb-1.5 space-y-1 text-xs">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Tạm tính</span>
                    <span data-testid="invoice-subtotal-amount" className="font-semibold tabular-nums">
                      {subtotalAmount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                  <div className="flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400">
                    <span className="leading-snug break-words">Giảm giá ({discountLabel})</span>
                    <span data-testid="invoice-discount-amount" className="shrink-0 font-bold tabular-nums">
                      -{discountAmount.toLocaleString('vi-VN')} đ
                    </span>
                  </div>
                </div>
              ) : null}

              {order.discountWarning ? (
                <div
                  data-testid="invoice-discount-warning"
                  className="mb-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                >
                  {order.discountWarning === 'MIN_ORDER_NOT_MET'
                    ? 'Chưa đạt đơn tối thiểu nên mức giảm hiện tại tạm về 0 đ.'
                    : 'Không có món thuộc phạm vi ưu đãi nên mức giảm tạm về 0 đ.'}
                </div>
              ) : null}
            </>
          );
        })()}

        {order.orderType === 'DINE_IN' &&
        isOrderActive &&
        order.items.length > 0 &&
        canUpdate &&
        onChangeAddonIsTakeaway ? (
          <div
            data-testid="invoice-addon-serving-mode-selector"
            className="mb-2.5 flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5"
          >
            <span className="text-[11px] font-bold text-muted-foreground">
              Lượt gọi thêm:
            </span>
            <div className="inline-flex rounded-md border bg-background p-0.5">
              <button
                type="button"
                data-testid="invoice-addon-mode-dine-in"
                aria-pressed={!addonIsTakeaway}
                onClick={() => onChangeAddonIsTakeaway(false)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11px] font-bold transition-colors',
                  !addonIsTakeaway
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Dùng tại bàn
              </button>
              <button
                type="button"
                data-testid="invoice-addon-mode-takeaway"
                aria-pressed={addonIsTakeaway}
                onClick={() => onChangeAddonIsTakeaway(true)}
                className={cn(
                  'rounded px-2.5 py-1 text-[11px] font-bold transition-colors',
                  addonIsTakeaway
                    ? 'bg-amber-600 text-white'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Mang về
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-2.5 sm:mb-3 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-semibold text-muted-foreground">Tổng thanh toán</span>
          <span
            data-testid="invoice-total-amount"
            className="text-lg sm:text-xl font-extrabold text-price tabular-nums"
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
            {canUpdate && isOrderActive ? (
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
            ) : null}
          </div>
        ) : isAllCancelled ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-rose-500/30 bg-rose-50 p-2.5 text-center text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
              {order.orderType === 'TAKEAWAY'
                ? 'Tất cả món đã bị huỷ. Hãy huỷ đơn mang về.'
                : 'Tất cả món đã bị huỷ. Hãy huỷ đơn để giải phóng bàn.'}
            </div>
            {canUpdate && isOrderActive ? (
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
            ) : null}
          </div>
        ) : !canPerformAnyAction ? null : (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              {canTableAction ? (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="btn-table-action"
                  disabled={!isOrderActive}
                  onClick={onOpenTableAction}
                  className="min-h-11 lg:min-h-10 min-w-0 px-2 sm:px-3 text-xs xl:text-sm font-semibold touch-manipulation active:scale-[0.98]"
                >
                  <ArrowLeftRight className="h-4 w-4 shrink-0" />
                  <span className="sm:hidden">{order.orderType === 'TAKEAWAY' ? 'Gán bàn' : 'Đổi bàn'}</span>
                  <span className="hidden sm:inline">{order.orderType === 'TAKEAWAY' ? 'Gán bàn' : 'Đổi / Gộp bàn'}</span>
                </Button>
              ) : null}

              {canSplitKitchen ? (
                <Button
                  type="button"
                  data-testid="btn-split-kitchen"
                  disabled={isSplitDisabled}
                  onClick={onSplitKitchen}
                  className="min-h-11 lg:min-h-10 min-w-0 px-2 sm:px-3 text-xs xl:text-sm bg-amber-600 font-bold text-white hover:bg-amber-700 disabled:bg-muted disabled:text-muted-foreground disabled:border disabled:border-border disabled:opacity-100 disabled:shadow-none touch-manipulation active:scale-[0.98] shadow-xs"
                >
                  {isSplitPending ? (
                    <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  ) : (
                    <Printer className="h-4 w-4 shrink-0" />
                  )}
                  <span>Tách bếp</span>
                </Button>
              ) : null}

              {/* In tạm tính (QR): Bấm hiển thị lựa chọn Tất cả / Tách đơn */}
              <Popover open={provisionalMenuOpen} onOpenChange={setProvisionalMenuOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="secondary"
                    data-testid="btn-provisional-bill"
                    disabled={isProvisionalPending || order.status !== 'SERVING'}
                    className="min-h-11 lg:min-h-10 min-w-0 px-2 sm:px-3 text-xs xl:text-sm font-semibold touch-manipulation active:scale-[0.98]"
                  >
                    <QrCode className="h-4 w-4 shrink-0" />
                    <span className="sm:hidden">Tạm tính QR</span>
                    <span className="hidden sm:inline">In tạm tính (QR)</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="start"
                  sideOffset={6}
                  className="w-52 p-2 space-y-1.5 shadow-xl border bg-popover text-popover-foreground"
                >
                  <p className="px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Chọn chế độ In tạm tính
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    data-testid="provisional-option-all"
                    onClick={() => {
                      setProvisionalMenuOpen(false);
                      onPrintProvisionalBill();
                    }}
                    className="w-full justify-start gap-2 font-bold text-xs"
                  >
                    <Layers className="h-3.5 w-3.5 shrink-0" />
                    <span>Tất cả ({order.totalAmount.toLocaleString('vi-VN')} đ)</span>
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    data-testid="provisional-option-split"
                    disabled={Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0}
                    title={
                      Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0
                        ? 'Không thể tách món khi đơn đang áp dụng giảm giá'
                        : undefined
                    }
                    onClick={() => {
                      setProvisionalMenuOpen(false);
                      onOpenSplitProvisionalBill?.();
                    }}
                    className="w-full justify-start gap-2 font-semibold text-xs"
                  >
                    <Split className="h-3.5 w-3.5 shrink-0 text-accent-text" />
                    <span>Tách đơn (Chọn từng món)</span>
                  </Button>
                </PopoverContent>
              </Popover>

              {/* Thanh toán: Bấm hiển thị lựa chọn Tất cả / Tách đơn */}
              {canCheckout ? (
                <Popover open={checkoutMenuOpen} onOpenChange={setCheckoutMenuOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      data-testid="btn-checkout"
                      disabled={order.status !== 'SERVING'}
                      className="min-h-11 lg:min-h-10 min-w-0 px-2 sm:px-3 text-xs xl:text-sm bg-emerald-600 font-bold text-white hover:bg-emerald-700 disabled:bg-muted disabled:text-muted-foreground disabled:border disabled:border-border disabled:opacity-100 disabled:shadow-none touch-manipulation active:scale-[0.98] shadow-xs"
                    >
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span>Thanh toán</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    side="top"
                    align="end"
                    sideOffset={6}
                    className="w-52 p-2 space-y-1.5 shadow-xl border bg-popover text-popover-foreground"
                  >
                    <p className="px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Chọn chế độ Thanh toán
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      data-testid="checkout-option-all"
                      onClick={() => {
                        setCheckoutMenuOpen(false);
                        onOpenCheckout();
                      }}
                      className="w-full justify-start gap-2 bg-emerald-600 text-white hover:bg-emerald-700 font-bold text-xs"
                    >
                      <Layers className="h-3.5 w-3.5 shrink-0" />
                      <span>Tất cả ({order.totalAmount.toLocaleString('vi-VN')} đ)</span>
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      data-testid="checkout-option-split"
                      disabled={Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0}
                      title={
                        Boolean(order.discountSnapshot) || (order.discountAmount ?? 0) > 0
                          ? 'Không thể tách món khi đơn đang áp dụng giảm giá'
                          : undefined
                      }
                      onClick={() => {
                        setCheckoutMenuOpen(false);
                        onOpenSplitCheckout?.();
                      }}
                      className="w-full justify-start gap-2 font-semibold text-xs"
                    >
                      <Split className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>Tách đơn (Chọn từng món)</span>
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>

            {canSplitKitchen && hasPrintedItems ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="btn-reprint-kitchen"
                disabled={isReprintPending}
                onClick={() => onReprintKitchen?.()}
                className="w-full h-8 text-xs font-semibold gap-1.5"
                title="In lại toàn bộ phiếu bếp của đơn"
              >
                {isReprintPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                ) : (
                  <Printer className="h-3.5 w-3.5 shrink-0" />
                )}
                <span>In lại toàn bộ phiếu bếp</span>
              </Button>
            ) : null}
          </div>
        )}
      </div>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent
          closeLabel="Đóng"
          className="flex max-h-[90dvh] w-[calc(100vw-2rem)] sm:max-w-3xl lg:max-w-4xl flex-col p-0 gap-0 overflow-hidden"
          data-testid="zoom-invoice-dialog"
        >
          <DialogHeader className="border-b px-5 py-3.5 pr-20">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <span>{resolvedHeaderLabel}</span>
              <Badge
                className={cn(
                  'shrink-0 font-bold px-2.5 py-0.5 text-xs',
                  order.status === 'PENDING' && 'bg-amber-500 text-white',
                  order.status === 'SERVING' && 'bg-rose-600 text-white',
                  order.status === 'PAID' && 'bg-emerald-600 text-white',
                  order.status === 'VOIDED' && 'bg-slate-600 text-white',
                  order.status === 'MERGED' && 'bg-purple-600 text-white',
                )}
              >
                {resolvedStatusLabel}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Mã HĐ: <span className="font-mono font-semibold text-foreground">{order.orderCode}</span> • Nguồn: {resolvedOrderSourceLabel} • Tổng số lượng: {activeItems.reduce((sum, item) => sum + item.quantity, 0)} món
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 py-3.5 space-y-4">
            {sortedBatches.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Đơn chưa có món nào.
              </div>
            ) : (
              sortedBatches.map(([batchNo, batchItems]) => (
                <div key={batchNo} className="space-y-2">
                  <div className="rounded bg-muted px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    {batchNo === 1 ? 'Lượt 1' : `GỌI THÊM - LƯỢT ${batchNo}`}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {batchItems.map((item) => {
                      const isCancelled = item.kitchenStatus === 'CANCELLED';
                      const isPrinted = item.kitchenStatus === 'PRINTED';
                      const { displayName, remainingModifiers } = formatProductNameWithSize(
                        item.name,
                        item.modifiers,
                      );
                      return (
                        <div
                          key={item.id}
                          className={cn(
                            'flex items-start justify-between gap-2 rounded-lg border p-3 text-sm',
                            isCancelled && 'bg-muted/40 opacity-60 line-through',
                          )}
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold">
                                {item.quantity}x {displayName}
                              </span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {item.kitchenStatus === 'NEW' ? 'Mới gọi' : isPrinted ? 'Đã in bếp' : 'Đã huỷ'}
                              </Badge>
                              {order.orderType === 'DINE_IN' && item.isTakeaway ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] px-1.5 py-0 border-sky-500/80 bg-sky-50 text-sky-800 dark:border-sky-400/70 dark:bg-sky-950/60 dark:text-sky-200"
                                >
                                  Mang về
                                </Badge>
                              ) : null}
                            </div>
                            {remainingModifiers.length > 0 ? (
                              <p className="text-xs text-muted-foreground">{remainingModifiers.join(', ')}</p>
                            ) : null}
                            {item.itemNote ? (
                              <p className="text-xs italic text-amber-600 dark:text-amber-300">
                                Ghi chú: {item.itemNote}
                              </p>
                            ) : null}
                          </div>
                          <span className="shrink-0 font-bold text-price tabular-nums">
                            {item.lineTotal.toLocaleString('vi-VN')} đ
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between border-t bg-muted/20 px-5 py-3">
            <span className="text-sm font-medium text-muted-foreground">Tổng thanh toán</span>
            <span className="text-xl font-black text-price tabular-nums">
              {order.totalAmount.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </DialogContent>
      </Dialog>

      <CancelOrderConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        order={order}
        isPending={isCancellingOrder}
        onConfirm={async (reason) => {
          await onCancelOrder?.(reason);
          setCancelDialogOpen(false);
        }}
      />
    </div>
  );
}
