import { LoginRequestSchema } from '@fnb/shared';
import { Flame, Lock, Moon, Sun, User } from 'lucide-react';
import * as React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/components/ui/toast';
import { useLoginMutation } from '@/features/profile/api/auth.api';
import { useUiPreferencesStore } from '@/stores/ui-preferences.store';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const loginMutation = useLoginMutation();
  const theme = useUiPreferencesStore((state) => state.theme);
  const toggleTheme = useUiPreferencesStore((state) => state.toggleTheme);

  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

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

    try {
      await loginMutation.mutateAsync(parsed.data);
      toast({
        variant: 'success',
        title: 'Đăng nhập thành công',
        description: `Xin chào @${parsed.data.username}`,
      });
      const requestedDestination = (
        location.state as
          | { from?: { pathname?: unknown; search?: unknown; hash?: unknown } }
          | null
          | undefined
      )?.from;
      const pathname = requestedDestination?.pathname;
      const search = requestedDestination?.search;
      const hash = requestedDestination?.hash;
      const destination =
        typeof pathname === 'string' &&
        pathname.startsWith('/') &&
        !pathname.startsWith('//') &&
        pathname !== '/login'
          ? `${pathname}${typeof search === 'string' ? search : ''}${typeof hash === 'string' ? hash : ''}`
          : '/pos';
      navigate(destination, { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : 'Tên đăng nhập hoặc mật khẩu không chính xác',
      );
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-gradient-to-br from-slate-100 via-slate-50 to-rose-50/70 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-rose-950/30">
      <div className="relative w-full max-w-md rounded-2xl border bg-card/95 p-8 shadow-2xl backdrop-blur-md">
        <div className="absolute right-4 top-4">
          <Button
            type="button"
            variant="outline"
            size="icon"
            data-testid="login-theme-toggle"
            onClick={toggleTheme}
            aria-label="Chuyển chế độ Sáng/Tối"
            title={theme === 'dark' ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            className="h-9 w-9 rounded-lg"
          >
            {theme === 'dark' ? (
              <Sun className="h-4 w-4 text-amber-400" />
            ) : (
              <Moon className="h-4 w-4 text-slate-700" />
            )}
          </Button>
        </div>

        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
            <Flame className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            MÌ CAY SƠN BẢO — POS
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đăng nhập vào hệ thống Bán hàng & Quản trị Vận hành
          </p>
        </div>

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
                placeholder="VD: superadmin hoặc cashier01"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9"
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
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu (tối thiểu 6 ký tự)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
              />
            </div>
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
            className="w-full"
            disabled={loginMutation.isPending}
          >
            {loginMutation.isPending ? 'Đang xác thực...' : 'Đăng nhập Quầy POS'}
          </Button>
        </form>
      </div>
    </div>
  );
}
