import { z } from 'zod';
import { VietQrBankCodeSchema } from '../constants/vietqr-banks';
import { OrderTypeSchema } from '../enums/order.enum';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, MoneyAmountSchema, PaginationFields } from './common.schema';

export const PaymentAccountStatus = {
  AVAILABLE: 'AVAILABLE',
  DAY_FULL: 'DAY_FULL',
  MONTH_FULL: 'MONTH_FULL',
  YEAR_FULL: 'YEAR_FULL',
  INACTIVE: 'INACTIVE',
} as const;
export type PaymentAccountStatus = (typeof PaymentAccountStatus)[keyof typeof PaymentAccountStatus];

export const PaymentAccountStatusSchema = z.enum([
  PaymentAccountStatus.AVAILABLE,
  PaymentAccountStatus.DAY_FULL,
  PaymentAccountStatus.MONTH_FULL,
  PaymentAccountStatus.YEAR_FULL,
  PaymentAccountStatus.INACTIVE,
]);

export const PositiveLimitAmountSchema = MoneyAmountSchema.refine(
  (value) => value > 0,
  'Hạn mức phải lớn hơn 0',
);

export const PaymentAccountBriefSchema = z.object({
  id: IdSchema,
  label: z.string().trim().min(1).max(64),
  bankCode: VietQrBankCodeSchema,
  bankName: z.string().trim().min(1).max(128),
  accountNo: z.string().trim().min(1).max(32),
  accountName: z.string().trim().min(1).max(128),
}).strict();
export type PaymentAccountBrief = z.infer<typeof PaymentAccountBriefSchema>;

export const PaymentAccountSchema = z.object({
  id: IdSchema,
  label: z.string().trim().min(1).max(64),
  bankCode: VietQrBankCodeSchema,
  bankName: z.string().trim().min(1).max(128),
  accountNo: z.string().trim().min(1).max(32),
  accountName: z.string().trim().min(1).max(128),
  priority: z.number().int().positive(),
  isActive: z.boolean(),
  dailyLimit: PositiveLimitAmountSchema.nullable(),
  monthlyLimit: PositiveLimitAmountSchema.nullable(),
  yearlyLimit: PositiveLimitAmountSchema.nullable(),
  usedDay: MoneyAmountSchema,
  usedMonth: MoneyAmountSchema,
  usedYear: MoneyAmountSchema,
  status: PaymentAccountStatusSchema,
  hasOrders: z.boolean(),
  orderCount: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
}).strict();
export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;

export function findPaymentQrLimitHierarchyViolation(limits: {
  dailyLimit: number | null;
  monthlyLimit: number | null;
  yearlyLimit: number | null;
}): { field: 'monthlyLimit' | 'yearlyLimit'; message: string } | null {
  const { dailyLimit, monthlyLimit, yearlyLimit } = limits;
  if (dailyLimit !== null && monthlyLimit !== null && dailyLimit > monthlyLimit) {
    return {
      field: 'monthlyLimit',
      message: 'Hạn mức Tháng phải lớn hơn hoặc bằng Hạn mức Ngày',
    };
  }
  if (monthlyLimit !== null && yearlyLimit !== null && monthlyLimit > yearlyLimit) {
    return {
      field: 'yearlyLimit',
      message: 'Hạn mức Năm phải lớn hơn hoặc bằng Hạn mức Tháng',
    };
  }
  if (dailyLimit !== null && yearlyLimit !== null && dailyLimit > yearlyLimit) {
    return {
      field: 'yearlyLimit',
      message: 'Hạn mức Năm phải lớn hơn hoặc bằng Hạn mức Ngày',
    };
  }
  return null;
}

export const CreatePaymentAccountRequestSchema = z.object({
  label: z.string().trim().min(1, 'Tên gợi nhớ không được để trống').max(64),
  bankCode: VietQrBankCodeSchema,
  accountNo: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{4,32}$/, 'Số tài khoản chỉ gồm chữ và số (4–32 ký tự)'),
  accountName: z.string().trim().min(2, 'Tên chủ tài khoản không hợp lệ').max(128),
  isActive: z.boolean().default(true),
  dailyLimit: PositiveLimitAmountSchema.nullable().optional().default(null),
  monthlyLimit: PositiveLimitAmountSchema.nullable().optional().default(null),
  yearlyLimit: PositiveLimitAmountSchema.nullable().optional().default(null),
})
  .strict()
  .superRefine((value, ctx) => {
    const violation = findPaymentQrLimitHierarchyViolation(value);
    if (violation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [violation.field],
        message: violation.message,
      });
    }
  });
export type CreatePaymentAccountRequest = z.infer<typeof CreatePaymentAccountRequestSchema>;

export const UpdatePaymentAccountRequestSchema = z.object({
  label: z.string().trim().min(1, 'Tên gợi nhớ không được để trống').max(64).optional(),
  bankCode: VietQrBankCodeSchema.optional(),
  accountNo: z
    .string()
    .trim()
    .regex(/^[0-9A-Za-z]{4,32}$/, 'Số tài khoản chỉ gồm chữ và số (4–32 ký tự)')
    .optional(),
  accountName: z.string().trim().min(2, 'Tên chủ tài khoản không hợp lệ').max(128).optional(),
  isActive: z.boolean().optional(),
  dailyLimit: PositiveLimitAmountSchema.nullable().optional(),
  monthlyLimit: PositiveLimitAmountSchema.nullable().optional(),
  yearlyLimit: PositiveLimitAmountSchema.nullable().optional(),
})
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'Phải cung cấp ít nhất một trường cần cập nhật',
  });
export type UpdatePaymentAccountRequest = z.infer<typeof UpdatePaymentAccountRequestSchema>;

export const ReorderPaymentAccountsRequestSchema = z.object({
  orderedIds: z
    .array(IdSchema)
    .min(1, 'Danh sách sắp xếp không được rỗng')
    .refine((ids) => new Set(ids).size === ids.length, 'Danh sách ID không được trùng lặp'),
}).strict();
export type ReorderPaymentAccountsRequest = z.infer<typeof ReorderPaymentAccountsRequestSchema>;

export const PaymentAccountOrdersQuerySchema = z.object({
  ...PaginationFields,
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
})
  .strict()
  .refine(
    (filter) =>
      filter.fromDate === undefined ||
      filter.toDate === undefined ||
      filter.fromDate <= filter.toDate,
    {
      message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
      path: ['toDate'],
    },
  );
export type PaymentAccountOrdersQuery = z.infer<typeof PaymentAccountOrdersQuerySchema>;

export const PaymentAccountOrderItemSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().min(1),
  orderType: OrderTypeSchema,
  tableLabel: z.string().nullable(),
  paymentMethod: z.enum(['TRANSFER', 'SPLIT']),
  totalAmount: MoneyAmountSchema,
  transferAmount: MoneyAmountSchema,
  paidAt: IsoDateTimeSchema,
  cashierName: z.string().nullable(),
}).strict();
export type PaymentAccountOrderItem = z.infer<typeof PaymentAccountOrderItemSchema>;

export const PaymentAccountOrdersResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalTransferAmount: MoneyAmountSchema,
  items: z.array(PaymentAccountOrderItemSchema),
}).strict();
export type PaymentAccountOrdersResponse = z.infer<typeof PaymentAccountOrdersResponseSchema>;
