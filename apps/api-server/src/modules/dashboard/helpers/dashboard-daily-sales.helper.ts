import { Prisma } from '@prisma/client';
import {
  AuditModuleValues,
  DashboardDailyItemSalesResponseSchema,
  DashboardItemSalesQuerySchema,
  KitchenStation,
  type AuditModule,
  type AuthPrincipal,
  type DashboardDailyItemSalesResponse,
  type DashboardItemSalesQuery,
  type DashboardPreset,
  type DashboardQuery,
  type DashboardScope,
  type KitchenStation as KitchenStationType,
  type ProductStation,
} from '@fnb/shared';
import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  businessDateString,
  dateAtVietnamMidnight,
  dateOnly,
} from '../../../common/utils/business-date.util';
import { normalizeSearchTerm } from '../../../common/utils/search-normalize.util';
import { formatOrderTakeawayLabel } from '../../../common/utils/takeaway-format.util';

export const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
export const OVERDUE_QR_SECONDS = 180;
export const NEAR_LIMIT_RATIO = 0.8;

export const STATION_META: Record<KitchenStationType, { label: string }> = {
  BEP_NAU: { label: 'Bếp Nấu (Mì Cay · Lẩu · Chảo)' },
  BEP_CHIEN: { label: 'Bếp Chiên (Gà Rán · Pizza · Ăn Vặt)' },
  PHA_CHE: { label: 'Quầy Pha Chế (Trà · Trà Sữa · Sinh Tố)' },
};

export const HOUR_SLOTS = [
  { key: '00-08', label: '00–08h', startHour: 0, endHour: 8 },
  { key: '08-10', label: '08–10h', startHour: 8, endHour: 10 },
  { key: '10-12', label: '10–12h', startHour: 10, endHour: 12 },
  { key: '12-14', label: '12–14h', startHour: 12, endHour: 14 },
  { key: '14-17', label: '14–17h', startHour: 14, endHour: 17 },
  { key: '17-19', label: '17–19h', startHour: 17, endHour: 19 },
  { key: '19-21', label: '19–21h', startHour: 19, endHour: 21 },
  { key: '21-24', label: '21–24h', startHour: 21, endHour: 24 },
] as const;

export const WEEKDAY_LABELS_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'] as const;

export const SPECIALTY_DISPLAY_LABELS: Record<string, string> = {
  'quan ly': 'Quản lý',
  'thu ngan': 'Thu ngân',
  'bep nau mi cay': 'Bếp Nấu',
  'bep chien do an vat': 'Bếp Chiên',
  'pha che nuoc uong': 'Pha Chế',
  'phuc vu ban': 'Phục vụ',
};

export const AUDIT_PERMISSION_MAP: Record<AuditModule, keyof AuthPrincipal['permissions']> = {
  POS: 'pos',
  DISCOUNTS: 'discounts',
  MENU: 'pos',
  INVOICES: 'invoices',
  INVENTORY: 'inventory',
  CASHFLOW: 'cashflow',
  PAYMENT_QR: 'paymentQr',
  EMPLOYEES: 'employees',
  SCHEDULES: 'schedules',
  PAYROLL: 'payroll',
  MDM: 'mdm',
  RBAC: 'rbac',
  SETTINGS: 'settings',
};

export const ALLOWED_AUDIT_MODULES = AuditModuleValues;

export interface ResolvedPeriod {
  preset: DashboardPreset;
  todayDate: string;
  fromDate: string;
  toDate: string;
  previousFromDate: string;
  previousToDate: string;
  startUtc: Date;
  endUtc: Date;
  prevStartUtc: Date;
  prevEndUtc: Date;
  isTodayIncluded: boolean;
}

export type PaidOrderRow = {
  id: number;
  orderCode: string;
  orderType: string;
  orderSource: string;
  tableId: number | null;
  takeawayNumber: number | null;
  takeawayLabelFormat?: string | null;
  paymentMethod: string | null;
  paymentAccountId: number | null;
  cashAmount: Prisma.Decimal;
  transferAmount: Prisma.Decimal;
  subtotalAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  discountId: number | null;
  discountSnapshot: Prisma.JsonValue | null;
  totalAmount: Prisma.Decimal;
  tableTransferLogs: Prisma.JsonValue;
  paidAt: Date | null;
  table: { name: string } | null;
  paymentAccount: { id: number; label: string; bankCode: string } | null;
};

export type PaidOrderItemRow = {
  orderId: number;
  productId: number;
  quantity: number;
  unitPrice: Prisma.Decimal;
  modifiersSnapshot: Prisma.JsonValue;
  kitchenStatus: string;
  product: {
    id: number;
    name: string;
    station: string;
    price: Prisma.Decimal;
    categoryId?: number | null;
    category: { id?: number; name: string } | null;
  };
};

export type ComboPartRow = {
  parentProductId: number;
  quantity: number;
  childProduct: { id: number; name: string; station: string; price: Prisma.Decimal };
};

export function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = dateOnly(isoDate);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function toVietnamHour(date: Date): number {
  return new Date(date.getTime() + VN_OFFSET_MS).getUTCHours();
}

export function getVietnamMondayAndWeekday(isoDate: string): { mondayIso: string; dayOfWeek: number } {
  const utcDay = dateOnly(isoDate).getUTCDay(); // 0=Sun..6=Sat
  const dayOfWeek = utcDay === 0 ? 6 : utcDay - 1; // 0=Mon..6=Sun
  return { mondayIso: addDaysIso(isoDate, -dayOfWeek), dayOfWeek };
}

export function formatTableOrTakeawayLabel(
  orderType: string,
  tableName: string | null | undefined,
  takeawayNumber: number | null,
  takeawayLabelFormat?: unknown,
): string | null {
  if (orderType === 'TAKEAWAY' && takeawayNumber !== null) {
    return formatOrderTakeawayLabel(takeawayNumber, takeawayLabelFormat);
  }
  return tableName ?? null;
}

export function toPhysicalStation(station: string): KitchenStationType {
  if (station === KitchenStation.BEP_CHIEN) return KitchenStation.BEP_CHIEN;
  if (station === KitchenStation.PHA_CHE) return KitchenStation.PHA_CHE;
  return KitchenStation.BEP_NAU;
}

export function resolvePeriod(query: DashboardQuery, now: Date): ResolvedPeriod {
  const todayDate = businessDateString(now);
  let fromDate = todayDate;
  let toDate = todayDate;
  let preset: DashboardPreset = query.preset ?? 'today';

  if (query.fromDate || query.toDate) {
    fromDate = query.fromDate ?? query.toDate ?? todayDate;
    toDate = query.toDate ?? query.fromDate ?? todayDate;
    preset = query.preset ?? 'custom';
  } else if (preset === 'yesterday') {
    const yesterday = addDaysIso(todayDate, -1);
    fromDate = yesterday;
    toDate = yesterday;
  } else if (preset === '7d') {
    fromDate = addDaysIso(todayDate, -6);
    toDate = todayDate;
  } else if (preset === 'month') {
    fromDate = `${todayDate.slice(0, 7)}-01`;
    toDate = todayDate;
  }

  const spanDays = Math.max(1, Math.round((dateOnly(toDate).getTime() - dateOnly(fromDate).getTime()) / MS_PER_DAY) + 1);
  const previousToDate = addDaysIso(fromDate, -1);
  const previousFromDate = addDaysIso(previousToDate, -(spanDays - 1));

  return {
    preset,
    todayDate,
    fromDate,
    toDate,
    previousFromDate,
    previousToDate,
    startUtc: dateAtVietnamMidnight(fromDate),
    endUtc: dateAtVietnamMidnight(addDaysIso(toDate, 1)),
    prevStartUtc: dateAtVietnamMidnight(previousFromDate),
    prevEndUtc: dateAtVietnamMidnight(addDaysIso(previousToDate, 1)),
    isTodayIncluded: fromDate <= todayDate && todayDate <= toDate,
  };
}

export function resolveScope(user: AuthPrincipal): DashboardScope {
  const p = user.permissions;
  const isAdmin = Boolean(user.isSuperAdmin);
  return {
    canPos: isAdmin || Boolean(p.pos?.view),
    canInvoices: isAdmin || Boolean(p.invoices?.view),
    canInventory: isAdmin || Boolean(p.inventory?.view),
    canCashflow: isAdmin || Boolean(p.cashflow?.view),
    canPaymentQr: isAdmin || Boolean(p.paymentQr?.view),
    canDiscounts: isAdmin || Boolean(p.discounts?.view),
    canSchedules: isAdmin || Boolean(p.schedules?.view),
    canPayroll: isAdmin || Boolean(p.payroll?.view),
    canViewProfit: isAdmin || Boolean(p.dashboard?.viewProfit),
  };
}

export async function loadPaidOrders(prisma: PrismaService, startUtc: Date, endUtc: Date): Promise<PaidOrderRow[]> {
  if (typeof prisma.order?.findMany !== 'function') return [];
  const rows = await prisma.order.findMany({
    where: {
      status: 'PAID',
      paidAt: { gte: startUtc, lt: endUtc },
    },
    orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      orderCode: true,
      orderType: true,
      orderSource: true,
      tableId: true,
      takeawayNumber: true,
      takeawayLabelFormat: true,
      paymentMethod: true,
      paymentAccountId: true,
      cashAmount: true,
      transferAmount: true,
      subtotalAmount: true,
      discountAmount: true,
      discountId: true,
      discountSnapshot: true,
      totalAmount: true,
      tableTransferLogs: true,
      paidAt: true,
      table: { select: { name: true } },
      paymentAccount: { select: { id: true, label: true, bankCode: true } },
    },
  });
  return rows as unknown as PaidOrderRow[];
}

export async function loadPaidOrderItems(prisma: PrismaService, orderIds: number[]): Promise<PaidOrderItemRow[]> {
  if (orderIds.length === 0 || typeof prisma.orderItem?.findMany !== 'function') return [];
  const rows = await prisma.orderItem.findMany({
    where: {
      orderId: { in: orderIds },
      kitchenStatus: { not: 'CANCELLED' },
    },
    select: {
      orderId: true,
      productId: true,
      quantity: true,
      unitPrice: true,
      modifiersSnapshot: true,
      kitchenStatus: true,
      product: {
        select: {
          id: true,
          name: true,
          station: true,
          price: true,
          categoryId: true,
          category: { select: { id: true, name: true } },
        },
      },
    },
  });
  return rows as unknown as PaidOrderItemRow[];
}

export async function getDailyItemSalesHelper(
  prisma: PrismaService,
  rawQuery: DashboardItemSalesQuery,
  user: AuthPrincipal,
  now = new Date(),
): Promise<DashboardDailyItemSalesResponse> {
  const query = DashboardItemSalesQuerySchema.parse(rawQuery ?? {});
  const period = resolvePeriod(query, now);
  const scope = resolveScope(user);
  const blindMode = !user.isSuperAdmin && !scope.canViewProfit;
  const canViewSales = scope.canInvoices || scope.canCashflow || scope.canViewProfit || scope.canPos;

  if (!canViewSales) {
    return DashboardDailyItemSalesResponseSchema.parse({
      meta: {
        preset: period.preset,
        fromDate: period.fromDate,
        toDate: period.toDate,
        generatedAt: now.toISOString(),
        blindMode,
        canViewProfit: scope.canViewProfit,
        canViewSales: false,
      },
      summary: {
        totalProductsSold: 0,
        totalQuantity: 0,
        totalRevenue: 0,
        totalOrders: 0,
      },
      categories: [],
      stations: [],
      items: [],
    });
  }

  const paidOrders = await loadPaidOrders(prisma, period.startUtc, period.endUtc);
  const orderItems = paidOrders.length > 0
    ? await loadPaidOrderItems(prisma, paidOrders.map((o) => o.id))
    : [];

  const productAgg = new Map<
    number,
    {
      productId: number;
      name: string;
      categoryId: number | null;
      categoryName: string | null;
      station: ProductStation;
      qty: number;
      revenueDecimal: Prisma.Decimal;
      orderIds: Set<number>;
    }
  >();
  const categoryMap = new Map<number, string>();
  const stationSet = new Set<string>();

  for (const item of orderItems) {
    const catId = item.product.categoryId ?? item.product.category?.id ?? null;
    const catName = item.product.category?.name ?? null;
    if (catId !== null && catName) {
      categoryMap.set(catId, catName);
    }
    stationSet.add(item.product.station);

    const lineTotalDec = item.unitPrice.mul(item.quantity);
    const existing = productAgg.get(item.productId) ?? {
      productId: item.productId,
      name: item.product.name,
      categoryId: catId,
      categoryName: catName,
      station: item.product.station as ProductStation,
      qty: 0,
      revenueDecimal: new Prisma.Decimal(0),
      orderIds: new Set<number>(),
    };
    existing.qty += item.quantity;
    existing.revenueDecimal = existing.revenueDecimal.add(lineTotalDec);
    existing.orderIds.add(item.orderId);
    productAgg.set(item.productId, existing);
  }

  const stationFilter = query.station?.trim();
  const searchNorm = query.search ? normalizeSearchTerm(query.search) : '';

  const filteredEntries = [...productAgg.values()].filter((entry) => {
    if (stationFilter && stationFilter !== 'ALL' && entry.station !== stationFilter) {
      return false;
    }
    if (query.categoryId !== undefined && entry.categoryId !== query.categoryId) {
      return false;
    }
    if (searchNorm && !normalizeSearchTerm(entry.name).includes(searchNorm)) {
      return false;
    }
    return true;
  });

  let totalQuantity = 0;
  let totalGrossDec = new Prisma.Decimal(0);
  const matchingOrderIds = new Set<number>();
  for (const entry of filteredEntries) {
    totalQuantity += entry.qty;
    totalGrossDec = totalGrossDec.add(entry.revenueDecimal);
    for (const orderId of entry.orderIds) {
      matchingOrderIds.add(orderId);
    }
  }
  const totalGrossRevenue = roundMoney(totalGrossDec.toNumber());

  const sortedItems = filteredEntries
    .map((entry) => {
      const grossRevenue = roundMoney(entry.revenueDecimal.toNumber());
      const avgPrice = entry.qty > 0 ? roundMoney(grossRevenue / entry.qty) : 0;
      const sharePercent =
        !blindMode && totalGrossRevenue > 0
          ? Number(((grossRevenue / totalGrossRevenue) * 100).toFixed(1))
          : 0;
      return {
        row: {
          productId: entry.productId,
          name: entry.name,
          categoryId: entry.categoryId,
          categoryName: entry.categoryName,
          station: entry.station,
          qty: entry.qty,
          orderCount: entry.orderIds.size,
          revenue: blindMode ? 0 : grossRevenue,
          avgUnitPrice: blindMode ? 0 : avgPrice,
          sharePercent,
        },
        sortRevenue: grossRevenue,
      };
    })
    .sort(
      (a, b) =>
        b.sortRevenue - a.sortRevenue ||
        b.row.qty - a.row.qty ||
        a.row.name.localeCompare(b.row.name, 'vi'),
    )
    .map((entry) => entry.row);

  const categories = [...categoryMap.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const stations = [...stationSet].sort();

  return DashboardDailyItemSalesResponseSchema.parse({
    meta: {
      preset: period.preset,
      fromDate: period.fromDate,
      toDate: period.toDate,
      generatedAt: now.toISOString(),
      blindMode,
      canViewProfit: scope.canViewProfit,
      canViewSales: true,
    },
    summary: {
      totalProductsSold: sortedItems.length,
      totalQuantity,
      totalRevenue: blindMode ? 0 : totalGrossRevenue,
      totalOrders: matchingOrderIds.size,
    },
    categories,
    stations,
    items: sortedItems,
  });
}
