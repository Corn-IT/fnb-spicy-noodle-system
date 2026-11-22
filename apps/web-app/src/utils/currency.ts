const VND_INTEGER_FORMATTER = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
});

const VND_DECIMAL_FORMATTER = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Extracts raw digit characters from a user-entered currency string.
 * Strips thousands separators (dots, commas, spaces) and non-digit characters.
 */
export function extractCurrencyDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';
  const stripped = digits.replace(/^0+(?=\d)/, '');
  return stripped;
}

/**
 * Formats a digit string with vi-VN dot thousands separators (e.g. "100000" -> "100.000").
 */
export function formatCurrencyDigits(rawDigits: string): string {
  const digits = extractCurrencyDigits(rawDigits);
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parses a formatted or unformatted currency string into a finite non-negative number.
 */
export function parseCurrencyValue(raw: string): number {
  const digits = extractCurrencyDigits(raw);
  if (!digits) return 0;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : 0;
}

export interface FormatVndOptions {
  withSuffix?: boolean;
  signed?: boolean;
}

/**
 * Formats a numeric monetary amount using vi-VN thousands separators (e.g. "100.000 đ").
 */
export function formatVnd(
  value: number | string | null | undefined,
  options: FormatVndOptions = {},
): string {
  const { withSuffix = true, signed = false } = options;
  const numeric = typeof value === 'string' ? Number(value) : (value ?? 0);
  const safe = Number.isFinite(numeric) ? numeric : 0;
  const rounded = Math.round(safe * 100) / 100;
  const abs = Math.abs(rounded);
  const formattedAbs = Number.isInteger(abs)
    ? VND_INTEGER_FORMATTER.format(abs)
    : VND_DECIMAL_FORMATTER.format(abs);
  const sign = rounded < 0 ? '-' : signed && rounded > 0 ? '+' : '';
  return withSuffix ? `${sign}${formattedAbs} đ` : `${sign}${formattedAbs}`;
}
