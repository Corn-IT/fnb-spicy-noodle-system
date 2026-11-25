import { type UserPermissions } from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
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
  useUpdatePermissionsMutation,
} from '../api/rbac.api';
import {
  buildCashierPresetPermissions,
  buildFullStaffPermissions,
  cloneDefaultPermissions,
  PermissionMatrixChecklist,
  RBAC_MODULE_CONFIGS,
} from './permission-modules';

export interface PermissionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
}

export function PermissionsDrawer({ open, onOpenChange, user }: PermissionsDrawerProps) {
  const { notify } = useAppMessages();
  const currentUser = useAuthStore((s) => s.user);
  const [draft, setDraft] = React.useState<UserPermissions | null>(null);
  const updateMutation = useUpdatePermissionsMutation(user?.id ?? 0);

  React.useEffect(() => {
    if (open && user) {
      setDraft(structuredClone(user.permissions));
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

  const toggleModulePermissions = (moduleKey: keyof UserPermissions, checked: boolean) => {
    if (isDisabled) return;
    const modConfig = RBAC_MODULE_CONFIGS.find((m) => m.key === moduleKey);
    if (!modConfig) return;
    setDraft((prev) => {
      if (!prev) return prev;
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

  const handleSave = async () => {
    if (isDisabled || !draft) return;
    try {
      await updateMutation.mutateAsync({ permissions: draft });
      notify('rbac.permissions.updateSuccess', { variant: 'success' });
      onOpenChange(false);
    } catch {
      notify('rbac.permissions.updateError', { variant: 'destructive' });
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-3xl flex flex-col p-0 overflow-hidden"
        data-testid="permissions-drawer"
      >
        <SheetHeader className="p-5 border-b shrink-0 text-left bg-card pr-12">
          <SheetTitle>
            Phân quyền: {user.employee?.fullName ?? user.username} (@{user.username})
          </SheetTitle>
          <SheetDescription>
            {isSuperAdmin
              ? 'Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền.'
              : canEdit
                ? 'Cấu hình chi tiết ma trận quyền truy cập và thao tác trên từng module.'
                : 'Chế độ chỉ xem: chỉ Super Admin mới có quyền chỉnh sửa phân quyền.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 flex flex-col gap-4">
          {isSuperAdmin ? (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
              data-testid="super-admin-notice"
            >
              Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền.
            </div>
          ) : !isDisabled ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/25 px-3 py-2.5">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Áp nhanh bộ quyền mẫu
              </span>
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="preset-cashier-btn"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setDraft(buildCashierPresetPermissions())}
                >
                  Thu ngân mẫu
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  data-testid="preset-manager-btn"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setDraft(buildFullStaffPermissions())}
                >
                  Quản lý ca
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  data-testid="preset-clear-btn"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => setDraft(cloneDefaultPermissions())}
                >
                  Xoá chọn hết
                </Button>
              </div>
            </div>
          ) : null}

          <PermissionMatrixChecklist
            permissions={draft}
            disabled={isDisabled}
            allChecked={isSuperAdmin}
            columns={2}
            testIdPrefix="perm"
            onToggle={togglePermission}
            onToggleModule={toggleModulePermissions}
          />
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
              data-testid="save-permissions-btn"
              className="h-9 px-4 font-semibold active:scale-[0.98] shadow-xs"
              onClick={() => void handleSave()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Đang lưu...' : 'Lưu quyền'}
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
