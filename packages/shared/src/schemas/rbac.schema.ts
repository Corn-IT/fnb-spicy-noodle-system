import { z } from 'zod';
import { IdSchema, PaginationFields } from './common.schema';
import { EmployeeProfileSchema, UiPreferencesSchema } from './profile.schema';

export const ModulePermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  update: z.boolean().default(false),
  delete: z.boolean().default(false),
}).strict();
export type ModulePermissions = z.infer<typeof ModulePermissionsSchema>;

const InvoicesPermissionsSchema = z.object({
  view: z.boolean().default(false),
  reprint: z.boolean().default(false),
  void: z.boolean().default(false),
}).strict();

const PosPermissionsSchema = ModulePermissionsSchema.extend({
  splitKitchen: z.boolean().default(false),
  tableAction: z.boolean().default(false),
  checkout: z.boolean().default(false),
}).default({
  view: false,
  create: false,
  update: false,
  delete: false,
  splitKitchen: false,
  tableAction: false,
  checkout: false,
});

const CashflowPermissionsSchema = z.object({
  view: z.boolean().default(false),
  create: z.boolean().default(false),
  config: z.boolean().default(false),
}).strict();

const SchedulePermissionsSchema = z.object({
  view: z.boolean().default(false),
  update: z.boolean().default(false),
}).strict();

const MdmPermissionsSchema = z.object({
  view: z.boolean().default(false),
  write: z.boolean().default(false),
}).strict();

const RbacPermissionsSchema = z.object({
  view: z.boolean().default(false),
  manage: z.boolean().default(false),
}).strict();

const UserAdminEmployeeSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  position: z.object({ id: IdSchema, name: z.string() }).nullable(),
  specialty: z.object({ id: IdSchema, name: z.string() }).nullable(),
});

export const UserPermissionsSchema = z.object({
  pos: PosPermissionsSchema,
  invoices: InvoicesPermissionsSchema.default({ view: false, reprint: false, void: false }),
  inventory: ModulePermissionsSchema.default({ view: false, create: false, update: false, delete: false }),
  cashflow: CashflowPermissionsSchema.default({ view: false, create: false, config: false }),
  employees: ModulePermissionsSchema.default({ view: false, create: false, update: false, delete: false }),
  schedules: SchedulePermissionsSchema.default({ view: false, update: false }),
  mdm: MdmPermissionsSchema.default({ view: false, write: false }),
  rbac: RbacPermissionsSchema.default({ view: false, manage: false }),
}).strict();
export type UserPermissions = z.infer<typeof UserPermissionsSchema>;

export const defaultUserPermissions: UserPermissions = {
  pos: { view: false, create: false, update: false, delete: false, splitKitchen: false, tableAction: false, checkout: false },
  invoices: { view: false, reprint: false, void: false },
  inventory: { view: false, create: false, update: false, delete: false },
  cashflow: { view: false, create: false, config: false },
  employees: { view: false, create: false, update: false, delete: false },
  schedules: { view: false, update: false },
  mdm: { view: false, write: false },
  rbac: { view: false, manage: false },
};

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(6).max(128),
}).strict();
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const AuthPrincipalSchema = z.object({
  id: IdSchema,
  employeeId: IdSchema,
  username: z.string().min(1),
  isSuperAdmin: z.boolean(),
  permissions: UserPermissionsSchema,
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
});
export type ProfileResponse = z.infer<typeof ProfileResponseSchema>;

export const AuthResponseSchema = z.object({
  accessToken: z.string().min(1),
  user: AuthUserSchema,
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

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

export const UserListQuerySchema = z.object({
  ...PaginationFields,
  keyword: z.string().trim().min(1).optional(),
}).strict();
export type UserListQuery = z.infer<typeof UserListQuerySchema>;

export const UserAdminRecordSchema = AuthUserSchema.extend({
  isActive: z.boolean(),
  employee: UserAdminEmployeeSchema,
});
export type UserAdminRecord = z.infer<typeof UserAdminRecordSchema>;

export const UserListResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  items: z.array(UserAdminRecordSchema),
});
export type UserListResponse = z.infer<typeof UserListResponseSchema>;
