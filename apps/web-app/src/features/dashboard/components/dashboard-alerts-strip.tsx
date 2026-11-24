import { type DashboardOverviewResponse } from '@fnb/shared';
import { AlertTriangle, ArrowRight, BellRing, Clock, CreditCard, QrCode } from 'lucide-react';
import * as React from 'react';
import { useTouchAwareNavigate } from '@/components/touch-shell';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatVnd } from '@/utils/currency';
import { cn } from '@/utils/cn';

import { formatWaitDuration } from '../api/dashboard.api';

interface DashboardAlertsStripProps {
  alerts: DashboardOverviewResponse['alerts'];
}

export function DashboardAlertsStrip({ alerts }: DashboardAlertsStripProps) {
  const navigate = useTouchAwareNavigate();
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);

  const pendingQrCount = alerts.pendingQrTables.length;
  const pendingEditCount = alerts.pendingPaymentEdits.length;
  const nearLimitCount = alerts.nearLimitQrAccounts.length;
  const totalAlerts = pendingQrCount + pendingEditCount + nearLimitCount;

  React.useEffect(() => {
    setElapsedSeconds(0);
    if (pendingQrCount === 0) return;
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [pendingQrCount, alerts.pendingQrTables]);

  if (totalAlerts === 0) {
    return null;
  }

  return (
    <section
      aria-label="Cảnh báo vận hành thời gian thực"
      data-testid="dashboard-alerts-strip"
      className="grid grid-cols-1 gap-2.5 lg:grid-cols-3"
    >
      {alerts.pendingQrTables.map((item) => {
        const liveWait = item.waitSeconds + elapsedSeconds;
        const isOverdue = item.isOverdue || liveWait >= 180;
        return (
          <div
            key={`qr-${item.orderId}`}
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 shadow-sm transition-colors',
              isOverdue
                ? 'border-rose-300 bg-rose-50/90 dark:border-rose-800/80 dark:bg-rose-950/50'
                : 'border-amber-300 bg-amber-50/90 dark:border-amber-800/80 dark:bg-amber-950/40',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  isOverdue
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                )}
              >
                <BellRing className="h-4 w-4 animate-pulse" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold leading-snug text-foreground break-words">
                    {item.tableLabel} · {item.kind === 'NEW' ? 'Đơn QR mới' : 'Gọi thêm QR'}
                  </span>
                  <Badge variant={isOverdue ? 'destructive' : 'warning'} className="px-1.5 py-0 text-[10px]">
                    <Clock className="h-2.5 w-2.5" />
                    {formatWaitDuration(liveWait)}
                  </Badge>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground break-words">
                  {item.orderCode} · Tạm tính {formatVnd(item.totalAmount)}
                  {isOverdue ? ' · Quá 3 phút chờ duyệt' : ''}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant={isOverdue ? 'destructive' : 'outline'}
              className="min-h-10 lg:min-h-8 shrink-0 px-3 text-xs"
              onClick={() => navigate('/pos')}
            >
              Xử lý <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        );
      })}

      {alerts.pendingPaymentEdits.map((item) => (
        <div
          key={`edit-${item.orderId}`}
          className="flex items-center justify-between gap-3 rounded-xl border border-sky-300 bg-sky-50/90 px-3.5 py-2.5 shadow-sm dark:border-sky-800/80 dark:bg-sky-950/40"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <CreditCard className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold leading-snug text-foreground break-words">
                  Yêu cầu đổi PTTT · {item.tableLabel}
                </span>
                <Badge variant="info" className="px-1.5 py-0 text-[10px]">
                  {item.currentMethod ?? 'N/A'} → {item.requestedMethod}
                </Badge>
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground break-words">
                {item.orderCode} ({formatVnd(item.totalAmount)}) · Gửi bởi {item.requestedByName}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="min-h-10 lg:min-h-8 shrink-0 px-3 text-xs"
            onClick={() => navigate('/invoices')}
          >
            Duyệt <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>
      ))}

      {alerts.nearLimitQrAccounts.map((acc) => {
        const isBlocked = acc.status !== 'AVAILABLE' || (acc.dayPercent ?? 0) >= 100;
        return (
          <div
            key={`qr-limit-${acc.id}`}
            className={cn(
              'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 shadow-sm',
              isBlocked
                ? 'border-rose-300 bg-rose-50/90 dark:border-rose-800/80 dark:bg-rose-950/50'
                : 'border-amber-300 bg-amber-50/90 dark:border-amber-800/80 dark:bg-amber-950/40',
            )}
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <div
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                  isBlocked
                    ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
                )}
              >
                {isBlocked ? <AlertTriangle className="h-4 w-4" /> : <QrCode className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs font-semibold leading-snug text-foreground break-words">
                    {acc.label} ({acc.bankCode})
                  </span>
                  <Badge variant={isBlocked ? 'destructive' : 'warning'} className="px-1.5 py-0 text-[10px]">
                    {acc.dayPercent !== null ? `${acc.dayPercent}% hạn mức` : acc.status}
                  </Badge>
                </div>
                <p className="text-[11px] leading-snug text-muted-foreground break-words">
                  Đã nhận {formatVnd(acc.usedDay)}
                  {acc.dailyLimit ? ` / ${formatVnd(acc.dailyLimit)}` : ''} hôm nay
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="min-h-10 lg:min-h-8 shrink-0 px-3 text-xs"
              onClick={() => navigate('/payment-qr')}
            >
              Tài khoản <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </section>
  );
}
