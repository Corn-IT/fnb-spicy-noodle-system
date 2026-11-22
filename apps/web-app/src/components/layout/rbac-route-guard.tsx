import * as React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { SystemErrorView } from '@/components/error-display';
import { type PermissionModuleKey } from '@/components/layout/command-palette';
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
  const authNotice = useAuthStore((state) => state.authNotice);
  const location = useLocation();

  // HARD INVARIANT 8:
  // Chưa đăng nhập (thiếu user session) -> chuyển hướng về /login (401).
  // Lưu ý: accessToken chỉ lưu trên RAM (không lưu localStorage để chống XSS);
  // khi F5 còn user trong store, apiClient sẽ tự động làm mới accessToken qua HttpOnly Cookie.
  if (!user && !accessToken) {
    const resolvedNotice =
      authNotice ?? (location.pathname !== '/' ? 'UNAUTHENTICATED' : undefined);
    return (
      <Navigate
        to="/login"
        state={{ from: location, ...(resolvedNotice ? { authNotice: resolvedNotice } : {}) }}
        replace
      />
    );
  }
  if (!user) {
    const resolvedNotice =
      authNotice ?? (location.pathname !== '/' ? 'UNAUTHENTICATED' : undefined);
    return (
      <Navigate
        to="/login"
        state={{ from: location, ...(resolvedNotice ? { authNotice: resolvedNotice } : {}) }}
        replace
      />
    );
  }

  // Đã đăng nhập nhưng thiếu quyền RBAC -> Hiển thị 403 Forbidden tại chỗ, TUYỆT ĐỐI KHÔNG đá ra /login
  const isAllowed =
    user.isSuperAdmin ||
    (!requireSuperAdmin && (!module || Boolean(user.permissions?.[module]?.view)));

  if (!isAllowed) {
    return (
      <SystemErrorView
        variant="section"
        statusKeyOverride="403"
        testId="rbac-forbidden-screen"
        accountContextNote={
          <>
            Tài khoản <span className="font-semibold text-foreground">@{user.username}</span>{' '}
            không được cấp quyền xem màn hình này. Vui lòng liên hệ Quản lý hoặc Chủ quán.
          </>
        }
      />
    );
  }

  return <>{children}</>;
}
