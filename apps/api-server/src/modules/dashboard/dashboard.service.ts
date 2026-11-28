import { Inject, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  AuditModuleValues,
  DashboardOverviewResponseSchema,
  DashboardQuerySchema,
  type AuditLogItem,
  type AuditModule,
  type AuthPrincipal,
  type DashboardDailyItemSalesResponse,
  type DashboardItemSalesQuery,
  type DashboardOverviewResponse,
  type DashboardQuery,
  type PaymentSource,
} from '@fnb/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  businessDateString,
  dateOnly,
  nextDateOnly,
} from '../../common/utils/business-date.util';
import { CashflowService } from '../cashflow/cashflow.service';
import { PayrollService } from '../hr-schedule/payroll.service';
import { SchedulesService } from '../hr-schedule/schedules.service';
import { PaymentQrService } from '../payment-qr/payment-qr.service';
import { PosService } from '../pos/pos.service';
import {
  buildAlerts,
  buildCashDrawerKpi,
  buildDiscountsAndRisk,
  buildInventoryKpi,
  buildKitchenStats,
  buildOpenOrdersKpi,
  buildPaymentBreakdown,
  buildProfitKpi,
  buildRecentInvoices,
  buildRevenueKpi,
  buildRevenueSeries,
  buildStaffing,
  buildTopProducts,
  buildTransferKpi,
} from './helpers/dashboard-builders.helper';
import {
  AUDIT_PERMISSION_MAP,
  getDailyItemSalesHelper,
  getVietnamMondayAndWeekday,
  loadPaidOrderItems,
  loadPaidOrders,
  resolvePeriod,
  resolveScope,
  type ComboPartRow,
} from './helpers/dashboard-daily-sales.helper';

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
    const period = resolvePeriod(query, now);
    const scope = resolveScope(user);
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
      canSeeSales ? loadPaidOrders(this.prisma, period.startUtc, period.endUtc) : Promise.resolve([]),
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
      ? await loadPaidOrderItems(this.prisma, paidOrders.map((o) => o.id))
      : [];

    const comboIds = [...new Set([
      ...orderItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
      ...openNewItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
      ...cancelledItems.filter((it) => it.product.station === 'COMBO').map((it) => it.productId),
    ])];
    const comboParts = comboIds.length > 0 ? await this.loadComboParts(comboIds) : [];
    const cancelledItemCount = cancelledItems.reduce((sum, it) => sum + it.quantity, 0);

    const alerts = buildAlerts(tableGrid, pendingEditOrders, paymentQrList, now, scope);
    const revenueKpi = canSeePayments ? buildRevenueKpi(paidOrders, prevPaidAggregate) : null;
    const cashDrawerKpi = scope.canCashflow || scope.canViewProfit
      ? await buildCashDrawerKpi(
          this.prisma,
          period,
          openingBudget,
          paidOrders,
          latestSettlement,
          blindMode,
        )
      : null;
    const transferKpi = canSeePayments && !blindMode ? buildTransferKpi(paidOrders, revenueKpi?.netPaidAmount ?? 0) : null;
    const inventorySummary = scope.canInventory || scope.canViewProfit
      ? buildInventoryKpi(inventoryRows, revenueKpi?.netPaidAmount ?? null)
      : null;
    const openOrdersKpi = scope.canPos && tableGrid
      ? buildOpenOrdersKpi(tableGrid, openNewItems.reduce((sum, item) => sum + item.quantity, 0))
      : null;
    const profitKpi = scope.canViewProfit && revenueKpi
      ? buildProfitKpi(
          revenueKpi.netPaidAmount,
          inventorySummary?.totalImportCost ?? 0,
          payrollRangeSummary?.summary.totalSalary ?? null,
        )
      : null;

    const revenueSeries = canSeePayments && !blindMode
      ? buildRevenueSeries(period, paidOrders)
      : null;
    const paymentBreakdown = canSeePayments && !blindMode
      ? buildPaymentBreakdown(paidOrders, revenueKpi?.netPaidAmount ?? 0)
      : [];

    const kitchenStations = canSeeSales
      ? buildKitchenStats(paidOrders, orderItems, openNewItems, comboParts, cancelledItems, blindMode)
      : null;
    const topProducts = canSeeSales
      ? buildTopProducts(orderItems, blindMode)
      : null;
    const discountsAndRisk = canSeeSales && (scope.canDiscounts || scope.canInvoices || scope.canPos || scope.canViewProfit)
      ? await buildDiscountsAndRisk(this.prisma, paidOrders, voidAggregate, cancelledItemCount, period, blindMode)
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

    const staffing = buildStaffing(period.todayDate, scheduleWeek, payrollMonthSummary, period.toDate, scope);
    const recentInvoices = !blindMode && (scope.canInvoices || scope.canViewProfit)
      ? buildRecentInvoices(paidOrders.slice(0, 6))
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
    return getDailyItemSalesHelper(this.prisma, rawQuery, user, now);
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
}
