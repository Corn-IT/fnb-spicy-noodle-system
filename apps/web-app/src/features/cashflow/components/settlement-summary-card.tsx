import { type SettlementStatus } from '@fnb/shared';
import { AlertCircle, CheckCircle2, HandCoins, ShieldAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';

export interface SettlementSummaryCardProps {
  settlementDate: string;
  shiftName: string;
  openingBudget: number;
  totalCashSales: number;
  totalTransferSales: number;
  totalCashImports: number;
  expectedCashInDrawer: number;
  actualCountedCash: number;
  note: string;
  onShiftNameChange: (shiftName: string) => void;
  onNoteChange: (note: string) => void;
  onSubmitSettlement: () => void;
  isSubmitting: boolean;
  canSettle: boolean;
}

export function SettlementSummaryCard({
  settlementDate,
  shiftName,
  openingBudget,
  totalCashSales,
  totalTransferSales,
  totalCashImports,
  expectedCashInDrawer,
  actualCountedCash,
  note,
  onShiftNameChange,
  onNoteChange,
  onSubmitSettlement,
  isSubmitting,
  canSettle,
}: SettlementSummaryCardProps) {
  const discrepancyAmount =
    Math.round((actualCountedCash - expectedCashInDrawer) * 100) / 100;

  const status: SettlementStatus =
    discrepancyAmount === 0
      ? 'MATCHED'
      : discrepancyAmount > 0
        ? 'SURPLUS'
        : 'SHORTAGE';

  const requiresNote = discrepancyAmount !== 0;
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
        {/* Header Ca làm việc */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              Bảng Đối Soát Dòng Tiền Kết Ca ({settlementDate})
            </h3>
            <p className="text-xs text-muted-foreground">
              Tách bạch tuyệt đối Tiền mặt tại két vs Chuyển khoản QR ngân hàng
            </p>
          </div>
          <select
            aria-label="Chọn ca kết sổ"
            data-testid="settlement-shift-select"
            value={shiftName}
            onChange={(e) => onShiftNameChange(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs font-semibold text-foreground"
          >
            <option value="Ca Sáng">Ca Sáng</option>
            <option value="Ca Tối">Ca Tối</option>
            <option value="Ca Khác">Ca Khác</option>
          </select>
        </div>

        {/* Công thức tính Tiền lý thuyết trong két (Hard Invariant 6) */}
        <div className="space-y-2 rounded-xl border bg-muted/30 p-3.5 text-xs">
          <div className="font-bold uppercase tracking-wide text-muted-foreground">
            1. Công thức Tiền mặt Lý thuyết trong két
          </div>

          <div className="flex items-center justify-between">
            <span>(+) Ngân sách tiền lẻ đầu ca (opening_budget):</span>
            <span className="font-mono font-semibold text-foreground">
              {openingBudget.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-300">
            <span>(+) Doanh thu Tiền mặt (CASH + phần CASH đơn SPLIT):</span>
            <span data-testid="cash-sales-amount" className="font-mono font-bold">
              +{totalCashSales.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex items-center justify-between text-rose-700 dark:text-rose-300">
            <span>(-) Chi tiền mặt tại két nhập hàng (CASH_DRAWER):</span>
            <span data-testid="cash-imports-amount" className="font-mono font-bold">
              -{totalCashImports.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex items-center justify-between border-t pt-2 text-sm font-extrabold text-foreground">
            <span>(=) Tiền lý thuyết trong két (expected_cash):</span>
            <span data-testid="expected-cash-in-drawer" className="font-mono text-primary">
              {expectedCashInDrawer.toLocaleString('vi-VN')} đ
            </span>
          </div>
        </div>

        {/* Doanh thu Chuyển khoản QR — Tách biệt, KHÔNG cộng vào két */}
        <div className="flex items-center justify-between rounded-xl border border-sky-300/60 bg-sky-50/60 p-3 text-xs dark:border-sky-800 dark:bg-sky-950/20">
          <div>
            <div className="font-bold text-sky-900 dark:text-sky-200">
              Doanh thu Chuyển khoản QR (Đối soát NH - Không cộng vào két)
            </div>
            <div className="text-[11px] text-sky-700 dark:text-sky-300">
              Tiền nằm trong tài khoản ngân hàng của Chủ quán (TRANSFER + phần QR đơn SPLIT)
            </div>
          </div>
          <span
            data-testid="transfer-sales-readonly"
            className="font-mono text-sm font-extrabold text-sky-800 dark:text-sky-200"
          >
            {totalTransferSales.toLocaleString('vi-VN')} đ
          </span>
        </div>

        {/* Kết quả Đối soát Chênh lệch */}
        <div className="space-y-2 rounded-xl border p-3.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-muted-foreground">
              Chênh lệch (Thực đếm - Lý thuyết):
            </span>
            <div className="flex items-center gap-2">
              <span
                data-testid="discrepancy-amount"
                className={cn(
                  'font-mono text-base font-extrabold',
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
                    <span>Chuẩn (MATCHED)</span>
                  </>
                ) : status === 'SURPLUS' ? (
                  <>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    <span>Dư tiền (SURPLUS)</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                    <span>Thiếu tiền (SHORTAGE)</span>
                  </>
                )}
              </Badge>
            </div>
          </div>

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

          <div className="flex items-center justify-between">
            <span>1. Tiền mặt giữ lại trong két cho ca sau (= Ngân sách đầu ca):</span>
            <span
              data-testid="handover-retained-cash"
              className="font-mono font-bold text-foreground"
            >
              {cashRetainedInDrawer.toLocaleString('vi-VN')} đ
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-emerald-300/60 pt-1.5 text-sm font-extrabold text-emerald-900 dark:border-emerald-800 dark:text-emerald-200">
            <span>2. Tiền mặt rút ra nộp Chủ quán (= Thực đếm - Ngân sách):</span>
            <span data-testid="handover-owner-cash" className="font-mono">
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
