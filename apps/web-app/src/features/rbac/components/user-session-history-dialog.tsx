import type { SessionHistoryEventType, UserSessionHistoryItem } from '@fnb/shared';
import {
  Clock,
  ExternalLink,
  History,
  KeyRound,
  Laptop,
  Lock,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Unlock,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

import { type UserRecord, useUserSessionHistoryQuery } from '../api/rbac.api';

interface EventVisualConfig {
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const EVENT_VISUAL_MAP: Record<SessionHistoryEventType, EventVisualConfig> = {
  LOGIN: {
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Icon: LogIn,
  },
  LOGIN_FAILED: {
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldAlert,
  },
  LOGOUT: {
    badgeClass: 'border-slate-500/35 bg-slate-500/10 text-slate-700 dark:text-slate-300',
    Icon: LogOut,
  },
  SESSION_REPLACED: {
    badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    Icon: ShieldAlert,
  },
  ADMIN_REVOKED: {
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: ShieldAlert,
  },
  PASSWORD_CHANGED: {
    badgeClass: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    Icon: KeyRound,
  },
  PASSWORD_RESET: {
    badgeClass: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
    Icon: KeyRound,
  },
  ACCOUNT_LOCKED: {
    badgeClass: 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300',
    Icon: Lock,
  },
  ACCOUNT_UNLOCKED: {
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    Icon: Unlock,
  },
};

function formatEventTimestamp(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function renderSessionDetails(item: UserSessionHistoryItem) {
  if (item.eventType === 'LOGIN_FAILED') {
    const isLockedAttempt = item.summary.includes('Tài khoản đang bị khoá');
    return (
      <div className="mt-1.5 rounded-md border border-rose-500/25 bg-rose-500/5 px-2.5 py-1 text-[11px] text-rose-700 dark:text-rose-300">
        {isLockedAttempt ? 'Lý do: Tài khoản đang bị khoá cố đăng nhập' : 'Lý do: Nhập sai mật khẩu đăng nhập'}
      </div>
    );
  }

  const hasPrev = Boolean(item.previousDevice || item.previousIp);
  if (item.eventType === 'SESSION_REPLACED' && hasPrev) {
    return (
      <div className="mt-1.5 rounded-md border border-amber-500/25 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-800 dark:text-amber-200">
        Phiên cũ bị đá: <span className="font-medium">{item.previousDevice ?? 'Thiết bị trước'}</span>{' '}
        · IP: <span className="font-mono font-medium">{item.previousIp ?? '—'}</span>
      </div>
    );
  }

  const isAdminInitiated =
    item.eventType === 'ADMIN_REVOKED' ||
    item.eventType === 'PASSWORD_RESET' ||
    item.eventType === 'ACCOUNT_LOCKED' ||
    item.eventType === 'ACCOUNT_UNLOCKED';

  if (isAdminInitiated) {
    return (
      <div className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
        {item.actorUsername ? (
          <div>
            Thực hiện bởi:{' '}
            <span className="font-medium text-foreground">
              {item.actorFullName ? `${item.actorFullName} ` : ''}(@{item.actorUsername})
            </span>
          </div>
        ) : null}
        {hasPrev ? (
          <div className="rounded-md border border-rose-500/25 bg-rose-500/5 px-2.5 py-1 text-rose-700 dark:text-rose-300">
            Phiên bị ngắt: <span className="font-medium">{item.previousDevice ?? 'Thiết bị trước'}</span>{' '}
            · IP: <span className="font-mono font-medium">{item.previousIp ?? '—'}</span>
          </div>
        ) : null}
      </div>
    );
  }

  return null;
}

export interface UserSessionHistoryDialogProps {
  user: UserRecord | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestRevokeSession: (user: UserRecord) => void;
  onOpenFullAuditLog: (user: UserRecord) => void;
}

/** SuperAdmin-only dialog showing the active session summary and the latest 5 session/security audit events. */
export function UserSessionHistoryDialog({
  user,
  open,
  onOpenChange,
  onRequestRevokeSession,
  onOpenFullAuditLog,
}: UserSessionHistoryDialogProps) {
  const historyQuery = useUserSessionHistoryQuery(user?.id ?? null, open && Boolean(user), 5);
  const currentSession = historyQuery.data?.currentSession ?? user?.session;
  const items = historyQuery.data?.items ?? [];
  const targetMeta = historyQuery.data?.user;

  const isActiveSession = Boolean(currentSession?.isActiveSession);
  const isSocketOnline = Boolean(isActiveSession && currentSession?.isSocketOnline);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl" data-testid="user-session-history-dialog">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <History className="h-5 w-5 shrink-0 text-accent-text" />
            <span>Lịch sử phiên đăng nhập</span>
            {user ? (
              <span className="font-mono text-sm font-medium text-muted-foreground">
                @{targetMeta?.username ?? user.username}
              </span>
            ) : null}
          </DialogTitle>
          <DialogDescription>
            {targetMeta?.fullName ?? user?.employee?.fullName ?? 'Tài khoản'} ·{' '}
            {(targetMeta?.isSuperAdmin ?? user?.isSuperAdmin) ? 'Super Admin' : 'Nhân viên'} — 5 sự kiện phiên & bảo mật gần nhất.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div
            data-testid="session-history-current-card"
            className="rounded-xl border bg-muted/30 p-3.5 space-y-2.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span
                  className={cn(
                    'h-2.5 w-2.5 rounded-full shrink-0',
                    isSocketOnline
                      ? 'bg-emerald-500'
                      : isActiveSession
                        ? 'bg-amber-500'
                        : 'bg-slate-400 dark:bg-slate-600',
                  )}
                />
                <span>
                  Phiên hiện tại:{' '}
                  <span
                    className={cn(
                      isSocketOnline
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : isActiveSession
                          ? 'text-amber-700 dark:text-amber-300'
                          : 'text-muted-foreground',
                    )}
                  >
                    {isSocketOnline
                      ? 'Đang trực tuyến'
                      : isActiveSession
                        ? 'Có phiên (chờ kết nối)'
                        : 'Đang ngoại tuyến'}
                  </span>
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={historyQuery.isFetching}
                  onClick={() => void historyQuery.refetch()}
                >
                  <RefreshCw className={cn('h-3.5 w-3.5', historyQuery.isFetching && 'animate-spin')} />
                  <span>Làm mới</span>
                </Button>
                {user && isActiveSession ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="session-history-revoke-btn"
                    className="h-7 px-2.5 text-xs gap-1 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onRequestRevokeSession(user)}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Thu hồi phiên</span>
                  </Button>
                ) : null}
              </div>
            </div>

            {isActiveSession ? (
              <div className="grid grid-cols-1 gap-2 rounded-lg border bg-background/80 p-2.5 text-xs sm:grid-cols-3">
                <div>
                  <div className="text-[11px] text-muted-foreground">Thiết bị</div>
                  <div className="mt-0.5 font-medium text-foreground">
                    {currentSession?.deviceLabel ?? 'Chưa xác định'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Địa chỉ IP</div>
                  <div className="mt-0.5 font-mono font-medium text-foreground">
                    {currentSession?.ipAddress ?? '—'}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground">Bắt đầu lúc</div>
                  <div className="mt-0.5 font-medium tabular-nums text-foreground">
                    {formatEventTimestamp(currentSession?.startedAt)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Tài khoản hiện không giữ phiên đăng nhập nào đang mở.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Nhật ký 5 sự kiện gần nhất
            </div>

            {historyQuery.isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((slot) => (
                  <div key={slot} className="h-16 animate-pulse rounded-lg border bg-muted/40" />
                ))}
              </div>
            ) : historyQuery.isError ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"
              >
                <span>Không tải được lịch sử phiên đăng nhập của tài khoản này.</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => void historyQuery.refetch()}
                >
                  Thử lại
                </Button>
              </div>
            ) : items.length === 0 ? (
              <div
                data-testid="session-history-empty"
                className="rounded-lg border border-dashed p-5 text-center text-xs text-muted-foreground"
              >
                Chưa có nhật ký đăng nhập, đăng xuất hoặc thu hồi phiên nào được ghi nhận cho tài khoản này.
              </div>
            ) : (
              <div data-testid="session-history-list" className="space-y-2">
                {items.map((item) => {
                  const visual = EVENT_VISUAL_MAP[item.eventType];
                  const Icon = visual.Icon;
                  return (
                    <div
                      key={item.id}
                      data-testid={`session-history-item-${item.id}`}
                      className="rounded-lg border bg-card p-3 text-xs transition-colors hover:bg-muted/20"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge
                          variant="outline"
                          className={cn('gap-1.5 font-semibold', visual.badgeClass)}
                        >
                          <Icon className="h-3 w-3 shrink-0" />
                          <span>{item.actionLabel}</span>
                        </Badge>

                        <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>{formatEventTimestamp(item.createdAt)}</span>
                        </span>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 text-foreground">
                          <Laptop className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{item.deviceLabel ?? 'Thiết bị chưa rõ'}</span>
                        </span>
                        <span className="font-mono">
                          IP: <span className="font-medium text-foreground">{item.ipAddress ?? '—'}</span>
                        </span>
                      </div>

                      {renderSessionDetails(item)}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:flex-wrap sm:justify-between sm:space-x-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="session-history-open-full-audit-btn"
            className="gap-1.5"
            disabled={!user}
            onClick={() => {
              if (!user) return;
              onOpenChange(false);
              onOpenFullAuditLog(user);
            }}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Xem toàn bộ lịch sử thao tác</span>
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
