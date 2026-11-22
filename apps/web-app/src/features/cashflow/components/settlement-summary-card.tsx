import { type SettlementStatus } from '@fnb/shared';
import { AlertCircle, CheckCircle2, EyeOff, HandCoins, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface SettlementSummaryCardProps {
  settlementDate: string;
  openingBudget: number;
  totalCashSales: number | null;
  totalTransferSales: number | null;
  totalCashImports: number | null;
  expectedCashInDrawer: number | null;
  actualCountedCash: number;
  blindMode?: boolean;
  blindNoteRequired?: boolean;
  note: string;
  onNoteChange: (note: string) => void;
  onSubmitSettlement: () => void;
  isSubmitting: boolean;
  canSettle: boolean;
}

export function SettlementSummaryCard({
  settlementDate,
  openingBudget,
  totalCashSales,
  totalTransferSales,
  totalCashImports,
  expectedCashInDrawer,
  actualCountedCash,
  blindMode = false,
  blindNoteRequired = false,
  note,
  onNoteChange,
  onSubmitSettlement,
  isSubmitting,
  canSettle,
}: SettlementSummaryCardProps) {
  const isBlind = Boolean(blindMode || expectedCashInDrawer === null);
  const safeExpected = expectedCashInDrawer ?? 0;
  const safeCashSales = totalCashSales ?? 0;
  const safeTransferSales = totalTransferSales ?? 0;
  const safeCashImports = totalCashImports ?? 0;

  const discrepancyAmount =
    Math.round((actualCountedCash - safeExpected) * 100) / 100;

  const status: SettlementStatus =
    discrepancyAmount === 0
      ? 'MATCHED'
      : discrepancyAmount > 0
        ? 'SURPLUS'
        : 'SHORTAGE';

  const requiresNote = isBlind ? blindNoteRequired : discrepancyAmount !== 0;
  const isNoteValid = !requiresNote || note.trim().length > 0;

  // Bàn giao cuối ca (Hard Invariant 6 & PRD §3.5.2):
  // 1. Tiền mặt giữ lại trong két cho ca sau = opening_budget
  // 2. Tiền mặt rút ra nộp Chủ quán = actual_counted_cash - opening_budget
  const cashRetainedInDrawer = openingBudget;
  const cashToHandOver = actualCountedCash - openingBudget;

  return (
    <div
      data-testid="settlement-summary-card"
      className="flex flex-col justify-between space-y-4 rounded-xl border bg-card p-4 shadow-sm"
    >
      <div className="space-y-4">
        {/* Header Đối soát theo ngày */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Bảng Đối Soát Dòng Tiền Kết Ca ({settlementDate})
            </h3>
            <p className="text-xs text-muted-foreground">
              Tách bạch tuyệt đối Tiền mặt tại két vs Chuyển khoản QR ngân hàng
            </p>
          </div>
          {isBlind ? (
            <Badge variant="outline" data-testid="blind-settlement-badge" className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <EyeOff className="h-3.5 w-3.5" />
              <span>Chế độ Kết ca mù</span>
            </Badge>
          ) : null}
        </div>

        {isBlind ? (
          <div
            data-testid="blind-settlement-banner"
            className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-50/60 p-3.5 text-xs dark:border-amber-800 dark:bg-amber-950/20"
          >
            <div className="flex items-center gap-1.5 font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
              <EyeOff className="h-4 w-4 shrink-0" />
              <span>1. Chế độ Kết ca mù (Blind Settlement)</span>
            </div>
            <p className="text-amber-800 dark:text-amber-300 leading-relaxed">
              Số tiền lý thuyết và doanh thu trong ca được ẩn trong lúc đếm tiền để đảm bảo tính minh bạch.
              Sau khi bạn xác nhận Kết ca, toàn bộ số liệu đối soát sẽ được ghi nhận vào bảng Lịch sử bên dưới.
            </p>
            <div className="flex items-center justify-between gap-3 border-t border-amber-300/60 pt-2 dark:border-amber-800">
              <span>(+) Ngân sách tiền lẻ đầu ngày:</span>
              <span className="font-mono font-semibold text-foreground tabular-nums whitespace-nowrap shrink-0">
                {openingBudget.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Công thức tính Tiền lý thuyết trong két (Hard Invariant 6) */}
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3.5 text-xs">
              <div className="font-bold uppercase tracking-wide text-muted-foreground">
                1. Công thức Tiền mặt Lý thuyết trong két
              </div>

              <div className="flex items-center justify-between gap-3">
                <span>(+) Ngân sách tiền lẻ đầu ngày:</span>
                <span className="font-mono font-semibold text-foreground tabular-nums whitespace-nowrap shrink-0">
                  {openingBudget.toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-emerald-700 dark:text-emerald-300">
                <span>(+) Doanh thu Tiền mặt (kể cả phần tiền mặt đơn Kết hợp):</span>
                <span data-testid="cash-sales-amount" className="font-mono font-bold tabular-nums whitespace-nowrap shrink-0">
                  +{safeCashSales.toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 text-rose-700 dark:text-rose-300">
                <span>(-) Chi tiền mặt tại két nhập hàng:</span>
                <span data-testid="cash-imports-amount" className="font-mono font-bold tabular-nums whitespace-nowrap shrink-0">
                  -{safeCashImports.toLocaleString('vi-VN')} đ
                </span>
              </div>

              <div className="flex items-center justify-between gap-3 border-t pt-2 text-sm font-extrabold text-foreground">
                <span>(=) Tiền lý thuyết trong két:</span>
                <span data-testid="expected-cash-in-drawer" className="font-mono text-price tabular-nums whitespace-nowrap shrink-0">
                  {safeExpected.toLocaleString('vi-VN')} đ
                </span>
              </div>
            </div>

            {/* Doanh thu Chuyển khoản QR — Tách biệt, KHÔNG cộng vào két */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-300/60 bg-sky-50/60 p-3 text-xs dark:border-sky-800 dark:bg-sky-950/20">
              <div className="min-w-0">
                <div className="font-bold text-sky-900 dark:text-sky-200">
                  Doanh thu Chuyển khoản QR (Đối soát NH - Không cộng vào két)
                </div>
                <div className="text-[11px] text-sky-700 dark:text-sky-300">
                  Tiền nằm trong tài khoản ngân hàng của Chủ quán (Chuyển khoản + phần chuyển khoản đơn Kết hợp)
                </div>
              </div>
              <span
                data-testid="transfer-sales-readonly"
                className="font-mono text-sm font-extrabold text-sky-800 dark:text-sky-200 tabular-nums whitespace-nowrap shrink-0"
              >
                {safeTransferSales.toLocaleString('vi-VN')} đ
              </span>
            </div>
          </>
        )}

        {/* Kết quả Đối soát Chênh lệch */}
        <div className="space-y-2 rounded-xl border p-3.5 text-xs">
          {!isBlind ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-muted-foreground">
                Chênh lệch (Thực đếm - Lý thuyết):
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <span
                  data-testid="discrepancy-amount"
                  className={cn(
                    'font-mono text-base font-extrabold tabular-nums whitespace-nowrap shrink-0',
                    status === 'MATCHED' && 'text-emerald-600 dark:text-emerald-400',
                    status === 'SURPLUS' && 'text-amber-600 dark:text-amber-400',
                    status === 'SHORTAGE' && 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {discrepancyAmount > 0 ? '+' : ''}
                  {discrepancyAmount.toLocaleString('vi-VN')} đ
                </span>

                <Badge
                  data-testid="settlement-status-badge"
                  variant={
                    status === 'MATCHED'
                      ? 'success'
                      : status === 'SURPLUS'
                        ? 'warning'
                        : 'destructive'
                  }
                >
                  {status === 'MATCHED' ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>Chuẩn</span>
                    </>
                  ) : status === 'SURPLUS' ? (
                    <>
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>Dư tiền</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                      <span>Thiếu tiền</span>
                    </>
                  )}
                </Badge>
              </div>
            </div>
          ) : blindNoteRequired ? (
            <div
              data-testid="blind-discrepancy-prompt"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-2.5 text-rose-700 dark:text-rose-300 font-semibold"
            >
              Số tiền thực đếm có chênh lệch so với hệ thống. Vui lòng kiểm đếm lại hoặc nhập ghi chú giải trình bên dưới rồi bấm Xác nhận Kết ca lần nữa.
            </div>
          ) : null}

          {/* Ô Ghi chú giải trình chênh lệch (EC-FIN-03) */}
          <div className="pt-2">
            <label
              htmlFor="discrepancy-note-textarea"
              className={cn(
                'mb-1 block text-xs font-bold',
                requiresNote ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground',
              )}
            >
              {requiresNote
                ? 'Ghi chú giải trình chênh lệch (Bắt buộc) *'
                : 'Ghi chú kết ca (Tuỳ chọn)'}
            </label>
            <textarea
              id="discrepancy-note-textarea"
              data-testid="discrepancy-note-input"
              required={requiresNote}
              rows={2}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={
                requiresNote
                  ? 'Bắt buộc nhập lý do lệch tiền để mở khoá nút Kết ca...'
                  : 'Ghi chú bàn giao ca...'
              }
              className={cn(
                'w-full rounded-md border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2',
                requiresNote && !isNoteValid
                  ? 'border-rose-500 ring-rose-500/30 focus:ring-rose-500'
                  : 'border-input focus:ring-ring',
              )}
            />
          </div>
        </div>

        {/* Thẻ Tóm tắt Bàn giao Tiền mặt Cuối ca */}
        <div
          data-testid="handover-summary-box"
          className="space-y-2 rounded-xl border border-emerald-400/50 bg-emerald-50/50 p-3.5 text-xs dark:border-emerald-800 dark:bg-emerald-950/20"
        >
          <div className="flex items-center gap-1.5 font-bold uppercase text-emerald-900 dark:text-emerald-200">
            <HandCoins className="h-4 w-4" />
            <span>Tóm tắt Bàn giao Tiền mặt Cuối ca</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span>1. Tiền mặt giữ lại trong két cho ca sau (= Ngân sách đầu ca):</span>
            <span
              data-testid="handover-retained-cash"
              className="font-mono font-bold text-foreground tabular-nums whitespace-nowrap shrink-0"
            >
              {cashRetainedInDrawer.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-emerald-300/60 pt-1.5 text-sm font-extrabold text-emerald-900 dark:border-emerald-800 dark:text-emerald-200">
            <span>2. Tiền mặt rút ra nộp Chủ quán (= Thực đếm - Ngân sách):</span>
            <span data-testid="handover-owner-cash" className="font-mono tabular-nums whitespace-nowrap shrink-0">
              {cashToHandOver.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </div>
      </div>

      <Button
        type="button"
        size="lg"
        data-testid="submit-settlement-btn"
        disabled={!canSettle || !isNoteValid || isSubmitting}
        onClick={onSubmitSettlement}
        className="w-full h-11 font-bold shadow-md active:scale-[0.99] touch-manipulation"
      >
        Xác nhận Kết ca & Chốt sổ Dòng tiền
      </Button>
    </div>
  );
}
