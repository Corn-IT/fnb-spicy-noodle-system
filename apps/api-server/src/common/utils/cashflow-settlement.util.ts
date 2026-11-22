import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import { businessDateString, businessDayRange, dateAtVietnamMidnight, dateOnly } from './business-date.util';

const ZERO = new Prisma.Decimal(0);

type SalesTotalsRow = {
  totalCashSales: Prisma.Decimal | null;
  totalTransferSales: Prisma.Decimal | null;
};

function timeAtBusinessDate(date: string, hour: number, minute: number): Date {
  const start = dateAtVietnamMidnight(date);
  return new Date(start.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000);
}

export function getShiftRange(date: string, shiftName: string): { start: Date; end: Date } {
  const normalizedName = shiftName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('vi-VN');
  const customHours = shiftName.match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  const range = businessDayRange(date);
  if (customHours) {
    return {
      start: timeAtBusinessDate(date, Number(customHours[1]), Number(customHours[2])),
      end: timeAtBusinessDate(date, Number(customHours[3]), Number(customHours[4])),
    };
  }
  if (normalizedName.includes('sang')) {
    return { start: timeAtBusinessDate(date, 8, 0), end: timeAtBusinessDate(date, 15, 0) };
  }
  if (normalizedName.includes('toi')) {
    return { start: timeAtBusinessDate(date, 15, 0), end: timeAtBusinessDate(date, 22, 0) };
  }
  return range;
}

export async function queryShiftSalesTotals(
  client: PrismaService | Prisma.TransactionClient,
  start: Date,
  end: Date,
): Promise<{ totalCashSales: Prisma.Decimal; totalTransferSales: Prisma.Decimal }> {
  const [totals] = await client.$queryRaw<SalesTotalsRow[]>`
    SELECT
      COALESCE(SUM(CASE
        WHEN payment_method = 'CASH' THEN total_amount
        WHEN payment_method = 'SPLIT' THEN cash_amount
        ELSE 0
      END), 0)::numeric(12, 2) AS "totalCashSales",
      COALESCE(SUM(CASE
        WHEN payment_method = 'TRANSFER' THEN total_amount
        WHEN payment_method = 'SPLIT' THEN transfer_amount
        ELSE 0
      END), 0)::numeric(12, 2) AS "totalTransferSales"
    FROM orders
    WHERE status = 'PAID'
      AND payment_method IN ('CASH', 'TRANSFER', 'SPLIT')
      AND paid_at >= ${start}
      AND paid_at < ${end}
  `;
  return {
    totalCashSales: totals?.totalCashSales ?? ZERO,
    totalTransferSales: totals?.totalTransferSales ?? ZERO,
  };
}

export async function recalculateSettledCashflowsForTimestamp(
  tx: Prisma.TransactionClient,
  paidAt: Date | null | undefined,
): Promise<number[]> {
  if (!paidAt) return [];
  const txAny = tx as unknown as {
    cashDrawerSettlement?: {
      findMany?: (args: unknown) => Promise<Array<{
        id: number;
        settlementDate: Date;
        shiftName: string;
        openingBudget: Prisma.Decimal;
        totalCashImports: Prisma.Decimal;
        actualCountedCash: Prisma.Decimal;
      }>>;
      update?: (args: unknown) => Promise<unknown>;
    };
  };

  if (typeof txAny.cashDrawerSettlement?.findMany !== 'function' || typeof txAny.cashDrawerSettlement?.update !== 'function') {
    return [];
  }

  const businessDate = businessDateString(paidAt);
  const settlements = await txAny.cashDrawerSettlement.findMany({
    where: { settlementDate: dateOnly(businessDate) },
  });

  const updatedIds: number[] = [];
  for (const settlement of settlements) {
    const { start, end } = getShiftRange(businessDateString(settlement.settlementDate), settlement.shiftName);
    if (paidAt < start || paidAt >= end) continue;

    const totals = await queryShiftSalesTotals(tx, start, end);
    const expectedCashInDrawer = settlement.openingBudget.plus(totals.totalCashSales).minus(settlement.totalCashImports);
    const discrepancyAmount = settlement.actualCountedCash.minus(expectedCashInDrawer);
    const status = discrepancyAmount.isZero()
      ? 'MATCHED'
      : discrepancyAmount.greaterThan(0) ? 'SURPLUS' : 'SHORTAGE';

    await txAny.cashDrawerSettlement.update({
      where: { id: settlement.id },
      data: {
        totalCashSales: totals.totalCashSales,
        totalTransferSales: totals.totalTransferSales,
        expectedCashInDrawer,
        discrepancyAmount,
        status,
      },
    });
    updatedIds.push(settlement.id);
  }
  return updatedIds;
}
