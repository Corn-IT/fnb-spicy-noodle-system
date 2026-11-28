import { type UserPermissions } from '@fnb/shared';
import * as React from 'react';

import { Skeleton } from '@/components/loading';
import { Button } from '@/components/ui/button';
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

import { useAvailableEmployeesForAccountQuery, useCreateUserMutation } from '../api/rbac.api';
import {
  buildCashierPresetPermissions,
  buildFullStaffPermissions,
  cloneDefaultPermissions,
  PermissionMatrixChecklist,
  RBAC_MODULE_CONFIGS,
} from './permission-modules';

export interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const { notify } = useAppMessages();
  const { data: candidates = [], isLoading: loadingEmployees } =
    useAvailableEmployeesForAccountQuery(open);
  const createMutation = useCreateUserMutation();

  const [employeeId, setEmployeeId] = React.useState<string>('');
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [roleLabel, setRoleLabel] = React.useState('');
  const [permissions, setPermissions] = React.useState<UserPermissions>(
    buildCashierPresetPermissions,
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setEmployeeId('');
      setUsername('');
      setPassword('');
      setRoleLabel('');
      setPermissions(buildCashierPresetPermissions());
      setFormError(null);
    }
  }, [open]);

  React.useEffect(() => {
    if (open && !employeeId && candidates.length > 0) {
      setEmployeeId(String(candidates[0]!.id));
    }
  }, [open, employeeId, candidates]);

  const handleTogglePermission = (moduleKey: keyof UserPermissions, permKey: string) => {
    setPermissions((prev) => {
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

  const handleToggleModulePermissions = (moduleKey: keyof UserPermissions, checked: boolean) => {
    const modConfig = RBAC_MODULE_CONFIGS.find((m) => m.key === moduleKey);
    if (!modConfig) return;
    setPermissions((prev) => {
      const nextModulePerms = { ...(prev[moduleKey] as Record<string, boolean>) };
      for (const perm of modConfig.permissions) {
        if (!perm.superAdminOnly) {
          nextModulePerms[perm.key] = checked;
        }
      }
      return {
        ...prev,
        [moduleKey]: nextModulePerms,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedEmployeeId = Number(employeeId);
    if (!Number.isInteger(parsedEmployeeId) || parsedEmployeeId <= 0) {
      setFormError('Vui lòng chọn nhân viên cần cấp tài khoản đăng nhập.');
      return;
    }
    const cleanUsername = username.trim();
    if (cleanUsername.length < 3) {
      setFormError('Tên đăng nhập phải có ít nhất 3 ký tự.');
      return;
    }
    if (password.length < 6) {
      setFormError('Mật khẩu phải có ít nhất 6 ký tự.');
      return;
    }

    try {
      await createMutation.mutateAsync({
        employeeId: parsedEmployeeId,
        username: cleanUsername,
        password,
        roleLabel: roleLabel.trim() || null,
        permissions,
      });
      notify('rbac.user.createSuccess', {
        variant: 'success',
        vars: { username: cleanUsername },
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Không thể tạo tài khoản mới.';
      setFormError(message);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg flex flex-col p-0 overflow-hidden"
        data-testid="create-user-drawer"
      >
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>Cấp Tài khoản Đăng nhập Mới</SheetTitle>
          <SheetDescription>
            Liên kết 1-1 với nhân sự chưa có tài khoản và thiết lập ma trận phân quyền ban đầu.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-1 min-h-0 flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="create-user-employee" className="text-xs font-semibold">
                Nhân viên được cấp tài khoản *
              </label>
              <div className="relative">
                <select
                  id="create-user-employee"
                  data-testid="create-user-employee-select"
                  aria-busy={loadingEmployees}
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  disabled={loadingEmployees || candidates.length === 0}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
                >
                  {loadingEmployees ? (
                    <option value="" />
                  ) : candidates.length === 0 ? (
                    <option value="">Tất cả nhân sự đang hoạt động đã có tài khoản</option>
                  ) : (
                    candidates.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName}
                        {emp.position ? ` — ${emp.position.name}` : ''}
                      </option>
                    ))
                  )}
                </select>
                {loadingEmployees ? (
                  <Skeleton className="pointer-events-none absolute inset-0 h-10 w-full rounded-md" />
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="create-user-username" className="text-xs font-semibold">
                  Tên đăng nhập *
                </label>
                <Input
                  id="create-user-username"
                  data-testid="create-user-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="VD: thungan02"
                  autoComplete="off"
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="create-user-password" className="text-xs font-semibold">
                  Mật khẩu khởi tạo *
                </label>
                <PasswordInput
                  id="create-user-password"
                  data-testid="create-user-password-input"
                  toggleTestId="toggle-create-user-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="create-user-role-label" className="text-xs font-semibold">
                Nhãn vai trò hiển thị (tuỳ chọn)
              </label>
              <Input
                id="create-user-role-label"
                data-testid="create-user-role-label-input"
                value={roleLabel}
                maxLength={64}
                onChange={(e) => setRoleLabel(e.target.value)}
                placeholder={`Mặc định theo chức vụ: ${
                  candidates.find((c) => String(c.id) === employeeId)?.position?.name ?? 'Nhân viên'
                }`}
              />
              <p className="text-[11px] text-muted-foreground">
                Để trống sẽ tự động hiển thị theo Chức vụ của nhân viên từ Master Data.
              </p>
            </div>

            <div className="space-y-2 border-t pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Phân quyền nhanh theo vai trò
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setPermissions(buildCashierPresetPermissions())}
                  >
                    Thu ngân mẫu
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setPermissions(buildFullStaffPermissions())}
                  >
                    Quản lý ca
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2.5 text-xs"
                    onClick={() => setPermissions(cloneDefaultPermissions())}
                  >
                    Xoá chọn hết
                  </Button>
                </div>
              </div>

              <PermissionMatrixChecklist
                permissions={permissions}
                testIdPrefix="create-perm"
                onToggle={handleTogglePermission}
                onToggleModule={handleToggleModulePermissions}
              />
            </div>

            {formError ? (
              <div
                role="alert"
                data-testid="create-user-error"
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-300"
              >
                {formError}
              </div>
            ) : null}
          </div>

          <SheetFooter className="p-4 border-t bg-muted/20 shrink-0 flex flex-row items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 font-semibold"
              onClick={() => onOpenChange(false)}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              data-testid="submit-create-user-btn"
              disabled={createMutation.isPending || candidates.length === 0}
              className="h-9 px-4 font-bold shadow-xs"
            >
              {createMutation.isPending ? 'Đang tạo...' : 'Tạo tài khoản'}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
