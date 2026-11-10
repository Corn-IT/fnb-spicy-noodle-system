import { z } from 'zod';
import { PaymentSourceSchema } from '../enums/mdm-cashflow.enum';
import { IdSchema, IsoDateSchema, IsoDateTimeSchema, MoneyAmountSchema, PaginationFields, QuantitySchema } from './common.schema';

export const InventoryImportItemInputSchema = z.object({
  ingredientMdmId: IdSchema.optional(),
  ingredientName: z.string().min(1).max(160).optional(),
  itemNameSnapshot: z.string().min(1).max(160).optional(),
  unitName: z.string().min(1).max(80),
  unitPrice: MoneyAmountSchema,
  quantity: QuantitySchema,
}).strict()
  .refine((item) => Boolean(item.ingredientName || item.itemNameSnapshot || item.ingredientMdmId), {
    message: 'Phải chọn hoặc nhập tên nguyên liệu',
    path: ['ingredientName'],
  })
  .refine((item) => item.unitPrice * item.quantity <= 9_999_999_999.99, {
    message: 'Thành tiền vượt giới hạn NUMERIC(12,2)',
    path: ['quantity'],
  });
export type InventoryImportItemInput = z.infer<typeof InventoryImportItemInputSchema>;

export const CreateInventoryImportBatchSchema = z.object({
  supplierMdmId: IdSchema.optional(),
  supplierName: z.string().trim().min(1).max(160).optional(),
  items: z.array(InventoryImportItemInputSchema).min(1),
  paymentSource: PaymentSourceSchema.default('CASH_DRAWER'),
  importDate: IsoDateSchema,
  note: z.string().trim().max(1000).optional(),
}).strict().refine((batch) => Boolean(batch.supplierMdmId || batch.supplierName), {
  message: 'Phải chọn hoặc nhập nhà cung cấp',
  path: ['supplierName'],
});
export type CreateInventoryImportBatchInput = z.infer<typeof CreateInventoryImportBatchSchema>;

export const InventoryImportRecordSchema = z.object({
  id: IdSchema,
  ingredientMdmId: IdSchema,
  supplierMdmId: IdSchema.nullable(),
  supplierNameSnapshot: z.string().nullable(),
  itemNameSnapshot: z.string().min(1),
  unitName: z.string().min(1),
  unitPrice: MoneyAmountSchema,
  quantity: QuantitySchema,
  totalCost: MoneyAmountSchema,
  paymentSource: PaymentSourceSchema,
  importDate: z.union([IsoDateSchema, IsoDateTimeSchema]),
  note: z.string().nullable(),
  createdBy: IdSchema,
  isDeleted: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type InventoryImportRecord = z.infer<typeof InventoryImportRecordSchema>;

export const InventoryImportListResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  items: z.array(InventoryImportRecordSchema),
  summary: z.object({
    totalImportCost: MoneyAmountSchema,
    totalCashDrawerCost: MoneyAmountSchema,
    totalExternalCost: MoneyAmountSchema,
  }),
});
export type InventoryImportListResponse = z.infer<typeof InventoryImportListResponseSchema>;

export const CreateInventoryImportBatchResponseSchema = z.object({
  items: z.array(InventoryImportRecordSchema),
  totalCost: MoneyAmountSchema,
});
export type CreateInventoryImportBatchResponse = z.infer<typeof CreateInventoryImportBatchResponseSchema>;

export const InventoryImportFilterQuerySchema = z.object({
  ...PaginationFields,
  fromDate: IsoDateSchema.optional(),
  toDate: IsoDateSchema.optional(),
  ingredientMdmId: IdSchema.optional(),
  paymentSource: PaymentSourceSchema.optional(),
  keyword: z.string().trim().min(1).optional(),
}).refine((filter) => filter.fromDate === undefined || filter.toDate === undefined || filter.fromDate <= filter.toDate, {
  message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
  path: ['toDate'],
});
export type InventoryImportFilterQuery = z.infer<typeof InventoryImportFilterQuerySchema>;
