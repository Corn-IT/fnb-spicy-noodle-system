import { z } from 'zod';
import { IdSchema, IsoDateSchema, PaginationFields } from './common.schema';
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
  avatarUrl: z.url().nullable().optional(),
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

export const ScheduleCellSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  timeSlot: z.string().trim().min(1).max(100),
  employeeIds: z.array(IdSchema).max(100),
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
