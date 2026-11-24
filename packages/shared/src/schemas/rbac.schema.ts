import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PaginationFields } from './common.schema';
import { EmployeeProfileSchema, ProfileSessionInfoSchema, UiPreferencesSchema } from './profile.schema';

export const ModulePermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
}).strict();
export type ModulePermissions = z.infer<typeof ModulePermissionsSchema>;

const ModuleWithExportPermissionsSchema = ModulePermissionsSchema.extend({
  export: z.boolean().default(false),
}).strict();

const MenuPermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
  manageStations: z.boolean().default(false),
  manageCategories: z.boolean().default(false),
  import: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const PayrollPermissionsSchema = z.object({
  view: z.boolean().default(false),
  update: z.boolean().default(false),
  config: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const InvoicesPermissionsSchema = z.object({
  view: z.boolean().default(false),
  reprint: z.boolean().default(false),
  update: z.boolean().default(false),
  approve: z.boolean().default(false),
  void: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const PosPermissionsSchema = ModulePermissionsSchema.extend({
  splitKitchen: z.boolean().default(false),
  tableAction: z.boolean().default(false),
  checkout: z.boolean().default(false),
  qrSecurity: z.boolean().default(false),
  manualDiscount: z.boolean().default(false),
  openCashDrawer: z.boolean().default(false),
}).default({
  view: false,
  create: false,
  update: false,
  delete: false,
  splitKitchen: false,
  tableAction: false,
  checkout: false,
  qrSecurity: false,
  manualDiscount: false,
  openCashDrawer: false,
});

const CashflowPermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  compensate: z.boolean().default(false),
  config: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const SchedulePermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const MdmPermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
}).strict();

const RbacPermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  resetPassword: z.boolean().default(false),
}).strict();

const SettingsPermissionsSchema = z.object({
  view: z.boolean().default(false),
  update: z.boolean().default(false),
}).strict();

const DashboardPermissionsSchema = z.object({
  view: z.boolean().default(false),
  viewProfit: z.boolean().default(false),
  export: z.boolean().default(false),
}).strict();

const UserAdminEmployeeSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  position: z.object({ id: IdSchema, name: z.string() }).nullable(),
  specialty: z.object({ id: IdSchema, name: z.string() }).nullable(),
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function normalizeLegacyPermissions(raw: unknown): unknown {
  if (!isPlainRecord(raw)) return raw;
  const obj: Record<string, unknown> = { ...raw };

  if (isPlainRecord(obj.mdm) && 'write' in obj.mdm) {
    const mdm = { ...obj.mdm };
    const legacyWrite = mdm.write;
    delete mdm.write;
    if (typeof legacyWrite === 'boolean') {
      if (mdm.create === undefined) mdm.create = legacyWrite;
      if (mdm.update === undefined) mdm.update = legacyWrite;
      if (mdm.delete === undefined) mdm.delete = legacyWrite;
    }
    obj.mdm = mdm;
  }

  if (isPlainRecord(obj.rbac) && 'manage' in obj.rbac) {
    const rbac = { ...obj.rbac };
    const legacyManage = rbac.manage;
    delete rbac.manage;
    if (typeof legacyManage === 'boolean') {
      if (rbac.create === undefined) rbac.create = legacyManage;
      if (rbac.update === undefined) rbac.update = legacyManage;
      if (rbac.resetPassword === undefined) rbac.resetPassword = legacyManage;
    }
    obj.rbac = rbac;
  }

  if (isPlainRecord(obj.schedules) && typeof obj.schedules.update === 'boolean') {
    const schedules = { ...obj.schedules };
    if (schedules.create === undefined) schedules.create = schedules.update;
    if (schedules.delete === undefined) schedules.delete = schedules.update;
    obj.schedules = schedules;
  }

  if (isPlainRecord(obj.cashflow) && typeof obj.cashflow.create === 'boolean') {
    const cashflow = { ...obj.cashflow };
    if (cashflow.compensate === undefined) cashflow.compensate = cashflow.create;
    obj.cashflow = cashflow;
  }

  if (obj.menu === undefined && isPlainRecord(obj.pos)) {
    const posView = obj.pos.view === true;
    const posUpdate = obj.pos.update === true;
    const mdmUpdate = isPlainRecord(obj.mdm) && (obj.mdm.update === true || obj.mdm.create === true);
    if (typeof obj.pos.view === 'boolean' || typeof obj.pos.update === 'boolean') {
      obj.menu = {
        view: posView,
        create: posUpdate,
        update: posUpdate,
        delete: posUpdate,
        manageStations: mdmUpdate || posUpdate,
        manageCategories: mdmUpdate || posUpdate,
        import: false,
        export: false,
      };
    }
  }

  if (obj.settings === undefined && isPlainRecord(obj.rbac) && obj.rbac.update === true) {
    obj.settings = { view: true, update: true };
  }

  if (
    obj.dashboard === undefined &&
    (isPlainRecord(obj.pos) ||
      isPlainRecord(obj.cashflow) ||
      isPlainRecord(obj.payroll))
  ) {
    const canViewAnyOps =
      (isPlainRecord(obj.pos) && obj.pos.view === true) ||
      (isPlainRecord(obj.cashflow) && obj.cashflow.view === true) ||
      (isPlainRecord(obj.payroll) && obj.payroll.view === true);
    if (canViewAnyOps) {
      obj.dashboard = {
        view: true,
        viewProfit: Boolean(
          (isPlainRecord(obj.payroll) && obj.payroll.view === true) ||
            (isPlainRecord(obj.cashflow) && obj.cashflow.config === true),
        ),
        export: Boolean(
          (isPlainRecord(obj.invoices) && obj.invoices.export === true) ||
            (isPlainRecord(obj.cashflow) && obj.cashflow.export === true),
        ),
      };
    }
  }

  return obj;
}

const BaseUserPermissionsSchema = z.object({
  dashboard: DashboardPermissionsSchema.default({ view: false, viewProfit: false, export: false }),
  pos: PosPermissionsSchema,
  menu: MenuPermissionsSchema.default({
    view: false,
    create: false,
    update: false,
    delete: false,
    manageStations: false,
    manageCategories: false,
    import: false,
    export: false,
  }),
  invoices: InvoicesPermissionsSchema.default({
    view: false,
    reprint: false,
    update: false,
    approve: false,
    void: false,
    export: false,
  }),
  inventory: ModuleWithExportPermissionsSchema.default({
    view: false,
    create: false,
    update: false,
    delete: false,
    export: false,
  }),
  cashflow: CashflowPermissionsSchema.default({
    view: false,
    create: false,
    compensate: false,
    config: false,
    export: false,
  }),
  employees: ModuleWithExportPermissionsSchema.default({
    view: false,
    create: false,
    update: false,
    delete: false,
    export: false,
  }),
  schedules: SchedulePermissionsSchema.default({
    view: false,
    create: false,
    update: false,
    delete: false,
    export: false,
  }),
  payroll: PayrollPermissionsSchema.default({
    view: false,
    update: false,
    config: false,
    export: false,
  }),
  discounts: ModulePermissionsSchema.default({ view: false, create: false, update: false, delete: false }),
  mdm: MdmPermissionsSchema.default({ view: false, create: false, update: false, delete: false }),
  rbac: RbacPermissionsSchema.default({ view: false, create: false, update: false, resetPassword: false }),
  paymentQr: ModulePermissionsSchema.default({ view: false, create: false, update: false, delete: false }),
  settings: SettingsPermissionsSchema.default({ view: false, update: false }),
}).strict();

export const UserPermissionsSchema = z.preprocess(normalizeLegacyPermissions, BaseUserPermissionsSchema);
export type UserPermissions = z.infer<typeof UserPermissionsSchema>;

export const defaultUserPermissions: UserPermissions = {
  dashboard: { view: false, viewProfit: false, export: false },
  pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false, qrSecurity: false, manualDiscount: false, openCashDrawer: false },
  menu: { view: false, create: false, update: false, delete: false, manageStations: false, manageCategories: false, import: false, export: false },
  invoices: { view: false, reprint: false, update: false, approve: false, void: false, export: false },
  inventory: { view: false, create: false, update: false, delete: false, export: false },
  cashflow: { view: false, create: false, compensate: false, config: false, export: false },
  employees: { view: false, create: false, update: false, delete: false, export: false },
  schedules: { view: false, create: false, update: false, delete: false, export: false },
  payroll: { view: false, update: false, config: false, export: false },
  discounts: { view: false, create: false, update: false, delete: false },
  mdm: { view: false, create: false, update: false, delete: false },
  rbac: { view: false, create: false, update: false, resetPassword: false },
  paymentQr: { view: false, create: false, update: false, delete: false },
  settings: { view: false, update: false },
};

export const LoginRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, 'Vui lòng nhập tên đăng nhập')
    .max(64, 'Tên đăng nhập tối đa 64 ký tự'),
  password: z
    .string()
    .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
    .max(128, 'Mật khẩu tối đa 128 ký tự'),
  force: z.boolean().optional(),
}).strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const ActiveSessionConflictDetailsSchema = z.object({
  username: z.string(),
  startedAt: IsoDateTimeSchema.nullable().optional(),
});
export type ActiveSessionConflictDetails = z.infer<typeof ActiveSessionConflictDetailsSchema>;

export const SessionRevokeReasonSchema = z.enum([
  'NEW_LOGIN',
  'ADMIN_REVOKED',
  'PASSWORD_CHANGED',
  'ACCOUNT_DISABLED',
  'LOGGED_OUT',
]);
export type SessionRevokeReason = z.infer<typeof SessionRevokeReasonSchema>;

export const RevokedSessionNoticeSchema = z.object({
  reason: SessionRevokeReasonSchema,
  at: IsoDateTimeSchema,
});
export type RevokedSessionNotice = z.infer<typeof RevokedSessionNoticeSchema>;

export const SessionRevokedSocketPayloadSchema = RevokedSessionNoticeSchema.extend({
  sessionId: z.string().min(1).optional(),
});
export type SessionRevokedSocketPayload = z.infer<typeof SessionRevokedSocketPayloadSchema>;

export const PermissionsUpdatedSocketPayloadSchema = z.object({
  userId: IdSchema,
  permissions: UserPermissionsSchema,
  updatedAt: IsoDateTimeSchema,
});
export type PermissionsUpdatedSocketPayload = z.infer<typeof PermissionsUpdatedSocketPayloadSchema>;

/** Sent to every device of one account after its personal UI preferences were saved. */
export const AccountPreferencesUpdatedSocketPayloadSchema = z.object({
  userId: IdSchema,
  uiPreferences: UiPreferencesSchema,
  updatedAt: IsoDateTimeSchema,
});
export type AccountPreferencesUpdatedSocketPayload = z.infer<typeof AccountPreferencesUpdatedSocketPayloadSchema>;

export const UserSessionStatusSchema = z.object({
  isActiveSession: z.boolean(),
  isSocketOnline: z.boolean().default(false),
  ipAddress: z.string().nullable().default(null),
  deviceLabel: z.string().nullable().default(null),
  startedAt: IsoDateTimeSchema.nullable().default(null),
});
export type UserSessionStatus = z.infer<typeof UserSessionStatusSchema>;

export const AuthPrincipalSchema = z.object({
  id: IdSchema,
  employeeId: IdSchema,
  username: z.string().min(1),
  isSuperAdmin: z.boolean(),
  permissions: UserPermissionsSchema,
  sessionId: z.string().min(1).optional(),
});
export type AuthPrincipal = z.infer<typeof AuthPrincipalSchema>;

const AuthEmployeeSchema = z.object({
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  position: z.object({ id: IdSchema, name: z.string() }).nullable(),
  specialty: z.object({ id: IdSchema, name: z.string() }).nullable(),
});

export const AuthUserSchema = AuthPrincipalSchema.extend({
  employee: AuthEmployeeSchema,
  uiPreferences: UiPreferencesSchema,
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const ProfileResponseSchema = z.object({
  id: IdSchema,
  username: z.string().min(1),
  isSuperAdmin: z.boolean(),
  permissions: UserPermissionsSchema,
  uiPreferences: UiPreferencesSchema,
  employee: EmployeeProfileSchema,
  session: ProfileSessionInfoSchema.optional(),
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: AuthUserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const ChangePasswordResponseSchema = AuthResponseSchema.extend({
  message: z.string().min(1),
});
export type ChangePasswordResponse = z.infer<typeof ChangePasswordResponseSchema>;

export const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1).optional(),
}).strict().default({});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

export const CreateUserSchema = z.object({
  employeeId: IdSchema,
  username: z.string().trim().min(3).max(64),
  password: z.string().min(6).max(128),
  permissions: UserPermissionsSchema.default(defaultUserPermissions),
}).strict();
export type CreateUserInput = z.infer<typeof CreateUserSchema>;

export const UpdatePermissionsSchema = z.object({
  permissions: UserPermissionsSchema.optional(),
  isActive: z.boolean().optional(),
}).strict().refine((input) => input.permissions !== undefined || input.isActive !== undefined, {
  message: 'Phải cung cấp quyền hạn hoặc trạng thái tài khoản',
});
export type UpdatePermissionsInput = z.infer<typeof UpdatePermissionsSchema>;

export const ResetUserPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự').max(128),
}).strict();
export type ResetUserPasswordInput = z.infer<typeof ResetUserPasswordSchema>;

export const UserListQuerySchema = z.object({
  ...PaginationFields,
  keyword: z.string().trim().min(1).optional(),
}).strict();
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const UserAdminRecordSchema = AuthUserSchema.extend({
  isActive: z.boolean(),
  employee: UserAdminEmployeeSchema,
  session: UserSessionStatusSchema.optional(),
});
export type UserAdminRecord = z.infer<typeof UserAdminRecordSchema>;

export const UserListResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  items: z.array(UserAdminRecordSchema),
});
export type UserListResponse = z.infer<typeof UserListResponseSchema>;

export const SessionHistoryEventTypeSchema = z.enum([
  'LOGIN',
  'LOGIN_FAILED',
  'LOGOUT',
  'SESSION_REPLACED',
  'ADMIN_REVOKED',
  'PASSWORD_CHANGED',
  'PASSWORD_RESET',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
]);
export type SessionHistoryEventType = z.infer<typeof SessionHistoryEventTypeSchema>;

export const UserSessionHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(5),
}).strict();
export type UserSessionHistoryQuery = z.infer<typeof UserSessionHistoryQuerySchema>;

export const UserSessionHistoryItemSchema = z.object({
  id: IdSchema,
  eventType: SessionHistoryEventTypeSchema,
  actionLabel: z.string().min(1),
  summary: z.string(),
  actorUsername: z.string().nullable().default(null),
  actorFullName: z.string().nullable().default(null),
  ipAddress: z.string().nullable().default(null),
  deviceLabel: z.string().nullable().default(null),
  previousIp: z.string().nullable().default(null),
  previousDevice: z.string().nullable().default(null),
  createdAt: IsoDateTimeSchema,
});
export type UserSessionHistoryItem = z.infer<typeof UserSessionHistoryItemSchema>;

export const UserSessionHistoryResponseSchema = z.object({
  user: z.object({
    id: IdSchema,
    username: z.string().min(1),
    fullName: z.string().min(1),
    isSuperAdmin: z.boolean(),
    isActive: z.boolean(),
  }),
  currentSession: UserSessionStatusSchema,
  items: z.array(UserSessionHistoryItemSchema),
});
export type UserSessionHistoryResponse = z.infer<typeof UserSessionHistoryResponseSchema>;
