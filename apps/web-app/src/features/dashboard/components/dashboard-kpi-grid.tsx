import { type DashboardOverviewResponse } from '@fnb/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  ChefHat,
  EyeOff,
  Lock,
  Package,
  QrCode,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useTouchAwareNavigate } from '@/components/touch-shell';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

interface DashboardKpiGridProps {
  data: DashboardOverviewResponse;
}

function renderGrowthPill(growthPercent: number | null) {
  if (growthPercent === null) {
    return (
      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
        Kỳ đầu tiên
      </span>
    );
  }
  const positive = growthPercent >= 0;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold',
        positive
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
          : 'bg-rose-500/15 text-rose-700 dark:text-rose-300',
      )}
    >
      {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {positive ? '+' : ''}
      {growthPercent}%
    </span>
  );
}

export function DashboardKpiGrid({ data }: DashboardKpiGridProps) {
  const navigate = useTouchAwareNavigate();
  const { revenue, cashDrawer, transfer, inventory, openOrders, profit } = data.kpis;
  const isBlindCashier = Boolean(cashDrawer?.blindMode);

  return (
    <section
      aria-label="Chỉ số vận hành và tài chính chính"
      data-testid="dashboard-kpi-grid"
      className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5"
    >
      {/* Card 1: Revenue (Full access) or Active Open Orders (Blind mode fallback) */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        {revenue ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-accent-text">
                  <Wallet className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Doanh thu thuần (PAID)</p>
                  <p className="text-[11px] text-muted-foreground">
                    {revenue.paidOrderCount} đơn · TB {formatVnd(revenue.averageOrderValue)}
                  </p>
                </div>
              </div>
              {renderGrowthPill(revenue.growthPercent)}
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground" data-testid="kpi-revenue-amount">
                {formatVnd(revenue.netPaidAmount)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded bg-muted/70 px-1.5 py-0.5">
                  Tại bàn: <strong className="text-foreground">{revenue.dineInCount}</strong>
                </span>
                <span className="rounded bg-muted/70 px-1.5 py-0.5">
                  Mang về: <strong className="text-foreground">{revenue.takeawayCount}</strong>
                </span>
                <span className="rounded bg-muted/70 px-1.5 py-0.5">
                  QR: <strong className="text-foreground">{revenue.qrSourceCount}</strong>
                </span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <EyeOff className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Doanh thu thuần</p>
                  <p className="text-[11px] text-muted-foreground">Quyền Thu ngân (Blind Mode)</p>
                </div>
              </div>
              <Badge variant="warning" className="text-[10px]">
                Đã ẩn
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-base font-semibold text-foreground" data-testid="kpi-revenue-blind">
                Bảo mật doanh thu ca
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tạm tính bàn mở:{' '}
                <strong className="text-foreground">
                  {openOrders ? formatVnd(openOrders.totalOpenAmount) : '—'}
                </strong>
              </p>
            </div>
          </>
        )}
      </div>

      {/* Card 2: Cash Drawer Expected (Invariant 6) / Blind Mode Shield */}
      <div
        className={cn(
          'flex flex-col justify-between rounded-xl border p-4 shadow-sm',
          cashDrawer?.blindMode
            ? 'border-amber-300/70 bg-amber-50/40 dark:border-amber-800/60 dark:bg-amber-950/20'
            : 'border-border bg-card',
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-300">
              <Banknote className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Tiền mặt két (H.I.6)</p>
              <p className="text-[11px] text-muted-foreground">
                Đầu ca {cashDrawer ? formatVnd(cashDrawer.openingBudget) : '—'}
              </p>
            </div>
          </div>
          {cashDrawer?.blindMode ? (
            <Badge variant="warning" className="text-[10px]">
              <Lock className="h-2.5 w-2.5" />
              Kết ca mù
            </Badge>
          ) : (
            <Badge variant="success" className="text-[10px]">
              Dự kiến
            </Badge>
          )}
        </div>

        <div className="mt-3">
          {!cashDrawer ? (
            <p className="text-xs text-muted-foreground">Không có quyền xem Quỹ & Kết ca.</p>
          ) : cashDrawer.blindMode ? (
            <>
              <p className="text-base font-semibold text-amber-800 dark:text-amber-200" data-testid="kpi-cash-blind">
                Ẩn tiền lý thuyết két
              </p>
              <button
                type="button"
                onClick={() => navigate('/cashflow')}
                className="mt-1.5 text-left text-[11px] font-medium text-accent-text underline-offset-2 hover:underline"
              >
                Vào Kết ca để nhập số thực đếm →
              </button>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold tracking-tight text-foreground" data-testid="kpi-cash-expected">
                {formatVnd(cashDrawer.expectedCashInDrawer)}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground break-words" title="Đầu ca + Thu tiền mặt - Nhập hàng bằng tiền két">
                +Thu TM {formatVnd(cashDrawer.totalCashSales)} · -Chi két {formatVnd(cashDrawer.totalCashImports)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* Card 3: VietQR Transfer Sales OR Open Orders if Blind/Limited */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        {transfer && !isBlindCashier ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300">
                  <QrCode className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Chuyển khoản VietQR</p>
                  <p className="text-[11px] text-muted-foreground">
                    {transfer.transferOrderCount} CK + {transfer.splitOrderCount} SPLIT
                  </p>
                </div>
              </div>
              <Badge variant="info" className="text-[10px]">
                {transfer.sharePercent}% DT
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold tracking-tight text-foreground" data-testid="kpi-transfer-amount">
                {formatVnd(transfer.totalTransferSales)}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground break-words">
                {transfer.byAccount[0]
                  ? `Top TK: ${transfer.byAccount[0].label} (${formatVnd(transfer.byAccount[0].amount)})`
                  : 'Chưa phát sinh chuyển khoản'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/12 text-sky-700 dark:text-sky-300">
                  <QrCode className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug text-muted-foreground">Tài khoản VietQR</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">Hạn mức ngày</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {data.paymentQrAccounts.length} TK
              </Badge>
            </div>
            <div className="mt-3">
              <p className="text-base font-semibold text-foreground">
                {data.paymentQrAccounts.filter((a) => a.status === 'AVAILABLE').length} TK sẵn sàng
              </p>
              <button
                type="button"
                onClick={() => navigate('/payment-qr')}
                className="mt-1.5 text-left text-[11px] font-medium text-accent-text underline-offset-2 hover:underline"
              >
                Xem trạng thái TK VietQR →
              </button>
            </div>
          </>
        )}
      </div>

      {/* Card 4: Inventory Import Expenses */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/12 text-orange-700 dark:text-orange-300">
              <Package className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Chi phí Nhập hàng</p>
              <p className="text-[11px] text-muted-foreground">
                {inventory ? `${inventory.importCount} phiếu nhập` : 'Chưa mở quyền'}
              </p>
            </div>
          </div>
          {inventory?.costToRevenuePercent !== null && inventory?.costToRevenuePercent !== undefined ? (
            <Badge variant="secondary" className="text-[10px]">
              {inventory.costToRevenuePercent}% DT
            </Badge>
          ) : null}
        </div>
        <div className="mt-3">
          {inventory ? (
            <>
              <p className="text-2xl font-bold tracking-tight text-foreground" data-testid="kpi-inventory-cost">
                {formatVnd(inventory.totalImportCost)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-800 dark:text-amber-300">
                  Từ két: {formatVnd(inventory.cashDrawerImportCost)}
                </span>
                <span className="rounded bg-muted/70 px-1.5 py-0.5">
                  Ngoài két: {formatVnd(inventory.externalImportCost)}
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Cần quyền Nhập kho để xem chi phí nguyên liệu.</p>
          )}
        </div>
      </div>

      {/* Card 5: Estimated Operating Profit (with viewProfit) OR Live Tables & Kitchen Load */}
      <div className="flex flex-col justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
        {profit ? (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/12 text-accent-text">
                  <TrendingUp className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Lãi gộp sau Nhập & Lương</p>
                  <p className="text-[11px] text-muted-foreground">
                    Sau nhập kho: {formatVnd(profit.grossProfitAfterInventory, { signed: true })}
                  </p>
                </div>
              </div>
              {profit.marginPercent !== null ? (
                <Badge
                  variant={profit.marginPercent >= 0 ? 'success' : 'destructive'}
                  className="text-[10px]"
                >
                  Biên {profit.marginPercent}%
                </Badge>
              ) : null}
            </div>
            <div className="mt-3">
              <p
                className={cn(
                  'text-2xl font-bold tracking-tight',
                  (profit.netOperatingProfit ?? profit.grossProfitAfterInventory) >= 0
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-rose-700 dark:text-rose-300',
                )}
                data-testid="kpi-net-profit"
              >
                {formatVnd(profit.netOperatingProfit ?? profit.grossProfitAfterInventory, {
                  signed: true,
                })}
              </p>
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground break-words">
                {profit.estimatedLaborCost !== null
                  ? `Quỹ lương kỳ: -${formatVnd(profit.estimatedLaborCost)}`
                  : 'Chưa cộng trừ quỹ lương kỳ'}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-accent-text">
                  <ChefHat className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-medium leading-snug text-muted-foreground">Phục vụ &amp; Bếp</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">Trực tiếp</p>
                </div>
              </div>
              {openOrders && openOrders.unprintedKitchenItemsCount > 0 ? (
                <Badge variant="warning" className="text-[10px]">
                  {openOrders.unprintedKitchenItemsCount} chờ in
                </Badge>
              ) : null}
            </div>
            <div className="mt-3">
              {openOrders ? (
                <>
                  <p className="text-2xl font-bold tracking-tight text-foreground" data-testid="kpi-open-tables">
                    {openOrders.occupiedTableCount + openOrders.pendingTableCount}/
                    {openOrders.totalPhysicalTables} bàn
                  </p>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground break-words">
                    {openOrders.pendingTableCount} chờ QR · {openOrders.takeawayOpenCount} đơn Mang về
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Cần quyền POS để theo dõi bàn.</p>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
