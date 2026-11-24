import type { OrderDetailResponse } from '@fnb/shared';
import { describe, expect, it } from 'vitest';

import type { PosMenuSelectedItem } from '../../components/pos-menu-types';
import { findMatchingDraftIndex, findMergeableOrderItem } from '../order-item-merge';

const tea: PosMenuSelectedItem = {
  productId: 102,
  name: 'Trà Đào',
  quantity: 1,
  unitPrice: 30000,
  modifiers: [],
  modifierLabels: [],
};

const noodle = (level: number): PosMenuSelectedItem => ({
  productId: 101,
  name: 'Mì Bò Mỹ',
  quantity: 1,
  unitPrice: 45000,
  modifiers: [{ modifierId: 10 + level } as PosMenuSelectedItem['modifiers'][number]],
  modifierLabels: [`Cấp độ ${level}`],
});

type OrderItem = OrderDetailResponse['items'][number];
const orderItem = (overrides: Partial<OrderItem>): OrderItem => ({
  id: 1,
  productId: 102,
  name: 'Trà Đào',
  quantity: 1,
  unitPrice: 30000,
  lineTotal: 30000,
  modifiers: [],
  itemNote: null,
  batchNo: 1,
  kitchenStatus: 'NEW',
  ...overrides,
});

describe('findMatchingDraftIndex', () => {
  it('matches the same product with the same options and note', () => {
    expect(findMatchingDraftIndex([noodle(2), tea], { ...tea, quantity: 2 })).toBe(1);
    expect(findMatchingDraftIndex([noodle(2)], noodle(2))).toBe(0);
  });

  it('keeps different spice levels, prices or notes on separate lines', () => {
    expect(findMatchingDraftIndex([noodle(2)], noodle(5))).toBe(-1);
    expect(findMatchingDraftIndex([tea], { ...tea, itemNote: 'Ít đá' })).toBe(-1);
    expect(findMatchingDraftIndex([tea], { ...tea, unitPrice: 35000 })).toBe(-1);
  });
});

describe('findMergeableOrderItem', () => {
  it('merges into a NEW line with the same product, options and note', () => {
    const order = { items: [orderItem({ id: 7, quantity: 2 })] };
    expect(findMergeableOrderItem(order, tea)?.id).toBe(7);
  });

  it('never merges into a line that was already printed to the kitchen or cancelled', () => {
    expect(findMergeableOrderItem({ items: [orderItem({ kitchenStatus: 'PRINTED' })] }, tea)).toBeUndefined();
    expect(findMergeableOrderItem({ items: [orderItem({ kitchenStatus: 'CANCELLED' })] }, tea)).toBeUndefined();
  });

  it('compares option labels regardless of order and keeps different notes apart', () => {
    const withToppings = orderItem({ productId: 101, modifiers: ['Cấp độ 2', 'Thêm phô mai'] });
    expect(
      findMergeableOrderItem({ items: [withToppings] }, {
        ...noodle(2),
        modifierLabels: ['Thêm phô mai', 'Cấp độ 2'],
      })?.id,
    ).toBe(1);
    expect(
      findMergeableOrderItem({ items: [orderItem({ itemNote: 'Ít đá' })] }, tea),
    ).toBeUndefined();
  });
});
