import { z } from 'zod';

export const IdSchema = z.number().int().positive();

export const QrTokenSchema = z.union([
  z.string().length(64),
  z.string().regex(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i),
]);

export const IsoDateSchema = z.iso.date();

export const IsoDateTimeSchema = z.string().refine(
  (value) => /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)),
  'Phải là thời điểm ISO hợp lệ',
);

const hasAtMostTwoDecimalPlaces = (value: number): boolean => {
  const asText = value.toString();
  return !/[eE]/.test(asText) && (asText.split('.')[1]?.length ?? 0) <= 2;
};

export const MoneyAmountSchema = z.number()
  .finite()
  .min(0)
  .max(9_999_999_999.99)
  .refine(hasAtMostTwoDecimalPlaces, 'Số tiền chỉ được có tối đa 2 chữ số thập phân');

export const SignedMoneyAmountSchema = z.number()
  .finite()
  .min(-9_999_999_999.99)
  .max(9_999_999_999.99)
  .refine(hasAtMostTwoDecimalPlaces, 'Số tiền chỉ được có tối đa 2 chữ số thập phân');

export const QuantitySchema = z.number()
  .finite()
  .positive()
  .max(99_999_999.99)
  .refine(hasAtMostTwoDecimalPlaces, 'Số lượng chỉ được có tối đa 2 chữ số thập phân');

export const NonNegativeQuantitySchema = z.number()
  .finite()
  .min(0)
  .max(99_999_999.99)
  .refine(hasAtMostTwoDecimalPlaces, 'Số lượng chỉ được có tối đa 2 chữ số thập phân');

export const PaginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

export type MoneyAmount = z.infer<typeof MoneyAmountSchema>;
export type SignedMoneyAmount = z.infer<typeof SignedMoneyAmountSchema>;
