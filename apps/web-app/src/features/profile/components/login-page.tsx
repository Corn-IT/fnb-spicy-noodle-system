import {
  ActiveSessionConflictDetailsSchema,
  type ActiveSessionConflictDetails,
  ErrorCodes,
  LoginRequestSchema,
  resolveHttpErrorDefinition,
  StoreAssetKind,
} from '@fnb/shared';
import { AlertCircle, Clock, Lock, Moon, ShieldAlert, Sun, User, X } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { StoreBrandLogo } from '@/components/store-brand-logo';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useLoginMutation } from '@/features/profile/api/auth.api';
import { buildStoreAssetUrl, useStoreSettings } from '@/hooks/use-store-settings';
import { ApiClientError } from '@/lib/api-client';
import { resolveEffectiveTheme } from '@/providers/theme-provider';
import { type AuthNoticeReason, useAuthStore } from '@/stores/auth.store';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';
import { cn } from '@/utils/cn';

function formatKickTimestamp(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

export function LoginPage() {
  const { notify } = useAppMessages();
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const { settings } = useStoreSettings();
  const logoUrl = buildStoreAssetUrl(StoreAssetKind.LOGO, settings.assets.logo);
  const storedTheme = useUiPreferencesStore((state) => state.theme);
  const hasExplicitTheme = useUiPreferencesStore((state) => state.hasExplicitTheme);
  const theme = resolveEffectiveTheme(storedTheme, hasExplicitTheme, settings.defaultTheme);
  const setTheme = useUiPreferencesStore((state) => state.setTheme);

  React.useEffect(() => {
    document.title = `Đăng nhập · ${settings.storeName}`;
  }, [settings.storeName]);

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = React.useState<{
    details: ActiveSessionConflictDetails;
    username: string;
    password: string;
  } | null>(null);
  const currentUser = useAuthStore((state) => state.user);
  const currentAccessToken = useAuthStore((state) => state.accessToken);
  const storeAuthNotice = useAuthStore((state) => state.authNotice);
  const authNoticeMeta = useAuthStore((state) => state.authNoticeMeta);
  const clearAuthNotice = useAuthStore((state) => state.clearAuthNotice);
  const navAuthNotice = (
    location.state as { authNotice?: AuthNoticeReason; from?: { pathname?: unknown } } | null | undefined
  )?.authNotice;
  const activeAuthNotice = navAuthNotice ?? storeAuthNotice;
  const [noticeDismissed, setNoticeDismissed] = React.useState(false);

  const auth401Def = resolveHttpErrorDefinition({ statusCode: 401 });
  const requestedPathForNotice = (
    location.state as { from?: { pathname?: unknown } } | null | undefined
  )?.from?.pathname;

  const safeDestination = React.useMemo(() => {
    const requestedDestination = (
      location.state as
        | { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }
        | null
        | undefined
    )?.from;
    const pathname = requestedDestination?.pathname;
    const search = requestedDestination?.search;
    const hash = requestedDestination?.hash;
    return typeof pathname === 'string' &&
      pathname.startsWith('/') &&
      !pathname.startsWith('//') &&
      pathname !== '/login'
      ? `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`
      : '/pos';
  }, [location.state]);

  // Nếu cùng trình duyệt đã có phiên đăng nhập sống và mở lại /login, tự điều hướng về POS để tránh tự đá chính mình.
  React.useEffect(() => {
    if (currentUser && currentAccessToken && !activeAuthNotice) {
      navigate(safeDestination, { replace: true });
    }
  }, [currentUser, currentAccessToken, activeAuthNotice, navigate, safeDestination]);

  const executeLogin = async (payload: { username: string; password: string; force?: boolean }) => {
    setFormError(null);
    try {
      await loginMutation.mutateAsync(payload);
      setPendingConflict(null);
      setPassword('');
      notify('profile.loginSuccess', {
        variant: 'success',
        vars: { username: payload.username },
      });
      navigate(safeDestination, { replace: true });
    } catch (err) {
      if (!payload.force && err instanceof ApiClientError && err.code === ErrorCodes.AUTH_SESSION_CONFLICT_ONLINE) {
        const parsedDetails = ActiveSessionConflictDetailsSchema.safeParse(err.details);
        setPendingConflict({
          details: parsedDetails.success ? parsedDetails.data : { username: payload.username },
          username: payload.username,
          password: payload.password,
        });
        return;
      }

      setPendingConflict(null);
      setFormError(
        err instanceof Error
          ? err.message
          : 'Tên đăng nhập hoặc mật khẩu không chính xác',
      );
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const parsed = LoginRequestSchema.safeParse({ username, password });
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      setFormError(
        firstIssue?.message ||
          'Vui lòng nhập tên đăng nhập và mật khẩu tối thiểu 6 ký tự',
      );
      return;
    }

    await executeLogin(parsed.data);
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-primary/5 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-primary/10">
      <div className="relative w-full max-w-md rounded-2xl border bg-card/95 p-8 shadow-2xl backdrop-blur-md">
        <div className="absolute right-4 top-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid="login-theme-toggle"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Chuyển chế độ Sáng/Tối"
            title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            className="h-11 w-11 lg:h-9 lg:w-9 rounded-lg"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </Button>
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <StoreBrandLogo
            src={logoUrl}
            storeName={settings.storeName}
            testId="login-brand-logo"
            className="mb-3 h-14 w-14 rounded-xl shadow-md"
            fallbackClassName="text-lg"
          />
          <h1 className="text-2xl font-bold tracking-tight">
            {settings.storeName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {settings.description || 'Đăng nhập vào hệ thống Bán hàng & Quản trị Vận hành'}
          </p>
        </div>

        {activeAuthNotice && !noticeDismissed ? (
          (() => {
            const isSecurityKick =
              activeAuthNotice === 'SESSION_REPLACED' || activeAuthNotice === 'SESSION_REVOKED';
            const kickedTime = formatKickTimestamp(authNoticeMeta?.at);

            const noticeTitle =
              activeAuthNotice === 'SESSION_REPLACED'
                ? '401 — Phiên làm việc đã kết thúc do có đăng nhập mới'
                : activeAuthNotice === 'SESSION_REVOKED'
                  ? authNoticeMeta?.reason === 'PASSWORD_CHANGED'
                    ? '401 — Mật khẩu vừa được thay đổi'
                    : authNoticeMeta?.reason === 'ACCOUNT_DISABLED'
                      ? '401 — Tài khoản vừa bị tạm khoá'
                      : '401 — Phiên đăng nhập đã bị Quản trị viên thu hồi'
                  : activeAuthNotice === 'SESSION_EXPIRED'
                    ? '401 — Phiên đăng nhập đã hết hạn hoặc bị thu hồi'
                    : '401 — Yêu cầu đăng nhập để tiếp tục';

            const noticeDescription =
              activeAuthNotice === 'SESSION_REPLACED'
                ? `Tài khoản này vừa được đăng nhập ở một trình duyệt hoặc thiết bị khác${kickedTime ? ` lúc ${kickedTime}` : ''}. Mỗi tài khoản chỉ được hoạt động trên 1 trình duyệt; nếu không phải bạn thao tác, hãy báo Quản lý kiểm tra lịch sử và đổi mật khẩu ngay.`
                : activeAuthNotice === 'SESSION_REVOKED'
                  ? authNoticeMeta?.reason === 'PASSWORD_CHANGED'
                    ? `Mật khẩu tài khoản vừa được cập nhật${kickedTime ? ` lúc ${kickedTime}` : ''}. Vui lòng đăng nhập lại bằng mật khẩu mới.`
                    : authNoticeMeta?.reason === 'ACCOUNT_DISABLED'
                      ? `Tài khoản hiện đang tạm ngưng hoạt động${kickedTime ? ` (từ lúc ${kickedTime})` : ''}. Vui lòng liên hệ Quản lý để được kiểm tra.`
                      : `Phiên làm việc trên máy này đã bị Quản trị viên chấm dứt từ xa${kickedTime ? ` lúc ${kickedTime}` : ''}. Vui lòng đăng nhập lại hoặc liên hệ Quản lý.`
                  : activeAuthNotice === 'SESSION_EXPIRED'
                    ? auth401Def.defaultDescription
                    : `Bạn cần đăng nhập tài khoản nhân viên trước khi mở ${typeof requestedPathForNotice === 'string' && requestedPathForNotice.startsWith('/') ? requestedPathForNotice : 'trang nội bộ'}. Đăng nhập xong hệ thống sẽ tự chuyển lại.`;

            return (
              <div
                role="status"
                data-testid="login-401-notice"
                className={cn(
                  'mb-5 flex items-start gap-2.5 rounded-xl border p-3 text-left text-xs',
                  isSecurityKick
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-900 dark:text-rose-200'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
                )}
              >
                <AlertCircle
                  className={cn(
                    'mt-0.5 h-4 w-4 shrink-0',
                    isSecurityKick
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                />
                <div className="flex-1 space-y-0.5 leading-relaxed">
                  <div className="font-bold">{noticeTitle}</div>
                  <p
                    className={cn(
                      isSecurityKick
                        ? 'text-rose-800/90 dark:text-rose-200/90'
                        : 'text-amber-800/90 dark:text-amber-200/90',
                    )}
                  >
                    {noticeDescription}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Đóng thông báo"
                  onClick={() => {
                    setNoticeDismissed(true);
                    clearAuthNotice();
                  }}
                  className={cn(
                    'rounded p-0.5',
                    isSecurityKick
                      ? 'text-rose-700 hover:bg-rose-500/20 dark:text-rose-300'
                      : 'text-amber-700 hover:bg-amber-500/20 dark:text-amber-300',
                  )}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })()
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label
              htmlFor="login-username"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Tên đăng nhập
            </label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="login-username"
                name="username"
                autoComplete="username"
                placeholder="VD: superadmin, admin, thungan..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9 h-11 lg:h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="login-password"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Mật khẩu
            </label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              toggleTestId="toggle-login-password"
            />
          </div>

          {formError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
            >
              {formError}
            </div>
          ) : null}

          <Button
            type="submit"
            className="w-full h-11 lg:h-10"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Đang xác thực...' : 'Đăng nhập Quầy POS'}
          </Button>
        </form>
      </div>

      <Dialog
        open={Boolean(pendingConflict)}
        onOpenChange={(open) => {
          if (!open && !loginMutation.isPending) {
            setPendingConflict(null);
          }
        }}
      >
        <DialogContent data-testid="login-session-conflict-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <ShieldAlert className="h-5 w-5 shrink-0" />
              <span>Tài khoản đang hoạt động ở nơi khác</span>
            </DialogTitle>
            <DialogDescription>
              Tài khoản <span className="font-semibold text-foreground">@{pendingConflict?.details.username}</span>{' '}
              hiện đang mở kết nối trực tuyến trên một trình duyệt hoặc thiết bị khác.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-sm">
            {pendingConflict?.details.startedAt ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-muted/40 p-3 text-xs">
                <span className="inline-flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  <span>Thời điểm đăng nhập phiên hiện tại:</span>
                </span>
                <span className="font-medium text-foreground tabular-nums">
                  {formatKickTimestamp(pendingConflict.details.startedAt)}
                </span>
              </div>
            ) : null}

            <p className="text-xs leading-relaxed text-muted-foreground">
              Mỗi tài khoản chỉ được hoạt động trên 1 trình duyệt tại một thời điểm để bảo đảm
              trách nhiệm thao tác. Nếu bạn tiếp tục, phiên đang mở ở nơi kia sẽ tự động đăng xuất ngay lập tức.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:flex-wrap sm:space-x-0">
            <Button
              type="button"
              variant="outline"
              disabled={loginMutation.isPending}
              data-testid="cancel-force-login-btn"
              onClick={() => setPendingConflict(null)}
            >
              Huỷ, giữ nguyên máy kia
            </Button>
            <Button
              type="button"
              variant="destructive"
              data-testid="confirm-force-login-btn"
              disabled={loginMutation.isPending}
              onClick={() => {
                if (!pendingConflict) return;
                void executeLogin({
                  username: pendingConflict.username,
                  password: pendingConflict.password,
                  force: true,
                });
              }}
            >
              {loginMutation.isPending ? 'Đang chuyển phiên...' : 'Đăng xuất máy kia & Vào hệ thống'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
