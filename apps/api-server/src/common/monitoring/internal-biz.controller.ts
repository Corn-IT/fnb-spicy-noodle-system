import { Controller, ForbiddenException, Get, Inject, Query, Req } from '@nestjs/common';
import {
  CashflowSettlementFilterQuerySchema,
  DashboardItemSalesQuerySchema,
  DashboardQuerySchema,
  ErrorCodes,
  PayrollQuerySchema,
  ScheduleWeekQuerySchema,
  defaultUserPermissions,
  type AuthPrincipal,
  type CashflowSettlementFilterQuery,
  type DashboardItemSalesQuery,
  type DashboardOverviewResponse,
  type DashboardQuery,
  type PayrollQuery,
  type ScheduleWeekQuery,
} from '@fnb/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { CashflowService } from '../../modules/cashflow/cashflow.service';
import { DashboardService } from '../../modules/dashboard/dashboard.service';
import { PayrollService } from '../../modules/hr-schedule/payroll.service';
import { SchedulesService } from '../../modules/hr-schedule/schedules.service';
import { isLoopbackSocketAddress } from './telegram-alert.service';

const INTERNAL_BIZ_PRINCIPAL: AuthPrincipal = {
  id: 0,
  employeeId: 0,
  username: 'internal-biz-bot',
  isSuperAdmin: true,
  permissions: defaultUserPermissions,
};

function maskAccountNo(accountNo: string): string {
  const trimmed = accountNo.trim();
  if (trimmed.length <= 4) {
    return '****';
  }
  return `****${trimmed.slice(-4)}`;
}

function assertLoopbackRequest(request: Request): void {
  const remoteAddress = request.socket?.remoteAddress;
  if (!isLoopbackSocketAddress(remoteAddress)) {
    throw new ForbiddenException({
      code: ErrorCodes.RBAC_PERMISSION_DENIED,
      message: 'Endpoint nội bộ chỉ cho phép truy cập từ loopback',
    });
  }
}

export function sanitizeDashboardOverviewForBot(overview: DashboardOverviewResponse): DashboardOverviewResponse {
  return {
    ...overview,
    alerts: {
      ...overview.alerts,
      nearLimitQrAccounts: overview.alerts.nearLimitQrAccounts.map((acc) => ({
        ...acc,
        accountNo: maskAccountNo(acc.accountNo),
      })),
    },
    paymentQrAccounts: overview.paymentQrAccounts.map((acc) => ({
      ...acc,
      accountNo: maskAccountNo(acc.accountNo),
    })),
    liveTables: overview.liveTables
      ? {
          tables: overview.liveTables.tables.map((table) => ({
            id: table.id,
            name: table.name,
            status: table.status,
            activeOrderId: table.activeOrderId,
            activeOrder: table.activeOrder,
          })),
          takeaways: overview.liveTables.takeaways,
        }
      : null,
    recentAuditLogs: overview.recentAuditLogs.map((entry) => ({
      ...entry,
      ipAddress: null,
      deviceLabel: null,
    })),
  };
}

@Controller('internal/biz')
export class InternalBizController {
  constructor(
    @Inject(DashboardService) private readonly dashboardService: DashboardService,
    @Inject(CashflowService) private readonly cashflowService: CashflowService,
    @Inject(PayrollService) private readonly payrollService: PayrollService,
    @Inject(SchedulesService) private readonly schedulesService: SchedulesService,
  ) {}

  @Get('overview')
  async getOverview(
    @Req() request: Request,
    @Query(new ZodValidationPipe(DashboardQuerySchema)) query: DashboardQuery,
  ) {
    assertLoopbackRequest(request);
    const overview = await this.dashboardService.getOverview(query, INTERNAL_BIZ_PRINCIPAL);
    return sanitizeDashboardOverviewForBot(overview);
  }

  @Get('daily-items')
  getDailyItems(
    @Req() request: Request,
    @Query(new ZodValidationPipe(DashboardItemSalesQuerySchema)) query: DashboardItemSalesQuery,
  ) {
    assertLoopbackRequest(request);
    return this.dashboardService.getDailyItemSales(query, INTERNAL_BIZ_PRINCIPAL);
  }

  @Get('payroll')
  getPayroll(
    @Req() request: Request,
    @Query(new ZodValidationPipe(PayrollQuerySchema)) query: PayrollQuery,
  ) {
    assertLoopbackRequest(request);
    return this.payrollService.getPayrollSummary(query);
  }

  @Get('schedule')
  getSchedule(
    @Req() request: Request,
    @Query(new ZodValidationPipe(ScheduleWeekQuerySchema)) query: ScheduleWeekQuery,
  ) {
    assertLoopbackRequest(request);
    return this.schedulesService.getScheduleWeek(query.weekStartDate);
  }

  @Get('cashflow/preview')
  getCashflowPreview(@Req() request: Request) {
    assertLoopbackRequest(request);
    return this.cashflowService.preview(new Date(), true);
  }

  @Get('cashflow/settlements')
  getCashflowSettlements(
    @Req() request: Request,
    @Query(new ZodValidationPipe(CashflowSettlementFilterQuerySchema)) query: CashflowSettlementFilterQuery,
  ) {
    assertLoopbackRequest(request);
    return this.cashflowService.listSettlements(query);
  }
}
