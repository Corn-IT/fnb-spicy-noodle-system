import { formatProductNameWithSize, type PublicMenuActiveOrder } from '@fnb/shared';
import { ChevronUp, ClipboardList, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';
import type { ReconciledCartLineItem } from '../utils/qr-cart-storage';

interface AddonServingModeToggleProps {
  variant: 'bar' | 'sheet';
  addonIsTakeawayBatch: boolean;
  onChange: (takeaway: boolean) => void;
}

function AddonServingModeToggle({
  variant,
  addonIsTakeawayBatch,
  onChange,
}: AddonServingModeToggleProps) {
  const isBar = variant === 'bar';
  const modePrefix = isBar ? 'qr-addon-mode' : 'qr-sheet-addon-mode';
  const paddingClass = isBar ? 'px-2.5 py-1' : 'px-3 py-1.5';

  return (
    <div
      data-testid={isBar ? 'qr-addon-serving-mode-bar' : 'qr-sheet-addon-serving-mode'}
      className={cn(
        'flex items-center justify-between gap-2 rounded-xl border',
        isBar ? 'bg-muted/40 px-2.5 py-1.5' : 'bg-muted/30 p-2',
      )}
    >
      <span className={cn('font-bold text-foreground', isBar ? 'text-[11px]' : 'text-xs pl-1')}>
        {isBar ? 'Lượt gọi này:' : 'Hình thức phục vụ lượt này:'}
      </span>
      <div
        className={cn(
          'inline-flex rounded-lg border bg-background p-0.5',
          isBar && 'shadow-2xs',
        )}
      >
        <button
          type="button"
          data-testid={`${modePrefix}-dine-in`}
          aria-pressed={!addonIsTakeawayBatch}
          onClick={() => onChange(false)}
          className={cn(
            'rounded-md text-xs font-bold transition-colors',
            paddingClass,
            !addonIsTakeawayBatch
              ? 'bg-primary text-primary-foreground shadow-2xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Dùng tại bàn
        </button>
        <button
          type="button"
          data-testid={`${modePrefix}-takeaway`}
          aria-pressed={addonIsTakeawayBatch}
          onClick={() => onChange(true)}
          className={cn(
            'rounded-md text-xs font-bold transition-colors',
            paddingClass,
            addonIsTakeawayBatch
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Mang về
        </button>
      </div>
    </div>
  );
}

interface QrFloatingActionBarsProps {
  activeOrder: PublicMenuActiveOrder | null;
  cartLength: number;
  placedTotalQty: number;
  cartCount: number;
  cartTotal: number;
  hasUnavailableCartItem: boolean;
  unavailableWarningTitle: string | null;
  isAddonForDineIn: boolean;
  addonIsTakeawayBatch: boolean;
  resolvedActiveOrderId: number | undefined;
  isSubmitting: boolean;
  isPaidLocked: boolean;
  onAddonModeChange: (takeaway: boolean) => void;
  onOpenPlacedOrders: () => void;
  onOpenCart: () => void;
  onSubmitOrder: () => void;
}

/** Floating bottom action bars for viewing placed items and submitting the current QR cart. */
export function QrFloatingActionBars({
  activeOrder,
  cartLength,
  placedTotalQty,
  cartCount,
  cartTotal,
  hasUnavailableCartItem,
  unavailableWarningTitle,
  isAddonForDineIn,
  addonIsTakeawayBatch,
  resolvedActiveOrderId,
  isSubmitting,
  isPaidLocked,
  onAddonModeChange,
  onOpenPlacedOrders,
  onOpenCart,
  onSubmitOrder,
}: QrFloatingActionBarsProps) {
  if (!activeOrder && cartLength === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md md:max-w-2xl lg:max-w-3xl space-y-2 p-3 pb-safe">
      {activeOrder ? (
        <div className="flex items-stretch gap-2">
          <button
            type="button"
            data-testid="qr-placed-orders-bar"
            onClick={onOpenPlacedOrders}
            className="flex flex-1 items-center justify-between gap-2 rounded-2xl border border-emerald-500/40 bg-card/95 px-3.5 py-2.5 text-left shadow-lg backdrop-blur-md transition hover:border-emerald-500 active:scale-[0.99] min-w-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600/15 text-emerald-600 dark:text-emerald-400">
                <ClipboardList className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-foreground">
                  Món đã gọi ({placedTotalQty} món)
                </div>
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                  Tạm tính: {activeOrder.totalAmount.toLocaleString('vi-VN')} đ
                  <span className="hidden sm:inline"> • Bấm xem chi tiết</span>
                </div>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-[11px]">
              Xem lại
            </Badge>
          </button>
        </div>
      ) : null}

      {cartLength > 0 ? (
        <div className="rounded-2xl border border-primary/40 bg-card/95 p-2.5 shadow-2xl backdrop-blur-md space-y-2">
          {hasUnavailableCartItem && unavailableWarningTitle ? (
            <div
              data-testid="qr-cart-unavailable-warning"
              role="alert"
              className="rounded-lg border border-red-500/40 bg-red-50 px-2.5 py-1.5 text-[11px] font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-200"
            >
              {unavailableWarningTitle}
            </div>
          ) : null}
          {isAddonForDineIn ? (
            <AddonServingModeToggle
              variant="bar"
              addonIsTakeawayBatch={addonIsTakeawayBatch}
              onChange={onAddonModeChange}
            />
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onOpenCart}
              className="flex items-center gap-2.5 text-left transition active:scale-[0.98] min-w-0"
              aria-label="Xem chi tiết giỏ hàng"
            >
              <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <ShoppingBag className="h-5 w-5" />
                <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-extrabold text-white ring-2 ring-background">
                  {cartCount}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold text-foreground">Giỏ hàng</span>
                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-sm font-extrabold text-price truncate">
                  {cartTotal.toLocaleString('vi-VN')} đ
                </p>
              </div>
            </button>

            <Button
              type="button"
              data-testid="qr-submit-order-btn"
              disabled={isSubmitting || hasUnavailableCartItem || isPaidLocked}
              onClick={onSubmitOrder}
              className="h-11 rounded-xl bg-primary px-3 sm:px-4 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 active:scale-[0.98] shrink-0"
            >
              {isPaidLocked
                ? "Bấm 'Gọi đơn mới'"
                : hasUnavailableCartItem
                  ? 'Có món hết hàng'
                  : `${resolvedActiveOrderId ? 'Gửi gọi thêm' : 'Gửi đặt món'} (${cartCount})`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface QrCartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resolvedTableName: string;
  cartCount: number;
  cartTotal: number;
  reconciledCart: ReconciledCartLineItem[];
  hasUnavailableCartItem: boolean;
  hasPriceChangedCartItem: boolean;
  unavailableWarningTitle: string | null;
  priceChangedTitle: string;
  isTakeaway: boolean;
  resolvedActiveOrderId: number | undefined;
  takeawayNote: string;
  isAddonForDineIn: boolean;
  addonIsTakeawayBatch: boolean;
  isSubmitting: boolean;
  isPaidLocked: boolean;
  onClearCart: () => void;
  onUpdateQuantity: (key: string, delta: number) => void;
  onRemoveItem: (key: string) => void;
  onTakeawayNoteChange: (note: string) => void;
  onAddonModeChange: (takeaway: boolean) => void;
  onSubmitOrder: () => void;
}

/** Bottom cart drawer for reviewing selected items, updating quantities, and confirming submission. */
export function QrCartSheet({
  open,
  onOpenChange,
  resolvedTableName,
  cartCount,
  cartTotal,
  reconciledCart,
  hasUnavailableCartItem,
  hasPriceChangedCartItem,
  unavailableWarningTitle,
  priceChangedTitle,
  isTakeaway,
  resolvedActiveOrderId,
  takeawayNote,
  isAddonForDineIn,
  addonIsTakeawayBatch,
  isSubmitting,
  isPaidLocked,
  onClearCart,
  onUpdateQuantity,
  onRemoveItem,
  onTakeawayNoteChange,
  onAddonModeChange,
  onSubmitOrder,
}: QrCartSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] supports-[height:85dvh]:max-h-[85dvh] rounded-t-3xl border-t bg-background p-4 sm:p-6 shadow-2xl flex flex-col"
      >
        <SheetHeader className="pb-3 border-b text-left pr-10">
          <SheetTitle className="text-base font-bold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5 text-accent-text" />
            Giỏ hàng ({cartCount} món)
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Đang gọi món cho {resolvedTableName}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 py-3 pr-1">
          <div className="flex items-center justify-between pb-1 px-0.5">
            <span className="text-xs font-semibold text-muted-foreground">
              Món đã chọn ({cartCount})
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onClearCart();
                onOpenChange(false);
              }}
              className="h-7 px-2.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 active:scale-95"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Xoá tất cả</span>
            </Button>
          </div>
          {hasUnavailableCartItem && unavailableWarningTitle ? (
            <div
              role="alert"
              className="rounded-xl border border-red-500/50 bg-red-50 p-2.5 text-xs font-semibold text-red-800 dark:bg-red-950/60 dark:text-red-200"
            >
              {unavailableWarningTitle}
            </div>
          ) : hasPriceChangedCartItem ? (
            <div className="rounded-xl border border-amber-500/50 bg-amber-50 p-2.5 text-xs font-semibold text-amber-900 dark:bg-amber-950/60 dark:text-amber-200">
              {priceChangedTitle}
            </div>
          ) : null}
          {reconciledCart.map((item) => {
            const { displayName, remainingModifiers } = formatProductNameWithSize(
              item.effectiveName,
              item.modifierLabels,
            );
            return (
              <div
                key={item.key}
                className={cn(
                  'flex items-center justify-between rounded-xl border bg-card p-3 shadow-xs',
                  item.isUnavailable && 'border-red-500/50 bg-red-50/40 dark:bg-red-950/30',
                )}
              >
                <div className="min-w-0 flex-1 pr-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-sm text-foreground leading-snug break-words">{displayName}</p>
                    {item.isUnavailable ? (
                      <Badge
                        variant="outline"
                        data-testid="qr-cart-item-unavailable-badge"
                        className="border-red-500/60 bg-red-500/15 text-red-700 dark:text-red-300 text-[10px] font-bold"
                      >
                        Hết món
                      </Badge>
                    ) : item.priceChanged ? (
                      <Badge
                        variant="outline"
                        data-testid="qr-cart-item-price-changed-badge"
                        className="border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-200 text-[10px] font-bold"
                      >
                        Giá mới
                      </Badge>
                    ) : null}
                  </div>
                  {remainingModifiers.length > 0 ? (
                    <p className="text-xs text-muted-foreground leading-snug break-words">
                      {remainingModifiers.join(', ')}
                    </p>
                  ) : null}
                  {item.itemNote ? (
                    <p className="text-xs italic text-amber-600 leading-snug break-words">
                      Ghi chú: {item.itemNote}
                    </p>
                  ) : null}
                  <p className="text-xs font-bold text-price mt-0.5">
                    {(item.effectiveUnitPrice * item.quantity).toLocaleString('vi-VN')} đ
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => onUpdateQuantity(item.key, -1)}
                    aria-label="Giảm"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-6 text-center text-sm font-bold">{item.quantity}</span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-lg active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => onUpdateQuantity(item.key, 1)}
                    aria-label="Tăng"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-rose-500 hover:text-rose-700 ml-1 active:scale-95 transition-transform select-none touch-manipulation"
                    onClick={() => onRemoveItem(item.key)}
                    aria-label={`Xoá ${item.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}

          {isTakeaway && !resolvedActiveOrderId ? (
            <div
              data-testid="qr-takeaway-customer-fields"
              className="space-y-1.5 rounded-xl border bg-muted/30 p-3"
            >
              <label
                htmlFor="qr-takeaway-note"
                className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                Ghi chú đơn Mang về (tuỳ chọn)
              </label>
              <Input
                id="qr-takeaway-note"
                name="takeawayNote"
                aria-label="Ghi chú đơn mang về"
                value={takeawayNote}
                onChange={(e) => onTakeawayNoteChange(e.target.value)}
                placeholder="Ghi chú đơn (VD: Để riêng nước dùng, không hành...)"
                maxLength={300}
                data-testid="qr-takeaway-note"
                className="h-10 sm:h-9 text-base sm:text-xs"
              />
            </div>
          ) : null}
        </div>

        <div className="shrink-0 border-t pt-3 space-y-3">
          {isAddonForDineIn ? (
            <AddonServingModeToggle
              variant="sheet"
              addonIsTakeawayBatch={addonIsTakeawayBatch}
              onChange={onAddonModeChange}
            />
          ) : null}
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-muted-foreground">Tổng cộng</span>
            <span className="text-lg font-extrabold text-price">
              {cartTotal.toLocaleString('vi-VN')} đ
            </span>
          </div>
          <Button
            type="button"
            disabled={isSubmitting || hasUnavailableCartItem || isPaidLocked}
            onClick={() => {
              onOpenChange(false);
              onSubmitOrder();
            }}
            className="w-full h-11 bg-primary text-sm font-bold text-primary-foreground hover:bg-primary/90 shadow-md rounded-xl active:scale-[0.98] touch-manipulation"
          >
            <ShoppingBag className="h-4 w-4 shrink-0" />
            <span>
              {isPaidLocked
                ? "Đơn đã thanh toán — Bấm 'Gọi đơn mới'"
                : hasUnavailableCartItem
                  ? 'Vui lòng xoá món hết hàng trước khi gửi'
                  : `${resolvedActiveOrderId ? 'Xác nhận gọi thêm món' : 'Xác nhận gửi đơn đặt món'} (${cartCount} món — ${cartTotal.toLocaleString('vi-VN')} đ)`}
            </span>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
