import {
  type DiscountScope,
  type DiscountValueType,
  type DiscountWarningCode,
  DiscountWarningCode as WarningCodes,
} from '../enums/discount.enum';

export interface DiscountCalculableItem {
  productId: number;
  categoryId?: number | null;
  unitPrice: number;
  quantity: number;
  kitchenStatus?: string;
}

export interface DiscountCalcRule {
  valueType: DiscountValueType;
  value: number;
  maxDiscountAmount?: number | null;
  scope: DiscountScope;
  targetCategoryIds?: readonly number[];
  targetProductIds?: readonly number[];
  minOrderAmount?: number | null;
}

export interface DiscountCalculationResult {
  subtotalAmount: number;
  eligibleSubtotal: number;
  eligibleQty: number;
  discountAmount: number;
  totalAmount: number;
  warningCode: DiscountWarningCode | null;
  warningMessage: string | null;
}

export interface DiscountScheduleCandidate {
  isActive: boolean;
  isArchived: boolean;
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  activeWeekdays?: readonly number[];
  timeWindowStart?: string | null;
  timeWindowEnd?: string | null;
  usageLimit?: number | null;
  usedCount?: number;
}

export type DiscountScheduleFailureCode =
  | 'DISCOUNT_INACTIVE'
  | 'DISCOUNT_NOT_STARTED'
  | 'DISCOUNT_EXPIRED'
  | 'DISCOUNT_OUT_OF_TIME_WINDOW'
  | 'DISCOUNT_USAGE_EXHAUSTED';

export type DiscountScheduleEvaluation =
  | { ok: true }
  | { ok: false; reasonCode: DiscountScheduleFailureCode; message: string };

function roundMoney2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function floorToThousand(rawValue: number): number {
  const normalized = Number(rawValue.toFixed(4));
  if (normalized <= 0) return 0;
  return Math.floor(normalized / 1000) * 1000;
}

/**
 * Computes order subtotal, rounded discount amount (floor to nearest 1,000 VND),
 * payable total, and eligibility warnings from current non-cancelled items and a discount rule/snapshot.
 */
export function calculateOrderDiscount(
  items: readonly DiscountCalculableItem[],
  rule: DiscountCalcRule | null | undefined,
): DiscountCalculationResult {
  const activeItems = items.filter((item) => item.kitchenStatus !== 'CANCELLED');
  const subtotalAmount = roundMoney2(
    activeItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );

  if (!rule) {
    const totalQty = activeItems.reduce((sum, item) => sum + item.quantity, 0);
    return {
      subtotalAmount,
      eligibleSubtotal: subtotalAmount,
      eligibleQty: totalQty,
      discountAmount: 0,
      totalAmount: subtotalAmount,
      warningCode: null,
      warningMessage: null,
    };
  }

  const categorySet = new Set(rule.targetCategoryIds ?? []);
  const productSet = new Set(rule.targetProductIds ?? []);

  const eligibleItems = activeItems.filter((item) => {
    if (rule.scope === 'ORDER') return true;
    if (rule.scope === 'CATEGORY') {
      return item.categoryId != null && categorySet.has(item.categoryId);
    }
    return productSet.has(item.productId);
  });

  const eligibleSubtotal = roundMoney2(
    eligibleItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
  );
  const eligibleQty = eligibleItems.reduce((sum, item) => sum + item.quantity, 0);

  if (eligibleItems.length === 0 || eligibleSubtotal <= 0 || eligibleQty <= 0) {
    return {
      subtotalAmount,
      eligibleSubtotal: 0,
      eligibleQty: 0,
      discountAmount: 0,
      totalAmount: subtotalAmount,
      warningCode: WarningCodes.NOT_APPLICABLE,
      warningMessage: 'Đơn hàng chưa có món thuộc phạm vi áp dụng của mã giảm giá.',
    };
  }

  if (rule.minOrderAmount != null && eligibleSubtotal < rule.minOrderAmount) {
    return {
      subtotalAmount,
      eligibleSubtotal,
      eligibleQty,
      discountAmount: 0,
      totalAmount: subtotalAmount,
      warningCode: WarningCodes.MIN_ORDER_NOT_MET,
      warningMessage: `Chưa đạt mức tối thiểu ${rule.minOrderAmount.toLocaleString('vi-VN')}đ để áp dụng giảm giá.`,
    };
  }

  let rawDiscount = 0;
  if (rule.valueType === 'PERCENT') {
    rawDiscount = (eligibleSubtotal * rule.value) / 100;
    if (rule.maxDiscountAmount != null) {
      rawDiscount = Math.min(rawDiscount, rule.maxDiscountAmount);
    }
  } else {
    rawDiscount = rule.scope === 'ORDER' ? rule.value : rule.value * eligibleQty;
  }

  let discountAmount = floorToThousand(rawDiscount);
  if (discountAmount > eligibleSubtotal) {
    discountAmount = roundMoney2(eligibleSubtotal);
  }
  if (discountAmount < 0) {
    discountAmount = 0;
  }

  const totalAmount = roundMoney2(Math.max(0, subtotalAmount - discountAmount));

  return {
    subtotalAmount,
    eligibleSubtotal,
    eligibleQty,
    discountAmount,
    totalAmount,
    warningCode: null,
    warningMessage: null,
  };
}

const WEEKDAY_MAP: Readonly<Record<string, number>> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

const VN_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Ho_Chi_Minh',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getVietnamDateTimeParts(now: Date = new Date()): { weekday: number; hhMm: string } {
  const parts = VN_TIME_FORMATTER.formatToParts(now);
  const weekdayRaw = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const hourRaw = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minuteRaw = parts.find((p) => p.type === 'minute')?.value ?? '00';
  const hour = hourRaw === '24' ? '00' : hourRaw.padStart(2, '0');
  const minute = minuteRaw.padStart(2, '0');
  return {
    weekday: WEEKDAY_MAP[weekdayRaw] ?? 1,
    hhMm: `${hour}:${minute}`,
  };
}

/**
 * Checks whether a discount is currently eligible by active status, date range,
 * Vietnam-timezone weekday/time window, and usage limit.
 */
export function evaluateDiscountScheduleWindow(
  discount: DiscountScheduleCandidate,
  now: Date = new Date(),
): DiscountScheduleEvaluation {
  if (discount.isArchived || !discount.isActive) {
    return {
      ok: false,
      reasonCode: 'DISCOUNT_INACTIVE',
      message: 'Mã giảm giá đang tắt hoặc đã được lưu trữ',
    };
  }

  const startsAt = discount.startsAt ? new Date(discount.startsAt) : null;
  if (startsAt && now < startsAt) {
    return {
      ok: false,
      reasonCode: 'DISCOUNT_NOT_STARTED',
      message: 'Mã giảm giá chưa đến thời gian bắt đầu áp dụng',
    };
  }

  const endsAt = discount.endsAt ? new Date(discount.endsAt) : null;
  if (endsAt && now > endsAt) {
    return {
      ok: false,
      reasonCode: 'DISCOUNT_EXPIRED',
      message: 'Mã giảm giá đã hết hạn sử dụng',
    };
  }

  const { weekday, hhMm } = getVietnamDateTimeParts(now);
  const activeWeekdays = discount.activeWeekdays ?? [];
  if (activeWeekdays.length > 0 && !activeWeekdays.includes(weekday)) {
    return {
      ok: false,
      reasonCode: 'DISCOUNT_OUT_OF_TIME_WINDOW',
      message: 'Mã giảm giá không áp dụng vào ngày hôm nay',
    };
  }

  if (discount.timeWindowStart && discount.timeWindowEnd) {
    if (hhMm < discount.timeWindowStart || hhMm > discount.timeWindowEnd) {
      return {
        ok: false,
        reasonCode: 'DISCOUNT_OUT_OF_TIME_WINDOW',
        message: `Mã giảm giá chỉ áp dụng trong khung giờ ${discount.timeWindowStart}–${discount.timeWindowEnd}`,
      };
    }
  }

  if (discount.usageLimit != null && (discount.usedCount ?? 0) >= discount.usageLimit) {
    return {
      ok: false,
      reasonCode: 'DISCOUNT_USAGE_EXHAUSTED',
      message: 'Mã giảm giá đã hết lượt sử dụng',
    };
  }

  return { ok: true };
}
