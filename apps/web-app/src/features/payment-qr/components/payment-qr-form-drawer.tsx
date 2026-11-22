import {
  VIETQR_BANKS,
  findPaymentQrLimitHierarchyViolation,
  type CreatePaymentAccountRequest,
  type PaymentAccount,
  type UpdatePaymentAccountRequest,
} from '@fnb/shared';
import { Check, ChevronDown, Lock, QrCode } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { buildVietQrFallbackSvgDataUrl, buildVietQrImageUrl } from '@/components/print-slips';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/utils/cn';

function normalizeAsciiUpper(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export interface PaymentQrFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAccount: PaymentAccount | null;
  isSubmitting: boolean;
  onSubmitCreate: (payload: CreatePaymentAccountRequest) => Promise<void>;
  onSubmitUpdate: (id: number, payload: UpdatePaymentAccountRequest) => Promise<void>;
}

export function PaymentQrFormDrawer({
  open,
  onOpenChange,
  editingAccount,
  isSubmitting,
  onSubmitCreate,
  onSubmitUpdate,
}: PaymentQrFormDrawerProps) {
  const [label, setLabel] = React.useState('');
  const [bankCode, setBankCode] = React.useState<string>(VIETQR_BANKS[0].code);
  const [bankMenuOpen, setBankMenuOpen] = React.useState(false);
  const [bankMenuCoords, setBankMenuCoords] = React.useState<{
    top?: number;
    bottom?: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const bankTriggerRef = React.useRef<HTMLButtonElement | null>(null);
  const bankListboxRef = React.useRef<HTMLDivElement | null>(null);
  const menuPortalRef = React.useRef<HTMLDivElement | null>(null);
  const [accountNo, setAccountNo] = React.useState('');
  const [accountName, setAccountName] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [dailyLimit, setDailyLimit] = React.useState<string>('');
  const [monthlyLimit, setMonthlyLimit] = React.useState<string>('');
  const [yearlyLimit, setYearlyLimit] = React.useState<string>('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const isLockedBankFields = Boolean(editingAccount?.hasOrders);

  React.useEffect(() => {
    if (!open) {
      setBankMenuOpen(false);
      return;
    }
    setBankMenuOpen(false);
    setFormError(null);
    if (editingAccount) {
      setLabel(editingAccount.label);
      setBankCode(editingAccount.bankCode);
      setAccountNo(editingAccount.accountNo);
      setAccountName(editingAccount.accountName);
      setIsActive(editingAccount.isActive);
      setDailyLimit(editingAccount.dailyLimit !== null ? String(editingAccount.dailyLimit) : '');
      setMonthlyLimit(
        editingAccount.monthlyLimit !== null ? String(editingAccount.monthlyLimit) : '',
      );
      setYearlyLimit(
        editingAccount.yearlyLimit !== null ? String(editingAccount.yearlyLimit) : '',
      );
    } else {
      setLabel('');
      setBankCode('VPB');
      setAccountNo('');
      setAccountName('');
      setIsActive(true);
      setDailyLimit('');
      setMonthlyLimit('');
      setYearlyLimit('');
    }
  }, [open, editingAccount]);

  const updateBankMenuCoords = React.useCallback(() => {
    const trigger = bankTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const padding = 12;
    const maxAllowedWidth = Math.max(240, window.innerWidth - padding * 2);
    const width = Math.min(Math.max(rect.width, 460), maxAllowedWidth);
    const left = Math.max(
      padding,
      Math.min(rect.left, window.innerWidth - width - padding),
    );
    const spaceBelow = window.innerHeight - rect.bottom - padding;
    const spaceAbove = rect.top - padding;
    const openUpward = spaceBelow < 220 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(288, (openUpward ? spaceAbove : spaceBelow) - 6));
    setBankMenuCoords(
      openUpward
        ? {
            bottom: window.innerHeight - rect.top + 4,
            left,
            width,
            maxHeight,
          }
        : {
            top: rect.bottom + 4,
            left,
            width,
            maxHeight,
          },
    );
  }, []);

  React.useEffect(() => {
    if (!bankMenuOpen) return;
    updateBankMenuCoords();

    const handleOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target &&
        !bankTriggerRef.current?.contains(target) &&
        !bankListboxRef.current?.contains(target)
      ) {
        setBankMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setBankMenuOpen(false);
        bankTriggerRef.current?.focus();
      }
    };
    const handleReposition = () => updateBankMenuCoords();

    document.addEventListener('pointerdown', handleOutside, true);
    window.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('pointerdown', handleOutside, true);
      window.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [bankMenuOpen, updateBankMenuCoords]);

  const previewQrUrl = React.useMemo(() => {
    const cleanAccountNo = accountNo.trim();
    const cleanAccountName = normalizeAsciiUpper(accountName) || 'CHU TAI KHOAN';
    if (!bankCode || !cleanAccountNo) {
      return buildVietQrFallbackSvgDataUrl({
        amount: 100000,
        orderCode: 'HD-MAU-0001',
        tableLabel: 'Bàn 01',
      });
    }
    return buildVietQrImageUrl({
      amount: 100000,
      orderCode: 'HD-MAU-0001',
      tableLabel: 'Bàn 01',
      bankId: bankCode,
      accountNo: cleanAccountNo,
      accountName: cleanAccountName,
    });
  }, [bankCode, accountNo, accountName]);

  const parseLimitOrNull = (val: string): number | null => {
    const trimmed = val.trim();
    if (!trimmed) return null;
    const num = Number(trimmed);
    return Number.isFinite(num) && num > 0 ? num : null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedLabel = label.trim();
    const trimmedAccountNo = accountNo.trim();
    const normalizedHolder = normalizeAsciiUpper(accountName);

    if (!trimmedLabel) {
      setFormError('Vui lòng nhập tên gợi nhớ cho mã QR.');
      return;
    }
    if (!bankCode) {
      setFormError('Vui lòng chọn ngân hàng thụ hưởng.');
      return;
    }
    if (!/^[A-Za-z0-9]{4,30}$/.test(trimmedAccountNo)) {
      setFormError('Số tài khoản phải từ 4–30 ký tự chữ hoặc số (không khoảng trắng).');
      return;
    }
    if (normalizedHolder.length < 2) {
      setFormError('Vui lòng nhập tên chủ tài khoản hợp lệ.');
      return;
    }

    const parsedDaily = parseLimitOrNull(dailyLimit);
    const parsedMonthly = parseLimitOrNull(monthlyLimit);
    const parsedYearly = parseLimitOrNull(yearlyLimit);

    if (
      (dailyLimit.trim() && parsedDaily === null) ||
      (monthlyLimit.trim() && parsedMonthly === null) ||
      (yearlyLimit.trim() && parsedYearly === null)
    ) {
      setFormError('Hạn mức nếu nhập phải lớn hơn 0 đ (hoặc để trống nếu không giới hạn).');
      return;
    }

    const limitViolation = findPaymentQrLimitHierarchyViolation({
      dailyLimit: parsedDaily,
      monthlyLimit: parsedMonthly,
      yearlyLimit: parsedYearly,
    });
    if (limitViolation) {
      setFormError(limitViolation.message);
      return;
    }

    if (editingAccount) {
      const updatePayload: UpdatePaymentAccountRequest = {
        label: trimmedLabel,
        accountName: normalizedHolder,
        isActive,
        dailyLimit: parsedDaily,
        monthlyLimit: parsedMonthly,
        yearlyLimit: parsedYearly,
        ...(!isLockedBankFields
          ? {
              bankCode: bankCode as CreatePaymentAccountRequest['bankCode'],
              accountNo: trimmedAccountNo,
            }
          : {}),
      };
      await onSubmitUpdate(editingAccount.id, updatePayload);
    } else {
      const createPayload: CreatePaymentAccountRequest = {
        label: trimmedLabel,
        bankCode: bankCode as CreatePaymentAccountRequest['bankCode'],
        accountNo: trimmedAccountNo,
        accountName: normalizedHolder,
        isActive,
        dailyLimit: parsedDaily,
        monthlyLimit: parsedMonthly,
        yearlyLimit: parsedYearly,
      };
      await onSubmitCreate(createPayload);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-xl overflow-y-auto"
        data-testid="payment-qr-form-drawer"
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-accent-text" />
            <span>
              {editingAccount ? `Chỉnh sửa mã QR — ${editingAccount.label}` : 'Thêm mã QR thanh toán mới'}
            </span>
          </SheetTitle>
          <SheetDescription>
            Cấu hình tài khoản nhận chuyển khoản VietQR Napas247 và hạn mức xoay vòng tự động theo Ngày / Tháng / Năm.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
          {isLockedBankFields ? (
            <div
              data-testid="payment-qr-locked-warning"
              className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Mã QR này đã phát sinh hoá đơn chuyển khoản nên hệ thống khoá chỉnh sửa{' '}
                <strong>Ngân hàng</strong> và <strong>Số tài khoản</strong> để bảo toàn lịch sử đối soát. Bạn vẫn có thể sửa Tên gợi nhớ, Chủ TK, Hạn mức và Bật/Tắt.
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor="qr-label-input">
              Tên gợi nhớ <span className="text-rose-600">*</span>
            </label>
            <Input
              id="qr-label-input"
              data-testid="payment-qr-label-input"
              placeholder="VD: TK Chính (VPBank), TK Phụ 1 (Vietcombank)..."
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 min-w-0">
              <label className="text-xs font-semibold text-foreground" htmlFor="qr-bank-select">
                Ngân hàng thụ hưởng <span className="text-rose-600">*</span>
              </label>
              {(() => {
                const selectedBank = VIETQR_BANKS.find((b) => b.code === bankCode);
                const selectedBankFullLabel = selectedBank
                  ? `${selectedBank.shortName} (${selectedBank.code}) — ${selectedBank.name}`
                  : '';
                const tooltipText =
                  selectedBankFullLabel || 'Chưa chọn ngân hàng thụ hưởng';
                return (
                  <div
                    className="group relative"
                    title={!bankMenuOpen ? tooltipText : undefined}
                    data-testid="payment-qr-bank-tooltip-wrapper"
                  >
                    <button
                      ref={bankTriggerRef}
                      id="qr-bank-select"
                      type="button"
                      role="combobox"
                      aria-expanded={bankMenuOpen}
                      aria-haspopup="listbox"
                      data-testid="payment-qr-bank-select"
                      disabled={isLockedBankFields}
                      onClick={() => {
                        if (isLockedBankFields) return;
                        if (!bankMenuOpen) {
                          updateBankMenuCoords();
                          setBankMenuOpen(true);
                        } else {
                          setBankMenuOpen(false);
                        }
                      }}
                      className={cn(
                        'flex h-9 w-full min-w-0 items-center justify-between gap-2 whitespace-nowrap rounded-md border border-input bg-background px-3 py-2 text-left text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-60',
                      )}
                    >
                      <span
                        className={cn(
                          'block min-w-0 flex-1 truncate text-left',
                          !selectedBank && 'text-muted-foreground',
                        )}
                      >
                        {selectedBankFullLabel || 'Chọn ngân hàng thụ hưởng'}
                      </span>
                      <ChevronDown
                        className={cn(
                          'h-4 w-4 shrink-0 opacity-50 transition-transform',
                          bankMenuOpen && 'rotate-180',
                        )}
                      />
                    </button>
                    {!bankMenuOpen ? (
                      <div
                        role="tooltip"
                        data-testid="payment-qr-bank-hover-tooltip"
                        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-max max-w-[320px] rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100"
                      >
                        {tooltipText}
                      </div>
                    ) : null}
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground" htmlFor="qr-account-no-input">
                Số tài khoản <span className="text-rose-600">*</span>
              </label>
              <Input
                id="qr-account-no-input"
                data-testid="payment-qr-account-no-input"
                disabled={isLockedBankFields}
                placeholder="VD: 186877721"
                value={accountNo}
                onChange={(e) => setAccountNo(e.target.value.replace(/\s+/g, ''))}
                maxLength={30}
                className="font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground" htmlFor="qr-account-name-input">
              Tên chủ tài khoản (Tự chuẩn hoá IN HOA không dấu) <span className="text-rose-600">*</span>
            </label>
            <Input
              id="qr-account-name-input"
              data-testid="payment-qr-account-name-input"
              placeholder="VD: THAN THI LOAN"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              onBlur={() => setAccountName((prev) => normalizeAsciiUpper(prev))}
              maxLength={100}
              className="uppercase font-semibold"
            />
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wide text-foreground">
                Hạn mức nhận chuyển khoản (Để trống = Không giới hạn)
              </span>
              <Badge variant="outline" className="text-[11px]">
                Tự động xoay vòng
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Hạn mức Ngày
                </label>
                <CurrencyInput
                  data-testid="payment-qr-daily-limit-input"
                  placeholder="Không giới hạn"
                  suffix="đ"
                  value={dailyLimit}
                  onValueChange={(rawDigits) => setDailyLimit(rawDigits)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Hạn mức Tháng
                </label>
                <CurrencyInput
                  data-testid="payment-qr-monthly-limit-input"
                  placeholder="Không giới hạn"
                  suffix="đ"
                  value={monthlyLimit}
                  onValueChange={(rawDigits) => setMonthlyLimit(rawDigits)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Hạn mức Năm
                </label>
                <CurrencyInput
                  data-testid="payment-qr-yearly-limit-input"
                  placeholder="Không giới hạn"
                  suffix="đ"
                  value={yearlyLimit}
                  onValueChange={(rawDigits) => setYearlyLimit(rawDigits)}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Khi in phiếu tạm tính, nếu <code>Đã thu + Tiền phiếu tạm tính &gt; Hạn mức</code> ở bất kỳ chu kỳ nào, hệ thống sẽ tự động chuyển sang mã QR ưu tiên kế tiếp.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-foreground">
                Cho phép tham gia xoay vòng (Bật / Tắt)
              </div>
              <div className="text-[11px] text-muted-foreground">
                Nếu tắt, mã QR này sẽ được bỏ qua khi in phiếu tạm tính.
              </div>
            </div>
            <Checkbox
              checked={isActive}
              onCheckedChange={(checked) => setIsActive(Boolean(checked))}
              data-testid="payment-qr-active-checkbox"
            />
          </div>

          {/* Live VietQR Preview */}
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border bg-card p-3 text-center">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">
              Xem trước mã VietQR in trên phiếu tạm tính (Mẫu 100.000 đ)
            </span>
            <img
              src={previewQrUrl}
              alt="VietQR Preview"
              data-testid="payment-qr-live-preview-img"
              onError={(e) => {
                const fallback = buildVietQrFallbackSvgDataUrl({
                  amount: 100000,
                  orderCode: 'HD-MAU-0001',
                  tableLabel: 'Bàn 01',
                });
                if (e.currentTarget.src !== fallback) {
                  e.currentTarget.src = fallback;
                }
              }}
              className="my-2 h-36 w-36 rounded border bg-white object-contain p-1"
            />
            <span className="text-xs font-bold text-foreground">
              {VIETQR_BANKS.find((b) => b.code === bankCode)?.shortName ?? (bankCode || '---')} — STK:{' '}
              {accountNo.trim() || '---'}
            </span>
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              {normalizeAsciiUpper(accountName) || 'CHU TAI KHOAN'}
            </span>
          </div>

          {formError ? (
            <div
              data-testid="payment-qr-form-error"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400"
            >
              {formError}
            </div>
          ) : null}

          <SheetFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Huỷ bỏ
            </Button>
            <Button
              type="submit"
              data-testid="payment-qr-submit-btn"
              disabled={isSubmitting}
            >
              {editingAccount ? 'Lưu thay đổi' : 'Thêm mã QR'}
            </Button>
          </SheetFooter>
        </form>
        <div ref={menuPortalRef} />
        {bankMenuOpen && !isLockedBankFields && bankMenuCoords && menuPortalRef.current
          ? createPortal(
              <div
                ref={bankListboxRef}
                role="listbox"
                aria-label="Ngân hàng thụ hưởng"
                data-testid="payment-qr-bank-listbox"
                style={{
                  position: 'fixed',
                  top: bankMenuCoords.top,
                  bottom: bankMenuCoords.bottom,
                  left: bankMenuCoords.left,
                  width: bankMenuCoords.width,
                  maxHeight: bankMenuCoords.maxHeight,
                }}
                className="z-[60] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
              >
                {VIETQR_BANKS.map((bank) => {
                  const fullLabel = `${bank.shortName} (${bank.code}) — ${bank.name}`;
                  const isSelected = bank.code === bankCode;
                  return (
                    <button
                      key={bank.code}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      data-testid={`payment-qr-bank-option-${bank.code}`}
                      onClick={() => {
                        setBankCode(isSelected ? '' : bank.code);
                        setBankMenuOpen(false);
                        setFormError(null);
                      }}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none',
                        isSelected && 'bg-accent/70 font-semibold text-foreground',
                      )}
                    >
                      <span className="leading-snug">{fullLabel}</span>
                      {isSelected ? <Check className="h-3.5 w-3.5 shrink-0 text-accent-text" /> : null}
                    </button>
                  );
                })}
              </div>,
              menuPortalRef.current,
            )
          : null}
      </SheetContent>
    </Sheet>
  );
}
