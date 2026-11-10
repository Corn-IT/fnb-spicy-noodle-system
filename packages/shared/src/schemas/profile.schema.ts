import { z } from 'zod';
import { IdSchema } from './common.schema';

const UiPreferenceFields = {
  theme: z.enum(['light', 'dark', 'system']),
  sidebarWidth: z.number().int().min(180).max(480),
  columnWidths: z.record(z.string().min(1), z.number().finite().positive().max(2000)),
};

export const UiPreferencesSchema = z.object({
  theme: UiPreferenceFields.theme.default('system'),
  sidebarWidth: UiPreferenceFields.sidebarWidth.default(260),
  columnWidths: UiPreferenceFields.columnWidths.default({}),
}).strict();
export type UiPreferences = z.infer<typeof UiPreferencesSchema>;

export const UpdateUiPreferencesSchema = z.object({
  theme: UiPreferenceFields.theme.optional(),
  sidebarWidth: UiPreferenceFields.sidebarWidth.optional(),
  columnWidths: UiPreferenceFields.columnWidths.optional(),
}).strict().refine(
  (preferences) => Object.keys(preferences).length > 0,
  { message: 'Phải cung cấp ít nhất một thiết lập giao diện' },
);
export type UpdateUiPreferencesInput = z.infer<typeof UpdateUiPreferencesSchema>;

export const UpdateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(32).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  bankName: z.string().trim().max(120).nullable().optional(),
  bankAccountNo: z.string().trim().max(64).nullable().optional(),
  bankAccountName: z.string().trim().max(160).nullable().optional(),
  avatarUrl: z.url().nullable().optional(),
}).strict().refine((profile) => Object.keys(profile).length > 0, {
  message: 'Phải cung cấp ít nhất một trường cần cập nhật',
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

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
