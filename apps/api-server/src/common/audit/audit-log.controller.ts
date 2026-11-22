import { Controller, ForbiddenException, Get, Inject, Param, Query, UseGuards } from '@nestjs/common';
import {
  AuditLogFilterQuerySchema,
  AuditLogScopedQuerySchema,
  AuditModuleSchema,
  ErrorCodes,
  type AuditLogFilterQuery,
  type AuditLogScopedQuery,
  type AuditModule,
  type AuthPrincipal,
} from '@fnb/shared';
import { CurrentUser } from '../decorators/current-user.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { ZodValidationPipe } from '../pipes/zod-validation.pipe';
import { AuditLogService } from './audit-log.service';

const MODULE_PERMISSION_KEY: Record<AuditModule, keyof AuthPrincipal['permissions']> = {
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

@Controller('api/v1/audit-logs')
@UseGuards(JwtAuthGuard)
export class AuditLogController {
  constructor(@Inject(AuditLogService) private readonly auditLogService: AuditLogService) {}

  @Get(':module')
  listByModule(
    @Param('module', new ZodValidationPipe(AuditModuleSchema)) module: AuditModule,
    @Query(new ZodValidationPipe(AuditLogScopedQuerySchema)) query: AuditLogScopedQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    this.assertModulePermission(module, user);
    return this.auditLogService.list(
      { ...query, module },
      { includeClientInfo: user.isSuperAdmin },
    );
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(AuditLogFilterQuerySchema)) query: AuditLogFilterQuery,
    @CurrentUser() user: AuthPrincipal,
  ) {
    this.assertModulePermission(query.module, user);
    return this.auditLogService.list(query, { includeClientInfo: user.isSuperAdmin });
  }

  private assertModulePermission(module: AuditModule, user: AuthPrincipal): void {
    if (user.isSuperAdmin) return;
    if (module === 'RBAC') {
      throw new ForbiddenException({
        code: ErrorCodes.RBAC_SUPER_ADMIN_REQUIRED,
        message: 'Chỉ tài khoản Super Admin mới được phép xem nhật ký Phân quyền & Tài khoản',
      });
    }
    const permKey = MODULE_PERMISSION_KEY[module];
    if (!user.permissions[permKey]?.view) {
      throw new ForbiddenException('Bạn không có quyền xem lịch sử thao tác của phân hệ này');
    }
  }
}
