import { ShieldAlert } from 'lucide-react';
import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { type PermissionModuleKey } from '@/components/layout/command-palette';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/auth.store';

export interface RbacRouteGuardProps {
  module?: PermissionModuleKey;
  requireSuperAdmin?: boolean;
  children: React.ReactNode;
}

export function RbacRouteGuard({
  module,
  requireSuperAdmin = false,
  children,
}: RbacRouteGuardProps) {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const navigate = useNavigate();

  // HARD INVARIANT 8:
  // Chưa đăng nhập (thiếu token/user) -> chuyển hướng về /login (401)
  if (!accessToken || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Đã đăng nhập nhưng thiếu quyền RBAC -> Hiển thị 403 Forbidden tại chỗ, TUYỆT ĐỐI KHÔNG đá ra /login
  const isAllowed =
    user.isSuperAdmin ||
    (!requireSuperAdmin && (!module || Boolean(user.permissions?.[module]?.view)));

  if (!isAllowed) {
    return (
      <div
        data-testid="rbac-forbidden-screen"
        className="flex min-h-[60vh] flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card p-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">
            403 — Không đủ quyền truy cập
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Tài khoản <span className="font-semibold text-foreground">@{user.username}</span>{' '}
            không được cấp quyền xem màn hình này. Vui lòng liên hệ Quản lý hoặc Chủ quán.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/profile')}>
          Quay về Hồ sơ cá nhân
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
