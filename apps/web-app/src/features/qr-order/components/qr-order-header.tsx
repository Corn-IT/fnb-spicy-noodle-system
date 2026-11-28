import type { OrderStatus, PublicMenuActiveOrder } from '@fnb/shared';
import { AlertTriangle, CheckCircle2, RefreshCw, ShoppingBag, X } from 'lucide-react';

import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppMessages } from '@/hooks/use-app-messages';
import { cn } from '@/utils/cn';
import type { QrEndedState, QrEphemeralNotice } from '../hooks/use-qr-session-socket';

interface QrOrderHeaderProps {
  qrLogoUrl: string | null | undefined;
  qrStoreName: string;
  qrSubtitle: string | undefined;
  resolvedTableName: string;
  welcomeMessage: string | undefined;
  isTakeaway: boolean;
  isReconnecting: boolean;
  ephemeralNotices: QrEphemeralNotice[];
  endedState: QrEndedState | null;
  addonAutoCancelNotice: string | null;
  activeOrder: PublicMenuActiveOrder | null;
  activeOrderId: number | null;
  orderStatus: OrderStatus | null;
  onDismissEphemeralNotice: (id: string) => void;
  onStartNewOrderSession: () => void;
  onDismissAddonAutoCancelNotice: () => void;
}

/** Sticky header displaying store branding, table/takeaway banner, and realtime status notices. */
export function QrOrderHeader({
  qrLogoUrl,
  qrStoreName,
  qrSubtitle,
  resolvedTableName,
  welcomeMessage,
  isTakeaway,
  isReconnecting,
  ephemeralNotices,
  endedState,
  addonAutoCancelNotice,
  activeOrder,
  activeOrderId,
  orderStatus,
  onDismissEphemeralNotice,
  onStartNewOrderSession,
  onDismissAddonAutoCancelNotice,
}: QrOrderHeaderProps) {
  const { resolveMessage } = useAppMessages();

  return (
    <header className="sticky top-0 z-30 border-b bg-card/95 px-3 sm:px-4 py-2.5 sm:py-3 shadow-xs backdrop-blur-md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <StoreBrandLogo
            src={qrLogoUrl}
            storeName={qrStoreName}
            testId="qr-brand-logo"
            className="h-10 w-10 shrink-0 rounded-xl shadow-xs"
            fallbackClassName="text-sm"
          />
          <div className="min-w-0">
            <h1 className="text-sm sm:text-base font-bold leading-snug text-foreground break-words">
              {qrStoreName}
            </h1>
            {qrSubtitle ? (
              <p className="text-xs font-medium leading-snug text-muted-foreground break-words">
                {qrSubtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge
            data-testid="qr-table-header"
            className="h-8 px-3.5 py-0 rounded-lg bg-primary text-xs sm:text-sm font-bold text-primary-foreground shadow-xs"
          >
            {resolvedTableName}
          </Badge>
        </div>
      </div>

      {welcomeMessage ? (
        <p
          data-testid="qr-welcome-message"
          className="mt-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs font-medium text-foreground"
        >
          {welcomeMessage}
        </p>
      ) : null}

      {!isTakeaway ? (
        <div
          data-testid="qr-table-transfer-warning"
          className="mt-2.5 flex items-center gap-2 rounded-lg border-2 border-amber-500 bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-950 dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-100 shadow-xs animate-pulse"
        >
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
          </span>
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>{resolveMessage('qr.banner.tableMoveNotice').title}</span>
        </div>
      ) : (
        <div
          data-testid="qr-takeaway-mode-banner"
          className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-900 dark:border-sky-400/40 dark:bg-sky-950/60 dark:text-sky-100"
        >
          <span className="flex items-center gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
            Đặt món Mang về — Quầy sẽ gọi theo số thứ tự khi đơn sẵn sàng
          </span>
        </div>
      )}

      {isReconnecting ? (
        <div
          data-testid="qr-reconnecting-indicator"
          role="status"
          aria-live="polite"
          className="mt-2.5 flex items-center gap-2 rounded-lg border border-amber-500/50 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-100"
        >
          <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-amber-600 dark:text-amber-400" />
          <span>{resolveMessage('qr.notice.reconnecting').title}</span>
        </div>
      ) : null}

      {ephemeralNotices.length > 0 ? (
        <div
          data-testid="qr-realtime-notice-stack"
          aria-live="polite"
          className="mt-2.5 space-y-1.5"
        >
          {ephemeralNotices.map((notice) => (
            <div
              key={notice.id}
              data-testid="qr-realtime-notice"
              role="status"
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border pl-3 pr-1 py-1 text-xs font-semibold',
                notice.variant === 'warning'
                  ? 'border-amber-500/50 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/70 dark:text-amber-100'
                  : notice.variant === 'success'
                    ? 'border-emerald-500/50 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/70 dark:text-emerald-100'
                    : 'border-sky-500/50 bg-sky-50 text-sky-950 dark:border-sky-500/40 dark:bg-sky-950/70 dark:text-sky-100',
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{notice.title}</span>
              </div>
              <button
                type="button"
                data-testid="qr-realtime-notice-dismiss"
                onClick={() => onDismissEphemeralNotice(notice.id)}
                aria-label="Đóng thông báo"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 touch-manipulation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {endedState ? (
        <div
          data-testid="qr-status-banner"
          role={endedState.kind === 'VOIDED' ? 'alert' : 'status'}
          aria-live={endedState.kind === 'VOIDED' ? 'assertive' : 'polite'}
          className={cn(
            'mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs font-semibold',
            endedState.kind === 'VOIDED'
              ? 'border-red-500/60 bg-red-50 text-red-950 dark:border-red-500/40 dark:bg-red-950/70 dark:text-red-100'
              : 'border-emerald-500/50 bg-emerald-50 text-emerald-950 dark:border-emerald-500/40 dark:bg-emerald-950/70 dark:text-emerald-100',
          )}
        >
          <div className="flex items-start gap-2 min-w-0 flex-1">
            <CheckCircle2
              className={cn(
                'h-4 w-4 shrink-0 mt-0.5',
                endedState.kind === 'VOIDED'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-emerald-600 dark:text-emerald-400',
              )}
            />
            <div className="min-w-0 space-y-0.5">
              <p className="break-words">
                {endedState.title} ({endedState.kind === 'PAID' ? 'Đã thanh toán' : 'Đã huỷ'})
              </p>
              {endedState.reason ? (
                <p className="text-[11px] font-medium opacity-90 break-words">
                  Lý do: {endedState.reason}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            data-testid="qr-new-order-btn"
            onClick={onStartNewOrderSession}
            className="h-11 px-3 rounded-lg bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 shrink-0"
          >
            Gọi đơn mới
          </Button>
        </div>
      ) : addonAutoCancelNotice ? (
        <div
          data-testid="qr-status-banner"
          role="alert"
          aria-live="assertive"
          className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-red-500/60 bg-red-50 pl-3 pr-1 py-1 text-xs font-semibold text-red-950 dark:border-red-500/40 dark:bg-red-950/70 dark:text-red-100"
        >
          <span className="break-words">{addonAutoCancelNotice}</span>
          <button
            type="button"
            data-testid="qr-status-dismiss-btn"
            onClick={onDismissAddonAutoCancelNotice}
            aria-label="Đóng thông báo"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/10 touch-manipulation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (activeOrder && (orderStatus === 'PENDING' || activeOrder.status === 'PENDING')) ||
        (activeOrderId !== null && orderStatus === 'PENDING') ? (
        <div
          data-testid="qr-status-banner"
          role="status"
          aria-live="polite"
          className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-sky-500/50 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-950 dark:border-sky-500/40 dark:bg-sky-950/70 dark:text-sky-100"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
            <span>{resolveMessage('qr.status.orderPending').title} (Mới gọi món)</span>
          </div>
        </div>
      ) : null}
    </header>
  );
}
