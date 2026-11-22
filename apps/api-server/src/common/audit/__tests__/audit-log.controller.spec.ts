import { ForbiddenException } from '@nestjs/common';
import { UserPermissionsSchema, type AuthPrincipal } from '@fnb/shared';
import { describe, expect, it, vi } from 'vitest';
import { AuditLogController } from '../audit-log.controller';

function makePrincipal(overrides?: Partial<AuthPrincipal>): AuthPrincipal {
  const perms = UserPermissionsSchema.parse({
    invoices: { view: true },
  });
  return {
    id: 2,
    username: 'cashier01',
    isSuperAdmin: false,
    permissions: perms,
    ...overrides,
  };
}

describe('AuditLogController (Strict Module Isolation)', () => {
  it('allows reading audit logs of a module when the user holds view permission for that exact module', async () => {
    const auditLogService = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    };
    const controller = new AuditLogController(auditLogService as never);

    await controller.listByModule(
      'INVOICES',
      { page: 1, limit: 20, action: 'Duyệt sửa PTTT' },
      makePrincipal(),
    );

    expect(auditLogService.list).toHaveBeenCalledWith(
      {
        module: 'INVOICES',
        page: 1,
        limit: 20,
        action: 'Duyệt sửa PTTT',
      },
      { includeClientInfo: false },
    );
  });

  it('forbids reading audit logs of another module when user lacks that module permission', () => {
    const auditLogService = { list: vi.fn() };
    const controller = new AuditLogController(auditLogService as never);

    expect(() =>
      controller.listByModule('CASHFLOW', { page: 1, limit: 20 }, makePrincipal()),
    ).toThrow(ForbiddenException);
    expect(auditLogService.list).not.toHaveBeenCalled();
  });

  it('restricts RBAC audit logs to Super Admin even when non-SuperAdmin holds rbac.view', async () => {
    const auditLogService = {
      list: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
    };
    const controller = new AuditLogController(auditLogService as never);

    const nonSuperAdminRbacViewer = makePrincipal({
      permissions: UserPermissionsSchema.parse({ rbac: { view: true } }),
    });

    expect(() =>
      controller.listByModule('RBAC', { page: 1, limit: 20 }, nonSuperAdminRbacViewer),
    ).toThrow(ForbiddenException);
    expect(() =>
      controller.list({ module: 'RBAC', page: 1, limit: 20 }, nonSuperAdminRbacViewer),
    ).toThrow(ForbiddenException);
    expect(auditLogService.list).not.toHaveBeenCalled();

    await controller.listByModule(
      'RBAC',
      { page: 1, limit: 20 },
      makePrincipal({ isSuperAdmin: true }),
    );
    expect(auditLogService.list).toHaveBeenCalledWith(
      { module: 'RBAC', page: 1, limit: 20 },
      { includeClientInfo: true },
    );
  });
});
