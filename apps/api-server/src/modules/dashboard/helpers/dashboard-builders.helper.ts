import { Prisma } from '@prisma/client';
import {
  DiscountSnapshotSchema,
  KitchenStation,
  PendingPaymentEditSchema,
  type DashboardScope,
  type KitchenStation as KitchenStationType,
  type OrderSource,
  type OrderType,
  type PaymentAccount,
  type PaymentMethod,
  type PosTableGridResponse,
  type ProductStation,
  type SettlementStatus,
} from '@fnb/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { businessDateString } from '../../../common/utils/business-date.util';
import { normalizeTakeawayLabelFormat } from '../../../common/utils/takeaway-format.util';
import { PayrollService } from '../../hr-schedule/payroll.service';
import {
  HOUR_SLOTS,
  NEAR_LIMIT_RATIO,
  OVERDUE_QR_SECONDS,
  SPECIALTY_DISPLAY_LABELS,
  STATION_META,
  WEEKDAY_LABELS_VI,
  addDaysIso,
  formatTableOrTakeawayLabel,
  getVietnamMondayAndWeekday,
  roundMoney,
  toPhysicalStation,
  toVietnamHour,
  type ComboPartRow,
  type PaidOrderItemRow,
  type PaidOrderRow,
  type ResolvedPeriod,
} from './dashboard-daily-sales.helper';

export interface PendingEditOrderRow {
  id: number;
  orderCode: string;
  orderType: string;
  takeawayNumber: number | null;
  takeawayLabelFormat: string | null;
  paymentMethod: string | null;
  totalAmount: Prisma.Decimal;
  pendingPaymentEdit: Prisma.JsonValue | null;
  table: { name: string } | null;
}

export interface LatestSettlementRow {
  id: number;
  settlementDate: Date;
  shiftName: string;
  status: string;
  discrepancyAmount: Prisma.Decimal;
  actualCountedCash: Prisma.Decimal;
}

export interface InventoryRowSummary {
  totalCost: Prisma.Decimal;
  paymentSource: string;
}

export interface TodayScheduleInput {
  dayOfWeek: number;
  cells: Array<{
    timeSlot: string;
    attendances?: Array<{ employeeId: number; mode?: string | null }>;
    employees: Array<{
      id: number;
      shortName: string;
      fullName: string;
      specialtyCode?: string | null;
    }>;
  }>;
}

export function buildAlerts(
  tableGrid: PosTableGridResponse | null,
  pendingEditOrders: PendingEditOrderRow[],
  paymentQrList: PaymentAccount[],
  now: Date,
  scope: DashboardScope,
) {
  const pendingQrTables = scope.canPos && tableGrid
    ? tableGrid.tables
        .filter((table) => Boolean(table.activeOrder && (table.status === 'PENDING' || table.activeOrder.pendingQrKind)))
        .map((table) => {
          const order = table.activeOrder!;
          const sinceIso = order.pendingQrSince ?? order.createdAt;
          const waitSeconds = Math.max(0, Math.floor((now.getTime() - new Date(sinceIso).getTime()) / 1000));
          return {
            orderId: order.orderId,
            orderCode: order.orderCode,
            tableId: table.id,
            tableLabel: table.name,
            kind: order.pendingQrKind ?? (table.status === 'PENDING' ? 'NEW' : 'ADDON'),
            totalAmount: order.totalAmount,
            pendingSince: sinceIso,
            waitSeconds,
            isOverdue: waitSeconds >= OVERDUE_QR_SECONDS,
          };
        })
    : [];

  const pendingPaymentEdits = (scope.canInvoices || scope.canViewProfit)
    ? pendingEditOrders.flatMap((order) => {
        const parsed = PendingPaymentEditSchema.safeParse(order.pendingPaymentEdit);
        if (!parsed.success) return [];
        const label = formatTableOrTakeawayLabel(
          order.orderType,
          order.table?.name,
          order.takeawayNumber,
          order.takeawayLabelFormat,
        ) ?? order.orderCode;
        return [{
          orderId: order.id,
          orderCode: order.orderCode,
          tableLabel: label,
          totalAmount: order.totalAmount.toNumber(),
          currentMethod: (order.paymentMethod as PaymentMethod | null) ?? null,
          requestedMethod: parsed.data.paymentMethod,
          requestedByName: parsed.data.requestedByName,
          requestedAt: parsed.data.requestedAt,
        }];
      })
    : [];

  const nearLimitQrAccounts = paymentQrList
    .filter((acc) => {
      if (!acc.isActive) return false;
      if (acc.status === 'DAY_FULL' || acc.status === 'MONTH_FULL' || acc.status === 'YEAR_FULL') return true;
      return acc.dailyLimit !== null && acc.dailyLimit > 0 && acc.usedDay / acc.dailyLimit >= NEAR_LIMIT_RATIO;
    })
    .map((acc) => ({
      id: acc.id,
      label: acc.label,
      bankCode: acc.bankCode,
      accountNo: acc.accountNo,
      usedDay: acc.usedDay,
      dailyLimit: acc.dailyLimit,
      dayPercent: acc.dailyLimit && acc.dailyLimit > 0 ? Math.min(100, Math.round((acc.usedDay / acc.dailyLimit) * 100)) : null,
      status: acc.status,
    }));

  return { pendingQrTables, pendingPaymentEdits, nearLimitQrAccounts };
}

export function buildRevenueKpi(paidOrders: PaidOrderRow[], previousNetPaidAmount: number) {
  let netPaidAmount = 0;
  let subtotalAmount = 0;
  let discountAmount = 0;
  let dineInCount = 0;
  let takeawayCount = 0;
  let qrSourceCount = 0;
  let posSourceCount = 0;

  for (const order of paidOrders) {
    netPaidAmount += order.totalAmount.toNumber();
    subtotalAmount += order.subtotalAmount.toNumber();
    discountAmount += order.discountAmount.toNumber();
    if (order.orderType === 'TAKEAWAY') takeawayCount += 1;
    else dineInCount += 1;
    if (order.orderSource === 'QR_CODE') qrSourceCount += 1;
    else posSourceCount += 1;
  }

  netPaidAmount = roundMoney(netPaidAmount);
  subtotalAmount = roundMoney(subtotalAmount);
  discountAmount = roundMoney(discountAmount);
  const paidOrderCount = paidOrders.length;
  const averageOrderValue = paidOrderCount > 0 ? Math.round(netPaidAmount / paidOrderCount) : 0;
  const growthPercent = previousNetPaidAmount > 0
    ? Number((((netPaidAmount - previousNetPaidAmount) / previousNetPaidAmount) * 100).toFixed(1))
    : null;

  return {
    netPaidAmount,
    subtotalAmount,
    discountAmount,
    paidOrderCount,
    dineInCount,
    takeawayCount,
    qrSourceCount,
    posSourceCount,
    averageOrderValue,
    previousNetPaidAmount: roundMoney(previousNetPaidAmount),
    growthPercent,
  };
}

export async function buildCashDrawerKpi(
  prisma: PrismaService,
  period: ResolvedPeriod,
  openingBudget: number,
  paidOrders: PaidOrderRow[],
  latestSettlement: LatestSettlementRow | null,
  blindMode: boolean,
) {
  const settlementSummary = latestSettlement
    ? {
        id: latestSettlement.id,
        settlementDate: businessDateString(latestSettlement.settlementDate),
        shiftName: latestSettlement.shiftName,
        status: latestSettlement.status as SettlementStatus,
        discrepancyAmount: latestSettlement.discrepancyAmount.toNumber(),
        actualCountedCash: latestSettlement.actualCountedCash.toNumber(),
      }
    : null;

  if (blindMode) {
    return {
      blindMode: true,
      openingBudget,
      totalCashSales: null,
      cashOnlySales: null,
      splitCashSales: null,
      totalCashImports: null,
      expectedCashInDrawer: null,
      estimatedHandOver: null,
      latestSettlement: settlementSummary,
    };
  }

  let cashOnlySales = 0;
  let splitCashSales = 0;
  for (const order of paidOrders) {
    if (order.paymentMethod === 'CASH') cashOnlySales += order.totalAmount.toNumber();
    else if (order.paymentMethod === 'SPLIT') splitCashSales += order.cashAmount.toNumber();
  }
  cashOnlySales = roundMoney(cashOnlySales);
  splitCashSales = roundMoney(splitCashSales);
  const totalCashSales = roundMoney(cashOnlySales + splitCashSales);

  // Match CashflowService.getCashImports (CASH_DRAWER imports by createdAt within period bounds)
  let totalCashImports = 0;
  if (typeof prisma.inventoryImport?.aggregate === 'function') {
    const cashImportAgg = await prisma.inventoryImport.aggregate({
      where: {
        paymentSource: 'CASH_DRAWER',
        isDeleted: false,
        createdAt: { gte: period.startUtc, lt: period.endUtc },
      },
      _sum: { totalCost: true },
    });
    totalCashImports = roundMoney(cashImportAgg._sum.totalCost?.toNumber() ?? 0);
  }

  const expectedCashInDrawer = roundMoney(openingBudget + totalCashSales - totalCashImports);
  const estimatedHandOver = expectedCashInDrawer > openingBudget
    ? roundMoney(expectedCashInDrawer - openingBudget)
    : 0;

  return {
    blindMode: false,
    openingBudget,
    totalCashSales,
    cashOnlySales,
    splitCashSales,
    totalCashImports,
    expectedCashInDrawer,
    estimatedHandOver,
    latestSettlement: settlementSummary,
  };
}

export function buildTransferKpi(paidOrders: PaidOrderRow[], netPaidAmount: number) {
  let transferOnlySales = 0;
  let splitTransferSales = 0;
  let transferOrderCount = 0;
  let splitOrderCount = 0;

  const accountMap = new Map<string, { accountId: number | null; label: string; bankCode: string | null; amount: number; orderCount: number }>();

  for (const order of paidOrders) {
    let transferAmount = 0;
    if (order.paymentMethod === 'TRANSFER') {
      transferAmount = order.totalAmount.toNumber();
      transferOnlySales += transferAmount;
      transferOrderCount += 1;
    } else if (order.paymentMethod === 'SPLIT') {
      transferAmount = order.transferAmount.toNumber();
      splitTransferSales += transferAmount;
      splitOrderCount += 1;
    }
    if (transferAmount > 0) {
      const key = order.paymentAccount ? `acc_${order.paymentAccount.id}` : 'unassigned';
      const prev = accountMap.get(key) ?? {
        accountId: order.paymentAccount?.id ?? null,
        label: order.paymentAccount?.label ?? 'Chuyển khoản khác',
        bankCode: order.paymentAccount?.bankCode ?? null,
        amount: 0,
        orderCount: 0,
      };
      prev.amount = roundMoney(prev.amount + transferAmount);
      prev.orderCount += 1;
      accountMap.set(key, prev);
    }
  }

  transferOnlySales = roundMoney(transferOnlySales);
  splitTransferSales = roundMoney(splitTransferSales);
  const totalTransferSales = roundMoney(transferOnlySales + splitTransferSales);
  const sharePercent = netPaidAmount > 0
    ? Number(((totalTransferSales / netPaidAmount) * 100).toFixed(1))
    : 0;

  return {
    totalTransferSales,
    transferOnlySales,
    splitTransferSales,
    transferOrderCount,
    splitOrderCount,
    sharePercent,
    byAccount: [...accountMap.values()].sort((a, b) => b.amount - a.amount),
  };
}

export function buildInventoryKpi(
  inventoryRows: InventoryRowSummary[],
  netPaidAmount: number | null,
) {
  let cashDrawerImportCost = 0;
  let externalImportCost = 0;
  for (const row of inventoryRows) {
    const cost = row.totalCost.toNumber();
    if (row.paymentSource === 'EXTERNAL') externalImportCost += cost;
    else cashDrawerImportCost += cost;
  }
  cashDrawerImportCost = roundMoney(cashDrawerImportCost);
  externalImportCost = roundMoney(externalImportCost);
  const totalImportCost = roundMoney(cashDrawerImportCost + externalImportCost);
  const costToRevenuePercent = netPaidAmount && netPaidAmount > 0
    ? Number(((totalImportCost / netPaidAmount) * 100).toFixed(1))
    : null;

  return {
    totalImportCost,
    cashDrawerImportCost,
    externalImportCost,
    importCount: inventoryRows.length,
    costToRevenuePercent,
  };
}

export function buildOpenOrdersKpi(tableGrid: PosTableGridResponse, unprintedKitchenItemsCount: number) {
  let occupiedTableCount = 0;
  let pendingTableCount = 0;
  let availableTableCount = 0;
  let totalOpenAmount = 0;

  for (const table of tableGrid.tables) {
    if (table.status === 'OCCUPIED') occupiedTableCount += 1;
    else if (table.status === 'PENDING') pendingTableCount += 1;
    else availableTableCount += 1;
    totalOpenAmount += table.activeOrder?.totalAmount ?? 0;
  }

  for (const takeaway of tableGrid.takeaways) {
    totalOpenAmount += takeaway.totalAmount;
  }

  return {
    totalOpenAmount: roundMoney(totalOpenAmount),
    occupiedTableCount,
    pendingTableCount,
    availableTableCount,
    totalPhysicalTables: tableGrid.tables.length,
    takeawayOpenCount: tableGrid.takeaways.length,
    unprintedKitchenItemsCount,
  };
}

export function buildProfitKpi(
  netPaidAmount: number,
  totalImportCost: number,
  estimatedLaborCost: number | null,
) {
  const grossProfitAfterInventory = roundMoney(netPaidAmount - totalImportCost);
  const roundedLabor = estimatedLaborCost !== null ? roundMoney(estimatedLaborCost) : null;
  const netOperatingProfit = roundedLabor !== null
    ? roundMoney(grossProfitAfterInventory - roundedLabor)
    : null;
  const marginSource = netOperatingProfit ?? grossProfitAfterInventory;
  const marginPercent = netPaidAmount > 0
    ? Number(((marginSource / netPaidAmount) * 100).toFixed(1))
    : null;

  return {
    grossProfitAfterInventory,
    estimatedLaborCost: roundedLabor,
    netOperatingProfit,
    marginPercent,
  };
}

export function buildRevenueSeries(period: ResolvedPeriod, paidOrders: PaidOrderRow[]) {
  const isSingleDay = period.fromDate === period.toDate;
  const bucketMap = new Map<string, {
    key: string;
    label: string;
    cashSales: number;
    transferSales: number;
    dineInSales: number;
    takeawaySales: number;
    totalSales: number;
    orderCount: number;
  }>();

  if (isSingleDay) {
    for (const slot of HOUR_SLOTS) {
      bucketMap.set(slot.key, {
        key: slot.key,
        label: slot.label,
        cashSales: 0,
        transferSales: 0,
        dineInSales: 0,
        takeawaySales: 0,
        totalSales: 0,
        orderCount: 0,
      });
    }
  } else {
    let cursor = period.fromDate;
    while (cursor <= period.toDate) {
      const [, mm, dd] = cursor.split('-');
      bucketMap.set(cursor, {
        key: cursor,
        label: `${dd}/${mm}`,
        cashSales: 0,
        transferSales: 0,
        dineInSales: 0,
        takeawaySales: 0,
        totalSales: 0,
        orderCount: 0,
      });
      cursor = addDaysIso(cursor, 1);
    }
  }

  let happyHourAmount = 0;
  let happyHourOrderCount = 0;

  for (const order of paidOrders) {
    if (!order.paidAt) continue;
    const vnHour = toVietnamHour(order.paidAt);
    const vnDate = businessDateString(order.paidAt);

    let key: string;
    if (isSingleDay) {
      const slot = HOUR_SLOTS.find((s) => vnHour >= s.startHour && vnHour < s.endHour) ?? HOUR_SLOTS[HOUR_SLOTS.length - 1]!;
      key = slot.key;
    } else {
      key = vnDate;
    }

    const bucket = bucketMap.get(key);
    if (!bucket) continue;

    const total = order.totalAmount.toNumber();
    const cash = order.paymentMethod === 'CASH'
      ? total
      : order.paymentMethod === 'SPLIT'
        ? order.cashAmount.toNumber()
        : 0;
    const transfer = order.paymentMethod === 'TRANSFER'
      ? total
      : order.paymentMethod === 'SPLIT'
        ? order.transferAmount.toNumber()
        : 0;

    bucket.cashSales = roundMoney(bucket.cashSales + cash);
    bucket.transferSales = roundMoney(bucket.transferSales + transfer);
    if (order.orderType === 'TAKEAWAY') bucket.takeawaySales = roundMoney(bucket.takeawaySales + total);
    else bucket.dineInSales = roundMoney(bucket.dineInSales + total);
    bucket.totalSales = roundMoney(bucket.totalSales + total);
    bucket.orderCount += 1;

    if (vnHour >= 14 && vnHour < 17) {
      happyHourAmount = roundMoney(happyHourAmount + total);
      happyHourOrderCount += 1;
    }
  }

  const buckets = isSingleDay
    ? [...bucketMap.values()].filter((b) => b.key !== '00-08' || b.orderCount > 0)
    : [...bucketMap.values()];

  let peakBucket = buckets[0] ?? null;
  for (const b of buckets) {
    if (!peakBucket || b.totalSales > peakBucket.totalSales) peakBucket = b;
  }

  return {
    granularity: isSingleDay ? ('hour' as const) : ('day' as const),
    buckets,
    peakBucketLabel: peakBucket && peakBucket.totalSales > 0 ? peakBucket.label : null,
    peakBucketAmount: peakBucket?.totalSales ?? 0,
    peakBucketOrders: peakBucket?.orderCount ?? 0,
    happyHourAmount,
    happyHourOrderCount,
  };
}

export function buildPaymentBreakdown(paidOrders: PaidOrderRow[], netPaidAmount: number) {
  const methods: PaymentMethod[] = ['CASH', 'TRANSFER', 'SPLIT'];
  const map = new Map<PaymentMethod, { orderCount: number; totalAmount: number; cashPortion: number; transferPortion: number }>(
    methods.map((m) => [m, { orderCount: 0, totalAmount: 0, cashPortion: 0, transferPortion: 0 }]),
  );

  for (const order of paidOrders) {
    const m = (order.paymentMethod as PaymentMethod | null) ?? null;
    if (!m || !map.has(m)) continue;
    const entry = map.get(m)!;
    const total = order.totalAmount.toNumber();
    entry.orderCount += 1;
    entry.totalAmount = roundMoney(entry.totalAmount + total);
    if (m === 'CASH') entry.cashPortion = roundMoney(entry.cashPortion + total);
    else if (m === 'TRANSFER') entry.transferPortion = roundMoney(entry.transferPortion + total);
    else {
      entry.cashPortion = roundMoney(entry.cashPortion + order.cashAmount.toNumber());
      entry.transferPortion = roundMoney(entry.transferPortion + order.transferAmount.toNumber());
    }
  }

  return methods.map((method) => {
    const entry = map.get(method)!;
    return {
      method,
      orderCount: entry.orderCount,
      totalAmount: entry.totalAmount,
      cashPortion: entry.cashPortion,
      transferPortion: entry.transferPortion,
      sharePercent: netPaidAmount > 0 ? Number(((entry.totalAmount / netPaidAmount) * 100).toFixed(1)) : 0,
    };
  });
}

export function buildKitchenStats(
  paidOrders: PaidOrderRow[],
  orderItems: PaidOrderItemRow[],
  openNewItems: Array<{ quantity: number; productId: number; product: { station: string } }>,
  comboParts: ComboPartRow[],
  cancelledItems: Array<{ quantity: number; productId: number; product: { station: string } }>,
  blindMode: boolean,
) {
  const stationStats = new Map<KitchenStationType, { printedQty: number; pendingQty: number; cancelledQty: number; revenue: number }>(
    [KitchenStation.BEP_NAU, KitchenStation.BEP_CHIEN, KitchenStation.PHA_CHE].map((st) => [
      st,
      { printedQty: 0, pendingQty: 0, cancelledQty: 0, revenue: 0 },
    ]),
  );

  const spiceMap = new Map<number, number>(Array.from({ length: 8 }, (_, idx) => [idx, 0]));
  const orderNetRatio = new Map<number, number>();
  for (const order of paidOrders) {
    const sub = order.subtotalAmount.toNumber();
    const tot = order.totalAmount.toNumber();
    orderNetRatio.set(order.id, sub > 0 ? tot / sub : 1);
  }

  let comboDecomposedCount = 0;

  for (const item of orderItems) {
    const ratio = orderNetRatio.get(item.orderId) ?? 1;
    const itemNetRevenue = item.unitPrice.toNumber() * item.quantity * ratio;

    // Spice level extraction from modifiersSnapshot
    if (Array.isArray(item.modifiersSnapshot)) {
      for (const mod of item.modifiersSnapshot) {
        if (mod && typeof mod === 'object' && 'name' in mod && typeof (mod as { name?: unknown }).name === 'string') {
          const match = /Cấp độ\s*([0-7])/i.exec((mod as { name: string }).name);
          if (match) {
            const lv = Number(match[1]);
            spiceMap.set(lv, (spiceMap.get(lv) ?? 0) + item.quantity);
          }
        }
      }
    }

    if (item.product.station === 'COMBO') {
      const parts = comboParts.filter((p) => p.parentProductId === item.productId);
      if (parts.length > 0) {
        comboDecomposedCount += item.quantity;
        const totalWeight = parts.reduce(
          (sum, p) => sum + Math.max(1, p.childProduct.price.toNumber()) * p.quantity,
          0,
        );
        for (const part of parts) {
          const st = toPhysicalStation(part.childProduct.station);
          const bucket = stationStats.get(st)!;
          bucket.printedQty += item.quantity * part.quantity;
          const partWeight = Math.max(1, part.childProduct.price.toNumber()) * part.quantity;
          bucket.revenue += itemNetRevenue * (partWeight / totalWeight);
        }
        continue;
      }
    }

    const st = toPhysicalStation(item.product.station);
    const bucket = stationStats.get(st)!;
    bucket.printedQty += item.quantity;
    bucket.revenue += itemNetRevenue;
  }

  const addDecomposedQty = (
    items: Array<{ quantity: number; productId: number; product: { station: string } }>,
    field: 'pendingQty' | 'cancelledQty',
  ) => {
    for (const entry of items) {
      if (entry.product.station === 'COMBO') {
        const parts = comboParts.filter((p) => p.parentProductId === entry.productId);
        if (parts.length > 0) {
          for (const part of parts) {
            const st = toPhysicalStation(part.childProduct.station);
            stationStats.get(st)![field] += entry.quantity * part.quantity;
          }
          continue;
        }
      }
      const st = toPhysicalStation(entry.product.station);
      stationStats.get(st)![field] += entry.quantity;
    }
  };

  addDecomposedQty(openNewItems, 'pendingQty');
  addDecomposedQty(cancelledItems, 'cancelledQty');

  const totalStationRev = [...stationStats.values()].reduce((sum, s) => sum + s.revenue, 0);
  const stations = ([KitchenStation.BEP_NAU, KitchenStation.BEP_CHIEN, KitchenStation.PHA_CHE] as KitchenStationType[]).map((st) => {
    const entry = stationStats.get(st)!;
    const rev = roundMoney(entry.revenue);
    return {
      station: st,
      label: STATION_META[st].label,
      printedQty: entry.printedQty,
      pendingQty: entry.pendingQty,
      cancelledQty: entry.cancelledQty,
      revenue: blindMode ? 0 : rev,
      sharePercent: totalStationRev > 0 ? Number(((entry.revenue / totalStationRev) * 100).toFixed(1)) : 0,
    };
  });

  const spiceLevels = Array.from({ length: 8 }, (_, level) => ({
    level,
    label: `Cấp ${level}`,
    count: spiceMap.get(level) ?? 0,
  }));

  return { comboDecomposedCount, stations, spiceLevels };
}

export function buildTopProducts(orderItems: PaidOrderItemRow[], blindMode: boolean) {
  const productMap = new Map<number, {
    productId: number;
    name: string;
    categoryName: string | null;
    station: ProductStation;
    qty: number;
    revenue: number;
  }>();
  const modifierMap = new Map<string, { name: string; qty: number; revenue: number }>();

  let totalGross = 0;

  for (const item of orderItems) {
    const lineTotal = item.unitPrice.toNumber() * item.quantity;
    totalGross += lineTotal;

    const existing = productMap.get(item.productId) ?? {
      productId: item.productId,
      name: item.product.name,
      categoryName: item.product.category?.name ?? null,
      station: item.product.station as ProductStation,
      qty: 0,
      revenue: 0,
    };
    existing.qty += item.quantity;
    existing.revenue = roundMoney(existing.revenue + lineTotal);
    productMap.set(item.productId, existing);

    if (Array.isArray(item.modifiersSnapshot)) {
      for (const mod of item.modifiersSnapshot) {
        if (mod && typeof mod === 'object') {
          const m = mod as { name?: unknown; extraPrice?: unknown };
          const extra = Number(m.extraPrice ?? 0);
          if (typeof m.name === 'string' && extra > 0) {
            const prevMod = modifierMap.get(m.name) ?? { name: m.name, qty: 0, revenue: 0 };
            prevMod.qty += item.quantity;
            prevMod.revenue = roundMoney(prevMod.revenue + extra * item.quantity);
            modifierMap.set(m.name, prevMod);
          }
        }
      }
    }
  }

  const items = [...productMap.values()]
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
    .slice(0, 15)
    .map((item) => ({
      ...item,
      revenue: blindMode ? 0 : item.revenue,
      sharePercent: totalGross > 0 ? Number(((item.revenue / totalGross) * 100).toFixed(1)) : 0,
    }));

  const topModifiers = [...modifierMap.values()]
    .sort((a, b) => b.qty - a.qty || b.revenue - a.revenue)
    .slice(0, 6)
    .map((mod) => ({
      ...mod,
      revenue: blindMode ? 0 : mod.revenue,
    }));

  return { items, topModifiers };
}

export async function buildDiscountsAndRisk(
  prisma: PrismaService,
  paidOrders: PaidOrderRow[],
  voidAggregate: { count: number; amount: number },
  cancelledPrintedItemCount: number,
  period: ResolvedPeriod,
  blindMode: boolean,
) {
  let totalDiscountAmount = 0;
  let manualDiscountCount = 0;
  let manualDiscountAmount = 0;

  const codeAgg = new Map<number, { discountId: number; code: string; name: string; usedCountInPeriod: number; totalDiscountedInPeriod: number }>();
  let move = 0;
  let merge = 0;
  let swap = 0;

  for (const order of paidOrders) {
    const discAmt = order.discountAmount.toNumber();
    totalDiscountAmount = roundMoney(totalDiscountAmount + discAmt);

    if (discAmt > 0 && order.discountSnapshot) {
      const snap = DiscountSnapshotSchema.safeParse(order.discountSnapshot);
      if (snap.success) {
        if (snap.data.kind === 'MANUAL') {
          manualDiscountCount += 1;
          manualDiscountAmount = roundMoney(manualDiscountAmount + discAmt);
        } else if (snap.data.discountId !== null && snap.data.code) {
          const prev = codeAgg.get(snap.data.discountId) ?? {
            discountId: snap.data.discountId,
            code: snap.data.code,
            name: snap.data.name,
            usedCountInPeriod: 0,
            totalDiscountedInPeriod: 0,
          };
          prev.usedCountInPeriod += 1;
          prev.totalDiscountedInPeriod = roundMoney(prev.totalDiscountedInPeriod + discAmt);
          codeAgg.set(snap.data.discountId, prev);
        }
      }
    }

    if (Array.isArray(order.tableTransferLogs)) {
      for (const entry of order.tableTransferLogs) {
        if (!entry || typeof entry !== 'object') continue;
        const act = (entry as { action?: unknown; timestamp?: unknown }).action;
        const ts = (entry as { timestamp?: unknown }).timestamp;
        if (typeof ts === 'string') {
          const tsDate = new Date(ts);
          if (!Number.isNaN(tsDate.getTime()) && (tsDate < period.startUtc || tsDate >= period.endUtc)) {
            continue;
          }
        }
        if (act === 'MOVE') move += 1;
        else if (act === 'MERGE') merge += 1;
        else if (act === 'SWAP') swap += 1;
      }
    }
  }

  const discountIds = [...codeAgg.keys()];
  const discountMeta = discountIds.length > 0 && typeof prisma.discount?.findMany === 'function'
    ? await prisma.discount.findMany({
        where: { id: { in: discountIds } },
        select: { id: true, usageLimit: true, usedCount: true },
      })
    : [];
  const metaById = new Map(discountMeta.map((d) => [d.id, d]));

  const codeDiscountStats = [...codeAgg.values()]
    .sort((a, b) => b.totalDiscountedInPeriod - a.totalDiscountedInPeriod)
    .slice(0, 6)
    .map((entry) => {
      const meta = metaById.get(entry.discountId);
      return {
        ...entry,
        totalDiscountedInPeriod: blindMode ? 0 : entry.totalDiscountedInPeriod,
        usageLimit: meta?.usageLimit ?? null,
        totalUsedCount: meta?.usedCount ?? entry.usedCountInPeriod,
      };
    });

  return {
    totalDiscountAmount: blindMode ? 0 : totalDiscountAmount,
    manualDiscountCount,
    manualDiscountAmount: blindMode ? 0 : manualDiscountAmount,
    codeDiscountStats,
    voidedOrderCount: voidAggregate.count,
    voidedAmount: blindMode ? 0 : roundMoney(voidAggregate.amount),
    cancelledPrintedItemCount,
    tableTransferCounts: { move, merge, swap },
  };
}

export function buildStaffing(
  todayDate: string,
  scheduleWeek: TodayScheduleInput | null,
  payrollMonthSummary: Awaited<ReturnType<PayrollService['getPayrollSummary']>> | null,
  toDate: string,
  scope: DashboardScope,
) {
  if (!scope.canSchedules && !scope.canPayroll && !scope.canViewProfit) return null;

  const { dayOfWeek } = getVietnamMondayAndWeekday(todayDate);
  const todayWeekdayLabel = WEEKDAY_LABELS_VI[dayOfWeek] ?? 'Hôm nay';
  const scheduledIds = new Set<number>();

  const shifts = (scheduleWeek?.cells ?? []).map((cell) => {
    const attendanceModeByEmp = new Map(
      (cell.attendances ?? []).map((att) => [att.employeeId, att.mode ?? 'FULL_SHIFT']),
    );
    const employees = cell.employees.map((emp) => {
      scheduledIds.add(emp.id);
      const mode = attendanceModeByEmp.get(emp.id) ?? 'FULL_SHIFT';
      const specialtyName = emp.specialtyCode
        ? (SPECIALTY_DISPLAY_LABELS[emp.specialtyCode] ?? emp.specialtyCode)
        : null;
      return {
        id: emp.id,
        shortName: emp.shortName,
        fullName: emp.fullName,
        specialtyName,
        mode,
      };
    });
    return { timeSlot: cell.timeSlot, employees };
  });

  const payrollSummary = payrollMonthSummary
    ? {
        fromDate: `${toDate.slice(0, 7)}-01`,
        toDate,
        totalEmployees: payrollMonthSummary.summary.totalEmployees,
        totalFullShiftDays: payrollMonthSummary.summary.totalFullShiftDays,
        totalCustomHours: payrollMonthSummary.summary.totalCustomHours,
        totalSalary: roundMoney(payrollMonthSummary.summary.totalSalary),
      }
    : null;

  return {
    todayDate,
    todayWeekdayLabel,
    totalScheduledEmployees: scheduledIds.size,
    shifts,
    payrollSummary,
  };
}

export function buildRecentInvoices(orders: PaidOrderRow[]) {
  return orders.map((order) => ({
    orderId: order.id,
    orderCode: order.orderCode,
    orderType: (order.orderType === 'TAKEAWAY' ? 'TAKEAWAY' : 'DINE_IN') as OrderType,
    tableLabel: formatTableOrTakeawayLabel(
      order.orderType,
      order.table?.name,
      order.takeawayNumber,
      order.takeawayLabelFormat,
    ),
    takeawayNumber: order.takeawayNumber,
    takeawayLabelFormat:
      order.orderType === 'TAKEAWAY'
        ? (normalizeTakeawayLabelFormat(order.takeawayLabelFormat) ?? 'NUMBER')
        : null,
    orderSource: (order.orderSource === 'QR_CODE' ? 'QR_CODE' : 'POS_COUNTER') as OrderSource,
    paymentMethod: (order.paymentMethod as PaymentMethod | null) ?? null,
    paymentAccountLabel: order.paymentAccount?.label ?? null,
    discountAmount: order.discountAmount.toNumber(),
    totalAmount: order.totalAmount.toNumber(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
  }));
}
