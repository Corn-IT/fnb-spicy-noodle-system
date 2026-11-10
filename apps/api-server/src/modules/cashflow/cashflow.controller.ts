import { Body, Controller, Get, Inject, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  CashflowSettlementFilterQuerySchema,
  CreateSettlementRequestSchema,
  UpdateDefaultBudgetSchema,
  type AuthPrincipal,
  type CashflowSettlementFilterQuery,
  type CreateSettlementRequest,
  type UpdateDefaultBudgetInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CashflowService } from './cashflow.service';

@Controller('api/v1/cashflow')
@UseGuards(JwtAuthGuard, RbacGuard)
export class CashflowController {
  constructor(@Inject(CashflowService) private readonly cashflowService: CashflowService) {}

  @Get('preview')
  @RequirePermission('cashflow', 'view')
  preview() {
    return this.cashflowService.preview();
  }

  @Get('settlements')
  @RequirePermission('cashflow', 'view')
  settlements(@Query(new ZodValidationPipe(CashflowSettlementFilterQuerySchema)) query: CashflowSettlementFilterQuery) {
    return this.cashflowService.listSettlements(query);
  }

  @Post('settle')
  @RequirePermission('cashflow', 'create')
  settle(
    @Body(new ZodValidationPipe(CreateSettlementRequestSchema)) body: CreateSettlementRequest,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.cashflowService.settleShift(body, user.id);
  }

  @Put('default-budget')
  @RequirePermission('cashflow', 'config')
  setDefaultBudget(@Body(new ZodValidationPipe(UpdateDefaultBudgetSchema)) body: UpdateDefaultBudgetInput) {
    return this.cashflowService.setDefaultBudget(body);
  }
}
