import { defaultUserPermissions, type UserPermissions } from '@fnb/shared';

import { Checkbox } from '@/components/ui/checkbox';
import { RBAC_MODULE_CONFIGS, type RbacModuleConfig } from '@/utils/permission-catalog';

export { RBAC_MODULE_CONFIGS, type RbacModuleConfig };

export function cloneDefaultPermissions(): UserPermissions {
  return structuredClone(defaultUserPermissions);
}

export function buildCashierPresetPermissions(): UserPermissions {
  return {
    ...cloneDefaultPermissions(),
    dashboard: {
      view: true,
      viewProfit: false,
      export: false,
    },
    pos: {
      view: true,
      create: true,
      update: true,
      delete: false,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
      qrSecurity: false,
      manualDiscount: false,
      openCashDrawer: false,
    },
    menu: {
      view: true,
      create: false,
      update: true,
      delete: false,
      manageStations: false,
      manageCategories: false,
      import: false,
      export: false,
    },
    invoices: { view: true, reprint: true, update: true, approve: false, void: false, export: false },
    inventory: { view: true, create: true, update: true, delete: false, export: false },
    cashflow: { view: true, create: true, compensate: false, config: false, export: false },
    schedules: { view: true, create: false, update: false, delete: false, export: false },
    payroll: { view: false, update: false, config: false, export: false },
  };
}

export function buildFullStaffPermissions(): UserPermissions {
  return {
    dashboard: {
      view: true,
      viewProfit: true,
      export: true,
    },
    pos: {
      view: true,
      create: true,
      update: true,
      delete: true,
      splitKitchen: true,
      tableAction: true,
      checkout: true,
      qrSecurity: true,
      manualDiscount: true,
      openCashDrawer: true,
    },
    menu: {
      view: true,
      create: true,
      update: true,
      delete: true,
      manageStations: true,
      manageCategories: true,
      import: true,
      export: true,
    },
    invoices: { view: true, reprint: true, update: true, approve: true, void: false, export: true },
    inventory: { view: true, create: true, update: true, delete: true, export: true },
    cashflow: { view: true, create: true, compensate: true, config: true, export: true },
    paymentQr: { view: true, create: true, update: true, delete: true },
    employees: { view: true, create: true, update: true, delete: true, export: true },
    schedules: { view: true, create: true, update: true, delete: true, export: true },
    payroll: { view: true, update: true, config: true, export: true },
    discounts: { view: true, create: true, update: true, delete: true },
    mdm: { view: true, create: true, update: true, delete: true },
    rbac: { view: true, create: false, update: false, resetPassword: false },
    settings: { view: true, update: true },
  };
}

interface PermissionMatrixChecklistProps {
  permissions: UserPermissions;
  disabled?: boolean;
  allChecked?: boolean;
  columns?: 1 | 2;
  testIdPrefix?: string;
  onToggle: (moduleKey: keyof UserPermissions, permKey: string) => void;
  onToggleModule?: (moduleKey: keyof UserPermissions, checked: boolean) => void;
}

export function PermissionMatrixChecklist({
  permissions,
  disabled = false,
  allChecked = false,
  columns = 1,
  testIdPrefix = 'perm',
  onToggle,
  onToggleModule,
}: PermissionMatrixChecklistProps) {
  return (
    <div
      className={
        columns === 2
          ? 'grid grid-cols-1 md:grid-cols-2 gap-3'
          : 'flex flex-col gap-3'
      }
    >
      {RBAC_MODULE_CONFIGS.map((mod) => {
        const modulePerms = (allChecked
          ? Object.fromEntries(mod.permissions.map((p) => [p.key, true]))
          : permissions[mod.key]) as Record<string, boolean>;

        const editablePerms = mod.permissions.filter((p) => !p.superAdminOnly);
        const allEditableChecked =
          editablePerms.length > 0 &&
          editablePerms.every((p) => Boolean(modulePerms?.[p.key]));

        return (
          <div
            key={mod.key}
            className="rounded-lg border bg-card/50 p-3 flex flex-col gap-2"
            data-testid={`module-perms-${mod.key}`}
          >
            <div className="flex items-center justify-between gap-2 border-b pb-1.5">
              <h3 className="text-sm font-semibold text-foreground">{mod.label}</h3>
              {!disabled && onToggleModule && editablePerms.length > 1 ? (
                <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground select-none">
                  <Checkbox
                    checked={allChecked ? true : allEditableChecked}
                    onCheckedChange={(checked) => onToggleModule(mod.key, Boolean(checked))}
                    data-testid={`${testIdPrefix}-select-all-${mod.key}`}
                  />
                  <span>Chọn tất cả</span>
                </label>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-x-3.5 gap-y-2 pt-0.5">
              {mod.permissions.map((perm) => {
                const isItemDisabled = disabled || Boolean(perm.superAdminOnly);
                return (
                  <label
                    key={perm.key}
                    className={`flex items-center gap-1.5 text-xs select-none ${
                      isItemDisabled ? 'cursor-not-allowed text-muted-foreground' : 'cursor-pointer'
                    }`}
                    data-testid={`${testIdPrefix}-${mod.key}-${perm.key}`}
                  >
                    <Checkbox
                      checked={allChecked ? true : Boolean(!perm.superAdminOnly && modulePerms?.[perm.key])}
                      onCheckedChange={() => {
                        if (!isItemDisabled) onToggle(mod.key, perm.key);
                      }}
                      disabled={isItemDisabled}
                      data-testid={`${testIdPrefix}-checkbox-${mod.key}-${perm.key}`}
                    />
                    <span>{perm.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
