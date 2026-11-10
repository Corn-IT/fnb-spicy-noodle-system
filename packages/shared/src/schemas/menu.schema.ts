import { z } from 'zod';
import { ProductStationSchema } from '../enums/station.enum';
import { TableStatusSchema } from '../enums/order.enum';
import { IdSchema, MoneyAmountSchema, QrTokenSchema } from './common.schema';

export const ModifierSchema = z.object({
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  extraPrice: MoneyAmountSchema,
  isDefaultChecked: z.boolean().optional(),
  defaultSubstituteName: z.string().trim().max(120).nullable().optional(),
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
  defaultSubstituteName: z.string().trim().max(120).nullable().optional(),
}).strict();

const ModifierGroupInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  isRequired: z.boolean().default(false),
  maxSelect: z.number().int().positive().default(1),
  isAutoSelect: z.boolean().default(false),
  allowSubstitution: z.boolean().default(false),
  modifiers: z.array(ModifierInputSchema).min(1),
}).strict();

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

export const PublicMenuResponseSchema = z.object({
  table: z.object({
    tableId: IdSchema,
    tableName: z.string().trim().min(1),
    status: TableStatusSchema,
    activeOrderId: IdSchema.nullable(),
  }).strict(),
  products: z.array(ProductSchema),
  updatedAt: z.string().optional(),
}).strict();
export type PublicMenuResponse = z.infer<typeof PublicMenuResponseSchema>;

export const PublicMenuQuerySchema = z.object({ token: QrTokenSchema }).strict();
export type PublicMenuQuery = z.infer<typeof PublicMenuQuerySchema>;
