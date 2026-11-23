import {
  PaymentMethod,
  type OrderDetailResponse,
  type PaymentMethod as PaymentMethodValue,
  type SplitCheckoutOrderRequest,
} from '@fnb/shared';
import { Check, CreditCard, Minus, Plus, QrCode, Split } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

export type SplitOrderDialogMode = 'PROVISIONAL' | 'CHECKOUT';

export interface SplitSelectedItemSummary {
  orderItemId: number;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  modifiers: string[];
  note: string | null;
}

export interface SplitOrderItemsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: SplitOrderDialogMode;
  order: OrderDetailResponse | null;
  isSubmitting: boolean;
  onPrintSplitProvisional: (
    selectedItems: SplitSelectedItemSummary[],
    splitTotal: number,
  ) => void;
  onConfirmSplitCheckout: (
    payload: SplitCheckoutOrderRequest,
    selectedItems: SplitSelectedItemSummary[],
    splitTotal: number,
  ) => void;
}

export function SplitOrderItemsDialog({
  open,
  onOpenChange,
  mode,
  order,
  isSubmitting,
  onPrintSplitProvisional,
  onConfirmSplitCheckout,
}: SplitOrderItemsDialogProps) {
  const [selectedQtyById, setSelectedQtyById] = React.useState<Record<number, number>>({});
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodValue>(
    PaymentMethod.CASH,
  );
  const [cashInput, setCashInput] = React.useState('');
  const [transferInput, setTransferInput] = React.useState('');

  const activeItems = React.useMemo(
    () => (order?.items ?? []).filter((item) => item.kitchenStatus !== 'CANCELLED'),
    [order],
  );

  React.useEffect(() => {
    if (open && order) {
      setSelectedQtyById({});
      setPaymentMethod(PaymentMethod.CASH);
      setCashInput('');
      setTransferInput('');
    }
  }, [open, order]);

  if (!order) return null;

  const toggleItem = (itemId: number, maxQty: number) => {
    setSelectedQtyById((prev) => {
      const next = { ...prev };
      if (next[itemId]) {
        delete next[itemId];
      } else {
        next[itemId] = maxQty;
      }
      return next;
    });
  };

  const changeQty = (itemId: number, maxQty: number, delta: number) => {
    setSelectedQtyById((prev) => {
      const current = prev[itemId] ?? 0;
      const updated = Math.max(0, Math.min(maxQty, current + delta));
      const next = { ...prev };
      if (updated <= 0) {
        delete next[itemId];
      } else {
        next[itemId] = updated;
      }
      return next;
    });
  };

  const selectedItems: SplitSelectedItemSummary[] = activeItems.flatMap((item) => {
    const qty = selectedQtyById[item.id] ?? 0;
    if (qty <= 0) return [];
    return [
      {
        orderItemId: item.id,
        name: item.name,
        quantity: qty,
        unitPrice: item.unitPrice,
        lineTotal: item.unitPrice * qty,
        modifiers: item.modifiers,
        note: item.itemNote,
      },
    ];
  });

  const splitTotal = selectedItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const hasSelection = selectedItems.length > 0 && splitTotal >= 0;

  const parsedCash = Number(cashInput) || 0;
  const parsedTransfer = Number(transferInput) || 0;

  const isSplitPaymentValid =
    paymentMethod === PaymentMethod.SPLIT &&
    parsedCash > 0 &&
    parsedTransfer > 0 &&
    Math.round(parsedCash * 100) + Math.round(parsedTransfer * 100) ===
      Math.round(splitTotal * 100);

  const isCheckoutValid =
    hasSelection &&
    (paymentMethod === PaymentMethod.CASH ||
      paymentMethod === PaymentMethod.TRANSFER ||
      isSplitPaymentValid);

  const handleCheckout = (printReceipt: boolean) => {
    if (!isCheckoutValid || isSubmitting) return;

    const itemsPayload = selectedItems.map((item) => ({
      orderItemId: item.orderItemId,
      quantity: item.quantity,
    }));

    const payload: SplitCheckoutOrderRequest =
      paymentMethod === PaymentMethod.CASH
        ? {
            items: itemsPayload,
            paymentMethod: PaymentMethod.CASH,
            cashAmount: splitTotal,
            transferAmount: 0,
            printReceipt,
          }
        : paymentMethod === PaymentMethod.TRANSFER
          ? {
              items: itemsPayload,
              paymentMethod: PaymentMethod.TRANSFER,
              cashAmount: 0,
              transferAmount: splitTotal,
              printReceipt,
            }
          : {
              items: itemsPayload,
              paymentMethod: PaymentMethod.SPLIT,
              cashAmount: parsedCash,
              transferAmount: parsedTransfer,
              printReceipt,
            };

    onConfirmSplitCheckout(payload, selectedItems, splitTotal);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl" data-testid="split-order-items-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Split className="h-5 w-5 text-accent-text" />
            <span>
              {mode === 'PROVISIONAL'
                ? `Tách đơn In Tạm Tính — ${order.tableLabel ?? order.orderCode}`
                : `Tách đơn Thanh Toán — ${order.tableLabel ?? order.orderCode}`}
            </span>
          </DialogTitle>
          <DialogDescription>
            {mode === 'PROVISIONAL'
              ? 'Chọn những món ăn (và số lượng) khách muốn in tạm tính riêng kèm mã QR theo đúng số tiền tách.'
              : 'Chọn những món ăn khách muốn thanh toán trước. Các món còn lại vẫn tiếp tục phục vụ trên bàn.'}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-card">
          {activeItems.map((item) => {
            const selectedQty = selectedQtyById[item.id] ?? 0;
            const isChecked = selectedQty > 0;
            return (
              <div
                key={item.id}
                data-testid={`split-item-row-${item.id}`}
                className={cn(
                  'flex items-center justify-between gap-3 px-3.5 py-2.5 transition-colors',
                  isChecked ? 'bg-primary/5' : 'hover:bg-accent/40',
                )}
              >
                <button
                  type="button"
                  data-testid={`split-item-toggle-${item.id}`}
                  onClick={() => toggleItem(item.id, item.quantity)}
                  className="flex flex-1 items-start gap-2.5 text-left min-w-0"
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors touch-ui:mt-0 touch-ui:h-6 touch-ui:w-6',
                      isChecked
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/50 bg-background',
                    )}
                  >
                    {isChecked ? <Check className="h-3 w-3 stroke-[3]" /> : null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-foreground">
                      {item.name}{' '}
                      <span className="text-xs font-normal text-muted-foreground">
                        (Gốc: {item.quantity})
                      </span>
                    </div>
                    {item.modifiers.length > 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {item.modifiers.join(', ')}
                      </p>
                    ) : null}
                    {item.itemNote ? (
                      <p className="text-xs italic text-amber-700 dark:text-amber-300">
                        Ghi chú: {item.itemNote}
                      </p>
                    ) : null}
                    <p className="text-xs font-bold text-price tabular-nums">
                      {item.unitPrice.toLocaleString('vi-VN')} đ / phần
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={selectedQty <= 0}
                    onClick={() => changeQty(item.id, item.quantity, -1)}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span
                    data-testid={`split-item-qty-${item.id}`}
                    className="w-8 text-center text-xs font-bold tabular-nums"
                  >
                    {selectedQty}/{item.quantity}
                  </span>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    className="h-7 w-7"
                    disabled={selectedQty >= item.quantity}
                    onClick={() => changeQty(item.id, item.quantity, 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center justify-between">
          <span className="text-xs sm:text-sm font-semibold text-muted-foreground">
            Tổng tiền các món đã chọn ({selectedItems.reduce((s, i) => s + i.quantity, 0)} phần):
          </span>
          <span
            data-testid="split-selected-total"
            className="text-base sm:text-lg font-extrabold text-price tabular-nums"
          >
            {splitTotal.toLocaleString('vi-VN')} đ
          </span>
        </div>

        {mode === 'CHECKOUT' ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  { method: PaymentMethod.CASH, label: 'Tiền mặt' },
                  { method: PaymentMethod.TRANSFER, label: 'Chuyển khoản QR' },
                  { method: PaymentMethod.SPLIT, label: 'Tiền mặt + Chuyển khoản' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.method}
                  type="button"
                  data-testid={`split-payment-method-${opt.method}`}
                  onClick={() => setPaymentMethod(opt.method)}
                  className={cn(
                    'flex items-center justify-center text-center rounded-lg border px-3 py-2 text-xs font-bold transition select-none touch-ui:min-h-12 touch-ui:text-sm',
                    paymentMethod === opt.method
                      ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                      : 'border-border bg-card hover:bg-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {paymentMethod === PaymentMethod.SPLIT ? (
              <div className="space-y-2.5 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Tiền mặt (CASH)</label>
                    <CurrencyInput
                      data-testid="split-order-cash-input"
                      placeholder="VD: 100.000"
                      suffix="đ"
                      value={cashInput}
                      onValueChange={(rawDigits) => setCashInput(rawDigits)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Chuyển khoản (TRANSFER)</label>
                    <CurrencyInput
                      data-testid="split-order-transfer-input"
                      placeholder="VD: 100.000"
                      suffix="đ"
                      value={transferInput}
                      onValueChange={(rawDigits) => setTransferInput(rawDigits)}
                    />
                  </div>
                </div>
                <p
                  className={cn(
                    'text-xs font-medium',
                    isSplitPaymentValid ? 'text-emerald-600' : 'text-rose-600',
                  )}
                >
                  {isSplitPaymentValid
                    ? '✓ Tổng tiền mặt + chuyển khoản khớp với phần tách.'
                    : `Cần khớp đúng ${formatVnd(splitTotal)} (Hiện tại: ${formatVnd(
                        parsedCash + parsedTransfer,
                      )})`}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ bỏ
          </Button>
          {mode === 'PROVISIONAL' ? (
            <Button
              type="button"
              data-testid="confirm-split-provisional-btn"
              disabled={!hasSelection || isSubmitting}
              onClick={() => onPrintSplitProvisional(selectedItems, splitTotal)}
              className="font-bold gap-1.5"
            >
              <QrCode className="h-4 w-4" />
              <span>In tạm tính các món đã chọn</span>
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                data-testid="confirm-split-checkout-noprint-btn"
                disabled={!isCheckoutValid || isSubmitting}
                onClick={() => handleCheckout(false)}
                className="font-semibold"
              >
                Xác nhận & Không in
              </Button>
              <Button
                type="button"
                data-testid="confirm-split-checkout-print-btn"
                disabled={!isCheckoutValid || isSubmitting}
                onClick={() => handleCheckout(true)}
                className="bg-emerald-600 font-bold text-white hover:bg-emerald-700 gap-1.5"
              >
                <CreditCard className="h-4 w-4" />
                <span>Thanh toán & In hoá đơn tách</span>
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
