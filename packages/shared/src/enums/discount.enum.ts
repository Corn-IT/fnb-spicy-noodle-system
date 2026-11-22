import { z } from 'zod';

export const DiscountValueType = {
  PERCENT: 'PERCENT',
  FIXED: 'FIXED',
} as const;
export type DiscountValueType = (typeof DiscountValueType)[keyof typeof DiscountValueType];
export const DiscountValueTypeSchema = z.enum([
  DiscountValueType.PERCENT,
  DiscountValueType.FIXED,
]);

export const DiscountScope = {
  ORDER: 'ORDER',
  CATEGORY: 'CATEGORY',
  PRODUCT: 'PRODUCT',
} as const;
export type DiscountScope = (typeof DiscountScope)[keyof typeof DiscountScope];
export const DiscountScopeSchema = z.enum([
  DiscountScope.ORDER,
  DiscountScope.CATEGORY,
  DiscountScope.PRODUCT,
]);

export const DiscountKind = {
  CODE: 'CODE',
  MANUAL: 'MANUAL',
} as const;
export type DiscountKind = (typeof DiscountKind)[keyof typeof DiscountKind];
export const DiscountKindSchema = z.enum([
  DiscountKind.CODE,
  DiscountKind.MANUAL,
]);

export const DiscountWarningCode = {
  NOT_APPLICABLE: 'NOT_APPLICABLE',
  MIN_ORDER_NOT_MET: 'MIN_ORDER_NOT_MET',
} as const;
export type DiscountWarningCode = (typeof DiscountWarningCode)[keyof typeof DiscountWarningCode];
export const DiscountWarningCodeSchema = z.enum([
  DiscountWarningCode.NOT_APPLICABLE,
  DiscountWarningCode.MIN_ORDER_NOT_MET,
]);
