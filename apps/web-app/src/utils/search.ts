/**
 * Chuẩn hoá chuỗi tiếng Việt (bỏ dấu, thường hoá, đ -> d) phục vụ tìm kiếm nhanh trên POS & QR.
 */
export function normalizeVietnameseText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

export function matchesVietnameseQuery(
  query: string,
  ...candidates: Array<string | null | undefined>
): boolean {
  const normalizedQuery = normalizeVietnameseText(query);
  if (!normalizedQuery) return true;
  return candidates.some((candidate) =>
    candidate ? normalizeVietnameseText(candidate).includes(normalizedQuery) : false,
  );
}
