import { z } from 'zod';

export const OrderType = { DINE_IN: 'DINE_IN', TAKEAWAY: 'TAKEAWAY' } as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];
export const OrderTypeSchema = z.enum([OrderType.DINE_IN, OrderType.TAKEAWAY]);

export const OrderSource = { QR_CODE: 'QR_CODE', POS_COUNTER: 'POS_COUNTER' } as const;
export type OrderSource = (typeof OrderSource)[keyof typeof OrderSource];
export const OrderSourceSchema = z.enum([OrderSource.QR_CODE, OrderSource.POS_COUNTER]);

export const OrderStatus = {
  PENDING: 'PENDING',
  SERVING: 'SERVING',
  PAID: 'PAID',
  MERGED: 'MERGED',
  VOIDED: 'VOIDED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const OrderStatusSchema = z.enum([
  OrderStatus.PENDING,
  OrderStatus.SERVING,
  OrderStatus.PAID,
  OrderStatus.MERGED,
  OrderStatus.VOIDED,
]);

export const KitchenStatus = { NEW: 'NEW', PRINTED: 'PRINTED', CANCELLED: 'CANCELLED' } as const;
export type KitchenStatus = (typeof KitchenStatus)[keyof typeof KitchenStatus];
export const KitchenStatusSchema = z.enum([
  KitchenStatus.NEW,
  KitchenStatus.PRINTED,
  KitchenStatus.CANCELLED,
]);

export const PaymentMethod = { CASH: 'CASH', TRANSFER: 'TRANSFER', SPLIT: 'SPLIT' } as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const PaymentMethodSchema = z.enum([
  PaymentMethod.CASH,
  PaymentMethod.TRANSFER,
  PaymentMethod.SPLIT,
]);

export const TableStatus = { AVAILABLE: 'AVAILABLE', PENDING: 'PENDING', OCCUPIED: 'OCCUPIED' } as const;
export type TableStatus = (typeof TableStatus)[keyof typeof TableStatus];
export const TableStatusSchema = z.enum([
  TableStatus.AVAILABLE,
  TableStatus.PENDING,
  TableStatus.OCCUPIED,
]);

export const TableActionType = { MOVE: 'MOVE', MERGE: 'MERGE', SWAP: 'SWAP' } as const;
export type TableActionType = (typeof TableActionType)[keyof typeof TableActionType];
export const TableActionTypeSchema = z.enum([
  TableActionType.MOVE,
  TableActionType.MERGE,
  TableActionType.SWAP,
]);
