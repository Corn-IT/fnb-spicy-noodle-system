import { z } from 'zod';
import { PaginationFields } from './common.schema';

export const ApiErrorResponseSchema = z.object({
  statusCode: z.number().int().min(100).max(599),
  error: z.string().min(1),
  message: z.string().min(1),
  code: z.string().min(1).optional(),
  details: z.unknown().optional(),
  requestId: z.string().uuid().optional(),
});
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const PaginationQuerySchema = z.object({
  ...PaginationFields,
  sortBy: z.string().trim().min(1).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().trim().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

const PaginatedResponseMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) => z.object({
  data: z.array(itemSchema),
  pagination: PaginatedResponseMetaSchema,
});

export type PaginatedResponse<T extends z.ZodType> = z.infer<ReturnType<typeof PaginatedResponseSchema<T>>>;
