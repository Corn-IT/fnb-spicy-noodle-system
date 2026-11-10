import { Body, Controller, Delete, Get, Inject, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  CreateEmployeeSchema,
  EmployeeFilterQuerySchema,
  SetEmployeeActiveStatusSchema,
  UpdateEmployeeSchema,
  type AuthPrincipal,
  type CreateEmployeeInput,
  type EmployeeFilterQuery,
  type SetEmployeeActiveStatusInput,
  type UpdateEmployeeInput,
} from '@fnb/shared';
import { RequirePermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RbacGuard } from '../../common/guards/rbac.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { EmployeesService } from './employees.service';

@Controller('api/v1/employees')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EmployeesController {
  constructor(@Inject(EmployeesService) private readonly employeesService: EmployeesService) {}

  @Get()
  @RequirePermission('employees', 'view')
  list(@Query(new ZodValidationPipe(EmployeeFilterQuerySchema)) query: EmployeeFilterQuery) {
    return this.employeesService.listEmployees(query);
  }

  @Get(':id')
  @RequirePermission('employees', 'view')
  get(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.getEmployee(id);
  }

  @Post()
  @RequirePermission('employees', 'create')
  create(
    @Body(new ZodValidationPipe(CreateEmployeeSchema)) body: CreateEmployeeInput,
    @CurrentUser() user: AuthPrincipal,
  ) {
    return this.employeesService.createEmployee(body, user);
  }

  @Put(':id')
  @RequirePermission('employees', 'update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(UpdateEmployeeSchema)) body: UpdateEmployeeInput,
  ) {
    return this.employeesService.updateEmployee(id, body);
  }

  @Delete(':id')
  @RequirePermission('employees', 'delete')
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.employeesService.softDeleteEmployee(id);
  }

  @Patch(':id/status')
  @RequirePermission('employees', 'update')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(SetEmployeeActiveStatusSchema)) body: SetEmployeeActiveStatusInput,
  ) {
    return this.employeesService.setEmployeeActiveStatus(id, body.isActive);
  }
}
