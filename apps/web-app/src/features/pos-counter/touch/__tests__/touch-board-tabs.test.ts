import type { PosOrderSummary } from '@fnb/shared';
import { describe, expect, it } from 'vitest';

import { sortTakeawaysForBoard } from '../touch-table-board';

const makeTakeaway = (
  orderId: number,
  takeawayNumber: number | null,
  createdAt: string,
): PosOrderSummary => ({
  orderId,
  orderCode: `HD-20261124-${String(orderId).padStart(4, '0')}`,
  orderType: 'TAKEAWAY',
  tableId: null,
  tableLabel: null,
  takeawayNumber,
  status: 'SERVING',
  totalAmount: 30000,
  createdAt,
});

describe('sortTakeawaysForBoard', () => {
  it('sorts numbered orders first and null numbers by creation time without mutating the input', () => {
    const input = [
      makeTakeaway(4, null, '2026-11-24T08:30:00.000Z'),
      makeTakeaway(2, 2, '2026-11-24T08:20:00.000Z'),
      makeTakeaway(3, null, '2026-11-24T08:10:00.000Z'),
      makeTakeaway(1, 1, '2026-11-24T08:40:00.000Z'),
    ];
    const originalOrderIds = input.map((order) => order.orderId);

    const sorted = sortTakeawaysForBoard(input);

    expect(sorted.map((order) => order.orderId)).toEqual([1, 2, 3, 4]);
    expect(input.map((order) => order.orderId)).toEqual(originalOrderIds);
    expect(sorted).not.toBe(input);
  });
});
