import { z } from 'zod';

export const MdmCategory = {
  POSITION: 'POSITION',
  SPECIALTY: 'SPECIALTY',
  INGREDIENT: 'INGREDIENT',
  UNIT: 'UNIT',
  SUPPLIER: 'SUPPLIER',
  MENU_CATEGORY: 'MENU_CATEGORY',
} as const;
export type MdmCategory = (typeof MdmCategory)[keyof typeof MdmCategory];
export const MdmCategorySchema = z.enum([
  MdmCategory.POSITION,
  MdmCategory.SPECIALTY,
  MdmCategory.INGREDIENT,
  MdmCategory.UNIT,
  MdmCategory.SUPPLIER,
  MdmCategory.MENU_CATEGORY,
]);

export const PaymentSource = { CASH_DRAWER: 'CASH_DRAWER', EXTERNAL: 'EXTERNAL' } as const;
export type PaymentSource = (typeof PaymentSource)[keyof typeof PaymentSource];
export const PaymentSourceSchema = z.enum([PaymentSource.CASH_DRAWER, PaymentSource.EXTERNAL]);

export const SettlementStatus = { MATCHED: 'MATCHED', SURPLUS: 'SURPLUS', SHORTAGE: 'SHORTAGE' } as const;
export type SettlementStatus = (typeof SettlementStatus)[keyof typeof SettlementStatus];
export const SettlementStatusSchema = z.enum([
  SettlementStatus.MATCHED,
  SettlementStatus.SURPLUS,
  SettlementStatus.SHORTAGE,
]);
