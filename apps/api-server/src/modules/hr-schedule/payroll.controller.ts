import { Body, Controller, Get, Inject, Param, ParseIntPipe, Put, Query, UseGuards } from '@nestjs/common';
import {
  PayrollQuerySchema,
  UpdateEmployeePayrollSchema,
  UpdatePayrollConfigSchema,
  type AuthPrincipal,
  type PayrollQuery,
  type UpdateEmployeePayrollInput,
  type UpdatePayrollConfigInput,
} from '@fnb/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PayrollService } from './payroll.service';

@Controller('api/v1/payroll')
@UseGuards(JwtAuthGuard, RbacGuard)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly payrollService: PayrollService) {}

  @Get()
  @RequirePermission('payroll', 'view')
  getSummary(@Query(new ZodValidationPipe(PayrollQuerySchema)) query: PayrollQuery) {
    return this.payrollService.getPayrollSummary(query);
  }

  @Put('config')
  @RequirePermission('payroll', 'config')
  updateConfig(
    @Body(new ZodValidationPipe(UpdatePayrollConfigSchema)) body: UpdatePayrollConfigInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.payrollService.updatePayrollConfig(body, user);
  }

  @Put('employees/:employeeId')
  @RequirePermission('payroll', 'update')
  updateEmployeePayroll(
    @Param('employeeId', ParseIntPipe) employeeId: number,
    @Body(new ZodValidationPipe(UpdateEmployeePayrollSchema)) body: UpdateEmployeePayrollInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.payrollService.updateEmployeePayroll(employeeId, body, user);
  }
}
