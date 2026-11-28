import { formatProductNameWithSize, type PublicMenuActiveOrder } from '@fnb/shared';
import { ClipboardList } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import {
  KITCHEN_STATUS_LABELS,
  type TakeawayKitchenProgress,
} from '../utils/qr-cart-storage';

interface QrTakeawayTicketCardProps {
  activeOrder: PublicMenuActiveOrder;
  resolvedTableName: string;
  placedTotalQty: number;
  takeawayKitchenProgress: TakeawayKitchenProgress | null;
  onOpenPlacedOrders: () => void;
}

/** Summary card shown on takeaway QR sessions tracking kitchen batch progress. */
export function QrTakeawayTicketCard({
  activeOrder,
  resolvedTableName,
  placedTotalQty,
  takeawayKitchenProgress,
  onOpenPlacedOrders,
}: QrTakeawayTicketCardProps) {
  return (
    <div
      data-testid="qr-takeaway-active-ticket-card"
      className="rounded-2xl border-2 border-emerald-500/50 bg-emerald-500/5 p-3.5 shadow-sm space-y-2.5"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5 min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
            Phiếu nhận đơn Mang về của bạn
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="qr-takeaway-ticket-number"
              className="text-lg font-extrabold text-foreground"
            >
              {resolvedTableName}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">
              • #{activeOrder.orderCode}
            </span>
          </div>
        </div>
        {takeawayKitchenProgress ? (
          <Badge
            variant="outline"
            data-testid="qr-takeaway-progress-badge"
            className={cn('shrink-0 text-[11px] font-bold', takeawayKitchenProgress.badgeClassName)}
          >
            {takeawayKitchenProgress.label}
          </Badge>
        ) : null}
      </div>

      {takeawayKitchenProgress ? (
        <p className="text-xs font-medium text-muted-foreground">
          {takeawayKitchenProgress.detail}
        </p>
      ) : null}

      {activeOrder.note ? (
        <div
          data-testid="qr-takeaway-ticket-note"
          className="rounded-xl border bg-background/80 px-2.5 py-1.5 text-xs text-muted-foreground"
        >
          <span className="font-semibold text-foreground">Ghi chú: </span>
          {activeOrder.note}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-emerald-500/20">
        <div className="text-xs">
          <span className="text-muted-foreground">Tạm tính ({placedTotalQty} món): </span>
          <span className="font-extrabold text-emerald-700 dark:text-emerald-300">
            {activeOrder.totalAmount.toLocaleString('vi-VN')} đ
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="qr-takeaway-view-items-btn"
          onClick={onOpenPlacedOrders}
          className="h-8 rounded-xl border-emerald-500/50 bg-background px-3 text-xs font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          <span>Xem chi tiết món đã gọi</span>
        </Button>
      </div>
    </div>
  );
}

interface QrPlacedOrdersSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeOrder: PublicMenuActiveOrder | null;
  resolvedTableName: string;
  isTakeaway: boolean;
  placedTotalQty: number;
  placedBatches: Array<{ batchNo: number; items: PublicMenuActiveOrder['items'] }>;
}

/** Bottom drawer listing all placed batches, kitchen statuses, modifiers, and bill totals. */
export function QrPlacedOrdersSheet({
  open,
  onOpenChange,
  activeOrder,
  resolvedTableName,
  isTakeaway,
  placedTotalQty,
  placedBatches,
}: QrPlacedOrdersSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        data-testid="qr-placed-orders-sheet"
        className="max-h-[85vh] supports-[height:85dvh]:max-h-[85dvh] rounded-t-3xl border-t bg-background p-4 sm:p-6 shadow-2xl flex flex-col"
      >
        <SheetHeader className="pb-3 border-b text-left pr-10">
          <SheetTitle className="text-base font-bold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-emerald-600" />
            Món đã gọi — {resolvedTableName}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {activeOrder
              ? `Mã đơn #${activeOrder.orderCode} • ${
                  activeOrder.status === 'PENDING' ? 'Đang chờ thu ngân xác nhận' : 'Đang phục vụ'
                }`
              : ''}
          </SheetDescription>
          {activeOrder?.note ? (
            <p
              data-testid="qr-placed-order-note"
              className="mt-1.5 rounded-lg border bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground"
            >
              {activeOrder.note}
            </p>
          ) : null}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 max-h-[55vh]">
          {placedBatches.map((batch) => (
            <div key={batch.batchNo} className="space-y-2">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <span>Lượt gọi #{batch.batchNo}</span>
                <span>{batch.items.reduce((s, item) => s + item.quantity, 0)} món</span>
              </div>
              {batch.items.map((item) => {
                const kStatus = KITCHEN_STATUS_LABELS[item.kitchenStatus] ?? {
                  label: item.kitchenStatus,
                  className: 'border-border text-muted-foreground',
                };
                const rawModLabels = item.modifiers.map((m) =>
                  m.action === 'SUBSTITUTE' && m.substituteName
                    ? `Đổi ${m.substitutedFromName ?? m.name} → ${m.substituteName}`
                    : m.action === 'REMOVED'
                      ? `Không ${m.name}`
                      : m.name,
                );
                const { displayName, remainingModifiers } = formatProductNameWithSize(
                  item.productName,
                  rawModLabels,
                );
                return (
                  <div
                    key={item.id}
                    className="rounded-xl border bg-card p-3 shadow-xs space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-sm font-bold text-foreground">
                            {item.quantity}x {displayName}
                          </p>
                          {!isTakeaway && item.isTakeaway ? (
                            <Badge
                              variant="outline"
                              data-testid={`qr-placed-item-takeaway-badge-${item.id}`}
                              className="border-sky-500/60 bg-sky-500/10 text-sky-700 dark:text-sky-300 text-[10px] font-bold"
                            >
                              Mang về
                            </Badge>
                          ) : null}
                        </div>
                        {remainingModifiers.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {remainingModifiers.join(', ')}
                          </p>
                        ) : null}
                        {item.itemNote ? (
                          <p className="text-xs italic text-amber-600 dark:text-amber-400">
                            Ghi chú: {item.itemNote}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span className="text-xs font-extrabold text-price">
                          {item.lineTotal.toLocaleString('vi-VN')} đ
                        </span>
                        <Badge variant="outline" className={`text-[10px] ${kStatus.className}`}>
                          {kStatus.label}
                        </Badge>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {activeOrder ? (
          <div className="border-t pt-3 space-y-1.5">
            {(activeOrder.discountAmount ?? 0) > 0 ? (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Tạm tính ({placedTotalQty} món)</span>
                  <span>
                    {(activeOrder.subtotalAmount ?? activeOrder.totalAmount + (activeOrder.discountAmount ?? 0)).toLocaleString('vi-VN')} đ
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                  <span>Giảm giá</span>
                  <span>-{(activeOrder.discountAmount ?? 0).toLocaleString('vi-VN')} đ</span>
                </div>
              </>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">
                {(activeOrder.discountAmount ?? 0) > 0
                  ? 'Tổng thanh toán'
                  : `Tổng tạm tính (${placedTotalQty} món)`}
              </span>
              <span className="text-lg font-extrabold text-emerald-600 dark:text-emerald-400">
                {activeOrder.totalAmount.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
