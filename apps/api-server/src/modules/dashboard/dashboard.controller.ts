import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  DashboardItemSalesQuerySchema,
  DashboardQuerySchema,
  type AuthPrincipal,
  type DashboardItemSalesQuery,
  type DashboardQuery,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { DashboardService } from './dashboard.service';

@Controller('api/v1/dashboard')
@UseGuards(JwtAuthGuard, RbacGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @RequirePermission('dashboard', 'view')
  getOverview(
    @Query(new ZodValidationPipe(DashboardQuerySchema)) query: DashboardQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.dashboardService.getOverview(query, user);
  }

  @Get('daily-item-sales')
  @RequirePermission('dashboard', 'view')
  getDailyItemSales(
    @Query(new ZodValidationPipe(DashboardItemSalesQuerySchema)) query: DashboardItemSalesQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.dashboardService.getDailyItemSales(query, user);
  }
}
