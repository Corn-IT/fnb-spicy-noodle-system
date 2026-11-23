import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.schema';
import {
  ALLOWED_STORE_NAV_GROUP_KEYS,
  ALLOWED_STORE_NAV_PATHS,
  DisplayScalePercentSchema,
} from './store-settings.schema';

const NAV_PATH_SET: ReadonlySet<string> = new Set(ALLOWED_STORE_NAV_PATHS);
const NAV_GROUP_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_STORE_NAV_GROUP_KEYS);

/** Only screens and groups that exist in the app menu are accepted; anything else is rejected. */
const UserNavPathSchema = z
  .string()
  .refine((path) => NAV_PATH_SET.has(path), { message: 'Đường dẫn không nằm trong danh sách màn hình hỗ trợ' });
const UserNavGroupKeySchema = z
  .string()
  .refine((key) => NAV_GROUP_KEY_SET.has(key), { message: 'Mã nhóm menu không hợp lệ' });

const hasNoDuplicates = (values: readonly string[]): boolean => new Set(values).size === values.length;

/**
 * Per-account display scale override. Absent `globalPercent` / empty `perPath`
 * mean "no override" so the store-level display scale applies.
 */
export const UserDisplayScaleSchema = z.object({
  globalPercent: DisplayScalePercentSchema.optional(),
  perPath: z
    .record(z.string(), DisplayScalePercentSchema)
    .superRefine((map, ctx) => {
      for (const path of Object.keys(map)) {
        if (!NAV_PATH_SET.has(path)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path],
            message: `Đường dẫn ${path} không nằm trong danh sách màn hình hỗ trợ`,
          });
        }
      }
    })
    .default({}),
}).strict();
export type UserDisplayScale = z.infer<typeof UserDisplayScaleSchema>;

const UiPreferenceFields = {
  theme: z.enum(['light', 'dark', 'system']),
  sidebarWidth: z.number().int().min(180).max(480),
  columnWidths: z.record(z.string().min(1), z.number().finite().positive().max(2000)),
  displayScale: UserDisplayScaleSchema,
  navOrder: z.array(UserNavPathSchema).max(64).refine(hasNoDuplicates, { message: 'Thứ tự menu bị trùng mục' }),
  navGroupOrder: z
    .array(UserNavGroupKeySchema)
    .max(16)
    .refine(hasNoDuplicates, { message: 'Thứ tự nhóm menu bị trùng mục' }),
  sidebarCollapsed: z.boolean(),
  voiceAlertEnabled: z.boolean(),
};

export const UiPreferencesSchema = z.object({
  theme: UiPreferenceFields.theme.default('system'),
  sidebarWidth: UiPreferenceFields.sidebarWidth.default(260),
  columnWidths: UiPreferenceFields.columnWidths.default({}),
  displayScale: UiPreferenceFields.displayScale.default({ perPath: {} }),
  navOrder: UiPreferenceFields.navOrder.default([]),
  navGroupOrder: UiPreferenceFields.navGroupOrder.default([]),
  sidebarCollapsed: UiPreferenceFields.sidebarCollapsed.default(false),
  // Undefined means the account never chose, so the default (enabled) applies.
  voiceAlertEnabled: UiPreferenceFields.voiceAlertEnabled.optional(),
}).strict();
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;

export const UpdateUiPreferencesSchema = z.object({
  theme: UiPreferenceFields.theme.optional(),
  sidebarWidth: UiPreferenceFields.sidebarWidth.optional(),
  columnWidths: UiPreferenceFields.columnWidths.optional(),
  displayScale: UiPreferenceFields.displayScale.optional(),
  navOrder: UiPreferenceFields.navOrder.optional(),
  navGroupOrder: UiPreferenceFields.navGroupOrder.optional(),
  sidebarCollapsed: UiPreferenceFields.sidebarCollapsed.optional(),
  voiceAlertEnabled: UiPreferenceFields.voiceAlertEnabled.optional(),
}).strict().refine(
  (preferences) => Object.keys(preferences).length > 0,
  { message: 'Phải cung cấp ít nhất một thiết lập giao diện' },
);
export type UpdateUiPreferencesInput = z.infer<typeof UpdateUiPreferencesSchema>;

export const AvatarUrlSchema = z
  .string()
  .trim()
  .min(1)
  .max(1000)
  .refine(
    (value) => {
      if (value.startsWith('/api/v1/')) {
        return true;
      }
      try {
        const parsed = new URL(value);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'URL ảnh đại diện không hợp lệ (chỉ hỗ trợ http/https hoặc đường dẫn nội bộ)' },
  );

export const UploadAvatarSchema = z.object({
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp']),
  base64: z.string().trim().min(1),
}).strict();
export type UploadAvatarInput = z.infer<typeof UploadAvatarSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  bankAccountNo: z.string().trim().max(64).nullable().optional(),
  bankAccountName: z.string().trim().max(160).nullable().optional(),
  avatarUrl: AvatarUrlSchema.nullable().optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'Phải cung cấp ít nhất một trường cần cập nhật',
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

export const ProfileSessionInfoSchema = z.object({
  ipAddress: z.string().nullable().default(null),
  deviceLabel: z.string().nullable().default(null),
  startedAt: IsoDateTimeSchema.nullable().default(null),
});
export type ProfileSessionInfo = z.infer<typeof ProfileSessionInfoSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(128),
  newPassword: z.string().min(6).max(128),
  confirmPassword: z.string().min(6).max(128),
}).strict()
  .refine((input) => input.newPassword === input.confirmPassword, {
    message: 'Mật khẩu xác nhận không khớp',
    path: ['confirmPassword'],
  })
  .refine((input) => input.currentPassword !== input.newPassword, {
    message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
    path: ['newPassword'],
  });
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

const MasterDataReferenceSchema = z.object({ id: IdSchema, name: z.string().min(1) }).nullable();

export const EmployeeProfileSchema = z.object({
  id: IdSchema,
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  bankName: z.string().nullable(),
  bankAccountNo: z.string().nullable(),
  bankAccountName: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  position: MasterDataReferenceSchema,
  specialty: MasterDataReferenceSchema,
});
export type EmployeeProfile = z.infer<typeof EmployeeProfileSchema>;
