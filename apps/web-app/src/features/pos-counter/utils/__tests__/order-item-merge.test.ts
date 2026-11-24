import { describe, expect, it } from 'vitest';

import type { PosMenuSelectedItem } from '../../components/pos-menu-types';
import { findMatchingDraftIndex } from '../order-item-merge';

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
