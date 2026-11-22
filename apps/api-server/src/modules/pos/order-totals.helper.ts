import { Prisma } from '@prisma/client';
import {
  DiscountSnapshotSchema,
  calculateOrderDiscount,
  type DiscountCalcRule,
  type DiscountCalculableItem,
  type DiscountCalculationResult,
  type DiscountSnapshot,
} from '@fnb/shared';

export interface ActiveOrderItemRow {
  productId?: number;
  quantity: number;
  unitPrice: Prisma.Decimal | number;
  kitchenStatus?: string;
  product?: { categoryId?: number | null } | null;
}

export interface RecomputedOrderTotals extends DiscountCalculationResult {
  snapshot: DiscountSnapshot | null;
  subtotalDecimal: Prisma.Decimal;
  discountDecimal: Prisma.Decimal;
  totalDecimal: Prisma.Decimal;
}

export function extractDiscountSnapshot(raw: unknown): DiscountSnapshot | null {
  if (raw === null || raw === undefined) return null;
  const parsed = DiscountSnapshotSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function snapshotToCalcRule(snapshot: DiscountSnapshot | null): DiscountCalcRule | null {
  if (!snapshot) return null;
  return {
    valueType: snapshot.valueType,
    value: snapshot.value,
    maxDiscountAmount: snapshot.maxDiscountAmount,
    scope: snapshot.scope,
    targetCategoryIds: snapshot.targetCategoryIds,
    targetProductIds: snapshot.targetProductIds,
    minOrderAmount: snapshot.minOrderAmount,
  };
}

export function hasOrderDiscount(order: {
  discountSnapshot?: unknown;
  discountAmount?: Prisma.Decimal | number | null;
  discountId?: number | null;
}): boolean {
  if (extractDiscountSnapshot(order.discountSnapshot) !== null) return true;
  if ((order.discountId ?? null) !== null) return true;
  return Number(order.discountAmount ?? 0) > 0;
}

export function toCalcItems(rows: ReadonlyArray<ActiveOrderItemRow>): DiscountCalculableItem[] {
  return rows.map((row) => ({
    productId: Number(row.productId ?? 0),
    categoryId: row.product?.categoryId ?? null,
    quantity: Number(row.quantity),
    unitPrice: typeof row.unitPrice === 'number' ? row.unitPrice : Number(row.unitPrice.toString()),
    kitchenStatus: row.kitchenStatus,
  }));
}

export function computeTotalsFromRows(
  rows: ReadonlyArray<ActiveOrderItemRow>,
  snapshotRaw: unknown,
): RecomputedOrderTotals {
  const snapshot = extractDiscountSnapshot(snapshotRaw);
  const calc = calculateOrderDiscount(toCalcItems(rows), snapshotToCalcRule(snapshot));
  return {
    ...calc,
    snapshot,
    subtotalDecimal: new Prisma.Decimal(calc.subtotalAmount.toFixed(2)),
    discountDecimal: new Prisma.Decimal(calc.discountAmount.toFixed(2)),
    totalDecimal: new Prisma.Decimal(calc.totalAmount.toFixed(2)),
  };
}

/**
 * Unified order subtotal / discount / payable total recomputation inside an active Prisma transaction.
 * Persists subtotal_amount, discount_amount, and total_amount consistently with chk_order_discount_amounts.
 */
export async function recomputeOrderTotals(
  tx: Prisma.TransactionClient,
  orderId: number,
  existingSnapshot?: unknown,
  extraData: Prisma.OrderUpdateInput = {},
): Promise<RecomputedOrderTotals> {
  let snapshotRaw = existingSnapshot;
  if (snapshotRaw === undefined) {
    const orderMeta = await tx.order.findUnique({
      where: { id: orderId },
      select: { discountSnapshot: true },
    });
    snapshotRaw = orderMeta?.discountSnapshot ?? null;
  }

  const rawRows = await tx.orderItem.findMany({
    where: { orderId, kitchenStatus: { in: ['NEW', 'PRINTED'] } },
    include: { product: { select: { categoryId: true } } },
  });
  const rows = Array.isArray(rawRows) ? (rawRows as ActiveOrderItemRow[]) : [];
  const totals = computeTotalsFromRows(rows, snapshotRaw);

  await tx.order.update({
    where: { id: orderId },
    data: {
      ...extraData,
      subtotalAmount: totals.subtotalDecimal,
      discountAmount: totals.discountDecimal,
      totalAmount: totals.totalDecimal,
    },
  });

  return totals;
}
