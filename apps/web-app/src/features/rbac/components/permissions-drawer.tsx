import { type UserPermissions } from '@fnb/shared';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from '@/components/ui/toast';

import { type UserRecord, useUpdatePermissionsMutation } from '../api/rbac.api';

export interface PermissionsDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: UserRecord | null;
}

interface ModuleConfig {
  key: keyof UserPermissions;
  label: string;
  permissions: { key: string; label: string }[];
}

const MODULE_CONFIGS: ModuleConfig[] = [
  {
    key: 'pos',
    label: 'POS & Bán hàng',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo đơn' },
      { key: 'update', label: 'Sửa đơn' },
      { key: 'delete', label: 'Xoá đơn' },
      { key: 'splitKitchen', label: 'Tách bếp' },
      { key: 'tableAction', label: 'Đổi/Gộp bàn' },
      { key: 'checkout', label: 'Thanh toán' },
    ],
  },
  {
    key: 'invoices',
    label: 'Hoá đơn',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'reprint', label: 'In lại' },
      { key: 'void', label: 'Huỷ đơn' },
    ],
  },
  {
    key: 'inventory',
    label: 'Nhập hàng',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Tạo phiếu' },
      { key: 'update', label: 'Sửa phiếu' },
      { key: 'delete', label: 'Xoá phiếu' },
    ],
  },
  {
    key: 'cashflow',
    label: 'Dòng tiền & Kết ca',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Kết ca' },
      { key: 'config', label: 'Cấu hình ngân sách' },
    ],
  },
  {
    key: 'employees',
    label: 'Nhân sự',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'create', label: 'Thêm mới' },
      { key: 'update', label: 'Chỉnh sửa' },
      { key: 'delete', label: 'Xoá mềm' },
    ],
  },
  {
    key: 'schedules',
    label: 'Lịch làm việc',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'update', label: 'Sắp xếp ca' },
    ],
  },
  {
    key: 'mdm',
    label: 'Master Data',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'write', label: 'Thêm/Sửa/Xoá' },
    ],
  },
  {
    key: 'rbac',
    label: 'Phân quyền',
    permissions: [
      { key: 'view', label: 'Xem' },
      { key: 'manage', label: 'Quản lý quyền' },
    ],
  },
];

export function PermissionsDrawer({ open, onOpenChange, user }: PermissionsDrawerProps) {
  const [draft, setDraft] = React.useState<UserPermissions | null>(null);
  const updateMutation = useUpdatePermissionsMutation(user?.id ?? 0);

  React.useEffect(() => {
    if (open && user) {
      setDraft(structuredClone(user.permissions));
    }
  }, [open, user]);

  if (!user || !draft) return null;

  const isSuperAdmin = user.isSuperAdmin;
  const isDisabled = isSuperAdmin;

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
      await updateMutation.mutateAsync({ permissions: draft });
      toast({ variant: 'success', title: 'Cập nhật quyền thành công' });
      onOpenChange(false);
    } catch {
      toast({ variant: 'destructive', title: 'Cập nhật quyền thất bại' });
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
              : 'Cấu hình quyền truy cập và thao tác trên từng module.'}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-5 flex flex-col gap-4">
          {isSuperAdmin ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200" data-testid="super-admin-notice">
              Tài khoản Super Admin mặc định có toàn quyền hệ thống và không thể bị hạ quyền.
            </div>
          ) : null}

          {MODULE_CONFIGS.map((mod) => {
            const modulePerms = (isSuperAdmin
              ? Object.fromEntries(mod.permissions.map((p) => [p.key, true]))
              : draft[mod.key]) as Record<string, boolean>;

            return (
              <div key={mod.key} className="rounded-lg border p-3" data-testid={`module-perms-${mod.key}`}>
                <h3 className="mb-2 text-sm font-semibold">{mod.label}</h3>
                <div className="flex flex-wrap gap-3">
                  {mod.permissions.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-center gap-1.5 text-xs"
                      data-testid={`perm-${mod.key}-${perm.key}`}
                    >
                      <Checkbox
                        checked={!!modulePerms[perm.key]}
                        onCheckedChange={() => togglePermission(mod.key, perm.key)}
                        disabled={isDisabled}
                        data-testid={`perm-checkbox-${mod.key}-${perm.key}`}
                      />
                      {perm.label}
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
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
