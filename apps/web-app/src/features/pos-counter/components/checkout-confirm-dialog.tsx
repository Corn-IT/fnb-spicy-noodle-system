import {
  PaymentMethod,
  type CheckoutOrderRequest,
  type OrderDetailResponse,
  type PaymentMethod as PaymentMethodValue,
} from '@fnb/shared';
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
import { useAppMessages } from '@/hooks/use-app-messages';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

export interface CheckoutConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetailResponse | null;
  isSubmitting: boolean;
  onConfirmCheckout: (payload: CheckoutOrderRequest) => void;
}

export function CheckoutConfirmDialog({
  open,
  onOpenChange,
  order,
  isSubmitting,
  onConfirmCheckout,
}: CheckoutConfirmDialogProps) {
  const { resolveMessage } = useAppMessages();
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethodValue>(
    PaymentMethod.CASH,
  );
  const [cashInput, setCashInput] = React.useState('');
  const [transferInput, setTransferInput] = React.useState('');

  React.useEffect(() => {
    if (open && order) {
      setPaymentMethod(PaymentMethod.CASH);
      setCashInput('');
      setTransferInput('');
    }
  }, [open, order]);

  if (!order) return null;

  const totalAmount = order.totalAmount;
  const parsedCash = Number(cashInput) || 0;
  const parsedTransfer = Number(transferInput) || 0;

  const isSplitValid =
    paymentMethod === PaymentMethod.SPLIT &&
    parsedCash > 0 &&
    parsedTransfer > 0 &&
    Math.round(parsedCash * 100) + Math.round(parsedTransfer * 100) ===
      Math.round(totalAmount * 100);

  const isValid =
    paymentMethod === PaymentMethod.CASH ||
    paymentMethod === PaymentMethod.TRANSFER ||
    isSplitValid;

  const handleConfirm = (printReceipt: boolean) => {
    if (!isValid || isSubmitting) return;

    const payload: CheckoutOrderRequest =
      paymentMethod === PaymentMethod.CASH
        ? {
            paymentMethod: PaymentMethod.CASH,
            totalAmount,
            cashAmount: totalAmount,
            transferAmount: 0,
            printReceipt,
          }
        : paymentMethod === PaymentMethod.TRANSFER
          ? {
              paymentMethod: PaymentMethod.TRANSFER,
              totalAmount,
              cashAmount: 0,
              transferAmount: totalAmount,
              printReceipt,
            }
          : {
              paymentMethod: PaymentMethod.SPLIT,
              totalAmount,
              cashAmount: parsedCash,
              transferAmount: parsedTransfer,
              printReceipt,
            };

    onConfirmCheckout(payload);
  };

  const confirmCopy = resolveMessage('pos.confirm.checkout', {
    tableLabel: order.tableLabel,
    orderCode: order.orderCode,
    totalAmount: totalAmount.toLocaleString('vi-VN'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="checkout-confirm-dialog">
        <DialogHeader>
          <DialogTitle>{confirmCopy.title}</DialogTitle>
          <DialogDescription>
            {confirmCopy.isOverridden && confirmCopy.description ? (
              confirmCopy.description
            ) : (
              <>
                {(order.discountAmount ?? 0) > 0 ? (
                  <span className="block text-xs text-muted-foreground mb-1">
                    Tiền hàng:{' '}
                    {(order.subtotalAmount ?? totalAmount + (order.discountAmount ?? 0)).toLocaleString(
                      'vi-VN',
                    )}{' '}
                    đ • Giảm giá: -{(order.discountAmount ?? 0).toLocaleString('vi-VN')} đ
                  </span>
                ) : null}
                Tổng thanh toán:{' '}
                <strong className="text-base text-price">
                  {totalAmount.toLocaleString('vi-VN')} đ
                </strong>
                . Sau khi xác nhận, đơn chuyển sang Đã thanh toán và giải phóng bàn về trống.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
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
                data-testid={`payment-method-${opt.method}`}
                onClick={() => setPaymentMethod(opt.method)}
                className={cn(
                  'flex items-center justify-center text-center rounded-lg border px-3 py-2.5 text-xs font-bold transition select-none active:scale-[0.98]',
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
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <div className="space-y-1">
                <label htmlFor="split-cash-amount" className="text-xs font-semibold">
                  Tiền mặt thu vào két (CASH)
                </label>
                <CurrencyInput
                  id="split-cash-amount"
                  data-testid="split-cash-input"
                  placeholder="VD: 100.000"
                  suffix="đ"
                  value={cashInput}
                  onValueChange={(rawDigits) => setCashInput(rawDigits)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="split-transfer-amount" className="text-xs font-semibold">
                  Tiền chuyển khoản ngân hàng (TRANSFER)
                </label>
                <CurrencyInput
                  id="split-transfer-amount"
                  data-testid="split-transfer-input"
                  placeholder="VD: 100.000"
                  suffix="đ"
                  value={transferInput}
                  onValueChange={(rawDigits) => setTransferInput(rawDigits)}
                />
              </div>
              <p
                data-testid="split-validation-msg"
                className={cn(
                  'text-xs font-medium',
                  isSplitValid ? 'text-emerald-600' : 'text-rose-600',
                )}
              >
                {isSplitValid
                  ? '✓ Tổng tiền mặt + chuyển khoản khớp hoàn toàn với hoá đơn.'
                  : `Cần khớp đúng ${formatVnd(totalAmount)} (Hiện tại: ${formatVnd(
                      parsedCash + parsedTransfer,
                    )})`}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            data-testid="checkout-cancel-btn"
            className="font-semibold active:scale-[0.98] transition-transform select-none"
            onClick={() => onOpenChange(false)}
          >
            Huỷ bỏ
          </Button>
          <Button
            type="button"
            variant="secondary"
            data-testid="checkout-confirm-noprint-btn"
            disabled={!isValid || isSubmitting}
            onClick={() => handleConfirm(false)}
            className="font-semibold active:scale-[0.98] transition-transform select-none"
          >
            Xác nhận & Không in
          </Button>
          <Button
            type="button"
            data-testid="checkout-confirm-print-btn"
            disabled={!isValid || isSubmitting}
            onClick={() => handleConfirm(true)}
            className="bg-emerald-600 font-bold text-white hover:bg-emerald-700 active:scale-[0.98] transition-transform select-none shadow-xs"
          >
            Xác nhận & In hoá đơn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
