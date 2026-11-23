/**
 * Chuẩn hoá chuỗi tiếng Việt (bỏ dấu, thường hoá, đ -> d, gập y -> i) phục vụ tìm kiếm đồng nhất
 * trên toàn hệ thống (POS, QR khách hàng, Thực đơn, Giảm giá, Kho, Command Palette...).
 */
export function normalizeVietnameseText(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/y/g, 'i')
    .replace(/\s+/g, ' ');
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
