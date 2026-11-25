import { AlertTriangle, KeyRound, X } from 'lucide-react';
import * as React from 'react';

import { Skeleton } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAppMessages } from '@/hooks/use-app-messages';
import { useAuthStore } from '@/stores/auth.store';

import {
  type UserRecord,
  useAvailableEmployeesForAccountQuery,
  useResetUserPasswordMutation,
  useUpdateUserAccountMutation,
} from '../api/rbac.api';

export interface AccountDetailsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
}

export function AccountDetailsDrawer({ open, onOpenChange, user }: AccountDetailsDrawerProps) {
  const { notify, resolveErrorMessage } = useAppMessages();
  const currentUser = useAuthStore((s) => s.user);

  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const canEdit = Boolean(currentUser?.isSuperAdmin);
  const isDisabled = isSuperAdmin || !canEdit;

  const { data: candidates = [], isLoading: loadingCandidates } =
    useAvailableEmployeesForAccountQuery(open && !isDisabled);

  const updateAccountMutation = useUpdateUserAccountMutation(user?.id ?? 0);
  const resetPasswordMutation = useResetUserPasswordMutation(user?.id ?? 0);

  const [employeeId, setEmployeeId] = React.useState<string>('');
  const [username, setUsername] = React.useState('');
  const [roleLabel, setRoleLabel] = React.useState('');
  const [isActive, setIsActive] = React.useState(true);
  const [formError, setFormError] = React.useState<string | null>(null);

  const [newPassword, setNewPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');

  React.useEffect(() => {
    if (open && user) {
      setEmployeeId(String(user.employee.id));
      setUsername(user.username);
      setRoleLabel(user.roleLabel ?? '');
      setIsActive(user.isActive);
      setFormError(null);
      setNewPassword('');
      setConfirmPassword('');
    }
  }, [open, user]);

  const employeeOptions = React.useMemo(() => {
    if (!user) return [];
    const currentOption = {
      id: user.employee.id,
      fullName: user.employee.fullName,
      positionName: user.employee.position?.name ?? null,
      isDeleted: Boolean(user.employee.isDeleted),
    };
    const otherOptions = candidates
      .filter((emp) => emp.id !== user.employee.id)
      .map((emp) => ({
        id: emp.id,
        fullName: emp.fullName,
        positionName: emp.position?.name ?? null,
        isDeleted: emp.isDeleted,
      }));
    return [currentOption, ...otherOptions];
  }, [user, candidates]);

  if (!user) return null;

  const selectedEmployeeId = Number(employeeId);
  const selectedEmployeeOption = employeeOptions.find((item) => item.id === selectedEmployeeId);
  const defaultRoleFromPosition = selectedEmployeeOption?.positionName ?? 'Nhân viên';

  const normalizedRoleLabel = roleLabel.trim() || null;
  const trimmedUsername = username.trim();

  const employeeChanged = Number.isInteger(selectedEmployeeId) && selectedEmployeeId !== user.employee.id;
  const usernameChanged = trimmedUsername !== user.username;
  const roleLabelChanged = normalizedRoleLabel !== (user.roleLabel ?? null);
  const activeChanged = isActive !== user.isActive;
  const hasChanges = employeeChanged || usernameChanged || roleLabelChanged || activeChanged;

  const handleSave = async () => {
    if (isDisabled || !hasChanges) return;
    setFormError(null);

    if (!Number.isInteger(selectedEmployeeId) || selectedEmployeeId <= 0) {
      setFormError('Vui lòng chọn nhân sự liên kết.');
      return;
    }
    if (trimmedUsername.length < 3 || trimmedUsername.length > 64) {
      setFormError('Tên đăng nhập phải từ 3 đến 64 ký tự.');
      return;
    }
    if (roleLabel.trim().length > 64) {
      setFormError('Nhãn vai trò tối đa 64 ký tự.');
      return;
    }

    try {
      await updateAccountMutation.mutateAsync({
        ...(employeeChanged ? { employeeId: selectedEmployeeId } : {}),
        ...(usernameChanged ? { username: trimmedUsername } : {}),
        ...(roleLabelChanged ? { roleLabel: normalizedRoleLabel } : {}),
        ...(activeChanged ? { isActive } : {}),
      });
      notify('rbac.account.updateSuccess', {
        variant: 'success',
        vars: { username: trimmedUsername },
      });
      onOpenChange(false);
    } catch (err) {
      const resolved = resolveErrorMessage(
        'rbac.account.updateError',
        err,
        'Không thể cập nhật thông tin tài khoản.',
      );
      const reason = resolved.description ?? resolved.title;
      setFormError(reason);
      notify('rbac.account.updateError', {
        variant: 'destructive',
        vars: { reason },
      });
    }
  };

  const handleResetPassword = async () => {
    if (!canEdit) return;
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
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden"
        data-testid="account-details-drawer"
      >
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>Chi tiết tài khoản: @{user.username}</SheetTitle>
          <SheetDescription>
            {isSuperAdmin
              ? 'Tài khoản Super Admin được bảo vệ cố định, chỉ cho phép tự đặt lại mật khẩu của chính mình.'
              : canEdit
                ? 'Chỉnh sửa nhân sự liên kết, tên đăng nhập, nhãn vai trò, trạng thái hoạt động và mật khẩu.'
                : 'Chế độ chỉ xem: chỉ Super Admin mới có quyền chỉnh sửa chi tiết tài khoản.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 flex flex-col gap-4">
          {isSuperAdmin ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              data-testid="super-admin-account-notice"
            >
              Tài khoản Super Admin mặc định luôn hoạt động và không thể đổi nhân sự, tên đăng nhập hoặc vai trò.
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor="account-employee-select" className="text-xs font-semibold">
              Nhân sự liên kết (1-1) *
            </label>
            <div className="relative">
              <select
                id="account-employee-select"
                data-testid="account-employee-select"
                aria-busy={loadingCandidates}
                value={employeeId}
                disabled={isDisabled || loadingCandidates}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {employeeOptions.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName}
                    {emp.positionName ? ` — ${emp.positionName}` : ''}
                    {emp.isDeleted ? ' (Tạm ngưng)' : ''}
                  </option>
                ))}
              </select>
              {loadingCandidates ? (
                <Skeleton className="pointer-events-none absolute inset-0 h-10 w-full rounded-md" />
              ) : null}
            </div>
            {employeeChanged ? (
              <div
                data-testid="employee-reassign-warning"
                className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Đổi nhân sự sẽ tự động đăng xuất phiên hiện tại; các hoá đơn và phiếu kết ca cũ của tài khoản này sẽ hiển thị theo tên nhân sự mới.
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="account-username-input" className="text-xs font-semibold">
              Tên đăng nhập *
            </label>
            <Input
              id="account-username-input"
              data-testid="account-username-input"
              value={username}
              disabled={isDisabled}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Tối thiểu 3 ký tự"
              autoComplete="off"
            />
            {usernameChanged ? (
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                Đổi tên đăng nhập sẽ tự động đăng xuất phiên hiện tại để đồng bộ lại phiên đăng nhập.
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="account-role-label-input" className="text-xs font-semibold">
              Nhãn vai trò hiển thị (tuỳ chọn)
            </label>
            <div className="relative">
              <Input
                id="account-role-label-input"
                data-testid="account-role-label-input"
                value={isSuperAdmin ? 'Super Admin' : roleLabel}
                disabled={isDisabled}
                maxLength={64}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder={`Mặc định theo chức vụ: ${defaultRoleFromPosition}`}
                className={!isDisabled && roleLabel ? 'pr-8' : undefined}
              />
              {!isDisabled && roleLabel ? (
                <button
                  type="button"
                  aria-label="Xoá nhãn vai trò tuỳ chỉnh"
                  title="Xoá để dùng mặc định theo Chức vụ"
                  onClick={() => setRoleLabel('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isSuperAdmin
                ? 'Tài khoản Super Admin luôn hiển thị nhãn Super Admin cố định.'
                : `Để trống sẽ tự động hiển thị theo Chức vụ từ Master Data (${defaultRoleFromPosition}).`}
            </p>
          </div>

          {isSuperAdmin ? (
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
                  checked={isActive}
                  disabled={!canEdit}
                  onCheckedChange={(checked) => setIsActive(Boolean(checked))}
                  data-testid="user-active-checkbox"
                />
                <span>{isActive ? 'Đang hoạt động' : 'Đang vô hiệu'}</span>
              </label>
            </div>
          )}

          {formError ? (
            <div
              role="alert"
              data-testid="account-details-error"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive"
            >
              {formError}
            </div>
          ) : null}

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
                  placeholder="Mật khẩu mới (≥6 ký tự)"
                  data-testid="reset-password-input"
                  toggleTestId="toggle-reset-password"
                  className="h-9 text-xs"
                />
                <PasswordInput
                  name="confirm-new-password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu"
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
        </div>

        {!isDisabled ? (
          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 font-semibold active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="button"
              data-testid="save-account-details-btn"
              className="h-9 px-4 font-semibold active:scale-[0.98] shadow-xs"
              onClick={() => void handleSave()}
              disabled={updateAccountMutation.isPending || !hasChanges}
            >
              {updateAccountMutation.isPending ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </SheetFooter>
        ) : (
          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 font-semibold active:scale-[0.98]"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
