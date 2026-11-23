import { Prisma } from '@prisma/client';

/**
 * Normalizes a search keyword for Vietnamese accent-insensitive + i/y-folded search.
 * Separate from `normalizeVietnameseString` (MDM deduplication — Hard Invariant 7).
 */
export function normalizeSearchTerm(raw: string): string {
  if (!raw) return '';
  return raw
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/y/g, 'i')
    .replace(/\s+/g, ' ');
}

/**
 * Escapes SQL LIKE wildcards (%, _, \) and wraps in `%...%` for safe parameterized queries.
 */
export function buildSqlLikePattern(raw: string): string {
  const normalized = normalizeSearchTerm(raw);
  const escaped = normalized.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  return `%${escaped}%`;
}

/**
 * Generates i/y swapped variants of a short keyword (up to 8 variants) for Prisma `contains`
 * fallback when running in unit tests without a live PostgreSQL `$queryRaw` implementation.
 */
export function buildIyFallbackKeywords(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const results = new Set<string>([trimmed]);
  const swappedI = trimmed.replace(/[yýỳỷỹỵYÝỲỶỸỴ]/g, (ch) =>
    ch === ch.toUpperCase() ? 'I' : 'i',
  );
  const swappedY = trimmed.replace(/[iíìỉĩịIÍÌỈĨỊ]/g, (ch) =>
    ch === ch.toUpperCase() ? 'Y' : 'y',
  );
  results.add(swappedI);
  results.add(swappedY);
  const stripped = normalizeSearchTerm(trimmed);
  if (stripped) {
    results.add(stripped);
    results.add(stripped.replace(/i/g, 'y'));
  }
  return Array.from(results);
}

/**
 * Runs a parameterized PostgreSQL query using `f_search_norm(col) LIKE $pattern ESCAPE '\'`
 * to return matching integer IDs. Returns `null` if `$queryRaw` is unavailable (e.g. unit test mock),
 * allowing callers to fall back to Prisma `contains` with i/y variants.
 */
export async function queryMatchingIdsBySearchNorm(
  prisma: { $queryRaw?: unknown },
  tableIdentifier: string,
  columnIdentifiers: readonly string[],
  keyword: string,
  idColumn = 'id',
): Promise<number[] | null> {
  if (typeof prisma.$queryRaw !== 'function') return null;
  const normalized = normalizeSearchTerm(keyword);
  if (!normalized || columnIdentifiers.length === 0) return null;

  const pattern = buildSqlLikePattern(keyword);
  const conditions = columnIdentifiers.map(
    (col) => Prisma.sql`f_search_norm(${Prisma.raw(col)}) LIKE ${pattern} ESCAPE '\\'`,
  );
  const whereClause = Prisma.join(conditions, ' OR ');
  const query = Prisma.sql`SELECT ${Prisma.raw(idColumn)} AS id FROM ${Prisma.raw(tableIdentifier)} WHERE ${whereClause}`;

  try {
    const rows = await (prisma.$queryRaw as (q: Prisma.Sql) => Promise<unknown>)(query);
    if (!Array.isArray(rows)) return null;
    return rows
      .map((r) => (r && typeof r === 'object' && 'id' in r ? Number((r as { id: unknown }).id) : NaN))
      .filter((id) => Number.isFinite(id));
  } catch {
    return null;
  }
}
