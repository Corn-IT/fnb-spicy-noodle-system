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
  testIdPrefix?: string;
  onToggle: (moduleKey: keyof UserPermissions, permKey: string) => void;
}

export function PermissionMatrixChecklist({
  permissions,
  disabled = false,
  allChecked = false,
  testIdPrefix = 'perm',
  onToggle,
}: PermissionMatrixChecklistProps) {
  return (
    <div className="flex flex-col gap-3">
      {RBAC_MODULE_CONFIGS.map((mod) => {
        const modulePerms = (allChecked
          ? Object.fromEntries(mod.permissions.map((p) => [p.key, true]))
          : permissions[mod.key]) as Record<string, boolean>;

        return (
          <div
            key={mod.key}
            className="rounded-lg border p-3"
            data-testid={`module-perms-${mod.key}`}
          >
            <h3 className="mb-2 text-sm font-semibold">{mod.label}</h3>
            <div className="flex flex-wrap gap-3">
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
