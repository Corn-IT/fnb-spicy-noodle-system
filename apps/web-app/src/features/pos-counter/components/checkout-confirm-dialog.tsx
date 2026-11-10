import {
  PaymentMethod,
  type CheckoutOrderRequest,
  type OrderDetailResponse,
  type PaymentMethod as PaymentMethodValue,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="checkout-confirm-dialog">
        <DialogHeader>
          <DialogTitle>
            Xác nhận Thanh toán (Đóng đơn) — {order.tableLabel} ({order.orderCode})
          </DialogTitle>
          <DialogDescription>
            Tổng thanh toán:{' '}
            <strong className="text-base text-rose-600">
              {totalAmount.toLocaleString('vi-VN')} đ
            </strong>
            . Sau khi xác nhận, đơn chuyển sang PAID và giải phóng bàn về trống.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { method: PaymentMethod.CASH, label: 'Tiền mặt (CASH)' },
                { method: PaymentMethod.TRANSFER, label: 'Chuyển khoản QR (TRANSFER)' },
                { method: PaymentMethod.SPLIT, label: 'Hỗn hợp (SPLIT)' },
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
                <Input
                  id="split-cash-amount"
                  type="number"
                  data-testid="split-cash-input"
                  placeholder="Nhập số tiền mặt..."
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="split-transfer-amount" className="text-xs font-semibold">
                  Tiền chuyển khoản ngân hàng (TRANSFER)
                </label>
                <Input
                  id="split-transfer-amount"
                  type="number"
                  data-testid="split-transfer-input"
                  placeholder="Nhập số tiền chuyển khoản..."
                  value={transferInput}
                  onChange={(e) => setTransferInput(e.target.value)}
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
                  : `Cần khớp đúng ${totalAmount.toLocaleString('vi-VN')} đ (Hiện tại: ${(
                      parsedCash + parsedTransfer
                    ).toLocaleString('vi-VN')} đ)`}
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
