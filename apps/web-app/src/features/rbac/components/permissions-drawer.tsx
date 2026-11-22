import { type UserPermissions } from '@fnb/shared';
import { KeyRound } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { PasswordInput } from '@/components/ui/password-input';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useAuthStore } from '@/stores/auth.store';

import {
  type UserRecord,
  useResetUserPasswordMutation,
  useUpdatePermissionsMutation,
} from '../api/rbac.api';
import { PermissionMatrixChecklist } from './permission-modules';

export interface PermissionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
}

export function PermissionsDrawer({ open, onOpenChange, user }: PermissionsDrawerProps) {
  const { notify } = useAppMessages();
  const currentUser = useAuthStore((s) => s.user);
  const [draft, setDraft] = React.useState<UserPermissions | null>(null);
  const [draftActive, setDraftActive] = React.useState<boolean>(true);
  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const updateMutation = useUpdatePermissionsMutation(user?.id ?? 0);
  const resetPasswordMutation = useResetUserPasswordMutation(user?.id ?? 0);

  React.useEffect(() => {
    if (open && user) {
      setDraft(structuredClone(user.permissions));
      setDraftActive(user.isActive);
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user]);

  if (!user || !draft) return null;

  const isSuperAdmin = user.isSuperAdmin;
  const canEdit = Boolean(currentUser?.isSuperAdmin);
  const isDisabled = isSuperAdmin || !canEdit;

  const togglePermission = (moduleKey: keyof UserPermissions, permKey: string) => {
    if (isDisabled) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const modulePerms = prev[moduleKey] as Record<string, boolean>;
      return {
        ...prev,
        [moduleKey]: {
          ...modulePerms,
          [permKey]: !modulePerms[permKey],
        },
      };
    });
  };

  const handleSave = async () => {
    if (isDisabled || !draft) return;
    try {
      await updateMutation.mutateAsync({
        permissions: draft,
        ...(draftActive !== user.isActive ? { isActive: draftActive } : {}),
      });
      notify('rbac.permissions.updateSuccess', { variant: 'success' });
      onOpenChange(false);
    } catch {
      notify('rbac.permissions.updateError', { variant: 'destructive' });
    }
  };

  const handleResetPassword = async () => {
    if (!canEdit || !user) return;
    if (newPassword.trim().length < 6) {
      notify('rbac.password.tooShort', { variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      notify('rbac.password.mismatch', { variant: 'destructive' });
      return;
    }
    try {
      await resetPasswordMutation.mutateAsync({ newPassword });
      setNewPassword('');
      setConfirmPassword('');
      notify('rbac.password.resetSuccess', {
        variant: 'success',
        vars: { username: user.username },
      });
    } catch {
      notify('rbac.password.resetError', { variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden" data-testid="permissions-drawer">
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>
            Phân quyền: {user.employee?.fullName ?? user.username}
          </SheetTitle>
          <SheetDescription>
            {isSuperAdmin
              ? 'Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền.'
              : canEdit
                ? 'Cấu hình trạng thái kích hoạt, mật khẩu và ma trận quyền trên từng module.'
                : 'Chế độ chỉ xem: chỉ Super Admin mới có quyền chỉnh sửa phân quyền.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 flex flex-col gap-4">
          {isSuperAdmin ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="super-admin-notice">
                Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền.
              </div>
              <div
                title="Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng"
                className="flex cursor-not-allowed items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3"
              >
                <div>
                  <div className="text-sm font-semibold text-foreground">Trạng thái tài khoản</div>
                  <div className="text-xs text-muted-foreground">
                    Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng
                  </div>
                </div>
                <span
                  title="Tài khoản Super Admin mặc định luôn hoạt động và không thể tạm ngưng"
                  className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-emerald-300 bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-700/70 dark:bg-emerald-950/90 dark:text-emerald-200"
                  data-testid="super-admin-active-locked-badge"
                >
                  Đang hoạt động
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/25 p-3">
              <div>
                <div className="text-sm font-semibold text-foreground">Trạng thái tài khoản</div>
                <div className="text-xs text-muted-foreground">
                  Bỏ chọn để khoá đăng nhập tài khoản này ngay lập tức
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold select-none">
                <Checkbox
                  checked={draftActive}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => setDraftActive(Boolean(checked))}
                  data-testid="user-active-checkbox"
                />
                <span>{draftActive ? 'Đang hoạt động' : 'Đang vô hiệu'}</span>
              </label>
            </div>
          )}

          {canEdit && (!isSuperAdmin || currentUser?.id === user.id) ? (
            <form
              autoComplete="off"
              onSubmit={(e) => {
                e.preventDefault();
                void handleResetPassword();
              }}
              className="rounded-lg border bg-muted/20 p-3 space-y-2.5"
              data-testid="reset-password-section"
            >
              {/* Scope Chrome password manager heuristic inside this form rather than outer table search inputs */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={user.username}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                className="sr-only"
              />
              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <KeyRound className="h-4 w-4 text-accent-text" />
                <span>Đặt lại mật khẩu</span>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <PasswordInput
                  name="new-password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Mật khẩu mới (>= 6 ký tự)"
                  data-testid="reset-password-input"
                  toggleTestId="toggle-reset-password"
                  className="h-9 text-xs"
                />
                <PasswordInput
                  name="confirm-new-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  data-testid="reset-password-confirm-input"
                  toggleTestId="toggle-reset-confirm-password"
                  className="h-9 text-xs"
                />
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs font-semibold"
                  data-testid="reset-password-submit-btn"
                  disabled={resetPasswordMutation.isPending || !newPassword}
                >
                  Cập nhật mật khẩu
                </Button>
              </div>
            </form>
          ) : null}

          <PermissionMatrixChecklist
            permissions={draft}
            disabled={isDisabled}
            allChecked={isSuperAdmin}
            testIdPrefix="perm"
            onToggle={togglePermission}
          />
        </div>

        {!isDisabled ? (
          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-2">
            <Button
              variant="outline"
              className="h-9 px-4 font-semibold active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              data-testid="save-permissions-btn"
              className="h-9 px-4 font-semibold active:scale-[0.98] shadow-xs"
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              Lưu quyền
            </Button>
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
