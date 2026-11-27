import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditModuleValues,
  DashboardDailyItemSalesResponseSchema,
  DashboardItemSalesQuerySchema,
  DashboardOverviewResponseSchema,
  DashboardQuerySchema,
  DiscountSnapshotSchema,
  KitchenStation,
  PendingPaymentEditSchema,
  type AuditLogItem,
  type AuditModule,
  type AuthPrincipal,
  type DashboardDailyItemSalesResponse,
  type DashboardItemSalesQuery,
  type DashboardOverviewResponse,
  type DashboardPreset,
  type DashboardQuery,
  type DashboardScope,
  type KitchenStation as KitchenStationType,
  type OrderSource,
  type OrderType,
  type PaymentAccount,
  type PaymentMethod,
  type PaymentSource,
  type PosTableGridResponse,
  type ProductStation,
  type SettlementStatus,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  businessDateString,
  dateAtVietnamMidnight,
  dateOnly,
  nextDateOnly,
} from '../../common/utils/business-date.util';
import { normalizeSearchTerm } from '../../common/utils/search-normalize.util';
import {
  formatOrderTakeawayLabel,
  normalizeTakeawayLabelFormat,
} from '../../common/utils/takeaway-format.util';
import { CashflowService } from '../cashflow/cashflow.service';
import { PayrollService } from '../hr-schedule/payroll.service';
import { SchedulesService } from '../hr-schedule/schedules.service';
import { PaymentQrService } from '../payment-qr/payment-qr.service';
import { PosService } from '../pos/pos.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const OVERDUE_QR_SECONDS = 180;
const NEAR_LIMIT_RATIO = 0.8;

const STATION_META: Record<KitchenStationType, { label: string }> = {
  BEP_NAU: { label: 'Bếp Nấu (Mì Cay · Lẩu · Chảo)' },
  BEP_CHIEN: { label: 'Bếp Chiên (Gà Rán · Pizza · Ăn Vặt)' },
  PHA_CHE: { label: 'Quầy Pha Chế (Trà · Trà Sữa · Sinh Tố)' },
};

const HOUR_SLOTS = [
  { key: '00-08', label: '00–08h', startHour: 0, endHour: 8 },
  { key: '08-10', label: '08–10h', startHour: 8, endHour: 10 },
  { key: '10-12', label: '10–12h', startHour: 10, endHour: 12 },
  { key: '12-14', label: '12–14h', startHour: 12, endHour: 14 },
  { key: '14-17', label: '14–17h', startHour: 14, endHour: 17 },
  { key: '17-19', label: '17–19h', startHour: 17, endHour: 19 },
  { key: '19-21', label: '19–21h', startHour: 19, endHour: 21 },
  { key: '21-24', label: '21–24h', startHour: 21, endHour: 24 },
] as const;

const WEEKDAY_LABELS_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'] as const;

const SPECIALTY_DISPLAY_LABELS: Record<string, string> = {
  'quan ly': 'Quản lý',
  'thu ngan': 'Thu ngân',
  'bep nau mi cay': 'Bếp Nấu',
  'bep chien do an vat': 'Bếp Chiên',
  'pha che nuoc uong': 'Pha Chế',
  'phuc vu ban': 'Phục vụ',
};

const AUDIT_PERMISSION_MAP: Record<AuditModule, keyof AuthPrincipal['permissions']> = {
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

interface ResolvedPeriod {
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

type PaidOrderRow = {
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

type PaidOrderItemRow = {
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

type ComboPartRow = {
  parentProductId: number;
  quantity: number;
  childProduct: { id: number; name: string; station: string; price: Prisma.Decimal };
};

function addDaysIso(isoDate: string, deltaDays: number): string {
  const d = dateOnly(isoDate);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function toVietnamHour(date: Date): number {
  return new Date(date.getTime() + VN_OFFSET_MS).getUTCHours();
}

function getVietnamMondayAndWeekday(isoDate: string): { mondayIso: string; dayOfWeek: number } {
  const utcDay = dateOnly(isoDate).getUTCDay(); // 0=Sun..6=Sat
  const dayOfWeek = utcDay === 0 ? 6 : utcDay - 1; // 0=Mon..6=Sun
  return { mondayIso: addDaysIso(isoDate, -dayOfWeek), dayOfWeek };
}

function formatTableOrTakeawayLabel(
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

function toPhysicalStation(station: string): KitchenStationType {
  if (station === KitchenStation.BEP_CHIEN) return KitchenStation.BEP_CHIEN;
  if (station === KitchenStation.PHA_CHE) return KitchenStation.PHA_CHE;
  return KitchenStation.BEP_NAU;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(PosService) private readonly posService?: PosService,
    @Optional() @Inject(CashflowService) private readonly cashflowService?: CashflowService,
    @Optional() @Inject(PaymentQrService) private readonly paymentQrService?: PaymentQrService,
    @Optional() @Inject(SchedulesService) private readonly schedulesService?: SchedulesService,
    @Optional() @Inject(PayrollService) private readonly payrollService?: PayrollService,
  ) {}

  async getOverview(
    rawQuery: DashboardQuery,
    user: AuthPrincipal,
    now = new Date(),
  ): Promise<DashboardOverviewResponse> {
    const query = DashboardQuerySchema.parse(rawQuery ?? {});
    const period = this.resolvePeriod(query, now);
    const scope = this.resolveScope(user);
    const blindMode = !user.isSuperAdmin && !scope.canViewProfit;

    const canSeeSales = scope.canInvoices || scope.canCashflow || scope.canViewProfit || scope.canPos;
    const canSeePayments = scope.canInvoices || scope.canCashflow || scope.canViewProfit;

    const [
      tableGrid,
      openingBudget,
      paymentQrList,
      paidOrders,
      prevPaidAggregate,
      voidAggregate,
      cancelledItems,
      inventoryRows,
      latestSettlement,
      pendingEditOrders,
      openNewItems,
      scheduleWeek,
      payrollRangeSummary,
      payrollMonthSummary,
      auditRows,
    ] = await Promise.all([
      scope.canPos && this.posService ? this.posService.getTableGrid().catch(() => null) : Promise.resolve(null),
      (scope.canCashflow || scope.canViewProfit) && this.cashflowService
        ? this.cashflowService.getDefaultOpeningBudget().catch(() => 0)
        : Promise.resolve(0),
      (scope.canPaymentQr || scope.canPos || scope.canCashflow || scope.canViewProfit) && this.paymentQrService
        ? this.paymentQrService.list(now).catch(() => [])
        : Promise.resolve([]),
      canSeeSales ? this.loadPaidOrders(period.startUtc, period.endUtc) : Promise.resolve([]),
      canSeeSales ? this.loadPaidTotalSum(period.prevStartUtc, period.prevEndUtc) : Promise.resolve(0),
      canSeeSales ? this.loadVoidSummary(period.startUtc, period.endUtc) : Promise.resolve({ count: 0, amount: 0 }),
      canSeeSales ? this.loadCancelledItems(period.startUtc, period.endUtc) : Promise.resolve([]),
      scope.canInventory || scope.canCashflow || scope.canViewProfit
        ? this.loadInventoryRows(period.fromDate, period.toDate)
        : Promise.resolve([]),
      scope.canCashflow || scope.canViewProfit ? this.loadLatestSettlement() : Promise.resolve(null),
      scope.canInvoices || scope.canViewProfit ? this.loadPendingPaymentEdits() : Promise.resolve([]),
      scope.canPos ? this.loadOpenUnprintedItems() : Promise.resolve([]),
      scope.canSchedules || scope.canViewProfit
        ? this.loadTodaySchedule(period.todayDate)
        : Promise.resolve(null),
      scope.canViewProfit && this.payrollService
        ? this.payrollService.getPayrollSummary({ fromDate: period.fromDate, toDate: period.toDate }).catch(() => null)
        : Promise.resolve(null),
      (scope.canPayroll || scope.canViewProfit) && this.payrollService
        ? this.payrollService
            .getPayrollSummary({ fromDate: `${period.toDate.slice(0, 7)}-01`, toDate: period.toDate })
            .catch(() => null)
        : Promise.resolve(null),
      this.loadRecentAuditLogs(user),
    ]);

    const orderItems = canSeeSales && paidOrders.length > 0
      ? await this.loadPaidOrderItems(paidOrders.map((o) => o.id))
      : [];

    const comboIds = [...new Set([
      ...orderItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
      ...openNewItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
      ...cancelledItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
    ])];
    const comboParts = comboIds.length > 0 ? await this.loadComboParts(comboIds) : [];
    const cancelledItemCount = cancelledItems.reduce((sum, it) => sum + it.quantity, 0);

    const alerts = this.buildAlerts(tableGrid, pendingEditOrders, paymentQrList, now, scope);
    const revenueKpi = canSeePayments ? this.buildRevenueKpi(paidOrders, prevPaidAggregate) : null;
    const cashDrawerKpi = scope.canCashflow || scope.canViewProfit
      ? await this.buildCashDrawerKpi(
          period,
          openingBudget,
          paidOrders,
          latestSettlement,
          blindMode,
        )
      : null;
    const transferKpi = canSeePayments && !blindMode ? this.buildTransferKpi(paidOrders, revenueKpi?.netPaidAmount ?? 0) : null;
    const inventorySummary = scope.canInventory || scope.canViewProfit
      ? this.buildInventoryKpi(inventoryRows, revenueKpi?.netPaidAmount ?? null)
      : null;
    const openOrdersKpi = scope.canPos && tableGrid
      ? this.buildOpenOrdersKpi(tableGrid, openNewItems.reduce((sum, item) => sum + item.quantity, 0))
      : null;
    const profitKpi = scope.canViewProfit && revenueKpi
      ? this.buildProfitKpi(
          revenueKpi.netPaidAmount,
          inventorySummary?.totalImportCost ?? 0,
          payrollRangeSummary?.summary.totalSalary ?? null,
        )
      : null;

    const revenueSeries = canSeePayments && !blindMode
      ? this.buildRevenueSeries(period, paidOrders)
      : null;
    const paymentBreakdown = canSeePayments && !blindMode
      ? this.buildPaymentBreakdown(paidOrders, revenueKpi?.netPaidAmount ?? 0)
      : [];

    const kitchenStations = canSeeSales
      ? this.buildKitchenStats(paidOrders, orderItems, openNewItems, comboParts, cancelledItems, blindMode)
      : null;
    const topProducts = canSeeSales
      ? this.buildTopProducts(orderItems, blindMode)
      : null;
    const discountsAndRisk = canSeeSales && (scope.canDiscounts || scope.canInvoices || scope.canPos || scope.canViewProfit)
      ? await this.buildDiscountsAndRisk(paidOrders, voidAggregate, cancelledItemCount, period, blindMode)
      : null;

    const recentInventoryImports = scope.canInventory || scope.canViewProfit
      ? inventoryRows.slice(0, 6).map((row) => ({
          id: row.id,
          itemName: row.itemNameSnapshot,
          supplierName: row.supplierNameSnapshot,
          unitName: row.unitName,
          quantity: row.quantity.toNumber(),
          unitPrice: row.unitPrice.toNumber(),
          totalCost: row.totalCost.toNumber(),
          paymentSource: (row.paymentSource === 'EXTERNAL' ? 'EXTERNAL' : 'CASH_DRAWER') as PaymentSource,
          importDate: businessDateString(new Date(row.importDate.getTime() + 12 * 60 * 60 * 1000)),
        }))
      : [];

    const staffing = this.buildStaffing(period.todayDate, scheduleWeek, payrollMonthSummary, period.toDate, scope);
    const recentInvoices = !blindMode && (scope.canInvoices || scope.canViewProfit)
      ? this.buildRecentInvoices(paidOrders.slice(0, 6))
      : [];

    return DashboardOverviewResponseSchema.parse({
      meta: {
        preset: period.preset,
        fromDate: period.fromDate,
        toDate: period.toDate,
        previousFromDate: period.previousFromDate,
        previousToDate: period.previousToDate,
        generatedAt: now.toISOString(),
        isTodayIncluded: period.isTodayIncluded,
        scope,
      },
      alerts,
      kpis: {
        revenue: blindMode ? null : revenueKpi,
        cashDrawer: cashDrawerKpi,
        transfer: transferKpi,
        inventory: inventorySummary,
        openOrders: openOrdersKpi,
        profit: profitKpi,
      },
      revenueSeries,
      paymentBreakdown,
      paymentQrAccounts: scope.canPaymentQr || scope.canCashflow || scope.canViewProfit ? paymentQrList : [],
      liveTables: tableGrid,
      kitchenStations,
      topProducts,
      discountsAndRisk,
      recentInventoryImports,
      staffing,
      recentInvoices,
      recentAuditLogs: auditRows,
    });
  }

  async getDailyItemSales(
    rawQuery: DashboardItemSalesQuery,
    user: AuthPrincipal,
    now = new Date(),
  ): Promise<DashboardDailyItemSalesResponse> {
    const query = DashboardItemSalesQuerySchema.parse(rawQuery ?? {});
    const period = this.resolvePeriod(query, now);
    const scope = this.resolveScope(user);
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

    const paidOrders = await this.loadPaidOrders(period.startUtc, period.endUtc);
    const orderItems = paidOrders.length > 0
      ? await this.loadPaidOrderItems(paidOrders.map((o) => o.id))
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

  private resolvePeriod(query: DashboardQuery, now: Date): ResolvedPeriod {
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

  private resolveScope(user: AuthPrincipal): DashboardScope {
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

  private async loadPaidOrders(startUtc: Date, endUtc: Date): Promise<PaidOrderRow[]> {
    if (typeof this.prisma.order?.findMany !== 'function') return [];
    const rows = await this.prisma.order.findMany({
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

  private async loadPaidTotalSum(startUtc: Date, endUtc: Date): Promise<number> {
    if (typeof this.prisma.order?.aggregate !== 'function') return 0;
    const agg = await this.prisma.order.aggregate({
      where: { status: 'PAID', paidAt: { gte: startUtc, lt: endUtc } },
      _sum: { totalAmount: true },
    });
    return agg._sum.totalAmount?.toNumber() ?? 0;
  }

  private async loadVoidSummary(startUtc: Date, endUtc: Date): Promise<{ count: number; amount: number }> {
    if (typeof this.prisma.order?.aggregate !== 'function') return { count: 0, amount: 0 };
    const agg = await this.prisma.order.aggregate({
      where: { status: 'VOIDED', createdAt: { gte: startUtc, lt: endUtc } },
      _count: { id: true },
      _sum: { totalAmount: true },
    });
    return {
      count: agg._count.id ?? 0,
      amount: agg._sum.totalAmount?.toNumber() ?? 0,
    };
  }

  private async loadCancelledItems(startUtc: Date, endUtc: Date): Promise<
    Array<{ quantity: number; productId: number; product: { station: string } }>
  > {
    if (typeof this.prisma.orderItem?.findMany !== 'function') return [];
    return this.prisma.orderItem.findMany({
      where: { kitchenStatus: 'CANCELLED', createdAt: { gte: startUtc, lt: endUtc } },
      select: {
        quantity: true,
        productId: true,
        product: { select: { station: true } },
      },
    });
  }

  private async loadPaidOrderItems(orderIds: number[]): Promise<PaidOrderItemRow[]> {
    if (orderIds.length === 0 || typeof this.prisma.orderItem?.findMany !== 'function') return [];
    const rows = await this.prisma.orderItem.findMany({
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

  private async loadOpenUnprintedItems(): Promise<
    Array<{ quantity: number; productId: number; product: { station: string } }>
  > {
    if (typeof this.prisma.orderItem?.findMany !== 'function') return [];
    return this.prisma.orderItem.findMany({
      where: {
        kitchenStatus: 'NEW',
        order: { status: { in: ['PENDING', 'SERVING'] } },
      },
      select: {
        quantity: true,
        productId: true,
        product: { select: { station: true } },
      },
    });
  }

  private async loadComboParts(parentProductIds: number[]): Promise<ComboPartRow[]> {
    if (parentProductIds.length === 0 || typeof this.prisma.comboItem?.findMany !== 'function') return [];
    const rows = await this.prisma.comboItem.findMany({
      where: { parentProductId: { in: parentProductIds } },
      select: {
        parentProductId: true,
        quantity: true,
        childProduct: { select: { id: true, name: true, station: true, price: true } },
      },
    });
    return rows as unknown as ComboPartRow[];
  }

  private async loadInventoryRows(fromDate: string, toDate: string) {
    if (typeof this.prisma.inventoryImport?.findMany !== 'function') return [];
    return this.prisma.inventoryImport.findMany({
      where: {
        isDeleted: false,
        importDate: { gte: dateOnly(fromDate), lt: nextDateOnly(toDate) },
      },
      orderBy: [{ importDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        itemNameSnapshot: true,
        supplierNameSnapshot: true,
        unitName: true,
        unitPrice: true,
        quantity: true,
        totalCost: true,
        paymentSource: true,
        importDate: true,
      },
    });
  }

  private async loadLatestSettlement() {
    if (typeof this.prisma.cashDrawerSettlement?.findFirst !== 'function') return null;
    return this.prisma.cashDrawerSettlement.findFirst({
      orderBy: [{ settlementDate: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        settlementDate: true,
        shiftName: true,
        status: true,
        discrepancyAmount: true,
        actualCountedCash: true,
      },
    });
  }

  private async loadPendingPaymentEdits() {
    if (typeof this.prisma.order?.findMany !== 'function') return [];
    return this.prisma.order.findMany({
      where: {
        status: 'PAID',
        pendingPaymentEdit: { not: Prisma.DbNull },
      },
      orderBy: [{ paidAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: {
        id: true,
        orderCode: true,
        orderType: true,
        takeawayNumber: true,
        takeawayLabelFormat: true,
        paymentMethod: true,
        totalAmount: true,
        pendingPaymentEdit: true,
        table: { select: { name: true } },
      },
    });
  }

  private async loadTodaySchedule(todayDate: string) {
    if (!this.schedulesService) return null;
    const { mondayIso, dayOfWeek } = getVietnamMondayAndWeekday(todayDate);
    try {
      const week = await this.schedulesService.getScheduleWeek(mondayIso);
      const dayCells = week.cells.filter((cell) => cell.dayOfWeek === dayOfWeek);
      return { dayOfWeek, cells: dayCells };
    } catch {
      return null;
    }
  }

  private async loadRecentAuditLogs(user: AuthPrincipal): Promise<AuditLogItem[]> {
    if (typeof this.prisma.auditLog?.findMany !== 'function') return [];
    const allowedModules = AuditModuleValues.filter((mod) => {
      if (mod === 'RBAC') return user.isSuperAdmin;
      const permKey = AUDIT_PERMISSION_MAP[mod];
      return Boolean(user.isSuperAdmin || user.permissions[permKey]?.view);
    });
    if (allowedModules.length === 0) return [];

    const rows = await this.prisma.auditLog.findMany({
      where: { module: { in: allowedModules } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 6,
    });

    return rows
      .filter((row) => allowedModules.includes(row.module as AuditModule))
      .map((row) => ({
      id: row.id,
      module: row.module as AuditModule,
      action: row.action,
      actorId: row.actorId,
      actorFullName: row.actorFullName,
      actorUsername: row.actorUsername,
      summary: row.summary,
      ipAddress: user.isSuperAdmin ? (row.ipAddress ?? null) : null,
      deviceLabel: user.isSuperAdmin ? (row.deviceLabel ?? null) : null,
      metadata: (row.metadata ?? {}) as Record<string, unknown>,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private buildAlerts(
    tableGrid: PosTableGridResponse | null,
    pendingEditOrders: Awaited<ReturnType<DashboardService['loadPendingPaymentEdits']>>,
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
            (order as { takeawayLabelFormat?: unknown }).takeawayLabelFormat,
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

  private buildRevenueKpi(paidOrders: PaidOrderRow[], previousNetPaidAmount: number) {
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

  private async buildCashDrawerKpi(
    period: ResolvedPeriod,
    openingBudget: number,
    paidOrders: PaidOrderRow[],
    latestSettlement: Awaited<ReturnType<DashboardService['loadLatestSettlement']>>,
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
    if (typeof this.prisma.inventoryImport?.aggregate === 'function') {
      const cashImportAgg = await this.prisma.inventoryImport.aggregate({
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

  private buildTransferKpi(paidOrders: PaidOrderRow[], netPaidAmount: number) {
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

  private buildInventoryKpi(
    inventoryRows: Awaited<ReturnType<DashboardService['loadInventoryRows']>>,
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

  private buildOpenOrdersKpi(tableGrid: PosTableGridResponse, unprintedKitchenItemsCount: number) {
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

  private buildProfitKpi(
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

  private buildRevenueSeries(period: ResolvedPeriod, paidOrders: PaidOrderRow[]) {
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

  private buildPaymentBreakdown(paidOrders: PaidOrderRow[], netPaidAmount: number) {
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

  private buildKitchenStats(
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

  private buildTopProducts(orderItems: PaidOrderItemRow[], blindMode: boolean) {
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

  private async buildDiscountsAndRisk(
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
    const discountMeta = discountIds.length > 0 && typeof this.prisma.discount?.findMany === 'function'
      ? await this.prisma.discount.findMany({
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

  private buildStaffing(
    todayDate: string,
    scheduleWeek: Awaited<ReturnType<DashboardService['loadTodaySchedule']>>,
    payrollMonthSummary: Awaited<ReturnType<NonNullable<DashboardService['payrollService']>['getPayrollSummary']>> | null,
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

  private buildRecentInvoices(orders: PaidOrderRow[]) {
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
}
