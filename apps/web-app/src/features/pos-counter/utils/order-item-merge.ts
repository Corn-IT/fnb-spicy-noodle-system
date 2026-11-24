import type { PosMenuSelectedItem } from '../components/pos-menu-types';

const normalizeNote = (note: string | null | undefined) => (note ?? '').trim();
/**
 * Món trong giỏ nháp trùng hoàn toàn (cùng món, cùng tuỳ chọn, cùng giá, cùng ghi chú) với món vừa
 * chọn → trả vị trí để cộng dồn số lượng thay vì thêm dòng mới. Khác cấp độ / topping / ghi chú thì
 * vẫn là dòng riêng vì bếp cần làm khác nhau.
 */
export function findMatchingDraftIndex(
  draftItems: readonly PosMenuSelectedItem[],
  item: PosMenuSelectedItem,
): number {
  const modifierKey = (entry: PosMenuSelectedItem) =>
    JSON.stringify(
      [...entry.modifiers].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    );
  return draftItems.findIndex(
    (candidate) =>
      candidate.productId === item.productId &&
      candidate.unitPrice === item.unitPrice &&
      Boolean(candidate.isTakeaway) === Boolean(item.isTakeaway) &&
      normalizeNote(candidate.itemNote) === normalizeNote(item.itemNote) &&
      modifierKey(candidate) === modifierKey(item),
  );
}
