import { z } from 'zod';
import { MdmCategorySchema } from '../enums/mdm-cashflow.enum';
import { IdSchema, IsoDateTimeSchema, PaginationFields } from './common.schema';

const MetadataSchema = z.record(z.string(), z.unknown()).default({});
const BooleanQuerySchema = z.union([
  z.boolean(),
  z.enum(['true', 'false']).transform((value) => value === 'true'),
]).default(true);

export const MdmItemSchema = z.object({
  id: IdSchema,
  category: MdmCategorySchema,
  name: z.string().trim().min(1),
  normalizedName: z.string().trim().min(1),
  metadata: MetadataSchema,
  isActive: z.boolean(),
  createdAt: IsoDateTimeSchema,
});
export type MdmItem = z.infer<typeof MdmItemSchema>;

export const MdmLookupQuerySchema = z.object({
  ...PaginationFields,
  category: MdmCategorySchema,
  keyword: z.string().trim().min(1).optional(),
  activeOnly: BooleanQuerySchema,
});
export type MdmLookupQuery = z.infer<typeof MdmLookupQuerySchema>;

export const MdmListResponseSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  items: z.array(MdmItemSchema),
});
export type MdmListResponse = z.infer<typeof MdmListResponseSchema>;

export const UpsertMdmSchema = z.object({
  category: MdmCategorySchema,
  name: z.string().trim().min(1).max(120),
  metadata: MetadataSchema,
}).strict();
export type UpsertMdmInput = z.infer<typeof UpsertMdmSchema>;

export const UpdateMdmSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict().refine((input) => input.name !== undefined || input.metadata !== undefined, {
  message: 'Phải cung cấp tên hoặc metadata cần cập nhật',
});
export type UpdateMdmInput = z.infer<typeof UpdateMdmSchema>;
