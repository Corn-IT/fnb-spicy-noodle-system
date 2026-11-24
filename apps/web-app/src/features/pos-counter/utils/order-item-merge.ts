import type { OrderDetailResponse } from '@fnb/shared';

import type { PosMenuSelectedItem } from '../components/pos-menu-types';

type OrderItem = OrderDetailResponse['items'][number];

const normalizeNote = (note: string | null | undefined) => (note ?? '').trim();
const normalizeLabels = (labels: readonly string[]) => [...labels].map((l) => l.trim()).sort();

const sameLabels = (a: readonly string[], b: readonly string[]) => {
  const left = normalizeLabels(a);
  const right = normalizeLabels(b);
  return left.length === right.length && left.every((label, index) => label === right[index]);
};

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
      normalizeNote(candidate.itemNote) === normalizeNote(item.itemNote) &&
      modifierKey(candidate) === modifierKey(item),
  );
}

/**
 * Dòng món CHƯA gửi bếp (NEW) trên hoá đơn trùng với món vừa chọn → cộng dồn số lượng vào dòng đó.
 * Món đã in bếp (PRINTED) không bao giờ bị gộp: phần gọi thêm phải ra phiếu bếp lượt mới.
 */
export function findMergeableOrderItem(
  order: Pick<OrderDetailResponse, 'items'>,
  item: PosMenuSelectedItem,
): OrderItem | undefined {
  return order.items.find(
    (candidate) =>
      candidate.kitchenStatus === 'NEW' &&
      candidate.productId === item.productId &&
      normalizeNote(candidate.itemNote) === normalizeNote(item.itemNote) &&
      sameLabels(candidate.modifiers, item.modifierLabels),
  );
}
