import { z } from 'zod';

export const IdSchema = z.number().int().positive();

export const SHORT_QR_TOKEN_SUFFIX_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const SHORT_QR_TOKEN_REGEX = /^[a-z0-9]{1,24}-[23456789abcdefghjkmnpqrstuvwxyz]{4,8}$/i;

export const QrTokenSchema = z.string().trim().pipe(
  z.union([
    z.string().regex(SHORT_QR_TOKEN_REGEX),
    z.string().length(64),
    z.string().regex(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i),
  ]),
);

export function buildTableQrSlugPrefix(label: string, fallback = 'ban'): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16);
  return normalized || fallback;
}

export function normalizeQrToken(rawToken: string): string {
  const trimmed = rawToken.trim();
  if (/^[a-z0-9-]+$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }
  return trimmed;
}

export function isLegacyLongQrToken(token: string | undefined | null): boolean {
  return Boolean(token && token.trim().length >= 24);
}

export function maskQrTokenForAudit(token: string | undefined | null): string {
  if (!token) return '***';
  const normalized = normalizeQrToken(token);
  if (SHORT_QR_TOKEN_REGEX.test(normalized)) {
    const dashIdx = normalized.indexOf('-');
    return `${normalized.slice(0, dashIdx)}-****`;
  }
  return normalized.length >= 8 ? `${normalized.slice(0, 6)}...` : '***';
}

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
