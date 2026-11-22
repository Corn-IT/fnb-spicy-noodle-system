import { z } from 'zod';
import { IdSchema, IsoDateSchema, PaginationFields } from './common.schema';
import { AvatarUrlSchema } from './profile.schema';
import { CreateUserSchema } from './rbac.schema';

const optionalText = (maxLength: number) => z.string().trim().max(maxLength).nullable().optional();

const EmployeeFields = {
  fullName: z.string().trim().min(2).max(160),
  dob: IsoDateSchema.nullable().optional(),
  phone: optionalText(32),
  address: optionalText(500),
  citizenId: optionalText(32),
  citizenIdIssuedPlace: optionalText(160),
  positionId: IdSchema,
  specialtyId: IdSchema,
  startDate: IsoDateSchema.nullable().optional(),
  bankName: optionalText(120),
  bankAccountNo: optionalText(64),
  bankAccountName: optionalText(160),
  avatarUrl: AvatarUrlSchema.nullable().optional(),
  attachmentUrls: z.array(z.url()),
  note: optionalText(1000),
};

const EmployeeBaseSchema = z.object(EmployeeFields).strict();

export const CreateEmployeeSchema = EmployeeBaseSchema.extend({
  attachmentUrls: z.array(z.url()).default([]),
  account: CreateUserSchema.omit({ employeeId: true }).optional(),
}).strict();
export type CreateEmployeeInput = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = EmployeeBaseSchema.partial().strict().refine((employee) => Object.keys(employee).length > 0, {
  message: 'Phải cung cấp ít nhất một trường cần cập nhật',
});
export type UpdateEmployeeInput = z.infer<typeof UpdateEmployeeSchema>;

export const SetEmployeeActiveStatusSchema = z.object({ isActive: z.boolean() }).strict();
export type SetEmployeeActiveStatusInput = z.infer<typeof SetEmployeeActiveStatusSchema>;

export const EmployeeFilterQuerySchema = z.object({
  ...PaginationFields,
  keyword: z.string().trim().min(1).optional(),
  positionId: z.coerce.number().int().positive().optional(),
  specialtyId: z.coerce.number().int().positive().optional(),
  includeDeleted: z.coerce.boolean().default(false),
  inactiveOnly: z.preprocess((value) => value === true || value === 'true', z.boolean()).optional(),
});
export type EmployeeFilterQuery = z.infer<typeof EmployeeFilterQuerySchema>;

export const ScheduleAttendanceModeSchema = z.enum(['FULL_SHIFT', 'CUSTOM_HOURS']);
export type ScheduleAttendanceMode = z.infer<typeof ScheduleAttendanceModeSchema>;

export const ScheduleAttendanceEntrySchema = z.object({
  employeeId: IdSchema,
  mode: ScheduleAttendanceModeSchema.optional(),
  startTime: z.string().trim().max(16).optional(),
  endTime: z.string().trim().max(16).optional(),
}).strict();
export type ScheduleAttendanceEntry = z.infer<typeof ScheduleAttendanceEntrySchema>;

export const ScheduleCellSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  timeSlot: z.string().trim().min(1).max(100),
  employeeIds: z.array(IdSchema).max(100),
  attendances: z.array(ScheduleAttendanceEntrySchema).max(100).optional(),
}).strict().refine((cell) => new Set(cell.employeeIds).size === cell.employeeIds.length, {
  message: 'Không được gán trùng một nhân viên trong cùng ô lịch',
  path: ['employeeIds'],
});
export type ScheduleCell = z.infer<typeof ScheduleCellSchema>;

export const ScheduleWeekQuerySchema = z.object({
  weekStartDate: IsoDateSchema,
}).strict().refine((query) => new Date(`${query.weekStartDate}T00:00:00.000Z`).getUTCDay() === 1, {
  message: 'Ngày bắt đầu tuần phải là Thứ Hai',
  path: ['weekStartDate'],
});
export type ScheduleWeekQuery = z.infer<typeof ScheduleWeekQuerySchema>;

export const BulkSaveScheduleRequestSchema = z.object({
  weekStartDate: IsoDateSchema,
  cells: z.array(ScheduleCellSchema).min(7),
}).strict()
  .refine((request) => new Date(`${request.weekStartDate}T00:00:00.000Z`).getUTCDay() === 1, {
    message: 'Ngày bắt đầu tuần phải là Thứ Hai',
    path: ['weekStartDate'],
  })
  .refine((request) => new Set(request.cells.map((cell) => cell.dayOfWeek)).size === 7, {
    message: 'Lịch tuần phải có đủ 7 ngày',
    path: ['cells'],
  })
  .refine((request) => new Set(request.cells.map((cell) => `${cell.dayOfWeek}:${cell.timeSlot}`)).size === request.cells.length, {
    message: 'Không được lặp ngày và ca trong lịch tuần',
    path: ['cells'],
  });
export type BulkSaveScheduleRequest = z.infer<typeof BulkSaveScheduleRequestSchema>;

export const CopyPreviousWeekRequestSchema = z.object({
  sourceWeekStartDate: IsoDateSchema,
  targetWeekStartDate: IsoDateSchema,
}).strict()
  .refine((request) => new Date(`${request.sourceWeekStartDate}T00:00:00.000Z`).getUTCDay() === 1, {
    message: 'Ngày bắt đầu tuần nguồn phải là Thứ Hai',
    path: ['sourceWeekStartDate'],
  })
  .refine((request) => new Date(`${request.targetWeekStartDate}T00:00:00.000Z`).getUTCDay() === 1, {
    message: 'Ngày bắt đầu tuần đích phải là Thứ Hai',
    path: ['targetWeekStartDate'],
  })
  .refine((request) => {
    const source = new Date(`${request.sourceWeekStartDate}T00:00:00.000Z`).getTime();
    const target = new Date(`${request.targetWeekStartDate}T00:00:00.000Z`).getTime();
    return target - source === 7 * 24 * 60 * 60 * 1000;
  }, {
  message: 'Tuần nguồn phải liền trước tuần đích',
  path: ['targetWeekStartDate'],
});
export type CopyPreviousWeekRequest = z.infer<typeof CopyPreviousWeekRequestSchema>;

export const PayrollShiftTypeSchema = z.enum(['FULL_TIME', 'PART_TIME']);
export type PayrollShiftType = z.infer<typeof PayrollShiftTypeSchema>;

export const PayrollConfigSchema = z.object({
  defaultBaseSalary: z.number().nonnegative().max(1000000000).default(7000000),
  standardFullTimeDays: z.number().int().min(1).max(31).default(28),
  standardHoursPerDay: z.number().positive().max(24).default(12),
  defaultPartTimeHourlyRate: z.number().nonnegative().max(10000000).default(25000),
}).strict();
export type PayrollConfig = z.infer<typeof PayrollConfigSchema>;

export const UpdatePayrollConfigSchema = PayrollConfigSchema;
export type UpdatePayrollConfigInput = z.infer<typeof UpdatePayrollConfigSchema>;

export const PayrollQuerySchema = z.object({
  fromDate: IsoDateSchema,
  toDate: IsoDateSchema,
  keyword: z.string().trim().min(1).optional(),
}).strict().refine((q) => q.fromDate <= q.toDate, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type PayrollQuery = z.infer<typeof PayrollQuerySchema>;

export const UpdateEmployeePayrollSchema = z.object({
  fromDate: IsoDateSchema,
  toDate: IsoDateSchema,
  shiftType: PayrollShiftTypeSchema,
  useCustomRate: z.boolean().default(false),
  customBaseSalary: z.number().nonnegative().max(1000000000).nullable().optional(),
  customHourlyRate: z.number().nonnegative().max(10000000).nullable().optional(),
  overrideFullShiftDays: z.number().min(0).max(366).nullable().optional(),
  overrideCustomHours: z.number().min(0).max(8784).nullable().optional(),
  bonusOrAdjustment: z.number().finite().min(-1000000000).max(1000000000).default(0),
  note: z.string().trim().max(500).nullable().optional(),
}).strict();
export type UpdateEmployeePayrollInput = z.infer<typeof UpdateEmployeePayrollSchema>;

export const PayrollRowSchema = z.object({
  employeeId: IdSchema,
  fullName: z.string().min(1),
  shortName: z.string().min(1),
  isDeleted: z.boolean(),
  positionName: z.string().nullable(),
  specialtyName: z.string().nullable(),
  shiftType: PayrollShiftTypeSchema,
  scheduleFullShiftDays: z.number().nonnegative(),
  scheduleCustomHours: z.number().nonnegative(),
  fullShiftDays: z.number().nonnegative(),
  customHours: z.number().nonnegative(),
  hasManualOverride: z.boolean(),
  useCustomRate: z.boolean(),
  appliedBaseSalary: z.number().nonnegative(),
  appliedHourlyRate: z.number().nonnegative(),
  bonusOrAdjustment: z.number().finite(),
  note: z.string().nullable(),
  totalSalary: z.number().finite(),
}).strict();
export type PayrollRow = z.infer<typeof PayrollRowSchema>;

export const PayrollSummaryResponseSchema = z.object({
  fromDate: IsoDateSchema,
  toDate: IsoDateSchema,
  config: PayrollConfigSchema,
  items: z.array(PayrollRowSchema),
  summary: z.object({
    totalEmployees: z.number().int().nonnegative(),
    totalFullShiftDays: z.number().nonnegative(),
    totalCustomHours: z.number().nonnegative(),
    totalSalary: z.number().finite(),
  }).strict(),
}).strict();
export type PayrollSummaryResponse = z.infer<typeof PayrollSummaryResponseSchema>;
