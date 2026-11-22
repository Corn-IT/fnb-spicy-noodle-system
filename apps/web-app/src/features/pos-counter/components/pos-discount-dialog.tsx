import {
  type ApplyPosDiscountRequest,
  calculateOrderDiscount,
  DiscountWarningCode,
  type DiscountValueType,
  ManualDiscountInputSchema,
  type OrderDetailResponse,
} from '@fnb/shared';
import { Percent, Sparkles, Tag, Ticket } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

import { useApplicableDiscountsQuery } from '../api/pos.api';

const WARNING_MESSAGES: Record<string, string> = {
  [DiscountWarningCode.MIN_ORDER_NOT_MET]: 'Chưa đạt giá trị đơn tối thiểu',
  [DiscountWarningCode.NOT_APPLICABLE]: 'Đơn không có món thuộc phạm vi áp dụng',
};

export interface PosDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderDetailResponse | null;
  isSubmitting: boolean;
  onApplyDiscount: (payload: ApplyPosDiscountRequest) => Promise<OrderDetailResponse | void>;
}

export function PosDiscountDialog({
  open,
  onOpenChange,
  order,
  isSubmitting,
  onApplyDiscount,
}: PosDiscountDialogProps) {
  const user = useAuthStore((s) => s.user);
  const canManualDiscount = Boolean(
    user?.isSuperAdmin || user?.permissions?.pos?.manualDiscount,
  );

  const [activeTab, setActiveTab] = React.useState<'codes' | 'manual'>('codes');
  const [typedCode, setTypedCode] = React.useState('');
  const [manualValueType, setManualValueType] = React.useState<DiscountValueType>('FIXED');
  const [manualValue, setManualValue] = React.useState('');
  const [manualReason, setManualReason] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: applicable, isLoading } = useApplicableDiscountsQuery(
    order?.orderId ?? null,
    open && Boolean(order),
  );

  React.useEffect(() => {
    if (!open) return;
    setActiveTab('codes');
    setTypedCode('');
    setManualValueType('FIXED');
    setManualValue('');
    setManualReason('');
    setFormError(null);
  }, [open, order?.orderId]);

  React.useEffect(() => {
    if (!canManualDiscount && activeTab === 'manual') {
      setActiveTab('codes');
    }
  }, [canManualDiscount, activeTab]);

  const manualPreview = React.useMemo(() => {
    if (!order) return null;
    const numeric = Number(manualValue);
    if (!Number.isFinite(numeric) || numeric <= 0) return null;
    const calcItems = order.items
      .filter((item) => item.kitchenStatus !== 'CANCELLED')
      .map((item) => ({
        productId: item.productId,
        categoryId: null,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
      }));
    return calculateOrderDiscount(calcItems, {
      valueType: manualValueType,
      value: numeric,
      maxDiscountAmount: null,
      scope: 'ORDER',
      targetCategoryIds: [],
      targetProductIds: [],
      minOrderAmount: null,
    });
  }, [order, manualValueType, manualValue]);

  if (!order) return null;

  const subtotalAmount = order.subtotalAmount ?? order.totalAmount;

  const handleApplyTypedCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const cleaned = typedCode.trim().toUpperCase();
    if (cleaned.length < 3) {
      setFormError('Vui lòng nhập mã giảm giá hợp lệ (ít nhất 3 ký tự).');
      return;
    }
    await onApplyDiscount({ code: cleaned });
  };

  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const numeric = Number(manualValue);
    const parsed = ManualDiscountInputSchema.safeParse({
      valueType: manualValueType,
      value: numeric,
      reason: manualReason,
    });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? 'Dữ liệu giảm tay chưa hợp lệ.');
      return;
    }
    if (manualValueType === 'FIXED' && numeric > subtotalAmount) {
      setFormError(
        `Số tiền giảm (${numeric.toLocaleString('vi-VN')} đ) không thể vượt quá tiền hàng (${subtotalAmount.toLocaleString('vi-VN')} đ).`,
      );
      return;
    }
    await onApplyDiscount({ manual: parsed.data });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="pos-discount-dialog" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-accent-text" />
            <span>Áp dụng Giảm giá — {order.orderCode}</span>
          </DialogTitle>
          <DialogDescription>
            Tổng tiền hàng hiện tại:{' '}
            <strong className="text-foreground">
              {subtotalAmount.toLocaleString('vi-VN')} đ
            </strong>
            . Mỗi đơn chỉ áp dụng tối đa 1 ưu đãi tại một thời điểm.
          </DialogDescription>
        </DialogHeader>

        {/* Tab switcher */}
        <div className="flex gap-2 border-b pb-2">
          <button
            type="button"
            data-testid="discount-tab-codes"
            onClick={() => {
              setFormError(null);
              setActiveTab('codes');
            }}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              activeTab === 'codes'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            <Ticket className="h-3.5 w-3.5" />
            <span>Mã khuyến mãi</span>
          </button>

          {canManualDiscount ? (
            <button
              type="button"
              data-testid="discount-tab-manual"
              onClick={() => {
                setFormError(null);
                setActiveTab('manual');
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
                activeTab === 'manual'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Giảm trực tiếp (Tay)</span>
            </button>
          ) : null}
        </div>

        {formError ? (
          <div
            data-testid="pos-discount-form-error"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-300"
          >
            {formError}
          </div>
        ) : null}

        {activeTab === 'codes' ? (
          <div className="space-y-3">
            <form noValidate onSubmit={(e) => void handleApplyTypedCode(e)} className="flex gap-2">
              <Input
                data-testid="pos-discount-code-input"
                value={typedCode}
                disabled={isSubmitting}
                onChange={(e) => setTypedCode(e.target.value.toUpperCase())}
                placeholder="Nhập nhanh mã giảm giá (VD: GIAM10)..."
                className="font-mono uppercase"
              />
              <Button
                type="submit"
                size="sm"
                data-testid="submit-pos-discount-code-btn"
                disabled={isSubmitting || !typedCode.trim()}
              >
                Áp dụng
              </Button>
            </form>

            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {isLoading ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  Đang kiểm tra các mã giảm giá khả dụng...
                </div>
              ) : (applicable?.items ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground">
                  Hiện chưa có mã giảm giá nào đang hoạt động vào khung giờ này.
                </div>
              ) : (
                (applicable?.items ?? []).map((item) => {
                  const disabled = !item.isEligibleForCurrentOrder || isSubmitting;
                  const reasonLabel =
                    item.warningMessage ??
                    (item.warningCode ? WARNING_MESSAGES[item.warningCode] : null);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={disabled}
                      data-testid={`applicable-discount-${item.code}`}
                      onClick={() => void onApplyDiscount({ code: item.code })}
                      className={cn(
                        'w-full rounded-xl border p-3 text-left transition-all',
                        disabled
                          ? 'cursor-not-allowed border-border/60 bg-muted/40 opacity-65'
                          : 'border-border bg-card hover:border-primary hover:bg-primary/5',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-extrabold text-accent-text">
                              {item.code}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {item.valueType === 'PERCENT'
                                ? `-${item.value}%${item.maxDiscountAmount ? ` (tối đa ${item.maxDiscountAmount.toLocaleString('vi-VN')} đ)` : ''}`
                                : `-${item.value.toLocaleString('vi-VN')} đ`}
                            </Badge>
                          </div>
                          <div className="truncate text-xs font-semibold text-foreground">
                            {item.name}
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          <div className="text-xs font-extrabold text-emerald-700 dark:text-emerald-400 tabular-nums">
                            -{item.estimatedDiscountAmount.toLocaleString('vi-VN')} đ
                          </div>
                          {item.remainingCount !== null ? (
                            <div className="text-[10px] text-muted-foreground">
                              Còn {item.remainingCount} lượt
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {reasonLabel ? (
                        <div className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
                          {reasonLabel}
                        </div>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        ) : (
          <form noValidate onSubmit={(e) => void handleSubmitManual(e)} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="manual-discount-type-FIXED"
                disabled={isSubmitting}
                onClick={() => setManualValueType('FIXED')}
                className={cn(
                  'rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                  manualValueType === 'FIXED'
                    ? 'border-primary bg-primary/10 text-accent-text'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                Trừ tiền mặt (đ)
              </button>
              <button
                type="button"
                data-testid="manual-discount-type-PERCENT"
                disabled={isSubmitting}
                onClick={() => setManualValueType('PERCENT')}
                className={cn(
                  'flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold transition-colors',
                  manualValueType === 'PERCENT'
                    ? 'border-primary bg-primary/10 text-accent-text'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                <Percent className="h-3.5 w-3.5" />
                <span>Giảm theo % (1–100%)</span>
              </button>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                {manualValueType === 'PERCENT'
                  ? 'Phần trăm giảm (%) *'
                  : 'Số tiền giảm trực tiếp (đ) *'}
              </label>
              <Input
                type="number"
                min={1}
                step="any"
                data-testid="manual-discount-value-input"
                value={manualValue}
                disabled={isSubmitting}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder={manualValueType === 'PERCENT' ? 'VD: 10' : 'VD: 25000'}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-foreground">
                Lý do giảm giá (Bắt buộc lưu lịch sử thao tác) *
              </label>
              <Input
                data-testid="manual-discount-reason-input"
                value={manualReason}
                disabled={isSubmitting}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="VD: Khách quen, bù món phục vụ chậm..."
                maxLength={255}
              />
            </div>

            {manualPreview ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs space-y-1">
                <div className="flex justify-between">
                  <span>Giảm dự kiến (làm tròn xuống 1.000đ):</span>
                  <strong className="text-emerald-700 dark:text-emerald-400 tabular-nums">
                    -{manualPreview.discountAmount.toLocaleString('vi-VN')} đ
                  </strong>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Khách cần thanh toán:</span>
                  <span className="tabular-nums">
                    {manualPreview.totalAmount.toLocaleString('vi-VN')} đ
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 border-t pt-3">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => onOpenChange(false)}
              >
                Đóng
              </Button>
              <Button
                type="submit"
                data-testid="submit-manual-discount-btn"
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Đang áp dụng...' : 'Xác nhận giảm tay'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
