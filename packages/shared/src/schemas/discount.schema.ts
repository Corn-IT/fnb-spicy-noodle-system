import { z } from 'zod';
import {
  DiscountKindSchema,
  DiscountScopeSchema,
  DiscountValueTypeSchema,
  DiscountWarningCodeSchema,
} from '../enums/discount.enum';
import {
  IdSchema,
  IsoDateTimeSchema,
  MoneyAmountSchema,
  PaginationFields,
} from './common.schema';

export const DiscountCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9_-]{3,32}$/,
    'Mã giảm giá chỉ gồm chữ hoa, số, dấu gạch dưới hoặc gạch ngang (3–32 ký tự)',
  );

export const WeekdayNumberSchema = z.number().int().min(1).max(7);

export const TimeWindowHhMmSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Khung giờ phải đúng định dạng HH:mm');

export const DiscountSnapshotSchema = z
  .object({
    kind: DiscountKindSchema,
    discountId: IdSchema.nullable(),
    code: z.string().trim().min(1).max(32).nullable(),
    name: z.string().trim().min(1).max(128),
    valueType: DiscountValueTypeSchema,
    value: MoneyAmountSchema.positive(),
    maxDiscountAmount: MoneyAmountSchema.positive().nullable(),
    scope: DiscountScopeSchema,
    targetCategoryIds: z.array(IdSchema).default([]),
    targetProductIds: z.array(IdSchema).default([]),
    minOrderAmount: MoneyAmountSchema.positive().nullable(),
    appliedAt: IsoDateTimeSchema,
    appliedBy: IdSchema,
    reason: z.string().trim().max(255).nullable().optional(),
  })
  .strict();

export type DiscountSnapshot = z.infer<typeof DiscountSnapshotSchema>;

const DiscountMutableShape = {
  code: DiscountCodeSchema,
  name: z.string().trim().min(1, 'Tên chương trình giảm giá không được để trống').max(128),
  valueType: DiscountValueTypeSchema,
  value: MoneyAmountSchema.positive('Giá trị giảm phải lớn hơn 0'),
  maxDiscountAmount: MoneyAmountSchema.positive('Mức giảm tối đa phải lớn hơn 0').nullable().optional().default(null),
  scope: DiscountScopeSchema,
  targetCategoryIds: z.array(IdSchema).default([]),
  targetProductIds: z.array(IdSchema).default([]),
  minOrderAmount: MoneyAmountSchema.positive('Đơn tối thiểu phải lớn hơn 0').nullable().optional().default(null),
  startsAt: IsoDateTimeSchema.nullable().optional().default(null),
  endsAt: IsoDateTimeSchema.nullable().optional().default(null),
  activeWeekdays: z.array(WeekdayNumberSchema).max(7).default([]),
  timeWindowStart: TimeWindowHhMmSchema.nullable().optional().default(null),
  timeWindowEnd: TimeWindowHhMmSchema.nullable().optional().default(null),
  usageLimit: z.number().int().positive('Giới hạn lượt phải lớn hơn 0').nullable().optional().default(null),
  isActive: z.boolean().optional().default(true),
};

function validateDiscountConstraints(
  data: {
    valueType: 'PERCENT' | 'FIXED';
    value: number;
    maxDiscountAmount: number | null | undefined;
    scope: 'ORDER' | 'CATEGORY' | 'PRODUCT';
    targetCategoryIds: number[];
    targetProductIds: number[];
    startsAt: string | null | undefined;
    endsAt: string | null | undefined;
    activeWeekdays: number[];
    timeWindowStart: string | null | undefined;
    timeWindowEnd: string | null | undefined;
  },
  ctx: z.RefinementCtx,
) {
  if (data.valueType === 'PERCENT') {
    if (data.value <= 0 || data.value > 100) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Phần trăm giảm giá phải từ > 0% đến 100%',
      });
    }
  } else if (data.maxDiscountAmount !== null && data.maxDiscountAmount !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['maxDiscountAmount'],
      message: 'Giảm cố định không hỗ trợ giới hạn mức giảm tối đa',
    });
  }

  if (data.scope === 'ORDER') {
    if (data.targetCategoryIds.length > 0 || data.targetProductIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scope'],
        message: 'Giảm giá theo tổng hoá đơn không được chọn danh mục hoặc món riêng',
      });
    }
  } else if (data.scope === 'CATEGORY') {
    if (data.targetCategoryIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCategoryIds'],
        message: 'Vui lòng chọn ít nhất 1 danh mục món áp dụng',
      });
    }
    if (data.targetProductIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetProductIds'],
        message: 'Phạm vi danh mục không được đồng thời chọn món riêng',
      });
    }
  } else if (data.scope === 'PRODUCT') {
    if (data.targetProductIds.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetProductIds'],
        message: 'Vui lòng chọn ít nhất 1 món áp dụng',
      });
    }
    if (data.targetCategoryIds.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targetCategoryIds'],
        message: 'Phạm vi món ăn không được đồng thời chọn danh mục',
      });
    }
  }

  if (new Set(data.targetCategoryIds).size !== data.targetCategoryIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetCategoryIds'],
      message: 'Danh sách danh mục áp dụng không được trùng lặp',
    });
  }

  if (new Set(data.targetProductIds).size !== data.targetProductIds.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetProductIds'],
      message: 'Danh sách món áp dụng không được trùng lặp',
    });
  }

  if (new Set(data.activeWeekdays).size !== data.activeWeekdays.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['activeWeekdays'],
      message: 'Ngày trong tuần không được trùng lặp',
    });
  }

  if (data.startsAt && data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endsAt'],
      message: 'Thời gian kết thúc phải sau thời gian bắt đầu',
    });
  }

  const hasStartWindow = data.timeWindowStart !== null && data.timeWindowStart !== undefined;
  const hasEndWindow = data.timeWindowEnd !== null && data.timeWindowEnd !== undefined;
  if (hasStartWindow !== hasEndWindow) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timeWindowEnd'],
      message: 'Khung giờ áp dụng phải nhập đầy đủ cả giờ bắt đầu và giờ kết thúc',
    });
  } else if (
    hasStartWindow &&
    hasEndWindow &&
    data.timeWindowStart! >= data.timeWindowEnd!
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['timeWindowEnd'],
      message: 'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày',
    });
  }
}

export const CreateDiscountSchema = z
  .object(DiscountMutableShape)
  .strict()
  .superRefine(validateDiscountConstraints);
export type CreateDiscountInput = z.infer<typeof CreateDiscountSchema>;

export const UpdateDiscountSchema = z
  .object(DiscountMutableShape)
  .strict()
  .superRefine(validateDiscountConstraints);
export type UpdateDiscountInput = z.infer<typeof UpdateDiscountSchema>;

export const ToggleDiscountStatusSchema = z
  .object({
    isActive: z.boolean(),
  })
  .strict();
export type ToggleDiscountStatusInput = z.infer<typeof ToggleDiscountStatusSchema>;

export const DiscountStatusFilterSchema = z.enum([
  'all',
  'active',
  'inactive',
  'expired',
  'archived',
]);
export type DiscountStatusFilter = z.infer<typeof DiscountStatusFilterSchema>;

export const DiscountFilterQuerySchema = z
  .object({
    ...PaginationFields,
    keyword: z.string().trim().min(1).optional(),
    status: DiscountStatusFilterSchema.default('all'),
    scope: DiscountScopeSchema.optional(),
  })
  .strict();
export type DiscountFilterQuery = z.infer<typeof DiscountFilterQuerySchema>;

export const DiscountTargetDetailSchema = z
  .object({
    categoryId: IdSchema.nullable(),
    categoryName: z.string().nullable(),
    productId: IdSchema.nullable(),
    productName: z.string().nullable(),
  })
  .strict();

export const DiscountRecordSchema = z
  .object({
    id: IdSchema,
    code: z.string().trim().min(3).max(32),
    name: z.string().trim().min(1).max(128),
    valueType: DiscountValueTypeSchema,
    value: MoneyAmountSchema,
    maxDiscountAmount: MoneyAmountSchema.nullable(),
    scope: DiscountScopeSchema,
    targetCategoryIds: z.array(IdSchema),
    targetProductIds: z.array(IdSchema),
    targets: z.array(DiscountTargetDetailSchema),
    minOrderAmount: MoneyAmountSchema.nullable(),
    startsAt: IsoDateTimeSchema.nullable(),
    endsAt: IsoDateTimeSchema.nullable(),
    activeWeekdays: z.array(WeekdayNumberSchema),
    timeWindowStart: TimeWindowHhMmSchema.nullable(),
    timeWindowEnd: TimeWindowHhMmSchema.nullable(),
    usageLimit: z.number().int().positive().nullable(),
    usedCount: z.number().int().nonnegative(),
    remainingCount: z.number().int().nonnegative().nullable(),
    totalDiscountedAmount: MoneyAmountSchema,
    isActive: z.boolean(),
    isArchived: z.boolean(),
    isLocked: z.boolean(),
    createdBy: IdSchema,
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict();
export type DiscountRecord = z.infer<typeof DiscountRecordSchema>;

export const DiscountListResponseSchema = z
  .object({
    page: IdSchema,
    limit: IdSchema,
    total: z.number().int().nonnegative(),
    items: z.array(DiscountRecordSchema),
  })
  .strict();
export type DiscountListResponse = z.infer<typeof DiscountListResponseSchema>;

export const ManualDiscountInputSchema = z
  .object({
    valueType: DiscountValueTypeSchema,
    value: MoneyAmountSchema.positive('Giá trị giảm tay phải lớn hơn 0'),
    reason: z.string().trim().min(3, 'Vui lòng nhập lý do giảm giá thủ công (tối thiểu 3 ký tự)').max(255),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.valueType === 'PERCENT' && (data.value < 1 || data.value > 100)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Giảm giá thủ công theo % phải từ 1% đến 100%',
      });
    }
  });
export type ManualDiscountInput = z.infer<typeof ManualDiscountInputSchema>;

export const ApplyPosDiscountRequestSchema = z.union([
  z.object({ code: DiscountCodeSchema }).strict(),
  z.object({ discountId: IdSchema }).strict(),
  z.object({ manual: ManualDiscountInputSchema }).strict(),
]);
export type ApplyPosDiscountRequest = z.infer<typeof ApplyPosDiscountRequestSchema>;

export const ApplicableDiscountItemSchema = z
  .object({
    id: IdSchema,
    code: z.string(),
    name: z.string(),
    valueType: DiscountValueTypeSchema,
    value: MoneyAmountSchema,
    maxDiscountAmount: MoneyAmountSchema.nullable(),
    scope: DiscountScopeSchema,
    minOrderAmount: MoneyAmountSchema.nullable(),
    targetCategoryIds: z.array(IdSchema),
    targetProductIds: z.array(IdSchema),
    endsAt: IsoDateTimeSchema.nullable(),
    usageLimit: z.number().int().positive().nullable(),
    usedCount: z.number().int().nonnegative(),
    remainingCount: z.number().int().nonnegative().nullable(),
    estimatedDiscountAmount: MoneyAmountSchema,
    isEligibleForCurrentOrder: z.boolean(),
    warningCode: DiscountWarningCodeSchema.nullable(),
    warningMessage: z.string().nullable(),
  })
  .strict();
export type ApplicableDiscountItem = z.infer<typeof ApplicableDiscountItemSchema>;

export const ApplicableDiscountsResponseSchema = z
  .object({
    subtotalAmount: MoneyAmountSchema,
    currentDiscountSnapshot: DiscountSnapshotSchema.nullable(),
    items: z.array(ApplicableDiscountItemSchema),
  })
  .strict();
export type ApplicableDiscountsResponse = z.infer<typeof ApplicableDiscountsResponseSchema>;
