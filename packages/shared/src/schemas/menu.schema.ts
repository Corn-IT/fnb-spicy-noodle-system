import { z } from 'zod';
import { ProductStationSchema } from '../enums/station.enum';
import { TableStatusSchema } from '../enums/order.enum';
import { IdSchema, MoneyAmountSchema, QrTokenSchema } from './common.schema';
import { validateGroupSubstitutionRules } from '../utils/modifier-substitution.util';

export const AllowedSubstituteNamesSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50)
  .nullable()
  .optional();

export const ModifierSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  extraPrice: MoneyAmountSchema,
  isDefaultChecked: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  defaultSubstituteName: z.string().trim().max(120).nullable().optional(),
  allowedSubstituteNames: AllowedSubstituteNamesSchema,
}).strict();
export type Modifier = z.infer<typeof ModifierSchema>;

export const ModifierGroupSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  isRequired: z.boolean(),
  maxSelect: z.number().int().positive(),
  isAutoSelect: z.boolean().optional(),
  allowSubstitution: z.boolean().optional(),
  modifiers: z.array(ModifierSchema).min(1),
}).strict();
export type ModifierGroup = z.infer<typeof ModifierGroupSchema>;

const ModifierInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  extraPrice: MoneyAmountSchema.default(0),
  isDefaultChecked: z.boolean().default(false),
  isAvailable: z.boolean().default(true),
  defaultSubstituteName: z.string().trim().max(120).nullable().optional(),
  allowedSubstituteNames: AllowedSubstituteNamesSchema,
}).strict();

const ModifierGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isRequired: z.boolean().default(false),
  maxSelect: z.number().int().positive().default(1),
  isAutoSelect: z.boolean().default(false),
  allowSubstitution: z.boolean().default(false),
  modifiers: z.array(ModifierInputSchema).min(1),
}).strict().superRefine((group, ctx) => {
  const errorMessage = validateGroupSubstitutionRules(group);
  if (errorMessage) {
    ctx.addIssue({
      code: 'custom',
      message: errorMessage,
      path: ['modifiers'],
    });
  }
});

export const ComboItemSchema = z.object({
  productId: IdSchema,
  quantity: z.number().int().positive(),
}).strict();
export type ComboItem = z.infer<typeof ComboItemSchema>;

const ProductFields = {
  name: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(255).nullable().optional(),
  categoryId: IdSchema.nullable().optional(),
  categoryName: z.string().trim().max(120).nullable().optional(),
  price: MoneyAmountSchema,
  station: ProductStationSchema,
  isAvailable: z.boolean().default(true),
  imageUrl: z.url().nullable().optional(),
  sortOrder: z.number().int().nonnegative().default(0),
};

const ProductBaseSchema = z.object(ProductFields).strict();

const comboCompositionIsValid = (value: {
  station?: z.infer<typeof ProductStationSchema>;
  comboItems?: z.infer<typeof ComboItemSchema>[];
}): boolean => {
  if (value.station === 'COMBO') return (value.comboItems?.length ?? 0) > 0;
  return value.comboItems === undefined || value.comboItems.length === 0;
};

export const CreateProductSchema = ProductBaseSchema.extend({
  modifierGroups: z.array(ModifierGroupInputSchema).default([]),
  comboItems: z.array(ComboItemSchema).default([]),
}).strict().refine(comboCompositionIsValid, {
  message: 'Sản phẩm COMBO phải có ít nhất một món thành phần; món thường không được có món thành phần',
  path: ['comboItems'],
});
export type CreateProductInput = z.infer<typeof CreateProductSchema>;

export const UpdateProductSchema = ProductBaseSchema.partial().extend({
  modifierGroups: z.array(ModifierGroupInputSchema).optional(),
  comboItems: z.array(ComboItemSchema).optional(),
}).strict().refine((value) => {
  if (value.station === 'COMBO' && value.comboItems === undefined) return false;
  return comboCompositionIsValid(value);
}, {
  message: 'Khi cập nhật sản phẩm COMBO, phải gửi ít nhất một món thành phần',
  path: ['comboItems'],
});
export type UpdateProductInput = z.infer<typeof UpdateProductSchema>;

export const ProductSchema = z.object({
  id: IdSchema,
  ...ProductFields,
  modifierGroups: z.array(ModifierGroupSchema),
  comboItems: z.array(ComboItemSchema),
}).strict().refine(comboCompositionIsValid, {
  message: 'Sản phẩm COMBO phải có thành phần và món thường không được có món thành phần',
  path: ['comboItems'],
});
export type Product = z.infer<typeof ProductSchema>;

export const DiningTableSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1),
  qrToken: QrTokenSchema,
  status: TableStatusSchema,
  activeOrderId: IdSchema.nullable(),
}).strict();
export type DiningTable = z.infer<typeof DiningTableSchema>;

export const PublicMenuStationSchema = z.object({
  id: IdSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sortOrder: z.number().int(),
}).strict();
export type PublicMenuStation = z.infer<typeof PublicMenuStationSchema>;

export const PublicMenuCategorySchema = z.object({
  id: IdSchema,
  code: z.string().trim().min(1),
  name: z.string().trim().min(1),
  stationCode: z.string().trim().min(1).nullable().optional(),
  sortOrder: z.number().int(),
}).strict();
export type PublicMenuCategory = z.infer<typeof PublicMenuCategorySchema>;

export const PublicMenuActiveOrderItemSchema = z.object({
  id: IdSchema,
  productId: IdSchema,
  productName: z.string().trim().min(1),
  quantity: z.number().int().positive(),
  unitPrice: MoneyAmountSchema,
  lineTotal: MoneyAmountSchema,
  batchNo: z.number().int().positive(),
  kitchenStatus: z.enum(['NEW', 'PRINTED', 'CANCELLED']),
  itemNote: z.string().nullable(),
  isTakeaway: z.boolean().optional(),
  modifiers: z.array(z.object({
    groupId: IdSchema.optional(),
    modifierId: IdSchema.optional(),
    name: z.string().trim().min(1),
    extraPrice: MoneyAmountSchema.optional(),
    action: z.string().optional(),
    substituteModifierId: IdSchema.optional(),
    substituteName: z.string().optional(),
    substitutedFromName: z.string().optional(),
  })),
  createdAt: z.string(),
}).strict();
export type PublicMenuActiveOrderItem = z.infer<typeof PublicMenuActiveOrderItemSchema>;

export const PublicMenuActiveOrderSchema = z.object({
  orderId: IdSchema,
  orderCode: z.string().trim().min(1),
  status: z.enum(['PENDING', 'SERVING']),
  subtotalAmount: MoneyAmountSchema.optional(),
  discountAmount: MoneyAmountSchema.optional(),
  totalAmount: MoneyAmountSchema,
  tableLabel: z.string().trim().min(1).optional(),
  note: z.string().nullable().optional(),
  items: z.array(PublicMenuActiveOrderItemSchema),
  createdAt: z.string(),
}).strict();
export type PublicMenuActiveOrder = z.infer<typeof PublicMenuActiveOrderSchema>;

export const PublicMenuResponseSchema = z.object({
  orderMode: z.enum(['DINE_IN', 'TAKEAWAY']).optional(),
  table: z.object({
    tableId: IdSchema.nullable(),
    tableName: z.string().trim().min(1),
    status: TableStatusSchema,
    activeOrderId: IdSchema.nullable(),
  }).strict(),
  stations: z.array(PublicMenuStationSchema).optional(),
  categories: z.array(PublicMenuCategorySchema).optional(),
  activeOrder: PublicMenuActiveOrderSchema.nullable().optional(),
  products: z.array(ProductSchema),
  updatedAt: z.string().optional(),
}).strict();
export type PublicMenuResponse = z.infer<typeof PublicMenuResponseSchema>;

export const PublicMenuQuerySchema = z.object({
  token: QrTokenSchema,
  activeOrderId: z.coerce.number().int().positive().optional(),
  guestSessionToken: z.string().trim().min(16).max(256).optional(),
}).strict();
export type PublicMenuQuery = z.infer<typeof PublicMenuQuerySchema>;

export const ImportMenuExcelItemSchema = z.object({
  name: z.string().trim().min(1).max(160),
  subtitle: z.string().trim().max(255).nullable().optional(),
  categoryName: z.string().trim().max(120).nullable().optional(),
  station: z.string().trim().max(64).optional(),
  price: MoneyAmountSchema,
  modifierGroupsText: z.string().trim().max(4000).nullable().optional(),
  isAvailable: z.boolean().default(true),
  sortOrder: z.number().int().nonnegative().default(0),
}).strict();
export type ImportMenuExcelItem = z.infer<typeof ImportMenuExcelItemSchema>;

export const ImportMenuExcelRequestSchema = z.object({
  items: z.array(ImportMenuExcelItemSchema).max(2000),
  syncMissingAsDeleted: z.boolean().default(true),
}).strict();
export type ImportMenuExcelRequest = z.infer<typeof ImportMenuExcelRequestSchema>;

export const ImportMenuExcelResponseSchema = z.object({
  createdCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  deletedCount: z.number().int().nonnegative(),
  skippedActiveOrderProducts: z.array(z.string()).default([]),
}).strict();
export type ImportMenuExcelResponse = z.infer<typeof ImportMenuExcelResponseSchema>;
