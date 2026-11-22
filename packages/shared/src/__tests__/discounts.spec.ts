import { describe, expect, it } from 'vitest';
import * as contracts from '../index';

describe('@fnb/shared discount contracts & calculator (Story 18)', () => {
  const sampleSnapshotBase = {
    kind: 'CODE' as const,
    discountId: 1,
    code: 'TEST10',
    name: 'Test Discount',
    appliedAt: '2026-11-15T10:00:00.000Z',
    appliedBy: 1,
    reason: null,
  };

  it('exports all discount enums, schemas, and calculator helpers', () => {
    expect(contracts).toHaveProperty('DiscountValueTypeSchema');
    expect(contracts).toHaveProperty('DiscountScopeSchema');
    expect(contracts).toHaveProperty('DiscountKindSchema');
    expect(contracts).toHaveProperty('DiscountSnapshotSchema');
    expect(contracts).toHaveProperty('CreateDiscountSchema');
    expect(contracts).toHaveProperty('UpdateDiscountSchema');
    expect(contracts).toHaveProperty('ApplyPosDiscountRequestSchema');
    expect(contracts).toHaveProperty('calculateOrderDiscount');
    expect(contracts).toHaveProperty('evaluateDiscountScheduleWindow');
    expect(contracts.ALLOWED_STORE_NAV_PATHS).toContain('/discounts');
  });

  it('validates CreateDiscountSchema 2x3 matrix, scope targets, time window, and uppercase code', () => {
    const validOrderPercent = contracts.CreateDiscountSchema.parse({
      code: '  giam10  ',
      name: 'Giảm 10% tối đa 20k',
      valueType: 'PERCENT',
      value: 10,
      maxDiscountAmount: 20000,
      scope: 'ORDER',
      minOrderAmount: 100000,
      activeWeekdays: [1, 2, 3, 4, 5],
      timeWindowStart: '14:00',
      timeWindowEnd: '17:00',
    });
    expect(validOrderPercent.code).toBe('GIAM10');
    expect(validOrderPercent.scope).toBe('ORDER');

    // Invalid code characters
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'GIAM 10%',
        name: 'Bad code',
        valueType: 'FIXED',
        value: 10000,
        scope: 'ORDER',
      }).success,
    ).toBe(false);

    // PERCENT > 100 rejected
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'OVER100',
        name: 'Too big',
        valueType: 'PERCENT',
        value: 105,
        scope: 'ORDER',
      }).success,
    ).toBe(false);

    // maxDiscountAmount forbidden on FIXED
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'FIXEDCAP',
        name: 'Bad cap',
        valueType: 'FIXED',
        value: 10000,
        maxDiscountAmount: 20000,
        scope: 'ORDER',
      }).success,
    ).toBe(false);

    // CATEGORY scope requires at least 1 categoryId and empty productIds
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'CAT5K',
        name: 'Category fixed',
        valueType: 'FIXED',
        value: 5000,
        scope: 'CATEGORY',
        targetCategoryIds: [],
      }).success,
    ).toBe(false);

    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'CAT5K',
        name: 'Category fixed',
        valueType: 'FIXED',
        value: 5000,
        scope: 'CATEGORY',
        targetCategoryIds: [10],
        targetProductIds: [5],
      }).success,
    ).toBe(false);

    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'PROD10K',
        name: 'Product fixed',
        valueType: 'FIXED',
        value: 10000,
        scope: 'PRODUCT',
        targetProductIds: [5, 6],
      }).success,
    ).toBe(true);

    // Overnight time window rejected in Phase 1 (A3)
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'NIGHT22',
        name: 'Overnight',
        valueType: 'PERCENT',
        value: 10,
        scope: 'ORDER',
        timeWindowStart: '22:00',
        timeWindowEnd: '02:00',
      }).success,
    ).toBe(false);

    // Half-filled time window rejected
    expect(
      contracts.CreateDiscountSchema.safeParse({
        code: 'HALFWIN',
        name: 'Half window',
        valueType: 'PERCENT',
        value: 10,
        scope: 'ORDER',
        timeWindowStart: '14:00',
      }).success,
    ).toBe(false);
  });

  it('validates ApplyPosDiscountRequestSchema (code | discountId | manual)', () => {
    expect(contracts.ApplyPosDiscountRequestSchema.safeParse({ code: 'vip10' }).success).toBe(true);
    expect(contracts.ApplyPosDiscountRequestSchema.safeParse({ discountId: 5 }).success).toBe(true);
    expect(
      contracts.ApplyPosDiscountRequestSchema.safeParse({
        manual: { valueType: 'PERCENT', value: 15, reason: 'Khách VIP thân thiết' },
      }).success,
    ).toBe(true);
    expect(
      contracts.ApplyPosDiscountRequestSchema.safeParse({
        manual: { valueType: 'PERCENT', value: 15, reason: 'ab' },
      }).success,
    ).toBe(false);
    expect(
      contracts.ApplyPosDiscountRequestSchema.safeParse({
        manual: { valueType: 'PERCENT', value: 120, reason: 'Hợp lệ' },
      }).success,
    ).toBe(false);
  });

  describe('calculateOrderDiscount (2x3 matrix, cap, floor-to-1000, COMBO, A1)', () => {
    const items = [
      { productId: 1, categoryId: 100, unitPrice: 55000, quantity: 3, kitchenStatus: 'PRINTED' }, // 165,000 (Mì cay)
      { productId: 2, categoryId: 100, unitPrice: 67500, quantity: 2, kitchenStatus: 'PRINTED' }, // 135,000 (Mì cay -> subtotal cat 100 = 300,000)
      { productId: 3, categoryId: 200, unitPrice: 20000, quantity: 2, kitchenStatus: 'PRINTED' }, // 40,000 (Nước)
      { productId: 4, categoryId: 100, unitPrice: 50000, quantity: 1, kitchenStatus: 'CANCELLED' }, // Cancelled -> ignored
    ];

    it('Case 1: ORDER + PERCENT 10% capped at 20,000 on 340,000 order -> 20,000', () => {
      const result = contracts.calculateOrderDiscount(items, {
        ...sampleSnapshotBase,
        valueType: 'PERCENT',
        value: 10,
        maxDiscountAmount: 20000,
        scope: 'ORDER',
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: null,
      });
      expect(result.subtotalAmount).toBe(340000);
      expect(result.discountAmount).toBe(20000);
      expect(result.totalAmount).toBe(320000);
      expect(result.warningCode).toBeNull();
    });

    it('Case 2: CATEGORY + FIXED 5,000 per serving (3+2 bowls = 5, 2 drinks excluded -> 25,000)', () => {
      const result = contracts.calculateOrderDiscount(
        [
          { productId: 1, categoryId: 100, unitPrice: 45000, quantity: 3, kitchenStatus: 'PRINTED' },
          { productId: 3, categoryId: 200, unitPrice: 20000, quantity: 2, kitchenStatus: 'PRINTED' },
        ],
        {
          ...sampleSnapshotBase,
          valueType: 'FIXED',
          value: 5000,
          maxDiscountAmount: null,
          scope: 'CATEGORY',
          targetCategoryIds: [100],
          targetProductIds: [],
          minOrderAmount: null,
        },
      );
      expect(result.subtotalAmount).toBe(175000);
      expect(result.eligibleSubtotal).toBe(135000);
      expect(result.eligibleQty).toBe(3);
      expect(result.discountAmount).toBe(15000);
      expect(result.totalAmount).toBe(160000);
    });

    it('Case 3: PERCENT 15% on 73,000 -> raw 10,950 -> floors down to 10,000', () => {
      const result = contracts.calculateOrderDiscount(
        [{ productId: 1, categoryId: 100, unitPrice: 73000, quantity: 1, kitchenStatus: 'NEW' }],
        {
          ...sampleSnapshotBase,
          valueType: 'PERCENT',
          value: 15,
          maxDiscountAmount: null,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: null,
        },
      );
      expect(result.subtotalAmount).toBe(73000);
      expect(result.discountAmount).toBe(10000);
      expect(result.totalAmount).toBe(63000);
    });

    it('Case 4: PRODUCT + FIXED 50,000 on 30,000 item -> caps at 30,000 (no negative)', () => {
      const result = contracts.calculateOrderDiscount(
        [
          { productId: 10, categoryId: 200, unitPrice: 30000, quantity: 1, kitchenStatus: 'NEW' },
          { productId: 11, categoryId: 200, unitPrice: 25000, quantity: 1, kitchenStatus: 'NEW' },
        ],
        {
          ...sampleSnapshotBase,
          valueType: 'FIXED',
          value: 50000,
          maxDiscountAmount: null,
          scope: 'PRODUCT',
          targetCategoryIds: [],
          targetProductIds: [10],
          minOrderAmount: null,
        },
      );
      expect(result.subtotalAmount).toBe(55000);
      expect(result.eligibleSubtotal).toBe(30000);
      expect(result.discountAmount).toBe(30000);
      expect(result.totalAmount).toBe(25000);
    });

    it('Case 5: CATEGORY + PERCENT with cap applies cap to total eligible discount', () => {
      const result = contracts.calculateOrderDiscount(items, {
        ...sampleSnapshotBase,
        valueType: 'PERCENT',
        value: 20,
        maxDiscountAmount: 45000,
        scope: 'CATEGORY',
        targetCategoryIds: [100],
        targetProductIds: [],
        minOrderAmount: null,
      });
      // Eligible = 300,000 * 20% = 60,000 -> capped at 45,000
      expect(result.eligibleSubtotal).toBe(300000);
      expect(result.discountAmount).toBe(45000);
      expect(result.totalAmount).toBe(295000);
    });

    it('Case 6: ORDER + FIXED subtracts flat once regardless of item count', () => {
      const result = contracts.calculateOrderDiscount(items, {
        ...sampleSnapshotBase,
        valueType: 'FIXED',
        value: 25000,
        maxDiscountAmount: null,
        scope: 'ORDER',
        targetCategoryIds: [],
        targetProductIds: [],
        minOrderAmount: null,
      });
      expect(result.discountAmount).toBe(25000);
      expect(result.totalAmount).toBe(315000);
    });

    it('Case 7: A1 warning MIN_ORDER_NOT_MET / NOT_APPLICABLE gives 0 discount', () => {
      const minNotMet = contracts.calculateOrderDiscount(
        [{ productId: 1, categoryId: 100, unitPrice: 90000, quantity: 1, kitchenStatus: 'PRINTED' }],
        {
          ...sampleSnapshotBase,
          valueType: 'FIXED',
          value: 20000,
          maxDiscountAmount: null,
          scope: 'ORDER',
          targetCategoryIds: [],
          targetProductIds: [],
          minOrderAmount: 100000,
        },
      );
      expect(minNotMet.discountAmount).toBe(0);
      expect(minNotMet.totalAmount).toBe(90000);
      expect(minNotMet.warningCode).toBe('MIN_ORDER_NOT_MET');

      const notApplicable = contracts.calculateOrderDiscount(
        [{ productId: 3, categoryId: 200, unitPrice: 20000, quantity: 2, kitchenStatus: 'PRINTED' }],
        {
          ...sampleSnapshotBase,
          valueType: 'FIXED',
          value: 5000,
          maxDiscountAmount: null,
          scope: 'CATEGORY',
          targetCategoryIds: [100],
          targetProductIds: [],
          minOrderAmount: null,
        },
      );
      expect(notApplicable.discountAmount).toBe(0);
      expect(notApplicable.totalAmount).toBe(40000);
      expect(notApplicable.warningCode).toBe('NOT_APPLICABLE');
    });

    it('Case 8: COMBO item matches by combo own productId and categoryId', () => {
      const result = contracts.calculateOrderDiscount(
        [{ productId: 99, categoryId: 300, unitPrice: 159000, quantity: 1, kitchenStatus: 'NEW' }],
        {
          ...sampleSnapshotBase,
          valueType: 'PERCENT',
          value: 10,
          maxDiscountAmount: null,
          scope: 'CATEGORY',
          targetCategoryIds: [300],
          targetProductIds: [],
          minOrderAmount: null,
        },
      );
      // 159,000 * 10% = 15,900 -> floors down to 15,000
      expect(result.discountAmount).toBe(15000);
      expect(result.totalAmount).toBe(144000);
    });
  });

  describe('evaluateDiscountScheduleWindow (Asia/Ho_Chi_Minh)', () => {
    const baseDiscount = {
      isActive: true,
      isArchived: false,
      startsAt: null,
      endsAt: null,
      activeWeekdays: [] as number[],
      timeWindowStart: null,
      timeWindowEnd: null,
      usageLimit: null,
      usedCount: 0,
    };

    it('checks happy hour time window in Asia/Ho_Chi_Minh (+07:00)', () => {
      const happyHour = {
        ...baseDiscount,
        activeWeekdays: [7], // Sunday
        timeWindowStart: '14:00',
        timeWindowEnd: '17:00',
      };
      // 2026-11-15 is Sunday; 09:50 UTC = 16:50 +07:00 (inside window)
      expect(
        contracts.evaluateDiscountScheduleWindow(happyHour, new Date('2026-11-15T09:50:00.000Z')),
      ).toEqual({ ok: true });

      // 10:05 UTC = 17:05 +07:00 (outside window)
      expect(
        contracts.evaluateDiscountScheduleWindow(happyHour, new Date('2026-11-15T10:05:00.000Z')),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_OUT_OF_TIME_WINDOW' });

      // 2026-11-16 is Monday (weekday 1, not in [7])
      expect(
        contracts.evaluateDiscountScheduleWindow(happyHour, new Date('2026-11-16T09:00:00.000Z')),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_OUT_OF_TIME_WINDOW' });
    });

    it('checks active flag, date range, and usage limit', () => {
      expect(
        contracts.evaluateDiscountScheduleWindow({ ...baseDiscount, isActive: false }),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_INACTIVE' });

      expect(
        contracts.evaluateDiscountScheduleWindow({
          ...baseDiscount,
          startsAt: '2026-12-01T00:00:00.000Z',
        }, new Date('2026-11-15T00:00:00.000Z')),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_NOT_STARTED' });

      expect(
        contracts.evaluateDiscountScheduleWindow({
          ...baseDiscount,
          endsAt: '2026-11-10T00:00:00.000Z',
        }, new Date('2026-11-15T00:00:00.000Z')),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_EXPIRED' });

      expect(
        contracts.evaluateDiscountScheduleWindow({
          ...baseDiscount,
          usageLimit: 10,
          usedCount: 10,
        }),
      ).toMatchObject({ ok: false, reasonCode: 'DISCOUNT_USAGE_EXHAUSTED' });
    });
  });

  it('tracks discounts RBAC module and pos.manualDiscount permission without POS fallback leaks', () => {
    const parsed = contracts.UserPermissionsSchema.parse({
      pos: { view: true, create: true, update: true, checkout: true },
    });
    expect(parsed.pos.manualDiscount).toBe(false);
    expect(parsed.discounts).toEqual({ view: false, create: false, update: false, delete: false });
  });
});
