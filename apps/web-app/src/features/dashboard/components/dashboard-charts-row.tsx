import { type DashboardOverviewResponse, type PaymentMethod } from '@fnb/shared';
import { BarChart3, Lock, QrCode, Sparkles } from 'lucide-react';
import * as React from 'react';
import { useTouchAwareNavigate } from '@/components/touch-shell';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { formatVnd } from '@/utils/currency';

interface DashboardChartsRowProps {
  data: DashboardOverviewResponse;
}

type SeriesViewMode = 'payment' | 'channel';

const PAYMENT_LABELS: Record<PaymentMethod, { label: string; colorClass: string; stroke: string }> = {
  CASH: { label: 'Tiền mặt', colorClass: 'bg-emerald-500', stroke: '#10b981' },
  TRANSFER: { label: 'Chuyển khoản QR', colorClass: 'bg-sky-500', stroke: '#0ea5e9' },
  SPLIT: { label: 'Kết hợp (SPLIT)', colorClass: 'bg-amber-500', stroke: '#f59e0b' },
};

function formatCompactAxis(amount: number): string {
  if (amount <= 0) return '0';
  if (amount >= 1_000_000) {
    const tr = Math.round((amount / 1_000_000) * 10) / 10;
    return `${tr}tr`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}k`;
  }
  return String(amount);
}

export function DashboardChartsRow({ data }: DashboardChartsRowProps) {
  const navigate = useTouchAwareNavigate();
  const [viewMode, setViewMode] = React.useState<SeriesViewMode>('payment');
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);

  const series = data.revenueSeries;
  const canViewProfit = data.meta.scope.canViewProfit;
  const maxTotal = React.useMemo(() => {
    if (!series || series.buckets.length === 0) return 100_000;
    return Math.max(100_000, ...series.buckets.map((b) => b.totalSales));
  }, [series]);

  const maxOrders = React.useMemo(() => {
    if (!series || series.buckets.length === 0) return 1;
    return Math.max(1, ...series.buckets.map((b) => b.orderCount));
  }, [series]);

  const hoveredBucket = React.useMemo(() => {
    if (!series) return null;
    if (hoveredKey) {
      return series.buckets.find((b) => b.key === hoveredKey) ?? null;
    }
    return series.buckets.find((b) => b.totalSales > 0) ?? series.buckets[0] ?? null;
  }, [series, hoveredKey]);

  const paymentTotal = React.useMemo(
    () => data.paymentBreakdown.reduce((sum, item) => sum + item.totalAmount, 0),
    [data.paymentBreakdown],
  );

  const conicGradient = React.useMemo(() => {
    if (paymentTotal <= 0 || data.paymentBreakdown.length === 0) {
      return 'conic-gradient(hsl(var(--muted)) 0deg 360deg)';
    }
    let currentDeg = 0;
    const stops: string[] = [];
    for (const item of data.paymentBreakdown) {
      const sliceDeg = (item.totalAmount / paymentTotal) * 360;
      const nextDeg = currentDeg + sliceDeg;
      stops.push(`${PAYMENT_LABELS[item.method].stroke} ${currentDeg.toFixed(1)}deg ${nextDeg.toFixed(1)}deg`);
      currentDeg = nextDeg;
    }
    return `conic-gradient(${stops.join(', ')})`;
  }, [data.paymentBreakdown, paymentTotal]);

  const orderPolylinePoints = React.useMemo(() => {
    if (!series || series.buckets.length === 0) return '';
    const count = series.buckets.length;
    return series.buckets
      .map((bucket, idx) => {
        const x = count === 1 ? 50 : ((idx + 0.5) / count) * 100;
        const y = 92 - (bucket.orderCount / maxOrders) * 76;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' ');
  }, [series, maxOrders]);

  return (
    <section
      aria-label="Biểu đồ doanh thu và cơ cấu thanh toán"
      className="grid grid-cols-1 gap-4 xl:grid-cols-12"
    >
      {/* Left 8 cols: Stacked Hourly/Daily Revenue Chart */}
      <div className="flex flex-col rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-8">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-accent-text">
              <BarChart3 className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                {series?.granularity === 'day'
                  ? 'Doanh thu & Số đơn theo Ngày'
                  : 'Nhịp Doanh thu & Đơn theo Giờ (07h–22h)'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {series
                  ? 'Biểu đồ cột xếp chồng kết hợp đường số lượng hoá đơn PAID'
                  : 'Ẩn chi tiết doanh thu theo chế độ phân quyền'}
              </p>
            </div>
          </div>

          {series ? (
            <div className="inline-flex rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setViewMode('payment')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'payment'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tiền mặt vs VietQR
              </button>
              <button
                type="button"
                onClick={() => setViewMode('channel')}
                className={cn(
                  'rounded-md px-2.5 py-1 font-medium transition-colors',
                  viewMode === 'channel'
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Tại bàn vs Mang về
              </button>
            </div>
          ) : null}
        </div>

        {!series || !canViewProfit ? (
          <div
            className="flex min-h-[240px] flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-6 text-center"
            data-testid="revenue-series-blind"
          >
            <Lock className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Biểu đồ doanh thu được bảo mật</p>
            <p className="mt-1 max-w-md text-xs text-muted-foreground">
              Tài khoản cần quyền <span className="font-semibold">Xem doanh thu chi tiết & lãi</span>{' '}
              để theo dõi biểu đồ doanh thu theo giờ/ngày.
            </p>
          </div>
        ) : (
          <>
            {/* Legend & Hovered Inspector Pill */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
                {viewMode === 'payment' ? (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-emerald-500" /> Tiền mặt
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-sky-500" /> Chuyển khoản QR
                    </span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-primary" /> Tại bàn (DINE_IN)
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-xs bg-amber-500" /> Mang về (TAKEAWAY)
                    </span>
                  </>
                )}
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-3.5 bg-rose-500" /> Số đơn PAID
                </span>
              </div>

              {hoveredBucket ? (
                <div className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground">
                  <span className="font-semibold">{hoveredBucket.label}:</span>{' '}
                  {formatVnd(hoveredBucket.totalSales)} ({hoveredBucket.orderCount} đơn) ·{' '}
                  {viewMode === 'payment'
                    ? `TM ${formatCompactAxis(hoveredBucket.cashSales)} / CK ${formatCompactAxis(hoveredBucket.transferSales)}`
                    : `Bàn ${formatCompactAxis(hoveredBucket.dineInSales)} / MV ${formatCompactAxis(hoveredBucket.takeawaySales)}`}
                </div>
              ) : null}
            </div>

            {/* Chart Area */}
            <div className="relative mt-1 flex h-56 items-end gap-1 rounded-lg border border-border/60 bg-muted/15 px-3 pb-7 pt-5">
              {/* Y-Axis reference lines */}
              <div className="pointer-events-none absolute inset-x-3 bottom-7 top-5 flex flex-col justify-between text-[10px] text-muted-foreground/70">
                <div className="border-b border-dashed border-border/50">
                  <span className="-top-2 bg-card/80 pr-1">{formatCompactAxis(maxTotal)}</span>
                </div>
                <div className="border-b border-dashed border-border/50">
                  <span className="-top-2 bg-card/80 pr-1">{formatCompactAxis(maxTotal / 2)}</span>
                </div>
                <div className="border-b border-border/60" />
              </div>

              {/* Order count polyline SVG overlay */}
              {orderPolylinePoints ? (
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-x-3 bottom-7 top-5 h-[calc(100%-3rem)] w-[calc(100%-1.5rem)]"
                  aria-hidden="true"
                >
                  <polyline
                    fill="none"
                    stroke="rgb(244, 63, 94)"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={orderPolylinePoints}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              ) : null}

              {/* Stacked Vertical Bars */}
              {series.buckets.map((bucket) => {
                const primaryVal = viewMode === 'payment' ? bucket.cashSales : bucket.dineInSales;
                const secondaryVal =
                  viewMode === 'payment' ? bucket.transferSales : bucket.takeawaySales;
                const totalHeightPct = Math.min(100, (bucket.totalSales / maxTotal) * 100);
                const primaryPct =
                  bucket.totalSales > 0 ? (primaryVal / bucket.totalSales) * 100 : 0;
                const secondaryPct =
                  bucket.totalSales > 0 ? (secondaryVal / bucket.totalSales) * 100 : 0;
                const isSelected = hoveredBucket?.key === bucket.key;

                return (
                  <button
                    key={bucket.key}
                    type="button"
                    onMouseEnter={() => setHoveredKey(bucket.key)}
                    onFocus={() => setHoveredKey(bucket.key)}
                    className={cn(
                      'group relative z-10 flex h-full flex-1 flex-col items-center justify-end focus:outline-none',
                    )}
                    title={`${bucket.label}: ${formatVnd(bucket.totalSales)} (${bucket.orderCount} đơn)`}
                  >
                    <div
                      className={cn(
                        'flex w-full max-w-[26px] flex-col-reverse overflow-hidden rounded-t-sm transition-all',
                        isSelected && 'ring-2 ring-primary/50',
                      )}
                      style={{
                        height: bucket.totalSales > 0 ? `${Math.max(4, totalHeightPct)}%` : '2px',
                      }}
                    >
                      {bucket.totalSales > 0 ? (
                        <>
                          <div
                            className={cn(
                              'w-full transition-all',
                              viewMode === 'payment' ? 'bg-emerald-500' : 'bg-primary',
                            )}
                            style={{ height: `${primaryPct}%` }}
                          />
                          <div
                            className={cn(
                              'w-full transition-all',
                              viewMode === 'payment' ? 'bg-sky-500' : 'bg-amber-500',
                            )}
                            style={{ height: `${secondaryPct}%` }}
                          />
                        </>
                      ) : (
                        <div className="h-full w-full bg-border/60" />
                      )}
                    </div>
                    <span className="absolute -bottom-5 text-[10px] font-medium text-muted-foreground">
                      {bucket.label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Footer highlights */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                {series.peakBucketLabel ? (
                  <Badge variant="secondary" className="font-normal">
                    Cao điểm <strong className="ml-1">{series.peakBucketLabel}</strong>:{' '}
                    <span className="ml-1 font-semibold text-foreground">
                      {formatVnd(series.peakBucketAmount)}
                    </span>{' '}
                    ({series.peakBucketOrders} đơn)
                  </Badge>
                ) : null}
                {series.granularity === 'hour' ? (
                  <Badge variant="outline" className="font-normal">
                    <Sparkles className="mr-1 h-3 w-3 text-amber-500" />
                    Khung giờ vàng 14h–17h:{' '}
                    <strong className="ml-1 text-foreground">
                      {formatVnd(series.happyHourAmount)}
                    </strong>{' '}
                    ({series.happyHourOrderCount} đơn)
                  </Badge>
                ) : null}
              </div>
              <span className="text-[11px] text-muted-foreground">
                Di chuột vào từng cột để xem phân rã chi tiết
              </span>
            </div>
          </>
        )}
      </div>

      {/* Right 4 cols: Payment Method Mix & VietQR Daily Limit Quotas */}
      <div className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm xl:col-span-4">
        {/* Payment Method Mix */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Cơ cấu Phương thức Thanh toán</h2>
            <span className="text-[11px] text-muted-foreground">Hoá đơn PAID</span>
          </div>

          {canViewProfit && data.paymentBreakdown.length > 0 ? (
            <div className="flex items-center gap-4">
              <div
                className="relative h-24 w-24 shrink-0 rounded-full"
                style={{ background: conicGradient }}
                aria-label="Biểu đồ tròn cơ cấu phương thức thanh toán"
              >
                <div className="absolute inset-3 flex flex-col items-center justify-center rounded-full bg-card text-center">
                  <span className="text-[10px] text-muted-foreground">Tổng PAID</span>
                  <span className="text-xs font-bold text-foreground">
                    {data.kpis.revenue?.paidOrderCount ?? 0} đơn
                  </span>
                </div>
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {data.paymentBreakdown.map((item) => {
                  const cfg = PAYMENT_LABELS[item.method];
                  return (
                    <div key={item.method} className="text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 truncate font-medium text-foreground">
                          <span className={cn('h-2 w-2 shrink-0 rounded-full', cfg.colorClass)} />
                          {cfg.label}
                        </span>
                        <span className="shrink-0 font-semibold text-foreground">
                          {item.sharePercent}%
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{item.orderCount} đơn</span>
                        <span>{formatVnd(item.totalAmount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-3 py-4 text-center text-xs text-muted-foreground">
              {canViewProfit
                ? 'Chưa phát sinh hoá đơn PAID trong kỳ đã chọn.'
                : 'Tỷ trọng tiền mặt/chuyển khoản chi tiết được ẩn ở chế độ Thu ngân.'}
            </div>
          )}
        </div>

        {/* VietQR Accounts Limit Monitoring */}
        <div className="border-t border-border pt-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <QrCode className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />
              Hạn mức Tài khoản VietQR
            </span>
            {data.meta.scope.canPaymentQr ? (
              <button
                type="button"
                onClick={() => navigate('/payment-qr')}
                className="text-[11px] font-medium text-accent-text hover:underline"
              >
                Quản lý →
              </button>
            ) : null}
          </div>

          {data.paymentQrAccounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {data.meta.scope.canPaymentQr
                ? 'Chưa cấu hình tài khoản nhận VietQR.'
                : 'Cần quyền Thanh toán QR để xem hạn mức.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {data.paymentQrAccounts.slice(0, 3).map((acc) => {
                const limit = acc.dailyLimit ?? 0;
                const percent =
                  limit > 0 ? Math.min(100, Math.round((acc.usedDay / limit) * 100)) : 0;
                const isDanger = acc.status !== 'AVAILABLE' || percent >= 95;
                const isWarn = !isDanger && percent >= 80;
                return (
                  <div key={acc.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium text-foreground">
                        {acc.label}
                        {!acc.label.toUpperCase().includes(acc.bankCode.toUpperCase()) ? (
                          <span className="ml-1 text-[11px] text-muted-foreground">({acc.bankCode})</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-foreground">
                        {formatCompactAxis(acc.usedDay)}
                        {limit > 0 ? ` / ${formatCompactAxis(limit)}` : ' (Không GH)'}
                      </span>
                    </div>
                    {limit > 0 ? (
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            isDanger
                              ? 'bg-rose-500'
                              : isWarn
                                ? 'bg-amber-500'
                                : 'bg-sky-500',
                          )}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
