import { TakeawayLabelFormat, type TakeawayLabelFormat as TakeawayLabelFormatType } from '../enums/order.enum';

const LETTER_CYCLE_FIRST = ['A', 'B', 'C', 'D'] as const;
const MAX_LETTER_TAKEAWAY_SEQUENCE = 130; // #Z #ZD

/**
 * Formats the suffix (without leading `#`) for a sequential daily takeaway order number.
 *
 * - `NUMBER`: `01`, `02`, ..., `99`, `100`
 * - `LETTER`:
 *   - `1..4`: `A..D`
 *   - `5..20`: `AA..AD`, `BA..BD`, `CA..CD`, `DA..DD`
 *   - `21..130`: `E`, `EA..ED`, `F`, `FA..FD`, ..., `Z`, `ZA..ZD`
 *   - `>= 131`: numeric fallback (`131`, `132`, ...) so kitchen tickets stay concise.
 */
export function formatTakeawaySuffix(
  takeawayNumber: number | null | undefined,
  format?: TakeawayLabelFormatType | null,
): string {
  const safeNum =
    typeof takeawayNumber === 'number' && Number.isFinite(takeawayNumber) && takeawayNumber >= 1
      ? Math.floor(takeawayNumber)
      : 1;

  if (format !== TakeawayLabelFormat.LETTER) {
    return String(safeNum).padStart(2, '0');
  }

  if (safeNum <= 4) {
    return LETTER_CYCLE_FIRST[safeNum - 1]!;
  }

  if (safeNum <= 20) {
    const offset = safeNum - 5;
    const prefix = LETTER_CYCLE_FIRST[Math.floor(offset / 4)]!;
    const suffix = LETTER_CYCLE_FIRST[offset % 4]!;
    return `${prefix}${suffix}`;
  }

  if (safeNum <= MAX_LETTER_TAKEAWAY_SEQUENCE) {
    const offset = safeNum - 21;
    const groupIdx = Math.floor(offset / 5);
    const posInGroup = offset % 5;
    const baseLetter = String.fromCharCode(69 + groupIdx); // 'E'..'Z'
    if (posInGroup === 0) {
      return baseLetter;
    }
    return `${baseLetter}${LETTER_CYCLE_FIRST[posInGroup - 1]!}`;
  }

  return String(safeNum);
}

/**
 * Formats the display label for a takeaway order (`Mang về #01` or `Mang về #A`).
 */
export function formatTakeawayLabel(
  takeawayNumber: number | null | undefined,
  format?: TakeawayLabelFormatType | null,
  options?: { uppercase?: boolean },
): string {
  const prefix = options?.uppercase ? 'MANG VỀ' : 'Mang về';
  return `${prefix} #${formatTakeawaySuffix(takeawayNumber, format)}`;
}

/**
 * Formats a compact ASCII short code for VietQR transfer memos (`MV01`, `MVA`, `MVAA`).
 */
export function formatTakeawayShortCode(
  takeawayNumber: number | null | undefined,
  format?: TakeawayLabelFormatType | null,
): string {
  return `MV${formatTakeawaySuffix(takeawayNumber, format)}`;
}

const LETTER_SUFFIX_TO_NUMBER = (() => {
  const map = new Map<string, number>();
  for (let n = 1; n <= MAX_LETTER_TAKEAWAY_SEQUENCE; n += 1) {
    map.set(formatTakeawaySuffix(n, TakeawayLabelFormat.LETTER), n);
  }
  return map;
})();

/**
 * Parses a search keyword representing a takeaway label/code (e.g. `#03`, `Mang về #AA`, `MVB`, `EA`)
 * back into its integer `takeawayNumber`, or `null` if the keyword does not match a takeaway token.
 */
export function parseTakeawayLabelNumber(keyword: string): number | null {
  const trimmed = keyword.trim();
  if (!trimmed) return null;

  const prefixedMatch = /^(?:mang\s*v[eề]\s*#?|mv\s*#?|#)([a-z]{1,2}|[0-9]+)$/i.exec(trimmed);
  const token = (prefixedMatch ? prefixedMatch[1] : trimmed) ?? '';
  if (!token) return null;

  if (/^\d+$/.test(token)) {
    const parsed = Number.parseInt(token, 10);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
  }

  return LETTER_SUFFIX_TO_NUMBER.get(token.toUpperCase()) ?? null;
}
