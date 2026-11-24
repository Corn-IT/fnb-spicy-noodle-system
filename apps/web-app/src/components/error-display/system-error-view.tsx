import { type StoreMessagesMap, type SystemErrorCodeKey } from '@fnb/shared';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileQuestion,
  Home,
  Lock,
  LogIn,
  RefreshCw,
  ServerCrash,
  ShieldAlert,
  WifiOff,
  Wrench,
} from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  normalizeClientError,
  resolveStaffHomeDestination,
  type ErrorAudience,
  type NormalizedClientError,
} from '@/components/error-display/error-resolver';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useStoreSettings } from '@/hooks/use-store-settings';
import { useAuthStore } from '@/stores/auth.store';
import { cn } from '@/utils/cn';

export interface SystemErrorViewProps {
  /** 'page': full-viewport screen; 'section': nested inside AppShell; 'guest': mobile QR customer screen */
  variant?: 'page' | 'section' | 'guest';
  error?: unknown;
  statusKeyOverride?: SystemErrorCodeKey;
  titleOverride?: string;
  descriptionOverride?: string;
  recoveryHintOverride?: string;
  customMessages?: StoreMessagesMap | null;
  /** Optional extra contextual text shown below the reason (e.g. @username on 403 RBAC) */
  accountContextNote?: React.ReactNode;
  onRetry?: () => void;
  onBack?: () => void;
  onGoHome?: () => void;
  /** Preview mode disables real browser navigation when rendered inside Gallery Dialog */
  previewMode?: boolean;
  testId?: string;
  className?: string;
}

function getErrorIconAndStyle(err: NormalizedClientError) {
  switch (err.key) {
    case '403':
      return {
        Icon: ShieldAlert,
        iconBg: 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400',
        badgeCls: 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      };
    case '401':
      return {
        Icon: Lock,
        iconBg: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        badgeCls: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300',
      };
    case '404':
      return {
        Icon: FileQuestion,
        iconBg: 'bg-sky-500/12 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400',
        badgeCls: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      };
    case '408':
    case '504':
    case '429':
      return {
        Icon: Clock,
        iconBg: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        badgeCls: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300',
      };
    case 'NETWORK_ERROR':
      return {
        Icon: WifiOff,
        iconBg: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        badgeCls: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300',
      };
    case 'CHUNK_LOAD_ERROR':
      return {
        Icon: RefreshCw,
        iconBg: 'bg-sky-500/12 text-sky-600 dark:bg-sky-500/20 dark:text-sky-400',
        badgeCls: 'border-sky-500/35 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      };
    case '502':
    case '503':
      return {
        Icon: Wrench,
        iconBg: 'bg-orange-500/15 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300',
        badgeCls: 'border-orange-500/35 bg-orange-500/10 text-orange-800 dark:text-orange-300',
      };
    case '500':
    case 'RUNTIME_CRASH':
      return {
        Icon: ServerCrash,
        iconBg: 'bg-rose-500/12 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400',
        badgeCls: 'border-rose-500/35 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      };
    default:
      return {
        Icon: AlertTriangle,
        iconBg: 'bg-amber-500/15 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
        badgeCls: 'border-amber-500/35 bg-amber-500/10 text-amber-800 dark:text-amber-300',
      };
  }
}

export function SystemErrorView({
  variant = 'section',
  error,
  statusKeyOverride,
  titleOverride,
  descriptionOverride,
  recoveryHintOverride,
  customMessages,
  accountContextNote,
  onRetry,
  onBack,
  onGoHome,
  previewMode = false,
  testId = 'system-error-view',
  className,
}: SystemErrorViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const { settings } = useStoreSettings();

  const [showTechDetails, setShowTechDetails] = React.useState(false);
  const [copiedTrace, setCopiedTrace] = React.useState(false);
  const [occurredAt] = React.useState(() => new Date().toLocaleTimeString('vi-VN'));

  const audience: ErrorAudience = variant === 'guest' ? 'guest' : 'staff';
  const normalized = React.useMemo(
    () =>
      normalizeClientError(error, {
        statusKeyOverride,
        titleOverride,
        reasonOverride: descriptionOverride,
        recoveryHintOverride,
        audience,
        customMessages,
        path: `${location.pathname}${location.search}`,
      }),
    [
      audience,
      customMessages,
      descriptionOverride,
      error,
      location.pathname,
      location.search,
      recoveryHintOverride,
      statusKeyOverride,
      titleOverride,
    ],
  );

  const staffHome = React.useMemo(
    () => resolveStaffHomeDestination(user, settings),
    [user, settings],
  );
  const { Icon, iconBg, badgeCls } = getErrorIconAndStyle(normalized);

  const handleBack = () => {
    if (previewMode) return;
    if (onBack) {
      onBack();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      navigate(-1);
    } else {
      navigate(staffHome.path);
    }
  };

  const handleGoHome = () => {
    if (previewMode) return;
    if (onGoHome) {
      onGoHome();
      return;
    }
    if (normalized.key === '401' || !user) {
      navigate('/login', { state: { from: location } });
      return;
    }
    navigate(staffHome.path);
  };

  const handleRetry = () => {
    if (previewMode) return;
    if (onRetry) {
      onRetry();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  const handleCopyTrace = () => {
    const traceSummary = [
      `Mã lỗi: ${normalized.statusLabel}`,
      normalized.errorCode ? `ErrorCode: ${normalized.errorCode}` : null,
      normalized.requestId ? `RequestId: ${normalized.requestId}` : null,
      normalized.path ? `Path: ${normalized.path}` : null,
      `Time: ${occurredAt}`,
    ]
      .filter(Boolean)
      .join(' | ');

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(traceSummary);
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2500);
    }
  };

  const wrapperCls =
    variant === 'page'
      ? 'flex min-h-screen w-full items-center justify-center bg-background p-4 sm:p-6 text-foreground'
      : variant === 'guest'
        ? 'mx-auto flex min-h-screen w-full max-w-md items-center justify-center bg-background p-4 text-foreground'
        : 'flex min-h-[60vh] w-full items-center justify-center p-3 sm:p-6';

  const cardWidthCls = variant === 'guest' ? 'max-w-md' : 'max-w-xl';

  return (
    <div data-testid={testId} data-error-key={normalized.key} className={cn(wrapperCls, className)}>
      <div
        className={cn(
          'w-full rounded-2xl border bg-card p-5 sm:p-7 shadow-sm space-y-4 text-left',
          cardWidthCls,
        )}
      >
        {/* Header: Icon + Status Badge + Title */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className={cn('flex h-14 w-14 items-center justify-center rounded-2xl', iconBg)}>
            <Icon className="h-7 w-7" />
          </div>
          <Badge
            variant="outline"
            data-testid="error-status-badge"
            className={cn('px-2.5 py-0.5 font-mono text-xs font-bold tracking-wide', badgeCls)}
          >
            {normalized.statusLabel}
          </Badge>
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
            {normalized.title}
          </h1>
          {accountContextNote ? (
            <div className="text-xs sm:text-sm text-muted-foreground">{accountContextNote}</div>
          ) : null}
        </div>

        {/* Layer 1: Reason & Actionable Recovery */}
        <div className="space-y-2.5 rounded-xl border bg-muted/40 p-3.5 sm:p-4 text-xs sm:text-sm">
          <div>
            <div className="font-semibold text-foreground mb-0.5">Vì sao lỗi này xảy ra?</div>
            <p className="text-muted-foreground leading-relaxed">{normalized.reason}</p>
          </div>

          {normalized.fieldErrors.length > 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 space-y-1 text-xs">
              <div className="font-semibold text-amber-900 dark:text-amber-200">
                Chi tiết dữ liệu chưa hợp lệ:
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-amber-900/90 dark:text-amber-200/90">
                {normalized.fieldErrors.map((entry) => (
                  <li key={entry.field}>
                    <span className="font-mono font-semibold">{entry.field}</span>:{' '}
                    {entry.messages.join(', ')}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="border-t pt-2.5">
            <div className="font-semibold text-foreground mb-0.5">Hướng dẫn xử lý & Quay lại</div>
            <p className="text-muted-foreground leading-relaxed">{normalized.recoveryHint}</p>
          </div>
        </div>

        {/* Action Buttons */}
        {variant === 'guest' ? (
          <div className="flex flex-col gap-2 pt-1">
            <Button
              type="button"
              data-testid="error-retry-btn"
              onClick={handleRetry}
              className="w-full h-11 font-bold gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Tải lại thực đơn
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Nếu vẫn chưa mở được, vui lòng gọi nhân viên quầy hoặc quét lại mã QR đặt trên bàn.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {(onRetry ||
              normalized.key === '500' ||
              normalized.key === '502' ||
              normalized.key === '503' ||
              normalized.key === '504' ||
              normalized.key === '408' ||
              normalized.key === '429' ||
              normalized.key === 'NETWORK_ERROR' ||
              normalized.key === 'CHUNK_LOAD_ERROR' ||
              normalized.key === 'RUNTIME_CRASH') && (
              <Button
                type="button"
                variant={normalized.key === '404' || normalized.key === '403' ? 'outline' : 'default'}
                data-testid="error-retry-btn"
                onClick={handleRetry}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                {normalized.key === 'CHUNK_LOAD_ERROR' ? 'Tải lại trang mới' : 'Thử tải lại'}
              </Button>
            )}

            {normalized.key !== '401' ? (
              <Button
                type="button"
                variant="outline"
                data-testid="error-back-btn"
                onClick={handleBack}
                className="gap-1.5"
              >
                <ArrowLeft className="h-4 w-4" />
                Quay lại trang trước
              </Button>
            ) : null}

            <Button
              type="button"
              variant={
                normalized.key === '404' || normalized.key === '403' || normalized.key === '401'
                  ? 'default'
                  : 'outline'
              }
              data-testid="error-home-btn"
              onClick={handleGoHome}
              className="gap-1.5"
            >
              {normalized.key === '401' || !user ? (
                <>
                  <LogIn className="h-4 w-4" />
                  Đăng nhập lại
                </>
              ) : (
                <>
                  <Home className="h-4 w-4" />
                  Về {staffHome.label}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Layer 2: Collapsible Technical Details (zero stack trace leak) */}
        <div className="border-t pt-3">
          <button
            type="button"
            data-testid="error-tech-details-toggle"
            onClick={() => setShowTechDetails((prev) => !prev)}
            className="flex min-h-10 xl:min-h-8 w-full items-center justify-between py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Chi tiết kỹ thuật (dành cho tra cứu sự cố)</span>
            {showTechDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showTechDetails ? (
            <div
              data-testid="error-tech-details-panel"
              className="mt-2.5 space-y-2 rounded-lg border bg-muted/30 p-3 text-xs font-mono text-muted-foreground"
            >
              <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 break-all">
                <span>Mã trạng thái:</span>
                <span className="text-foreground font-semibold">{normalized.statusLabel}</span>
                <span>Mã hệ thống:</span>
                <span className="text-foreground">{normalized.errorCode ?? normalized.key}</span>
                <span>Request ID:</span>
                <span className="text-foreground">{normalized.requestId ?? 'Không có (Lỗi client/proxy)'}</span>
                <span>Đường dẫn:</span>
                <span className="text-foreground">{normalized.path ?? '/'}</span>
                <span>Thời điểm:</span>
                <span className="text-foreground">{occurredAt}</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1 border-t font-sans">
                <span className="text-[11px] text-muted-foreground">
                  Stack trace & thông tin máy chủ nội bộ đã được ẩn để bảo mật.
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="error-copy-trace-btn"
                  onClick={handleCopyTrace}
                  className="h-7 px-2 text-xs gap-1 shrink-0"
                >
                  {copiedTrace ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                  {copiedTrace ? 'Đã chép' : 'Sao chép mã'}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
